import { SEASON } from "@/lib/game/season";
import { useEffect, useRef } from "react";
import useSWR from "swr";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { mutate } from "swr";
import { useGame } from "@/lib/game/store";
import { useGacha } from "@/lib/gacha/engine";
import { UNIT_BY_ID } from "@/lib/gacha/pool";
import { levelFromXp } from "@/lib/game/data";
import { getSeason, submitScore } from "@/lib/leaderboard";

// When the server moves to a newer season, reload so the new bundle wipes local progress.
export function useSeasonGuard(): void {
  const { data } = useSWR("season", () => getSeason(), { refreshInterval: 30_000 });
  useEffect(() => {
    if (typeof data === "number" && data > SEASON) window.location.reload();
  }, [data]);
}

type PlayerStore = {
  id: string;
  name: string;
  setName: (name: string) => void;
};

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const usePlayer = create<PlayerStore>()(
  persist(
    (set) => ({
      id: newId(),
      name: "",
      setName: (name) => set({ name }),
    }),
    { name: "dtek-player-v1" },
  ),
);

export const LEADERBOARD_KEY = "leaderboard";

export function countFives(copies: Record<string, number>): number {
  let total = 0;
  for (const [id, n] of Object.entries(copies)) {
    if (UNIT_BY_ID[id]?.rarity === 5) total += n;
  }
  return total;
}

export function useLeaderboardSync(ready: boolean): void {
  const name = usePlayer((s) => s.name);
  const id = usePlayer((s) => s.id);
  const spins = useGame((s) => s.spins);
  const xp = useGame((s) => s.xp);
  const copies = useGacha((s) => s.copies);
  const pulls = useGacha((s) => s.totalPulls);
  const lastSent = useRef("");

  useEffect(() => {
    if (!ready || name.length < 2) return;
    const payload = { season: SEASON, id, name, spins, level: levelFromXp(xp), fives: countFives(copies), pulls };
    const key = JSON.stringify(payload);
    if (key === lastSent.current) return;
    const timer = window.setTimeout(() => {
      lastSent.current = key;
      submitScore({ data: payload })
        .then(() => mutate(LEADERBOARD_KEY))
        .catch(() => {
          lastSent.current = "";
        });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [ready, id, name, spins, xp, copies, pulls]);
}
