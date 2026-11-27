import { sha256Hex } from "./crypto-hash.ts";

export type ClientTelemetry = {
  chromeFp: string;
  pcFp: string;
  banToken?: string;
};

const BAN_LS_KEY = "dtek-ban-marker-v1";
const BPID_LS_KEY = "dtek-bpid-v1";
const IDB_NAME = "dtek-sys-store";
const IDB_STORE = "kv";

function safeGetLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetLocal(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage disabled.
  }
}

function safeRemoveLocal(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage disabled.
  }
}

function readIdb(key: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      resolve(null);
      return;
    }
    try {
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => {
        try {
          const db = req.result;
          const tx = db.transaction(IDB_STORE, "readonly");
          const get = tx.objectStore(IDB_STORE).get(key);
          get.onsuccess = () => resolve(typeof get.result === "string" ? get.result : null);
          get.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function writeIdb(key: string, value: string | null): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      resolve();
      return;
    }
    try {
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => {
        try {
          const db = req.result;
          const tx = db.transaction(IDB_STORE, "readwrite");
          const store = tx.objectStore(IDB_STORE);
          if (value === null) store.delete(key);
          else store.put(value, key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      };
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function canvasSignature(): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 220;
    canvas.height = 40;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "no-2d";
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial', sans-serif";
    ctx.fillStyle = "#e8a317";
    ctx.fillRect(10, 4, 80, 20);
    ctx.fillStyle = "#141210";
    ctx.fillText("ДТЕК-fp⚡2026", 14, 8);
    return sha256Hex(canvas.toDataURL()).slice(0, 24);
  } catch {
    return "canvas-err";
  }
}

function webglInfo(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      (canvas.getContext("webgl") as WebGLRenderingContext | null) ??
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) return "no-webgl";
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const vendor = dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) ?? "") : String(gl.getParameter(gl.VENDOR) ?? "");
    const renderer = dbg
      ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? "")
      : String(gl.getParameter(gl.RENDERER) ?? "");
    return `${vendor}|${renderer}`;
  } catch {
    return "webgl-err";
  }
}

let cachedFingerprints: { chromeFp: string; pcFp: string } | null = null;

export function computeDeviceFingerprints(): { chromeFp: string; pcFp: string } {
  if (typeof window === "undefined") return { chromeFp: "", pcFp: "" };
  if (cachedFingerprints) return cachedFingerprints;

  const nav = window.navigator as Navigator & {
    deviceMemory?: number;
    userAgentData?: { brands?: Array<{ brand: string; version: string }>; mobile?: boolean; platform?: string };
  };

  const uaData = nav.userAgentData
    ? `${(nav.userAgentData.brands ?? []).map((b) => `${b.brand}:${b.version}`).join(",")}|${Boolean(nav.userAgentData.mobile)}|${nav.userAgentData.platform ?? ""}`
    : "";

  const chromeParts = [
    nav.userAgent ?? "",
    nav.vendor ?? "",
    nav.language ?? "",
    (nav.languages ?? []).join(","),
    String(nav.maxTouchPoints ?? 0),
    uaData,
    canvasSignature(),
  ];

  const tz = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    } catch {
      return "";
    }
  })();

  const pcParts = [
    webglInfo(),
    String(nav.hardwareConcurrency ?? 0),
    String(nav.deviceMemory ?? 0),
    `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}x${window.devicePixelRatio ?? 1}`,
    tz,
    nav.platform ?? "",
  ];

  cachedFingerprints = {
    chromeFp: sha256Hex(`dtek-chrome:${chromeParts.join("|")}`).slice(0, 32),
    pcFp: sha256Hex(`dtek-pc:${pcParts.join("|")}`).slice(0, 32),
  };
  return cachedFingerprints;
}

export async function collectTelemetry(): Promise<ClientTelemetry> {
  if (typeof window === "undefined") return { chromeFp: "", pcFp: "" };
  const { chromeFp, pcFp } = computeDeviceFingerprints();

  // Keep a redundant browser-profile marker across localStorage and IndexedDB.
  let bpid = safeGetLocal(BPID_LS_KEY) ?? (await readIdb(BPID_LS_KEY));
  if (!bpid) {
    bpid = sha256Hex(`${chromeFp}:${Date.now()}:${Math.random()}`).slice(0, 24);
  }
  safeSetLocal(BPID_LS_KEY, bpid);
  void writeIdb(BPID_LS_KEY, bpid);

  const banToken = safeGetLocal(BAN_LS_KEY) ?? (await readIdb(BAN_LS_KEY)) ?? undefined;
  if (banToken) {
    safeSetLocal(BAN_LS_KEY, banToken);
    void writeIdb(BAN_LS_KEY, banToken);
  }

  return { chromeFp, pcFp, banToken };
}

export async function persistBanMarker(banMarker: string | null): Promise<void> {
  if (typeof window === "undefined") return;
  if (!banMarker) {
    safeRemoveLocal(BAN_LS_KEY);
    await writeIdb(BAN_LS_KEY, null);
    return;
  }
  safeSetLocal(BAN_LS_KEY, banMarker);
  await writeIdb(BAN_LS_KEY, banMarker);
}
