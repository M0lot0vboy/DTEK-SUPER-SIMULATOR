import { ensureSeasonReset } from "@/lib/game/season";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { unitById, type Rarity } from "./pool";
import {
  AID_AMOUNT,
  AID_COOLDOWN_MS,
  BASE_4,
  BASE_5,
  GEMS_PER_OUTCOME,
  HARD_PITY,
  MAX_LOADOUT,
  PITY_4,
  PULL_COST,
  ROOK_BOOST_SPINS,
  ROOK_COOLDOWN_MS,
  SHARDS_FOR_DUPE,
  SHARDS_PER_TICKET,
  SHOP_PACKS,
  SOFT_PITY,
  computeBuffs,
  constellationOf,
  fiveStarRate,
  scaledBuff,
  type Buffs,
  type GachaState,
  type PullOutcome,
  type ShopPack,
} from "./rules";

ensureSeasonReset();

export {
  AID_AMOUNT,
  AID_COOLDOWN_MS,
  BASE_4,
  BASE_5,
  GEMS_PER_OUTCOME,
  HARD_PITY,
  MAX_LOADOUT,
  PITY_4,
  PULL_COST,
  ROOK_BOOST_SPINS,
  ROOK_COOLDOWN_MS,
  SHARDS_FOR_DUPE,
  SHARDS_PER_TICKET,
  SHOP_PACKS,
  SOFT_PITY,
  computeBuffs,
  constellationOf,
  fiveStarRate,
  scaledBuff,
};
export type { Buffs, GachaState, PullOutcome, ShopPack };

export type ServerGachaSync = {
  gems: number;
  shards: number;
  tickets: number;
  pity5: number;
  pity4: number;
  guaranteed: boolean;
  pulls: number;
  copies: Record<string, number>;
  loadout: string[];
  best5: string | null;
  best5Pity: number;
  lost5050Count: number;
  boostSpins: number;
  aidAt: number;
  rookReadyAt: number;
  seq: number;
};

export type GachaStore = GachaState & {
  setMuted: (muted: boolean) => void;
  setBadges: (on: boolean) => void;
  setLastBatch: (results: PullOutcome[]) => void;
  applyServerGacha: (snap: ServerGachaSync) => void;
  resetGacha: () => void;
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
    seq: 0,
  };
}

const noopStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

export const useGacha = create<GachaStore>()(
  persist(
    (set) => ({
      ...initial(),
      setMuted: (muted) => set({ muted }),
      setBadges: (badges) => set({ badges }),
      setLastBatch: (lastBatch) => set({ lastBatch }),
      applyServerGacha: (snap) =>
        set({
          gems: snap.gems,
          shards: snap.shards,
          tickets: snap.tickets,
          pity5: snap.pity5,
          pity4: snap.pity4,
          guaranteed: snap.guaranteed,
          totalPulls: snap.pulls,
          copies: snap.copies,
          loadout: snap.loadout,
          best5: snap.best5,
          best5Pity: snap.best5Pity,
          lost5050Count: snap.lost5050Count,
          boostSpins: snap.boostSpins,
          aidAt: snap.aidAt,
          rookReadyAt: snap.rookReadyAt,
          seq: snap.seq,
        }),
      resetGacha: () =>
        set((s) => ({
          ...initial(),
          muted: s.muted,
          badges: s.badges,
        })),
    }),
    {
      name: "dtek-isekai-gacha-v1",
      storage: createJSONStorage(() => (typeof window === "undefined" ? noopStorage : window.localStorage)),
    },
  ),
);

export function loadoutBuffs(): Buffs {
  const s = useGacha.getState();
  return computeBuffs(s.loadout, s.copies);
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
