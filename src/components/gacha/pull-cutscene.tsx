import { useEffect, useMemo, useState } from "react";
import { Copy, SkipForward } from "lucide-react";
import type { PullOutcome } from "@/lib/gacha/engine";
import { RARITY_COLOR, unitById, type Rarity } from "@/lib/gacha/pool";
import { sfxBassDrop, sfxCharge, sfxChime, sfxCrackle, sfxJumpscare } from "@/lib/gacha/audio";
import { EvalBadge, Stars, SubstationFire, UnitArt } from "./unit-art";

type Phase = "charge" | "surge" | "black" | "jumpscare" | "reveal";

export function PullCutscene({
  results,
  onClose,
  onAgain,
  onFlex,
}: {
  results: PullOutcome[];
  onClose: () => void;
  onAgain: () => void;
  onFlex: () => void;
}) {
  const top = useMemo<Rarity>(() => results.reduce<Rarity>((m, r) => (r.rarity > m ? r.rarity : m), 3), [results]);
  const lost = results.some((r) => r.lost5050);
  const fakeout = !lost && results.some((r) => r.fakeout);
  const [phase, setPhase] = useState<Phase>("charge");
  const startColor = fakeout ? (Math.random() < 0.5 ? RARITY_COLOR[3] : RARITY_COLOR[4]) : RARITY_COLOR[top];
  const [color, setColor] = useState(startColor);

  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, reduce ? Math.min(ms, 50) : ms));

    sfxCharge(1.5);
    if (fakeout) {
      at(1500, () => {
        setPhase("surge");
        sfxCrackle();
      });
      at(2000, () => {
        setColor(RARITY_COLOR[5]);
        sfxCrackle();
      });
      at(2600, () => {
        sfxBassDrop();
        sfxChime(5);
        setPhase("reveal");
      });
    } else if (lost) {
      at(1500, () => {
        sfxBassDrop();
        setPhase("black");
      });
      at(2500, () => {
        sfxJumpscare();
        setPhase("jumpscare");
      });
    } else {
      at(1500, () => {
        if (top === 5) sfxBassDrop();
        sfxChime(top);
        setPhase("reveal");
      });
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function skip() {
    if (lost && phase !== "jumpscare") {
      sfxJumpscare();
      setPhase("jumpscare");
      return;
    }
    setPhase("reveal");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#050403] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Результат молитви"
    >
      {phase === "charge" || phase === "surge" ? (
        <div className={`absolute inset-0 ${top === 5 || fakeout || lost ? "gacha-shake" : ""}`}>
          <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 60%, ${color}33, transparent 60%)` }} />
          <div className="gacha-meteor absolute top-0 left-1/2 h-[140%] w-3 -translate-x-1/2 rounded-full" style={{ background: `linear-gradient(${color}, transparent)`, boxShadow: `0 0 40px 12px ${color}` }} />
          <div className="absolute bottom-[22%] left-1/2 flex -translate-x-1/2 flex-col items-center">
            <svg viewBox="0 0 80 80" className="size-28" aria-hidden>
              <rect x="18" y="26" width="44" height="40" rx="4" fill="#221f1a" stroke={color} strokeWidth="3" />
              <path d="M28 26 V14 M40 26 V10 M52 26 V14" stroke={color} strokeWidth="4" strokeLinecap="round" />
              <path d="M42 34 L32 48 L40 48 L36 60 L50 42 L42 42 Z" fill={color} />
            </svg>
            <p className="font-display mt-2 text-xs tracking-[0.3em] uppercase" style={{ color }}>
              {phase === "surge" ? "стрибок напруги!" : "трансформатор заряджається"}
            </p>
          </div>
          {phase === "surge" ? <div className="gacha-glitch absolute inset-0" /> : null}
        </div>
      ) : null}

      {phase === "black" ? <div className="absolute inset-0 bg-black" /> : null}

      {phase === "jumpscare" ? <Jumpscare onContinue={() => setPhase("reveal")} /> : null}

      {phase === "reveal" ? (
        <Reveal results={results} onClose={onClose} onAgain={onAgain} onFlex={onFlex} />
      ) : null}

      {phase !== "reveal" && phase !== "jumpscare" ? (
        <button
          type="button"
          onClick={skip}
          className="font-display absolute top-4 right-4 z-10 flex min-h-10 items-center gap-1.5 rounded-full border border-line bg-surface/80 px-4 text-xs font-bold text-fg"
        >
          <SkipForward className="size-3.5" aria-hidden /> пропустити
        </button>
      ) : null}
    </div>
  );
}

function Jumpscare({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="gacha-jumpscare absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_50%_55%,#5a0d1c,#050403_70%)] px-6 text-center">
      <div className="gacha-shake flex flex-col items-center">
        <p className="font-display text-xs tracking-[0.4em] text-[#ff3355] uppercase">50/50 програно · мат</p>
        <SubstationFire className="mt-4 size-48 sm:size-56" />
        <p className="font-display mt-2 text-3xl leading-tight font-extrabold text-[#ffe066] sm:text-5xl [text-shadow:0_0_24px_#ff3355]">
          ВОГОНЬ НА ПІДСТАНЦІЇ!
        </p>
        <p className="font-display mt-3 text-sm tracking-[0.3em] text-fg uppercase">Конгрегація · Демон Підстанції</p>
        <p className="mt-4 max-w-sm text-sm text-muted">
          Золотий метеорит був брехнею. Ти отримав АВАРІЙНЕ ВІДКЛЮЧЕННЯ. Наступний 5★ гарантовано рекомендований.
        </p>
      </div>
      <button
        type="button"
        onClick={onContinue}
        className="font-display mt-8 min-h-12 rounded-full bg-[#ff3355] px-8 text-sm font-extrabold text-[#0d0b09]"
      >
        прийняти долю
      </button>
    </div>
  );
}

function Reveal({
  results,
  onClose,
  onAgain,
  onFlex,
}: {
  results: PullOutcome[];
  onClose: () => void;
  onAgain: () => void;
  onFlex: () => void;
}) {
  const single = results.length === 1;
  return (
    <div className="animate-toast relative flex max-h-dvh w-full max-w-2xl flex-col overflow-y-auto py-6">
      <p className="font-display text-center text-xs tracking-[0.3em] text-amber uppercase">результат молитви</p>
      {single ? (
        <SingleCard result={results[0]!} />
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {results.map((r, i) => (
            <MiniCard key={i} result={r} delay={i * 70} />
          ))}
        </ul>
      )}
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={onFlex} className="font-display flex min-h-11 items-center gap-1.5 rounded-full border border-amber/50 bg-ink px-5 text-sm font-bold text-amber">
          <Copy className="size-4" aria-hidden /> скопіювати флекс
        </button>
        <button type="button" onClick={onAgain} className="font-display min-h-11 rounded-full bg-amber px-5 text-sm font-bold text-ink">
          ще ×{results.length}
        </button>
        <button type="button" onClick={onClose} className="font-display min-h-11 rounded-full border border-line bg-surface px-5 text-sm font-bold text-muted">
          закрити
        </button>
      </div>
    </div>
  );
}

function Tag({ result }: { result: PullOutcome }) {
  if (result.lost5050) return <span className="text-[#ff3355]">ПРОГРАВ 50/50</span>;
  if (result.isNew) return <span className="text-[#7dd694]">НОВЕ</span>;
  return (
    <span className="text-muted">
      C{result.constellation} · +{result.shards} копіуму
    </span>
  );
}

function SingleCard({ result }: { result: PullOutcome }) {
  const unit = unitById(result.unitId);
  const color = RARITY_COLOR[unit.rarity];
  return (
    <div className="mx-auto mt-4 flex w-full max-w-sm flex-col items-center rounded-2xl border-2 bg-ink p-6 text-center" style={{ borderColor: color, boxShadow: `0 0 60px ${color}55` }}>
      <UnitArt unit={unit} size="lg" />
      <div className="mt-4 flex items-center gap-2">
        <Stars rarity={unit.rarity} className="text-lg" />
        <EvalBadge unit={unit} />
      </div>
      <p className="font-display mt-2 text-xl text-fg">{unit.name}</p>
      <p className="text-xs tracking-wide text-muted uppercase">{unit.title}</p>
      {unit.subtitle ? <p className="mt-1 text-xs text-amber">{unit.subtitle}</p> : null}
      <p className="font-display mt-3 text-[11px] tracking-widest uppercase">
        <Tag result={result} />
      </p>
      <p className="mt-3 text-sm text-muted">{unit.desc}</p>
    </div>
  );
}

function MiniCard({ result, delay }: { result: PullOutcome; delay: number }) {
  const unit = unitById(result.unitId);
  const color = RARITY_COLOR[unit.rarity];
  return (
    <li
      className="gacha-card-in flex flex-col items-center rounded-xl border-2 bg-ink p-2 text-center"
      style={{ borderColor: `${color}aa`, boxShadow: unit.rarity === 5 ? `0 0 24px ${color}88` : undefined, animationDelay: `${delay}ms` }}
    >
      <UnitArt unit={unit} size="md" />
      <div className="mt-1.5 flex items-center gap-1">
        <Stars rarity={unit.rarity} className="text-[11px]" />
        <EvalBadge unit={unit} className="!min-w-5 !px-1 !text-[9px]" />
      </div>
      <p className="mt-1 line-clamp-2 text-[11px] leading-tight text-fg">{unit.name}</p>
      <p className="font-display mt-1 text-[9px] tracking-wider uppercase">
        <Tag result={result} />
      </p>
    </li>
  );
}
