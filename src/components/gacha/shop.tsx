import { useState } from "react";
import { SHARDS_PER_TICKET, useGacha } from "@/lib/gacha/engine";
import { useGame } from "@/lib/game/store";
import { sfxClick } from "@/lib/gacha/audio";
import { performExchangeShards } from "@/lib/game/player";

export function Shop() {
  const shards = useGacha((s) => s.shards);
  const [exchanging, setExchanging] = useState(false);

  async function exchange() {
    if (exchanging || shards < SHARDS_PER_TICKET) return;
    sfxClick();
    setExchanging(true);
    try {
      await performExchangeShards();
      useGame
        .getState()
        .pushToast("Обмін виконано", "+1 талон на молитву. Копіум перетворено на надію.", "#a879f0");
    } catch (err) {
      const msg = err instanceof Error ? err.message : `Треба ${SHARDS_PER_TICKET} уламків копіуму.`;
      useGame.getState().pushToast("Мало копіуму", msg, "#d64545");
    } finally {
      setExchanging(false);
    }
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
          onClick={() => void exchange()}
          disabled={exchanging || shards < SHARDS_PER_TICKET}
          className="font-display min-h-10 shrink-0 rounded-full border border-[#a879f0]/60 px-4 text-xs font-bold text-[#a879f0] disabled:opacity-40"
        >
          обміняти
        </button>
      </div>
    </div>
  );
}
