import { useEffect, useState } from "react";
import { Bell, BellOff, Copy, Siren, Volume2, VolumeX } from "lucide-react";
import {
  AID_AMOUNT,
  MAX_LOADOUT,
  PULL_COST,
  computeBuffs,
  constellationOf,
  flexText,
  useGacha,
  type PullOutcome,
} from "@/lib/gacha/engine";
import { RARITY_COLOR, unitById } from "@/lib/gacha/pool";
import { setSynthMuted, sfxClick } from "@/lib/gacha/audio";
import { useGame } from "@/lib/game/store";
import { performClaimAid, performPull, performSacrificeRook } from "@/lib/game/player";
import { PityBar } from "./pity-bar";
import { PullCutscene } from "./pull-cutscene";
import { Codex } from "./codex";
import { Shop } from "./shop";
import { EvalBadge, Stars, UnitArt } from "./unit-art";

type View = "banner" | "codex" | "shop";

function nextMonday(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7));
  return d.getTime();
}

function fmt(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return d > 0 ? `${d}д ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
}

async function copyText(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path, e.g. inside a non-secure iframe */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export async function copyFlex(): Promise<void> {
  const ok = await copyText(flexText(useGacha.getState()));
  useGame
    .getState()
    .pushToast(
      ok ? "Флекс скопійовано" : "Не вдалося скопіювати",
      ok ? "Кидай у чат класу. Хай страждають." : "Браузер не дав доступ до буфера.",
      ok ? "#e8a317" : "#d64545",
    );
}

export function GachaPanel({ ready }: { ready: boolean }) {
  const gems = useGacha((s) => s.gems);
  const shards = useGacha((s) => s.shards);
  const tickets = useGacha((s) => s.tickets);
  const pity5 = useGacha((s) => s.pity5);
  const pity4 = useGacha((s) => s.pity4);
  const guaranteed = useGacha((s) => s.guaranteed);
  const totalPulls = useGacha((s) => s.totalPulls);
  const aidAt = useGacha((s) => s.aidAt);
  const muted = useGacha((s) => s.muted);
  const badges = useGacha((s) => s.badges);
  const [view, setView] = useState<View>("banner");
  const [results, setResults] = useState<PullOutcome[] | null>(null);
  const [pulling, setPulling] = useState(false);
  const [claimingAid, setClaimingAid] = useState(false);
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, []);

  useEffect(() => {
    setSynthMuted(muted);
  }, [muted]);

  async function doPull(count: 1 | 10) {
    if (pulling) return;
    const st = useGacha.getState();
    const ticketsUsed = Math.min(st.tickets, count);
    const gemCost = (count - ticketsUsed) * PULL_COST;
    if (st.gems < gemCost) {
      useGame
        .getState()
        .pushToast(
          "Мало кВт-гемів",
          `Треба ${count * PULL_COST}. Крути колесо, проси допомогу або обміняй копіум.`,
          "#d64545",
        );
      setView("shop");
      return;
    }

    setPulling(true);
    try {
      const res = await performPull(count);
      setResults(res.results);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Не вдалося виконати молитву";
      useGame.getState().pushToast("Помилка молитви", msg, "#d64545");
    } finally {
      setPulling(false);
    }
  }

  const aidReady = ready && now >= aidAt;
  const aidLeft = Math.max(0, aidAt - now);

  async function claimAid() {
    if (claimingAid || !aidReady) return;
    sfxClick();
    setClaimingAid(true);
    try {
      await performClaimAid();
      useGame.getState().pushToast("Аварійна допомога", `+${AID_AMOUNT} кВт-гемів. Держава не причетна.`, "#7dd694");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Аварійна допомога ще недоступна";
      useGame.getState().pushToast("Аварійна допомога", msg, "#d64545");
    } finally {
      setClaimingAid(false);
    }
  }

  return (
    <div>
      <header className="relative overflow-hidden rounded-2xl border border-amber/40 bg-[linear-gradient(135deg,#2b220f,#141210_60%)] p-4">
        <p className="font-display text-[10px] tracking-[0.3em] text-amber uppercase">Ісекай · Сезон 1</p>
        <h2 className="font-display mt-1 text-base leading-tight text-fg sm:text-lg">
          Переродився в Сірій Зоні з 12% заряду
        </h2>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3">
            <UnitArt unit={unitById("rook")} size="sm" />
            <div>
              <p className="font-display text-sm text-amber">Банер «Пожертва Тури»</p>
              <p className="text-[11px] text-muted">
                Рекомендовані: ТУРА · Queue 4.2 · EcoFlow · Starlink
              </p>
            </div>
          </div>
          <p className="font-display text-[11px] text-off" aria-live="off">
            закінчується через {ready && now ? fmt(nextMonday(now) - now) : "--:--:--"}
          </p>
        </div>
        <div className="absolute top-3 right-3 flex gap-1">
          <button
            type="button"
            onClick={() => useGacha.getState().setMuted(!muted)}
            className="grid size-8 place-items-center rounded-full border border-line bg-ink/70 text-muted"
            aria-label={muted ? "Увімкнути звук" : "Вимкнути звук"}
            aria-pressed={muted}
          >
            {muted ? <VolumeX className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
          </button>
          <button
            type="button"
            onClick={() => useGacha.getState().setBadges(!badges)}
            className="grid size-8 place-items-center rounded-full border border-line bg-ink/70 text-muted"
            aria-label={badges ? "Вимкнути червоні значки" : "Увімкнути червоні значки"}
            aria-pressed={badges}
          >
            {badges ? <Bell className="size-4" aria-hidden /> : <BellOff className="size-4" aria-hidden />}
          </button>
        </div>
      </header>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Currency label="кВт-геми" value={ready ? gems.toLocaleString("uk-UA") : "—"} color="#e8a317" />
        <Currency label="копіум" value={ready ? String(shards) : "—"} color="#a879f0" />
        <Currency label="талони" value={ready ? String(tickets) : "—"} color="#5ec4b3" />
      </div>

      <nav className="mt-3 flex gap-1.5" aria-label="Розділи гачі">
        {(
          [
            ["banner", "банер"],
            ["codex", "кодекс"],
            ["shop", "обмін"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            aria-pressed={view === id}
            className={`font-display relative min-h-10 flex-1 rounded-full border text-xs font-bold ${
              view === id ? "border-amber/60 bg-amber/15 text-amber" : "border-line bg-surface text-muted"
            }`}
          >
            {label}
            {badges && ready && ((id === "banner" && aidReady) || (id === "shop" && shards >= 14)) ? (
              <span className="absolute -top-1 -right-0.5 size-3 animate-pulse rounded-full border-2 border-bg bg-off" aria-label="нове" />
            ) : null}
          </button>
        ))}
      </nav>

      <div className="mt-3">
        {view === "banner" ? (
          <div className="grid gap-3">
            <PityBar pity5={ready ? pity5 : 0} pity4={ready ? pity4 : 0} guaranteed={ready && guaranteed} attempts={ready ? totalPulls : 0} />

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void doPull(1)}
                disabled={!ready || pulling}
                className="font-display min-h-14 rounded-2xl border border-amber/50 bg-ink px-3 text-sm font-bold text-amber transition-transform active:scale-95 disabled:opacity-50"
              >
                Молитва ×1
                <span className="block text-[10px] font-normal text-muted">{tickets > 0 ? "1 талон" : `${PULL_COST} кВт-гемів`}</span>
              </button>
              <button
                type="button"
                onClick={() => void doPull(10)}
                disabled={!ready || pulling}
                className="font-display min-h-14 rounded-2xl bg-amber px-3 text-sm font-extrabold text-ink transition-transform active:scale-95 disabled:opacity-50"
              >
                Молитва ×10
                <span className="block text-[10px] font-normal text-ink/70">{PULL_COST * 10} кВт-гемів · 4★ гарантовано</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void claimAid()}
                disabled={!aidReady || claimingAid}
                className="font-display relative flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full border border-[#7dd694]/50 bg-surface px-4 text-xs font-bold text-[#7dd694] disabled:opacity-50"
              >
                <Siren className="size-4" aria-hidden />
                {aidReady ? `Аварійна допомога +${AID_AMOUNT}` : `допомога через ${fmt(aidLeft)}`}
              </button>
              <button
                type="button"
                onClick={() => void copyFlex()}
                disabled={!ready || totalPulls === 0}
                className="font-display flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full border border-amber/50 bg-surface px-4 text-xs font-bold text-amber disabled:opacity-50"
              >
                <Copy className="size-4" aria-hidden /> скопіювати флекс
              </button>
            </div>

            <Loadout ready={ready} now={now} />

            <details className="rounded-xl border border-line bg-surface p-3 text-[11px] text-muted">
              <summary className="font-display cursor-pointer text-xs text-fg">Шанси та правила</summary>
              <ul className="mt-2 space-y-1">
                <li>5★ базовий шанс 0,9% · м&apos;який гарант з 70-ї молитви · жорсткий гарант на 90-й.</li>
                <li>4★ базовий шанс 5,1% · 4★ або краще кожні 10 молитов.</li>
                <li>50/50: перемога — рекомендований 5★. Поразка — АВАРІЙНЕ ВІДКЛЮЧЕННЯ і гарант наступного разу.</li>
                <li>Дублікати дають копіум і підвищують сузір&apos;я до C6.</li>
                <li>кВт-геми даються за кожну крутку колеса ДТЕК.</li>
              </ul>
            </details>
          </div>
        ) : null}
        {view === "codex" ? <Codex /> : null}
        {view === "shop" ? <Shop /> : null}
      </div>

      {results ? (
        <PullCutscene
          key={results.map((r) => r.unitId).join(",") + totalPulls}
          results={results}
          pulling={pulling}
          onClose={() => setResults(null)}
          onAgain={() => void doPull(results.length === 10 ? 10 : 1)}
          onFlex={() => void copyFlex()}
        />
      ) : null}
    </div>
  );
}

function Currency({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-2 py-2">
      <p className="font-display text-sm" style={{ color }}>
        {value}
      </p>
      <p className="text-[10px] tracking-wider text-muted uppercase">{label}</p>
    </div>
  );
}

function Loadout({ ready, now }: { ready: boolean; now: number }) {
  const loadout = useGacha((s) => s.loadout);
  const copies = useGacha((s) => s.copies);
  const rookReadyAt = useGacha((s) => s.rookReadyAt);
  const boostSpins = useGacha((s) => s.boostSpins);
  const [sacrificing, setSacrificing] = useState(false);
  const buffs = computeBuffs(loadout, copies);
  const slots = Array.from({ length: MAX_LOADOUT }, (_, i) => (ready ? loadout[i] : undefined));
  const rookReady = ready && buffs.rook && now >= rookReadyAt;

  async function sacrifice() {
    if (sacrificing || !rookReady) return;
    setSacrificing(true);
    try {
      await performSacrificeRook();
      useGame.setState({ battery: 100 });
      useGame
        .getState()
        .pushToast("ТУРУ ПОЖЕРТВУВАНО!!", "Підстанцію примусово перезапущено. Павербанк 100%, ×3 кВт-геми на 5 круток.", "#e8a317");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Тура ще відновлюється";
      useGame.getState().pushToast("ТУРА", msg, "#d64545");
    } finally {
      setSacrificing(false);
    }
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-3" aria-label="Загін">
      <div className="flex items-center justify-between">
        <p className="font-display text-xs tracking-widest text-muted uppercase">Загін · {ready ? loadout.length : 0}/{MAX_LOADOUT}</p>
        {ready && boostSpins > 0 ? <p className="font-display text-[11px] text-amber">×3 геми ще {boostSpins} круток</p> : null}
      </div>
      <ul className="mt-2 grid grid-cols-3 gap-2">
        {slots.map((id, i) => {
          if (!id) {
            return (
              <li key={i} className="grid min-h-24 place-items-center rounded-lg border border-dashed border-line text-center text-[10px] text-muted">
                порожній слот
              </li>
            );
          }
          const unit = unitById(id);
          return (
            <li key={id} className="flex flex-col items-center rounded-lg border bg-ink p-2 text-center" style={{ borderColor: `${RARITY_COLOR[unit.rarity]}77` }}>
              <UnitArt unit={unit} size="sm" />
              <div className="mt-1 flex items-center gap-1">
                <Stars rarity={unit.rarity} className="text-[9px]" />
                <EvalBadge unit={unit} className="!min-w-4 !px-1 !text-[8px]" />
              </div>
              <p className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-fg">{unit.name}</p>
              <p className="font-display text-[9px] text-muted">C{constellationOf(copies[id] ?? 0)}</p>
            </li>
          );
        })}
      </ul>
      {ready && loadout.length ? (
        <p className="mt-2 text-[11px] text-muted">
          Розряд {buffs.drain < 1 ? "−" : "+"}
          {Math.round(Math.abs(1 - buffs.drain) * 100)}% · геми +{Math.round(buffs.gems * 100)}% · світло +{buffs.onBonus}% · повернення{" "}
          {Math.round(buffs.refund * 100)}%
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-muted">Відкрий кодекс і додай до трьох юнітів — вони реально посилюють колесо ДТЕК.</p>
      )}
      {ready && buffs.rook ? (
        <button
          type="button"
          onClick={() => void sacrifice()}
          disabled={!rookReady || sacrificing}
          className="font-display mt-3 min-h-12 w-full rounded-full bg-[linear-gradient(90deg,#e8a317,#ffe066,#e8a317)] text-sm font-extrabold text-ink disabled:opacity-40"
        >
          {rookReady ? "♜ ПОЖЕРТВУВАТИ ТУРУ" : `тура відновлюється · ${fmt(rookReadyAt - now)}`}
        </button>
      ) : null}
    </section>
  );
}
