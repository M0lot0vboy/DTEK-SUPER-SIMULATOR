import { ensureSeasonReset } from "@/lib/game/season";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  ARTIFACTS,
  BOSS_MAX_HP,
  BP_MAX_TIER,
  BP_TIER_SPINS,
  GACHA_COST,
  KW_PER_OUTCOME,
  PET,
  RESIN_MAX,
  RESIN_REGEN_MS,
  QUESTS,
  XP_PER_OUTCOME,
  levelFromXp,
  pick,
  titleFor,
  todayKey,
  type Outcome,
} from "./data";

ensureSeasonReset();

export type Toast = { key: number; name: string; desc: string; color?: string };

export type PullResult = { stars: number; artifactId: string };

export type DataState = Omit<GameState, "toasts">;

export type Store = GameState & {
  pushToast: (name: string, desc: string, color?: string) => void;
  regenResin: () => void;
  spendResin: () => boolean;
  refundResin: () => void;
  completeSpin: (outcome: Outcome, battery: number) => void;
  applyBatteryDelta: (delta: number) => void;
  unlock: (id: string) => void;
  pull: (count: number) => PullResult[];
  claimQuest: (id: string) => void;
  claimBp: (tier: number) => void;
  claimDaily: () => { reward: number; streak: number } | null;
};

export type GameState = {
  kw: number;
  xp: number;
  resin: number;
  resinAt: number;
  pity4: number;
  pity5: number;
  pulls: number;
  inv: Record<string, number>;
  pet: string | null;
  spins: number;
  off: number;
  on: number;
  generator: number;
  battery: number;
  last: Outcome[];
  achievements: string[];
  bpClaimed: number[];
  daily: { date: string; spins: number; on: number; blackout: number; claimed: string[] };
  dailyStreak: number;
  bossHp: number;
  bossesKilled: number;
  toasts: Toast[];
};

const LEGACY_KEYS = ["dtek-roulette-v2", "dtek-roulette-v1"];
const STORAGE_KEY = "dtek-rpg-v1";

function initialState(): GameState {
  return {
    kw: 300,
    xp: 0,
    resin: RESIN_MAX,
    resinAt: Date.now(),
    pity4: 0,
    pity5: 0,
    pulls: 0,
    inv: {},
    pet: null,
    spins: 0,
    off: 0,
    on: 0,
    generator: 0,
    battery: 80,
    last: [],
    achievements: [],
    bpClaimed: [],
    daily: { date: todayKey(), spins: 0, on: 0, blackout: 0, claimed: [] },
    dailyStreak: 0,
    bossHp: BOSS_MAX_HP,
    bossesKilled: 0,
    toasts: [],
  };
}

function seedFromLegacy(): Partial<GameState> | null {
  if (typeof window === "undefined") return null;
  for (const key of LEGACY_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const p = JSON.parse(raw) as Record<string, unknown>;
      if (typeof p.spins !== "number") continue;
      return {
        spins: p.spins,
        off: typeof p.off === "number" ? p.off : 0,
        on: typeof p.on === "number" ? p.on : 0,
        generator: typeof p.generator === "number" ? p.generator : 0,
        battery: typeof p.battery === "number" ? p.battery : 80,
        last: Array.isArray(p.last) ? (p.last as Outcome[]) : [],
        achievements: Array.isArray(p.achievements) ? (p.achievements as string[]) : [],
        kw: 300 + p.spins * 20,
      };
    } catch {
      continue;
    }
  }
  return null;
}

export const useGame = create<Store>()(
  persist(
    (set, get) => ({
      ...initialState(),

      pushToast: (name: string, desc: string, color?: string) => {
        const key = Date.now() + Math.random();
        set((s) => ({ toasts: [...s.toasts, { key, name, desc, color }] }));
        setTimeout(() => {
          set((s) => ({ toasts: s.toasts.filter((t) => t.key !== key) }));
        }, 4200);
      },

      regenResin: () => {
        const s = get();
        if (s.resin >= RESIN_MAX) {
          if (s.resinAt !== 0) set({ resinAt: 0 });
          return;
        }
        const elapsed = Date.now() - s.resinAt;
        const gained = Math.floor(elapsed / RESIN_REGEN_MS);
        if (gained <= 0) return;
        const next = Math.min(RESIN_MAX, s.resin + gained);
        set({ resin: next, resinAt: next >= RESIN_MAX ? 0 : s.resinAt + gained * RESIN_REGEN_MS });
      },

      spendResin: () => {
        const s = get();
        if (s.resin < 1) return false;
        set({ resin: s.resin - 1, resinAt: s.resin >= RESIN_MAX ? Date.now() : s.resinAt });
        return true;
      },

      refundResin: () => {
        set((s) => ({ resin: Math.min(RESIN_MAX, s.resin + 1), resinAt: s.resin >= RESIN_MAX ? Date.now() : s.resinAt }));
      },

      completeSpin: (outcome: Outcome, battery: number) => {
        const s = get();
        const hamster = s.pet === "hamster";
        const kwGain = KW_PER_OUTCOME[outcome] + (hamster ? 5 : 0);
        const xpGain = XP_PER_OUTCOME[outcome];
        const oldLevel = levelFromXp(s.xp);
        const nextXp = s.xp + xpGain;
        const nextLevel = levelFromXp(nextXp);

        const isOn = outcome === "on" || outcome === "blink";
        let bossHp = s.bossHp - (outcome === "generator" ? 5 : 1);
        let bossesKilled = s.bossesKilled;
        if (bossHp <= 0) {
          bossHp = BOSS_MAX_HP;
          bossesKilled += 1;
          get().pushToast("РЕЙД ЗНИЩЕНО", "Графік відключень пішов на ремонт. +500 кВт·год", "#7dd694");
        }

        const dailyDate = todayKey();
        const daily =
          s.daily.date === dailyDate
            ? {
                ...s.daily,
                spins: s.daily.spins + 1,
                on: s.daily.on + (isOn ? 1 : 0),
                blackout: s.daily.blackout + (outcome === "blackout" ? 1 : 0),
              }
            : { date: dailyDate, spins: 1, on: isOn ? 1 : 0, blackout: outcome === "blackout" ? 1 : 0, claimed: [] };

        const last = [outcome, ...s.last].slice(0, 8);
        set({
          kw: s.kw + kwGain,
          xp: nextXp,
          spins: s.spins + 1,
          off: s.off + (outcome === "off" ? 1 : 0),
          on: s.on + (isOn ? 1 : 0),
          generator: s.generator + (outcome === "generator" ? 1 : 0),
          battery,
          last,
          daily,
          bossHp,
          bossesKilled,
        });

        if (nextLevel > oldLevel) {
          get().pushToast(`Ранг ${nextLevel}`, `Новий титул: ${titleFor(nextLevel)}`);
        }
        if (bossesKilled > s.bossesKilled) {
          set((st) => ({ kw: st.kw + 500 }));
        }
        if (s.spins + 1 >= 50 && s.spins < 50 && !s.achievements.includes("philosopher")) {
          get().unlock("philosopher");
        }
      },

      applyBatteryDelta: (delta: number) => {
        set((s) => ({ battery: Math.min(100, Math.max(0, s.battery + delta)) }));
      },

      unlock: (id: string) => {
        const s = get();
        if (s.achievements.includes(id)) return;
        set({ achievements: [...s.achievements, id] });
      },

      pull: (count: number): PullResult[] => {
        const s = get();
        const cost = GACHA_COST * count;
        if (s.kw < cost) return [];
        const results: PullResult[] = [];
        let pity4 = s.pity4;
        let pity5 = s.pity5;
        const inv = { ...s.inv };
        for (let i = 0; i < count; i++) {
          pity4 += 1;
          pity5 += 1;
          let stars: number;
          if (pity5 >= 90) {
            stars = 5;
          } else if (pity4 >= 10) {
            stars = 4;
          } else {
            const roll = Math.random();
            if (roll < 0.006) stars = 5;
            else if (roll < 0.057) stars = 4;
            else if (roll < 0.4) stars = 3;
            else if (roll < 0.78) stars = 2;
            else stars = 1;
          }
          if (stars === 5) pity5 = 0;
          if (stars >= 4) pity4 = 0;
          const pool = ARTIFACTS[stars - 1];
          const artifact = pick(pool);
          inv[artifact.id] = (inv[artifact.id] ?? 0) + 1;
          results.push({ stars, artifactId: artifact.id });
          if (stars === 5 && !s.pet) {
            const pet = pick(PET);
            set({ pet: pet.id });
            get().pushToast("КОМПАНЬЙОН!", `${pet.name} приєднався: ${pet.perk}`, "#e8a317");
          }
        }
        set({
          kw: s.kw - cost,
          pity4,
          pity5,
          pulls: s.pulls + count,
          inv,
        });
        return results;
      },

      claimQuest: (id: string) => {
        const s = get();
        if (s.daily.date !== todayKey() || s.daily.claimed.includes(id)) return;
        const quest = QUESTS.find((q) => q.id === id);
        if (!quest) return;
        const progress = id === "spins" ? s.daily.spins : id === "on" ? s.daily.on : s.daily.blackout;
        if (progress < quest.target) return;
        set({
          kw: s.kw + quest.reward,
          daily: { ...s.daily, claimed: [...s.daily.claimed, id] },
        });
        get().pushToast("Квест виконано", `${quest.title}: +${quest.reward} кВт·год`, "#7dd694");
      },

      claimBp: (tier: number) => {
        const s = get();
        if (s.bpClaimed.includes(tier)) return;
        const unlocked = Math.floor(s.spins / BP_TIER_SPINS);
        if (tier > Math.min(unlocked, BP_MAX_TIER)) return;
        const reward = 50 + 25 * tier;
        set({ kw: s.kw + reward, bpClaimed: [...s.bpClaimed, tier] });
        get().pushToast(`Бойовий пропуск: рівень ${tier}`, `+${reward} кВт·год`, "#a99cee");
      },

      claimDaily: () => {
        const s = get();
        const date = todayKey();
        if (s.daily.date === date) return null;
        const streak = s.dailyStreak + 1;
        const reward = 100 + Math.min(4, streak) * 25;
        set({
          kw: s.kw + reward,
          daily: { date, spins: 0, on: 0, blackout: 0, claimed: [] },
          dailyStreak: streak,
          resin: Math.min(RESIN_MAX, s.resin + 2),
        });
        return { reward, streak };
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (s) => {
        const { toasts: _toasts, ...rest } = s;
        void _toasts;
        return rest as DataState;
      },
    },
  ),
);

export function migrateLegacy(): void {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(STORAGE_KEY)) return;
  const seed = seedFromLegacy();
  if (seed) useGame.setState(seed);
}

export function eventChance(pet: string | null): number {
  return pet === "dove" ? 0.6 : 0.45;
}

export function batteryDrain(base: number, pet: string | null): number {
  return pet === "cat" ? Math.round(base / 2) : base;
}
