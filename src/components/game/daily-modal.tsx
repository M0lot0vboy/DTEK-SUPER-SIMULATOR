import { useGame } from "@/lib/game/store";
import { Sparkles } from "lucide-react";

export function DailyModal({ onClaim }: { onClaim: () => void }) {
  const claimDaily = useGame((s) => s.claimDaily);
  const dailyStreak = useGame((s) => s.dailyStreak);

  function claim() {
    const res = claimDaily();
    if (res) useGame.getState().pushToast("Щоденний вхід", `+${res.reward} кВт·год · серія ${res.streak} дн.`, "#7dd694");
    onClaim();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#050403]/95 px-4">
      <div className="animate-toast w-full max-w-sm rounded-2xl border border-amber/40 bg-ink p-6 text-center">
        <p className="font-display flex items-center justify-center gap-2 text-xs tracking-widest text-amber uppercase">
          <Sparkles className="size-4" aria-hidden /> щоденний вхід
        </p>
        <p className="font-display mt-3 text-3xl text-fg">+{100 + Math.min(4, dailyStreak + 1) * 25} кВт·год</p>
        <p className="mt-2 text-sm text-muted">
          Серія входів: {dailyStreak + 1}. Стабільність +2. Пропустите день — сусід забере бонус.
        </p>
        <button
          type="button"
          onClick={claim}
          className="font-display mt-5 min-h-12 w-full rounded-full bg-amber text-base font-bold text-ink transition-transform active:scale-95"
        >
          забрати нагороду
        </button>
        <p className="mt-2 text-[10px] text-muted">Відмова неможлива. ДТЕК стежить.</p>
      </div>
    </div>
  );
}
