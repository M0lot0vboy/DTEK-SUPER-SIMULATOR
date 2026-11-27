// Bump SEASON for a full local-progress reset. Each persisted store calls
// ensureSeasonReset() before creation so this cannot be removed as a side effect.
export const SEASON = 3;

const SEASON_KEY = "dtek-season";

export function ensureSeasonReset(): void {
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
    if (doomed.length > 0) window.localStorage.setItem("dtek-reset-reload", "1");
  } catch {
    // Storage unavailable (private mode etc.) — nothing persisted to wipe.
  }
}
