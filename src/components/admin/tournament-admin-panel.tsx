import { useState, type FormEvent } from "react";
import { Award, Ban, CheckCircle2, Clock, Crown, Eye, Rocket, Shield, Trophy, XCircle } from "lucide-react";
import {
  cancelTournament,
  disqualifyTournamentEntry,
  finishTournament,
  launchTournament,
  type AdminTournamentOverview,
  type RelicBlueprint,
} from "@/lib/admin";
import {
  DEFAULT_TOP1_RELIC,
  DEFAULT_TOP2_RELIC,
  RELIC_POWER_PRESETS,
  TOURNAMENT_CURRENCY_SHORT,
} from "@/lib/tournament";

const EMOJI_PRESETS = ["👑", "🥈", "⚡", "🔋", "🕯️", "💎", "🛡️", "🔥", "🏆"];

export function TournamentAdminPanel({
  overview,
  onUpdated,
  onError,
  onNotice,
  onSpectate,
}: {
  overview: AdminTournamentOverview | null;
  onUpdated: (next: AdminTournamentOverview) => void;
  onError: (msg: string) => void;
  onNotice: (msg: string) => void;
  onSpectate: (playerId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("Блекаут-Ралі #1");
  const [description, setDescription] = useState("Рівні умови, окремі Копіум-Вати (кВт·LOL). Топ-2 отримують унікальні реліквії в Ісекай!");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [startingCharges, setStartingCharges] = useState(12);
  const [maxCharges, setMaxCharges] = useState(20);
  const [regenMinutes, setRegenMinutes] = useState(15);
  const [rewardTop1, setRewardTop1] = useState<RelicBlueprint>(() => structuredClone(DEFAULT_TOP1_RELIC));
  const [rewardTop2, setRewardTop2] = useState<RelicBlueprint>(() => structuredClone(DEFAULT_TOP2_RELIC));
  const [dqReason, setDqReason] = useState("");
  const [confirmEndMode, setConfirmEndMode] = useState<"finish" | "cancel" | null>(null);

  const active = overview?.active ?? null;
  const participants = overview?.participants ?? [];
  const history = overview?.history ?? [];

  async function handleLaunch(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    onError("");
    try {
      const next = await launchTournament({
        data: {
          title,
          description,
          durationMinutes,
          startingCharges,
          maxCharges: Math.max(startingCharges, maxCharges),
          regenMinutes,
          rewardTop1,
          rewardTop2,
        },
      });
      onUpdated(next);
      onNotice(`Турнір «${next.active?.title ?? title}» запущено!`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не вдалося запустити турнір");
    } finally {
      setBusy(false);
    }
  }

  async function handleFinishNow() {
    if (!active || busy) return;
    setBusy(true);
    onError("");
    try {
      const next = await finishTournament({ data: { tournamentId: active.id } });
      setConfirmEndMode(null);
      onUpdated(next);
      onNotice(`Турнір #${active.id} завершено, призи Топ-2 видано автоматично.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Помилка завершення турніру");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelNow() {
    if (!active || busy) return;
    setBusy(true);
    onError("");
    try {
      const next = await cancelTournament({ data: { tournamentId: active.id } });
      setConfirmEndMode(null);
      onUpdated(next);
      onNotice(`Турнір #${active.id} скасовано без видачі нагород.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Помилка скасування турніру");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisqualify(playerId: string, username: string) {
    if (!active || busy) return;
    setBusy(true);
    onError("");
    try {
      const next = await disqualifyTournamentEntry({
        data: {
          tournamentId: active.id,
          playerId,
          reason: dqReason || "Порушення правил турніру",
        },
      });
      onUpdated(next);
      onNotice(`Учасника @${username} дискваліфіковано з турніру #${active.id}.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не вдалося дискваліфікувати");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {active ? (
        <>
          <section className="rounded-2xl border border-amber/50 bg-surface p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full border border-off/50 bg-off/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-off">
                    ACTIVE #{active.id}
                  </span>
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted">
                    <Clock className="size-3.5" /> До {new Date(active.endsAt).toLocaleString("uk-UA")}
                  </span>
                </div>
                <h2 className="font-display mt-1.5 text-lg font-bold text-fg">{active.title}</h2>
                {active.description ? <p className="mt-0.5 text-xs text-muted">{active.description}</p> : null}
                <p className="mt-2 font-mono text-[11px] text-amber">
                  Заряди: {active.startingCharges}/{active.maxCharges} · реген{" "}
                  {active.regenMinutes > 0 ? `${active.regenMinutes} хв` : "вимкнено"} · валюта{" "}
                  {TOURNAMENT_CURRENCY_SHORT}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {confirmEndMode === "finish" ? (
                  <div className="flex items-center gap-1.5 rounded-xl border border-amber/50 bg-bg px-2.5 py-1.5 text-xs">
                    <span className="text-amber">Видати Топ-2?</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleFinishNow()}
                      className="rounded-lg bg-amber px-2.5 py-1 font-bold text-ink"
                    >
                      Так
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmEndMode(null)}
                      className="rounded-lg border border-line px-2 py-1 text-muted"
                    >
                      Ні
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmEndMode("finish")}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-amber px-3.5 py-2 text-xs font-bold text-ink"
                  >
                    <CheckCircle2 className="size-3.5" /> Завершити і нагородити
                  </button>
                )}

                {confirmEndMode === "cancel" ? (
                  <div className="flex items-center gap-1.5 rounded-xl border border-off/50 bg-off/10 px-2.5 py-1.5 text-xs">
                    <span className="text-off">Без призів?</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleCancelNow()}
                      className="rounded-lg bg-off px-2.5 py-1 font-bold text-fg"
                    >
                      Скасувати
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmEndMode(null)}
                      className="rounded-lg border border-line px-2 py-1 text-muted"
                    >
                      Ні
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmEndMode("cancel")}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-off/40 bg-off/10 px-3 py-2 text-xs font-semibold text-off hover:bg-off/20"
                  >
                    <XCircle className="size-3.5" /> Скасувати турнір
                  </button>
                )}
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <LockedRelicSummary place={1} relic={active.rewardTop1} />
              <LockedRelicSummary place={2} relic={active.rewardTop2} />
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="font-display flex items-center gap-1.5 text-sm font-bold text-fg">
                <Trophy className="size-4 text-amber" /> Учасники турніру ({participants.length})
              </h3>
              <input
                type="text"
                value={dqReason}
                onChange={(e) => setDqReason(e.target.value)}
                placeholder="Причина дискваліфікації (необов'язково)"
                className="rounded-xl border border-line bg-bg px-3 py-1.5 text-xs text-fg outline-none focus:border-amber sm:w-72"
              />
            </div>

            {participants.length === 0 ? (
              <p className="mt-3 text-xs text-muted">Ще ніхто не приєднався до цього турніру.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {participants.map((p, idx) => (
                  <div
                    key={p.playerId}
                    className={`flex flex-col gap-2 rounded-xl border p-3 text-xs sm:flex-row sm:items-center sm:justify-between ${
                      p.disqualified ? "border-off/35 bg-off/5 opacity-75" : "border-line bg-bg"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-amber">
                          {p.disqualified ? "DQ" : `#${idx + 1}`}
                        </span>
                        <span className="font-semibold text-fg">{p.playerName}</span>
                        <span className="font-mono text-[11px] text-on">@{p.username}</span>
                        <span className="font-mono text-[10px] text-muted">#{p.publicId}</span>
                      </div>
                      <p className="mt-1 font-mono text-[11px] text-muted">
                        Банк: <strong className="text-amber">{p.bankedScore} {TOURNAMENT_CURRENCY_SHORT}</strong> ·
                        Котел: {p.unbankedPot} · Пік: {p.peakPot} · Спінів: {p.spinsUsed} · Заряди: {p.charges} · КЗ: {p.blackoutsHit}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-muted">
                        IP: {p.ipHashShort ?? "—"} · Пристрій: {p.deviceHashShort ?? "—"}
                        {p.disqualifiedReason ? ` · DQ: ${p.disqualifiedReason}` : ""}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => onSpectate(p.playerId)}
                        className="inline-flex items-center gap-1 rounded-lg border border-amber/40 bg-amber/10 px-2.5 py-1.5 text-xs font-semibold text-amber"
                      >
                        <Eye className="size-3.5" /> Спект
                      </button>
                      {!p.disqualified ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDisqualify(p.playerId, p.username)}
                          className="inline-flex items-center gap-1 rounded-lg border border-off/40 bg-off/10 px-2.5 py-1.5 text-xs font-semibold text-off hover:bg-off/20"
                        >
                          <Ban className="size-3.5" /> Дискваліфікувати
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <form onSubmit={handleLaunch} className="rounded-2xl border border-amber/40 bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display flex items-center gap-2 text-base font-bold text-amber">
              <Rocket className="size-4" /> Запустити новий турнір «Блекаут-Ралі»
            </h2>
            <span className="rounded-md border border-line bg-bg px-2 py-0.5 font-mono text-[10px] text-muted">
              Топ-2 призи видаються лише автоматично
            </span>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs text-muted">Назва турніру</span>
              <input
                type="text"
                required
                minLength={3}
                maxLength={64}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2 text-xs text-fg outline-none focus:border-amber"
              />
            </label>

            <label className="block">
              <span className="text-xs text-muted">Тривалість (хвилин)</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {[15, 60, 360, 1440].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setDurationMinutes(m)}
                    className={`rounded-lg border px-2.5 py-1.5 font-mono text-xs ${
                      durationMinutes === m
                        ? "border-amber bg-amber/15 text-amber"
                        : "border-line bg-bg text-muted"
                    }`}
                  >
                    {m >= 60 ? `${m / 60}г` : `${m}хв`}
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={10080}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Math.max(1, Number(e.target.value) || 60))}
                  className="w-20 rounded-lg border border-line bg-bg px-2 py-1.5 font-mono text-xs text-fg outline-none focus:border-amber"
                />
              </div>
            </label>
          </div>

          <label className="mt-3 block">
            <span className="text-xs text-muted">Опис / правила для гравців</span>
            <input
              type="text"
              maxLength={200}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2 text-xs text-fg outline-none focus:border-amber"
            />
          </label>

          <div className="mt-3 grid grid-cols-3 gap-2.5">
            <label className="block">
              <span className="text-[11px] text-muted">Стартові заряди (3–50)</span>
              <input
                type="number"
                min={3}
                max={50}
                value={startingCharges}
                onChange={(e) => setStartingCharges(Math.min(50, Math.max(3, Number(e.target.value) || 3)))}
                className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2 font-mono text-xs text-fg outline-none focus:border-amber"
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-muted">Макс. заряди (3–50)</span>
              <input
                type="number"
                min={3}
                max={50}
                value={maxCharges}
                onChange={(e) => setMaxCharges(Math.min(50, Math.max(3, Number(e.target.value) || 3)))}
                className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2 font-mono text-xs text-fg outline-none focus:border-amber"
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-muted">Реген +1 (хв, 0 = фікс)</span>
              <input
                type="number"
                min={0}
                max={1440}
                value={regenMinutes}
                onChange={(e) => setRegenMinutes(Math.min(1440, Math.max(0, Number(e.target.value) || 0)))}
                className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2 font-mono text-xs text-fg outline-none focus:border-amber"
              />
            </label>
          </div>

          <div className="mt-4 rounded-xl border border-amber/30 bg-bg/90 px-3 py-2.5 text-[11px] text-muted">
            <p className="font-display font-bold text-amber">Як працюють Ісекай-нагороди:</p>
            <p className="mt-0.5 leading-relaxed">
              Переможці Топ-1 і Топ-2 отримають ці унікальні трофеї у розділі{" "}
              <strong className="text-fg">⚔️ ісекай → кодекс</strong> (окремі 2 слоти понад юнітів загону — вони не
              впливають на баланс турнірів). Обирай готовий пресет сили нижче або підкручуй цифри вручну.
            </p>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <RelicBlueprintEditor place={1} value={rewardTop1} onChange={setRewardTop1} />
            <RelicBlueprintEditor place={2} value={rewardTop2} onChange={setRewardTop2} />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="font-display mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-amber px-4 py-3 text-sm font-extrabold text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Crown className="size-4" />
            {busy ? "Запуск турніру…" : "Запустити турнір для всіх гравців"}
          </button>
        </form>
      )}

      {history.length > 0 ? (
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h3 className="font-display flex items-center gap-1.5 text-sm font-bold text-fg">
            <Award className="size-4 text-amber" /> Історія турнірів ({history.length})
          </h3>
          <div className="mt-3 space-y-2">
            {history.map((t) => (
              <div key={t.id} className="rounded-xl border border-line bg-bg p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-display font-bold text-fg">
                    #{t.id} · {t.title}
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 font-mono text-[10px] ${
                      t.status === "finished" ? "bg-on/15 text-on" : "bg-off/15 text-off"
                    }`}
                  >
                    {t.status === "finished" ? "ЗАВЕРШЕНО" : "СКАСОВАНО"}
                  </span>
                </div>
                {t.winners.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {t.winners.map((w) => (
                      <span
                        key={w.playerId}
                        className="rounded-lg border border-amber/30 bg-surface px-2 py-1 font-mono text-[11px]"
                      >
                        {w.place === 1 ? "🥇" : "🥈"} @{w.username} ({w.bankedScore} {t.currencyName}) → {w.relic.emoji}{" "}
                        {w.relic.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-[11px] text-muted">Без нагороджених учасників.</p>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function RelicBlueprintEditor({
  place,
  value,
  onChange,
}: {
  place: 1 | 2;
  value: RelicBlueprint;
  onChange: (next: RelicBlueprint) => void;
}) {
  return (
    <div className="rounded-xl border border-line bg-bg p-3">
      <p className="font-display flex items-center gap-1.5 text-xs font-bold text-amber">
        <Shield className="size-3.5" />
        {place === 1 ? "🥇 Кастомний предмет Топ-1 (Ісекай)" : "🥈 Кастомний предмет Топ-2 (Ісекай)"}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {EMOJI_PRESETS.map((em) => (
          <button
            key={em}
            type="button"
            onClick={() => onChange({ ...value, emoji: em })}
            className={`grid size-7 place-items-center rounded border text-sm ${
              value.emoji === em ? "border-amber bg-amber/15" : "border-line bg-surface"
            }`}
          >
            {em}
          </button>
        ))}
        <input
          type="text"
          maxLength={8}
          value={value.emoji}
          onChange={(e) => onChange({ ...value, emoji: e.target.value })}
          className="h-7 w-12 rounded border border-line bg-surface px-1.5 text-center text-xs text-fg"
          aria-label="Своє емодзі"
        />
      </div>

      <label className="mt-2 block">
        <span className="text-[11px] text-muted">Назва реліквії</span>
        <input
          type="text"
          required
          minLength={2}
          maxLength={40}
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          className="mt-1 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-fg outline-none focus:border-amber"
        />
      </label>

      <label className="mt-2 block">
        <span className="text-[11px] text-muted">Опис / лор</span>
        <input
          type="text"
          maxLength={180}
          value={value.lore}
          onChange={(e) => onChange({ ...value, lore: e.target.value })}
          className="mt-1 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-fg outline-none focus:border-amber"
        />
      </label>

      <div className="mt-3">
        <p className="text-[11px] font-semibold text-fg">Пресет сили нагороди:</p>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {RELIC_POWER_PRESETS.map((preset) => {
            const active =
              value.buff.gemsPct === preset.buff.gemsPct &&
              value.buff.drainReductionPct === preset.buff.drainReductionPct &&
              value.buff.onBonus === preset.buff.onBonus &&
              value.buff.refundPct === preset.buff.refundPct;
            const tone =
              preset.id === "extreme"
                ? active
                  ? "border-off bg-off/20 text-off"
                  : "border-off/35 bg-surface text-off/85 hover:border-off"
                : preset.id === "high"
                  ? active
                    ? "border-amber bg-amber/20 text-amber"
                    : "border-amber/35 bg-surface text-amber/85 hover:border-amber"
                  : active
                    ? "border-on bg-on/15 text-on"
                    : "border-line bg-surface text-muted hover:text-fg";
            return (
              <button
                key={preset.id}
                type="button"
                title={preset.tag}
                onClick={() => onChange({ ...value, buff: { ...preset.buff } })}
                className={`rounded-lg border px-2 py-1.5 font-mono text-[10px] font-bold transition-colors ${tone}`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[11px]">
        <label className="block">
          <span className="text-muted">кВт-геми +0..45%</span>
          <input
            type="number"
            min={0}
            max={45}
            value={value.buff.gemsPct}
            onChange={(e) =>
              onChange({
                ...value,
                buff: { ...value.buff, gemsPct: Math.min(45, Math.max(0, Number(e.target.value) || 0)) },
              })
            }
            className="mt-0.5 w-full rounded-lg border border-line bg-surface px-2 py-1 text-xs text-fg"
          />
          <span className="mt-0.5 block font-sans text-[10px] text-muted/80">більше гемів за кожну крутку</span>
        </label>
        <label className="block">
          <span className="text-muted">Розряд −0..25%</span>
          <input
            type="number"
            min={0}
            max={25}
            value={value.buff.drainReductionPct}
            onChange={(e) =>
              onChange({
                ...value,
                buff: {
                  ...value.buff,
                  drainReductionPct: Math.min(25, Math.max(0, Number(e.target.value) || 0)),
                },
              })
            }
            className="mt-0.5 w-full rounded-lg border border-line bg-surface px-2 py-1 text-xs text-fg"
          />
          <span className="mt-0.5 block font-sans text-[10px] text-muted/80">повільніше сідає павербанк</span>
        </label>
        <label className="block">
          <span className="text-muted">Світло +0..10%</span>
          <input
            type="number"
            min={0}
            max={10}
            value={value.buff.onBonus}
            onChange={(e) =>
              onChange({
                ...value,
                buff: { ...value.buff, onBonus: Math.min(10, Math.max(0, Number(e.target.value) || 0)) },
              })
            }
            className="mt-0.5 w-full rounded-lg border border-line bg-surface px-2 py-1 text-xs text-fg"
          />
          <span className="mt-0.5 block font-sans text-[10px] text-muted/80">дод. заряд, коли випадає світло</span>
        </label>
        <label className="block">
          <span className="text-muted">Повернення +0..20%</span>
          <input
            type="number"
            min={0}
            max={20}
            value={value.buff.refundPct}
            onChange={(e) =>
              onChange({
                ...value,
                buff: { ...value.buff, refundPct: Math.min(20, Math.max(0, Number(e.target.value) || 0)) },
              })
            }
            className="mt-0.5 w-full rounded-lg border border-line bg-surface px-2 py-1 text-xs text-fg"
          />
          <span className="mt-0.5 block font-sans text-[10px] text-muted/80">шанс на ×2 кВт-гемів за крутку</span>
        </label>
      </div>
    </div>
  );
}

function LockedRelicSummary({ place, relic }: { place: 1 | 2; relic: RelicBlueprint }) {
  return (
    <div className="rounded-xl border border-line bg-bg p-2.5 text-xs">
      <p className="font-mono text-[10px] font-bold text-amber">
        {place === 1 ? "🥇 ТОП-1 НАГОРОДА" : "🥈 ТОП-2 НАГОРОДА"}
      </p>
      <p className="mt-0.5 font-semibold text-fg">
        {relic.emoji} {relic.name}
      </p>
      <p className="mt-0.5 font-mono text-[10px] text-muted">
        +{relic.buff.gemsPct}% геми · −{relic.buff.drainReductionPct}% розряд · +{relic.buff.onBonus}% світло · +
        {relic.buff.refundPct}% поверн.
      </p>
    </div>
  );
}
