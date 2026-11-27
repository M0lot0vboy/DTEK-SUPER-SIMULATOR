import { useState } from "react";
import { Check, Gift, Skull, Swords, Trophy } from "lucide-react";
import { BOSS_MAX_HP, BP_MAX_TIER, BP_TIER_SPINS, QUESTS, bpReward, kyivTodayKey } from "@/lib/game/data";
import { performClaimQuestReward } from "@/lib/game/player";
import { useGame } from "@/lib/game/store";
import { useGacha } from "@/lib/gacha/engine";

export function Quests({ ready }: { ready: boolean }) {
  const spins = useGame((s) => s.spins);
  const daily = useGame((s) => s.daily);
  const questsClaimed = useGacha((s) => s.questsClaimed);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const dayKey = kyivTodayKey();
  const claimedSet = new Set(questsClaimed);

  const bossesDefeated = Math.floor(Math.max(0, spins) / BOSS_MAX_HP);
  const currentBossNum = bossesDefeated + 1;
  const bossDamage = Math.max(0, spins) % BOSS_MAX_HP;
  const bossHpLeft = BOSS_MAX_HP - bossDamage;
  const claimableRaidBosses = Array.from({ length: Math.min(bossesDefeated, 20) }, (_, i) => i + 1).filter(
    (num) => !claimedSet.has(`raid:${num}`),
  );
  const nextClaimableBoss = claimableRaidBosses[0] ?? null;

  async function handleClaim(kind: "daily" | "bp" | "raid", targetId: string, label: string) {
    const key = `${kind}:${targetId}`;
    if (!ready || busyKey) return;
    setBusyKey(key);
    try {
      const res = await performClaimQuestReward(kind, targetId);
      if (res.claimed) {
        useGame.getState().pushToast(label, `+${res.gemsAdded} кВт-гемів в Ісекай!`, "#e8a317");
      } else {
        useGame.getState().pushToast(label, "Нагороду вже отримано раніше.", "#9c9486");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Не вдалося забрати нагороду";
      useGame.getState().pushToast("Помилка", msg, "#d64545");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="grid gap-3">
      {/* Raid Boss */}
      <section className="rounded-2xl border border-off/40 bg-surface p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-display flex items-center gap-1.5 text-xs tracking-widest text-off uppercase">
              <Skull className="size-4" aria-hidden /> Рейд-Бос #{ready ? currentBossNum : 1}
            </p>
            <h3 className="font-display mt-0.5 text-base text-fg">Мега-Графік Відключень 404</h3>
            <p className="text-[11px] text-muted">Кожна крутка основного колеса наносить босу 1 урон</p>
          </div>
          <span className="rounded-full border border-off/40 bg-off/10 px-2.5 py-1 font-mono text-xs font-bold text-off">
            {ready ? `${bossHpLeft}/${BOSS_MAX_HP}` : `${BOSS_MAX_HP}/${BOSS_MAX_HP}`} HP
          </span>
        </div>

        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-ink">
          <div
            className="h-full rounded-full bg-gradient-to-r from-off to-amber transition-all duration-500"
            style={{ width: `${ready ? Math.round((bossHpLeft / BOSS_MAX_HP) * 100) : 100}%` }}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-muted">
            Повалено босів: <strong className="font-display text-fg">{ready ? bossesDefeated : 0}</strong>
          </span>
          {ready && nextClaimableBoss !== null ? (
            <button
              type="button"
              disabled={busyKey !== null}
              onClick={() => void handleClaim("raid", String(nextClaimableBoss), `Рейд-Бос #${nextClaimableBoss}`)}
              className="font-display inline-flex items-center gap-1.5 rounded-full bg-amber px-3.5 py-1.5 text-xs font-extrabold text-ink transition-transform active:scale-95 disabled:opacity-50"
            >
              <Swords className="size-3.5" aria-hidden />
              {busyKey === `raid:${nextClaimableBoss}`
                ? "Нарахування…"
                : `Трофей Боса #${nextClaimableBoss} (+250 кВт-гемів)`}
            </button>
          ) : (
            <span className="font-mono text-[11px] text-muted">Нагорода: +250 кВт-гемів за кожні 25 круток</span>
          )}
        </div>
      </section>

      {/* Daily Quests */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <p className="font-display flex items-center gap-1.5 text-xs tracking-widest text-amber uppercase">
          <Gift className="size-4" aria-hidden /> Щоденні завдання · {dayKey}
        </p>
        <p className="mt-0.5 text-[11px] text-muted">Всі нагороди тепер одразу йдуть у ⚔️ Ісекай як кВт-геми</p>

        <div className="mt-3 space-y-2">
          {QUESTS.map((q) => {
            const rawLocal = q.id === "spins" ? daily.spins : q.id === "on" ? daily.on : daily.blackout;
            const progress = Math.min(q.target, Math.max(0, ready ? Math.max(rawLocal, Math.min(spins, q.target)) : 0));
            const serverKey = `daily:${q.id}:${dayKey}`;
            const isClaimed = ready && claimedSet.has(serverKey);
            const canClaim = ready && !isClaimed && spins >= q.target && rawLocal >= q.target;

            return (
              <div
                key={q.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-ink px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-fg">{q.title}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted">
                    Прогрес: {progress}/{q.target} · +{q.reward} кВт-гемів
                  </p>
                </div>
                {isClaimed ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-on/40 bg-on/10 px-2.5 py-1 text-[11px] font-bold text-on">
                    <Check className="size-3" aria-hidden /> Отримано
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={!canClaim || busyKey !== null}
                    onClick={() => void handleClaim("daily", q.id, q.title)}
                    className="font-display shrink-0 rounded-full bg-amber px-3 py-1.5 text-xs font-extrabold text-ink transition-transform active:scale-95 disabled:bg-surface disabled:text-muted"
                  >
                    {busyKey === `daily:${q.id}` ? "…" : canClaim ? `Забрати +${q.reward}` : `${progress}/${q.target}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Battle Pass */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="font-display flex items-center gap-1.5 text-xs tracking-widest text-amber uppercase">
            <Trophy className="size-4" aria-hidden /> Перепустка Енергетика
          </p>
          <span className="font-mono text-[11px] text-muted">
            {ready ? spins : 0} / {BP_MAX_TIER * BP_TIER_SPINS} круток
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Array.from({ length: BP_MAX_TIER }, (_, i) => i + 1).map((tier) => {
            const reqSpins = tier * BP_TIER_SPINS;
            const reward = bpReward(tier);
            const unlocked = ready && spins >= reqSpins;
            const isClaimed = ready && claimedSet.has(`bp:${tier}`);

            return (
              <div
                key={tier}
                className={`flex flex-col justify-between rounded-xl border p-2.5 ${
                  isClaimed
                    ? "border-on/30 bg-ink/70"
                    : unlocked
                      ? "border-amber/60 bg-amber/10"
                      : "border-line bg-ink"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-display font-bold text-fg">Рівень {tier}</span>
                    <span className="font-mono text-muted">{reqSpins} сп.</span>
                  </div>
                  <p className="font-display mt-1 text-xs text-amber">+{reward} кВт-гемів</p>
                </div>

                {isClaimed ? (
                  <span className="mt-2 inline-flex items-center justify-center gap-1 rounded-lg bg-on/15 py-1 text-[11px] font-semibold text-on">
                    <Check className="size-3" aria-hidden /> Забрано
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={!unlocked || busyKey !== null}
                    onClick={() => void handleClaim("bp", String(tier), `Перепустка р.${tier}`)}
                    className="font-display mt-2 w-full rounded-lg bg-amber py-1 text-[11px] font-extrabold text-ink transition-transform active:scale-95 disabled:bg-surface disabled:text-muted"
                  >
                    {busyKey === `bp:${tier}` ? "…" : unlocked ? "Забрати" : "Закрито"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
