export type Outcome = "off" | "on" | "blink" | "blackout" | "generator" | "respin";

export type Artifact = { id: string; name: string; emoji: string; desc: string };

export type Pet = { id: string; name: string; emoji: string; perk: string };

export const OUTCOMES: Outcome[] = ["off", "on", "blink", "blackout", "generator", "respin"];

export const KW_PER_OUTCOME: Record<Outcome, number> = {
  off: 5,
  on: 10,
  blink: 15,
  blackout: 25,
  generator: 50,
  respin: 10,
};

export const XP_PER_OUTCOME: Record<Outcome, number> = {
  off: 10,
  on: 12,
  blink: 20,
  blackout: 30,
  generator: 40,
  respin: 12,
};

export type WheelSlice = { id: Outcome; lines: string[]; fill: string; ink: string; small?: boolean };

export const WHEEL_SLICES: WheelSlice[] = [
  { id: "off", lines: ["ВИМК"], fill: "#d64545", ink: "#f4efe6" },
  { id: "on", lines: ["Є"], fill: "#e8a317", ink: "#1a1612" },
  { id: "off", lines: ["ВИМК"], fill: "#d64545", ink: "#f4efe6" },
  { id: "on", lines: ["Є"], fill: "#e8a317", ink: "#1a1612" },
  { id: "blink", lines: ["3 ХВ", "СВІТЛА"], fill: "#5ec4b3", ink: "#0e211d", small: true },
  { id: "off", lines: ["ВИМК"], fill: "#d64545", ink: "#f4efe6" },
  { id: "blackout", lines: ["БЛА", "КАУТ"], fill: "#7c1f3c", ink: "#ffd9dd", small: true },
  { id: "on", lines: ["Є"], fill: "#e8a317", ink: "#1a1612" },
  { id: "generator", lines: ["ГЕНЕ", "РАТОР"], fill: "#4fae63", ink: "#0d1f12", small: true },
  { id: "off", lines: ["ВИМК"], fill: "#d64545", ink: "#f4efe6" },
  { id: "respin", lines: ["ГРАФІК", "ЗНИК"], fill: "#8d7bd8", ink: "#14101f", small: true },
  { id: "on", lines: ["Є"], fill: "#e8a317", ink: "#1a1612" },
];

export const GOLDEN_SLICE_INDICES = WHEEL_SLICES.map((s, i) =>
  s.id === "on" || s.id === "generator" ? i : -1,
).filter((i) => i >= 0);

export type SpinEventKind = "turbo" | "double" | "shield" | "golden";
export type ActiveSpinEvent = { kind: SpinEventKind; left: number };

export const SPIN_EVENTS: Record<SpinEventKind, { title: string; desc: string; color: string; spins: number }> = {
  turbo: { title: "ТУРБО-ОБЕРТ", desc: "Диспетчер випив енергетик. Колесо крутиться втричі швидше.", color: "#5ec4b3", spins: 5 },
  double: { title: "ПОДВІЙНІ кВт", desc: "Лічильник зламався на твою користь. Енергія ×2.", color: "#e8a317", spins: 4 },
  shield: { title: "ЩИТ ПАВЕРБАНКА", desc: "Сусід поділився зарядкою. Батарея не сідає.", color: "#7dd694", spins: 3 },
  golden: { title: "ЗОЛОТА ГОДИНА", desc: "ДТЕК забув про твою вулицю. Тільки світло і генератори.", color: "#ffd36b", spins: 2 },
};

export const SPIN_EVENT_KINDS = Object.keys(SPIN_EVENTS) as SpinEventKind[];
export const SPIN_EVENT_CHANCE = 0.18;

export const SPIN_DURATION_NORMAL_MS = 4600;
export const SPIN_DURATION_TURBO_MS = 1300;
export const SPIN_COOLDOWN_NORMAL_MS = 3200;
export const SPIN_COOLDOWN_TURBO_MS = 650;
export const BLACKOUT_MIN_MS = 600;


export const TITLES = [
  "Новосел",
  "Свічкар-стажер",
  "Майстер пледу",
  "Хранитель павербанку",
  "Чайник-сист",
  "Лорд Темряви",
  "Спікер Ради Оборотів",
  "Напівбог Розетки",
  "Архонт Відключень",
  "Легенда ДТЕК",
];

export function levelFromXp(xp: number): number {
  return Math.min(TITLES.length, Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1);
}

export function xpForLevel(level: number): number {
  return 100 * (level - 1) * (level - 1);
}

export function titleFor(level: number): string {
  return TITLES[Math.min(level, TITLES.length) - 1] ?? TITLES[0];
}

export const RESIN_MAX = 8;
export const RESIN_REGEN_MS = 60_000;
export const GACHA_COST = 160;
export const BOSS_MAX_HP = 25;

export const ARTIFACTS: Artifact[][] = [
  [
    { id: "air", name: "Повітря", emoji: "🌬️", desc: "Свіже. Без наповнювачів." },
    { id: "bottle", name: "Порожня пляшка", emoji: "🍾", desc: "Для барабанного бою по батареях." },
    { id: "hug", name: "Моральна підтримка", emoji: "🫂", desc: "Тільки сьогодні. Далі за кВт." },
  ],
  [
    { id: "potato", name: "Сира картоплина", emoji: "🥔", desc: "Батарейка національної кухні." },
    { id: "scotch", name: "Скотч", emoji: "🩹", desc: "Латає все, крім графіка." },
    { id: "branch", name: "Гілка для петицій", emoji: "🌿", desc: "Офіційна форма звернення до ДТЕК." },
  ],
  [
    { id: "cord", name: "Подовжувач Надії", emoji: "🔌", desc: "Довгий. Як і очікування світла." },
    { id: "flash", name: "Двіговичок", emoji: "🔅", desc: "Мигає надією. Часто. Безладно." },
    { id: "aa", name: "Батарейки АА", emoji: "🥫", desc: "5% в одній, 2% в іншій." },
    { id: "candle", name: "Свічка з ринку", emoji: "🕯️", desc: "Димить атмосферно." },
  ],
  [
    { id: "kungfu", name: "Свічка Кунг-Фу", emoji: "🥋", desc: "Тримає рівновагу навіть у темряві." },
    { id: "blanket", name: "Плед Затишку +12", emoji: "🧣", desc: "+12% до морального духу." },
    { id: "lantern", name: "Ліхтарик Світанку", emoji: "🔦", desc: "Світить лише коли не треба." },
    { id: "stabilizer", name: "Стабілізатор Смирення", emoji: "📟", desc: "Стабілізує ваше прийняття." },
    { id: "sweater", name: "Кофта Хом'яка", emoji: "🐹", desc: "Пахне насінням. Гріє душею." },
  ],
  [
    { id: "emperor", name: "Павербанк Імператора", emoji: "🔋", desc: "Заряджає себе. І вас. І сусіда." },
    { id: "abyss", name: "Генератор Бездни", emoji: "⚡", desc: "Гарчить мелодією гімну." },
    { id: "fate", name: "Чайник Долі", emoji: "🫖", desc: "Кип'ятить ще до відключення." },
    { id: "eternal", name: "Свічка Вічності", emoji: "🕯️", desc: "Горить вже 3 роки. Не питає чому." },
  ],
];

export const PET: Pet[] = [
  { id: "cat", name: "Кіт Барсик", emoji: "🐈‍⬛", perk: "Ковбаса священна: темрява з'їдає павербанк вдвічі повільніше" },
  { id: "hamster", name: "Хом'як Степан", emoji: "🐹", perk: "+5 кВт·год за кожну крутку" },
  { id: "dove", name: "Голуб Гоша", emoji: "🕊️", perk: "Знає новини: події після крутки трапляються частіше" },
];

export const NPC_NAMES = [
  "Панас_Павербанк",
  "Оксана_Генератор",
  "Дід_Петро_Свічка",
  "Бабуся_Тариф",
  "Сусід_БЕНЗИН_2100",
  "Ліфт_ображений",
  "Кот_Барсик_Official",
  "Хомяк_Степан",
  "Гоша_Голуб",
  "Дімко_Скотч",
  "Толік_Довгач",
  "Мама_кажи_свічки",
];

export type Quest = { id: string; title: string; target: number; reward: number };

export const QUESTS: Quest[] = [
  { id: "spins", title: "Зроби 3 крутки", target: 3, reward: 100 },
  { id: "on", title: "Піймай світло 2 рази", target: 2, reward: 150 },
  { id: "blackout", title: "Переживи блакаут (свічка)", target: 1, reward: 200 },
];

export const BP_TIER_SPINS = 5;
export const BP_MAX_TIER = 12;

export function bpReward(tier: number): number {
  return 50 + 25 * tier;
}

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function kyivTodayKey(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function dailySeed(): number {
  const key = todayKey();
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

export function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}

export function starColor(stars: number): string {
  switch (stars) {
    case 5:
      return "#e8a317";
    case 4:
      return "#a99cee";
    case 3:
      return "#5ec4b3";
    case 2:
      return "#7dd694";
    default:
      return "#9c9486";
  }
}
