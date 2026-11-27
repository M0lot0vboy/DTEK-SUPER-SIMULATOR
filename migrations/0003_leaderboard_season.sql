alter table leaderboard_players add column if not exists season integer not null default 1;
create index if not exists leaderboard_players_season_spins_idx on leaderboard_players (season, spins desc);
