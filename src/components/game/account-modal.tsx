import { useEffect, useState, type FormEvent } from "react";
import { LogIn, LogOut, ShieldCheck, UserCheck, UserPlus, X } from "lucide-react";
import { useGame } from "@/lib/game/store";
import { levelFromXp } from "@/lib/game/data";
import { useGacha } from "@/lib/gacha/engine";
import {
  performLoginAccount,
  performLogoutAccount,
  performRegisterAccount,
  usePlayer,
} from "@/lib/game/player";

type Mode = "register" | "login";

function suggestUsername(name: string): string {
  const cleaned = name
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_.\-\u0400-\u04FF]/g, "")
    .slice(0, 20);
  return cleaned.length >= 3 ? cleaned : "";
}

export function AccountModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const accountUsername = usePlayer((s) => s.accountUsername);
  const playerName = usePlayer((s) => s.name);
  const spins = useGame((s) => s.spins);
  const xp = useGame((s) => s.xp);
  const gems = useGacha((s) => s.gems);
  const totalPulls = useGacha((s) => s.totalPulls);
  const fives = useGacha((s) =>
    Object.values(s.copies).reduce((sum, n) => sum + (Number.isFinite(n) && n > 0 ? n : 0), 0),
  );

  const [mode, setMode] = useState<Mode>("register");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setPassword("");
    if (!accountUsername && !username && playerName) {
      setUsername(suggestUsername(playerName));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, accountUsername]);

  if (!open) return null;

  const hasProgress = spins > 0 || totalPulls > 0 || playerName.length >= 2;
  const level = levelFromXp(xp);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "register") {
        const res = await performRegisterAccount(username, password);
        useGame
          .getState()
          .pushToast(
            "Акаунт синхронізовано",
            `@${res.accountUsername} прив'язано до твого прогресу!`,
            "#4fae63",
          );
      } else {
        const res = await performLoginAccount(username, password);
        useGame
          .getState()
          .pushToast(
            "Вхід виконано",
            `Ласкаво просимо, @${res.accountUsername} (${res.state.spins} спінів)!`,
            "#4fae63",
          );
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося виконати запит");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await performLogoutAccount();
      useGame.getState().pushToast("Вихід", "Ти вийшов з акаунту на цьому пристрої", "#e8a317");
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#050403]/92 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-label="Акаунт гравця"
    >
      <div className="animate-toast relative w-full max-w-md rounded-2xl border border-amber/35 bg-surface p-5 shadow-2xl sm:p-6">
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрити"
          className="absolute top-3.5 right-3.5 rounded-lg border border-line bg-bg p-1.5 text-muted hover:text-fg"
        >
          <X className="size-4" />
        </button>

        {accountUsername ? (
          <div>
            <div className="flex items-center gap-2.5 text-on">
              <UserCheck className="size-5 shrink-0" />
              <p className="font-display text-xs tracking-[0.2em] uppercase">Акаунт підключено</p>
            </div>
            <h2 className="font-display mt-2 text-xl font-bold text-fg">@{accountUsername}</h2>
            <p className="mt-1 text-xs text-muted">
              Синхронізується із серверним античітом ДТЕК. Можеш входити з будь-якого браузера чи телефону.
            </p>

            <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-line bg-bg p-3 text-center font-mono text-xs">
              <div>
                <div className="text-[10px] text-muted">Спіни</div>
                <div className="font-bold text-fg">{spins}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted">Ранг</div>
                <div className="font-bold text-amber">{level}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted">кВт-геми</div>
                <div className="font-bold text-amber">{gems}</div>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={onClose}
                className="font-display flex-1 rounded-xl bg-amber px-4 py-2.5 text-xs font-bold text-ink"
              >
                Продовжити гру
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleLogout()}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-off/40 bg-off/10 px-4 py-2.5 text-xs font-semibold text-off hover:bg-off/20 disabled:opacity-50"
              >
                <LogOut className="size-3.5" /> Вийти
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2 text-amber">
              <ShieldCheck className="size-5 shrink-0" />
              <p className="font-display text-xs tracking-[0.2em] uppercase">Синхронізація Акаунту</p>
            </div>
            <h2 className="font-display mt-1.5 text-lg font-bold text-fg">
              {mode === "register" ? "Створи логін і пароль" : "Увійди у свій акаунт"}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {mode === "register"
                ? "Прив'яжи свій поточний прогрес античіту до логіну та пароля, щоб грати з інших пристроїв і не втратити спіни."
                : "Введи свій логін та пароль, щоб відновити збережені спіни, юнітів і геми."}
            </p>

            {mode === "register" && hasProgress ? (
              <div className="mt-3 rounded-xl border border-amber/30 bg-amber/10 px-3 py-2 text-xs text-fg">
                Буде збережено:{" "}
                <strong className="text-amber">
                  {spins} спінів · Ранг {level} · {gems} кВт-гемів{fives > 0 ? ` · ${totalPulls} молитов` : ""}
                </strong>
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-1.5 rounded-xl border border-line bg-bg p-1">
              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setError("");
                }}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors ${
                  mode === "register" ? "bg-amber text-ink" : "text-muted hover:text-fg"
                }`}
              >
                <UserPlus className="size-3.5" /> Реєстрація
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors ${
                  mode === "login" ? "bg-amber text-ink" : "text-muted hover:text-fg"
                }`}
              >
                <LogIn className="size-3.5" /> Увійти
              </button>
            </div>

            <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs text-muted">Логін (3–20 символів)</span>
                <input
                  type="text"
                  autoComplete="username"
                  required
                  minLength={3}
                  maxLength={20}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="stepan_dtek"
                  className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm text-fg outline-none focus:border-amber"
                />
              </label>

              <label className="block">
                <span className="text-xs text-muted">Пароль (мін. 6 символів)</span>
                <input
                  type="password"
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  required
                  minLength={6}
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm text-fg outline-none focus:border-amber"
                />
              </label>

              {error ? (
                <p className="rounded-xl border border-off/40 bg-off/10 px-3 py-2 text-xs text-off">{error}</p>
              ) : null}

              <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                <button
                  type="submit"
                  disabled={busy}
                  className="font-display flex-1 rounded-xl bg-amber px-4 py-2.5 text-xs font-bold text-ink disabled:opacity-50"
                >
                  {busy
                    ? "Синхронізація…"
                    : mode === "register"
                      ? "Створити акаунт"
                      : "Увійти"}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-line bg-bg px-4 py-2.5 text-xs text-muted hover:text-fg"
                >
                  Пізніше
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
