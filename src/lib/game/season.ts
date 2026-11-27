// Bump SEASON to wipe every player's saved progress and the leaderboard.
// This module must be imported before any persisted store is created so the
// wipe happens before zustand rehydrates from localStorage.
export const SEASON = 2;

const SEASON_KEY = "dtek-season";

function wipeIfNewSeason(): void {
  if (typeof window === "undefined") return;
  try {
    const stored = Number(window.localStorage.getItem(SEASON_KEY));
    if (stored === SEASON) return;
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith("dtek-")) doomed.push(key);
    }
    for (const key of doomed) window.localStorage.removeItem(key);
    window.localStorage.setItem(SEASON_KEY, String(SEASON));
  } catch {
    // Storage unavailable (private mode etc.) — nothing persisted to wipe.
  }
}

wipeIfNewSeason();
