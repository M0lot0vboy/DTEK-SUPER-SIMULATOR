import { useState } from "react";
import { X } from "lucide-react";
import { constellationOf, scaledBuff, useGacha } from "@/lib/gacha/engine";
import { EVAL_META, RARITY_COLOR, UNITS, type Rarity, type Unit } from "@/lib/gacha/pool";
import { useGame } from "@/lib/game/store";
import { sfxClick } from "@/lib/gacha/audio";
import { EvalBadge, Stars, UnitArt } from "./unit-art";

type Filter = "all" | Rarity;

const GRADE_COLOR: Record<string, string> = {
  C: "#9c9486",
  B: "#5ec4b3",
  A: "#4f8fe0",
  S: "#a879f0",
  "S+": "#e8a317",
  SSS: "#ff3355",
};

export function Codex() {
  const copies = useGacha((s) => s.copies);
  const loadout = useGacha((s) => s.loadout);
  const [filter, setFilter] = useState<Filter>("all");
  const [inspect, setInspect] = useState<Unit | null>(null);

  const list = UNITS.filter((u) => filter === "all" || u.rarity === filter);
  const owned = UNITS.filter((u) => copies[u.id]).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-xs tracking-widest text-muted uppercase">
          Кодекс Блекауту · {owned}/{UNITS.length}
        </p>
        <div className="flex gap-1" role="group" aria-label="Фільтр за рідкістю">
          {(["all", 5, 4, 3] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`font-display min-h-8 rounded-full border px-3 text-[11px] font-bold ${
                filter === f ? "border-amber/60 bg-amber/15 text-amber" : "border-line bg-surface text-muted"
              }`}
            >
              {f === "all" ? "усі" : `${f}★`}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {list.map((u) => {
          const count = copies[u.id] ?? 0;
          const locked = count === 0;
          return (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => setInspect(u)}
                className="flex w-full flex-col items-center rounded-xl border bg-surface p-2 text-center transition-transform active:scale-95"
                style={{ borderColor: locked ? "#3a342c" : `${RARITY_COLOR[u.rarity]}77` }}
              >
                <UnitArt unit={u} locked={locked} size="md" />
                <div className="mt-1.5 flex items-center gap-1">
                  <Stars rarity={u.rarity} className="text-[10px]" />
                  {!locked ? <EvalBadge unit={u} className="!min-w-5 !px-1 !text-[9px]" /> : null}
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] leading-tight text-fg">{locked ? "???" : u.name}</p>
                {!locked ? (
                  <p className="font-display mt-0.5 text-[9px] text-muted">
                    C{constellationOf(count)}
                    {loadout.includes(u.id) ? <span className="text-amber"> · у загоні</span> : null}
                  </p>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      {inspect ? <InspectDialog unit={inspect} onClose={() => setInspect(null)} /> : null}
    </div>
  );
}

function InspectDialog({ unit, onClose }: { unit: Unit; onClose: () => void }) {
  const count = useGacha((s) => s.copies[unit.id] ?? 0);
  const equipped = useGacha((s) => s.loadout.includes(unit.id));
  const locked = count === 0;
  const c = constellationOf(count);
  const buff = scaledBuff(unit, c);
  const color = RARITY_COLOR[unit.rarity];

  function equip() {
    sfxClick();
    const res = useGacha.getState().toggleEquip(unit.id);
    const toast = useGame.getState().pushToast;
    if (res === "full") toast("Загін повний", "Максимум 3 юніти. Когось доведеться принести в жертву.", "#d64545");
    if (res === "equipped") toast("Юніт у загоні", `${unit.name} тепер посилює симулятор`, color);
  }

  const buffLines = [
    buff.drain !== 1 ? `Розряд у темряві: ${buff.drain < 1 ? "−" : "+"}${Math.round(Math.abs(1 - buff.drain) * 100)}%` : null,
    buff.gems ? `кВт-геми за крутку: +${Math.round(buff.gems * 100)}%` : null,
    buff.onBonus ? `Павербанк при світлі: +${buff.onBonus}%` : null,
    buff.refund ? `Шанс подвоїти кВт-геми: ${Math.round(buff.refund * 100)}%` : null,
  ].filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#050403]/90 sm:items-center sm:px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={locked ? "Заблокований юніт" : unit.name}
        className="animate-toast max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border-2 bg-ink p-5 sm:rounded-2xl"
        style={{ borderColor: `${color}88` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          <UnitArt unit={unit} locked={locked} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Stars rarity={unit.rarity} />
              {!locked ? <EvalBadge unit={unit} /> : null}
            </div>
            <p className="font-display mt-1 text-lg leading-tight text-fg">{locked ? "Невідомий юніт" : unit.name}</p>
            <p className="mt-0.5 text-[11px] tracking-wide text-muted uppercase">{locked ? "Ще не з'явився з темряви" : unit.title}</p>
            {!locked ? (
              <p className="mt-1 text-[11px]" style={{ color: EVAL_META[unit.eval].color }}>
                Оцінка рушія: {EVAL_META[unit.eval].name}
              </p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full border border-line text-muted" aria-label="Закрити">
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {locked ? (
          <p className="mt-4 text-sm text-muted">Молись на банері, щоб розкрити цей юніт. Шанс маленький. Віра — ще менша.</p>
        ) : (
          <>
            {unit.subtitle ? <p className="mt-3 text-xs text-amber">{unit.subtitle}</p> : null}
            <p className="mt-3 text-sm text-muted">{unit.desc}</p>

            <dl className="mt-4 grid grid-cols-2 gap-2">
              {unit.stats.map((st) => (
                <div key={st.label} className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2">
                  <dt className="text-[11px] text-muted">{st.label}</dt>
                  <dd className="font-display text-sm">
                    <span className="text-fg">{st.value}</span>{" "}
                    <span style={{ color: GRADE_COLOR[st.grade] }}>{st.grade}</span>
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-4 rounded-lg border border-line bg-surface p-3">
              <p className="font-display text-[11px] tracking-widest text-amber uppercase">Пасивка · C{c}</p>
              <p className="mt-1 text-xs text-fg">{unit.passive}</p>
              <ul className="mt-2 space-y-0.5 text-[11px] text-muted">
                {buffLines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              {unit.ultimate ? (
                <>
                  <p className="font-display mt-3 text-[11px] tracking-widest text-[#ff3355] uppercase">Ультимейт</p>
                  <p className="mt-1 text-xs text-fg">{unit.ultimate}</p>
                </>
              ) : null}
            </div>

            <p className="font-display mt-4 text-[11px] tracking-widest text-muted uppercase">Сузір&apos;я · копій {count}</p>
            <ol className="mt-2 space-y-1.5">
              {unit.constellations.map((line, i) => {
                const active = c >= i + 1;
                return (
                  <li
                    key={i}
                    className={`rounded-lg border px-3 py-2 text-xs ${active ? "border-amber/40 bg-amber/10 text-fg" : "border-line bg-surface text-muted opacity-60"}`}
                  >
                    {line}
                  </li>
                );
              })}
            </ol>

            <button
              type="button"
              onClick={equip}
              className={`font-display mt-4 min-h-12 w-full rounded-full text-sm font-extrabold ${
                equipped ? "border border-line bg-surface text-muted" : "bg-amber text-ink"
              }`}
            >
              {equipped ? "прибрати із загону" : "додати в загін"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
