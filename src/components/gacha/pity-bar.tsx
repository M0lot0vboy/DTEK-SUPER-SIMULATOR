import { HARD_PITY, PITY_4, SOFT_PITY } from "@/lib/gacha/engine";

const TAUNTS = [
  "98%. Класика. Ти тут помреш.",
  "99%. Шип на останньому кадрі.",
  "Майже. Як і світло о 18:00.",
];

export function PityBar({
  pity5,
  pity4,
  guaranteed,
  attempts,
}: {
  pity5: number;
  pity4: number;
  guaranteed: boolean;
  attempts: number;
}) {
  const pct = Math.min(100, Math.floor((pity5 / HARD_PITY) * 1000) / 10);
  const taunting = pity5 >= HARD_PITY - 2;
  const soft = pity5 >= SOFT_PITY;
  const taunt = TAUNTS[pity5 % TAUNTS.length];

  return (
    <div className={`rounded-xl border border-line bg-ink p-3 ${taunting ? "gacha-shake-soft" : ""}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] tracking-widest text-muted uppercase">
        <span className="font-display">Атемпт {attempts + 1}</span>
        <span className="font-display">
          {soft ? <span className="text-off">м&apos;який гарант · </span> : null}
          гарант 5★ {pity5}/{HARD_PITY}
        </span>
      </div>
      <div
        className="relative h-5 overflow-hidden rounded-full border-2 border-[#0d0b09] bg-[#2a251f]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={HARD_PITY}
        aria-valuenow={pity5}
        aria-label="Прогрес до гарантованого 5★"
      >
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: taunting
              ? "linear-gradient(90deg,#4fae63,#e8a317,#d64545)"
              : "linear-gradient(90deg,#4fae63,#7dd694)",
          }}
        />
        <span className="font-display absolute inset-0 grid place-items-center text-[11px] font-extrabold text-fg [text-shadow:0_1px_0_#0d0b09,0_-1px_0_#0d0b09,1px_0_0_#0d0b09,-1px_0_0_#0d0b09]">
          {pct}%
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-muted">
        <span>
          4★ через <span className="font-display text-[#a879f0]">{Math.max(0, PITY_4 - pity4)}</span>
        </span>
        {taunting ? (
          <span className="font-display text-off">{taunt}</span>
        ) : guaranteed ? (
          <span className="font-display text-amber">наступний 5★ — рекомендований</span>
        ) : (
          <span>50/50 активне</span>
        )}
      </div>
    </div>
  );
}
