import { SHARDS_PER_TICKET, SHOP_PACKS, useGacha } from "@/lib/gacha/engine";
import { useGame } from "@/lib/game/store";
import { sfxCash, sfxClick } from "@/lib/gacha/audio";

export function Shop() {
  const fakeMoney = useGacha((s) => s.fakeMoney);
  const shards = useGacha((s) => s.shards);

  function buy(id: string) {
    const pack = useGacha.getState().buyPack(id);
    if (!pack) return;
    sfxCash();
    useGame.getState().pushToast(`+${pack.gems} кВт-гемів`, pack.roast, "#e8a317");
  }

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
      <div className="flex items-center justify-between rounded-xl border border-off/40 bg-off/10 px-3 py-2">
        <span className="text-xs text-fg">Витрачено фейкових грошей</span>
        <span className="font-display text-lg text-off">${fakeMoney.toFixed(2)}</span>
      </div>

      <ul className="mt-3 grid gap-2">
        {SHOP_PACKS.map((p, i) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => buy(p.id)}
              className={`relative flex w-full items-center justify-between gap-3 overflow-hidden rounded-xl border-2 p-3 text-left transition-transform active:scale-[0.98] ${
                i === 0 ? "border-amber bg-[linear-gradient(120deg,#3a2a08,#221f1a)]" : "border-line bg-surface"
              }`}
            >
              <span className="min-w-0">
                <span className="font-display inline-block rounded bg-off px-1.5 py-0.5 text-[10px] font-extrabold text-fg">{p.tag}</span>
                <span className="font-display mt-1 block text-sm text-fg">{p.name}</span>
                <span className="mt-0.5 block text-xs text-amber">{p.gems.toLocaleString("uk-UA")} кВт-гемів</span>
              </span>
              <span className="font-display shrink-0 rounded-full bg-amber px-3 py-2 text-sm font-extrabold text-ink">${p.price}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-center text-[10px] text-muted">Гроші фейкові. Біль справжній. Нічого не списується.</p>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[#a879f0]/40 bg-surface p-3">
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
