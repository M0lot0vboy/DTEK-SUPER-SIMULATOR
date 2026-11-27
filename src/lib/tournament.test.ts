import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db.ts";
import { SEASON } from "./game/season.ts";
import {
  clampRelicBuff,
  computeBuffs,
  sanitizeCustomItems,
  sanitizeEquippedRelics,
} from "./gacha/rules.ts";
import {
  computeLegacyRefundPackage,
  executeClaimLegacyGachaRefund,
  executeServerClaimQuest,
  executeServerSpin,
  executeServerToggleRelic,
  fetchLeaderboard,
  initPlayerSession,
  registerPlayerAccount,
} from "./anticheat.server.ts";
import {
  cancelAdminTournament,
  createAdminTournament,
  disqualifyAdminTournamentEntry,
  executeTournamentBank,
  executeTournamentSpin,
  finishAdminTournament,
  getTournamentState,
  joinTournament,
  settleDueTournaments,
} from "./tournament.server.ts";
import { RELIC_POWER_PRESETS, computeRegeneratedCharges } from "./tournament.ts";
import { easeOutQuart } from "./wheel-anim.ts";

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
    "0006_spin_turbo_and_accounts.sql",
    "0007_tournaments_and_gacha_refund.sql",
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

describe("Tournament, Custom Isekai Relics & Legacy Gacha Refund", () => {
  let sql: Sql;

  beforeEach(async () => {
    sql = await createTestSql();
  });

  it("caps legacy gacha refund by verified server spins, blocks double claims, and excludes fresh players", async () => {
    const legacyId = "legacy-player-0001";
    const legacySecret = makeSecret("a");
    await sql`
      insert into leaderboard_players (id, name, spins, level, fives, pulls, season)
      values (${legacyId}, ${"OldMiner"}, ${40}, ${3}, ${0}, ${5}, ${SEASON})
    `;
    const legacySnap = await initPlayerSession(sql, {
      id: legacyId,
      secret: legacySecret,
      season: SEASON,
    });
    assert.equal(legacySnap.legacyGachaRefunded, false);

    // Attempt to spoof 99999 legacy pulls in localStorage: capped cleanly by 40 spins -> max 75 pulls.
    const expected = computeLegacyRefundPackage(40, 5, 99999);
    assert.equal(expected.effectivePulls, 75);

    const res1 = await executeClaimLegacyGachaRefund(sql, {
      id: legacyId,
      secret: legacySecret,
      season: SEASON,
      legacyPulls: 99999,
    });
    assert.equal(res1.refundedNow, true);
    assert.equal(res1.gemsAdded, expected.gemsAdded);
    assert.equal(res1.ticketsAdded, expected.ticketsAdded);
    assert.equal(res1.state.legacyGachaRefunded, true);

    const res2 = await executeClaimLegacyGachaRefund(sql, {
      id: legacyId,
      secret: legacySecret,
      season: SEASON,
      legacyPulls: 99999,
    });
    assert.equal(res2.refundedNow, false);
    assert.equal(res2.gemsAdded, 0);

    // New post-update player is already flagged refunded on creation.
    const freshSnap = await initPlayerSession(sql, {
      id: "fresh-player-0002",
      secret: makeSecret("b"),
      season: SEASON,
      name: "Newbie",
    });
    assert.equal(freshSnap.legacyGachaRefunded, true);
  });

  it("enforces server spin prerequisites on quests and Battle Pass gem claims", async () => {
    const id = "quest-player-0001";
    const secret = makeSecret("c");
    await initPlayerSession(sql, { id, secret, season: SEASON, name: "QuestTester" });

    await assert.rejects(
      () =>
        executeServerClaimQuest(sql, {
          id,
          secret,
          season: SEASON,
          seq: 0,
          kind: "bp",
          targetId: "1",
        }),
      /Потрібно 5 круток/,
    );

    await sql`update leaderboard_players set spins = 10 where id = ${id}`;
    const bp1 = await executeServerClaimQuest(sql, {
      id,
      secret,
      season: SEASON,
      seq: 0,
      kind: "bp",
      targetId: "1",
    });
    assert.equal(bp1.claimed, true);
    assert.equal(bp1.gemsAdded, 75);
    assert.equal(bp1.state.gems, 1675);

    const bp1Dup = await executeServerClaimQuest(sql, {
      id,
      secret,
      season: SEASON,
      seq: bp1.state.seq,
      kind: "bp",
      targetId: "1",
    });
    assert.equal(bp1Dup.claimed, false);
    assert.equal(bp1Dup.gemsAdded, 0);
  });

  it("computes drift-free charge regeneration with caps and disabled mode", () => {
    const start = 1_000_000;
    const r1 = computeRegeneratedCharges(4, start, 10, 15, start + 31 * 60_000);
    assert.equal(r1.charges, 6);
    assert.equal(r1.updatedAtMs, start + 30 * 60_000);
    assert.equal(r1.nextRegenAtMs, start + 45 * 60_000);

    const rCap = computeRegeneratedCharges(8, start, 10, 15, start + 120 * 60_000);
    assert.equal(rCap.charges, 10);
    assert.equal(rCap.nextRegenAtMs, null);

    const rFixed = computeRegeneratedCharges(5, start, 10, 0, start + 999 * 60_000);
    assert.equal(rFixed.charges, 5);
    assert.equal(rFixed.nextRegenAtMs, null);
  });

  it("enforces guest lock, 1-per-device/IP anti-alt, zero main buffs, cooldown, DQ, Top-2 custom relics & leaderboard integrity", async () => {
    // 1. Admin launches tournament with oversized buff values -> verified clamped server-side!
    const launched = await createAdminTournament(sql, "root_admin", {
      title: "Турнір Блекауту S3",
      description: "Тестовий турнір",
      durationMinutes: 60,
      startingCharges: 6,
      maxCharges: 10,
      regenMinutes: 10,
      rewardTop1: {
        name: "Золотий Генератор",
        emoji: "👑",
        lore: "Перше місце",
        buff: { gemsPct: 999, drainReductionPct: 99, onBonus: 50, refundPct: 80 },
      },
      rewardTop2: {
        name: "Срібна Батарейка",
        emoji: "🥈",
        lore: "Друге місце",
        buff: { gemsPct: 22, drainReductionPct: 12, onBonus: 4, refundPct: 8 },
      },
    });
    assert.ok(launched.active);
    assert.equal(launched.active!.rewardTop1.buff.gemsPct, 45);
    assert.equal(launched.active!.rewardTop1.buff.drainReductionPct, 25);
    assert.equal(launched.active!.rewardTop1.buff.onBonus, 10);
    assert.equal(launched.active!.rewardTop1.buff.refundPct, 20);

    // Prevent concurrent second active tournament
    await assert.rejects(
      () =>
        createAdminTournament(sql, "root_admin", {
          title: "Second",
          durationMinutes: 60,
          startingCharges: 6,
          maxCharges: 10,
          regenMinutes: 10,
        }),
      /Активний турнір вже запущено/,
    );

    // 2. Guest without account cannot join tournament
    const guestId = "guest-player-001";
    const guestSec = makeSecret("d");
    await initPlayerSession(sql, { id: guestId, secret: guestSec, season: SEASON, name: "Guest" });
    await assert.rejects(
      () =>
        joinTournament(sql, {
          id: guestId,
          secret: guestSec,
          season: SEASON,
          telemetry: { ip: "10.0.0.1", pcFp: "1111111111111111" },
        }),
      /створи акаунт або увійди/,
    );

    // 3. Brand-new 0-spin player registers an account and joins immediately
    const p1Id = "tourney-p1-0001";
    let p1Sec = makeSecret("1");
    const reg1 = await registerPlayerAccount(sql, {
      id: p1Id,
      secret: p1Sec,
      season: SEASON,
      username: "noob_champ",
      password: "Password123!",
      name: "Новачок Чемп",
      telemetry: { ip: "10.0.0.10", pcFp: "aaaa1111aaaa1111", chromeFp: "bbbb1111bbbb1111" },
    });
    p1Sec = reg1.secret;

    const p2Id = "tourney-p2-0002";
    let p2Sec = makeSecret("2");
    const reg2 = await registerPlayerAccount(sql, {
      id: p2Id,
      secret: p2Sec,
      season: SEASON,
      username: "top_whale",
      password: "Password123!",
      name: "Топ Ісекаю",
      telemetry: { ip: "10.0.0.20", pcFp: "cccc2222cccc2222", chromeFp: "dddd2222dddd2222" },
    });
    p2Sec = reg2.secret;
    // Give Top Whale main-game C6 buff stats: zero influence on tournament start!
    await sql`
      update leaderboard_players
      set spins = 900, fives = 10, pulls = 250, gems = 50000
      where id = ${p2Id}
    `;

    // Alt account sharing p1's device OR IP is blocked
    const altId = "tourney-alt-0003";
    const regAlt = await registerPlayerAccount(sql, {
      id: altId,
      secret: makeSecret("3"),
      season: SEASON,
      username: "alt_farmer",
      password: "Password123!",
      name: "Твінк",
      telemetry: { ip: "10.0.0.30", pcFp: "aaaa1111aaaa1111" },
    });

    const p1Tel = { ip: "10.0.0.10", pcFp: "aaaa1111aaaa1111", chromeFp: "bbbb1111bbbb1111" };
    const p2Tel = { ip: "10.0.0.20", pcFp: "cccc2222cccc2222", chromeFp: "dddd2222dddd2222" };

    const st1 = await joinTournament(sql, { id: p1Id, secret: p1Sec, season: SEASON, telemetry: p1Tel });
    const st2 = await joinTournament(sql, { id: p2Id, secret: p2Sec, season: SEASON, telemetry: p2Tel });
    assert.equal(st1.entry?.charges, 6);
    assert.equal(st2.entry?.charges, 6);
    assert.equal(st2.entry?.bankedScore, 0);

    // Same device fingerprint rejected
    await assert.rejects(
      () =>
        joinTournament(sql, {
          id: altId,
          secret: regAlt.secret,
          season: SEASON,
          telemetry: { ip: "10.0.0.30", pcFp: "aaaa1111aaaa1111" },
        }),
      /З цього пристрою вже бере участь/,
    );
    // Same IP with different device rejected
    await assert.rejects(
      () =>
        joinTournament(sql, {
          id: altId,
          secret: regAlt.secret,
          season: SEASON,
          telemetry: { ip: "10.0.0.10", pcFp: "eeee3333eeee3333" },
        }),
      /З цієї IP-адреси вже бере участь/,
    );

    // 4. p1 spins once -> rapid spin cooldown blocked -> banks into safe score!
    const spin1 = await executeTournamentSpin(sql, {
      id: p1Id,
      secret: p1Sec,
      season: SEASON,
      entrySeq: st1.entry!.entrySeq,
      telemetry: p1Tel,
    });
    assert.equal(spin1.outcomeKind, "hit");
    assert.ok(spin1.state.entry!.unbankedPot > 0);
    assert.equal(spin1.state.entry!.charges, 5);

    await assert.rejects(
      () =>
        executeTournamentSpin(sql, {
          id: p1Id,
          secret: p1Sec,
          season: SEASON,
          entrySeq: spin1.state.entry!.entrySeq,
          telemetry: p1Tel,
        }),
      /Не так швидко/,
    );

    const bank1 = await executeTournamentBank(sql, {
      id: p1Id,
      secret: p1Sec,
      season: SEASON,
      entrySeq: spin1.state.entry!.entrySeq,
      telemetry: p1Tel,
    });
    assert.ok(bank1.bankedAdded > 0);
    assert.equal(bank1.state.entry!.bankedScore, bank1.bankedAdded);
    assert.equal(bank1.state.entry!.unbankedPot, 0);

    // Give p2 a higher banked score, and add p3 who beats both, then DQ p3 -> p2 becomes #1, p1 becomes #2!
    const p3Id = "tourney-p3-0004";
    const reg3 = await registerPlayerAccount(sql, {
      id: p3Id,
      secret: makeSecret("4"),
      season: SEASON,
      username: "cheater_p3",
      password: "Password123!",
      name: "Чітер П3",
      telemetry: { ip: "10.0.0.40", pcFp: "ffff4444ffff4444" },
    });
    await joinTournament(sql, {
      id: p3Id,
      secret: reg3.secret,
      season: SEASON,
      telemetry: { ip: "10.0.0.40", pcFp: "ffff4444ffff4444" },
    });
    await sql`update tournament_entries set banked_score = 9000, peak_pot = 9000 where player_id = ${p3Id}`;
    await sql`update tournament_entries set banked_score = 4000, peak_pot = 4000 where player_id = ${p2Id}`;

    // Disqualify p3 -> leaderboard excludes p3, p3 cannot spin again
    await disqualifyAdminTournamentEntry(sql, "root_admin", {
      tournamentId: launched.active!.id,
      playerId: p3Id,
      reason: "Спіймано на махінаціях",
    });
    await assert.rejects(
      () =>
        executeTournamentSpin(sql, {
          id: p3Id,
          secret: reg3.secret,
          season: SEASON,
          entrySeq: 0,
        }),
      /дискваліфіковано/,
    );

    // 5. Finish tournament -> p2 gets Top 1 relic, p1 gets Top 2 relic, p3 gets nothing!
    const finished = await finishAdminTournament(sql, "root_admin", launched.active!.id);
    assert.equal(finished.active, null);
    assert.equal(finished.history[0]?.winners.length, 2);
    assert.equal(finished.history[0]?.winners[0]?.username, "top_whale");
    assert.equal(finished.history[0]?.winners[1]?.username, "noob_champ");

    // Verify Top 2 relic arrived on p1's state cleanly WITHOUT altering fives/pulls check!
    const p1After = await initPlayerSession(sql, { id: p1Id, secret: p1Sec, season: SEASON });
    assert.equal(p1After.customItems.length, 1);
    assert.equal(p1After.customItems[0]!.name, "Срібна Батарейка");
    assert.equal(p1After.fives, 0);
    assert.equal(p1After.pulls, 0);

    // Leaderboard still renders p2 & p1 cleanly
    const lb = await fetchLeaderboard(sql);
    assert.ok(lb.some((r) => r.spins === 900));

    // p1 equips custom relic and executes main wheel spin with stacked relic buffs!
    const eq = await executeServerToggleRelic(sql, {
      id: p1Id,
      secret: p1Sec,
      season: SEASON,
      seq: p1After.seq,
      relicId: p1After.customItems[0]!.id,
    });
    assert.equal(eq.status, "equipped");
    assert.deepEqual(eq.state.equippedRelics, [p1After.customItems[0]!.id]);

    const buffsWithRelic = computeBuffs([], {}, eq.state.customItems, eq.state.equippedRelics);
    assert.equal(Math.round(buffsWithRelic.gems * 100), 22);
    assert.equal(buffsWithRelic.onBonus, 4);

    const spinMain = await executeServerSpin(sql, {
      id: p1Id,
      secret: p1Sec,
      season: SEASON,
      seq: eq.state.seq,
    });
    assert.ok(spinMain.gemsGained > 0);

    // Sanitizer handles malformed data safely
    assert.equal(sanitizeCustomItems([{ id: "a", name: "Test", buff: { gemsPct: 500 } }])[0]?.buff.gemsPct, 45);
    assert.deepEqual(sanitizeEquippedRelics(["missing", "a", "a"], sanitizeCustomItems([{ id: "a", name: "Test" }])), ["a"]);

    // 6. Auto-settlement when ends_at expires + Cancel test
    const autoT = await createAdminTournament(sql, "root_admin", {
      title: "Авто-фініш тест",
      durationMinutes: 5,
      startingCharges: 5,
      maxCharges: 5,
      regenMinutes: 0,
    });
    await sql`update tournaments set ends_at = now() - interval '1 minute' where id = ${autoT.active!.id}`;
    await settleDueTournaments(sql);
    const stateAfterAuto = await getTournamentState(sql, { id: p1Id, secret: p1Sec, season: SEASON });
    assert.equal(stateAfterAuto.active, null);
    assert.equal(stateAfterAuto.past[0]?.id, autoT.active!.id);

    const cancelT = await createAdminTournament(sql, "root_admin", {
      title: "Скасований тест",
      durationMinutes: 10,
      startingCharges: 5,
      maxCharges: 5,
      regenMinutes: 0,
    });
    const afterCancel = await cancelAdminTournament(sql, "root_admin", cancelT.active!.id);
    assert.equal(afterCancel.active, null);
    assert.equal(afterCancel.history[0]?.status, "cancelled");
  });

  it("validates Low/Medium/High/Extreme relic power presets and wheel animation curve", () => {
    assert.deepEqual(
      RELIC_POWER_PRESETS.map((p) => p.id),
      ["low", "medium", "high", "extreme"],
    );
    for (let i = 0; i < RELIC_POWER_PRESETS.length; i += 1) {
      const preset = RELIC_POWER_PRESETS[i]!;
      assert.deepEqual(clampRelicBuff(preset.buff), preset.buff);
      if (i > 0) {
        const prev = RELIC_POWER_PRESETS[i - 1]!.buff;
        assert.ok(preset.buff.gemsPct > prev.gemsPct);
        assert.ok(preset.buff.drainReductionPct > prev.drainReductionPct);
        assert.ok(preset.buff.onBonus > prev.onBonus);
        assert.ok(preset.buff.refundPct > prev.refundPct);
      }
    }
    assert.equal(easeOutQuart(0), 0);
    assert.equal(easeOutQuart(1), 1);
    assert.ok(easeOutQuart(0.5) > 0.9);
  });
});
