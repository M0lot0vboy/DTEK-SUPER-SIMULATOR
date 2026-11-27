import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db.ts";
import { SEASON } from "./game/season.ts";
import {
  BAN_ERROR_PREFIX,
  checkPlayerBan,
  executeServerEquip,
  executeServerPull,
  executeServerSpin,
  fetchLeaderboard,
  initPlayerSession,
  parseBanError,
} from "./anticheat.server.ts";
import {
  authenticateAdminSession,
  banAdminPlayer,
  demonetizeAdminPlayer,
  formatAdminPasswordHash,
  getAdminConfigStatus,
  getAdminDashboard,
  loginAdmin,
  logoutAdminSession,
  requireAdminSession,
  spectateAdminPlayer,
  unbanAdminEntry,
  verifyAdminCredentials,
} from "./admin.server.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function makeSecret(ch: string): string {
  return ch.repeat(64);
}

async function createTestSql(): Promise<Sql> {
  const pg = new PGlite({
    parsers: {
      20: Number,
      1082: (v: string) => v,
      1186: (v: string) => v,
    },
  });
  await pg.waitReady;
  for (const file of [
    "0002_leaderboard.sql",
    "0003_leaderboard_season.sql",
    "0004_anticheat.sql",
    "0005_admin_and_bans.sql",
  ]) {
    await pg.exec(readFileSync(join(ROOT, "migrations", file), "utf8"));
  }
  const run = async <T>(text: string, params: unknown[]) => {
    const res = await pg.query<T>(text, params);
    return res.rows;
  };
  const sql = (async <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> => {
    let text = strings[0]!;
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run<T>(text, values);
  }) as unknown as Sql;
  sql.query = <T = Record<string, unknown>>(text: string, params: unknown[] = []) => run<T>(text, params);
  return sql;
}

const savedEnv = {
  ADMIN_USER: process.env.ADMIN_USER,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
  ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET,
};

function restoreEnv() {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe("DTEK admin panel & multi-layer ban enforcement", () => {
  let sql: Sql;

  beforeEach(async () => {
    sql = await createTestSql();
    delete process.env.ADMIN_USER;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_PASSWORD_HASH;
    process.env.ADMIN_SESSION_SECRET = "test-admin-session-secret-0123456789";
  });

  afterEach(() => {
    restoreEnv();
  });

  it("fails closed when ADMIN_USER / password env vars are unset", async () => {
    assert.deepEqual(getAdminConfigStatus(), { configured: false, mode: "none" });
    const res = await loginAdmin(sql, { username: "root", password: "any", ip: "10.0.0.1" });
    assert.equal(res.ok, false);
  });

  it("verifies 3-stage scrypt+PBKDF2+HMAC-SHA512 hash including CLI script output", () => {
    const out = execFileSync("node", ["scripts/hash-admin-password.mjs", "opsadmin", "Strong#Pass!99"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    const hashLine = out
      .split("\n")
      .find((l) => l.startsWith("ADMIN_PASSWORD_HASH="))
      ?.slice("ADMIN_PASSWORD_HASH=".length)
      .trim();
    assert.ok(hashLine && hashLine.startsWith("dtek-fbi-v1$"));

    process.env.ADMIN_USER = "opsadmin";
    process.env.ADMIN_PASSWORD_HASH = hashLine;

    assert.equal(getAdminConfigStatus().mode, "hash");
    assert.equal(verifyAdminCredentials("opsadmin", "Strong#Pass!99"), true);
    assert.equal(verifyAdminCredentials("opsadmin", "wrong-pass"), false);
    assert.equal(verifyAdminCredentials("otheradmin", "Strong#Pass!99"), false);

    // Also validate direct formatAdminPasswordHash helper + plain ADMIN_PASSWORD mode
    process.env.ADMIN_PASSWORD_HASH = formatAdminPasswordHash("PlainFallback#1", "opsadmin");
    assert.equal(verifyAdminCredentials("opsadmin", "PlainFallback#1"), true);
    delete process.env.ADMIN_PASSWORD_HASH;
    process.env.ADMIN_PASSWORD = "DirectEnvPassword#2";
    assert.equal(getAdminConfigStatus().mode, "password");
    assert.equal(verifyAdminCredentials("opsadmin", "DirectEnvPassword#2"), true);
    assert.equal(verifyAdminCredentials("opsadmin", "wrong"), false);
  });

  it("enforces brute-force lockout after 5 failed logins and manages signed session cookies", async () => {
    process.env.ADMIN_USER = "director";
    process.env.ADMIN_PASSWORD = "UltraSecret!Password1";

    for (let i = 1; i <= 5; i += 1) {
      const attempt = await loginAdmin(sql, {
        username: "director",
        password: `bad-${i}`,
        ip: "198.51.100.77",
      });
      assert.equal(attempt.ok, false);
    }

    // Attempt 6 with the CORRECT password is still locked out for that IP
    const locked = await loginAdmin(sql, {
      username: "director",
      password: "UltraSecret!Password1",
      ip: "198.51.100.77",
    });
    assert.equal(locked.ok, false);

    // A clean IP logs in normally and gets a valid HMAC session cookie
    const okLogin = await loginAdmin(sql, {
      username: "director",
      password: "UltraSecret!Password1",
      ip: "198.51.100.88",
    });
    assert.equal(okLogin.ok, true);
    if (!okLogin.ok) throw new Error("Expected login ok");

    assert.equal(await authenticateAdminSession(sql, okLogin.signedCookie), "director");
    assert.equal(await authenticateAdminSession(sql, `${okLogin.signedCookie.slice(0, -1)}f`), null);
    assert.equal(await authenticateAdminSession(sql, null), null);
    await assert.rejects(() => requireAdminSession(sql, "bad.cookie"), /ADMIN_UNAUTHORIZED/);

    await logoutAdminSession(sql, okLogin.signedCookie);
    assert.equal(await authenticateAdminSession(sql, okLogin.signedCookie), null);
  });

  it("spectates full stats and demonetizes (AC Reset) a player without leaving old progress", async () => {
    process.env.ADMIN_USER = "director";
    process.env.ADMIN_PASSWORD = "UltraSecret!Password1";

    const id = "player-spec-11111111";
    const secret = makeSecret("a");
    const telemetry = {
      ip: "203.0.113.45",
      chromeFp: "aaaa1111bbbb2222cccc3333dddd4444",
      pcFp: "1111aaaa2222bbbb3333cccc4444dddd",
      userAgent: "Mozilla/5.0 Chrome/131.0.0.0",
    };

    const s0 = await initPlayerSession(sql, { id, secret, season: SEASON, name: "Енергетик", telemetry });
    const pullRes = await executeServerPull(sql, { id, secret, season: SEASON, seq: s0.seq, count: 10, telemetry });
    const ownedId = pullRes.results[0]!.unitId;
    await executeServerEquip(sql, {
      id,
      secret,
      season: SEASON,
      seq: pullRes.state.seq,
      unitId: ownedId,
      telemetry,
    });
    await executeServerSpin(sql, {
      id,
      secret,
      season: SEASON,
      seq: pullRes.state.seq + 1,
      telemetry,
    });

    const dash = await getAdminDashboard(sql, "director", { search: "Енергетик" });
    assert.equal(dash.players.length, 1);
    assert.equal(dash.players[0]!.ipHint, "203.0.*.*");

    const specBefore = await spectateAdminPlayer(sql, id);
    assert.equal(specBefore.spins, 1);
    assert.equal(specBefore.pulls, 10);
    assert.equal(specBefore.loadout.length, 1);
    assert.ok(Object.keys(specBefore.copies).length >= 1);
    assert.equal(specBefore.chromeFp, telemetry.chromeFp);
    assert.equal(specBefore.pcFp, telemetry.pcFp);

    const specAfter = await demonetizeAdminPlayer(sql, "director", id, "Читерство на спінах");
    assert.equal(specAfter.spins, 0);
    assert.equal(specAfter.xp, 0);
    assert.equal(specAfter.level, 1);
    assert.equal(specAfter.pulls, 0);
    assert.equal(specAfter.fives, 0);
    assert.equal(specAfter.gems, 1600);
    assert.deepEqual(specAfter.copies, {});
    assert.deepEqual(specAfter.loadout, []);
    assert.ok(specAfter.lastResetAt > 0);
    assert.ok(specAfter.seq > specBefore.seq);

    // Re-syncing session exposes demonetizedAt > 0 so client wipes local RPG state
    const reSync = await initPlayerSession(sql, { id, secret, season: SEASON, telemetry });
    assert.equal(reSync.spins, 0);
    assert.ok(reSync.demonetizedAt > 0);
  });

  it("enforces Chrome ban, IP ban, PC ban separately and restores access on unban", async () => {
    const pChrome = { id: "player-chrome-11111", secret: makeSecret("b"), name: "ХромЮзер" };
    const chromeFp = "cccc1111222233334444555566667777";
    const sharedPcFp = "99998888777766665555444433332222";
    const firefoxFp = "ffff1111222233334444555566667777";

    await initPlayerSession(sql, {
      ...pChrome,
      season: SEASON,
      telemetry: { ip: "198.51.100.10", chromeFp, pcFp: sharedPcFp, userAgent: "Chrome/131" },
    });

    // 1. Issue ONLY a Chrome ban
    await banAdminPlayer(sql, "director", {
      playerId: pChrome.id,
      banTypes: ["chrome"],
      reason: "Хром бан тест",
    });

    // Public leaderboard hides banned player
    const lbDuringBan = await fetchLeaderboard(sql);
    assert.equal(lbDuringBan.some((r) => r.name === "ХромЮзер"), false);

    // Chrome Incognito (brand new playerId, no cookies) is STILL blocked by chromeFp
    const incognitoCheck = await checkPlayerBan(sql, {
      ip: "198.51.100.99",
      chromeFp,
      pcFp: sharedPcFp,
      playerId: "player-incog-9999999",
    });
    assert.equal(incognitoCheck.banned, true);
    assert.deepEqual(incognitoCheck.types, ["chrome"]);
    assert.ok(incognitoCheck.marker);

    // Signed ban marker blocks even if attacker spoofs User-Agent / chromeFp & IP
    const markerBlocked = await checkPlayerBan(sql, {
      ip: "10.9.8.7",
      chromeFp: "00000000000000000000000000000000",
      pcFp: "00000000000000000000000000000000",
      cookieBanToken: incognitoCheck.marker,
    });
    assert.equal(markerBlocked.banned, true);

    // Gameplay endpoint throws DTEK_BANNED JSON payload
    await assert.rejects(
      () =>
        executeServerSpin(sql, {
          ...pChrome,
          season: SEASON,
          seq: 0,
          telemetry: { ip: "198.51.100.10", chromeFp, pcFp: sharedPcFp },
        }),
      (err) => {
        assert.ok(err instanceof Error && err.message.startsWith(BAN_ERROR_PREFIX));
        const parsed = parseBanError(err);
        assert.equal(parsed?.banned, true);
        return true;
      },
    );

    // Firefox on the SAME PC is NOT blocked by Chrome-only ban!
    const firefoxBeforePcBan = await checkPlayerBan(sql, {
      ip: "198.51.100.55",
      chromeFp: firefoxFp,
      pcFp: sharedPcFp,
      playerId: "player-firefox-22222",
    });
    assert.equal(firefoxBeforePcBan.banned, false);

    // 2. Issue PC + IP ban on Chrome user
    await banAdminPlayer(sql, "director", {
      playerId: pChrome.id,
      banTypes: ["pc", "ip"],
      reason: "PC + IP бан",
    });

    // Now Firefox on same PC is blocked by PC FP even from a different IP!
    const firefoxAfterPcBan = await checkPlayerBan(sql, {
      ip: "203.0.113.200",
      chromeFp: firefoxFp,
      pcFp: sharedPcFp,
      playerId: "player-firefox-22222",
    });
    assert.equal(firefoxAfterPcBan.banned, true);
    assert.ok(firefoxAfterPcBan.types.includes("pc"));

    // A totally separate phone/device on the SAME IP is blocked by IP ban!
    const phoneOnSameIp = await checkPlayerBan(sql, {
      ip: "198.51.100.10",
      chromeFp: "12341234123412341234123412341234",
      pcFp: "abcdabcdabcdabcdabcdabcdabcdabcd",
      playerId: "player-phone-3333333",
    });
    assert.equal(phoneOnSameIp.banned, true);
    assert.ok(phoneOnSameIp.types.includes("ip"));

    // 3. Unban everything for pChrome -> everyone + leaderboard access immediately restored (even with stale marker!)
    const unbanRes = await unbanAdminEntry(sql, "director", { playerId: pChrome.id });
    assert.equal(unbanRes.clearedCount, 3);

    const afterUnban = await checkPlayerBan(sql, {
      ip: "198.51.100.10",
      chromeFp,
      pcFp: sharedPcFp,
      playerId: pChrome.id,
      cookieBanToken: incognitoCheck.marker,
    });
    assert.equal(afterUnban.banned, false);
    assert.equal(afterUnban.marker, null);

    const lbAfterUnban = await fetchLeaderboard(sql);
    assert.equal(lbAfterUnban.some((r) => r.name === "ХромЮзер"), true);
  });
});
