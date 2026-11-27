import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import type { Sql } from "./db.ts";
import { publicPlayerId } from "./crypto-hash.ts";
import {
  BLACKOUT_MIN_MS,
  GOLDEN_SLICE_INDICES,
  SPIN_COOLDOWN_NORMAL_MS,
  SPIN_COOLDOWN_TURBO_MS,
  SPIN_EVENTS,
  SPIN_EVENT_CHANCE,
  SPIN_EVENT_KINDS,
  WHEEL_SLICES,
  XP_PER_OUTCOME,
  levelFromXp,
  xpForLevel,
  type ActiveSpinEvent,
  type Outcome,
  type SpinEventKind,
} from "./game/data.ts";
import { SEASON } from "./game/season.ts";
import {
  AID_AMOUNT,
  AID_COOLDOWN_MS,
  GEMS_PER_OUTCOME,
  HARD_PITY,
  MAX_LOADOUT,
  PITY_4,
  PULL_COST,
  ROOK_BOOST_SPINS,
  ROOK_COOLDOWN_MS,
  SHARDS_PER_TICKET,
  computeBuffs,
  countFives,
  executeGachaPulls,
  sanitizeCopies,
  sanitizeLoadout,
  sumCopies,
  type PullOutcome,
} from "./gacha/rules.ts";
import { UNIT_BY_ID } from "./gacha/pool.ts";

export const ID_RE = /^[a-zA-Z0-9-]{8,64}$/;
export const SECRET_RE = /^[a-f0-9]{64}$/i;

export type LeaderRow = {
  publicId: string;
  name: string;
  spins: number;
  level: number;
  fives: number;
  pulls: number;
  verified: boolean;
  updatedAt: string;
};

export type PlayerSnapshot = {
  season: number;
  name: string;
  spins: number;
  xp: number;
  level: number;
  fives: number;
  pulls: number;
  gems: number;
  shards: number;
  tickets: number;
  pity5: number;
  pity4: number;
  guaranteed: boolean;
  copies: Record<string, number>;
  loadout: string[];
  best5: string | null;
  best5Pity: number;
  lost5050Count: number;
  boostSpins: number;
  spinEvent: ActiveSpinEvent | null;
  inBlackout: boolean;
  aidAt: number;
  rookReadyAt: number;
  seq: number;
};

export type LegacySeedInput = {
  xp?: unknown;
  gems?: unknown;
  shards?: unknown;
  tickets?: unknown;
  pity5?: unknown;
  pity4?: unknown;
  guaranteed?: unknown;
  copies?: unknown;
  loadout?: unknown;
  best5?: unknown;
  best5Pity?: unknown;
  lost5050Count?: unknown;
};

export type SpinExecutionResult = {
  sliceIndex: number;
  outcome: Outcome;
  turbo: boolean;
  xpGain: number;
  gemsGained: number;
  refunded: boolean;
  queueProc: boolean;
  activeEventBefore: ActiveSpinEvent | null;
  nextSpinEvent: ActiveSpinEvent | null;
  state: PlayerSnapshot;
};

export type PullServerResult = {
  results: PullOutcome[];
  state: PlayerSnapshot;
};

type DbPlayerRow = {
  id: string;
  name: string;
  spins: number;
  level: number;
  fives: number;
  pulls: number;
  season: number;
  token_hash: string | null;
  xp: number;
  gems: number;
  shards: number;
  tickets: number;
  pity5: number;
  pity4: number;
  guaranteed: boolean;
  copies: unknown;
  loadout: unknown;
  best5: string | null;
  best5_pity: number;
  lost_5050_count: number;
  boost_spins: number;
  spin_event_kind: string | null;
  spin_event_left: number;
  in_blackout: boolean;
  last_spin_at: Date | string | null;
  last_aid_at: Date | string | null;
  rook_ready_at: Date | string | null;
  seq: number;
  flags: number;
  updated_at: Date | string;
};

export function cleanPlayerName(value: unknown): string {
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

export function hashSecret(secret: string): string {
  return createHash("sha256").update(`dtek-secret:${secret.toLowerCase()}`).digest("hex");
}

function constantTimeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

function cryptoRandomFloat(): number {
  return randomInt(0, 1_000_000_000) / 1_000_000_000;
}

function clampInt(value: unknown, min: number, max: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function parseJsonField(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

function toMs(v: Date | string | null | undefined): number {
  if (!v) return 0;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function parseSpinEvent(kind: string | null, left: number): ActiveSpinEvent | null {
  if (!kind || left <= 0) return null;
  if (!(SPIN_EVENT_KINDS as string[]).includes(kind)) return null;
  return { kind: kind as SpinEventKind, left: Math.floor(left) };
}

export function snapshotFromRow(row: DbPlayerRow): PlayerSnapshot {
  const copies = sanitizeCopies(parseJsonField(row.copies));
  const loadout = sanitizeLoadout(parseJsonField(row.loadout), copies);
  const lastAidMs = toMs(row.last_aid_at);
  return {
    season: Number(row.season),
    name: String(row.name ?? ""),
    spins: Math.max(0, Number(row.spins)),
    xp: Math.max(0, Number(row.xp)),
    level: Math.min(10, Math.max(1, Number(row.level))),
    fives: Math.max(0, Number(row.fives)),
    pulls: Math.max(0, Number(row.pulls)),
    gems: Math.max(0, Number(row.gems)),
    shards: Math.max(0, Number(row.shards)),
    tickets: Math.max(0, Number(row.tickets)),
    pity5: clampInt(row.pity5, 0, HARD_PITY),
    pity4: clampInt(row.pity4, 0, PITY_4),
    guaranteed: Boolean(row.guaranteed),
    copies,
    loadout,
    best5: row.best5 && UNIT_BY_ID[row.best5] ? row.best5 : null,
    best5Pity: Math.max(0, Number(row.best5_pity ?? 0)),
    lost5050Count: Math.max(0, Number(row.lost_5050_count ?? 0)),
    boostSpins: Math.max(0, Number(row.boost_spins ?? 0)),
    spinEvent: parseSpinEvent(row.spin_event_kind, Number(row.spin_event_left ?? 0)),
    inBlackout: Boolean(row.in_blackout),
    aidAt: lastAidMs > 0 ? lastAidMs + AID_COOLDOWN_MS : 0,
    rookReadyAt: toMs(row.rook_ready_at),
    seq: Math.max(0, Number(row.seq ?? 0)),
  };
}

export function assertValidCredentials(data: { id?: unknown; secret?: unknown; season?: unknown }) {
  if (data.season !== undefined && Number(data.season) !== SEASON) {
    throw new Error("Сезон застарів — онови сторінку");
  }
  const id = String(data.id ?? "");
  if (!ID_RE.test(id)) throw new Error("Недійсний ідентифікатор гравця");
  const secret = String(data.secret ?? "");
  if (!SECRET_RE.test(secret)) throw new Error("Недійсний токен сесії");
  return { id, secret: secret.toLowerCase(), tokenHash: hashSecret(secret) };
}

async function logViolation(
  sql: Sql,
  playerId: string | null,
  reason: string,
  detail: Record<string, unknown> = {},
  incrementFlag = false,
): Promise<void> {
  try {
    await sql`
      insert into anticheat_log (player_id, reason, detail)
      values (${playerId}, ${reason}, ${JSON.stringify(detail)}::jsonb)
    `;
    if (incrementFlag && playerId) {
      await sql`
        update leaderboard_players
        set flags = flags + 1
        where id = ${playerId} and season = ${SEASON}
      `;
    }
  } catch {
    // Audit logging must never mask the actual validation error.
  }
}

async function selectPlayer(sql: Sql, id: string): Promise<DbPlayerRow | null> {
  const rows = await sql<DbPlayerRow>`
    select *
    from leaderboard_players
    where id = ${id}
    limit 1
  `;
  return rows[0] ?? null;
}

async function ensureNewPlayerRow(
  sql: Sql,
  id: string,
  tokenHash: string,
  rawName?: unknown,
): Promise<DbPlayerRow> {
  const cleaned = cleanPlayerName(rawName);
  const safeName = cleaned.length >= 2 ? cleaned : "";
  await sql`
    insert into leaderboard_players (id, name, season, token_hash, gems)
    values (${id}, ${safeName}, ${SEASON}, ${tokenHash}, ${PULL_COST * 10})
    on conflict (id) do update set
      name = excluded.name,
      spins = 0,
      xp = 0,
      level = 1,
      fives = 0,
      pulls = 0,
      gems = ${PULL_COST * 10},
      shards = 0,
      tickets = 0,
      pity5 = 0,
      pity4 = 0,
      guaranteed = false,
      copies = '{}'::jsonb,
      loadout = '[]'::jsonb,
      best5 = null,
      best5_pity = 0,
      lost_5050_count = 0,
      boost_spins = 0,
      spin_event_kind = null,
      spin_event_left = 0,
      in_blackout = false,
      last_spin_at = null,
      last_aid_at = null,
      rook_ready_at = null,
      season = ${SEASON},
      token_hash = excluded.token_hash,
      seq = 0,
      flags = 0,
      updated_at = now()
    where leaderboard_players.season < ${SEASON}
  `;
  const row = await selectPlayer(sql, id);
  if (!row) throw new Error("Не вдалося ініціалізувати профіль");
  return row;
}

async function claimLegacyRow(
  sql: Sql,
  row: DbPlayerRow,
  tokenHash: string,
  legacy?: LegacySeedInput,
): Promise<DbPlayerRow> {
  const spins = Math.max(0, Number(row.spins));
  const pulls = Math.max(0, Number(row.pulls));
  const fives = Math.min(pulls, Math.max(0, Number(row.fives)));
  const maxPossibleLevel = levelFromXp(spins * 40);
  const level = Math.min(10, Math.max(1, Math.min(Number(row.level), maxPossibleLevel)));

  const minXpForLevel = xpForLevel(level);
  const maxXpCap = Math.max(minXpForLevel, spins * 40);
  const upperXpForLevel = level >= 10 ? maxXpCap : Math.min(xpForLevel(level + 1) - 1, maxXpCap);
  const rawLegacyXp = Math.floor(Number(legacy?.xp));
  const xp =
    Number.isFinite(rawLegacyXp) && rawLegacyXp >= minXpForLevel && rawLegacyXp <= upperXpForLevel
      ? rawLegacyXp
      : minXpForLevel;

  let copies = sanitizeCopies(legacy?.copies);
  const claimedFives = countFives(copies);
  const claimedTotal = sumCopies(copies);
  if (claimedFives > fives + 5 || claimedTotal > pulls + 20) {
    await logViolation(
      sql,
      row.id,
      "legacy_copies_tampered",
      { claimedFives, dbFives: fives, claimedCopies: claimedTotal, dbPulls: pulls },
      true,
    );
    copies = {};
  } else if (claimedFives > fives || claimedTotal > pulls) {
    // Reconcile minor unsynced local pulls by trimming excess copies while keeping owned units.
    let excessFives = Math.max(0, claimedFives - fives);
    for (const id of Object.keys(copies)) {
      if (excessFives <= 0) break;
      if (UNIT_BY_ID[id]?.rarity !== 5) continue;
      const drop = Math.min(copies[id]!, excessFives);
      copies[id]! -= drop;
      excessFives -= drop;
      if (copies[id]! <= 0) delete copies[id];
    }
    let excessTotal = Math.max(0, sumCopies(copies) - pulls);
    for (const rarity of [3, 4, 5] as const) {
      for (const id of Object.keys(copies)) {
        if (excessTotal <= 0) break;
        if (UNIT_BY_ID[id]?.rarity !== rarity) continue;
        const drop = Math.min(copies[id]!, excessTotal);
        copies[id]! -= drop;
        excessTotal -= drop;
        if (copies[id]! <= 0) delete copies[id];
      }
    }
  }
  const loadout = sanitizeLoadout(legacy?.loadout, copies);
  const gemsCap = Math.min(100_000, PULL_COST * 10 + spins * 350 + 15_000);
  const gems = clampInt(legacy?.gems, 0, gemsCap);
  const shards = clampInt(legacy?.shards, 0, Math.min(20_000, pulls * 20));
  const tickets = clampInt(legacy?.tickets, 0, Math.min(200, Math.floor((pulls * 20) / SHARDS_PER_TICKET) + 10));
  const pity5 = clampInt(legacy?.pity5, 0, HARD_PITY - 1);
  const pity4 = clampInt(legacy?.pity4, 0, PITY_4 - 1);
  const guaranteed = Boolean(legacy?.guaranteed);
  const rawBest5 = typeof legacy?.best5 === "string" ? legacy.best5 : null;
  const best5 = rawBest5 && UNIT_BY_ID[rawBest5]?.rarity === 5 && (copies[rawBest5] ?? 0) > 0 ? rawBest5 : null;
  const best5Pity = best5 ? clampInt(legacy?.best5Pity, 1, HARD_PITY) : 0;
  const lost5050Count = clampInt(legacy?.lost5050Count, 0, fives);

  const updated = await sql<DbPlayerRow>`
    update leaderboard_players
    set
      token_hash = ${tokenHash},
      level = ${level},
      fives = ${fives},
      xp = ${xp},
      gems = ${gems},
      shards = ${shards},
      tickets = ${tickets},
      pity5 = ${pity5},
      pity4 = ${pity4},
      guaranteed = ${guaranteed},
      copies = ${JSON.stringify(copies)}::jsonb,
      loadout = ${JSON.stringify(loadout)}::jsonb,
      best5 = ${best5},
      best5_pity = ${best5Pity},
      lost_5050_count = ${lost5050Count},
      updated_at = now()
    where id = ${row.id}
      and season = ${SEASON}
      and token_hash is null
    returning *
  `;
  if (updated[0]) return updated[0];

  // Lost a concurrent race to bind token_hash — re-read and verify ownership.
  const latest = await selectPlayer(sql, row.id);
  if (!latest || !latest.token_hash || !constantTimeHexEqual(latest.token_hash, tokenHash)) {
    throw new Error("Сесія вже прив'язана до іншого пристрою");
  }
  return latest;
}

async function authenticatePlayer(
  sql: Sql,
  creds: { id: string; tokenHash: string },
  options: { createIfMissing?: boolean; name?: unknown; legacy?: LegacySeedInput } = {},
): Promise<DbPlayerRow> {
  let row = await selectPlayer(sql, creds.id);
  if (!row || Number(row.season) < SEASON) {
    if (!options.createIfMissing) throw new Error("Профіль не знайдено");
    row = await ensureNewPlayerRow(sql, creds.id, creds.tokenHash, options.name);
  }
  if (!row.token_hash) {
    row = await claimLegacyRow(sql, row, creds.tokenHash, options.legacy);
  } else if (!constantTimeHexEqual(row.token_hash, creds.tokenHash)) {
    await logViolation(sql, creds.id, "bad_token", {}, true);
    throw new Error("Помилка перевірки сесії гравця");
  }
  return row;
}

export async function initPlayerSession(
  sql: Sql,
  input: { id: string; secret: string; season: number; name?: unknown; legacy?: LegacySeedInput },
): Promise<PlayerSnapshot> {
  const creds = assertValidCredentials(input);
  const row = await authenticatePlayer(sql, creds, {
    createIfMissing: true,
    name: input.name,
    legacy: input.legacy,
  });
  return snapshotFromRow(row);
}

export async function updatePlayerName(
  sql: Sql,
  input: { id: string; secret: string; season: number; name: unknown },
): Promise<PlayerSnapshot> {
  const creds = assertValidCredentials(input);
  const cleaned = cleanPlayerName(input.name);
  if (cleaned.length < 2) throw new Error("Нікнейм має бути від 2 символів");

  const row = await authenticatePlayer(sql, creds, { createIfMissing: true, name: cleaned });
  const updated = await sql<DbPlayerRow>`
    update leaderboard_players
    set name = ${cleaned}, updated_at = now()
    where id = ${creds.id}
      and token_hash = ${creds.tokenHash}
      and season = ${SEASON}
    returning *
  `;
  if (!updated[0]) {
    await logViolation(sql, creds.id, "rename_auth_failed", {}, true);
    throw new Error("Помилка перевірки сесії гравця");
  }
  return snapshotFromRow(updated[0] ?? row);
}

export async function executeServerSpin(
  sql: Sql,
  input: { id: string; secret: string; season: number; seq: number; name?: unknown },
): Promise<SpinExecutionResult> {
  const creds = assertValidCredentials(input);
  const seq = clampInt(input.seq, 0, 1_000_000_000);
  const row = await authenticatePlayer(sql, creds, { createIfMissing: true, name: input.name });

  if (row.in_blackout) {
    await logViolation(sql, creds.id, "spin_during_blackout", { seq: row.seq }, true);
    throw new Error("Спочатку запали свічку після блакауту!");
  }
  if (seq !== Number(row.seq)) {
    throw new Error("CONFLICT");
  }

  const activeBefore = parseSpinEvent(row.spin_event_kind, Number(row.spin_event_left ?? 0));
  const isTurbo = activeBefore?.kind === "turbo";
  const cooldownMs = isTurbo ? SPIN_COOLDOWN_TURBO_MS : SPIN_COOLDOWN_NORMAL_MS;

  const sliceIndex =
    activeBefore?.kind === "golden"
      ? GOLDEN_SLICE_INDICES[randomInt(0, GOLDEN_SLICE_INDICES.length)]!
      : randomInt(0, WHEEL_SLICES.length);
  const outcome: Outcome = WHEEL_SLICES[sliceIndex]!.id;

  const xpGain = XP_PER_OUTCOME[outcome];
  const nextXp = Math.max(0, Number(row.xp)) + xpGain;
  const nextLevel = levelFromXp(nextXp);

  const copies = sanitizeCopies(parseJsonField(row.copies));
  const loadout = sanitizeLoadout(parseJsonField(row.loadout), copies);
  const buffs = computeBuffs(loadout, copies);
  const boost = Number(row.boost_spins ?? 0) > 0 ? 3 : 1;
  const baseGems = Math.round(GEMS_PER_OUTCOME[outcome] * (1 + buffs.gems) * boost);
  const refunded = outcome !== "respin" && buffs.refund > 0 && cryptoRandomFloat() < buffs.refund;
  const gemsGained = refunded ? baseGems * 2 : baseGems;
  const nextBoostSpins = Math.max(0, Number(row.boost_spins ?? 0) - 1);

  let nextSpinEvent: ActiveSpinEvent | null = null;
  if (activeBefore) {
    nextSpinEvent = activeBefore.left > 1 ? { kind: activeBefore.kind, left: activeBefore.left - 1 } : null;
  } else if (outcome !== "respin" && outcome !== "blackout" && cryptoRandomFloat() < SPIN_EVENT_CHANCE) {
    const kind = SPIN_EVENT_KINDS[randomInt(0, SPIN_EVENT_KINDS.length)]!;
    nextSpinEvent = { kind, left: SPIN_EVENTS[kind].spins };
  }

  const nextInBlackout = outcome === "blackout";
  const queueProc = buffs.queue && cryptoRandomFloat() < 0.25;

  const updated = await sql<DbPlayerRow>`
    update leaderboard_players
    set
      spins = spins + 1,
      xp = ${nextXp},
      level = ${nextLevel},
      gems = gems + ${gemsGained},
      boost_spins = ${nextBoostSpins},
      spin_event_kind = ${nextSpinEvent?.kind ?? null},
      spin_event_left = ${nextSpinEvent?.left ?? 0},
      in_blackout = ${nextInBlackout},
      last_spin_at = now(),
      seq = seq + 1,
      updated_at = now()
    where id = ${creds.id}
      and token_hash = ${creds.tokenHash}
      and season = ${SEASON}
      and seq = ${seq}
      and in_blackout = false
      and (
        last_spin_at is null
        or last_spin_at <= now() - (${cooldownMs}::double precision * interval '1 millisecond')
      )
    returning *
  `;

  if (!updated[0]) {
    const latest = await selectPlayer(sql, creds.id);
    if (latest?.last_spin_at) {
      const elapsed = Date.now() - toMs(latest.last_spin_at);
      if (elapsed < cooldownMs) {
        await logViolation(sql, creds.id, "spin_too_fast", { elapsed, cooldownMs }, true);
        throw new Error("Не так швидко! Почекай поки колесо зупиниться.");
      }
    }
    if (latest?.in_blackout) {
      throw new Error("Спочатку запали свічку після блакауту!");
    }
    throw new Error("CONFLICT");
  }

  return {
    sliceIndex,
    outcome,
    turbo: isTurbo,
    xpGain,
    gemsGained,
    refunded,
    queueProc,
    activeEventBefore: activeBefore,
    nextSpinEvent,
    state: snapshotFromRow(updated[0]),
  };
}

export async function executeClearBlackout(
  sql: Sql,
  input: { id: string; secret: string; season: number; seq: number },
): Promise<PlayerSnapshot> {
  const creds = assertValidCredentials(input);
  const seq = clampInt(input.seq, 0, 1_000_000_000);
  const row = await authenticatePlayer(sql, creds);
  if (!row.in_blackout) return snapshotFromRow(row);
  if (seq !== Number(row.seq)) throw new Error("CONFLICT");

  const updated = await sql<DbPlayerRow>`
    update leaderboard_players
    set
      in_blackout = false,
      seq = seq + 1,
      updated_at = now()
    where id = ${creds.id}
      and token_hash = ${creds.tokenHash}
      and season = ${SEASON}
      and seq = ${seq}
      and in_blackout = true
      and (
        last_spin_at is null
        or last_spin_at <= now() - (${BLACKOUT_MIN_MS}::double precision * interval '1 millisecond')
      )
    returning *
  `;
  if (!updated[0]) {
    await logViolation(sql, creds.id, "blackout_too_fast", {}, true);
    throw new Error("Занадто швидко! Запалюй свічку чесно.");
  }
  return snapshotFromRow(updated[0]);
}

export async function executeServerPull(
  sql: Sql,
  input: { id: string; secret: string; season: number; seq: number; count: number; name?: unknown },
): Promise<PullServerResult> {
  const creds = assertValidCredentials(input);
  const count = Number(input.count);
  if (count !== 1 && count !== 10) throw new Error("Можна молитися лише ×1 або ×10");
  const seq = clampInt(input.seq, 0, 1_000_000_000);

  const row = await authenticatePlayer(sql, creds, { createIfMissing: true, name: input.name });
  if (seq !== Number(row.seq)) throw new Error("CONFLICT");

  const copies = sanitizeCopies(parseJsonField(row.copies));
  const exec = executeGachaPulls({
    gems: Number(row.gems),
    tickets: Number(row.tickets),
    shards: Number(row.shards),
    pity5: Number(row.pity5),
    pity4: Number(row.pity4),
    guaranteed: Boolean(row.guaranteed),
    totalPulls: Number(row.pulls),
    copies,
    best5: row.best5,
    best5Pity: Number(row.best5_pity ?? 0),
    lost5050Count: Number(row.lost_5050_count ?? 0),
    count,
    rnd: cryptoRandomFloat,
  });
  if (!exec) throw new Error("Не вистачає кВт-гемів або талонів");

  const updated = await sql<DbPlayerRow>`
    update leaderboard_players
    set
      gems = ${exec.gems},
      tickets = ${exec.tickets},
      shards = ${exec.shards},
      pity5 = ${exec.pity5},
      pity4 = ${exec.pity4},
      guaranteed = ${exec.guaranteed},
      pulls = ${exec.totalPulls},
      fives = ${exec.fives},
      copies = ${JSON.stringify(exec.copies)}::jsonb,
      best5 = ${exec.best5},
      best5_pity = ${exec.best5Pity},
      lost_5050_count = ${exec.lost5050Count},
      seq = seq + 1,
      updated_at = now()
    where id = ${creds.id}
      and token_hash = ${creds.tokenHash}
      and season = ${SEASON}
      and seq = ${seq}
      and tickets = ${Number(row.tickets)}
      and gems >= ${exec.gemCost}
    returning *
  `;
  if (!updated[0]) throw new Error("CONFLICT");

  return { results: exec.results, state: snapshotFromRow(updated[0]) };
}

export async function executeServerAid(
  sql: Sql,
  input: { id: string; secret: string; season: number; seq: number; name?: unknown },
): Promise<PlayerSnapshot> {
  const creds = assertValidCredentials(input);
  const seq = clampInt(input.seq, 0, 1_000_000_000);
  const row = await authenticatePlayer(sql, creds, { createIfMissing: true, name: input.name });
  if (seq !== Number(row.seq)) throw new Error("CONFLICT");

  const updated = await sql<DbPlayerRow>`
    update leaderboard_players
    set
      gems = gems + ${AID_AMOUNT},
      last_aid_at = now(),
      seq = seq + 1,
      updated_at = now()
    where id = ${creds.id}
      and token_hash = ${creds.tokenHash}
      and season = ${SEASON}
      and seq = ${seq}
      and (
        last_aid_at is null
        or last_aid_at <= now() - (${AID_COOLDOWN_MS}::double precision * interval '1 millisecond')
      )
    returning *
  `;
  if (!updated[0]) {
    await logViolation(sql, creds.id, "aid_cooldown", {}, true);
    throw new Error("Аварійна допомога ще перезаряджається");
  }
  return snapshotFromRow(updated[0]);
}

export async function executeServerExchange(
  sql: Sql,
  input: { id: string; secret: string; season: number; seq: number },
): Promise<PlayerSnapshot> {
  const creds = assertValidCredentials(input);
  const seq = clampInt(input.seq, 0, 1_000_000_000);
  const row = await authenticatePlayer(sql, creds);
  if (seq !== Number(row.seq)) throw new Error("CONFLICT");

  const updated = await sql<DbPlayerRow>`
    update leaderboard_players
    set
      shards = shards - ${SHARDS_PER_TICKET},
      tickets = tickets + 1,
      seq = seq + 1,
      updated_at = now()
    where id = ${creds.id}
      and token_hash = ${creds.tokenHash}
      and season = ${SEASON}
      and seq = ${seq}
      and shards >= ${SHARDS_PER_TICKET}
    returning *
  `;
  if (!updated[0]) throw new Error("Мало копіуму для обміну");
  return snapshotFromRow(updated[0]);
}

export async function executeServerEquip(
  sql: Sql,
  input: { id: string; secret: string; season: number; seq: number; unitId: string },
): Promise<{ status: "equipped" | "removed" | "full" | "locked"; state: PlayerSnapshot }> {
  const creds = assertValidCredentials(input);
  const seq = clampInt(input.seq, 0, 1_000_000_000);
  const unitId = String(input.unitId ?? "");
  if (!UNIT_BY_ID[unitId]) {
    await logViolation(sql, creds.id, "invalid_unit_equip", { unitId }, true);
    throw new Error("Невідомий юніт");
  }

  const row = await authenticatePlayer(sql, creds);
  if (seq !== Number(row.seq)) throw new Error("CONFLICT");

  const copies = sanitizeCopies(parseJsonField(row.copies));
  const loadout = sanitizeLoadout(parseJsonField(row.loadout), copies);
  if (!copies[unitId]) return { status: "locked", state: snapshotFromRow(row) };

  let status: "equipped" | "removed" | "full";
  let nextLoadout: string[];
  if (loadout.includes(unitId)) {
    nextLoadout = loadout.filter((x) => x !== unitId);
    status = "removed";
  } else if (loadout.length >= MAX_LOADOUT) {
    return { status: "full", state: snapshotFromRow(row) };
  } else {
    nextLoadout = [...loadout, unitId];
    status = "equipped";
  }

  const updated = await sql<DbPlayerRow>`
    update leaderboard_players
    set
      loadout = ${JSON.stringify(nextLoadout)}::jsonb,
      seq = seq + 1,
      updated_at = now()
    where id = ${creds.id}
      and token_hash = ${creds.tokenHash}
      and season = ${SEASON}
      and seq = ${seq}
    returning *
  `;
  if (!updated[0]) throw new Error("CONFLICT");
  return { status, state: snapshotFromRow(updated[0]) };
}

export async function executeServerRook(
  sql: Sql,
  input: { id: string; secret: string; season: number; seq: number },
): Promise<PlayerSnapshot> {
  const creds = assertValidCredentials(input);
  const seq = clampInt(input.seq, 0, 1_000_000_000);
  const row = await authenticatePlayer(sql, creds);
  if (seq !== Number(row.seq)) throw new Error("CONFLICT");

  const copies = sanitizeCopies(parseJsonField(row.copies));
  const loadout = sanitizeLoadout(parseJsonField(row.loadout), copies);
  if (!loadout.includes("rook")) {
    await logViolation(sql, creds.id, "rook_not_equipped", {}, true);
    throw new Error("Спочатку додай ТУРУ в загін");
  }

  const updated = await sql<DbPlayerRow>`
    update leaderboard_players
    set
      rook_ready_at = now() + (${ROOK_COOLDOWN_MS}::double precision * interval '1 millisecond'),
      boost_spins = ${ROOK_BOOST_SPINS},
      seq = seq + 1,
      updated_at = now()
    where id = ${creds.id}
      and token_hash = ${creds.tokenHash}
      and season = ${SEASON}
      and seq = ${seq}
      and (rook_ready_at is null or rook_ready_at <= now())
    returning *
  `;
  if (!updated[0]) throw new Error("Тура ще відновлюється");
  return snapshotFromRow(updated[0]);
}

export async function fetchLeaderboard(sql: Sql): Promise<LeaderRow[]> {
  const rows = await sql<{
    id: string;
    name: string;
    spins: number;
    level: number;
    fives: number;
    pulls: number;
    token_hash: string | null;
    updated_at: Date | string;
  }>`
    select id, name, spins, level, fives, pulls, token_hash, updated_at
    from leaderboard_players
    where season = ${SEASON}
      and char_length(name) >= 2
      and spins >= 0
      and fives >= 0
      and pulls >= 0
      and fives <= pulls
      and level >= 1
      and level <= 10
      and (100 * (level - 1) * (level - 1)) <= spins * 40
    order by spins desc, fives desc, updated_at asc
    limit 50
  `;
  return rows.map((r) => ({
    publicId: publicPlayerId(r.id),
    name: r.name,
    spins: Number(r.spins),
    level: Number(r.level),
    fives: Number(r.fives),
    pulls: Number(r.pulls),
    verified: Boolean(r.token_hash),
    updatedAt: new Date(r.updated_at).toISOString(),
  }));
}
