alter table leaderboard_players add column if not exists token_hash text;
alter table leaderboard_players add column if not exists xp integer not null default 0;
alter table leaderboard_players add column if not exists gems integer not null default 1600;
alter table leaderboard_players add column if not exists shards integer not null default 0;
alter table leaderboard_players add column if not exists tickets integer not null default 0;
alter table leaderboard_players add column if not exists pity5 integer not null default 0;
alter table leaderboard_players add column if not exists pity4 integer not null default 0;
alter table leaderboard_players add column if not exists guaranteed boolean not null default false;
alter table leaderboard_players add column if not exists copies jsonb not null default '{}'::jsonb;
alter table leaderboard_players add column if not exists loadout jsonb not null default '[]'::jsonb;
alter table leaderboard_players add column if not exists best5 text;
alter table leaderboard_players add column if not exists best5_pity integer not null default 0;
alter table leaderboard_players add column if not exists lost_5050_count integer not null default 0;
alter table leaderboard_players add column if not exists boost_spins integer not null default 0;
alter table leaderboard_players add column if not exists spin_event_kind text;
alter table leaderboard_players add column if not exists spin_event_left integer not null default 0;
alter table leaderboard_players add column if not exists in_blackout boolean not null default false;
alter table leaderboard_players add column if not exists last_spin_at timestamptz;
alter table leaderboard_players add column if not exists last_aid_at timestamptz;
alter table leaderboard_players add column if not exists rook_ready_at timestamptz;
alter table leaderboard_players add column if not exists seq integer not null default 0;
alter table leaderboard_players add column if not exists flags integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leaderboard_players_stats_chk'
  ) then
    alter table leaderboard_players
      add constraint leaderboard_players_stats_chk
      check (
        spins >= 0
        and xp >= 0
        and level >= 1
        and level <= 10
        and fives >= 0
        and pulls >= 0
        and fives <= pulls
        and gems >= 0
        and shards >= 0
        and tickets >= 0
        and pity5 >= 0
        and pity5 <= 90
        and pity4 >= 0
        and pity4 <= 10
        and best5_pity >= 0
        and lost_5050_count >= 0
        and boost_spins >= 0
        and spin_event_left >= 0
        and seq >= 0
        and flags >= 0
      ) not valid;
  end if;
end $$;

create table if not exists anticheat_log (
  id bigserial primary key,
  player_id text,
  reason text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists anticheat_log_player_idx on anticheat_log (player_id, created_at desc);
