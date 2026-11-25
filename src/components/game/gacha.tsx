import { useState } from "react";
import { useGame, type PullResult } from "@/lib/game/store";
import { ARTIFACTS, GACHA_COST, PET, starColor } from "@/lib/game/data";
import { chord, tick } from "@/lib/game/audio";

export function Gacha({ ready }: { ready: boolean }) {
  const kw = useGame((s) => s.kw);
  const pity4 = useGame((s) => s.pity4);
  const pity5 = useGame((s) => s.pity5);
  const pulls = useGame((s) => s.pulls);
  const inv = useGame((s) => s.inv);
  const petId = useGame((s) => s.pet);
  const pullAction = useGame((s) => s.pull);
  const [results, setResults] = useState<PullResult[] | null>(null);

  function doPull(count: number) {
    const cost = GACHA_COST * count;
    if (kw < cost) {
      useGame.getState().pushToast("Не вистачає кВт·год", `Треба ${cost}, є ${kw}. Крути колесо!`, "#d64545");
      return;
    }
    const res = pullAction(count);
    if (!res.length) return;
    tick(660, 0.08);
    if (res.some((r) => r.stars === 5)) chord([523, 659, 784, 1047]);
    else if (res.some((r) => r.stars === 4)) chord([523, 659]);
    setResults(res);
  }

  const owned = ARTIFACTS.flat().filter((a) => (inv[a.id] ?? 0) > 0);
  const pet = PET.find((p) => p.id === petId);

  return (
    <div>
      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-display text-sm text-amber">🌟 Банер «Свічкова Епоха»</p>
            <p className="mt-1 text-xs text-muted">
              Заклинки не дають нічого корисного. Але як красиво вони це роблять.
            </p>
          </div>
          <div className="text-right text-[11px] text-muted">
            <p>заклинок: {ready ? pulls : 0}</p>
            <p>до гарантованих 5★: {ready ? Math.max(0, 90 - pity5) : 90}</p>
            <p>до гарантованих 4★: {ready ? Math.max(0, 10 - pity4) : 10}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => doPull(1)}
            className="font-display min-h-11 flex-1 rounded-full bg-amber px-4 text-sm font-bold text-ink transition-transform enabled:active:scale-95"
          >
            ×1 · {GACHA_COST} кВт
          </button>
          <button
            type="button"
            onClick={() => doPull(10)}
            className="font-display min-h-11 flex-1 rounded-full border border-amber/50 bg-ink px-4 text-sm font-bold text-amber transition-transform enabled:active:scale-95"
          >
            ×10 · {GACHA_COST * 10} кВт
          </button>
        </div>
      </div>

      {pet ? (
        <div className="mt-3 rounded-2xl border border-amber/30 bg-ink p-4">
          <p className="font-display text-sm text-amber">компаньйон</p>
          <div className="mt-2 flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-full border border-line bg-surface text-2xl">{pet.emoji}</span>
            <div>
              <p className="text-sm text-fg">{pet.name}</p>
              <p className="text-xs text-muted">{pet.perk}</p>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-3 rounded-2xl border border-line bg-surface p-4 text-center text-xs text-muted">
          Піймай 5★ — і до тебе приєднається компаньйон. Він теж нічого не фіксить.
        </p>
      )}

      <p className="font-display mt-4 text-xs tracking-widest text-muted uppercase">інвентар ({owned.length})</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {owned.map((a) => {
          const stars = ARTIFACTS.findIndex((pool) => pool.includes(a)) + 1;
          const color = starColor(stars);
          return (
            <div key={a.id} className="rounded-xl border bg-surface p-3" style={{ borderColor: `${color}55` }}>
              <p className="text-lg">{a.emoji}</p>
              <p className="text-xs text-fg">{a.name}</p>
              <p className="text-[10px]" style={{ color }}>{"★".repeat(stars)}</p>
              <p className="mt-1 text-[10px] text-muted">{a.desc}</p>
              <p className="mt-1 text-[10px] text-muted">×{inv[a.id]}</p>
            </div>
          );
        })}
        {owned.length === 0 ? (
          <p className="col-span-full rounded-xl border border-line bg-surface p-4 text-center text-xs text-muted">
            Порожньо. Тільки надія.
          </p>
        ) : null}
      </div>

      {results ? <PullModal results={results} onClose={() => setResults(null)} /> : null}
    </div>
  );
}

function PullModal({ results, onClose }: { results: PullResult[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#050403]/95 px-4" onClick={onClose}>
      <div className="animate-toast max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-amber/40 bg-ink p-5" onClick={(e) => e.stopPropagation()}>
        <p className="font-display text-center text-sm tracking-widest text-amber uppercase">зіркопади!</p>
        <div className="mt-4 grid gap-2">
          {results.map((r, i) => {
            const a = ARTIFACTS.flat().find((x) => x.id === r.artifactId)!;
            const color = starColor(r.stars);
            return (
              <div key={i} className="flex items-center gap-3 rounded-xl border bg-surface p-3" style={{ borderColor: `${color}66` }}>
                <span className="text-2xl">{a.emoji}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm text-fg">{a.name}</p>
                  <p className="text-[10px]" style={{ color }}>{"★".repeat(r.stars)}</p>
                </div>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="font-display mt-4 min-h-11 w-full rounded-full bg-amber text-sm font-bold text-ink"
        >
          окей, це було марно
        </button>
      </div>
    </div>
  );
}
