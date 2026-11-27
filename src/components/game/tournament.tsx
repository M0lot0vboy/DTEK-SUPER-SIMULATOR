import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import {
  AlertTriangle,
  Award,
  BatteryCharging,
  Clock,
  Crown,
  Flame,
  Lock,
  Shield,
  Sparkles,
  Trophy,
  UserCheck,
  Zap,
} from "lucide-react";
import { chord, tick } from "@/lib/game/audio";
import {
  TOURNAMENT_KEY,
  fetchTournamentOverview,
  performJoinTournament,
  performTournamentBank,
  performTournamentSpin,
  usePlayer,
} from "@/lib/game/player";
import { useGame } from "@/lib/game/store";
import {
  TOURNAMENT_CURRENCY_SHORT,
  TOURNAMENT_SLICES,
  computeRegeneratedCharges,
  type RelicBlueprint,
  type TournamentInfo,
  type TournamentSpinResult,
} from "@/lib/tournament";

function fmtDuration(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d}д ${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function relicStatBadges(b: RelicBlueprint["buff"]): string[] {
  const out: string[] = [];
  if (b.gemsPct > 0) out.push(`+${b.gemsPct}% кВт-геми`);
  if (b.drainReductionPct > 0) out.push(`−${b.drainReductionPct}% розряд`);
  if (b.onBonus > 0) out.push(`+${b.onBonus}% світло`);
  if (b.refundPct > 0) out.push(`+${b.refundPct}% повернення`);
  return out;
}

const WHEEL_TEXT_MAP: Record<string, string> = {
  watts_120: "+120 LOL",
  watts_220: "+220 LOL",
  watts_360: "+360 LOL",
  watts_550: "+550 LOL",
  pot_x2: "КОТЕЛ ×2",
  mult_up: "+0.75×",
  shield: "ІЗОЛЕНТА",
  surge: "АВРАЛ +420",
};

function buildTournamentWheelSvg() {
  const n = TOURNAMENT_SLICES.length;
  const step = (Math.PI * 2) / n;
  const r = 138;
  const cx = 150;
  const cy = 150;
  return TOURNAMENT_SLICES.map((s, i) => {
    const a0 = i * step - Math.PI / 2;
    const a1 = (i + 1) * step - Math.PI / 2;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const d = `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
    const mid = (a0 + a1) / 2;
    const tx = cx + r * 0.62 * Math.cos(mid);
    const ty = cy + r * 0.62 * Math.sin(mid);
    let deg = (mid * 180) / Math.PI;
    if (deg > 90 && deg < 270) deg += 180;
    const wheelText = WHEEL_TEXT_MAP[s.id] ?? s.label.slice(0, 10);
    return { ...s, d, tx, ty, rot: deg, wheelText };
  });
}

export function Tournament({
  ready,
  onOpenAccount,
}: {
  ready: boolean;
  onOpenAccount: () => void;
}) {
  const accountUsername = usePlayer((s) => s.accountUsername);
  const { data, isLoading, mutate } = useSWR(
    ready ? TOURNAMENT_KEY : null,
    fetchTournamentOverview,
    { refreshInterval: 8000, revalidateOnFocus: true },
  );

  const [now, setNow] = useState(0);
  const [joining, setJoining] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [spinPending, setSpinPending] = useState(false);
  const [banking, setBanking] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [lastSpinFeedback, setLastSpinFeedback] = useState<TournamentSpinResult | null>(null);
  const timerRef = useRef<number | null>(null);

  const wheelPaths = useMemo(() => buildTournamentWheelSvg(), []);

  useEffect(() => {
    setNow(Date.now());
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(iv);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const active = data?.active ?? null;
  const entry = data?.entry ?? null;
  const leaderboard = data?.leaderboard ?? [];
  const past = data?.past ?? [];

  const endsLeftMs = active && now ? Math.max(0, new Date(active.endsAt).getTime() - now) : 0;

  const liveChargesInfo = useMemo(() => {
    if (!active || !entry) return null;
    if (entry.nextRegenAt === null || entry.charges >= entry.maxCharges) {
      return { charges: entry.charges, nextRegenMs: 0 };
    }
    const regenLeft = Math.max(0, entry.nextRegenAt - now);
    if (regenLeft === 0 && active.regenMinutes > 0) {
      const calc = computeRegeneratedCharges(
        entry.charges,
        entry.nextRegenAt - active.regenMinutes * 60_000,
        entry.maxCharges,
        active.regenMinutes,
        now,
      );
      return {
        charges: calc.charges,
        nextRegenMs: calc.nextRegenAtMs ? Math.max(0, calc.nextRegenAtMs - now) : 0,
      };
    }
    return { charges: entry.charges, nextRegenMs: regenLeft };
  }, [active, entry, now]);

  async function handleJoin() {
    if (joining) return;
    setJoining(true);
    try {
      const nextState = await performJoinTournament();
      await mutate(nextState, false);
      useGame.getState().pushToast("Турнір «Блекаут-Ралі»", "Заряди активовано! Уперед за Копіум-Ватами!", "#e8a317");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Не вдалося приєднатися";
      useGame.getState().pushToast("Турнір", msg, "#d64545");
    } finally {
      setJoining(false);
    }
  }

  async function handleSpin() {
    if (!entry || spinning || spinPending || banking || entry.disqualified) return;
    const avail = liveChargesInfo?.charges ?? entry.charges;
    if (avail < 1) {
      useGame.getState().pushToast("Заряди вичерпано", "Почекай відновлення або зафіксуй поточний котел.", "#d64545");
      return;
    }

    setSpinPending(true);
    try {
      const res = await performTournamentSpin(entry.entrySeq);
      setSpinPending(false);

      const n = TOURNAMENT_SLICES.length;
      const sliceDeg = 360 / n;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reduced) {
        const turns = 4 + Math.floor(Math.random() * 2);
        const currentMod = ((rotation % 360) + 360) % 360;
        const targetMod = (((360 - (res.sliceIndex * sliceDeg + sliceDeg / 2)) % 360) + 360) % 360;
        let delta = targetMod - currentMod;
        if (delta < 0) delta += 360;
        setRotation((r) => r + turns * 360 + delta);
      }

      setSpinning(true);
      let clicks = 0;
      const clickTimer = reduced
        ? null
        : window.setInterval(() => {
            clicks += 1;
            tick(210 + (clicks % 4) * 55, 0.03);
            if (clicks >= 10) window.clearInterval(clickTimer!);
          }, 95);

      timerRef.current = window.setTimeout(() => {
        if (clickTimer !== null) window.clearInterval(clickTimer);
        setSpinning(false);
        setLastSpinFeedback(res);
        void mutate(res.state, false);

        if (res.outcomeKind === "blackout") {
          tick(85, 0.35);
          useGame.getState().pushToast("💥 БЛЕКАУТ КЗ!", res.note, "#d64545");
        } else if (res.outcomeKind === "shield_saved") {
          chord();
          useGame.getState().pushToast("🛡️ Синя Ізолента втримала КЗ!", res.note, "#22d3ee");
        } else {
          chord();
        }
      }, reduced ? 20 : 1200);
    } catch (err) {
      setSpinPending(false);
      setSpinning(false);
      const msg = err instanceof Error ? err.message : "Помилка крутки турніру";
      useGame.getState().pushToast("Турнір", msg, "#d64545");
      void mutate();
    }
  }

  async function handleBank() {
    if (!entry || banking || spinning || spinPending || entry.disqualified || entry.unbankedPot <= 0) return;
    setBanking(true);
    try {
      const res = await performTournamentBank(entry.entrySeq);
      await mutate(res.state, false);
      setLastSpinFeedback(null);
      chord();
      useGame
        .getState()
        .pushToast(
          "🏦 Покази зафіксовано!",
          `+${res.bankedAdded} ${TOURNAMENT_CURRENCY_SHORT} безпечно зараховано в Банк.`,
          "#4fae63",
        );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Не вдалося зафіксувати покази";
      useGame.getState().pushToast("Турнір", msg, "#d64545");
      void mutate();
    } finally {
      setBanking(false);
    }
  }

  return (
    <div className="grid gap-3">
      {!ready || isLoading ? (
        <div className="rounded-2xl border border-line bg-surface p-6 text-center text-xs text-muted">
          Синхронізація турнірної арени…
        </div>
      ) : active ? (
        <>
          {/* Live Tournament Hero */}
          <header className="relative overflow-hidden rounded-2xl border border-amber/50 bg-[linear-gradient(135deg,#2b1c0e,#121015_65%)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-off/50 bg-off/15 px-2.5 py-0.5 font-mono text-[10px] font-bold text-off">
                  <span className="size-2 animate-pulse rounded-full bg-off" /> LIVE ТУРНІР
                </span>
                <span className="rounded-full border border-amber/40 bg-amber/10 px-2 py-0.5 font-mono text-[10px] text-amber">
                  0% Ісекай-бафів · рівні умови
                </span>
              </div>
              <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-amber">
                <Clock className="size-3.5" aria-hidden /> {fmtDuration(endsLeftMs)}
              </span>
            </div>

            <h2 className="font-display mt-2 text-lg font-bold leading-tight text-fg sm:text-xl">
              ⚡ {active.title}
            </h2>
            {active.description ? <p className="mt-1 text-xs text-muted">{active.description}</p> : null}

            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted">
              <span className="rounded-lg border border-line bg-ink/80 px-2 py-1">
                Валюта: <strong className="text-amber">{TOURNAMENT_CURRENCY_SHORT}</strong>
              </span>
              <span className="rounded-lg border border-line bg-ink/80 px-2 py-1">
                Старт зарядів: <strong className="text-fg">{active.startingCharges}</strong> / макс{" "}
                <strong className="text-fg">{active.maxCharges}</strong>
              </span>
              <span className="rounded-lg border border-line bg-ink/80 px-2 py-1">
                Реген:{" "}
                <strong className="text-fg">
                  {active.regenMinutes > 0 ? `+1 кожні ${active.regenMinutes} хв` : "фіксований пул"}
                </strong>
              </span>
            </div>

            {/* Top 1 & Top 2 Prize Cards */}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <PrizePreviewCard place={1} relic={active.rewardTop1} />
              <PrizePreviewCard place={2} relic={active.rewardTop2} />
            </div>
          </header>

          {/* Player Controls / Account Gate */}
          {!accountUsername ? (
            <section className="rounded-2xl border border-amber/40 bg-surface p-4 text-center">
              <Lock className="mx-auto size-7 text-amber" aria-hidden />
              <h3 className="font-display mt-2 text-sm font-bold text-fg">
                Для входу в турнір потрібен акаунт
              </h3>
              <p className="mt-1 text-xs text-muted">
                Нові акаунти з 0 круток теж допускаються! Обмеження 1 учасник на пристрій і IP захищає Топ-2 від накруток.
              </p>
              <button
                type="button"
                onClick={onOpenAccount}
                className="font-display mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber px-5 py-2 text-xs font-extrabold text-ink transition-transform active:scale-95"
              >
                <UserCheck className="size-4" aria-hidden /> Створити акаунт / Увійти
              </button>
            </section>
          ) : !entry?.joined ? (
            <section className="rounded-2xl border border-amber/45 bg-surface p-4 text-center">
              <Sparkles className="mx-auto size-7 text-amber" aria-hidden />
              <h3 className="font-display mt-2 text-base font-bold text-fg">
                Акаунт @{accountUsername} готовий до «Блекаут-Ралі»!
              </h3>
              <p className="mt-1 text-xs text-muted">
                Крути на ризик, нарощуй котел із <strong className="text-amber">{TOURNAMENT_CURRENCY_SHORT}</strong> та фіксуй покази в Банк до того, як КЗ спалить незафіксоване!
              </p>
              <button
                type="button"
                disabled={joining}
                onClick={() => void handleJoin()}
                className="font-display mt-3 inline-flex items-center gap-2 rounded-full bg-amber px-6 py-2.5 text-sm font-extrabold text-ink transition-transform active:scale-95 disabled:opacity-50"
              >
                <Zap className="size-4" aria-hidden />
                {joining ? "Підключення…" : `Взяти участь (${active.startingCharges} зарядів)`}
              </button>
            </section>
          ) : entry.disqualified ? (
            <section className="rounded-2xl border border-off/50 bg-off/10 p-4 text-center">
              <AlertTriangle className="mx-auto size-7 text-off" aria-hidden />
              <h3 className="font-display mt-2 text-sm font-bold text-off">Дискваліфіковано з турніру</h3>
              <p className="mt-1 text-xs text-muted">
                {entry.disqualifiedReason || "Адміністрація обмежила участь цього профілю у поточному турнірі."}
              </p>
            </section>
          ) : (
            <section className="rounded-2xl border border-amber/40 bg-surface p-4">
              {/* Telemetry Tiles */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-xl border border-on/40 bg-ink p-2.5 text-center">
                  <p className="font-display text-lg font-extrabold text-on">
                    {entry.bankedScore.toLocaleString("uk-UA")}
                  </p>
                  <p className="text-[10px] tracking-wider text-muted uppercase">У банку ({TOURNAMENT_CURRENCY_SHORT})</p>
                  {entry.rank ? (
                    <p className="mt-0.5 font-mono text-[10px] text-amber">Місце #{entry.rank}</p>
                  ) : null}
                </div>

                <div className="rounded-xl border border-amber/40 bg-ink p-2.5 text-center">
                  <p className="font-display text-lg font-extrabold text-amber">
                    {entry.potentialBank.toLocaleString("uk-UA")}
                  </p>
                  <p className="text-[10px] tracking-wider text-muted uppercase">
                    Котел ({entry.unbankedPot} × {(entry.multiplierBps / 10_000).toFixed(2)})
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-muted">Серія: {entry.streak}</p>
                </div>

                <div
                  className={`rounded-xl border p-2.5 text-center ${
                    entry.overloadPct >= 45
                      ? "border-off/60 bg-off/10"
                      : entry.overloadPct >= 20
                        ? "border-amber/50 bg-ink"
                        : "border-line bg-ink"
                  }`}
                >
                  <p
                    className={`font-display flex items-center justify-center gap-1 text-lg font-extrabold ${
                      entry.overloadPct >= 45
                        ? "text-off"
                        : entry.overloadPct >= 20
                          ? "text-amber"
                          : "text-fg"
                    }`}
                  >
                    <Flame className="size-4" aria-hidden /> {entry.overloadPct}%
                  </p>
                  <p className="text-[10px] tracking-wider text-muted uppercase">Ризик КЗ</p>
                  {entry.shielded ? (
                    <p className="mt-0.5 font-mono text-[10px] font-bold text-[#22d3ee]">🛡️ Ізолента є</p>
                  ) : (
                    <p className="mt-0.5 font-mono text-[10px] text-muted">КЗ: {entry.blackoutsHit}</p>
                  )}
                </div>

                <div className="rounded-xl border border-line bg-ink p-2.5 text-center">
                  <p className="font-display flex items-center justify-center gap-1 text-lg font-extrabold text-fg">
                    <BatteryCharging className="size-4 text-amber" aria-hidden />
                    {liveChargesInfo?.charges ?? entry.charges}/{entry.maxCharges}
                  </p>
                  <p className="text-[10px] tracking-wider text-muted uppercase">Енерго-заряди</p>
                  <p className="mt-0.5 font-mono text-[10px] text-muted">
                    {liveChargesInfo && liveChargesInfo.nextRegenMs > 0
                      ? `+1 через ${fmtDuration(liveChargesInfo.nextRegenMs)}`
                      : "максимум"}
                  </p>
                </div>
              </div>

              {/* Risk Wheel + Controls */}
              <div className="mt-4 flex flex-col items-center gap-4 md:flex-row md:items-center md:justify-between">
                <div className="relative mx-auto size-64 shrink-0 sm:size-72">
                  <div
                    className="absolute -top-2 left-1/2 z-20 -translate-x-1/2 border-x-[10px] border-t-[18px] border-x-transparent border-t-amber drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]"
                    aria-hidden
                  />
                  <svg
                    viewBox="0 0 300 300"
                    className="size-full drop-shadow-[0_12px_30px_rgba(0,0,0,0.65)]"
                    style={{
                      transform: `rotate(${rotation}deg)`,
                      transition: spinning ? "transform 1.15s cubic-bezier(0.15, 0.85, 0.25, 1)" : "none",
                    }}
                  >
                    <circle cx="150" cy="150" r="144" fill="#181410" stroke="#e8a317" strokeWidth="3" />
                    {wheelPaths.map((s) => (
                      <g key={s.id}>
                        <path d={s.d} fill={s.color} fillOpacity={0.86} stroke="#141210" strokeWidth="2" />
                        <text
                          x={s.tx}
                          y={s.ty}
                          fill="#12100e"
                          fontSize="10"
                          fontWeight="900"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          transform={`rotate(${s.rot} ${s.tx} ${s.ty})`}
                        >
                          {s.wheelText}
                        </text>
                      </g>
                    ))}
                    <circle cx="150" cy="150" r="24" fill="#141210" stroke="#e8a317" strokeWidth="3" />
                    <text x="150" y="152" fill="#e8a317" fontSize="13" fontWeight="900" textAnchor="middle" dominantBaseline="middle">
                      LOL
                    </text>
                  </svg>
                </div>

                <div className="flex w-full flex-1 flex-col gap-2.5">
                  <div className="rounded-xl border border-line bg-ink p-3 text-xs">
                    <p className="font-mono text-[10px] tracking-wider text-muted uppercase">Останній сигнал ралі</p>
                    <p className="font-display mt-1 text-sm font-bold text-fg">
                      {lastSpinFeedback?.sliceLabel ?? entry.lastSlice ?? "Готовий до старту!"}
                    </p>
                    <p className="mt-1 text-[11px] text-muted">
                      {lastSpinFeedback?.note ??
                        entry.lastNote ??
                        "Перша крутка з 0% ризиком КЗ завжди безпечна. Далі вирішує твоя жадібність!"}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={spinning || spinPending || banking || (liveChargesInfo?.charges ?? entry.charges) < 1}
                    onClick={() => void handleSpin()}
                    className="font-display min-h-13 w-full rounded-2xl bg-amber px-4 py-3 text-sm font-extrabold text-ink transition-transform active:scale-95 disabled:opacity-45"
                  >
                    {spinning || spinPending
                      ? "⚡ НАПРУГА РОСТЕ…"
                      : `⚡ Крутити на ризик (−1 заряд · ризик КЗ ${entry.overloadPct}%)`}
                  </button>

                  <button
                    type="button"
                    disabled={banking || spinning || spinPending || entry.unbankedPot <= 0}
                    onClick={() => void handleBank()}
                    className="font-display min-h-12 w-full rounded-2xl border border-on/60 bg-on/15 px-4 py-2.5 text-sm font-bold text-on transition-colors hover:bg-on/25 disabled:border-line disabled:bg-ink disabled:text-muted disabled:opacity-50"
                  >
                    {banking
                      ? "Фіксуємо покази…"
                      : entry.unbankedPot > 0
                        ? `🏦 Зафіксувати покази (+${entry.potentialBank.toLocaleString("uk-UA")} ${TOURNAMENT_CURRENCY_SHORT})`
                        : "🏦 Котел порожній (нічого фіксувати)"}
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Live Tournament Leaderboard */}
          <section className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display flex items-center gap-1.5 text-sm font-bold text-amber">
                <Trophy className="size-4" aria-hidden /> Турнірна таблиця ({leaderboard.length})
              </h3>
              <span className="font-mono text-[10px] text-muted">Рахунок: {TOURNAMENT_CURRENCY_SHORT} · Топ-2 отримують реліквії</span>
            </div>

            {leaderboard.length === 0 ? (
              <p className="mt-3 text-center text-xs text-muted">
                Ще ніхто не зафіксував покази. Будь першим лідером!
              </p>
            ) : (
              <div className="mt-3 space-y-1.5">
                {leaderboard.map((row) => {
                  const prizeZone = row.rank === 1 || row.rank === 2;
                  return (
                    <div
                      key={row.publicId}
                      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs ${
                        row.isSelf
                          ? "border-amber bg-amber/10"
                          : prizeZone
                            ? "border-amber/40 bg-ink"
                            : "border-line bg-ink/70"
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="font-display w-6 shrink-0 text-center font-bold text-amber">
                          {row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : `#${row.rank}`}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-fg">
                            {row.playerName}{" "}
                            <span className="font-mono text-[10px] text-muted">@{row.username}</span>
                            {row.isSelf ? (
                              <span className="ml-1.5 rounded bg-amber/20 px-1 py-0.5 font-mono text-[9px] text-amber">
                                ТИ
                              </span>
                            ) : null}
                          </p>
                          <p className="font-mono text-[10px] text-muted">
                            Пік котла: {row.peakPot} · Спінів: {row.spinsUsed} · КЗ: {row.blackoutsHit}
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-display text-sm font-bold text-amber">
                          {row.bankedScore.toLocaleString("uk-UA")}
                        </p>
                        <p className="font-mono text-[9px] text-muted">{TOURNAMENT_CURRENCY_SHORT}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="rounded-2xl border border-line bg-surface p-6 text-center">
          <Crown className="mx-auto size-8 text-amber" aria-hidden />
          <h2 className="font-display mt-2 text-base font-bold text-fg">Зараз активного турніру немає</h2>
          <p className="mt-1 text-xs text-muted">
            Коли адміністратор запустить нове «Блекаут-Ралі», тут відкриється арена на <strong className="text-amber">{TOURNAMENT_CURRENCY_SHORT}</strong>, а Топ-2 гравців отримають ексклюзивні реліквії в Ісекай!
          </p>
        </section>
      )}

      {/* Hall of Fame */}
      {past.length > 0 ? (
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h3 className="font-display flex items-center gap-1.5 text-sm font-bold text-fg">
            <Award className="size-4 text-amber" aria-hidden /> Зал Слави минулих турнірів
          </h3>
          <div className="mt-3 space-y-2.5">
            {past.map((t: TournamentInfo) => (
              <div key={t.id} className="rounded-xl border border-line bg-ink p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="font-display font-bold text-fg">{t.title}</span>
                  <span className="font-mono text-[10px] text-muted">
                    #{t.id} · {t.finishedAt ? new Date(t.finishedAt).toLocaleDateString("uk-UA") : ""}
                  </span>
                </div>
                {t.winners.length === 0 ? (
                  <p className="mt-1.5 text-[11px] text-muted">Переможців із банком не зафіксовано.</p>
                ) : (
                  <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                    {t.winners.map((w) => (
                      <div key={w.playerId} className="rounded-lg border border-amber/30 bg-surface px-2.5 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-fg">
                            {w.place === 1 ? "🥇" : "🥈"} {w.playerName}{" "}
                            <span className="font-mono text-[10px] text-muted">@{w.username}</span>
                          </span>
                          <span className="font-display text-xs font-bold text-amber">
                            {w.bankedScore.toLocaleString("uk-UA")} {t.currencyName}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-amber">
                          {w.relic.emoji} {w.relic.name}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function PrizePreviewCard({ place, relic }: { place: 1 | 2; relic: RelicBlueprint }) {
  const stats = relicStatBadges(relic.buff);
  return (
    <div
      className={`rounded-xl border p-2.5 ${
        place === 1 ? "border-amber/60 bg-ink/85" : "border-[#cbd5e1]/40 bg-ink/75"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-amber/30 bg-surface text-lg">
          {relic.emoji}
        </span>
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-bold text-amber">
            {place === 1 ? "🥇 1-Е МІСЦЕ · РЕЛІКВІЯ ІСЕКАЮ" : "🥈 2-Е МІСЦЕ · РЕЛІКВІЯ ІСЕКАЮ"}
          </p>
          <p className="font-display text-xs leading-tight font-bold text-fg line-clamp-2">{relic.name}</p>
        </div>
      </div>
      {relic.lore ? <p className="mt-1.5 line-clamp-2 text-[10px] text-muted">{relic.lore}</p> : null}
      {stats.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {stats.map((st) => (
            <span
              key={st}
              className="inline-flex items-center gap-0.5 rounded border border-amber/25 bg-surface px-1.5 py-0.5 font-mono text-[9px] text-amber"
            >
              <Shield className="size-2.5" aria-hidden /> {st}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
