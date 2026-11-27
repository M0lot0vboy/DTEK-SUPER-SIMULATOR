import { createServerFn } from "@tanstack/react-start";
import { SEASON } from "@/lib/game/season";
import type {
  ActiveBanInfo,
  BanType,
  LeaderRow,
  LegacySeedInput,
  PlayerSnapshot,
  PullServerResult,
  SpinExecutionResult,
  TelemetryContext,
} from "@/lib/anticheat.server";

export type {
  ActiveBanInfo,
  BanType,
  LeaderRow,
  LegacySeedInput,
  PlayerSnapshot,
  PullServerResult,
  SpinExecutionResult,
};

const BAN_COOKIE_NAME = "dtek_ban_marker";

export function cleanName(value: unknown): string {
  let stripped = "";
  for (const ch of String(value ?? "")) {
    const code = ch.codePointAt(0) ?? 0;
    if (
      code <= 0x1f ||
      (code >= 0x7f && code <= 0x9f) ||
      (code >= 0x200b && code <= 0x200f) ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2060 && code <= 0x206f) ||
      code === 0xfeff
    ) {
      continue;
    }
    stripped += ch;
  }
  return stripped.replace(/\s+/g, " ").trim().slice(0, 20);
}

const ID_RE = /^[a-zA-Z0-9-]{8,64}$/;
const SECRET_RE = /^[a-f0-9]{64}$/i;
const FP_RE = /^[a-f0-9]{16,64}$/i;

type BaseAuthPayload = {
  season: number;
  id: string;
  secret: string;
};

type ClientTelemetryInput = {
  chromeFp?: string;
  pcFp?: string;
  banToken?: string;
};

function cleanClientTelemetry(raw: unknown): ClientTelemetryInput | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const chromeFp = typeof r.chromeFp === "string" && FP_RE.test(r.chromeFp) ? r.chromeFp.toLowerCase() : undefined;
  const pcFp = typeof r.pcFp === "string" && FP_RE.test(r.pcFp) ? r.pcFp.toLowerCase() : undefined;
  const banToken =
    typeof r.banToken === "string" && r.banToken.length > 0 && r.banToken.length <= 512 ? r.banToken : undefined;
  if (!chromeFp && !pcFp && !banToken) return undefined;
  return { chromeFp, pcFp, banToken };
}

function parseBaseAuth(data: unknown): BaseAuthPayload {
  const d = (data ?? {}) as Record<string, unknown>;
  if (Number(d.season) !== SEASON) throw new Error("Сезон застарів — онови сторінку");
  const id = String(d.id ?? "");
  if (!ID_RE.test(id)) throw new Error("Недійсний ідентифікатор гравця");
  const secret = String(d.secret ?? "");
  if (!SECRET_RE.test(secret)) throw new Error("Недійсний токен сесії");
  return { season: SEASON, id, secret };
}

function cleanSeq(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

async function buildServerTelemetry(client?: ClientTelemetryInput) {
  const srv = await import("@tanstack/react-start/server");
  const ip =
    srv.getRequestIP({ xForwardedFor: true }) ??
    srv.getRequestHeader("x-real-ip") ??
    srv.getRequestHeader("x-forwarded-for") ??
    null;
  const userAgent = srv.getRequestHeader("user-agent") ?? null;
  const cookieBanToken = srv.getCookie(BAN_COOKIE_NAME) ?? null;
  const telemetry: TelemetryContext = {
    ip,
    userAgent,
    cookieBanToken,
    chromeFp: client?.chromeFp,
    pcFp: client?.pcFp,
    banToken: client?.banToken,
  };
  return { srv, telemetry };
}

function isSecureCookie(srv: Awaited<typeof import("@tanstack/react-start/server")>): boolean {
  const proto = srv.getRequestHeader("x-forwarded-proto");
  if (proto) return proto.split(",")[0]!.trim().toLowerCase() === "https";
  return process.env.NODE_ENV === "production";
}

async function runWithBanCookie<T>(
  fn: (
    sql: Awaited<ReturnType<typeof import("@/lib/db")["getSql"]>>,
    anticheat: typeof import("@/lib/anticheat.server"),
    telemetry: TelemetryContext,
  ) => Promise<T>,
  clientTelemetry?: ClientTelemetryInput,
): Promise<T> {
  const [{ getSql }, anticheat, { srv, telemetry }] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/anticheat.server"),
    buildServerTelemetry(clientTelemetry),
  ]);
  const sql = await getSql();
  try {
    return await fn(sql, anticheat, telemetry);
  } catch (err) {
    const banInfo = anticheat.parseBanError(err);
    if (banInfo?.marker) {
      srv.setCookie(BAN_COOKIE_NAME, banInfo.marker, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        secure: isSecureCookie(srv),
      });
    }
    throw err;
  }
}

export const getSeason = createServerFn({ method: "GET" }).handler(async () => SEASON);

export const checkAccess = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const playerId = typeof d.id === "string" && ID_RE.test(d.id) ? d.id : undefined;
    return {
      playerId,
      telemetry: cleanClientTelemetry(d.telemetry),
    };
  })
  .handler(async ({ data }): Promise<ActiveBanInfo> => {
    const [{ getSql }, anticheat, { srv, telemetry }] = await Promise.all([
      import("@/lib/db"),
      import("@/lib/anticheat.server"),
      buildServerTelemetry(data.telemetry),
    ]);
    const sql = await getSql();
    const info = await anticheat.checkPlayerBan(sql, {
      ...telemetry,
      playerId: data.playerId,
    });
    if (info.banned && info.marker) {
      srv.setCookie(BAN_COOKIE_NAME, info.marker, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        secure: isSecureCookie(srv),
      });
    } else if (!info.banned && telemetry.cookieBanToken) {
      srv.setCookie(BAN_COOKIE_NAME, "", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
        secure: isSecureCookie(srv),
      });
    }
    return info;
  });

export const getLeaderboard = createServerFn({ method: "GET" }).handler(async (): Promise<LeaderRow[]> => {
  const [{ getSql }, { fetchLeaderboard }] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/anticheat.server"),
  ]);
  const sql = await getSql();
  return fetchLeaderboard(sql);
});

export const initSession = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const auth = parseBaseAuth(data);
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      ...auth,
      name: typeof d.name === "string" ? cleanName(d.name) : undefined,
      legacy: (d.legacy && typeof d.legacy === "object" ? d.legacy : undefined) as LegacySeedInput | undefined,
      telemetry: cleanClientTelemetry(d.telemetry),
    };
  })
  .handler(async ({ data }): Promise<PlayerSnapshot> => {
    return runWithBanCookie(
      (sql, anticheat, telemetry) => anticheat.initPlayerSession(sql, { ...data, telemetry }),
      data.telemetry,
    );
  });

export const setPlayerName = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const auth = parseBaseAuth(data);
    const d = (data ?? {}) as Record<string, unknown>;
    const name = cleanName(d.name);
    if (name.length < 2) throw new Error("Нікнейм має бути від 2 символів");
    return { ...auth, name, telemetry: cleanClientTelemetry(d.telemetry) };
  })
  .handler(async ({ data }): Promise<PlayerSnapshot> => {
    return runWithBanCookie(
      (sql, anticheat, telemetry) => anticheat.updatePlayerName(sql, { ...data, telemetry }),
      data.telemetry,
    );
  });

export const spinWheel = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const auth = parseBaseAuth(data);
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      ...auth,
      seq: cleanSeq(d.seq),
      name: typeof d.name === "string" ? cleanName(d.name) : undefined,
      telemetry: cleanClientTelemetry(d.telemetry),
    };
  })
  .handler(async ({ data }): Promise<SpinExecutionResult> => {
    return runWithBanCookie(
      (sql, anticheat, telemetry) => anticheat.executeServerSpin(sql, { ...data, telemetry }),
      data.telemetry,
    );
  });

export const clearBlackoutServer = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const auth = parseBaseAuth(data);
    const d = (data ?? {}) as Record<string, unknown>;
    return { ...auth, seq: cleanSeq(d.seq), telemetry: cleanClientTelemetry(d.telemetry) };
  })
  .handler(async ({ data }): Promise<PlayerSnapshot> => {
    return runWithBanCookie(
      (sql, anticheat, telemetry) => anticheat.executeClearBlackout(sql, { ...data, telemetry }),
      data.telemetry,
    );
  });

export const pullBanner = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const auth = parseBaseAuth(data);
    const d = (data ?? {}) as Record<string, unknown>;
    const count = Number(d.count);
    if (count !== 1 && count !== 10) throw new Error("Можна молитися лише ×1 або ×10");
    return {
      ...auth,
      seq: cleanSeq(d.seq),
      count,
      name: typeof d.name === "string" ? cleanName(d.name) : undefined,
      telemetry: cleanClientTelemetry(d.telemetry),
    };
  })
  .handler(async ({ data }): Promise<PullServerResult> => {
    return runWithBanCookie(
      (sql, anticheat, telemetry) => anticheat.executeServerPull(sql, { ...data, telemetry }),
      data.telemetry,
    );
  });

export const claimAidServer = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const auth = parseBaseAuth(data);
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      ...auth,
      seq: cleanSeq(d.seq),
      name: typeof d.name === "string" ? cleanName(d.name) : undefined,
      telemetry: cleanClientTelemetry(d.telemetry),
    };
  })
  .handler(async ({ data }): Promise<PlayerSnapshot> => {
    return runWithBanCookie(
      (sql, anticheat, telemetry) => anticheat.executeServerAid(sql, { ...data, telemetry }),
      data.telemetry,
    );
  });

export const exchangeShardsServer = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const auth = parseBaseAuth(data);
    const d = (data ?? {}) as Record<string, unknown>;
    return { ...auth, seq: cleanSeq(d.seq), telemetry: cleanClientTelemetry(d.telemetry) };
  })
  .handler(async ({ data }): Promise<PlayerSnapshot> => {
    return runWithBanCookie(
      (sql, anticheat, telemetry) => anticheat.executeServerExchange(sql, { ...data, telemetry }),
      data.telemetry,
    );
  });

export const toggleEquipServer = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const auth = parseBaseAuth(data);
    const d = (data ?? {}) as Record<string, unknown>;
    const unitId = String(d.unitId ?? "");
    if (!unitId || unitId.length > 40) throw new Error("Невідомий юніт");
    return { ...auth, seq: cleanSeq(d.seq), unitId, telemetry: cleanClientTelemetry(d.telemetry) };
  })
  .handler(async ({ data }): Promise<{ status: "equipped" | "removed" | "full" | "locked"; state: PlayerSnapshot }> => {
    return runWithBanCookie(
      (sql, anticheat, telemetry) => anticheat.executeServerEquip(sql, { ...data, telemetry }),
      data.telemetry,
    );
  });

export const sacrificeRookServer = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const auth = parseBaseAuth(data);
    const d = (data ?? {}) as Record<string, unknown>;
    return { ...auth, seq: cleanSeq(d.seq), telemetry: cleanClientTelemetry(d.telemetry) };
  })
  .handler(async ({ data }): Promise<PlayerSnapshot> => {
    return runWithBanCookie(
      (sql, anticheat, telemetry) => anticheat.executeServerRook(sql, { ...data, telemetry }),
      data.telemetry,
    );
  });
