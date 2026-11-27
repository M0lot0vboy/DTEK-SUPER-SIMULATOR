import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Activity,
  AlertTriangle,
  Ban,
  Chrome,
  Cpu,
  Eye,
  Globe,
  Lock,
  LogOut,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import {
  adminLogin,
  adminLogout,
  banPlayer,
  demonetizePlayer,
  getAdminDashboard,
  getAdminStatus,
  spectatePlayer,
  unbanEntry,
  type AdminDashboardData,
  type AdminSpectateData,
  type AdminStatusResponse,
  type BanType,
} from "@/lib/admin";
import { RARITY_COLOR, UNIT_BY_ID } from "@/lib/gacha/pool";
import { HARD_PITY, PITY_4, constellationOf } from "@/lib/gacha/rules";

export const Route = createFileRoute("/admin")({ component: AdminPage });

type AdminTab = "players" | "bans" | "logs";
type SortBy = "updated" | "spins" | "flags" | "pulls";

const BAN_META: Record<BanType, { label: string; short: string; icon: typeof Globe }> = {
  ip: { label: "IP-бан", short: "IP", icon: Globe },
  chrome: { label: "Chrome / Браузер", short: "Chrome", icon: Chrome },
  pc: { label: "ПК / Залізо", short: "ПК", icon: Cpu },
};

function fmtTime(isoOrMs: string | number): string {
  const ms = typeof isoOrMs === "number" ? isoOrMs : new Date(isoOrMs).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  return new Date(ms).toLocaleString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "щойно";
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}с тому`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}хв тому`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}год тому`;
  return `${Math.floor(hrs / 24)}д тому`;
}

function AdminPage() {
  const [status, setStatus] = useState<AdminStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [tab, setTab] = useState<AdminTab>("players");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortBy>("updated");
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null);
  const [dashBusy, setDashBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");

  const [spectateId, setSpectateId] = useState<string | null>(null);
  const [spectateData, setSpectateData] = useState<AdminSpectateData | null>(null);
  const [spectateBusy, setSpectateBusy] = useState(false);

  const [modReason, setModReason] = useState("");
  const [banSelection, setBanSelection] = useState<Record<BanType, boolean>>({
    ip: false,
    chrome: true,
    pc: false,
  });
  const [confirmReset, setConfirmReset] = useState(false);
  const [modBusy, setModBusy] = useState(false);

  const refreshStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const s = await getAdminStatus();
      setStatus(s);
    } catch {
      setStatus({ configured: false, mode: "none", authenticated: false, adminUser: null });
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const loadDashboard = useCallback(
    async (silent = false) => {
      if (!status?.authenticated) return;
      if (!silent) setDashBusy(true);
      try {
        const data = await getAdminDashboard({ data: { search, sort } });
        setDashboard(data);
        setActionError("");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("ADMIN_UNAUTHORIZED")) {
          setStatus((prev) => (prev ? { ...prev, authenticated: false, adminUser: null } : prev));
          setDashboard(null);
          setSpectateId(null);
          setSpectateData(null);
        } else if (!silent) {
          setActionError(msg || "Не вдалося оновити дані");
        }
      } finally {
        if (!silent) setDashBusy(false);
      }
    },
    [status?.authenticated, search, sort],
  );

  const loadSpectate = useCallback(
    async (id: string, silent = false) => {
      if (!silent) setSpectateBusy(true);
      try {
        const detail = await spectatePlayer({ data: { playerId: id } });
        setSpectateData(detail);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("ADMIN_UNAUTHORIZED")) {
          setStatus((prev) => (prev ? { ...prev, authenticated: false, adminUser: null } : prev));
        } else if (!silent) {
          setActionError(msg || "Помилка завантаження профілю");
        }
      } finally {
        if (!silent) setSpectateBusy(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!status?.authenticated) return;
    void loadDashboard(false);
    const iv = window.setInterval(() => {
      if (document.hidden) return;
      void loadDashboard(true);
    }, 5000);
    return () => window.clearInterval(iv);
  }, [status?.authenticated, loadDashboard]);

  useEffect(() => {
    if (!status?.authenticated || !spectateId) return;
    setConfirmReset(false);
    void loadSpectate(spectateId, false);
    const iv = window.setInterval(() => {
      if (document.hidden) return;
      void loadSpectate(spectateId, true);
    }, 2500);
    return () => window.clearInterval(iv);
  }, [status?.authenticated, spectateId, loadSpectate]);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    if (loginBusy) return;
    setLoginBusy(true);
    setLoginError("");
    try {
      const res = await adminLogin({ data: { username, password } });
      if (!res.ok) {
        setLoginError(res.error);
        return;
      }
      setPassword("");
      setStatus((prev) => (prev ? { ...prev, authenticated: true, adminUser: res.adminUser } : prev));
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Помилка авторизації");
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleLogout() {
    await adminLogout().catch(() => null);
    setStatus((prev) => (prev ? { ...prev, authenticated: false, adminUser: null } : prev));
    setDashboard(null);
    setSpectateId(null);
    setSpectateData(null);
  }

  async function handleDemonitize(targetId: string) {
    if (modBusy) return;
    setModBusy(true);
    setActionError("");
    setActionNotice("");
    try {
      const updated = await demonetizePlayer({
        data: { playerId: targetId, reason: modReason || "AC Reset адміністратором" },
      });
      setConfirmReset(false);
      setActionNotice(`Гравець ${updated.name} обнулений (AC Reset)`);
      if (spectateId === targetId) setSpectateData(updated);
      await loadDashboard(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Не вдалося виконати AC Reset");
    } finally {
      setModBusy(false);
    }
  }

  async function handleBan(targetId: string, overrideTypes?: BanType[]) {
    if (modBusy) return;
    const types =
      overrideTypes ??
      (["ip", "chrome", "pc"] as BanType[]).filter((t) => banSelection[t]);
    if (types.length === 0) {
      setActionError("Обери хоча б один тип бану (IP, Chrome або ПК)");
      return;
    }
    setModBusy(true);
    setActionError("");
    setActionNotice("");
    try {
      const updated = await banPlayer({
        data: {
          playerId: targetId,
          banTypes: types,
          reason: modReason || "Порушення правил чесної гри",
        },
      });
      setActionNotice(`Заблоковано (${types.join(", ").toUpperCase()}): ${updated.name}`);
      if (spectateId === targetId) setSpectateData(updated);
      await loadDashboard(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Помилка блокування");
    } finally {
      setModBusy(false);
    }
  }

  async function handleUnban(input: { banId?: number; playerId?: string }) {
    if (modBusy) return;
    setModBusy(true);
    setActionError("");
    setActionNotice("");
    try {
      const res = await unbanEntry({ data: input });
      setActionNotice(`Знято блокувань: ${res.clearedCount}`);
      if (spectateId) await loadSpectate(spectateId, true);
      await loadDashboard(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Помилка розблокування");
    } finally {
      setModBusy(false);
    }
  }

  if (loadingStatus || !status) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-5xl items-center justify-center px-4 py-12">
        <div className="rounded-xl border border-line bg-surface px-6 py-5 text-sm text-muted">
          Ініціалізація захищеного каналу…
        </div>
      </main>
    );
  }

  if (!status.configured) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center px-4 py-10">
        <div className="w-full rounded-2xl border border-amber/30 bg-surface p-6">
          <div className="flex items-center gap-3 text-amber">
            <ShieldAlert className="size-6 shrink-0" />
            <h1 className="font-display text-lg font-bold">Адмін-центр не налаштовано</h1>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Облікові дані не зберігаються в коді. Задай змінні середовища на сервері, щоб увімкнути вхід:
          </p>
          <div className="mt-4 rounded-xl border border-line bg-bg p-3 font-mono text-xs text-fg">
            <div>ADMIN_USER=...</div>
            <div>ADMIN_PASSWORD_HASH=dtek-fbi-v1$...</div>
            <div className="mt-1 text-muted">або ADMIN_PASSWORD=...</div>
          </div>
          <p className="mt-3 text-xs text-muted">
            Для генерації криптографічного хешу виконай:{" "}
            <code className="rounded bg-bg px-1.5 py-0.5 font-mono text-amber">
              node scripts/hash-admin-password.mjs &lt;user&gt; &lt;pass&gt;
            </code>
          </p>
        </div>
      </main>
    );
  }

  if (!status.authenticated) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-4 py-10">
        <form
          onSubmit={(e) => void handleLogin(e)}
          className="w-full rounded-2xl border border-line bg-surface p-6 shadow-2xl"
        >
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl border border-amber/40 bg-amber/10 text-amber">
              <Lock className="size-5" />
            </div>
            <div>
              <p className="font-display text-[11px] tracking-[0.2em] text-amber uppercase">
                Закритий контур
              </p>
              <h1 className="font-display text-lg font-bold text-fg">ДТЕК // АДМІН-ВХІД</h1>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-line bg-bg/70 px-3 py-2 font-mono text-[11px] text-muted">
            KDF: scrypt(N=32768) → PBKDF2-SHA512(210k) → HMAC-SHA512 • Rate-Limit 5/15хв
          </div>

          <label className="mt-5 block">
            <span className="text-xs font-medium text-muted">Логін оператора</span>
            <input
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-sm text-fg outline-none focus:border-amber"
              placeholder="ADMIN_USER"
            />
          </label>

          <label className="mt-3.5 block">
            <span className="text-xs font-medium text-muted">Пароль доступу</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-sm text-fg outline-none focus:border-amber"
              placeholder="••••••••••••"
            />
          </label>

          {loginError ? (
            <div className="mt-4 rounded-xl border border-off/40 bg-off/10 px-3 py-2.5 text-xs text-off">
              {loginError}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loginBusy}
            className="font-display mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-amber px-4 py-3 text-sm font-bold text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Shield className="size-4" />
            {loginBusy ? "Перевірка…" : "Авторизуватися"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-3 py-4 sm:px-6 sm:py-6">
      <header className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-amber/40 bg-amber/10 px-2 py-0.5 font-mono text-[11px] text-amber">
              <ShieldCheck className="size-3.5" /> {status.adminUser}
            </span>
            <span className="rounded-md border border-line bg-bg px-2 py-0.5 font-mono text-[11px] text-muted">
              Тільки спостереження і модерація (без видачі ресурсів)
            </span>
          </div>
          <h1 className="font-display mt-1.5 text-xl font-bold tracking-tight text-fg sm:text-2xl">
            ДТЕК // ЦЕНТР КОНТРОЛЮ
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadDashboard(false)}
            disabled={dashBusy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-bg px-3 py-2 text-xs font-medium text-fg hover:border-amber/50"
          >
            <RefreshCw className={`size-3.5 ${dashBusy ? "animate-spin" : ""}`} />
            Оновити
          </button>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-off/40 bg-off/10 px-3 py-2 text-xs font-medium text-off hover:bg-off/20"
          >
            <LogOut className="size-3.5" />
            Вийти
          </button>
        </div>
      </header>

      {actionError ? (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-off/40 bg-off/10 px-4 py-2.5 text-xs text-off">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError("")} aria-label="Закрити помилку">
            <X className="size-4" />
          </button>
        </div>
      ) : null}

      {actionNotice ? (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-on/40 bg-on/10 px-4 py-2.5 text-xs text-on">
          <span>{actionNotice}</span>
          <button type="button" onClick={() => setActionNotice("")} aria-label="Закрити сповіщення">
            <X className="size-4" />
          </button>
        </div>
      ) : null}

      <section className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        <StatCard icon={Users} label="Гравців (S3)" value={dashboard?.summary.totalPlayers ?? 0} />
        <StatCard
          icon={Activity}
          label="Онлайн (5 хв)"
          value={dashboard?.summary.activeOnline5m ?? 0}
          tone="text-on"
        />
        <StatCard
          icon={Ban}
          label="Забанено"
          value={dashboard?.summary.bannedPlayers ?? 0}
          tone="text-off"
        />
        <StatCard
          icon={AlertTriangle}
          label="Прапорців AC"
          value={dashboard?.summary.totalFlags ?? 0}
          tone="text-amber"
        />
        <StatCard
          icon={Sparkles}
          label="Спінів разом"
          value={dashboard?.summary.totalSpins ?? 0}
          className="col-span-2 sm:col-span-1"
        />
      </section>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-line bg-surface p-1">
          <TabBtn active={tab === "players"} onClick={() => setTab("players")}>
            <Users className="size-3.5" /> Гравці ({dashboard?.players.length ?? 0})
          </TabBtn>
          <TabBtn active={tab === "bans"} onClick={() => setTab("bans")}>
            <Ban className="size-3.5" /> Бани ({dashboard?.bans.filter((b) => b.active).length ?? 0})
          </TabBtn>
          <TabBtn active={tab === "logs"} onClick={() => setTab("logs")}>
            <ScrollText className="size-3.5" /> Журнали
          </TabBtn>
        </div>

        {tab === "players" ? (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <div className="relative flex-1 sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Нік, ID, IP, FP…"
                className="w-full rounded-xl border border-line bg-surface py-2 pr-3 pl-8 text-xs text-fg outline-none focus:border-amber"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortBy)}
              className="rounded-xl border border-line bg-surface px-3 py-2 text-xs text-fg outline-none focus:border-amber"
              aria-label="Сортування гравців"
            >
              <option value="updated">За активністю</option>
              <option value="spins">За спінами</option>
              <option value="flags">За прапорцями AC</option>
              <option value="pulls">За молитвами</option>
            </select>
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section className={`min-w-0 ${spectateId ? "lg:col-span-7" : "lg:col-span-12"}`}>
          {tab === "players" ? (
            <div className="space-y-2">
              {(dashboard?.players ?? []).length === 0 ? (
                <div className="rounded-2xl border border-line bg-surface p-8 text-center text-sm text-muted">
                  Гравців не знайдено
                </div>
              ) : (
                (dashboard?.players ?? []).map((p) => {
                  const selected = spectateId === p.id;
                  return (
                    <div
                      key={p.id}
                      className={`rounded-xl border p-3 transition-colors ${
                        selected
                          ? "border-amber bg-amber/5"
                          : "border-line bg-surface hover:border-amber/40"
                      }`}
                    >
                      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`size-2 rounded-full ${
                                p.online ? "bg-on shadow-[0_0_8px_#4fae63]" : "bg-line"
                              }`}
                              title={p.online ? "Онлайн" : "Офлайн"}
                            />
                            <span className="truncate font-semibold text-fg">{p.name}</span>
                            {p.accountUsername ? (
                              <span className="rounded border border-on/30 bg-on/10 px-1.5 py-0.5 font-mono text-[11px] text-on">
                                @{p.accountUsername}
                              </span>
                            ) : null}
                            <span className="rounded bg-bg px-1.5 py-0.5 font-mono text-[11px] text-muted">
                              #{p.publicId}
                            </span>
                            {p.flags > 0 ? (
                              <span className="rounded bg-amber/15 px-1.5 py-0.5 font-mono text-[11px] text-amber">
                                ⚑ {p.flags}
                              </span>
                            ) : null}
                            {p.activeBanTypes.map((bt) => (
                              <span
                                key={bt}
                                className="rounded border border-off/40 bg-off/15 px-1.5 py-0.5 font-mono text-[10px] text-off uppercase"
                              >
                                BAN:{BAN_META[bt].short}
                              </span>
                            ))}
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted">
                            <span>Спіни: <strong className="text-fg">{p.spins}</strong></span>
                            <span>Рівень: <strong className="text-fg">{p.level}</strong></span>
                            <span>5★: <strong className="text-amber">{p.fives}</strong></span>
                            <span>Молитви: <strong className="text-fg">{p.pulls}</strong></span>
                            <span>Геми: <strong className="text-fg">{p.gems}</strong></span>
                            <span>IP: {p.ipHint ?? "не зафікс."}</span>
                            <span>{fmtRelative(p.updatedAt)}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setSpectateId(p.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber/40 bg-amber/10 px-2.5 py-1.5 text-xs font-medium text-amber hover:bg-amber/20"
                          >
                            <Eye className="size-3.5" /> Спект
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSpectateId(p.id);
                              setConfirmReset(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-line bg-bg px-2.5 py-1.5 text-xs text-muted hover:border-amber/50 hover:text-fg"
                            title="Demonitize / AC Reset"
                          >
                            <RotateCcw className="size-3.5" /> AC Reset
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : null}

          {tab === "bans" ? (
            <div className="space-y-2">
              {(dashboard?.bans ?? []).length === 0 ? (
                <div className="rounded-2xl border border-line bg-surface p-8 text-center text-sm text-muted">
                  Список блокувань порожній
                </div>
              ) : (
                (dashboard?.bans ?? []).map((b) => (
                  <div
                    key={b.id}
                    className={`flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between ${
                      b.active ? "border-off/35 bg-surface" : "border-line bg-surface/50 opacity-65"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded px-2 py-0.5 font-mono text-[11px] uppercase ${
                            b.active ? "bg-off/15 text-off" : "bg-bg text-muted"
                          }`}
                        >
                          {BAN_META[b.banType]?.label ?? b.banType}
                        </span>
                        <span className="font-semibold text-fg">{b.playerName || "Невідомий гравець"}</span>
                        <span className="font-mono text-[11px] text-muted">{b.banValueShort}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                            b.active ? "bg-off/20 text-off" : "bg-bg text-muted"
                          }`}
                        >
                          {b.active ? "АКТИВНИЙ" : "ЗНЯТО"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        Причина: <span className="text-fg">{b.reason}</span> • Видав: {b.bannedBy} •{" "}
                        {fmtTime(b.createdAt)}
                      </p>
                    </div>
                    {b.active ? (
                      <button
                        type="button"
                        disabled={modBusy}
                        onClick={() => void handleUnban({ banId: b.id })}
                        className="shrink-0 rounded-lg border border-on/40 bg-on/10 px-3 py-1.5 text-xs font-medium text-on hover:bg-on/20 disabled:opacity-50"
                      >
                        Розбанити
                      </button>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          ) : null}

          {tab === "logs" ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-line bg-surface p-4">
                <h2 className="font-display text-sm font-bold text-amber">Античіт-сигнали</h2>
                <div className="mt-3 max-h-[540px] space-y-2 overflow-y-auto pr-1">
                  {(dashboard?.anticheatLogs ?? []).length === 0 ? (
                    <p className="text-xs text-muted">Порушень ще немає.</p>
                  ) : (
                    (dashboard?.anticheatLogs ?? []).map((v) => (
                      <div key={v.id} className="rounded-lg border border-line bg-bg p-2.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-semibold text-off">{v.reason}</span>
                          <span className="font-mono text-[10px] text-muted">{fmtTime(v.createdAt)}</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-muted">
                          <span>{v.playerName || v.playerId || "anon"}</span>
                          {v.playerId ? (
                            <button
                              type="button"
                              onClick={() => setSpectateId(v.playerId)}
                              className="font-mono text-[11px] text-amber hover:underline"
                            >
                              Спект
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-line bg-surface p-4">
                <h2 className="font-display text-sm font-bold text-fg">Журнал дій адміністратора</h2>
                <div className="mt-3 max-h-[540px] space-y-2 overflow-y-auto pr-1">
                  {(dashboard?.auditLogs ?? []).length === 0 ? (
                    <p className="text-xs text-muted">Подій ще немає.</p>
                  ) : (
                    (dashboard?.auditLogs ?? []).map((a) => (
                      <div key={a.id} className="rounded-lg border border-line bg-bg p-2.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-semibold text-amber">{a.action}</span>
                          <span className="font-mono text-[10px] text-muted">{fmtTime(a.createdAt)}</span>
                        </div>
                        <p className="mt-1 break-all font-mono text-[11px] text-muted">
                          {a.adminUser}
                          {a.targetPlayerId ? ` → ${a.targetPlayerId}` : ""} • {a.detail}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </section>

        {spectateId ? (
          <aside className="min-w-0 lg:col-span-5">
            <div className="sticky top-4 rounded-2xl border border-amber/40 bg-surface p-4">
              <div className="flex items-start justify-between gap-2 border-b border-line pb-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded bg-amber/15 px-2 py-0.5 font-mono text-[11px] text-amber">
                      <Eye className="size-3" /> LIVE SPECTATE (2.5с)
                    </span>
                    {spectateData?.online ? (
                      <span className="rounded bg-on/15 px-1.5 py-0.5 font-mono text-[10px] text-on">
                        ОНЛАЙН
                      </span>
                    ) : null}
                  </div>
                  <h2 className="font-display mt-1.5 truncate text-lg font-bold text-fg">
                    {spectateData?.name ?? "Завантаження…"}
                    {spectateData?.accountUsername ? (
                      <span className="ml-2 font-mono text-xs font-normal text-on">
                        @{spectateData.accountUsername}
                      </span>
                    ) : null}
                  </h2>
                  <p className="break-all font-mono text-[11px] text-muted">
                    ID: {spectateId} {spectateData ? `(#${spectateData.publicId})` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSpectateId(null);
                    setSpectateData(null);
                  }}
                  aria-label="Закрити спостереження"
                  className="rounded-lg border border-line bg-bg p-1.5 text-muted hover:text-fg"
                >
                  <X className="size-4" />
                </button>
              </div>

              {spectateBusy && !spectateData ? (
                <p className="py-8 text-center text-xs text-muted">Зчитування телеметрії гравця…</p>
              ) : spectateData ? (
                <div className="mt-3 space-y-4">
                  <div className="grid grid-cols-3 gap-2 font-mono text-xs">
                    <MiniStat label="Спіни" value={spectateData.spins} accent="text-fg" />
                    <MiniStat label="Рівень" value={`${spectateData.level} (${spectateData.title})`} accent="text-amber" />
                    <MiniStat label="XP" value={`${spectateData.xp}/${spectateData.xpForNextLevel}`} />
                    <MiniStat label="кВт-геми" value={spectateData.gems} accent="text-amber" />
                    <MiniStat label="Копіум" value={spectateData.shards} />
                    <MiniStat label="Талони" value={spectateData.tickets} />
                    <MiniStat label="5★ вибито" value={spectateData.fives} accent="text-amber" />
                    <MiniStat label="Молитви" value={spectateData.pulls} />
                    <MiniStat label="Прапорці AC" value={spectateData.flags} accent={spectateData.flags > 0 ? "text-off" : "text-on"} />
                  </div>

                  <div className="rounded-xl border border-line bg-bg p-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-fg">Гача та ігрові прапорці</span>
                      <span className="font-mono text-[11px] text-muted">seq #{spectateData.seq}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1.5 font-mono text-[11px] text-muted">
                      <div>Піті 5★: <strong className="text-fg">{spectateData.pity5}/{HARD_PITY}</strong></div>
                      <div>Піті 4★: <strong className="text-fg">{spectateData.pity4}/{PITY_4}</strong></div>
                      <div>Гарант 50/50: <strong className="text-amber">{spectateData.guaranteed ? "100% БАНЕР" : "50/50"}</strong></div>
                      <div>Програно 50/50: <strong className="text-fg">{spectateData.lost5050Count}</strong></div>
                      <div>Подія колеса: <strong className="text-fg">{spectateData.spinEvent ? `${spectateData.spinEvent.kind} (${spectateData.spinEvent.left})` : "немає"}</strong></div>
                      <div>Блакаут / Буст: <strong className={spectateData.inBlackout ? "text-off" : "text-fg"}>{spectateData.inBlackout ? "ТАК" : "ні"} / {spectateData.boostSpins}</strong></div>
                      <div>Останній спін: <strong className="text-fg">{fmtTime(spectateData.lastSpinAt)}</strong></div>
                      <div>AC Reset: <strong className="text-fg">{fmtTime(spectateData.lastResetAt)}</strong></div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-line bg-bg p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-fg">
                        Загін ({spectateData.loadout.length}/3) і Бафи
                      </span>
                      <span className="font-mono text-[11px] text-amber">
                        +{spectateData.buffs.gems.toFixed(0)} гем/спін • ×{spectateData.buffs.drain.toFixed(2)} дренаж • {Math.round(spectateData.buffs.refund * 100)}% поверн.
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {spectateData.loadout.length === 0 ? (
                        <span className="text-muted">Загін порожній</span>
                      ) : (
                        spectateData.loadout.map((uid) => {
                          const u = UNIT_BY_ID[uid];
                          const c = constellationOf(spectateData.copies[uid] ?? 1);
                          return (
                            <span
                              key={uid}
                              className="rounded-lg border border-amber/30 bg-surface px-2 py-1 font-mono text-[11px] text-fg"
                            >
                              {u?.name ?? uid} <span className="text-amber">C{c}</span>
                            </span>
                          );
                        })
                      )}
                    </div>

                    <div className="mt-3 border-t border-line pt-2.5">
                      <p className="text-[11px] text-muted">
                        Колекція ({Object.keys(spectateData.copies).length} юнітів):
                      </p>
                      <div className="mt-1.5 flex max-h-28 flex-wrap gap-1 overflow-y-auto">
                        {Object.entries(spectateData.copies).length === 0 ? (
                          <span className="text-[11px] text-muted">Колекція порожня</span>
                        ) : (
                          Object.entries(spectateData.copies)
                            .sort((a, b) => (UNIT_BY_ID[b[0]]?.rarity ?? 0) - (UNIT_BY_ID[a[0]]?.rarity ?? 0))
                            .map(([uid, cnt]) => {
                              const u = UNIT_BY_ID[uid];
                              const color = u ? RARITY_COLOR[u.rarity] : "#9c9486";
                              return (
                                <span
                                  key={uid}
                                  className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px]"
                                  style={{ color }}
                                >
                                  {u?.name ?? uid} C{constellationOf(cnt)} ({cnt})
                                </span>
                              );
                            })
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-line bg-bg p-3 text-xs">
                    <p className="font-semibold text-fg">Мережа і відбитки пристрою</p>
                    <div className="mt-2 space-y-1 break-all font-mono text-[11px] text-muted">
                      <div>IP-маска: <span className="text-fg">{spectateData.ipHint ?? "не зафіксовано"}</span> {spectateData.ipHashShort ? `(${spectateData.ipHashShort})` : ""}</div>
                      <div>Chrome FP: <span className="text-fg">{spectateData.chromeFp ?? "не зафіксовано"}</span></div>
                      <div>PC Hardware FP: <span className="text-fg">{spectateData.pcFp ?? "не зафіксовано"}</span></div>
                      <div>UA: <span className="text-fg">{spectateData.userAgent ?? "не зафіксовано"}</span></div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-off/30 bg-bg p-3">
                    <p className="text-xs font-semibold text-fg">Модерація гравця</p>
                    <input
                      type="text"
                      value={modReason}
                      onChange={(e) => setModReason(e.target.value)}
                      placeholder="Причина (необов'язково)…"
                      className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-fg outline-none focus:border-amber"
                    />

                    <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                      {(["ip", "chrome", "pc"] as BanType[]).map((bt) => {
                        const Icon = BAN_META[bt].icon;
                        const active = banSelection[bt];
                        return (
                          <button
                            key={bt}
                            type="button"
                            onClick={() => setBanSelection((prev) => ({ ...prev, [bt]: !prev[bt] }))}
                            className={`flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
                              active
                                ? "border-off bg-off/15 text-off"
                                : "border-line bg-surface text-muted hover:text-fg"
                            }`}
                          >
                            <Icon className="size-3.5 shrink-0" />
                            <span>{BAN_META[bt].short}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        disabled={modBusy}
                        onClick={() => void handleBan(spectateData.id)}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-off px-3 py-2 text-xs font-bold text-fg hover:opacity-90 disabled:opacity-50"
                      >
                        <Ban className="size-3.5" /> Забанити
                      </button>

                      {confirmReset ? (
                        <div className="flex flex-1 gap-1.5">
                          <button
                            type="button"
                            disabled={modBusy}
                            onClick={() => void handleDemonitize(spectateData.id)}
                            className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-amber bg-amber px-2.5 py-2 text-xs font-bold text-ink"
                          >
                            Підтвердити AC Reset
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmReset(false)}
                            className="rounded-xl border border-line bg-surface px-2.5 py-2 text-xs text-muted"
                          >
                            Ні
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={modBusy}
                          onClick={() => setConfirmReset(true)}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber/50 bg-amber/10 px-3 py-2 text-xs font-bold text-amber hover:bg-amber/20 disabled:opacity-50"
                        >
                          <RotateCcw className="size-3.5" /> Demonitize (AC Reset)
                        </button>
                      )}
                    </div>

                    {spectateData.activeBans.length > 0 ? (
                      <div className="mt-3 border-t border-line pt-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium text-off">
                            Активні бани ({spectateData.activeBans.length})
                          </span>
                          <button
                            type="button"
                            disabled={modBusy}
                            onClick={() => void handleUnban({ playerId: spectateData.id })}
                            className="font-mono text-[11px] text-on hover:underline"
                          >
                            Розбанити все
                          </button>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {spectateData.activeBans.map((b) => (
                            <button
                              key={b.id}
                              type="button"
                              disabled={modBusy}
                              onClick={() => void handleUnban({ banId: b.id })}
                              className="inline-flex items-center gap-1 rounded border border-off/40 bg-off/10 px-2 py-0.5 font-mono text-[10px] text-off hover:bg-on/10 hover:text-on"
                              title="Натисни, щоб зняти цей бан"
                            >
                              {BAN_META[b.banType].short}: {b.banValueShort} ×
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {spectateData.violations.length > 0 ? (
                    <div className="rounded-xl border border-line bg-bg p-3">
                      <p className="text-xs font-semibold text-amber">
                        Останні античіт-події ({spectateData.violations.length})
                      </p>
                      <div className="mt-2 max-h-36 space-y-1 overflow-y-auto font-mono text-[11px]">
                        {spectateData.violations.map((v) => (
                          <div key={v.id} className="flex items-center justify-between gap-2 text-muted">
                            <span className="truncate text-off">{v.reason}</span>
                            <span className="shrink-0 text-[10px]">{fmtTime(v.createdAt)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>
    </main>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone = "text-fg",
  className = "",
}: {
  icon: typeof Users;
  label: string;
  value: number;
  tone?: string;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-line bg-surface p-3 ${className}`}>
      <div className="flex items-center justify-between text-muted">
        <span className="text-[11px]">{label}</span>
        <Icon className="size-3.5" />
      </div>
      <div className={`font-display mt-1 text-lg font-bold ${tone}`}>{value}</div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  accent = "text-fg",
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-bg px-2.5 py-1.5">
      <div className="text-[10px] text-muted">{label}</div>
      <div className={`truncate font-semibold ${accent}`}>{value}</div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-amber text-ink" : "text-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}
