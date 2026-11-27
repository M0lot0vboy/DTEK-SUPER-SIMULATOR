import { SHARDS_PER_TICKET, useGacha } from "@/lib/gacha/engine";
import { useGame } from "@/lib/game/store";
import { sfxClick } from "@/lib/gacha/audio";

export function Shop() {
  const shards = useGacha((s) => s.shards);

  function exchange() {
    sfxClick();
    const ok = useGacha.getState().exchangeShards();
    useGame
      .getState()
      .pushToast(
        ok ? "Обмін виконано" : "Мало копіуму",
        ok ? "+1 талон на молитву. Копіум перетворено на надію." : `Треба ${SHARDS_PER_TICKET} уламків копіуму.`,
        ok ? "#a879f0" : "#d64545",
      );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-[#a879f0]/40 bg-surface p-3">
        <div>
          <p className="font-display text-sm text-[#a879f0]">Обмін копіуму</p>
          <p className="text-xs text-muted">
            {SHARDS_PER_TICKET} уламків → 1 талон на молитву · є {shards}
          </p>
        </div>
        <button
          type="button"
          onClick={exchange}
          disabled={shards < SHARDS_PER_TICKET}
          className="font-display min-h-10 shrink-0 rounded-full border border-[#a879f0]/60 px-4 text-xs font-bold text-[#a879f0] disabled:opacity-40"
        >
          обміняти
        </button>
      </div>
    </div>
  );
}
