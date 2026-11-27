import { randomInt } from "node:crypto";
import type { Sql } from "./db.ts";
import { publicPlayerId, sha256Hex } from "./crypto-hash.ts";
import { sanitizeCustomItems } from "./gacha/rules.ts";
import {
  assertNotBanned,
  assertValidCredentials,
  authenticatePlayer,
  clampInt,
  cleanFingerprint,
  hashIp,
  normalizeIp,
  parseJsonField,
  recordPlayerTelemetry,
  type DbPlayerRow,
  type TelemetryContext,
} from "./anticheat.server.ts";
import {
  DEFAULT_TOP1_RELIC,
  DEFAULT_TOP2_RELIC,
  TOURNAMENT_CURRENCY_SHORT,
  TOURNAMENT_MAX_CHARGES,
  TOURNAMENT_MAX_MULTIPLIER_BPS,
  TOURNAMENT_MAX_OVERLOAD_PCT,
  TOURNAMENT_MIN_CHARGES,
  TOURNAMENT_SLICES,
  TOURNAMENT_SPIN_COOLDOWN_MS,
  buildAwardedRelic,
  computeRegeneratedCharges,
  previewPotentialBank,
  sanitizeRelicBlueprint,
  type AdminTournamentOverview,
  type AdminTournamentParticipant,
  type RelicBlueprint,
  type TournamentEntryPublic,
  type TournamentInfo,
  type TournamentLeaderboardRow,
  type TournamentSlice,
  type TournamentSpinResult,
  type TournamentStateResponse,
  type TournamentWinnerSnapshot,
} from "./tournament.ts";

type DbTournamentRow = {
  id: number | string;
  title: string;
  description: string;
  currency_name: string;
  status: "active" | "finished" | "cancelled";
  starts_at: Date | string;
  ends_at: Date | string;
  finished_at: Date | string | null;
  starting_charges: number;
  max_charges: number;
  regen_minutes: number;
  reward_top1: unknown;
  reward_top2: unknown;
  winners: unknown;
  created_by: string;
  created_at: Date | string;
};

type DbTournamentEntryRow = {
  tournament_id: number | string;
  player_id: string;
  username: string;
  player_name: string;
  banked_score: number;
  unbanked_pot: number;
  multiplier_bps: number;
  overload_pct: number;
  streak: number;
  shielded: boolean;
  charges: number;
  charges_updated_at: Date | string;
  spins_used: number;
  peak_pot: number;
  blackouts_hit: number;
  last_slice: string | null;
  last_note: string | null;
  last_action_at: Date | string;
  last_score_at: Date | string;
  entry_seq: number;
  entry_ip_hash: string | null;
  entry_device_hash: string | null;
  disqualified: boolean;
  disqualified_reason: string | null;
};

function toIso(v: Date | string | null | undefined): string {
  if (!v) return "";
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? new Date(ms).toISOString() : "";
}

function toMs(v: Date | string | null | undefined): number {
  if (!v) return 0;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function mapTournamentRow(row: DbTournamentRow): TournamentInfo {
  const winnersRaw = parseJsonField(row.winners);
  const winners: TournamentWinnerSnapshot[] = Array.isArray(winnersRaw)
    ? winnersRaw
        .filter((w): w is TournamentWinnerSnapshot => Boolean(w && typeof w === "object"))
        .map((w) => ({
          place: (Number(w.place) === 2 ? 2 : 1) as 1 | 2,
          playerId: String(w.playerId ?? ""),
          publicId: String(w.publicId ?? ""),
          username: String(w.username ?? ""),
          playerName: String(w.playerName ?? ""),
          bankedScore: Math.max(0, Number(w.bankedScore ?? 0)),
          peakPot: Math.max(0, Number(w.peakPot ?? 0)),
          relic: sanitizeCustomItems([w.relic])[0]!,
        }))
        .filter((w) => Boolean(w.relic))
    : [];

  return {
    id: Number(row.id),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    currencyName: String(row.currency_name || TOURNAMENT_CURRENCY_SHORT),
    status: row.status,
    startsAt: toIso(row.starts_at),
    endsAt: toIso(row.ends_at),
    finishedAt: row.finished_at ? toIso(row.finished_at) : null,
    startingCharges: Number(row.starting_charges),
    maxCharges: Number(row.max_charges),
    regenMinutes: Number(row.regen_minutes),
    rewardTop1: sanitizeRelicBlueprint(parseJsonField(row.reward_top1), DEFAULT_TOP1_RELIC),
    rewardTop2: sanitizeRelicBlueprint(parseJsonField(row.reward_top2), DEFAULT_TOP2_RELIC),
    winners,
    createdAt: toIso(row.created_at),
  };
}

async function getAccountUsername(sql: Sql, playerId: string): Promise<string | null> {
  const rows = await sql<{ username: string }>`
    select username
    from player_accounts
    where player_id = ${playerId}
    limit 1
  `;
  return rows[0]?.username ?? null;
}

function resolveTournamentDeviceAndIp(
  telemetry?: TelemetryContext,
  playerRow?: Pick<DbPlayerRow, "ip_hash" | "pc_fp" | "chrome_fp">,
): { ipHash: string | null; deviceHash: string | null } {
  const normIp = normalizeIp(telemetry?.ip);
  const ipHash = normIp ? hashIp(normIp) : (playerRow?.ip_hash ?? null);
  const pcFp = cleanFingerprint(telemetry?.pcFp) ?? cleanFingerprint(playerRow?.pc_fp);
  const chromeFp = cleanFingerprint(telemetry?.chromeFp) ?? cleanFingerprint(playerRow?.chrome_fp);
  const rawDev = pcFp ?? chromeFp;
  const deviceHash = rawDev ? sha256Hex(`dtek-tdev-v1:${rawDev}`) : null;
  return { ipHash, deviceHash };
}

function pickWeightedSlice(): { index: number; slice: TournamentSlice } {
  const totalWeight = TOURNAMENT_SLICES.reduce((acc, s) => acc + s.weight, 0);
  let r = randomInt(0, totalWeight);
  for (let i = 0; i < TOURNAMENT_SLICES.length; i += 1) {
    const s = TOURNAMENT_SLICES[i]!;
    if (r < s.weight) return { index: i, slice: s };
    r -= s.weight;
  }
  return { index: 0, slice: TOURNAMENT_SLICES[0]! };
}

async function grantRelicToPlayer(
  sql: Sql,
  playerId: string,
  relic: ReturnType<typeof buildAwardedRelic>,
): Promise<void> {
  const rows = await sql<{ custom_items: unknown }>`
    select custom_items
    from leaderboard_players
    where id = ${playerId}
    limit 1
  `;
  const row = rows[0];
  if (!row) return;
  const existing = sanitizeCustomItems(parseJsonField(row.custom_items));
  if (existing.some((item) => item.id === relic.id)) return;
  const next = [...existing, relic];
  await sql`
    update leaderboard_players
    set
      custom_items = ${JSON.stringify(next)}::jsonb,
      seq = seq + 1,
      updated_at = now()
    where id = ${playerId}
  `;
}

export async function settleTournamentById(
  sql: Sql,
  tournamentId: number,
  options: { adminUser?: string | null } = {},
): Promise<TournamentInfo | null> {
  const claimed = await sql<DbTournamentRow>`
    update tournaments
    set
      status = 'finished',
      finished_at = coalesce(finished_at, now())
    where id = ${tournamentId}
      and status = 'active'
    returning *
  `;
  const row = claimed[0];
  if (!row) return null;

  const info = mapTournamentRow(row);
  const awardedAt = info.finishedAt || new Date().toISOString();

  const topEntries = await sql<DbTournamentEntryRow>`
    select *
    from tournament_entries
    where tournament_id = ${tournamentId}
      and disqualified = false
      and banked_score > 0
    order by banked_score desc, peak_pot desc, last_score_at asc
    limit 2
  `;

  const winners: TournamentWinnerSnapshot[] = [];
  for (let i = 0; i < topEntries.length; i += 1) {
    const entry = topEntries[i]!;
    const place: 1 | 2 = i === 0 ? 1 : 2;
    const blueprint = place === 1 ? info.rewardTop1 : info.rewardTop2;
    const relic = buildAwardedRelic(blueprint, place, info.id, info.title, awardedAt);
    await grantRelicToPlayer(sql, entry.player_id, relic);
    winners.push({
      place,
      playerId: entry.player_id,
      publicId: publicPlayerId(entry.player_id),
      username: entry.username,
      playerName: entry.player_name,
      bankedScore: Number(entry.banked_score),
      peakPot: Number(entry.peak_pot),
      relic,
    });
  }

  const saved = await sql<DbTournamentRow>`
    update tournaments
    set winners = ${JSON.stringify(winners)}::jsonb
    where id = ${tournamentId}
    returning *
  `;

  try {
    await sql`
      insert into admin_audit_log (admin_user, action, target_player_id, detail)
      values (
        ${options.adminUser ?? "system"},
        ${options.adminUser ? "tournament_finish" : "tournament_auto_settle"},
        ${null},
        ${JSON.stringify({
          tournamentId: info.id,
          title: info.title,
          winners: winners.map((w) => ({
            place: w.place,
            username: w.username,
            score: w.bankedScore,
            relicId: w.relic.id,
          })),
        })}::jsonb
      )
    `;
  } catch {
    // Audit insert failure must not revert awarded relics.
  }

  return saved[0] ? mapTournamentRow(saved[0]) : { ...info, winners };
}

export async function settleDueTournaments(sql: Sql): Promise<void> {
  const due = await sql<{ id: number | string }>`
    select id
    from tournaments
    where status = 'active'
      and ends_at <= now()
    order by id asc
  `;
  for (const d of due) {
    await settleTournamentById(sql, Number(d.id));
  }
}

async function computeEntryRank(sql: Sql, entry: DbTournamentEntryRow): Promise<number | null> {
  if (entry.disqualified) return null;
  const rows = await sql<{ ahead: number }>`
    select count(*)::int as ahead
    from tournament_entries
    where tournament_id = ${Number(entry.tournament_id)}
      and disqualified = false
      and (
        banked_score > ${Number(entry.banked_score)}
        or (banked_score = ${Number(entry.banked_score)} and peak_pot > ${Number(entry.peak_pot)})
        or (
          banked_score = ${Number(entry.banked_score)}
          and peak_pot = ${Number(entry.peak_pot)}
          and last_score_at < ${new Date(entry.last_score_at).toISOString()}::timestamptz
        )
      )
  `;
  return Number(rows[0]?.ahead ?? 0) + 1;
}

function mapEntryPublic(
  t: TournamentInfo,
  entry: DbTournamentEntryRow,
  rank: number | null,
  nowMs: number,
): TournamentEntryPublic {
  const regen = computeRegeneratedCharges(
    Number(entry.charges),
    toMs(entry.charges_updated_at),
    t.maxCharges,
    t.regenMinutes,
    nowMs,
  );
  return {
    tournamentId: t.id,
    joined: true,
    disqualified: Boolean(entry.disqualified),
    disqualifiedReason: entry.disqualified_reason ?? null,
    bankedScore: Math.max(0, Number(entry.banked_score)),
    unbankedPot: Math.max(0, Number(entry.unbanked_pot)),
    potentialBank: previewPotentialBank(Number(entry.unbanked_pot), Number(entry.multiplier_bps)),
    multiplierBps: Number(entry.multiplier_bps),
    overloadPct: Math.max(0, Number(entry.overload_pct)),
    streak: Math.max(0, Number(entry.streak)),
    shielded: Boolean(entry.shielded),
    charges: regen.charges,
    maxCharges: t.maxCharges,
    nextRegenAt: regen.nextRegenAtMs,
    spinsUsed: Math.max(0, Number(entry.spins_used)),
    peakPot: Math.max(0, Number(entry.peak_pot)),
    blackoutsHit: Math.max(0, Number(entry.blackouts_hit)),
    lastSlice: entry.last_slice ?? null,
    lastNote: entry.last_note ?? null,
    rank,
    entrySeq: Math.max(0, Number(entry.entry_seq)),
  };
}

export async function getTournamentState(
  sql: Sql,
  input?: {
    id?: string;
    secret?: string;
    season?: number;
    telemetry?: TelemetryContext;
  },
): Promise<TournamentStateResponse> {
  await settleDueTournaments(sql);
  if (input?.telemetry || input?.id) {
    await assertNotBanned(sql, { ...input.telemetry, playerId: input.id });
  }

  const activeRows = await sql<DbTournamentRow>`
    select *
    from tournaments
    where status = 'active'
    order by id desc
    limit 1
  `;
  const active = activeRows[0] ? mapTournamentRow(activeRows[0]) : null;

  const pastRows = await sql<DbTournamentRow>`
    select *
    from tournaments
    where status = 'finished'
    order by finished_at desc nulls last, id desc
    limit 8
  `;
  const past = pastRows.map(mapTournamentRow);

  let selfPlayerId: string | null = null;
  if (input?.id && input?.secret) {
    try {
      const creds = assertValidCredentials({ id: input.id, secret: input.secret, season: input.season });
      const row = await authenticatePlayer(sql, creds);
      selfPlayerId = row.id;
    } catch {
      selfPlayerId = null;
    }
  }

  const leaderboard: TournamentLeaderboardRow[] = [];
  let entry: TournamentEntryPublic | null = null;
  const nowMs = Date.now();

  if (active) {
    const lbRows = await sql<DbTournamentEntryRow>`
      select *
      from tournament_entries
      where tournament_id = ${active.id}
        and disqualified = false
      order by banked_score desc, peak_pot desc, last_score_at asc
      limit 50
    `;
    lbRows.forEach((r, idx) => {
      leaderboard.push({
        rank: idx + 1,
        publicId: publicPlayerId(r.player_id),
        username: r.username,
        playerName: r.player_name,
        bankedScore: Math.max(0, Number(r.banked_score)),
        peakPot: Math.max(0, Number(r.peak_pot)),
        spinsUsed: Math.max(0, Number(r.spins_used)),
        blackoutsHit: Math.max(0, Number(r.blackouts_hit)),
        isSelf: selfPlayerId ? r.player_id === selfPlayerId : false,
      });
    });

    if (selfPlayerId) {
      const myRows = await sql<DbTournamentEntryRow>`
        select *
        from tournament_entries
        where tournament_id = ${active.id}
          and player_id = ${selfPlayerId}
        limit 1
      `;
      if (myRows[0]) {
        const rank = await computeEntryRank(sql, myRows[0]);
        entry = mapEntryPublic(active, myRows[0], rank, nowMs);
      }
    }
  }

  return {
    active,
    entry,
    leaderboard,
    past,
    serverTime: nowMs,
  };
}

async function requireRegisteredTournamentContext(
  sql: Sql,
  input: { id: string; secret: string; season: number; telemetry?: TelemetryContext },
): Promise<{
  creds: ReturnType<typeof assertValidCredentials>;
  player: DbPlayerRow;
  username: string;
  tournament: TournamentInfo;
}> {
  const creds = assertValidCredentials(input);
  await assertNotBanned(sql, { ...input.telemetry, playerId: creds.id });
  const player = await authenticatePlayer(sql, creds);
  const username = await getAccountUsername(sql, player.id);
  if (!username) {
    throw new Error("Для участі в турнірі створи акаунт або увійди (логін і пароль)");
  }

  await settleDueTournaments(sql);
  const tRows = await sql<DbTournamentRow>`
    select *
    from tournaments
    where status = 'active'
      and ends_at > now()
    order by id desc
    limit 1
  `;
  if (!tRows[0]) {
    throw new Error("Зараз немає активного турніру");
  }
  return { creds, player, username, tournament: mapTournamentRow(tRows[0]) };
}

export async function joinTournament(
  sql: Sql,
  input: { id: string; secret: string; season: number; telemetry?: TelemetryContext },
): Promise<TournamentStateResponse> {
  const { player, username, tournament } = await requireRegisteredTournamentContext(sql, input);
  await recordPlayerTelemetry(sql, player.id, input.telemetry);

  const existing = await sql<DbTournamentEntryRow>`
    select *
    from tournament_entries
    where tournament_id = ${tournament.id}
      and player_id = ${player.id}
    limit 1
  `;
  if (existing[0]) {
    if (existing[0].disqualified) {
      throw new Error(
        existing[0].disqualified_reason
          ? `Тебе дискваліфіковано: ${existing[0].disqualified_reason}`
          : "Тебе дискваліфіковано з цього турніру",
      );
    }
    return getTournamentState(sql, input);
  }

  const { ipHash, deviceHash } = resolveTournamentDeviceAndIp(input.telemetry, player);

  if (deviceHash) {
    const devDup = await sql<{ player_id: string }>`
      select player_id
      from tournament_entries
      where tournament_id = ${tournament.id}
        and disqualified = false
        and entry_device_hash = ${deviceHash}
        and player_id <> ${player.id}
      limit 1
    `;
    if (devDup[0]) {
      throw new Error("З цього пристрою вже бере участь інший акаунт");
    }
  }
  if (ipHash) {
    const ipDup = await sql<{ player_id: string }>`
      select player_id
      from tournament_entries
      where tournament_id = ${tournament.id}
        and disqualified = false
        and entry_ip_hash = ${ipHash}
        and player_id <> ${player.id}
      limit 1
    `;
    if (ipDup[0]) {
      throw new Error("З цієї IP-адреси вже бере участь інший акаунт");
    }
  }

  const displayName = player.name && player.name.trim().length >= 2 ? player.name.trim() : username;
  try {
    await sql`
      insert into tournament_entries (
        tournament_id,
        player_id,
        username,
        player_name,
        charges,
        charges_updated_at,
        last_action_at,
        entry_ip_hash,
        entry_device_hash
      )
      values (
        ${tournament.id},
        ${player.id},
        ${username},
        ${displayName},
        ${tournament.startingCharges},
        now(),
        now() - interval '2 seconds',
        ${ipHash},
        ${deviceHash}
      )
    `;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "23505") {
      throw new Error("З цього пристрою або IP вже є учасник у цьому турнірі");
    }
    throw err;
  }

  return getTournamentState(sql, input);
}

export async function executeTournamentSpin(
  sql: Sql,
  input: {
    id: string;
    secret: string;
    season: number;
    entrySeq: number;
    telemetry?: TelemetryContext;
  },
): Promise<TournamentSpinResult> {
  const { player, tournament } = await requireRegisteredTournamentContext(sql, input);
  const entrySeq = clampInt(input.entrySeq, 0, 1_000_000_000);

  const entryRows = await sql<DbTournamentEntryRow>`
    select *
    from tournament_entries
    where tournament_id = ${tournament.id}
      and player_id = ${player.id}
    limit 1
  `;
  const entry = entryRows[0];
  if (!entry) throw new Error("Спочатку приєднайся до турніру");
  if (entry.disqualified) {
    throw new Error(
      entry.disqualified_reason
        ? `Тебе дискваліфіковано: ${entry.disqualified_reason}`
        : "Тебе дискваліфіковано з цього турніру",
    );
  }
  if (Number(entry.entry_seq) !== entrySeq) {
    throw new Error("CONFLICT");
  }

  const nowMs = Date.now();
  if (Number(entry.spins_used) > 0) {
    const elapsed = nowMs - toMs(entry.last_action_at);
    if (elapsed < TOURNAMENT_SPIN_COOLDOWN_MS) {
      throw new Error("Не так швидко! Зачекай зупинки турнірного колеса.");
    }
  }

  const regen = computeRegeneratedCharges(
    Number(entry.charges),
    toMs(entry.charges_updated_at),
    tournament.maxCharges,
    tournament.regenMinutes,
    nowMs,
  );
  if (regen.charges < 1) {
    throw new Error("Заряди вичерпані! Почекай відновлення або зафіксуй котел.");
  }

  const nextCharges = regen.charges - 1;
  const nextChargesUpdatedAtIso =
    regen.charges >= tournament.maxCharges
      ? new Date(nowMs).toISOString()
      : new Date(regen.updatedAtMs).toISOString();

  const currentOverload = clampInt(entry.overload_pct, 0, TOURNAMENT_MAX_OVERLOAD_PCT);
  const currentPot = Math.max(0, Number(entry.unbanked_pot));
  const currentMult = clampInt(entry.multiplier_bps, 10_000, TOURNAMENT_MAX_MULTIPLIER_BPS);
  const currentPeak = Math.max(0, Number(entry.peak_pot));
  const currentStreak = Math.max(0, Number(entry.streak));

  let outcomeKind: "hit" | "blackout" | "shield_saved" = "hit";
  let sliceIndex = 0;
  let sliceId: TournamentSpinResult["sliceId"] = "watts_120";
  let sliceLabel = "";
  let note = "";
  let wattsAdded = 0;

  let nextPot = currentPot;
  let nextMult = currentMult;
  let nextOverload = currentOverload;
  let nextStreak = currentStreak;
  let nextShielded = Boolean(entry.shielded);
  let nextPeak = currentPeak;
  let nextBlackouts = Number(entry.blackouts_hit);

  const triggeredBlackout = currentOverload > 0 && randomInt(0, 100) < currentOverload;

  if (triggeredBlackout && entry.shielded) {
    outcomeKind = "shield_saved";
    sliceIndex = TOURNAMENT_SLICES.findIndex((s) => s.id === "shield");
    if (sliceIndex < 0) sliceIndex = 6;
    sliceId = "shield";
    sliceLabel = "ІЗОЛЕНТА ВРЯТУВАЛА 🛡️";
    nextShielded = false;
    nextOverload = Math.max(0, currentOverload - 15);
    nextStreak = currentStreak + 1;
    note = "Синя Ізолента втримала коротке замикання! Котел і множник у безпеці (−15% ризику).";
  } else if (triggeredBlackout) {
    outcomeKind = "blackout";
    sliceIndex = 7;
    sliceId = "blackout";
    sliceLabel = "БЛЕКАУТ КЗ 💥";
    nextPot = 0;
    nextMult = 10_000;
    nextOverload = 0;
    nextStreak = 0;
    nextShielded = false;
    nextBlackouts += 1;
    note = `Коротке замикання спалило незафіксований котел, але твій Банк ${entry.banked_score} ${TOURNAMENT_CURRENCY_SHORT} не постраждав!`;
  } else {
    const picked = pickWeightedSlice();
    sliceIndex = picked.index;
    const slice = picked.slice;
    sliceId = slice.id;
    sliceLabel = slice.label;

    if (slice.doublesPot) {
      const doubled = currentPot > 0 ? currentPot : 150;
      wattsAdded = doubled;
      nextPot = currentPot + doubled;
    } else {
      wattsAdded = slice.watts;
      nextPot = currentPot + slice.watts;
    }

    nextMult = Math.min(TOURNAMENT_MAX_MULTIPLIER_BPS, currentMult + slice.multBpsAdd);
    if (slice.grantsShield) nextShielded = true;
    if (slice.riskReduce) nextOverload = Math.max(0, nextOverload - slice.riskReduce);
    if (slice.riskAdd > 0) {
      nextOverload = Math.min(TOURNAMENT_MAX_OVERLOAD_PCT, nextOverload + slice.riskAdd);
    }
    nextStreak = currentStreak + 1;
    const potPreview = previewPotentialBank(nextPot, nextMult);
    nextPeak = Math.max(currentPeak, potPreview);
    note = `${slice.sublabel} · у котлі вже ${potPreview} ${TOURNAMENT_CURRENCY_SHORT}`;
  }

  const updated = await sql<DbTournamentEntryRow>`
    update tournament_entries
    set
      unbanked_pot = ${nextPot},
      multiplier_bps = ${nextMult},
      overload_pct = ${nextOverload},
      streak = ${nextStreak},
      shielded = ${nextShielded},
      charges = ${nextCharges},
      charges_updated_at = ${nextChargesUpdatedAtIso}::timestamptz,
      spins_used = spins_used + 1,
      peak_pot = ${nextPeak},
      blackouts_hit = ${nextBlackouts},
      last_slice = ${sliceLabel},
      last_note = ${note},
      last_action_at = now(),
      entry_seq = entry_seq + 1
    where tournament_id = ${tournament.id}
      and player_id = ${player.id}
      and entry_seq = ${entrySeq}
      and disqualified = false
      and (
        spins_used = 0
        or last_action_at <= now() - (${TOURNAMENT_SPIN_COOLDOWN_MS}::double precision * interval '1 millisecond')
      )
    returning *
  `;
  if (!updated[0]) {
    throw new Error("CONFLICT");
  }

  await recordPlayerTelemetry(sql, player.id, input.telemetry);
  const state = await getTournamentState(sql, input);
  return {
    outcomeKind,
    sliceIndex,
    sliceId,
    sliceLabel,
    note,
    wattsAdded,
    bankedAdded: 0,
    state,
  };
}

export async function executeTournamentBank(
  sql: Sql,
  input: {
    id: string;
    secret: string;
    season: number;
    entrySeq: number;
    telemetry?: TelemetryContext;
  },
): Promise<{ bankedAdded: number; state: TournamentStateResponse }> {
  const { player, tournament } = await requireRegisteredTournamentContext(sql, input);
  const entrySeq = clampInt(input.entrySeq, 0, 1_000_000_000);

  const entryRows = await sql<DbTournamentEntryRow>`
    select *
    from tournament_entries
    where tournament_id = ${tournament.id}
      and player_id = ${player.id}
    limit 1
  `;
  const entry = entryRows[0];
  if (!entry) throw new Error("Спочатку приєднайся до турніру");
  if (entry.disqualified) throw new Error("Тебе дискваліфіковано з цього турніру");
  if (Number(entry.entry_seq) !== entrySeq) throw new Error("CONFLICT");

  const pot = Math.max(0, Number(entry.unbanked_pot));
  if (pot <= 0) {
    throw new Error("Котел порожній — спочатку зроби крутку!");
  }

  const bankedAdded = previewPotentialBank(pot, Number(entry.multiplier_bps));
  const nextPeak = Math.max(Number(entry.peak_pot), bankedAdded);
  const note = `Зафіксовано +${bankedAdded} ${TOURNAMENT_CURRENCY_SHORT} у безпечний банк!`;

  const updated = await sql<DbTournamentEntryRow>`
    update tournament_entries
    set
      banked_score = banked_score + ${bankedAdded},
      unbanked_pot = 0,
      multiplier_bps = 10000,
      overload_pct = 0,
      streak = 0,
      shielded = false,
      peak_pot = ${nextPeak},
      last_slice = 'БАНК ЗАФІКСОВАНО',
      last_note = ${note},
      last_score_at = now(),
      entry_seq = entry_seq + 1
    where tournament_id = ${tournament.id}
      and player_id = ${player.id}
      and entry_seq = ${entrySeq}
      and disqualified = false
      and unbanked_pot > 0
    returning *
  `;
  if (!updated[0]) throw new Error("CONFLICT");

  await recordPlayerTelemetry(sql, player.id, input.telemetry);
  const state = await getTournamentState(sql, input);
  return { bankedAdded, state };
}

export async function getAdminTournamentOverview(sql: Sql): Promise<AdminTournamentOverview> {
  await settleDueTournaments(sql);
  const activeRows = await sql<DbTournamentRow>`
    select *
    from tournaments
    where status = 'active'
    order by id desc
    limit 1
  `;
  const active = activeRows[0] ? mapTournamentRow(activeRows[0]) : null;

  let participants: AdminTournamentParticipant[] = [];
  if (active) {
    const pRows = await sql<DbTournamentEntryRow>`
      select *
      from tournament_entries
      where tournament_id = ${active.id}
      order by disqualified asc, banked_score desc, peak_pot desc, last_score_at asc
      limit 150
    `;
    participants = pRows.map((e) => ({
      playerId: e.player_id,
      publicId: publicPlayerId(e.player_id),
      username: e.username,
      playerName: e.player_name,
      bankedScore: Number(e.banked_score),
      unbankedPot: Number(e.unbanked_pot),
      peakPot: Number(e.peak_pot),
      spinsUsed: Number(e.spins_used),
      blackoutsHit: Number(e.blackouts_hit),
      charges: Number(e.charges),
      disqualified: Boolean(e.disqualified),
      disqualifiedReason: e.disqualified_reason ?? null,
      ipHashShort: e.entry_ip_hash ? `${e.entry_ip_hash.slice(0, 10)}…` : null,
      deviceHashShort: e.entry_device_hash ? `${e.entry_device_hash.slice(0, 10)}…` : null,
      lastActionAt: toIso(e.last_action_at),
    }));
  }

  const historyRows = await sql<DbTournamentRow>`
    select *
    from tournaments
    where status <> 'active'
    order by coalesce(finished_at, created_at) desc, id desc
    limit 20
  `;
  return {
    active,
    participants,
    history: historyRows.map(mapTournamentRow),
  };
}

export async function createAdminTournament(
  sql: Sql,
  adminUser: string,
  input: {
    title?: unknown;
    description?: unknown;
    durationMinutes?: unknown;
    startingCharges?: unknown;
    maxCharges?: unknown;
    regenMinutes?: unknown;
    rewardTop1?: unknown;
    rewardTop2?: unknown;
  },
): Promise<AdminTournamentOverview> {
  await settleDueTournaments(sql);

  const title = String(input.title ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 64);
  if (title.length < 3) {
    throw new Error("Назва турніру має бути від 3 символів");
  }
  const description = String(input.description ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  const durationMinutes = clampInt(input.durationMinutes, 1, 10080);
  const startingCharges = clampInt(input.startingCharges, TOURNAMENT_MIN_CHARGES, TOURNAMENT_MAX_CHARGES);
  const maxCharges = Math.max(
    startingCharges,
    clampInt(input.maxCharges, TOURNAMENT_MIN_CHARGES, TOURNAMENT_MAX_CHARGES),
  );
  const regenMinutes = clampInt(input.regenMinutes, 0, 1440);
  const rewardTop1: RelicBlueprint = sanitizeRelicBlueprint(input.rewardTop1, DEFAULT_TOP1_RELIC);
  const rewardTop2: RelicBlueprint = sanitizeRelicBlueprint(input.rewardTop2, DEFAULT_TOP2_RELIC);

  let inserted: DbTournamentRow[];
  try {
    inserted = await sql<DbTournamentRow>`
      insert into tournaments (
        title,
        description,
        currency_name,
        status,
        starts_at,
        ends_at,
        starting_charges,
        max_charges,
        regen_minutes,
        reward_top1,
        reward_top2,
        created_by
      )
      values (
        ${title},
        ${description},
        ${TOURNAMENT_CURRENCY_SHORT},
        'active',
        now(),
        now() + (${durationMinutes}::double precision * interval '1 minute'),
        ${startingCharges},
        ${maxCharges},
        ${regenMinutes},
        ${JSON.stringify(rewardTop1)}::jsonb,
        ${JSON.stringify(rewardTop2)}::jsonb,
        ${adminUser}
      )
      returning *
    `;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "23505") {
      throw new Error("Активний турнір вже запущено! Спочатку заверши або скасуй поточний.");
    }
    throw err;
  }

  await sql`
    insert into admin_audit_log (admin_user, action, target_player_id, detail)
    values (
      ${adminUser},
      'tournament_launch',
      ${null},
      ${JSON.stringify({
        tournamentId: Number(inserted[0]?.id ?? 0),
        title,
        durationMinutes,
        startingCharges,
        maxCharges,
        regenMinutes,
      })}::jsonb
    )
  `;

  return getAdminTournamentOverview(sql);
}

export async function finishAdminTournament(
  sql: Sql,
  adminUser: string,
  tournamentId: number,
): Promise<AdminTournamentOverview> {
  const settled = await settleTournamentById(sql, tournamentId, { adminUser });
  if (!settled) throw new Error("Активний турнір не знайдено або він вже завершений");
  return getAdminTournamentOverview(sql);
}

export async function cancelAdminTournament(
  sql: Sql,
  adminUser: string,
  tournamentId: number,
): Promise<AdminTournamentOverview> {
  const updated = await sql<DbTournamentRow>`
    update tournaments
    set
      status = 'cancelled',
      finished_at = now()
    where id = ${tournamentId}
      and status = 'active'
    returning *
  `;
  if (!updated[0]) throw new Error("Активний турнір не знайдено");

  await sql`
    insert into admin_audit_log (admin_user, action, target_player_id, detail)
    values (
      ${adminUser},
      'tournament_cancel',
      ${null},
      ${JSON.stringify({ tournamentId, title: updated[0].title })}::jsonb
    )
  `;
  return getAdminTournamentOverview(sql);
}

export async function disqualifyAdminTournamentEntry(
  sql: Sql,
  adminUser: string,
  input: { tournamentId: number; playerId: string; reason?: string },
): Promise<AdminTournamentOverview> {
  const reason =
    String(input.reason ?? "").replace(/\s+/g, " ").trim().slice(0, 180) ||
    "Дискваліфікація адміністратором";
  const updated = await sql<DbTournamentEntryRow>`
    update tournament_entries
    set
      disqualified = true,
      disqualified_reason = ${reason}
    where tournament_id = ${input.tournamentId}
      and player_id = ${input.playerId}
    returning *
  `;
  if (!updated[0]) throw new Error("Учасника турніру не знайдено");

  await sql`
    insert into admin_audit_log (admin_user, action, target_player_id, detail)
    values (
      ${adminUser},
      'tournament_disqualify',
      ${input.playerId},
      ${JSON.stringify({ tournamentId: input.tournamentId, reason })}::jsonb
    )
  `;
  return getAdminTournamentOverview(sql);
}
