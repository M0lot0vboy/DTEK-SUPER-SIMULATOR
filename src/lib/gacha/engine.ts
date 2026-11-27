import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { RESIN_MAX, type Outcome } from "@/lib/game/data";
import { useGame } from "@/lib/game/store";
import {
  LOSS_UNIT,
  POOL_3,
  POOL_4,
  POOL_FEATURED,
  UNIT_BY_ID,
  unitById,
  type Rarity,
  type Unit,
} from "./pool";

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

const SHARDS_FOR_DUPE: Record<Rarity, number> = { 3: 2, 4: 8, 5: 40 };

const GEMS_PER_OUTCOME: Record<Outcome, number> = {
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
};

export type GachaStore = GachaState & {
  pull: (count: number) => PullOutcome[] | null;
  claimAid: () => boolean;
  buyPack: (id: string) => ShopPack | null;
  exchangeShards: () => boolean;
  toggleEquip: (id: string) => "equipped" | "removed" | "full" | "locked";
  setMuted: (muted: boolean) => void;
  setBadges: (on: boolean) => void;
  earnFromSpin: (outcome: Outcome) => number;
  sacrificeRook: () => boolean;
};

function initial(): GachaState {
  return {
    gems: PULL_COST * 10,
    shards: 0,
    tickets: 0,
    pity5: 0,
    pity4: 0,
    guaranteed: false,
    totalPulls: 0,
    copies: {},
    loadout: [],
    fakeMoney: 0,
    lastBatch: [],
    best5: null,
    best5Pity: 0,
    aidAt: 0,
    muted: false,
    badges: true,
    rookReadyAt: 0,
    boostSpins: 0,
    lost5050Count: 0,
  };
}

export function fiveStarRate(pity: number): number {
  if (pity >= HARD_PITY) return 1;
  if (pity < SOFT_PITY) return BASE_5;
  return Math.min(1, BASE_5 + 0.06 * (pity - SOFT_PITY + 1));
}

function pickFrom<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}

export function constellationOf(copies: number): number {
  return Math.max(0, Math.min(6, copies - 1));
}

const noopStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

export const useGacha = create<GachaStore>()(
  persist(
    (set, get) => ({
      ...initial(),

      pull: (count) => {
        const s = get();
        const ticketsUsed = Math.min(s.tickets, count);
        const gemCost = (count - ticketsUsed) * PULL_COST;
        if (s.gems < gemCost) return null;

        let pity5 = s.pity5;
        let pity4 = s.pity4;
        let guaranteed = s.guaranteed;
        let shardsGain = 0;
        let lostCount = s.lost5050Count;
        let best5 = s.best5;
        let best5Pity = s.best5Pity;
        const copies = { ...s.copies };
        const results: PullOutcome[] = [];

        for (let i = 0; i < count; i++) {
          pity5 += 1;
          pity4 += 1;
          const pityAt = pity5;
          let rarity: Rarity;
          if (Math.random() < fiveStarRate(pity5)) rarity = 5;
          else if (pity4 >= PITY_4 || Math.random() < BASE_4) rarity = 4;
          else rarity = 3;

          let unit: Unit;
          let lost5050 = false;
          if (rarity === 5) {
            if (guaranteed || Math.random() < 0.5) {
              unit = pickFrom(POOL_FEATURED);
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
            unit = pickFrom(POOL_4);
            pity4 = 0;
          } else {
            unit = pickFrom(POOL_3);
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
            fakeout: rarity === 5 && Math.random() < 0.3,
            lost5050,
            pityAt,
          });
        }

        set({
          gems: s.gems - gemCost,
          tickets: s.tickets - ticketsUsed,
          pity5,
          pity4,
          guaranteed,
          totalPulls: s.totalPulls + count,
          copies,
          shards: s.shards + shardsGain,
          lastBatch: results,
          best5,
          best5Pity,
          lost5050Count: lostCount,
        });
        return results;
      },

      claimAid: () => {
        const s = get();
        if (Date.now() < s.aidAt) return false;
        set({ gems: s.gems + AID_AMOUNT, aidAt: Date.now() + AID_COOLDOWN_MS });
        return true;
      },

      buyPack: (id) => {
        const pack = SHOP_PACKS.find((p) => p.id === id);
        if (!pack) return null;
        set((s) => ({
          gems: s.gems + pack.gems,
          fakeMoney: Math.round((s.fakeMoney + pack.price) * 100) / 100,
        }));
        return pack;
      },

      exchangeShards: () => {
        const s = get();
        if (s.shards < SHARDS_PER_TICKET) return false;
        set({ shards: s.shards - SHARDS_PER_TICKET, tickets: s.tickets + 1 });
        return true;
      },

      toggleEquip: (id) => {
        const s = get();
        if (!s.copies[id]) return "locked";
        if (s.loadout.includes(id)) {
          set({ loadout: s.loadout.filter((x) => x !== id) });
          return "removed";
        }
        if (s.loadout.length >= MAX_LOADOUT) return "full";
        set({ loadout: [...s.loadout, id] });
        return "equipped";
      },

      setMuted: (muted) => set({ muted }),
      setBadges: (badges) => set({ badges }),

      earnFromSpin: (outcome) => {
        const s = get();
        const buffs = computeBuffs(s.loadout, s.copies);
        const boost = s.boostSpins > 0 ? 3 : 1;
        const gained = Math.round(GEMS_PER_OUTCOME[outcome] * (1 + buffs.gems) * boost);
        set({ gems: s.gems + gained, boostSpins: Math.max(0, s.boostSpins - 1) });
        return gained;
      },

      sacrificeRook: () => {
        const s = get();
        if (!s.loadout.includes("rook") || Date.now() < s.rookReadyAt) return false;
        set({ rookReadyAt: Date.now() + ROOK_COOLDOWN_MS, boostSpins: ROOK_BOOST_SPINS });
        useGame.setState({ battery: 100, resin: RESIN_MAX, resinAt: 0 });
        return true;
      },
    }),
    {
      name: "dtek-isekai-gacha-v1",
      storage: createJSONStorage(() => (typeof window === "undefined" ? noopStorage : window.localStorage)),
    },
  ),
);

export type Buffs = {
  drain: number;
  gems: number;
  onBonus: number;
  refund: number;
  rook: boolean;
  queue: boolean;
};

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

export function loadoutBuffs(): Buffs {
  const s = useGacha.getState();
  return computeBuffs(s.loadout, s.copies);
}

/** Simulator-side effects of the equipped loadout, applied after every wheel spin. */
export function afterSpinGacha(outcome: Outcome): void {
  const gacha = useGacha.getState();
  const game = useGame.getState();
  const buffs = computeBuffs(gacha.loadout, gacha.copies);
  const gained = gacha.earnFromSpin(outcome);

  if ((outcome === "on" || outcome === "blink") && buffs.onBonus > 0) {
    game.applyBatteryDelta(buffs.onBonus);
  }
  if (outcome !== "respin" && buffs.refund > 0 && Math.random() < buffs.refund) {
    useGacha.setState((s) => ({ gems: s.gems + gained }));
    game.pushToast("Загін подвоїв видобуток", `+${gained * 2} кВт-гемів`, "#a879f0");
  }
  if (buffs.queue && Math.random() < 0.25) {
    game.applyBatteryDelta(20);
    game.pushToast("98%… КРАШ", "Атемпт 147 204. Queue 4.2 вибила напругу: павербанк +20%", "#5ec4b3");
  }
}

export function flexText(state: GachaState): string {
  const batch = state.lastBatch;
  const stars = (r: Rarity) => "★".repeat(r);
  const lines: string[] = ["⚡ ДТЕК ІСЕКАЙ ГАЧА ⚡"];
  if (batch.length) {
    lines.push(`Остання крутка ×${batch.length}:`);
    for (const r of batch) {
      const u = unitById(r.unitId);
      const mark = r.lost5050 ? " 💀 ПРОГРАВ 50/50" : r.isNew ? " 🆕" : ` C${r.constellation}`;
      lines.push(`${stars(r.rarity)} ${u.eval} ${u.name}${mark}`);
    }
  }
  if (state.best5) {
    lines.push(`Найкращий 5★: ${unitById(state.best5).name} (на ${state.best5Pity}-й крутці)`);
  }
  lines.push(`Гарант 5★: ${state.pity5}/${HARD_PITY}${state.guaranteed ? " · наступний 5★ — рекомендований" : ""}`);
  lines.push(`Програно 50/50: ${state.lost5050Count}`);
  lines.push("Світла досі нема. Але є ТУРА?");
  return lines.join("\n");
}
