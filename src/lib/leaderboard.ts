import { createServerFn } from "@tanstack/react-start";
import { SEASON } from "@/lib/game/season";
import type {
  LeaderRow,
  LegacySeedInput,
  PlayerSnapshot,
  PullServerResult,
  SpinExecutionResult,
} from "@/lib/anticheat.server";

export type { LeaderRow, LegacySeedInput, PlayerSnapshot, PullServerResult, SpinExecutionResult };

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

type BaseAuthPayload = {
  season: number;
  id: string;
  secret: string;
};

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

export const getSeason = createServerFn({ method: "GET" }).handler(async () => SEASON);

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
    };
  })
  .handler(async ({ data }): Promise<PlayerSnapshot> => {
    const [{ getSql }, { initPlayerSession }] = await Promise.all([
      import("@/lib/db"),
      import("@/lib/anticheat.server"),
    ]);
    const sql = await getSql();
    return initPlayerSession(sql, data);
  });

export const setPlayerName = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const auth = parseBaseAuth(data);
    const d = (data ?? {}) as Record<string, unknown>;
    const name = cleanName(d.name);
    if (name.length < 2) throw new Error("Нікнейм має бути від 2 символів");
    return { ...auth, name };
  })
  .handler(async ({ data }): Promise<PlayerSnapshot> => {
    const [{ getSql }, { updatePlayerName }] = await Promise.all([
      import("@/lib/db"),
      import("@/lib/anticheat.server"),
    ]);
    const sql = await getSql();
    return updatePlayerName(sql, data);
  });

export const spinWheel = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const auth = parseBaseAuth(data);
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      ...auth,
      seq: cleanSeq(d.seq),
      name: typeof d.name === "string" ? cleanName(d.name) : undefined,
    };
  })
  .handler(async ({ data }): Promise<SpinExecutionResult> => {
    const [{ getSql }, { executeServerSpin }] = await Promise.all([
      import("@/lib/db"),
      import("@/lib/anticheat.server"),
    ]);
    const sql = await getSql();
    return executeServerSpin(sql, data);
  });

export const clearBlackoutServer = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const auth = parseBaseAuth(data);
    const d = (data ?? {}) as Record<string, unknown>;
    return { ...auth, seq: cleanSeq(d.seq) };
  })
  .handler(async ({ data }): Promise<PlayerSnapshot> => {
    const [{ getSql }, { executeClearBlackout }] = await Promise.all([
      import("@/lib/db"),
      import("@/lib/anticheat.server"),
    ]);
    const sql = await getSql();
    return executeClearBlackout(sql, data);
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
    };
  })
  .handler(async ({ data }): Promise<PullServerResult> => {
    const [{ getSql }, { executeServerPull }] = await Promise.all([
      import("@/lib/db"),
      import("@/lib/anticheat.server"),
    ]);
    const sql = await getSql();
    return executeServerPull(sql, data);
  });

export const claimAidServer = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const auth = parseBaseAuth(data);
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      ...auth,
      seq: cleanSeq(d.seq),
      name: typeof d.name === "string" ? cleanName(d.name) : undefined,
    };
  })
  .handler(async ({ data }): Promise<PlayerSnapshot> => {
    const [{ getSql }, { executeServerAid }] = await Promise.all([
      import("@/lib/db"),
      import("@/lib/anticheat.server"),
    ]);
    const sql = await getSql();
    return executeServerAid(sql, data);
  });

export const exchangeShardsServer = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const auth = parseBaseAuth(data);
    const d = (data ?? {}) as Record<string, unknown>;
    return { ...auth, seq: cleanSeq(d.seq) };
  })
  .handler(async ({ data }): Promise<PlayerSnapshot> => {
    const [{ getSql }, { executeServerExchange }] = await Promise.all([
      import("@/lib/db"),
      import("@/lib/anticheat.server"),
    ]);
    const sql = await getSql();
    return executeServerExchange(sql, data);
  });

export const toggleEquipServer = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const auth = parseBaseAuth(data);
    const d = (data ?? {}) as Record<string, unknown>;
    const unitId = String(d.unitId ?? "");
    if (!unitId || unitId.length > 40) throw new Error("Невідомий юніт");
    return { ...auth, seq: cleanSeq(d.seq), unitId };
  })
  .handler(async ({ data }): Promise<{ status: "equipped" | "removed" | "full" | "locked"; state: PlayerSnapshot }> => {
    const [{ getSql }, { executeServerEquip }] = await Promise.all([
      import("@/lib/db"),
      import("@/lib/anticheat.server"),
    ]);
    const sql = await getSql();
    return executeServerEquip(sql, data);
  });

export const sacrificeRookServer = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const auth = parseBaseAuth(data);
    const d = (data ?? {}) as Record<string, unknown>;
    return { ...auth, seq: cleanSeq(d.seq) };
  })
  .handler(async ({ data }): Promise<PlayerSnapshot> => {
    const [{ getSql }, { executeServerRook }] = await Promise.all([
      import("@/lib/db"),
      import("@/lib/anticheat.server"),
    ]);
    const sql = await getSql();
    return executeServerRook(sql, data);
  });
