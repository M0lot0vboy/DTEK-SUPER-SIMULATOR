import { createServerFn } from "@tanstack/react-start";
import { SEASON } from "@/lib/game/season";

export const getSeason = createServerFn({ method: "GET" }).handler(async () => SEASON);

export type LeaderRow = {
  id: string;
  name: string;
  spins: number;
  level: number;
  fives: number;
  pulls: number;
  updatedAt: string;
};

export type ScoreInput = {
  id: string;
  name: string;
  spins: number;
  level: number;
  fives: number;
  pulls: number;
};

const ID_RE = /^[a-zA-Z0-9-]{8,64}$/;
const MAX_STAT = 10_000_000;

function cleanInt(value: unknown, max = MAX_STAT): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
}

export function cleanName(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20);
}

function validateScore(data: unknown): ScoreInput {
  const d = (data ?? {}) as Record<string, unknown>;
  if (Number(d.season) !== SEASON) throw new Error("Outdated season — reload the game");
  const id = String(d.id ?? "");
  if (!ID_RE.test(id)) throw new Error("Invalid player id");
  const name = cleanName(d.name);
  if (name.length < 2) throw new Error("Name must be at least 2 characters");
  return {
    id,
    name,
    spins: cleanInt(d.spins),
    level: Math.max(1, cleanInt(d.level, 100)),
    fives: cleanInt(d.fives, 100_000),
    pulls: cleanInt(d.pulls),
  };
}

export const submitScore = createServerFn({ method: "POST" })
  .inputValidator(validateScore)
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    // Within a season stats only move up, so a stale tab can't wipe a newer score.
    // A row from an older season is overwritten outright.
    await sql`
      insert into leaderboard_players (id, name, spins, level, fives, pulls, season, updated_at)
      values (${data.id}, ${data.name}, ${data.spins}, ${data.level}, ${data.fives}, ${data.pulls}, ${SEASON}, now())
      on conflict (id) do update set
        name = excluded.name,
        spins = case when leaderboard_players.season = excluded.season
          then greatest(leaderboard_players.spins, excluded.spins) else excluded.spins end,
        level = case when leaderboard_players.season = excluded.season
          then greatest(leaderboard_players.level, excluded.level) else excluded.level end,
        fives = case when leaderboard_players.season = excluded.season
          then greatest(leaderboard_players.fives, excluded.fives) else excluded.fives end,
        pulls = case when leaderboard_players.season = excluded.season
          then greatest(leaderboard_players.pulls, excluded.pulls) else excluded.pulls end,
        season = excluded.season,
        updated_at = now()
    `;
    return { ok: true };
  });

export const getLeaderboard = createServerFn({ method: "GET" }).handler(async (): Promise<LeaderRow[]> => {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    name: string;
    spins: number;
    level: number;
    fives: number;
    pulls: number;
    updated_at: Date | string;
  }>`
    select id, name, spins, level, fives, pulls, updated_at
    from leaderboard_players
    where season = ${SEASON}
    order by spins desc, fives desc, updated_at asc
    limit 50
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    spins: Number(r.spins),
    level: Number(r.level),
    fives: Number(r.fives),
    pulls: Number(r.pulls),
    updatedAt: new Date(r.updated_at).toISOString(),
  }));
});
