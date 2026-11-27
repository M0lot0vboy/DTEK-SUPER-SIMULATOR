alter table leaderboard_players add column if not exists ip_hash text;
alter table leaderboard_players add column if not exists ip_hint text;
alter table leaderboard_players add column if not exists chrome_fp text;
alter table leaderboard_players add column if not exists pc_fp text;
alter table leaderboard_players add column if not exists user_agent text;
alter table leaderboard_players add column if not exists last_reset_at timestamptz;

create table if not exists admin_sessions (
  token_hash text primary key,
  username text not null,
  ip_hash text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists admin_sessions_expires_idx on admin_sessions (expires_at);

create table if not exists admin_login_attempts (
  ip_hash text primary key,
  attempts integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists player_bans (
  id bigserial primary key,
  ban_type text not null check (ban_type in ('ip', 'chrome', 'pc')),
  ban_value text not null,
  player_id text,
  player_name text,
  reason text not null default '',
  banned_by text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists player_bans_active_uniq
  on player_bans (ban_type, ban_value)
  where active = true;

create index if not exists player_bans_lookup_idx on player_bans (ban_type, ban_value, active);
create index if not exists player_bans_player_idx on player_bans (player_id, active);

create table if not exists admin_audit_log (
  id bigserial primary key,
  admin_user text not null,
  action text not null,
  target_player_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx on admin_audit_log (created_at desc);
