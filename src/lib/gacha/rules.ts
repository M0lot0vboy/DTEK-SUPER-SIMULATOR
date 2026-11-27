import type { Outcome } from "../game/data.ts";
import {
  LOSS_UNIT,
  POOL_3,
  POOL_4,
  POOL_FEATURED,
  UNIT_BY_ID,
  type Rarity,
  type Unit,
} from "./pool.ts";

export const PULL_COST = 160;
export const BASE_5 = 0.009;
export const BASE_4 = 0.051;
export const SOFT_PITY = 70;
export const HARD_PITY = 90;
export const PITY_4 = 10;
export const MAX_LOADOUT = 3;
export const AID_AMOUNT = 480;
export const AID_COOLDOWN_MS = 3 * 60_000;
export const SHARDS_PER_TICKET = 14;
export const ROOK_COOLDOWN_MS = 10 * 60_000;
export const ROOK_BOOST_SPINS = 5;

export const SHARDS_FOR_DUPE: Record<Rarity, number> = { 3: 2, 4: 8, 5: 40 };

export const GEMS_PER_OUTCOME: Record<Outcome, number> = {
  off: 50,
  on: 65,
  blink: 80,
  blackout: 130,
  generator: 200,
  respin: 35,
};

export type PullOutcome = {
  unitId: string;
  rarity: Rarity;
  isNew: boolean;
  constellation: number;
  shards: number;
  fakeout: boolean;
  lost5050: boolean;
  pityAt: number;
};

export type ShopPack = {
  id: string;
  name: string;
  tag: string;
  price: number;
  gems: number;
  roast: string;
};

export const SHOP_PACKS: ShopPack[] = [
  {
    id: "starter",
    name: "СТАРТОВИЙ НАБІР",
    tag: "900% ВИГОДИ!!",
    price: 99.99,
    gems: 6480,
    roast: "Вітаємо! За ці гроші можна було купити справжній павербанк. Два.",
  },
  {
    id: "monthly",
    name: "Місячна картка Відчаю",
    tag: "НАЙПОПУЛЯРНІШЕ",
    price: 4.99,
    gems: 960,
    roast: "4,99$ на місяць за відчуття контролю. ДТЕК теж так вміє.",
  },
  {
    id: "whale",
    name: "Набір Кита «Генераторний Магнат»",
    tag: "ЛИШЕ СЬОГОДНІ",
    price: 499.99,
    gems: 32800,
    roast: "Ти щойно віртуально витратив ціну дизельного генератора на піксельну туру.",
  },
];

export type GachaState = {
  gems: number;
  shards: number;
  tickets: number;
  pity5: number;
  pity4: number;
  guaranteed: boolean;
  totalPulls: number;
  copies: Record<string, number>;
  loadout: string[];
  fakeMoney: number;
  lastBatch: PullOutcome[];
  best5: string | null;
  best5Pity: number;
  aidAt: number;
  muted: boolean;
  badges: boolean;
  rookReadyAt: number;
  boostSpins: number;
  lost5050Count: number;
  seq: number;
};

export type Buffs = {
  drain: number;
  gems: number;
  onBonus: number;
  refund: number;
  rook: boolean;
  queue: boolean;
};

export function fiveStarRate(pity: number): number {
  if (pity >= HARD_PITY) return 1;
  if (pity < SOFT_PITY) return BASE_5;
  return Math.min(1, BASE_5 + 0.06 * (pity - SOFT_PITY + 1));
}

export function constellationOf(copies: number): number {
  return Math.max(0, Math.min(6, copies - 1));
}

export function scaledBuff(unit: Unit, constellation: number) {
  const k = 1 + 0.2 * constellation;
  const b = unit.buff;
  return {
    drain: b.drain === undefined ? 1 : 1 - (1 - b.drain) * k,
    gems: (b.gems ?? 0) * k,
    onBonus: Math.round((b.onBonus ?? 0) * k),
    refund: (b.refund ?? 0) * k,
  };
}

export function computeBuffs(loadout: string[], copies: Record<string, number>): Buffs {
  const out: Buffs = { drain: 1, gems: 0, onBonus: 0, refund: 0, rook: false, queue: false };
  for (const id of loadout) {
    const unit = UNIT_BY_ID[id];
    if (!unit || !copies[id]) continue;
    const b = scaledBuff(unit, constellationOf(copies[id]!));
    out.drain *= b.drain;
    out.gems += b.gems;
    out.onBonus += b.onBonus;
    out.refund += b.refund;
    if (id === "rook") out.rook = true;
    if (id === "queue") out.queue = true;
  }
  out.drain = Math.max(0.2, out.drain);
  out.refund = Math.min(0.5, out.refund);
  return out;
}

export function countFives(copies: Record<string, number>): number {
  let total = 0;
  for (const [id, n] of Object.entries(copies)) {
    if (UNIT_BY_ID[id]?.rarity === 5 && Number.isFinite(n) && n > 0) {
      total += Math.floor(n);
    }
  }
  return total;
}

export function sumCopies(copies: Record<string, number>): number {
  let total = 0;
  for (const n of Object.values(copies)) {
    if (Number.isFinite(n) && n > 0) total += Math.floor(n);
  }
  return total;
}

export function sanitizeCopies(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const clean: Record<string, number> = {};
  for (const [id, count] of Object.entries(raw)) {
    if (!UNIT_BY_ID[id]) continue;
    const n = Math.floor(Number(count));
    if (Number.isFinite(n) && n > 0) clean[id] = Math.min(n, 100_000);
  }
  return clean;
}

export function sanitizeLoadout(raw: unknown, copies: Record<string, number>): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const id of raw) {
    if (typeof id !== "string" || !UNIT_BY_ID[id] || !copies[id] || out.includes(id)) continue;
    out.push(id);
    if (out.length >= MAX_LOADOUT) break;
  }
  return out;
}

function pickWith<T>(list: readonly T[], rnd: () => number): T {
  const idx = Math.min(list.length - 1, Math.max(0, Math.floor(rnd() * list.length)));
  return list[idx]!;
}

export type PullExecutionInput = {
  gems: number;
  tickets: number;
  shards: number;
  pity5: number;
  pity4: number;
  guaranteed: boolean;
  totalPulls: number;
  copies: Record<string, number>;
  best5: string | null;
  best5Pity: number;
  lost5050Count: number;
  count: number;
  rnd?: () => number;
};

export type PullExecutionOutput = {
  results: PullOutcome[];
  gems: number;
  tickets: number;
  ticketsUsed: number;
  gemCost: number;
  shards: number;
  pity5: number;
  pity4: number;
  guaranteed: boolean;
  totalPulls: number;
  fives: number;
  copies: Record<string, number>;
  best5: string | null;
  best5Pity: number;
  lost5050Count: number;
};

export function executeGachaPulls(input: PullExecutionInput): PullExecutionOutput | null {
  const { count, rnd = Math.random } = input;
  if (count !== 1 && count !== 10) return null;

  const ticketsUsed = Math.min(input.tickets, count);
  const gemCost = (count - ticketsUsed) * PULL_COST;
  if (input.gems < gemCost) return null;

  let pity5 = input.pity5;
  let pity4 = input.pity4;
  let guaranteed = input.guaranteed;
  let shardsGain = 0;
  let lostCount = input.lost5050Count;
  let best5 = input.best5;
  let best5Pity = input.best5Pity;
  const copies = { ...input.copies };
  const results: PullOutcome[] = [];

  for (let i = 0; i < count; i += 1) {
    pity5 += 1;
    pity4 += 1;
    const pityAt = pity5;
    let rarity: Rarity;
    if (rnd() < fiveStarRate(pity5)) rarity = 5;
    else if (pity4 >= PITY_4 || rnd() < BASE_4) rarity = 4;
    else rarity = 3;

    let unit: Unit;
    let lost5050 = false;
    if (rarity === 5) {
      if (guaranteed || rnd() < 0.5) {
        unit = pickWith(POOL_FEATURED, rnd);
        guaranteed = false;
      } else {
        unit = LOSS_UNIT;
        lost5050 = true;
        guaranteed = true;
        lostCount += 1;
      }
      pity5 = 0;
      pity4 = 0;
    } else if (rarity === 4) {
      unit = pickWith(POOL_4, rnd);
      pity4 = 0;
    } else {
      unit = pickWith(POOL_3, rnd);
    }

    const prev = copies[unit.id] ?? 0;
    copies[unit.id] = prev + 1;
    const isNew = prev === 0;
    const shards = isNew ? 0 : SHARDS_FOR_DUPE[rarity] * (prev >= 7 ? 2 : 1);
    shardsGain += shards;

    if (rarity === 5 && !lost5050) {
      best5 = unit.id;
      best5Pity = pityAt;
    }

    results.push({
      unitId: unit.id,
      rarity,
      isNew,
      constellation: constellationOf(prev + 1),
      shards,
      fakeout: rarity === 5 && rnd() < 0.3,
      lost5050,
      pityAt,
    });
  }

  return {
    results,
    gems: input.gems - gemCost,
    tickets: input.tickets - ticketsUsed,
    ticketsUsed,
    gemCost,
    shards: input.shards + shardsGain,
    pity5,
    pity4,
    guaranteed,
    totalPulls: input.totalPulls + count,
    fives: countFives(copies),
    copies,
    best5,
    best5Pity,
    lost5050Count: lostCount,
  };
}
