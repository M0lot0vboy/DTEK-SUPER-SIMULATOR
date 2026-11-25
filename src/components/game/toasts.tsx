import { useGame } from "@/lib/game/store";
import { Trophy } from "lucide-react";

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed right-3 bottom-3 z-50 flex flex-col items-end gap-2">
      {toasts.map((t) => (
        <div
          key={t.key}
          className="animate-toast flex max-w-xs items-center gap-2.5 rounded-2xl border bg-ink px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
          style={{ borderColor: `${t.color ?? "#e8a317"}66` }}
        >
          <Trophy className="size-5 shrink-0" style={{ color: t.color ?? "#e8a317" }} aria-hidden />
          <div>
            <p className="font-display text-xs" style={{ color: t.color ?? "#e8a317" }}>
              {t.name}
            </p>
            <p className="text-[11px] text-muted">{t.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
