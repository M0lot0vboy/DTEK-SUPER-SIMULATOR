import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db.ts";
import { publicPlayerId, sha256Hex } from "./crypto-hash.ts";
import { SEASON } from "./game/season.ts";
import {
  cleanPlayerName,
  executeClearBlackout,
  executeServerAid,
  executeServerEquip,
  executeServerExchange,
  executeServerPull,
  executeServerRook,
  executeServerSpin,
  fetchLeaderboard,
  initPlayerSession,
  updatePlayerName,
} from "./anticheat.server.ts";

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

describe("DTEK anticheat", () => {
  let sql: Sql;

  beforeEach(async () => {
    sql = await createTestSql();
  });

  it("matches Node crypto SHA-256 and never leaks raw player IDs", () => {
    const id = "player-uuid-1234-5678";
    const expected = createHash("sha256").update(`dtek-pub:${id}`).digest("hex").slice(0, 24);
    assert.equal(sha256Hex("hello"), createHash("sha256").update("hello").digest("hex"));
    assert.equal(publicPlayerId(id), expected);
    assert.notEqual(publicPlayerId(id), id);
  });

  it("preserves existing 500+ Season 3 real players during legacy claim and locks ownership", async () => {
    const id = "real-player-500-plus";
    const secret = makeSecret("a");
    await sql`
      insert into leaderboard_players (id, name, spins, level, fives, pulls, season)
      values (${id}, ${"Oksana_Real"}, ${542}, ${10}, ${5}, ${390}, ${SEASON})
    `;

    const snap = await initPlayerSession(sql, {
      id,
      secret,
      season: SEASON,
      name: "ShouldNotRenameDuringClaim",
      legacy: {
        xp: 12400,
        gems: 960,
        shards: 42,
        tickets: 2,
        pity5: 44,
        pity4: 6,
        guaranteed: true,
        copies: { rook: 2, ecoflow: 2, starlink: 1, alien: 15, candle: 370 },
        loadout: ["rook", "ecoflow", "starlink"],
        best5: "rook",
        best5Pity: 76,
        lost5050Count: 1,
      },
    });

    assert.equal(snap.spins, 542);
    assert.equal(snap.level, 10);
    assert.equal(snap.fives, 5);
    assert.equal(snap.pulls, 390);
    assert.equal(snap.name, "Oksana_Real");
    assert.equal(snap.xp, 12400);
    assert.deepEqual(snap.loadout, ["rook", "ecoflow", "starlink"]);

    // Subsequent claim attempt with a stolen ID and wrong secret must fail.
    await assert.rejects(
      () =>
        initPlayerSession(sql, {
          id,
          secret: makeSecret("b"),
          season: SEASON,
        }),
      /Помилка перевірки сесії/,
    );

    const logs = await sql<{ reason: string }>`select reason from anticheat_log where player_id = ${id}`;
    assert.equal(logs[0]?.reason, "bad_token");
  });

  it("prevents forging 5-star copies or unbounded gems on legacy claim while trimming minor unsynced pulls", async () => {
    const id = "legacy-trim-player";
    await sql`
      insert into leaderboard_players (id, name, spins, level, fives, pulls, season)
      values (${id}, ${"Taras"}, ${510}, ${10}, ${3}, ${200}, ${SEASON})
    `;

    // Minor 10-pull client delta ahead of DB trims gracefully instead of wiping collection.
    const trimmed = await initPlayerSession(sql, {
      id,
      secret: makeSecret("c"),
      season: SEASON,
      legacy: {
        xp: 999999999,
        gems: 999999999,
        copies: { rook: 3, ecoflow: 1, candle: 204 },
        loadout: ["rook", "ecoflow"],
      },
    });
    assert.equal(trimmed.spins, 510);
    assert.equal(trimmed.fives, 3);
    assert.equal(trimmed.pulls, 200);
    assert.ok(trimmed.gems <= 100_000);
    assert.ok(trimmed.xp <= 510 * 40);

    // Blatantly forged legacy copies (> +5 fives) are wiped and logged.
    const idCheater = "legacy-cheater-1";
    await sql`
      insert into leaderboard_players (id, name, spins, level, fives, pulls, season)
      values (${idCheater}, ${"Cheater"}, ${505}, ${10}, ${1}, ${50}, ${SEASON})
    `;
    const wiped = await initPlayerSession(sql, {
      id: idCheater,
      secret: makeSecret("d"),
      season: SEASON,
      legacy: {
        copies: { rook: 50 },
      },
    });
    assert.deepEqual(wiped.copies, {});
    assert.equal(wiped.fives, 1);
    const logs = await sql<{ reason: string }>`select reason from anticheat_log where player_id = ${idCheater}`;
    assert.equal(logs[0]?.reason, "legacy_copies_tampered");
  });

  it("forces brand-new IDs to start at 0 spins, enforces DB constraints, and filters pre-migration impossible rows", async () => {
    const fresh = await initPlayerSession(sql, {
      id: "brand-new-player-1",
      secret: makeSecret("1"),
      season: SEASON,
      legacy: { xp: 99999, gems: 999999, copies: { rook: 7 } },
    });
    assert.equal(fresh.spins, 0);
    assert.equal(fresh.level, 1);
    assert.equal(fresh.gems, 1600);
    assert.deepEqual(fresh.copies, {});

    // Post-migration SQL constraint rejects direct invalid inserts (fives > pulls).
    await assert.rejects(
      () =>
        sql`
          insert into leaderboard_players (id, name, spins, level, fives, pulls, season)
          values ('bad-cheater-after', 'BadGuy', 2, 10, 50, 0, ${SEASON})
        `,
      /leaderboard_players_stats_chk/,
    );

    // Pre-migration impossible rows (from earlier incidents) do not break 0004_anticheat.sql
    // and are filtered out of the leaderboard while preserving real 500+ veterans.
    const pg = new PGlite({
      parsers: { 20: Number, 1082: (v: string) => v, 1186: (v: string) => v },
    });
    await pg.waitReady;
    await pg.exec(readFileSync(join(ROOT, "migrations", "0002_leaderboard.sql"), "utf8"));
    await pg.exec(readFileSync(join(ROOT, "migrations", "0003_leaderboard_season.sql"), "utf8"));
    await pg.query(
      `insert into leaderboard_players (id, name, spins, level, fives, pulls, season) values ($1,$2,$3,$4,$5,$6,$7), ($8,$9,$10,$11,$12,$13,$14)`,
      [
        "bad-cheater-before",
        "BadGuy",
        2,
        10,
        50,
        0,
        SEASON,
        "good-veteran-1",
        "Stepan500",
        555,
        10,
        6,
        400,
        SEASON,
      ],
    );
    await pg.exec(readFileSync(join(ROOT, "migrations", "0004_anticheat.sql"), "utf8"));
    await pg.exec(readFileSync(join(ROOT, "migrations", "0005_admin_and_bans.sql"), "utf8"));
    const legacySql = (async <T = Record<string, unknown>>(
      strings: TemplateStringsArray,
      ...values: unknown[]
    ): Promise<T[]> => {
      let text = strings[0]!;
      for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
      return (await pg.query<T>(text, values)).rows;
    }) as unknown as Sql;
    legacySql.query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      (await pg.query<T>(text, params)).rows;

    const board = await fetchLeaderboard(legacySql);
    assert.equal(board.length, 1);
    assert.equal(board[0]!.name, "Stepan500");
    assert.equal(board[0]!.publicId, publicPlayerId("good-veteran-1"));
    assert.equal(board[0]!.verified, false);
  });

  it("enforces spin cooldown, prevents parallel race spins, and enforces blackout candle lock", async () => {
    const id = "spinner-player-1";
    const secret = makeSecret("2");
    await initPlayerSession(sql, { id, secret, season: SEASON, name: "Panas" });

    // Parallel spin race: only 1 out of 5 concurrent spins at seq=0 can succeed.
    const race = await Promise.allSettled(
      Array.from({ length: 5 }, () => executeServerSpin(sql, { id, secret, season: SEASON, seq: 0 })),
    );
    const ok = race.filter((r) => r.status === "fulfilled");
    assert.equal(ok.length, 1);
    const firstSpin = (ok[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof executeServerSpin>>>).value;
    assert.equal(firstSpin.state.spins, 1);

    // Clear blackout if first spin landed on blackout so cooldown check runs cleanly.
    let currentSeq = firstSpin.state.seq;
    if (firstSpin.state.inBlackout) {
      await assert.rejects(
        () => executeServerSpin(sql, { id, secret, season: SEASON, seq: currentSeq }),
        /Спочатку запали свічку/,
      );
      await sql`update leaderboard_players set last_spin_at = now() - interval '2 seconds' where id = ${id}`;
      const cleared = await executeClearBlackout(sql, { id, secret, season: SEASON, seq: currentSeq });
      currentSeq = cleared.seq;
      await sql`update leaderboard_players set last_spin_at = now() where id = ${id}`;
    }

    // Spinning immediately without waiting cooldown must be rejected and logged.
    await assert.rejects(
      () => executeServerSpin(sql, { id, secret, season: SEASON, seq: currentSeq }),
      /Не так швидко/,
    );
    const logs = await sql<{ reason: string }>`select reason from anticheat_log where player_id = ${id}`;
    assert.ok(logs.some((l) => l.reason === "spin_too_fast"));
  });

  it("enforces server-authoritative gacha economy, concurrency, equip ownership, and cooldowns", async () => {
    const id = "gacha-player-1";
    const secret = makeSecret("3");
    const init = await initPlayerSession(sql, { id, secret, season: SEASON, name: "Kateryna" });
    assert.equal(init.gems, 1600);

    // Concurrent pull race with 1600 gems: only one x10 pull can succeed!
    const pullRace = await Promise.allSettled([
      executeServerPull(sql, { id, secret, season: SEASON, seq: 0, count: 10 }),
      executeServerPull(sql, { id, secret, season: SEASON, seq: 0, count: 10 }),
    ]);
    const pulled = pullRace.filter((r) => r.status === "fulfilled");
    assert.equal(pulled.length, 1);
    const afterPull = (pulled[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof executeServerPull>>>).value;
    assert.equal(afterPull.state.gems, 0);
    assert.equal(afterPull.state.pulls, 10);

    // Further pull with 0 gems fails.
    await assert.rejects(
      () => executeServerPull(sql, { id, secret, season: SEASON, seq: afterPull.state.seq, count: 1 }),
      /Не вистачає кВт-гемів/,
    );

    // Equipping unowned unit returns locked; invalid unit throws.
    const unowned = Object.keys(afterPull.state.copies).includes("rook") ? "outage" : "rook";
    if (!afterPull.state.copies[unowned]) {
      const equipLocked = await executeServerEquip(sql, {
        id,
        secret,
        season: SEASON,
        seq: afterPull.state.seq,
        unitId: unowned,
      });
      assert.equal(equipLocked.status, "locked");
    }

    // Emergency aid works once and enforces 3-minute cooldown.
    const afterAid = await executeServerAid(sql, { id, secret, season: SEASON, seq: afterPull.state.seq });
    assert.equal(afterAid.gems, 480);
    await assert.rejects(
      () => executeServerAid(sql, { id, secret, season: SEASON, seq: afterAid.seq }),
      /перезаряджається/,
    );

    // Rook sacrifice fails unless rook is equipped.
    if (!afterAid.loadout.includes("rook")) {
      await assert.rejects(
        () => executeServerRook(sql, { id, secret, season: SEASON, seq: afterAid.seq }),
        /додай ТУРУ/,
      );
    }

    // Shards exchange fails when shards < 14.
    if (afterAid.shards < 14) {
      await assert.rejects(
        () => executeServerExchange(sql, { id, secret, season: SEASON, seq: afterAid.seq }),
        /Мало копіуму/,
      );
    }
  });

  it("sanitizes nicknames and prevents unauthorized renames", async () => {
    assert.equal(cleanPlayerName("  \u200BОксана\u202E  "), "Оксана");
    const id = "rename-player-1";
    const secret = makeSecret("4");
    const renamed = await updatePlayerName(sql, {
      id,
      secret,
      season: SEASON,
      name: "  Київ_Тура  ",
    });
    assert.equal(renamed.name, "Київ_Тура");

    await assert.rejects(
      () => updatePlayerName(sql, { id, secret: makeSecret("5"), season: SEASON, name: "Hacked" }),
      /Помилка перевірки сесії/,
    );
  });
});
