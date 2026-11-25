import { useMemo } from "react";
import { useGame } from "@/lib/game/store";
import { NPC_NAMES, dailySeed } from "@/lib/game/data";

export function Ranking({ ready }: { ready: boolean }) {
  const spins = useGame((s) => s.spins);
  const level = useGame((s) => levelFromXpSafe(s.xp));

  const rows = useMemo(() => {
    const seed = dailySeed();
    const npcs = NPC_NAMES.map((name, i) => {
      const h = (seed * (i + 7) * 2654435761) % 1000;
      return { name, score: 25 + (h % 140) + i * 3, npc: true };
    });
    const you = { name: "ВИ (мешканець)", score: spins, npc: false };
    return [...npcs, you].sort((a, b) => b.score - a.score);
  }, [spins]);

  const yourIndex = rows.findIndex((r) => !r.npc);

  return (
    <div>
      <p className="text-xs text-muted">Таблиця лідерів круток. Суперники вигадані, але сусід з бензогенератором — ні.</p>
      <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface">
        {rows.map((r, i) => (
          <div
            key={r.name}
            className={`flex items-center justify-between gap-2 border-b border-line/50 px-4 py-2.5 last:border-b-0 ${
              r.npc ? "" : "bg-amber/10"
            }`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className={`font-display w-8 text-center text-sm ${i === 0 ? "text-amber" : "text-muted"}`}>{i + 1}</span>
              <span className="truncate text-sm text-fg">{r.name}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs text-muted">
              {r.name === "ВИ (мешканець)" && ready ? (
                <span className="rounded-full bg-amber/15 px-2 py-0.5 text-[10px] text-amber uppercase">ранг {level}</span>
              ) : null}
              <span className="font-display text-amber">{r.score}</span>
            </div>
          </div>
        ))}
      </div>
      {ready ? (
        <p className="mt-2 text-center text-xs text-muted">
          Ваше місце: <span className="font-display text-amber">#{yourIndex + 1}</span> з {rows.length}. Крутіть далі, сусіди не сплять.
        </p>
      ) : null}
    </div>
  );
}

function levelFromXpSafe(xp: number): number {
  return Math.min(10, Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1);
}
