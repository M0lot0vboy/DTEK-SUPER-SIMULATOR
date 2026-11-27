import { ensureSeasonReset, SEASON } from "@/lib/game/season";
import { useEffect } from "react";
import useSWR, { mutate } from "swr";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useGame } from "@/lib/game/store";
import { useGacha } from "@/lib/gacha/engine";
import {
  claimAidServer,
  clearBlackoutServer,
  exchangeShardsServer,
  getSeason,
  initSession,
  pullBanner,
  sacrificeRookServer,
  setPlayerName,
  spinWheel,
  toggleEquipServer,
  type LegacySeedInput,
  type PlayerSnapshot,
  type PullServerResult,
  type SpinExecutionResult,
} from "@/lib/leaderboard";
import { publicPlayerId } from "@/lib/crypto-hash";

const SECRET_RE = /^[a-f0-9]{64}$/i;

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function newSecret(): string {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

// When the server moves to a newer season, reload so the new bundle wipes local progress.
export function useSeasonGuard(): void {
  ensureSeasonReset();
  const { data } = useSWR("season", () => getSeason(), { refreshInterval: 30_000 });
  useEffect(() => {
    try {
      if (window.localStorage.getItem("dtek-reset-reload") === "1") {
        window.localStorage.removeItem("dtek-reset-reload");
        window.location.reload();
        return;
      }
    } catch {
      // Storage may be unavailable in private browsing modes.
    }
    if (typeof data === "number" && data > SEASON) window.location.reload();
  }, [data]);
}

type PlayerStore = {
  id: string;
  secret: string;
  name: string;
  registered: boolean;
  setName: (name: string) => void;
};

export const usePlayer = create<PlayerStore>()(
  persist(
    (set) => ({
      id: newId(),
      secret: newSecret(),
      name: "",
      registered: false,
      setName: (name) => set({ name }),
    }),
    {
      name: "dtek-player-v1",
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PlayerStore>;
        return {
          ...current,
          ...p,
          id: typeof p.id === "string" && p.id.length >= 8 ? p.id : current.id,
          secret: typeof p.secret === "string" && SECRET_RE.test(p.secret) ? p.secret : current.secret,
          name: typeof p.name === "string" ? p.name : current.name,
          registered: Boolean(p.registered),
        };
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!SECRET_RE.test(state.secret)) {
          usePlayer.setState({ secret: newSecret() });
        }
      },
    },
  ),
);

export const LEADERBOARD_KEY = "leaderboard";

export function getPublicPlayerId(id: string): string {
  return publicPlayerId(id);
}

function getCredentials(): { season: number; id: string; secret: string; name: string } {
  const st = usePlayer.getState();
  let secret = st.secret;
  if (!SECRET_RE.test(secret)) {
    secret = newSecret();
    usePlayer.setState({ secret });
  }
  return { season: SEASON, id: st.id, secret, name: st.name };
}

function collectLegacySeed(): LegacySeedInput {
  const game = useGame.getState();
  const gacha = useGacha.getState();
  return {
    xp: game.xp,
    gems: gacha.gems,
    shards: gacha.shards,
    tickets: gacha.tickets,
    pity5: gacha.pity5,
    pity4: gacha.pity4,
    guaranteed: gacha.guaranteed,
    copies: gacha.copies,
    loadout: gacha.loadout,
    best5: gacha.best5,
    best5Pity: gacha.best5Pity,
    lost5050Count: gacha.lost5050Count,
  };
}

export function applyServerSnapshot(
  snap: PlayerSnapshot,
  options?: { seqOnly?: boolean; onlyIfNotBehind?: boolean },
): void {
  usePlayer.setState((prev) => ({
    registered: true,
    name: snap.name.length >= 2 ? snap.name : prev.name,
  }));
  if (options?.seqOnly) {
    useGacha.setState((s) => (snap.seq > s.seq ? { seq: snap.seq } : s));
    return;
  }
  if (options?.onlyIfNotBehind && snap.seq < useGacha.getState().seq) {
    return;
  }
  useGacha.getState().applyServerGacha(snap);
  useGame.getState().applyServerGame({ spins: snap.spins, xp: snap.xp });
}

let sessionSynced = false;
let inflightSession: Promise<PlayerSnapshot | null> | null = null;

export async function ensureSessionSynced(force = false): Promise<PlayerSnapshot | null> {
  if (typeof window === "undefined") return null;
  if (sessionSynced && !force) return null;
  if (inflightSession && !force) return inflightSession;

  const p = usePlayer.getState();
  const g = useGame.getState();
  const ga = useGacha.getState();
  const hasExistingActivity = p.registered || p.name.length >= 2 || g.spins > 0 || ga.totalPulls > 0;
  if (!hasExistingActivity && !force) return null;

  const run = (async () => {
    const creds = getCredentials();
    const snap = await initSession({
      data: {
        season: creds.season,
        id: creds.id,
        secret: creds.secret,
        name: creds.name || undefined,
        legacy: collectLegacySeed(),
      },
    });
    sessionSynced = true;
    applyServerSnapshot(snap);
    return snap;
  })().finally(() => {
    inflightSession = null;
  });

  inflightSession = run;
  return run;
}

export function useSessionSync(ready: boolean, onHydrated?: (snap: PlayerSnapshot) => void): void {
  useEffect(() => {
    if (!ready) return;
    let active = true;
    ensureSessionSynced()
      .then((snap) => {
        if (active && snap && onHydrated) onHydrated(snap);
      })
      .catch(() => {
        // Offline or unreachable DB — action handlers will surface errors on user interaction.
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
}

function isConflictError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return msg.includes("CONFLICT");
}

async function runWithRetry<T>(action: (creds: ReturnType<typeof getCredentials>, seq: number) => Promise<T>): Promise<T> {
  await ensureSessionSynced().catch(() => null);
  try {
    return await action(getCredentials(), useGacha.getState().seq);
  } catch (err) {
    if (!isConflictError(err)) throw err;
    await ensureSessionSynced(true);
    return await action(getCredentials(), useGacha.getState().seq);
  }
}

export async function performSpin(): Promise<SpinExecutionResult> {
  const res = await runWithRetry((creds, seq) =>
    spinWheel({
      data: {
        season: creds.season,
        id: creds.id,
        secret: creds.secret,
        seq,
        name: creds.name || undefined,
      },
    }),
  );
  sessionSynced = true;
  // Advance seq immediately so concurrent actions (e.g. pulling during animation) stay in sync;
  // full stats are applied once the wheel finishes animating.
  applyServerSnapshot(res.state, { seqOnly: true });
  return res;
}

export async function performClearBlackout(): Promise<PlayerSnapshot> {
  const snap = await runWithRetry((creds, seq) =>
    clearBlackoutServer({
      data: { season: creds.season, id: creds.id, secret: creds.secret, seq },
    }),
  );
  sessionSynced = true;
  applyServerSnapshot(snap);
  return snap;
}

export async function performPull(count: 1 | 10): Promise<PullServerResult> {
  const res = await runWithRetry((creds, seq) =>
    pullBanner({
      data: {
        season: creds.season,
        id: creds.id,
        secret: creds.secret,
        seq,
        count,
        name: creds.name || undefined,
      },
    }),
  );
  sessionSynced = true;
  useGacha.getState().applyServerGacha(res.state);
  useGacha.getState().setLastBatch(res.results);
  usePlayer.setState((prev) => ({
    registered: true,
    name: res.state.name.length >= 2 ? res.state.name : prev.name,
  }));
  void mutate(LEADERBOARD_KEY);
  return res;
}

export async function performClaimAid(): Promise<PlayerSnapshot> {
  const snap = await runWithRetry((creds, seq) =>
    claimAidServer({
      data: {
        season: creds.season,
        id: creds.id,
        secret: creds.secret,
        seq,
        name: creds.name || undefined,
      },
    }),
  );
  sessionSynced = true;
  applyServerSnapshot(snap);
  return snap;
}

export async function performExchangeShards(): Promise<PlayerSnapshot> {
  const snap = await runWithRetry((creds, seq) =>
    exchangeShardsServer({
      data: { season: creds.season, id: creds.id, secret: creds.secret, seq },
    }),
  );
  sessionSynced = true;
  applyServerSnapshot(snap);
  return snap;
}

export async function performToggleEquip(
  unitId: string,
): Promise<{ status: "equipped" | "removed" | "full" | "locked"; state: PlayerSnapshot }> {
  const res = await runWithRetry((creds, seq) =>
    toggleEquipServer({
      data: { season: creds.season, id: creds.id, secret: creds.secret, seq, unitId },
    }),
  );
  sessionSynced = true;
  applyServerSnapshot(res.state);
  return res;
}

export async function performSacrificeRook(): Promise<PlayerSnapshot> {
  const snap = await runWithRetry((creds, seq) =>
    sacrificeRookServer({
      data: { season: creds.season, id: creds.id, secret: creds.secret, seq },
    }),
  );
  sessionSynced = true;
  applyServerSnapshot(snap);
  return snap;
}

export async function performSetName(name: string): Promise<PlayerSnapshot> {
  await ensureSessionSynced().catch(() => null);
  const creds = getCredentials();
  const snap = await setPlayerName({
    data: { season: creds.season, id: creds.id, secret: creds.secret, name },
  });
  sessionSynced = true;
  applyServerSnapshot(snap);
  usePlayer.setState({ name: snap.name, registered: true });
  void mutate(LEADERBOARD_KEY);
  return snap;
}
