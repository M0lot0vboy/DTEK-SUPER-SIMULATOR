import { useState } from "react";
import { Award, Check, Shield } from "lucide-react";
import { MAX_RELIC_LOADOUT, formatRelicStats, type CustomRelic } from "@/lib/gacha/engine";
import { useGacha } from "@/lib/gacha/engine";
import { performToggleRelic } from "@/lib/game/player";
import { useGame } from "@/lib/game/store";

export function RelicShowcase({ ready = true }: { ready?: boolean }) {
  const customItems = useGacha((s) => s.customItems);
  const equippedRelics = useGacha((s) => s.equippedRelics);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggle(relic: CustomRelic) {
    if (!ready || busyId) return;
    setBusyId(relic.id);
    try {
      const res = await performToggleRelic(relic.id);
      if (res.status === "equipped") {
        useGame.getState().pushToast("Реліквію споряджено", `${relic.emoji} ${relic.name} тепер підсилює колесо`, "#e8a317");
      } else if (res.status === "removed") {
        useGame.getState().pushToast("Реліквію знято", relic.name, "#9c9486");
      } else if (res.status === "full") {
        useGame
          .getState()
          .pushToast("Слоти реліквій заповнені", `Можна спорядити максимум ${MAX_RELIC_LOADOUT} трофеї. Спочатку зніми один.`, "#d64545");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Не вдалося змінити реліквію";
      useGame.getState().pushToast("Помилка", msg, "#d64545");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-amber/35 bg-[linear-gradient(135deg,#1f190d,#141210_70%)] p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display flex items-center gap-1.5 text-xs tracking-wider text-amber uppercase">
          <Award className="size-4" aria-hidden /> Трофеї турнірів ({ready ? customItems.length : 0})
        </p>
        <span className="font-mono text-[11px] text-muted">
          Споряджено: <strong className="text-fg">{ready ? equippedRelics.length : 0}/{MAX_RELIC_LOADOUT}</strong>
        </span>
      </div>

      {!ready || customItems.length === 0 ? (
        <p className="mt-2 rounded-xl border border-dashed border-line bg-ink/60 px-3 py-2.5 text-[11px] text-muted">
          Увійди у <strong className="text-amber">Топ-2</strong> турніру <strong className="text-fg">«Блекаут-Ралі»</strong> у вкладці ⚡ турнір, щоб вибороти ексклюзивну кастомну реліквію з бонусами для Ісекаю!
        </p>
      ) : (
        <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
          {customItems.map((relic) => {
            const isEquipped = equippedRelics.includes(relic.id);
            const stats = formatRelicStats(relic);
            const placeTone =
              relic.place === 1
                ? "border-amber/60 bg-amber/10 text-amber"
                : "border-[#cbd5e1]/50 bg-[#cbd5e1]/10 text-[#e2e8f0]";
            return (
              <div
                key={relic.id}
                className={`flex flex-col justify-between rounded-xl border p-3 ${
                  isEquipped ? "border-amber bg-ink shadow-[0_0_20px_rgba(232,163,23,0.12)]" : "border-line bg-ink/90"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-amber/30 bg-surface text-xl">
                        {relic.emoji}
                      </span>
                      <div className="min-w-0">
                        <h4 className="font-display text-sm leading-tight font-bold text-fg line-clamp-2">{relic.name}</h4>
                        <span className={`mt-0.5 inline-block rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${placeTone}`}>
                          {relic.place === 1 ? "🥇 ТОП-1" : "🥈 ТОП-2"} · {relic.tournamentTitle || `#${relic.tournamentId}`}
                        </span>
                      </div>
                    </div>
                  </div>
                  {relic.lore ? <p className="mt-2 text-[11px] leading-snug text-muted">{relic.lore}</p> : null}
                  {stats.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {stats.map((st) => (
                        <span
                          key={st}
                          className="rounded border border-amber/25 bg-surface px-1.5 py-0.5 font-mono text-[10px] text-amber"
                        >
                          {st}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => void toggle(relic)}
                  className={`font-display mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition-colors ${
                    isEquipped
                      ? "border border-on/40 bg-on/15 text-on hover:bg-on/25"
                      : "bg-amber text-ink hover:opacity-90"
                  }`}
                >
                  {isEquipped ? (
                    <>
                      <Check className="size-3.5" aria-hidden /> Споряджено (зняти)
                    </>
                  ) : (
                    <>
                      <Shield className="size-3.5" aria-hidden /> Спорядити ({equippedRelics.length}/{MAX_RELIC_LOADOUT})
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
