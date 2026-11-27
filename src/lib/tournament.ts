import { clampRelicBuff, type CustomRelic, type RelicBuff } from "./gacha/rules.ts";

export const TOURNAMENT_CURRENCY_NAME = "Копіум-Вати";
export const TOURNAMENT_CURRENCY_SHORT = "кВт·LOL";
export const TOURNAMENT_SPIN_COOLDOWN_MS = 900;
export const TOURNAMENT_MIN_CHARGES = 3;
export const TOURNAMENT_MAX_CHARGES = 50;
export const TOURNAMENT_MAX_MULTIPLIER_BPS = 50_000; // x5.00 max
export const TOURNAMENT_MAX_OVERLOAD_PCT = 95;

export type TournamentSliceId =
  | "watts_120"
  | "watts_220"
  | "watts_360"
  | "watts_550"
  | "pot_x2"
  | "mult_up"
  | "shield"
  | "surge";

export type TournamentSlice = {
  id: TournamentSliceId;
  label: string;
  sublabel: string;
  color: string;
  weight: number;
  watts: number;
  multBpsAdd: number;
  riskAdd: number;
  doublesPot?: boolean;
  grantsShield?: boolean;
  riskReduce?: number;
};

export const TOURNAMENT_SLICES: readonly TournamentSlice[] = [
  {
    id: "watts_120",
    label: "БОРЩ +120 кВт·LOL",
    sublabel: "Зарядився від сусідського чайника, поки той спав",
    color: "#38bdf8",
    weight: 22,
    watts: 120,
    multBpsAdd: 1500,
    riskAdd: 8,
  },
  {
    id: "watts_220",
    label: "КІТ +220 кВт·LOL",
    sublabel: "Кіт Барсик крутить педалі на балконі — лічильник у шоці",
    color: "#34d399",
    weight: 19,
    watts: 220,
    multBpsAdd: 2500,
    riskAdd: 12,
  },
  {
    id: "watts_360",
    label: "МАГНІТ +360 кВт·LOL",
    sublabel: "Приліпив магніт з АТБ — ДТЕК тепер винен тобі",
    color: "#fbbf24",
    weight: 14,
    watts: 360,
    multBpsAdd: 3500,
    riskAdd: 18,
  },
  {
    id: "watts_550",
    label: "МАЙН +550 кВт·LOL",
    sublabel: "Балконний EcoFlow вийшов на надзвукову тягу!",
    color: "#f97316",
    weight: 8,
    watts: 550,
    multBpsAdd: 5000,
    riskAdd: 24,
  },
  {
    id: "pot_x2",
    label: "1С БАГ ×2",
    sublabel: "Диспетчер переплутав Excel — весь котел помножено на 2!",
    color: "#a855f7",
    weight: 9,
    watts: 0,
    multBpsAdd: 2000,
    riskAdd: 16,
    doublesPot: true,
  },
  {
    id: "mult_up",
    label: "ОФШОР +0.75×",
    sublabel: "Врізався в розетку ліфта · множник полетів у космос",
    color: "#ec4899",
    weight: 11,
    watts: 100,
    multBpsAdd: 7500,
    riskAdd: 14,
  },
  {
    id: "shield",
    label: "СВЯТА ІЗОЛЕНТА 🛡️",
    sublabel: "4 шари синьої ізоленти: щит від 1 КЗ + −12% ризику",
    color: "#22d3ee",
    weight: 10,
    watts: 90,
    multBpsAdd: 1000,
    riskAdd: 0,
    grantsShield: true,
    riskReduce: 12,
  },
  {
    id: "surge",
    label: "БОЙЛЕР +420!!",
    sublabel: "Сусід врубив бойлер і фен: жирно, але дроти червоні (+30% КЗ)",
    color: "#ef4444",
    weight: 7,
    watts: 420,
    multBpsAdd: 4500,
    riskAdd: 30,
  },
] as const;

export type RelicPowerTierId = "low" | "medium" | "high" | "extreme";

export type RelicPowerPreset = {
  id: RelicPowerTierId;
  label: string;
  tag: string;
  buff: RelicBuff;
};

export const RELIC_POWER_PRESETS: readonly RelicPowerPreset[] = [
  {
    id: "low",
    label: "Низький (Low)",
    tag: "Легкий трофей для швидких міні-турнірів",
    buff: { gemsPct: 10, drainReductionPct: 5, onBonus: 2, refundPct: 4 },
  },
  {
    id: "medium",
    label: "Середній (Medium)",
    tag: "Збалансований буст на кожен день",
    buff: { gemsPct: 20, drainReductionPct: 12, onBonus: 4, refundPct: 8 },
  },
  {
    id: "high",
    label: "Високий (High)",
    tag: "Солідна нагорода за серйозну битву",
    buff: { gemsPct: 32, drainReductionPct: 18, onBonus: 7, refundPct: 14 },
  },
  {
    id: "extreme",
    label: "Екстрим (Extreme)",
    tag: "Максимально дозволені сервером імба-стати",
    buff: { gemsPct: 45, drainReductionPct: 25, onBonus: 10, refundPct: 20 },
  },
] as const;

export type RelicBlueprint = {
  name: string;
  emoji: string;
  lore: string;
  buff: RelicBuff;
};

export const DEFAULT_TOP1_RELIC: RelicBlueprint = {
  name: "Корона Головного Диспетчера",
  emoji: "👑",
  lore: "Видана абсолютному чемпіону турніру Блекаут-Ралі за сталеві нерви.",
  buff: { ...RELIC_POWER_PRESETS[2]!.buff },
};

export const DEFAULT_TOP2_RELIC: RelicBlueprint = {
  name: "Позолочений Павербанк Віце-Мага",
  emoji: "🥈",
  lore: "Трофей срібного призера турніру Блекаут-Ралі. Світиться у темряві.",
  buff: { ...RELIC_POWER_PRESETS[1]!.buff },
};

export function sanitizeRelicBlueprint(raw: unknown, fallback: RelicBlueprint): RelicBlueprint {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = String(r.name ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  const emoji = String(r.emoji ?? "")
    .trim()
    .slice(0, 12);
  const lore = String(r.lore ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return {
    name: name.length >= 2 ? name : fallback.name,
    emoji: emoji || fallback.emoji,
    lore: lore || fallback.lore,
    buff: clampRelicBuff(r.buff ?? fallback.buff),
  };
}

export function buildAwardedRelic(
  blueprint: RelicBlueprint,
  place: 1 | 2,
  tournamentId: number,
  tournamentTitle: string,
  awardedAt: string,
): CustomRelic {
  return {
    id: `t${tournamentId}-p${place}`,
    name: blueprint.name,
    emoji: blueprint.emoji,
    lore: blueprint.lore,
    place,
    tournamentId,
    tournamentTitle,
    awardedAt,
    buff: clampRelicBuff(blueprint.buff),
  };
}

export function computeRegeneratedCharges(
  charges: number,
  chargesUpdatedAtMs: number,
  maxCharges: number,
  regenMinutes: number,
  nowMs: number,
): { charges: number; updatedAtMs: number; nextRegenAtMs: number | null } {
  const safeMax = Math.max(1, maxCharges);
  const clamped = Math.max(0, Math.min(safeMax, Math.floor(charges)));
  if (regenMinutes <= 0 || clamped >= safeMax) {
    return {
      charges: clamped,
      updatedAtMs: clamped >= safeMax ? nowMs : chargesUpdatedAtMs,
      nextRegenAtMs: null,
    };
  }
  const intervalMs = regenMinutes * 60_000;
  const elapsed = Math.max(0, nowMs - chargesUpdatedAtMs);
  const gained = Math.floor(elapsed / intervalMs);
  if (gained <= 0) {
    return {
      charges: clamped,
      updatedAtMs: chargesUpdatedAtMs,
      nextRegenAtMs: chargesUpdatedAtMs + intervalMs,
    };
  }
  const nextCharges = Math.min(safeMax, clamped + gained);
  if (nextCharges >= safeMax) {
    return { charges: safeMax, updatedAtMs: nowMs, nextRegenAtMs: null };
  }
  const nextUpdatedAtMs = chargesUpdatedAtMs + gained * intervalMs;
  return {
    charges: nextCharges,
    updatedAtMs: nextUpdatedAtMs,
    nextRegenAtMs: nextUpdatedAtMs + intervalMs,
  };
}

export function previewPotentialBank(unbankedPot: number, multiplierBps: number): number {
  return Math.max(0, Math.round((Math.max(0, unbankedPot) * Math.max(10_000, multiplierBps)) / 10_000));
}

export type TournamentWinnerSnapshot = {
  place: 1 | 2;
  playerId: string;
  publicId: string;
  username: string;
  playerName: string;
  bankedScore: number;
  peakPot: number;
  relic: CustomRelic;
};

export type TournamentInfo = {
  id: number;
  title: string;
  description: string;
  currencyName: string;
  status: "active" | "finished" | "cancelled";
  startsAt: string;
  endsAt: string;
  finishedAt: string | null;
  startingCharges: number;
  maxCharges: number;
  regenMinutes: number;
  rewardTop1: RelicBlueprint;
  rewardTop2: RelicBlueprint;
  winners: TournamentWinnerSnapshot[];
  createdAt: string;
};

export type TournamentEntryPublic = {
  tournamentId: number;
  joined: boolean;
  disqualified: boolean;
  disqualifiedReason: string | null;
  bankedScore: number;
  unbankedPot: number;
  potentialBank: number;
  multiplierBps: number;
  overloadPct: number;
  streak: number;
  shielded: boolean;
  charges: number;
  maxCharges: number;
  nextRegenAt: number | null;
  spinsUsed: number;
  peakPot: number;
  blackoutsHit: number;
  lastSlice: string | null;
  lastNote: string | null;
  rank: number | null;
  entrySeq: number;
};

export type TournamentLeaderboardRow = {
  rank: number;
  publicId: string;
  playerId?: string;
  username: string;
  playerName: string;
  bankedScore: number;
  peakPot: number;
  spinsUsed: number;
  blackoutsHit: number;
  isSelf?: boolean;
};

export type TournamentStateResponse = {
  active: TournamentInfo | null;
  entry: TournamentEntryPublic | null;
  leaderboard: TournamentLeaderboardRow[];
  past: TournamentInfo[];
  serverTime: number;
};

export type TournamentSpinResult = {
  outcomeKind: "hit" | "blackout" | "shield_saved";
  sliceIndex: number;
  sliceId: TournamentSliceId | "blackout";
  sliceLabel: string;
  note: string;
  wattsAdded: number;
  bankedAdded: number;
  state: TournamentStateResponse;
};

export type AdminTournamentParticipant = {
  playerId: string;
  publicId: string;
  username: string;
  playerName: string;
  bankedScore: number;
  unbankedPot: number;
  peakPot: number;
  spinsUsed: number;
  blackoutsHit: number;
  charges: number;
  disqualified: boolean;
  disqualifiedReason: string | null;
  ipHashShort: string | null;
  deviceHashShort: string | null;
  lastActionAt: string;
};

export type AdminTournamentOverview = {
  active: TournamentInfo | null;
  participants: AdminTournamentParticipant[];
  history: TournamentInfo[];
};
