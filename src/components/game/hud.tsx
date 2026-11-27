import { useEffect, useState } from "react";
import { useGame } from "@/lib/game/store";
import { levelFromXp, titleFor, xpForLevel } from "@/lib/game/data";

const PET_EMOJI: Record<string, string> = { cat: "🐈‍⬛", hamster: "🐹", dove: "🕊️" };

export function Hud({ ready }: { ready: boolean }) {
  const kw = useGame((s) => s.kw);
  const xp = useGame((s) => s.xp);
  const pet = useGame((s) => s.pet);
  const [, setNow] = useState(0);

  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, []);

  const level = levelFromXp(xp);
  const title = titleFor(level);
  const prevXp = xpForLevel(level);
  const nextXp = xpForLevel(level + 1);
  const progress =
    level >= 10 ? 100 : Math.min(100, Math.round(((xp - prevXp) / Math.max(1, nextXp - prevXp)) * 100));

  return (
    <section className="relative mb-4 flex items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-2.5">
      <span className="grid size-10 shrink-0 place-items-center rounded-full border border-amber/40 bg-ink text-lg">
        {ready && pet ? PET_EMOJI[pet] ?? "🧑‍🔧" : "🧑‍🔧"}
      </span>
      <div className="min-w-0 shrink-0">
        <p className="font-display text-sm leading-tight text-fg">
          <span className="text-amber">Ранг {ready ? level : 1}</span>
        </p>
        <p className="truncate text-[10px] tracking-wide text-muted uppercase">{ready ? title : "Новосел"}</p>
      </div>
      <div className="min-w-20 max-w-40 flex-1">
        <div className="mb-1 flex justify-between text-[9px] tracking-widest text-muted uppercase">
          <span>досвід</span>
          <span>{ready ? `${xp}/${level >= 10 ? "max" : nextXp}` : "0/100"}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-ink">
          <div className="h-full rounded-full bg-amber transition-all duration-500" style={{ width: `${ready ? progress : 0}%` }} />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 text-xs">
        <span title="кВт·год — валюта для гачі" className="flex items-center gap-1 rounded-full border border-line bg-ink px-2 py-1">
          ⚡ <span className="font-display text-amber">{ready ? kw : 0}</span>
        </span>
      </div>
    </section>
  );
}
