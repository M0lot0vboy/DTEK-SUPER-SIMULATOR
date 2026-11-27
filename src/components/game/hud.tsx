import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
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
    <section className="sticky top-2 z-30 mb-4 flex items-center gap-2 rounded-2xl border border-line bg-surface/95 px-2.5 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur sm:gap-3 sm:px-3 sm:py-2.5">
      <span className="grid size-10 shrink-0 place-items-center rounded-full border border-amber/40 bg-ink text-lg">
        {ready && pet ? PET_EMOJI[pet] ?? "🧑‍🔧" : "🧑‍🔧"}
      </span>
      <div className="min-w-0 shrink-0">
        <p className="font-display text-sm leading-tight text-fg">
          <span className="text-amber">Ранг {ready ? level : 1}</span>
        </p>
        <p className="truncate text-[10px] tracking-wide text-muted uppercase">{ready ? title : "Новосел"}</p>
      </div>
      <div className="hidden min-w-20 max-w-40 flex-1 min-[380px]:block">
        <div className="mb-1 flex justify-between text-[9px] tracking-widest text-muted uppercase">
          <span>досвід</span>
          <span>{ready ? `${xp}/${level >= 10 ? "max" : nextXp}` : "0/100"}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-ink">
          <div className="h-full rounded-full bg-amber transition-all duration-500" style={{ width: `${ready ? progress : 0}%` }} />
        </div>
      </div>
      <div className="ml-auto flex shrink-0 flex-col items-end">
        <span
          title="кВт·год — енергія для гачі"
          className="flex items-center gap-1 rounded-full border border-amber/50 bg-ink px-2 py-1"
        >
          <Zap className="size-3.5 fill-amber text-amber" aria-hidden />
          <span className="font-display text-sm text-amber">{ready ? kw : 0}</span>
        </span>
        <span className="mt-0.5 text-[9px] tracking-widest text-muted uppercase">енергія кВт</span>
      </div>
    </section>
  );
}
