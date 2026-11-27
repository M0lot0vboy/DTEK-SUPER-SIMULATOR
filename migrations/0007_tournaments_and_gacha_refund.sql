alter table leaderboard_players add column if not exists legacy_gacha_refunded boolean not null default false;
alter table leaderboard_players add column if not exists legacy_refund_gems integer not null default 0;
alter table leaderboard_players add column if not exists legacy_refund_tickets integer not null default 0;
alter table leaderboard_players add column if not exists quests_claimed jsonb not null default '[]'::jsonb;
alter table leaderboard_players add column if not exists custom_items jsonb not null default '[]'::jsonb;
alter table leaderboard_players add column if not exists equipped_relics jsonb not null default '[]'::jsonb;

create table if not exists tournaments (
  id bigserial primary key,
  title text not null,
  description text not null default '',
  currency_name text not null default 'кВт·LOL',
  status text not null check (status in ('active', 'finished', 'cancelled')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  finished_at timestamptz,
  starting_charges integer not null check (starting_charges between 3 and 50),
  max_charges integer not null check (max_charges between 3 and 50),
  regen_minutes integer not null check (regen_minutes between 0 and 1440),
  reward_top1 jsonb not null,
  reward_top2 jsonb not null,
  winners jsonb not null default '[]'::jsonb,
  created_by text not null default 'admin',
  created_at timestamptz not null default now()
);

create unique index if not exists tournaments_one_active_uniq
  on tournaments (status)
  where status = 'active';

create index if not exists tournaments_status_idx on tournaments (status, ends_at desc);

create table if not exists tournament_entries (
  tournament_id bigint not null references tournaments (id) on delete cascade,
  player_id text not null references leaderboard_players (id) on delete cascade,
  username text not null,
  player_name text not null,
  banked_score integer not null default 0 check (banked_score >= 0),
  unbanked_pot integer not null default 0 check (unbanked_pot >= 0),
  multiplier_bps integer not null default 10000 check (multiplier_bps >= 10000 and multiplier_bps <= 50000),
  overload_pct integer not null default 0 check (overload_pct >= 0 and overload_pct <= 95),
  streak integer not null default 0 check (streak >= 0),
  shielded boolean not null default false,
  charges integer not null default 0 check (charges >= 0),
  charges_updated_at timestamptz not null default now(),
  spins_used integer not null default 0 check (spins_used >= 0),
  peak_pot integer not null default 0 check (peak_pot >= 0),
  blackouts_hit integer not null default 0 check (blackouts_hit >= 0),
  last_slice text,
  last_note text,
  last_action_at timestamptz not null default now(),
  last_score_at timestamptz not null default now(),
  entry_seq integer not null default 0 check (entry_seq >= 0),
  entry_ip_hash text,
  entry_device_hash text,
  disqualified boolean not null default false,
  disqualified_reason text,
  primary key (tournament_id, player_id)
);

create unique index if not exists tournament_entries_device_uniq
  on tournament_entries (tournament_id, entry_device_hash)
  where disqualified = false and entry_device_hash is not null;

create unique index if not exists tournament_entries_ip_uniq
  on tournament_entries (tournament_id, entry_ip_hash)
  where disqualified = false and entry_ip_hash is not null;

create index if not exists tournament_entries_rank_idx
  on tournament_entries (tournament_id, disqualified, banked_score desc, peak_pot desc, last_score_at asc);
