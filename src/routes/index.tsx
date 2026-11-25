import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Zap, ZapOff } from "lucide-react";

export const Route = createFileRoute("/")({ component: Home });

const SLICES = [
  { id: "off", label: "ОТКЛЮЧИЛИ" },
  { id: "on", label: "НЕ ОТКЛЮЧИЛИ" },
  { id: "off", label: "ОТКЛЮЧИЛИ" },
  { id: "on", label: "НЕ ОТКЛЮЧИЛИ" },
  { id: "off", label: "ОТКЛЮЧИЛИ" },
  { id: "on", label: "НЕ ОТКЛЮЧИЛИ" },
  { id: "off", label: "ОТКЛЮЧИЛИ" },
  { id: "on", label: "НЕ ОТКЛЮЧИЛИ" },
] as const;

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

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}

type Outcome = "off" | "on";

type Stats = { spins: number; off: number; on: number; last: Outcome[] };

const EMPTY: Stats = { spins: 0, off: 0, on: 0, last: [] };
const KEY = "dtek-roulette-v1";
const SLICE = 360 / SLICES.length;

function loadStats(): Stats {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Stats;
    if (!parsed || typeof parsed.spins !== "number") return EMPTY;
    return {
      spins: parsed.spins,
      off: parsed.off ?? 0,
      on: parsed.on ?? 0,
      last: Array.isArray(parsed.last) ? parsed.last.slice(0, 8) : [],
    };
  } catch {
    return EMPTY;
  }
}

function Home() {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<Outcome | null>(null);
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState("");
  const [bonus, setBonus] = useState("");
  const [flash, setFlash] = useState<Outcome | null>(null);
  const timer = useRef<number | null>(null);
  const audio = useRef<AudioContext | null>(null);

  useEffect(() => {
    setStats(loadStats());
    setReady(true);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  const wheelPath = useMemo(() => buildWheel(), []);

  function tick(freq: number, dur = 0.04) {
    const ctx = audio.current;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  function spin() {
    if (spinning) return;
    if (!audio.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audio.current = new Ctx();
    }
    void audio.current.resume();

    const index = Math.floor(Math.random() * SLICES.length);
    const outcome = SLICES[index].id;
    const turns = 5 + Math.floor(Math.random() * 3);
    const jitter = (Math.random() - 0.5) * (SLICE * 0.5);
    const currentMod = ((rotation % 360) + 360) % 360;
    const desiredMod = (((360 - (index * SLICE + SLICE / 2) + jitter) % 360) + 360) % 360;
    let delta = desiredMod - currentMod;
    if (delta < 0) delta += 360;
    const next = rotation + turns * 360 + delta;

    setSpinning(true);
    setResult(null);
    setFlash(null);
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
      tick(outcome === "off" ? 110 : 440, 0.18);
      setSpinning(false);
      setResult(outcome);
      setFlash(outcome);
      setNote(outcome === "off" ? pick(OFF_NOTES) : pick(ON_NOTES));
      setBonus(
        outcome === "off"
          ? pick(["свічка +1", "плед уже гріється", "ліхтарик на 12%", "сусід кричить «знову»"])
          : pick(["чайник дозволено", "вайфай ще дихає", "серіал не обірветься", "зарядка святкує"]),
      );
      setStats((prev) => {
        const updated: Stats = {
          spins: prev.spins + 1,
          off: prev.off + (outcome === "off" ? 1 : 0),
          on: prev.on + (outcome === "on" ? 1 : 0),
          last: [outcome, ...prev.last].slice(0, 8),
        };
        localStorage.setItem(KEY, JSON.stringify(updated));
        return updated;
      });
      window.setTimeout(() => setFlash(null), 700);
    }, duration);
  }

  const offShare = stats.spins ? Math.round((stats.off / stats.spins) * 100) : 50;

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-6 sm:px-6 sm:py-10">
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 transition-opacity duration-300 ${
          flash === "off" ? "bg-off/25 opacity-100" : flash === "on" ? "bg-amber/20 opacity-100" : "opacity-0"
        }`}
      />

      <header className="relative mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="font-display text-xs tracking-[0.22em] text-amber uppercase">графік не обіцяний</p>
          <h1 className="font-display mt-1 text-3xl leading-none font-extrabold sm:text-5xl">Рулетка ДТЕК</h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted sm:text-base">
            Крутиш колесо долі розетки. Або світло є, або вже піпець і свічки.
          </p>
        </div>
        <div className="hidden shrink-0 rounded-full border border-line bg-surface px-3 py-2 text-right sm:block">
          <p className="text-[11px] tracking-widest text-muted uppercase">сьогодні</p>
          <p className="font-display text-lg text-amber">{offShare}% темряви</p>
        </div>
      </header>

      <section className="relative flex flex-1 flex-col items-center">
        <div className="relative aspect-square w-full max-w-[min(100%,26rem)]">
          <div className="absolute top-0 left-1/2 z-20 -translate-x-1/2 -translate-y-1">
            <div className="h-0 w-0 border-x-[14px] border-t-[26px] border-x-transparent border-t-amber drop-shadow-[0_6px_0_#1a1612]" />
          </div>

          <div
            className="absolute inset-3 rounded-full border border-line bg-ink shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: spinning
                ? "transform 4.6s cubic-bezier(0.12, 0.72, 0.08, 1)"
                : "none",
            }}
          >
            <svg viewBox="0 0 100 100" className="h-full w-full">
              {wheelPath}
              <circle cx="50" cy="50" r="8" fill="#141210" stroke="#e8a317" strokeWidth="1.4" />
              <text
                x="50"
                y="51.4"
                textAnchor="middle"
                fill="#e8a317"
                fontSize="4.2"
                fontFamily="Unbounded, sans-serif"
              >
                ДТЕК
              </text>
            </svg>
          </div>
        </div>

        <button
          type="button"
          onClick={spin}
          disabled={spinning}
          className="font-display relative z-10 mt-8 min-h-14 w-full max-w-xs rounded-full bg-amber px-8 text-base font-extrabold tracking-wide text-ink transition-transform enabled:hover:scale-[1.02] enabled:active:scale-[0.98] disabled:opacity-60"
        >
          {spinning ? "рахуємо графік…" : result ? "ще раз" : "крутити"}
        </button>

        <div className="mt-6 min-h-28 w-full max-w-md text-center" aria-live="polite">
          {!ready || (!result && !spinning) ? (
            <p className="text-muted">Чотири «вимкнули» і чотири «не вимкнули». Шанси чесні. Реальність — ні.</p>
          ) : null}
          {spinning ? <p className="font-display text-lg text-amber">колесо думає…</p> : null}
          {result === "off" && !spinning ? (
            <div className="rounded-2xl border border-off/40 bg-surface px-5 py-4">
              <p className="font-display flex items-center justify-center gap-2 text-2xl text-off">
                <ZapOff className="size-6" aria-hidden />
                ВИМКНУЛИ
              </p>
              <p className="mt-2 text-sm text-muted">{note}</p>
              <p className="font-display mt-3 text-xs tracking-widest text-off uppercase">{bonus}</p>
            </div>
          ) : null}
          {result === "on" && !spinning ? (
            <div className="rounded-2xl border border-amber/40 bg-surface px-5 py-4">
              <p className="font-display flex items-center justify-center gap-2 text-2xl text-amber">
                <Zap className="size-6" aria-hidden />
                НЕ ВИМКНУЛИ
              </p>
              <p className="mt-2 text-sm text-muted">{note}</p>
              <p className="font-display mt-3 text-xs tracking-widest text-amber uppercase">{bonus}</p>
            </div>
          ) : null}
        </div>
      </section>

      <footer className="relative mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="круток" value={String(stats.spins)} />
        <Stat label="темряви" value={String(stats.off)} tone="off" />
        <Stat label="світла" value={String(stats.on)} tone="on" />
        {stats.last.length > 0 ? (
          <div className="col-span-3 mt-2 flex flex-wrap justify-center gap-1.5">
            {stats.last.map((item, i) => (
              <span
                key={`${item}-${i}`}
                className={`rounded-full px-2.5 py-1 text-[11px] tracking-wide uppercase ${
                  item === "off" ? "bg-off/15 text-off" : "bg-amber/15 text-amber"
                }`}
              >
                {item === "off" ? "вимк" : "є"}
              </span>
            ))}
          </div>
        ) : null}
      </footer>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "off" | "on" }) {
  const color = tone === "off" ? "text-off" : tone === "on" ? "text-amber" : "text-fg";
  return (
    <div className="rounded-2xl border border-line bg-surface px-2 py-3">
      <p className={`font-display text-2xl ${color}`}>{value}</p>
      <p className="text-[11px] tracking-widest text-muted uppercase">{label}</p>
    </div>
  );
}

function buildWheel() {
  return SLICES.map((slice, i) => {
    const start = (i * SLICE - 90) * (Math.PI / 180);
    const end = ((i + 1) * SLICE - 90) * (Math.PI / 180);
    const large = SLICE > 180 ? 1 : 0;
    const x1 = 50 + 46 * Math.cos(start);
    const y1 = 50 + 46 * Math.sin(start);
    const x2 = 50 + 46 * Math.cos(end);
    const y2 = 50 + 46 * Math.sin(end);
    const midDeg = i * SLICE + SLICE / 2;
    const mid = (midDeg - 90) * (Math.PI / 180);
    const tx = 50 + 31 * Math.cos(mid);
    const ty = 50 + 31 * Math.sin(mid);
    const fill = slice.id === "off" ? "#d64545" : "#e8a317";
    const ink = slice.id === "off" ? "#f4efe6" : "#1a1612";
    const upright = midDeg;
    return (
      <g key={i}>
        <path d={`M50 50 L${x1} ${y1} A46 46 0 ${large} 1 ${x2} ${y2} Z`} fill={fill} />
        <text
          x={tx}
          y={ty}
          fill={ink}
          fontSize="3.15"
          fontFamily="Unbounded, sans-serif"
          fontWeight="700"
          textAnchor="middle"
          dominantBaseline="middle"
          transform={`rotate(${upright} ${tx} ${ty})`}
        >
          {slice.id === "off" ? "ВИМК" : "Є"}
        </text>
      </g>
    );
  });
}
