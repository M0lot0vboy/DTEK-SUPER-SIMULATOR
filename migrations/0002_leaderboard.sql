create table if not exists leaderboard_players (
  id text primary key,
  name text not null,
  spins integer not null default 0,
  level integer not null default 1,
  fives integer not null default 0,
  pulls integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists leaderboard_players_spins_idx on leaderboard_players (spins desc);
