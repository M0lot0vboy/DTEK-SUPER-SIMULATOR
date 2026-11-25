import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Zap, ZapOff, Plug, Sparkles } from "lucide-react";
import {
  RESIN_MAX,
  todayKey,
  type Outcome,
} from "@/lib/game/data";
import { useGame, batteryDrain, eventChance, migrateLegacy } from "@/lib/game/store";
import { chord, tick } from "@/lib/game/audio";
import { Hud } from "@/components/game/hud";
import { Gacha } from "@/components/game/gacha";
import { Quests } from "@/components/game/quests";
import { Ranking } from "@/components/game/ranking";
import { Toasts } from "@/components/game/toasts";
import { DailyModal } from "@/components/game/daily-modal";
import { GachaPanel } from "@/components/gacha/gacha-panel";
import { afterSpinGacha, loadoutBuffs, useGacha } from "@/lib/gacha/engine";

export const Route = createFileRoute("/")({ component: Home });

type Slice = { id: Outcome; lines: string[]; fill: string; ink: string; small?: boolean };

const SLICES: Slice[] = [
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

const OFF_NOTES = [
  "Планові роботи. Свічки вже в моді, чайник — ні.",
  "Диспетчер пішов на каву. Кава теж без світла.",
  "Холодильник почав переговори з сусідами.",
  "Графік є. Просто він секретний і кривий.",
  "Ліфт образився і теж пішов у відключку.",
];

const ON_NOTES = [
  "Диво. Розетка ще жива. Не вір до кінця.",
  "Світло є. Постав чайник, поки не передумали.",
  "Павербанк може відпочити. Хвилин на сорок.",
  "Холодильник видихнув. Ковбаса врятована.",
  "Рідкісний момент. Навіть праска не вірить.",
];

const BLINK_END = [
  "Три хвилини минули. Світло пішло без прощання.",
  "Воно було. Воно стало легендою.",
  "Скінчилось. Ліхтарик знову головний герой.",
];

const BLACKOUT_NOTES = [
  "Селище. Район. Можливо, область. Запали свічку.",
  "Темрява настільки глибока, що сусід став чутним.",
  "Блакаут. Час перевірити, куди ти поклав ліхтарик. Скрізь.",
];

const GENERATOR_NOTES = [
  "Генератор — твій. Не вимкненний. Сусіди заздрять.",
  "Джекпот! Тепер ти найпопулярніша людина в будинку.",
  "Генератор схоплений. Заводи його, шеф.",
];

const RESPIN_NOTES = [
  "Графік загубили десь між двома екселями. Крутимо ще, безкоштовно.",
  "Диспетчер випадково натиснув Ctrl+Z. Ще один оберт.",
  "План відключень оновився, поки колесо крутилось. Пере-крут!",
];

const HEADLINES = [
  "ДТЕК: вимикання перенесено на час, який ми вам ще не сказали",
  "Офіційно: стабільна нестабільність — наша найстабільніша риса",
  "Свіжо: павербанк побачив сонце вперше за тиждень",
  "Міська рада синхронізувала графіки. Обидва. Вони не збігаються",
  "Погодне попередження: вночі +7, у квартирі — так само",
  "Розетка повідомила, що їй «треба трохи наспатися»",
  "Компенсація за відключення видано свічками. Двома",
  "Вчений пояснив: якщо вимкнули о 18:00, могло вимкнутися й раніше",
  "Рейд-бос тижня знову виріс із графіка відключень",
  "Гача-банер: шанс 5★ зріс. З 0.6% до 0.6%, але зріс морально",
];

const PROPHECIES = [
  "Сьогодні чайник піддасться кип'ятінню. Вірь у себе.",
  "Фортуна каже: тримай павербанк ближче, ніж друзів.",
  "Сусід збиратиме генератор о 21:00. Ти почуєш.",
  "День сприятливий для свічок, пледів і медитації.",
  "Не починай прання після 17:00. Воно помститься.",
  "Сьогодні світло любитиме тебе. Але недовго.",
  "Зірки радять: поставити чайник ще вдень, на всякий.",
  "Твій холодильник сьогодні в зоні ризику. І ковбаса теж.",
];

const EVENTS = [
  { title: "ЗАНЯТТЯ ВІДМІНИЛИ", text: "Школу закрили. Діти вдома. Тиша померла о 8:05.", delta: 0 },
  { title: "СУСІД О 3-Й НОЧІ", text: "Генератор о 3:00 ночі. Сон не входить у графік стабільності.", delta: -8 },
  { title: "КУР'ЄР ПЕШКОМ", text: "Піца прийшла холодною. Кур'ер теж. Але прийшла.", delta: 0 },
  { title: "КІТ ПРОТИ СВІЧКИ", text: "Кіт знайшов свічку. Свічка програла. Ковбаса підозріло спостерігала.", delta: 0 },
  { title: "ЛІФТ ЗАРОБІВ", text: "Ліфт запрацював. Будинок у шоці, пішоходи дезорієнтовані.", delta: 0 },
  { title: "ГАРЯЧА ВОДА", text: "Гаряча вода прийшла без попередження. Прийми ванну, поки не збагнула.", delta: 5 },
  { title: "ЗНИЖКА НА СВІЧКИ", text: "На ринку -30% на свічки. Інфляція темряви пішла вниз.", delta: 0 },
  { title: "СОНЦЕ ВИЙШЛО", text: "Сонячна панель блиснула. Павербанк поїв сонця до 100% настрою.", delta: 12 },
  { title: "СУСІД ДАЄ ЗАРЯДКУ", text: "За борщ. Дров не треба, борщ — обов'язково.", delta: 10 },
  { title: "ЧАЙНИК ВСТИГ", text: "Встиг закип'ятити за 40 секунд до відключки. Дрібна, але перемога.", delta: 4 },
  { title: "ВАЙФАЙ ПАДАЄ", text: "Вайфай помер разом зі світлом. Мобільний тепер головний стендапер.", delta: 0 },
  { title: "ЗУСТРІЧ ВІДМІНЕНА", text: "Zoom падає у всій країні однаково. Відмова зустрічі — патріотична.", delta: 0 },
];

const OFF_BONUS = ["свічка +1", "плед уже гріється", "ліхтарик на 12%", "сусід кричить «знову»"];
const ON_BONUS = ["чайник дозволено", "вайфай ще дихає", "серіал не обірветься", "зарядка святкує"];

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}

function dailyPick(list: string[]): string {
  const d = new Date();
  const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return list[Math.abs(h) % list.length]!;
}

type Tab = "isekai" | "gacha" | "quests" | "ranking";

function Home() {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<Outcome | null>(null);
  const [ready, setReady] = useState(false);
  const [showDaily, setShowDaily] = useState(false);
  const [note, setNote] = useState("");
  const [bonus, setBonus] = useState("");
  const [flash, setFlash] = useState<Outcome | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [blackout, setBlackout] = useState(false);
  const [candleClicks, setCandleClicks] = useState(0);
  const [doom, setDoom] = useState(false);
  const [doomClicks, setDoomClicks] = useState(0);
  const [confetti, setConfetti] = useState(false);
  const [event, setEvent] = useState<(typeof EVENTS)[number] | null>(null);
  const [tab, setTab] = useState<Tab>("gacha");
  const timer = useRef<number | null>(null);

  const pet = useGame((s) => s.pet);
  const battery = useGame((s) => s.battery);
  const spins = useGame((s) => s.spins);
  const offCount = useGame((s) => s.off);
  const achievements = useGame((s) => s.achievements);
  const resin = useGame((s) => s.resin);
  const gachaBadges = useGacha((s) => s.badges);

  useEffect(() => {
    migrateLegacy();
    useGame.getState().regenResin();
    const iv = window.setInterval(() => useGame.getState().regenResin(), 1000);
    if (useGame.getState().daily.date !== todayKey()) setShowDaily(true);
    setReady(true);
    return () => window.clearInterval(iv);
  }, []);

  useEffect(() => {
    if (ready && battery <= 0 && !doom && !blackout) setDoom(true);
  }, [battery, ready, blackout, doom]);

  const wheelPath = useMemo(() => buildWheel(), []);
  const prophecy = useMemo(() => dailyPick(PROPHECIES), []);

  function spin() {
    if (spinning || blackout || doom || !ready) return;
    const g = useGame.getState();
    if (!g.spendResin()) {
      g.pushToast("СТАБІЛЬНІСТЬ 0/" + RESIN_MAX, "Відновлюється: +1 на хвилину. Мйтеся, читайте.", "#d64545");
      return;
    }

    const index = Math.floor(Math.random() * SLICES.length);
    const outcome = SLICES[index].id;
    const turns = 5 + Math.floor(Math.random() * 3);
    const jitter = (Math.random() - 0.5) * (30 * 0.5);
    const currentMod = ((rotation % 360) + 360) % 360;
    const desiredMod = (((360 - (index * 30 + 15) + jitter) % 360) + 360) % 360;
    let delta = desiredMod - currentMod;
    if (delta < 0) delta += 360;
    const next = rotation + turns * 360 + delta;

    setSpinning(true);
    setResult(null);
    setFlash(null);
    setCountdown(null);
    setEvent(null);
    setRotation(next);

    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 80 : 4600;
    let clicks = 0;
    const clickTimer = window.setInterval(() => {
      clicks += 1;
      tick(180 + (clicks % 4) * 40, 0.03);
      if (clicks > 18) window.clearInterval(clickTimer);
    }, 180);

    timer.current = window.setTimeout(() => {
      window.clearInterval(clickTimer);
      setSpinning(false);
      setResult(outcome);
      setFlash(outcome);
      window.setTimeout(() => setFlash(null), 700);

      const drainBase = outcome === "off" ? -15 : outcome === "blackout" ? -30 : outcome === "on" ? 8 : outcome === "generator" ? 45 : outcome === "blink" ? 3 : 0;
      const drain = drainBase < 0 ? Math.round(batteryDrain(drainBase, pet) * loadoutBuffs().drain) : drainBase;
      const batteryNext = Math.min(100, Math.max(0, g.battery + drain));
      useGame.getState().completeSpin(outcome, batteryNext);
      afterSpinGacha(outcome);
      if (batteryNext >= 100 && g.battery < 100) useGame.getState().unlock("full");

      const st = useGame.getState();
      if (st.last[0] === "on" && st.last[1] === "on" && st.last[2] === "on") st.unlock("optimist");
      if (st.last[0] === "off" && st.last[1] === "off" && st.last[2] === "off") st.unlock("darklord");
      if (outcome === "generator") st.unlock("generator");

      switch (outcome) {
        case "off":
          tick(110, 0.18);
          setNote(pick(OFF_NOTES));
          setBonus(pick(OFF_BONUS));
          break;
        case "on":
          tick(440, 0.18);
          setNote(pick(ON_NOTES));
          setBonus(pick(ON_BONUS));
          break;
        case "blink":
          chord();
          setCountdown(30);
          setNote("Світло увімкнули. На три хвилини. Диспетчер тестує модем.");
          setBonus("біжи за чайником");
          break;
        case "blackout":
          tick(70, 0.4);
          setBlackout(true);
          setCandleClicks(0);
          setNote(pick(BLACKOUT_NOTES));
          setBonus("запали свічку, щоб продовжити");
          break;
        case "generator":
          chord();
          setConfetti(true);
          window.setTimeout(() => setConfetti(false), 3200);
          setNote(pick(GENERATOR_NOTES));
          setBonus("павербанк +45%");
          break;
        case "respin":
          tick(330, 0.12);
          setNote(pick(RESPIN_NOTES));
          setBonus("безкоштовний оберт");
          useGame.getState().refundResin();
          useGame.getState().pushToast("Графік зник", "Стабільність повернули. Оберт безкоштовний.", "#a99cee");
          break;
      }

      if (Math.random() < eventChance(pet)) {
        const ev = pick(EVENTS);
        setEvent(ev);
        if (ev.delta !== 0) useGame.getState().applyBatteryDelta(ev.delta);
      }
    }, duration);
  }

  useEffect(() => {
    if (result !== "respin" || spinning) return;
    const t = window.setTimeout(() => spin(), 1800);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, spinning]);

  useEffect(() => {
    if (result !== "blink" || spinning || countdown === null) return;
    if (countdown === 0) {
      setResult("off");
      setFlash("off");
      setCountdown(null);
      setNote(pick(BLINK_END));
      setBonus("ліхтарик знову головний");
      useGame.getState().applyBatteryDelta(-10);
      const t = window.setTimeout(() => setFlash(null), 700);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [result, spinning, countdown]);

  function relight() {
    const clicks = candleClicks + 1;
    setCandleClicks(clicks);
    tick(200 + clicks * 60, 0.05);
    if (clicks >= 8) {
      setBlackout(false);
      useGame.getState().unlock("candle");
      setNote("Свічка запалена. Темрява відступила (тимчасово).");
      setBonus("+1 до морального духу");
      setFlash("on");
      window.setTimeout(() => setFlash(null), 700);
    }
  }

  function revive() {
    const clicks = doomClicks + 1;
    setDoomClicks(clicks);
    tick(140 + clicks * 50, 0.05);
    if (clicks >= 5) {
      setDoom(false);
      setDoomClicks(0);
      useGame.getState().unlock("dno");
      useGame.setState({ battery: 35 });
      setNote("Телефон реанімований об серце. 35% заряду.");
      setBonus("гріти далі за потреби");
    }
  }

  const offShare = spins ? Math.round((offCount / spins) * 100) : 50;
  const batteryColor = battery > 50 ? "#4fae63" : battery > 20 ? "#e8a317" : "#d64545";
  const dark = blackout || doom;

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-6 sm:px-6 sm:py-10">
      {confetti ? <Confetti /> : null}
      {blackout ? (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-[#050403]/97 px-6 text-center">
          <p className="font-display text-xs tracking-[0.3em] text-off uppercase">блакаут</p>
          <p className="mt-3 max-w-sm text-sm text-muted">{pick(BLACKOUT_NOTES)}</p>
          <button
            type="button"
            onClick={relight}
            className="mt-8 flex size-40 items-center justify-center rounded-full border border-amber/30 bg-surface/60 transition-transform active:scale-95"
            aria-label="запалити свічку"
          >
            <span className="text-6xl" style={{ filter: `drop-shadow(0 0 ${candleClicks * 6}px #e8a317)` }}>
              🕯️
            </span>
          </button>
          <p className="font-display mt-6 text-sm text-amber">тицяй свічку: {candleClicks}/8</p>
          <p className="mt-2 text-xs text-muted">кожен тиць — вогонь сильніший</p>
        </div>
      ) : null}
      {doom ? (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-[#050403]/98 px-6 text-center">
          <p className="font-display text-xs tracking-[0.3em] text-off uppercase">система: критична</p>
          <p className="font-display mt-3 text-3xl text-fg">ТЕЛЕФОН ПОМЕР</p>
          <p className="mt-3 max-w-sm text-sm text-muted">
            0% батареї. Ковбаса в холодильнику залишилась сама. Гріти павербанк об серце — єдиний шанс.
          </p>
          <button
            type="button"
            onClick={revive}
            className="font-display mt-8 min-h-14 rounded-full bg-off px-8 text-base font-extrabold text-fg transition-transform active:scale-95"
          >
            гріти об серце ({doomClicks}/5)
          </button>
        </div>
      ) : null}
      {showDaily && ready ? <DailyModal onClaim={() => setShowDaily(false)} /> : null}

      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 transition-opacity duration-300 ${
          flash === "off"
            ? "bg-off/25 opacity-100"
            : flash === "on"
              ? "bg-amber/20 opacity-100"
              : flash === "generator"
                ? "bg-[#4fae63]/20 opacity-100"
                : "opacity-0"
        }`}
      />

      <div className="relative -mx-4 mb-5 overflow-hidden border-y border-line bg-surface/60 py-1.5 sm:-mx-6">
        <div className="animate-ticker flex w-max gap-10 whitespace-nowrap text-xs text-muted">
          {[...HEADLINES, ...HEADLINES].map((h, i) => (
            <span key={i} className="flex items-center gap-2">
              <span className="font-display text-[10px] tracking-widest text-amber uppercase">дтек-новини</span>
              {h}
            </span>
          ))}
        </div>
      </div>

      <Hud ready={ready} />

      <section className="relative flex flex-1 flex-col items-center">
        <div className="mb-5 w-full max-w-md">
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
            <span className="flex items-center gap-1.5 uppercase tracking-widest">
              <Plug className="size-3.5 text-amber" aria-hidden /> павербанк
            </span>
            <span className="font-display" style={{ color: batteryColor }}>
              {battery}%
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full border border-line bg-ink">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${battery}%`, background: batteryColor }}
            />
          </div>
          {battery <= 20 ? (
            <p className="mt-1.5 text-[11px] text-off">низький заряд: кожне «вимк» — крок до смерті телефона</p>
          ) : null}
        </div>

        <div className="relative aspect-square w-full max-w-[min(100%,26rem)]">
          <div className="absolute top-0 left-1/2 z-20 -translate-x-1/2 -translate-y-1">
            <div className="h-0 w-0 border-x-[14px] border-t-[26px] border-x-transparent border-t-amber drop-shadow-[0_6px_0_#1a1612]" />
          </div>

          <div
            className={`absolute inset-3 rounded-full border border-line bg-ink shadow-[0_20px_60px_rgba(0,0,0,0.45)] ${dark ? "animate-flicker opacity-30" : ""}`}
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: spinning ? "transform 4.6s cubic-bezier(0.12, 0.72, 0.08, 1)" : "none",
            }}
          >
            <svg viewBox="0 0 100 100" className="h-full w-full">
              {wheelPath}
              <circle cx="50" cy="50" r="8" fill="#141210" stroke="#e8a317" strokeWidth="1.4" />
              <text x="50" y="51.4" textAnchor="middle" fill="#e8a317" fontSize="4.2" fontFamily="Unbounded, sans-serif">
                ДТЕК
              </text>
            </svg>
          </div>
        </div>

        <button
          type="button"
          onClick={spin}
          disabled={spinning || blackout || doom || !ready || resin < 1}
          className="font-display relative z-10 mt-8 min-h-14 w-full max-w-xs rounded-full bg-amber px-8 text-base font-extrabold tracking-wide text-ink transition-transform enabled:hover:scale-[1.02] enabled:active:scale-[0.98] disabled:opacity-60"
        >
          {spinning ? "рахуємо графік…" : resin < 1 ? "стабільність 0/8" : result ? "ще раз" : "крутити"}
        </button>

        <div className="mt-6 min-h-32 w-full max-w-md text-center" aria-live="polite">
          {!ready || (!result && !spinning) ? (
            <div className="rounded-2xl border border-amber/30 bg-surface px-5 py-4">
              <p className="font-display flex items-center justify-center gap-2 text-sm text-amber">
                <Sparkles className="size-4" aria-hidden /> прогноз дня
              </p>
              <p className="mt-2 text-sm text-muted">{prophecy}</p>
            </div>
          ) : null}
          {spinning ? <p className="font-display text-lg text-amber">колесо думає…</p> : null}
          {result === "off" && !spinning ? (
            <ResultCard tone="off" icon={<ZapOff className="size-6" aria-hidden />} title="ВИМКНУЛИ" note={note} bonus={bonus} />
          ) : null}
          {result === "on" && !spinning ? (
            <ResultCard tone="on" icon={<Zap className="size-6" aria-hidden />} title="НЕ ВИМКНУЛИ" note={note} bonus={bonus} />
          ) : null}
          {result === "blink" && !spinning ? (
            <div className="rounded-2xl border border-[#5ec4b3]/40 bg-surface px-5 py-4">
              <p className="font-display flex items-center justify-center gap-2 text-2xl text-[#5ec4b3]">
                <Zap className="size-6" aria-hidden /> СВІТЛО ЩЕ Є: {countdown} с
              </p>
              <p className="mt-2 text-sm text-muted">{note}</p>
              <p className="font-display mt-3 text-xs tracking-widest text-[#5ec4b3] uppercase">{bonus}</p>
            </div>
          ) : null}
          {result === "blackout" && !spinning ? (
            <div className="rounded-2xl border border-[#7c1f3c]/60 bg-surface px-5 py-4">
              <p className="font-display flex items-center justify-center gap-2 text-2xl text-[#e06a8c]">🕯️ БЛАКАУТ</p>
              <p className="mt-2 text-sm text-muted">{note}</p>
              <p className="font-display mt-3 text-xs tracking-widest text-[#e06a8c] uppercase">{bonus}</p>
            </div>
          ) : null}
          {result === "generator" && !spinning ? (
            <div className="rounded-2xl border border-[#4fae63]/40 bg-surface px-5 py-4">
              <p className="font-display flex items-center justify-center gap-2 text-2xl text-[#7dd694]">
                <Plug className="size-6" aria-hidden /> ГЕНЕРАТОР!
              </p>
              <p className="mt-2 text-sm text-muted">{note}</p>
              <p className="font-display mt-3 text-xs tracking-widest text-[#7dd694] uppercase">{bonus}</p>
            </div>
          ) : null}
          {result === "respin" && !spinning ? (
            <div className="rounded-2xl border border-[#8d7bd8]/40 bg-surface px-5 py-4">
              <p className="font-display flex items-center justify-center gap-2 text-2xl text-[#a99cee]">🌀 ГРАФІК ЗНИК</p>
              <p className="mt-2 text-sm text-muted">{note}</p>
              <p className="font-display mt-3 text-xs tracking-widest text-[#a99cee] uppercase">{bonus}</p>
            </div>
          ) : null}
          {event && !spinning ? (
            <div className="animate-toast mt-3 rounded-2xl border border-line bg-ink px-5 py-4 text-left">
              <p className="font-display flex items-center justify-between gap-2 text-xs tracking-widest text-amber uppercase">
                <span className="flex items-center gap-2">
                  <Sparkles className="size-3.5" aria-hidden /> подія
                </span>
                {event.delta !== 0 ? (
                  <span className={event.delta > 0 ? "text-[#7dd694]" : "text-off"}>
                    павербанк {event.delta > 0 ? "+" : ""}
                    {event.delta}%
                  </span>
                ) : (
                  <span className="text-muted">без наслідків</span>
                )}
              </p>
              <p className="font-display mt-2 text-lg text-fg">{event.title}</p>
              <p className="mt-1 text-sm text-muted">{event.text}</p>
            </div>
          ) : null}
        </div>
      </section>

      <nav className="relative mt-5 grid grid-cols-2 gap-2 sm:flex">
        {(
          [
            ["isekai", "⚔️ ісекай"],
            ["gacha", "🎰 гача"],
            ["quests", "📜 квести"],
            ["ranking", "🏆 рейтинг"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`font-display relative min-h-11 flex-1 rounded-full border px-4 text-sm font-bold transition-colors ${
              tab === id ? "border-amber/60 bg-amber/15 text-amber" : "border-line bg-surface text-muted"
            }`}
          >
            {label}
            {id === "isekai" && tab !== "isekai" && ready && gachaBadges ? (
              <span className="font-display absolute -top-1.5 -right-1 grid min-w-5 place-items-center rounded-full border-2 border-bg bg-off px-1 text-[10px] text-fg">
                !
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      <section className="relative mt-3">
        {tab === "isekai" ? <GachaPanel ready={ready} /> : null}
        {tab === "gacha" ? <Gacha ready={ready} /> : null}
        {tab === "quests" ? <Quests ready={ready} /> : null}
        {tab === "ranking" ? <Ranking ready={ready} /> : null}
      </section>

      <footer className="relative mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-[11px] text-muted">
        <span>
          круток <span className="font-display text-amber">{ready ? spins : 0}</span>
        </span>
        <span aria-hidden>·</span>
        <span>
          темряви <span className="font-display text-off">{ready ? `${offShare}%` : "—"}</span>
        </span>
        <span aria-hidden>·</span>
        <span>
          досягнень <span className="font-display text-amber">{ready ? achievements.length : 0}/7</span>
        </span>
      </footer>

      <Toasts />
    </main>
  );
}

function ResultCard({
  tone,
  icon,
  title,
  note,
  bonus,
}: {
  tone: "off" | "on";
  icon: React.ReactNode;
  title: string;
  note: string;
  bonus: string;
}) {
  const border = tone === "off" ? "border-off/40" : "border-amber/40";
  const text = tone === "off" ? "text-off" : "text-amber";
  return (
    <div className={`rounded-2xl border ${border} bg-surface px-5 py-4`}>
      <p className={`font-display flex items-center justify-center gap-2 text-2xl ${text}`}>
        {icon}
        {title}
      </p>
      <p className="mt-2 text-sm text-muted">{note}</p>
      <p className={`font-display mt-3 text-xs tracking-widest ${text} uppercase`}>{bonus}</p>
    </div>
  );
}

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 44 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 1.2,
        dur: 2.2 + Math.random() * 1.6,
        size: 6 + Math.random() * 8,
        color: ["#e8a317", "#4fae63", "#5ec4b3", "#8d7bd8", "#d64545"][i % 5]!,
        round: Math.random() > 0.5,
      })),
    [],
  );
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="animate-confetti absolute -top-4"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.round ? p.size : p.size * 0.5,
            background: p.color,
            borderRadius: p.round ? "50%" : 2,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
          }}
        />
      ))}
    </div>
  );
}

function buildWheel() {
  return SLICES.map((slice, i) => {
    const start = (i * 30 - 90) * (Math.PI / 180);
    const end = ((i + 1) * 30 - 90) * (Math.PI / 180);
    const x1 = 50 + 46 * Math.cos(start);
    const y1 = 50 + 46 * Math.sin(start);
    const x2 = 50 + 46 * Math.cos(end);
    const y2 = 50 + 46 * Math.sin(end);
    const midDeg = i * 30 + 15;
    const mid = (midDeg - 90) * (Math.PI / 180);
    const tx = 50 + 31 * Math.cos(mid);
    const ty = 50 + 31 * Math.sin(mid);
    const upright = midDeg;
    const fontSize = slice.small ? 2.4 : 3.15;
    const lineStep = slice.small ? 2.9 : 3.6;
    return (
      <g key={i}>
        <path d={`M50 50 L${x1} ${y1} A46 46 0 0 1 ${x2} ${y2} Z`} fill={slice.fill} />
        <text
          x={tx}
          y={ty}
          fill={slice.ink}
          fontSize={fontSize}
          fontFamily="Unbounded, sans-serif"
          fontWeight="700"
          textAnchor="middle"
          transform={`rotate(${upright} ${tx} ${ty})`}
        >
          {slice.lines.map((line, j) => (
            <tspan key={j} x={tx} y={ty + (j - (slice.lines.length - 1) / 2) * lineStep} dominantBaseline="central">
              {line}
            </tspan>
          ))}
        </text>
      </g>
    );
  });
}
