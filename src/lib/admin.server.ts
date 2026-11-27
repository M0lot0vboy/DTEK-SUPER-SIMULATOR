import {
  createHash,
  createHmac,
  pbkdf2Sync,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import type { Sql } from "./db.ts";
import { publicPlayerId } from "./crypto-hash.ts";
import {
  ID_RE,
  hashIp,
  normalizeIp,
  snapshotFromRow,
  type BanType,
  type DbPlayerRow,
} from "./anticheat.server.ts";
import { PULL_COST, computeBuffs, type Buffs, type CustomRelic } from "./gacha/rules.ts";
import { titleFor, xpForLevel } from "./game/data.ts";
import { SEASON } from "./game/season.ts";
import {
  cancelAdminTournament,
  createAdminTournament,
  disqualifyAdminTournamentEntry,
  finishAdminTournament,
  getAdminTournamentOverview,
} from "./tournament.server.ts";
import type { AdminTournamentOverview } from "./tournament.ts";

export {
  cancelAdminTournament,
  createAdminTournament,
  disqualifyAdminTournamentEntry,
  finishAdminTournament,
};
export type { AdminTournamentOverview };

export const ADMIN_COOKIE_NAME = "dtek_admin_session";
export const ADMIN_SESSION_MAX_AGE = 12 * 60 * 60; // 12 hours
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const ONLINE_WINDOW_MS = 5 * 60 * 1000;
const HASH_PREFIX = "dtek-fbi-v1";

const SCRYPT_PARAMS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const PBKDF2_ITERS = 210_000;

const runtimePasswordHashCache = new Map<string, string>();

export type AdminConfigStatus = {
  configured: boolean;
  mode: "hash" | "password" | "none";
};

export type AdminBanRecord = {
  id: number;
  banType: BanType;
  banValueShort: string;
  isTelemetryExact: boolean;
  playerId: string | null;
  playerName: string | null;
  reason: string;
  bannedBy: string;
  active: boolean;
  createdAt: string;
};

export type AdminPlayerSummary = {
  id: string;
  publicId: string;
  name: string;
  accountUsername: string | null;
  spins: number;
  xp: number;
  level: number;
  fives: number;
  pulls: number;
  gems: number;
  shards: number;
  tickets: number;
  flags: number;
  inBlackout: boolean;
  verified: boolean;
  ipHint: string | null;
  hasIp: boolean;
  hasChromeFp: boolean;
  hasPcFp: boolean;
  chromeFpShort: string | null;
  pcFpShort: string | null;
  userAgent: string | null;
  lastResetAt: number;
  updatedAt: string;
  online: boolean;
  activeBanTypes: BanType[];
};

export type AdminViolationRecord = {
  id: number;
  playerId: string | null;
  playerName: string | null;
  reason: string;
  detail: string;
  createdAt: string;
};

export type AdminAuditRecord = {
  id: number;
  adminUser: string;
  action: string;
  targetPlayerId: string | null;
  detail: string;
  createdAt: string;
};

function formatDetail(raw: unknown): string {
  if (typeof raw === "string") return raw;
  try {
    return JSON.stringify(raw ?? {});
  } catch {
    return "{}";
  }
}

export type AdminDashboardData = {
  adminUser: string;
  summary: {
    totalPlayers: number;
    activeOnline5m: number;
    bannedPlayers: number;
    totalFlags: number;
    totalSpins: number;
  };
  players: AdminPlayerSummary[];
  bans: AdminBanRecord[];
  anticheatLogs: AdminViolationRecord[];
  auditLogs: AdminAuditRecord[];
  tournament: AdminTournamentOverview;
};

export type AdminSpectateData = {
  id: string;
  publicId: string;
  name: string;
  accountUsername: string | null;
  season: number;
  verified: boolean;
  online: boolean;
  flags: number;
  title: string;
  xpForNextLevel: number;
  spins: number;
  xp: number;
  level: number;
  fives: number;
  pulls: number;
  gems: number;
  shards: number;
  tickets: number;
  pity5: number;
  pity4: number;
  guaranteed: boolean;
  copies: Record<string, number>;
  loadout: string[];
  customItems: CustomRelic[];
  equippedRelics: string[];
  legacyGachaRefunded: boolean;
  legacyRefundGems: number;
  legacyRefundTickets: number;
  buffs: Buffs;
  best5: string | null;
  best5Pity: number;
  lost5050Count: number;
  boostSpins: number;
  spinEvent: { kind: string; left: number } | null;
  inBlackout: boolean;
  aidAt: number;
  rookReadyAt: number;
  seq: number;
  lastResetAt: number;
  lastSpinAt: number;
  updatedAt: string;
  ipHint: string | null;
  hasIp: boolean;
  ipHashShort: string | null;
  chromeFp: string | null;
  pcFp: string | null;
  userAgent: string | null;
  activeBans: AdminBanRecord[];
  violations: AdminViolationRecord[];
};

function getEnvAdminUser(): string {
  return String(process.env.ADMIN_USER ?? "").trim();
}

function getEnvAdminHash(): string {
  return String(process.env.ADMIN_PASSWORD_HASH ?? "").trim();
}

function getEnvAdminPlain(): string {
  return String(process.env.ADMIN_PASSWORD ?? "");
}

export function getAdminConfigStatus(): AdminConfigStatus {
  const user = getEnvAdminUser();
  const hash = getEnvAdminHash();
  const plain = getEnvAdminPlain();
  if (!user || (!hash && !plain)) {
    return { configured: false, mode: "none" };
  }
  return { configured: true, mode: hash ? "hash" : "password" };
}

function getAdminSessionSecret(): string {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    process.env.BETTER_AUTH_SECRET ||
    getEnvAdminHash() ||
    getEnvAdminPlain() ||
    process.env.DATABASE_URL ||
    "dtek-local-admin-session-secret"
  );
}

/**
 * 3-stage password key derivation:
 * 1) scrypt (N=32768, r=8, p=1) with salt
 * 2) PBKDF2-HMAC-SHA512 (210,000 iterations) bound to salt + normalized username
 * 3) HMAC-SHA512 peppered with username context
 */
export function deriveMultiLayerHash(password: string, username: string, saltHex: string): string {
  const normPass = password.normalize("NFKC");
  const normUser = username.trim().normalize("NFKC");
  const stage1 = scryptSync(normPass, Buffer.from(`dtek-scrypt:${saltHex}`, "utf8"), 64, SCRYPT_PARAMS);
  const stage2 = pbkdf2Sync(
    stage1,
    Buffer.from(`dtek-pbkdf2:${saltHex}:${normUser}`, "utf8"),
    PBKDF2_ITERS,
    64,
    "sha512",
  );
  return createHmac("sha512", Buffer.from(`dtek-hmac-pepper-v1:${normUser}`, "utf8"))
    .update(stage2)
    .digest("hex");
}

export function formatAdminPasswordHash(password: string, username: string): string {
  const saltHex = randomBytes(16).toString("hex");
  const digestHex = deriveMultiLayerHash(password, username, saltHex);
  return `${HASH_PREFIX}$${saltHex}$${digestHex}`;
}

function timingSafeHexOrTextEqual(aStr: string, bStr: string): boolean {
  const aHash = createHash("sha256").update(aStr).digest();
  const bHash = createHash("sha256").update(bStr).digest();
  const digestMatch = timingSafeEqual(aHash, bHash);
  const aBuf = Buffer.from(aStr, "utf8");
  const bBuf = Buffer.from(bStr, "utf8");
  return digestMatch && aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}

function getExpectedEncodedHash(envUser: string): string | null {
  const envHash = getEnvAdminHash();
  if (envHash) return envHash;
  const envPlain = getEnvAdminPlain();
  if (!envPlain) return null;

  const cacheKey = `${envUser}\0${envPlain}`;
  const cached = runtimePasswordHashCache.get(cacheKey);
  if (cached) return cached;

  const deterministicSalt = createHash("sha256")
    .update(`dtek-runtime-admin-salt-v1:${envUser}`)
    .digest("hex")
    .slice(0, 32);
  const encoded = `${HASH_PREFIX}$${deterministicSalt}$${deriveMultiLayerHash(envPlain, envUser, deterministicSalt)}`;
  runtimePasswordHashCache.clear();
  runtimePasswordHashCache.set(cacheKey, encoded);
  return encoded;
}

export function verifyAdminCredentials(usernameInput: string, passwordInput: string): boolean {
  const envUser = getEnvAdminUser();
  if (!envUser) return false;

  const encoded = getExpectedEncodedHash(envUser);
  if (!encoded) return false;

  const parts = encoded.split("$");
  const validFormat =
    parts.length === 3 &&
    parts[0] === HASH_PREFIX &&
    /^[a-f0-9]{16,64}$/i.test(parts[1] ?? "") &&
    /^[a-f0-9]{128}$/i.test(parts[2] ?? "");

  const saltHex = validFormat ? parts[1]! : "00000000000000000000000000000000";
  const expectedDigest = validFormat ? parts[2]!.toLowerCase() : "0".repeat(128);

  const normInputUser = String(usernameInput ?? "").trim().normalize("NFKC");
  const normEnvUser = envUser.normalize("NFKC");
  const userMatches = timingSafeHexOrTextEqual(normInputUser, normEnvUser);

  // Always compute against the target username so timing does not leak username validity.
  const computedDigest = deriveMultiLayerHash(String(passwordInput ?? ""), normEnvUser, saltHex).toLowerCase();
  const passMatches = timingSafeHexOrTextEqual(computedDigest, expectedDigest);

  return validFormat && userMatches && passMatches;
}

export function signAdminCookieToken(rawTokenHex: string): string {
  const sig = createHmac("sha256", getAdminSessionSecret())
    .update(`dtek-admin-cookie-v1:${rawTokenHex}`)
    .digest("hex");
  return `${rawTokenHex}.${sig}`;
}

export function verifyAdminCookieSignature(cookieVal?: string | null): string | null {
  if (!cookieVal || typeof cookieVal !== "string") return null;
  const dot = cookieVal.indexOf(".");
  if (dot <= 0 || dot >= cookieVal.length - 1) return null;
  const tokenHex = cookieVal.slice(0, dot);
  const sigHex = cookieVal.slice(dot + 1);
  if (!/^[a-f0-9]{64}$/i.test(tokenHex) || !/^[a-f0-9]{64}$/i.test(sigHex)) return null;
  const expected = createHmac("sha256", getAdminSessionSecret())
    .update(`dtek-admin-cookie-v1:${tokenHex}`)
    .digest("hex");
  if (!timingSafeHexOrTextEqual(sigHex.toLowerCase(), expected.toLowerCase())) return null;
  return tokenHex.toLowerCase();
}

function hashSessionToken(rawTokenHex: string): string {
  return createHash("sha256").update(`dtek-admin-session-v1:${rawTokenHex}`).digest("hex");
}

async function logAdminAudit(
  sql: Sql,
  adminUser: string,
  action: string,
  targetPlayerId: string | null,
  detail: Record<string, unknown> = {},
): Promise<void> {
  try {
    await sql`
      insert into admin_audit_log (admin_user, action, target_player_id, detail)
      values (${adminUser}, ${action}, ${targetPlayerId}, ${JSON.stringify(detail)}::jsonb)
    `;
  } catch {
    // Audit insert should never break primary action error semantics.
  }
}

export async function loginAdmin(
  sql: Sql,
  input: { username: string; password: string; ip?: string | null },
): Promise<{ ok: true; adminUser: string; signedCookie: string } | { ok: false; error: string }> {
  const cfg = getAdminConfigStatus();
  if (!cfg.configured) {
    return {
      ok: false,
      error: "Адмін-панель не налаштована на сервері (задай ADMIN_USER та ADMIN_PASSWORD або ADMIN_PASSWORD_HASH у змінних середовища).",
    };
  }

  const normIp = normalizeIp(input.ip) ?? "unknown";
  const ipHash = hashIp(`admin-login:${normIp}`);

  const attemptRows = await sql<{ attempts: number; locked_until: Date | string | null }>`
    select attempts, locked_until
    from admin_login_attempts
    where ip_hash = ${ipHash}
    limit 1
  `;
  const existingAttempt = attemptRows[0];
  if (existingAttempt?.locked_until) {
    const remainingMs = new Date(existingAttempt.locked_until).getTime() - Date.now();
    if (remainingMs > 0) {
      const mins = Math.max(1, Math.ceil(remainingMs / 60_000));
      return {
        ok: false,
        error: `Забагато невдалих спроб входу. Повторна спроба через ${mins} хв.`,
      };
    }
  }

  const ok = verifyAdminCredentials(input.username, input.password);
  if (!ok) {
    const nextRows = await sql<{ attempts: number; locked_until: Date | string | null }>`
      insert into admin_login_attempts (ip_hash, attempts, locked_until, updated_at)
      values (${ipHash}, 1, null, now())
      on conflict (ip_hash) do update set
        attempts = case
          when admin_login_attempts.updated_at < now() - (${LOCKOUT_MS}::double precision * interval '1 millisecond')
            then 1
          else admin_login_attempts.attempts + 1
        end,
        locked_until = case
          when (
            case
              when admin_login_attempts.updated_at < now() - (${LOCKOUT_MS}::double precision * interval '1 millisecond')
                then 1
              else admin_login_attempts.attempts + 1
            end
          ) >= ${MAX_LOGIN_ATTEMPTS}
            then now() + (${LOCKOUT_MS}::double precision * interval '1 millisecond')
          else null
        end,
        updated_at = now()
      returning attempts, locked_until
    `;
    const attemptsNow = Number(nextRows[0]?.attempts ?? 1);
    await logAdminAudit(sql, String(input.username ?? "").trim().slice(0, 64) || "unknown", "login_failed", null, {
      attempts: attemptsNow,
    });
    if (nextRows[0]?.locked_until && new Date(nextRows[0].locked_until).getTime() > Date.now()) {
      return {
        ok: false,
        error: "Перевищено ліміт спроб (5). Доступ тимчасово заблоковано на 15 хв.",
      };
    }
    return {
      ok: false,
      error: `Невірний логін або пароль (спроба ${attemptsNow}/${MAX_LOGIN_ATTEMPTS}).`,
    };
  }

  await sql`delete from admin_login_attempts where ip_hash = ${ipHash}`;
  await sql`delete from admin_sessions where expires_at <= now()`;

  const rawTokenHex = randomBytes(32).toString("hex");
  const tokenHash = hashSessionToken(rawTokenHex);
  const adminUser = getEnvAdminUser();
  await sql`
    insert into admin_sessions (token_hash, username, ip_hash, expires_at)
    values (
      ${tokenHash},
      ${adminUser},
      ${ipHash},
      now() + (${ADMIN_SESSION_MAX_AGE}::double precision * interval '1 second')
    )
  `;

  await logAdminAudit(sql, adminUser, "login_ok", null, {});
  return {
    ok: true,
    adminUser,
    signedCookie: signAdminCookieToken(rawTokenHex),
  };
}

export async function authenticateAdminSession(sql: Sql, cookieVal?: string | null): Promise<string | null> {
  const cfg = getAdminConfigStatus();
  if (!cfg.configured) return null;

  const rawTokenHex = verifyAdminCookieSignature(cookieVal);
  if (!rawTokenHex) return null;

  const tokenHash = hashSessionToken(rawTokenHex);
  const rows = await sql<{ token_hash: string; username: string }>`
    select token_hash, username
    from admin_sessions
    where token_hash = ${tokenHash}
      and expires_at > now()
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;

  const envUser = getEnvAdminUser();
  if (!timingSafeHexOrTextEqual(row.username.normalize("NFKC"), envUser.normalize("NFKC"))) {
    return null;
  }
  return row.username;
}

export async function requireAdminSession(sql: Sql, cookieVal?: string | null): Promise<string> {
  const user = await authenticateAdminSession(sql, cookieVal);
  if (!user) throw new Error("ADMIN_UNAUTHORIZED");
  return user;
}

export async function logoutAdminSession(sql: Sql, cookieVal?: string | null): Promise<void> {
  const rawTokenHex = verifyAdminCookieSignature(cookieVal);
  if (!rawTokenHex) return;
  const tokenHash = hashSessionToken(rawTokenHex);
  const deleted = await sql<{ username: string }>`
    delete from admin_sessions
    where token_hash = ${tokenHash}
    returning username
  `;
  if (deleted[0]) {
    await logAdminAudit(sql, deleted[0].username, "logout", null, {});
  }
}

function mapBanRow(row: {
  id: number | string;
  ban_type: BanType;
  ban_value: string;
  player_id: string | null;
  player_name: string | null;
  reason: string;
  banned_by: string;
  active: boolean;
  created_at: Date | string;
}): AdminBanRecord {
  const val = String(row.ban_value ?? "");
  return {
    id: Number(row.id),
    banType: row.ban_type,
    banValueShort: val.startsWith("pid:") ? val : `${val.slice(0, 12)}…`,
    isTelemetryExact: !val.startsWith("pid:"),
    playerId: row.player_id ?? null,
    playerName: row.player_name ?? null,
    reason: row.reason,
    bannedBy: row.banned_by,
    active: Boolean(row.active),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function getAdminDashboard(
  sql: Sql,
  adminUser: string,
  options: { search?: string; sort?: "spins" | "flags" | "updated" | "pulls" } = {},
): Promise<AdminDashboardData> {
  const playerRows = await sql<DbPlayerRow>`
    select p.*, pa.username as account_username
    from leaderboard_players p
    left join player_accounts pa on pa.player_id = p.id
    where p.season = ${SEASON}
    order by p.updated_at desc
    limit 400
  `;

  const banRows = await sql<{
    id: number | string;
    ban_type: BanType;
    ban_value: string;
    player_id: string | null;
    player_name: string | null;
    reason: string;
    banned_by: string;
    active: boolean;
    created_at: Date | string;
  }>`
    select id, ban_type, ban_value, player_id, player_name, reason, banned_by, active, created_at
    from player_bans
    order by active desc, created_at desc
    limit 200
  `;

  const violationRows = await sql<{
    id: number | string;
    player_id: string | null;
    player_name: string | null;
    reason: string;
    detail: unknown;
    created_at: Date | string;
  }>`
    select a.id, a.player_id, p.name as player_name, a.reason, a.detail, a.created_at
    from anticheat_log a
    left join leaderboard_players p on p.id = a.player_id
    order by a.created_at desc
    limit 80
  `;

  const auditRows = await sql<{
    id: number | string;
    admin_user: string;
    action: string;
    target_player_id: string | null;
    detail: unknown;
    created_at: Date | string;
  }>`
    select id, admin_user, action, target_player_id, detail, created_at
    from admin_audit_log
    order by created_at desc
    limit 80
  `;

  const activeBans = banRows.filter((b) => Boolean(b.active));
  const now = Date.now();

  let activeOnline5m = 0;
  let totalFlags = 0;
  let totalSpins = 0;
  let bannedPlayers = 0;

  const allSummaries: AdminPlayerSummary[] = playerRows.map((row) => {
    const snap = snapshotFromRow(row);
    const updatedMs = new Date(row.updated_at).getTime();
    const online = Number.isFinite(updatedMs) && now - updatedMs <= ONLINE_WINDOW_MS;
    if (online) activeOnline5m += 1;
    const flags = Math.max(0, Number(row.flags ?? 0));
    totalFlags += flags;
    totalSpins += snap.spins;

    const matchingBanTypes = Array.from(
      new Set(
        activeBans
          .filter(
            (b) =>
              b.player_id === row.id ||
              (b.ban_type === "ip" && Boolean(row.ip_hash) && b.ban_value === row.ip_hash) ||
              (b.ban_type === "chrome" && Boolean(row.chrome_fp) && b.ban_value === row.chrome_fp) ||
              (b.ban_type === "pc" && Boolean(row.pc_fp) && b.ban_value === row.pc_fp),
          )
          .map((b) => b.ban_type),
      ),
    );
    if (matchingBanTypes.length > 0) bannedPlayers += 1;

    return {
      id: row.id,
      publicId: publicPlayerId(row.id),
      name: snap.name || "(без імені)",
      accountUsername: snap.accountUsername,
      spins: snap.spins,
      xp: snap.xp,
      level: snap.level,
      fives: snap.fives,
      pulls: snap.pulls,
      gems: snap.gems,
      shards: snap.shards,
      tickets: snap.tickets,
      flags,
      inBlackout: snap.inBlackout,
      verified: Boolean(row.token_hash),
      ipHint: row.ip_hint ?? null,
      hasIp: Boolean(row.ip_hash),
      hasChromeFp: Boolean(row.chrome_fp),
      hasPcFp: Boolean(row.pc_fp),
      chromeFpShort: row.chrome_fp ? `${row.chrome_fp.slice(0, 10)}…` : null,
      pcFpShort: row.pc_fp ? `${row.pc_fp.slice(0, 10)}…` : null,
      userAgent: row.user_agent ?? null,
      lastResetAt: snap.demonetizedAt,
      updatedAt: new Date(row.updated_at).toISOString(),
      online,
      activeBanTypes: matchingBanTypes,
    };
  });

  const q = String(options.search ?? "").trim().toLowerCase();
  const filtered = q
    ? allSummaries.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.accountUsername ?? "").toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          p.publicId.toLowerCase().includes(q) ||
          (p.ipHint ?? "").toLowerCase().includes(q) ||
          (p.chromeFpShort ?? "").toLowerCase().includes(q) ||
          (p.pcFpShort ?? "").toLowerCase().includes(q),
      )
    : allSummaries;

  const sortBy = options.sort ?? "updated";
  filtered.sort((a, b) => {
    if (sortBy === "spins") return b.spins - a.spins || b.pulls - a.pulls;
    if (sortBy === "flags") return b.flags - a.flags || b.spins - a.spins;
    if (sortBy === "pulls") return b.pulls - a.pulls || b.spins - a.spins;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const tournament = await getAdminTournamentOverview(sql);

  return {
    adminUser,
    summary: {
      totalPlayers: allSummaries.length,
      activeOnline5m,
      bannedPlayers,
      totalFlags,
      totalSpins,
    },
    players: filtered,
    bans: banRows.map(mapBanRow),
    anticheatLogs: violationRows.map((v) => ({
      id: Number(v.id),
      playerId: v.player_id ?? null,
      playerName: v.player_name ?? null,
      reason: v.reason,
      detail: formatDetail(v.detail),
      createdAt: new Date(v.created_at).toISOString(),
    })),
    auditLogs: auditRows.map((a) => ({
      id: Number(a.id),
      adminUser: a.admin_user,
      action: a.action,
      targetPlayerId: a.target_player_id ?? null,
      detail: formatDetail(a.detail),
      createdAt: new Date(a.created_at).toISOString(),
    })),
    tournament,
  };
}

export async function spectateAdminPlayer(sql: Sql, playerId: string): Promise<AdminSpectateData> {
  if (!ID_RE.test(playerId)) throw new Error("Невірний ID гравця");

  const rows = await sql<DbPlayerRow>`
    select p.*, pa.username as account_username
    from leaderboard_players p
    left join player_accounts pa on pa.player_id = p.id
    where p.id = ${playerId}
    limit 1
  `;
  const row = rows[0];
  if (!row) throw new Error("Гравця не знайдено");

  const snap = snapshotFromRow(row);
  const buffs = computeBuffs(snap.loadout, snap.copies, snap.customItems, snap.equippedRelics);
  const updatedMs = new Date(row.updated_at).getTime();
  const online = Number.isFinite(updatedMs) && Date.now() - updatedMs <= ONLINE_WINDOW_MS;

  const activeBansRows = await sql<{
    id: number | string;
    ban_type: BanType;
    ban_value: string;
    player_id: string | null;
    player_name: string | null;
    reason: string;
    banned_by: string;
    active: boolean;
    created_at: Date | string;
  }>`
    select id, ban_type, ban_value, player_id, player_name, reason, banned_by, active, created_at
    from player_bans
    where active = true
      and (
        player_id = ${row.id}
        or (ban_type = 'ip' and ${row.ip_hash ?? null}::text is not null and ban_value = ${row.ip_hash ?? null})
        or (ban_type = 'chrome' and ${row.chrome_fp ?? null}::text is not null and ban_value = ${row.chrome_fp ?? null})
        or (ban_type = 'pc' and ${row.pc_fp ?? null}::text is not null and ban_value = ${row.pc_fp ?? null})
      )
    order by created_at desc
  `;

  const violationRows = await sql<{
    id: number | string;
    player_id: string | null;
    reason: string;
    detail: unknown;
    created_at: Date | string;
  }>`
    select id, player_id, reason, detail, created_at
    from anticheat_log
    where player_id = ${row.id}
    order by created_at desc
    limit 30
  `;

  const title = titleFor(snap.level);
  return {
    id: row.id,
    publicId: publicPlayerId(row.id),
    name: snap.name || "(без імені)",
    accountUsername: snap.accountUsername,
    season: snap.season,
    verified: Boolean(row.token_hash),
    online,
    flags: Math.max(0, Number(row.flags ?? 0)),
    title,
    xpForNextLevel: xpForLevel(Math.min(10, snap.level + 1)),
    spins: snap.spins,
    xp: snap.xp,
    level: snap.level,
    fives: snap.fives,
    pulls: snap.pulls,
    gems: snap.gems,
    shards: snap.shards,
    tickets: snap.tickets,
    pity5: snap.pity5,
    pity4: snap.pity4,
    guaranteed: snap.guaranteed,
    copies: snap.copies,
    loadout: snap.loadout,
    customItems: snap.customItems,
    equippedRelics: snap.equippedRelics,
    legacyGachaRefunded: snap.legacyGachaRefunded,
    legacyRefundGems: snap.legacyRefundGems,
    legacyRefundTickets: snap.legacyRefundTickets,
    buffs,
    best5: snap.best5,
    best5Pity: snap.best5Pity,
    lost5050Count: snap.lost5050Count,
    boostSpins: snap.boostSpins,
    spinEvent: snap.spinEvent,
    inBlackout: snap.inBlackout,
    aidAt: snap.aidAt,
    rookReadyAt: snap.rookReadyAt,
    seq: snap.seq,
    lastResetAt: snap.demonetizedAt,
    lastSpinAt: row.last_spin_at ? new Date(row.last_spin_at).getTime() : 0,
    updatedAt: new Date(row.updated_at).toISOString(),
    ipHint: row.ip_hint ?? null,
    hasIp: Boolean(row.ip_hash),
    ipHashShort: row.ip_hash ? `${row.ip_hash.slice(0, 12)}…` : null,
    chromeFp: row.chrome_fp ?? null,
    pcFp: row.pc_fp ?? null,
    userAgent: row.user_agent ?? null,
    activeBans: activeBansRows.map(mapBanRow),
    violations: violationRows.map((v) => ({
      id: Number(v.id),
      playerId: v.player_id ?? null,
      playerName: snap.name || null,
      reason: v.reason,
      detail: formatDetail(v.detail),
      createdAt: new Date(v.created_at).toISOString(),
    })),
  };
}

export async function demonetizeAdminPlayer(
  sql: Sql,
  adminUser: string,
  playerId: string,
  reason = "AC Reset адміністратором",
): Promise<AdminSpectateData> {
  if (!ID_RE.test(playerId)) throw new Error("Невірний ID гравця");

  const updated = await sql<DbPlayerRow>`
    update leaderboard_players
    set
      spins = 0,
      xp = 0,
      level = 1,
      fives = 0,
      pulls = 0,
      gems = ${PULL_COST * 10},
      shards = 0,
      tickets = 0,
      pity5 = 0,
      pity4 = 0,
      guaranteed = false,
      copies = '{}'::jsonb,
      loadout = '[]'::jsonb,
      custom_items = '[]'::jsonb,
      equipped_relics = '[]'::jsonb,
      quests_claimed = '[]'::jsonb,
      best5 = null,
      best5_pity = 0,
      lost_5050_count = 0,
      boost_spins = 0,
      spin_event_kind = null,
      spin_event_left = 0,
      in_blackout = false,
      last_spin_turbo = false,
      last_spin_at = null,
      last_aid_at = null,
      rook_ready_at = null,
      seq = seq + 1,
      last_reset_at = now(),
      updated_at = now()
    where id = ${playerId}
    returning *
  `;
  if (!updated[0]) throw new Error("Гравця не знайдено");

  const cleanReason = String(reason ?? "").trim().slice(0, 200) || "AC Reset адміністратором";
  await logAdminAudit(sql, adminUser, "demonitize", playerId, { reason: cleanReason });
  return spectateAdminPlayer(sql, playerId);
}

export async function banAdminPlayer(
  sql: Sql,
  adminUser: string,
  input: { playerId: string; banTypes: BanType[]; reason?: string },
): Promise<AdminSpectateData> {
  const playerId = String(input.playerId ?? "");
  if (!ID_RE.test(playerId)) throw new Error("Невірний ID гравця");

  const types = Array.from(
    new Set(input.banTypes.filter((t): t is BanType => t === "ip" || t === "chrome" || t === "pc")),
  );
  if (types.length === 0) throw new Error("Обери хоча б один тип блокування");

  const rows = await sql<DbPlayerRow>`
    select *
    from leaderboard_players
    where id = ${playerId}
    limit 1
  `;
  const row = rows[0];
  if (!row) throw new Error("Гравця не знайдено");

  const reason =
    String(input.reason ?? "").trim().slice(0, 240) || "Блокування за рішенням адміністратора";

  const telemetryStatus: Record<string, boolean> = {};
  for (const banType of types) {
    const rawTarget =
      banType === "ip"
        ? row.ip_hash
        : banType === "chrome"
          ? row.chrome_fp
          : row.pc_fp;
    const banValue = rawTarget || `pid:${row.id}`;
    telemetryStatus[banType] = Boolean(rawTarget);

    await sql`
      insert into player_bans (ban_type, ban_value, player_id, player_name, reason, banned_by, active)
      values (${banType}, ${banValue}, ${row.id}, ${row.name ?? ""}, ${reason}, ${adminUser}, true)
      on conflict (ban_type, ban_value) where active = true do update set
        player_id = coalesce(player_bans.player_id, excluded.player_id),
        player_name = coalesce(nullif(excluded.player_name, ''), player_bans.player_name),
        reason = excluded.reason,
        banned_by = excluded.banned_by,
        created_at = now()
    `;
  }

  await logAdminAudit(sql, adminUser, "ban", row.id, {
    banTypes: types,
    reason,
    telemetryStatus,
  });

  return spectateAdminPlayer(sql, row.id);
}

export async function unbanAdminEntry(
  sql: Sql,
  adminUser: string,
  input: { banId?: number; playerId?: string },
): Promise<{ clearedCount: number }> {
  let cleared: Array<{ id: number | string; ban_type: string; player_id: string | null }> = [];
  if (typeof input.banId === "number" && Number.isInteger(input.banId) && input.banId > 0) {
    cleared = await sql<{ id: number | string; ban_type: string; player_id: string | null }>`
      update player_bans
      set active = false
      where id = ${input.banId} and active = true
      returning id, ban_type, player_id
    `;
  } else if (input.playerId && ID_RE.test(input.playerId)) {
    cleared = await sql<{ id: number | string; ban_type: string; player_id: string | null }>`
      update player_bans
      set active = false
      where player_id = ${input.playerId} and active = true
      returning id, ban_type, player_id
    `;
  } else {
    throw new Error("Вкажи banId або playerId для розблокування");
  }

  if (cleared.length > 0) {
    await logAdminAudit(sql, adminUser, "unban", cleared[0]?.player_id ?? input.playerId ?? null, {
      banIds: cleared.map((c) => Number(c.id)),
      types: cleared.map((c) => c.ban_type),
    });
  }
  return { clearedCount: cleared.length };
}
