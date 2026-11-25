import { useGame } from "@/lib/game/store";
import { BOSS_MAX_HP, BP_MAX_TIER, BP_TIER_SPINS, QUESTS, bpReward } from "@/lib/game/data";

export function Quests({ ready }: { ready: boolean }) {
  const daily = useGame((s) => s.daily);
  const claimQuest = useGame((s) => s.claimQuest);
  const spins = useGame((s) => s.spins);
  const bpClaimed = useGame((s) => s.bpClaimed);
  const claimBp = useGame((s) => s.claimBp);
  const bossHp = useGame((s) => s.bossHp);
  const bossesKilled = useGame((s) => s.bossesKilled);

  const progressFor = (id: string) =>
    !ready ? 0 : id === "spins" ? daily.spins : id === "on" ? daily.on : daily.blackout;
  const bpUnlocked = ready ? Math.min(BP_MAX_TIER, Math.floor(spins / BP_TIER_SPINS)) : 0;
  const bossPercent = ready ? Math.round((bossHp / BOSS_MAX_HP) * 100) : 100;

  return (
    <div>
      <div className="rounded-2xl border border-[#d64545]/40 bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="font-display text-sm text-[#e06a8c]">👹 рейд-бос тижня</p>
          <p className="text-[11px] text-muted">знищено: {ready ? bossesKilled : 0}</p>
        </div>
        <p className="mt-1 text-xs text-muted">
          ГРАФІК ВІДКЛЮЧЕНЬ. Кожна крутка — мінус 1 HP. Генератор б'є на 5. Нагорода за голову: 500 кВт·год.
        </p>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-ink">
          <div className="h-full rounded-full bg-[#d64545] transition-all duration-500" style={{ width: `${bossPercent}%` }} />
        </div>
        <p className="mt-1 text-right text-[11px] text-muted">HP: {ready ? bossHp : BOSS_MAX_HP}/{BOSS_MAX_HP}</p>
      </div>

      <p className="font-display mt-4 text-xs tracking-widest text-muted uppercase">щоденні квести</p>
      <div className="mt-2 grid gap-2">
        {QUESTS.map((q) => {
          const progress = Math.min(q.target, progressFor(q.id));
          const done = ready && progressFor(q.id) >= q.target;
          const claimed = ready && daily.claimed.includes(q.id);
          return (
            <div key={q.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-fg">{q.title}</p>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink">
                  <div
                    className="h-full rounded-full bg-[#5ec4b3] transition-all duration-300"
                    style={{ width: `${(progress / q.target) * 100}%` }}
                  />
                </div>
              </div>
              {claimed ? (
                <span className="font-display shrink-0 text-xs text-muted">отримано</span>
              ) : done ? (
                <button
                  type="button"
                  onClick={() => claimQuest(q.id)}
                  className="font-display shrink-0 rounded-full bg-amber px-4 py-2 text-xs font-bold text-ink"
                >
                  +{q.reward}
                </button>
              ) : (
                <span className="shrink-0 text-xs text-muted">{progress}/{q.target}</span>
              )}
            </div>
          );
        })}
      </div>

      <p className="font-display mt-4 text-xs tracking-widest text-muted uppercase">бойовий пропуск · сезон 1 «свічкова епоха»</p>
      <p className="mt-1 text-xs text-muted">Рівень БП = крутки ÷ 5. Нагороди — кВт·год. Пропуск безкоштовний, як і все в нас.</p>
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {Array.from({ length: BP_MAX_TIER }, (_, i) => i + 1).map((tier) => {
          const unlocked = tier <= bpUnlocked;
          const claimed = bpClaimed.includes(tier);
          return (
            <button
              key={tier}
              type="button"
              disabled={!unlocked || claimed}
              onClick={() => claimBp(tier)}
              className={`rounded-xl border p-2 text-center transition-transform ${
                claimed
                  ? "border-line bg-ink text-muted"
                  : unlocked
                    ? "border-amber/50 bg-surface text-amber enabled:active:scale-95"
                    : "border-line bg-ink text-muted opacity-50"
              }`}
            >
              <p className="font-display text-xs">{claimed ? "✓" : `ур. ${tier}`}</p>
              <p className="text-[10px]">{bpReward(tier)} кВт</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
