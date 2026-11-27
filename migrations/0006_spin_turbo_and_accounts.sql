alter table leaderboard_players add column if not exists last_spin_turbo boolean not null default false;

create table if not exists player_accounts (
  username_lower text primary key,
  username text not null,
  password_hash text not null,
  player_id text not null unique references leaderboard_players (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists player_accounts_player_idx on player_accounts (player_id);

create table if not exists player_sessions (
  token_hash text primary key,
  player_id text not null references leaderboard_players (id) on delete cascade,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists player_sessions_player_idx on player_sessions (player_id);
create index if not exists player_sessions_expires_idx on player_sessions (expires_at);

create table if not exists player_login_attempts (
  ip_hash text primary key,
  attempts integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
