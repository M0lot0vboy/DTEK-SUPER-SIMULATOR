import { useState } from "react";
import useSWR from "swr";
import { Crown, Radio, Star } from "lucide-react";
import { getLeaderboard, cleanName } from "@/lib/leaderboard";
import { usePlayer, LEADERBOARD_KEY } from "@/lib/game/player";

function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "щойно";
  if (s < 3600) return `${Math.floor(s / 60)} хв тому`;
  if (s < 86400) return `${Math.floor(s / 3600)} год тому`;
  return `${Math.floor(s / 86400)} дн тому`;
}

function NameForm() {
  const current = usePlayer((s) => s.name);
  const setName = usePlayer((s) => s.setName);
  const [value, setValue] = useState(current);
  const clean = cleanName(value);
  const valid = clean.length >= 2;

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) setName(clean);
      }}
    >
      <label htmlFor="player-name" className="sr-only">
        Ваш нікнейм
      </label>
      <input
        id="player-name"
        value={value}
        maxLength={20}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Нікнейм для таблиці"
        className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-amber focus:outline-none"
      />
      <button
        type="submit"
        disabled={!valid || clean === current}
        className="font-display shrink-0 rounded-xl bg-amber px-4 py-2 text-sm text-bg disabled:opacity-40"
      >
        {current ? "змінити" : "увійти"}
      </button>
    </form>
  );
}

export function Ranking({ ready }: { ready: boolean }) {
  const myId = usePlayer((s) => s.id);
  const myName = usePlayer((s) => s.name);
  const { data, error, isLoading } = useSWR(LEADERBOARD_KEY, () => getLeaderboard(), {
    refreshInterval: 4000,
    revalidateOnFocus: true,
  });

  const rows = data ?? [];
  const myIndex = rows.findIndex((r) => r.id === myId);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">Жива таблиця всієї групи. Оновлюється кожні 4 секунди.</p>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-on/15 px-2 py-0.5 text-[10px] text-on uppercase">
          <Radio className="size-3" aria-hidden />
          live
        </span>
      </div>

      {ready ? (
        <div className="rounded-2xl border border-line bg-surface p-3">
          {myName ? (
            <p className="mb-2 text-xs text-muted">
              Ви граєте як <span className="text-fg">{myName}</span>
            </p>
          ) : (
            <p className="mb-2 text-xs text-muted">Введіть нікнейм, щоб потрапити в таблицю.</p>
          )}
          <NameForm />
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2 text-[10px] text-muted uppercase">
          <span>гравець</span>
          <span className="flex gap-4">
            <span>5*</span>
            <span>круток</span>
          </span>
        </div>

        {isLoading && !data ? (
          <p className="px-4 py-6 text-center text-sm text-muted">Підключаємось до диспетчерської...</p>
        ) : error && !data ? (
          <p className="px-4 py-6 text-center text-sm text-off">Таблиця знеструмлена. Спробуємо ще раз.</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">Поки порожньо. Будьте першим.</p>
        ) : (
          <ol>
            {rows.map((r, i) => {
              const me = r.id === myId;
              return (
                <li
                  key={r.id}
                  className={`flex items-center justify-between gap-2 border-b border-line/50 px-4 py-2.5 last:border-b-0 ${
                    me ? "bg-amber/10" : ""
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`font-display flex w-6 shrink-0 justify-center text-sm ${
                        i === 0 ? "text-amber" : "text-muted"
                      }`}
                    >
                      {i === 0 ? <Crown className="size-4" aria-label="1" /> : i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm text-fg">
                        {r.name}
                        {me ? <span className="ml-1 text-[10px] text-amber">(ви)</span> : null}
                      </p>
                      <p className="text-[10px] text-muted">
                        ранг {r.level} · {ago(r.updatedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-4 text-xs">
                    <span className="flex items-center gap-0.5 text-amber">
                      <Star className="size-3 fill-current" aria-hidden />
                      {r.fives}
                    </span>
                    <span className="font-display w-10 text-right text-amber">{r.spins}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {ready && myIndex >= 0 ? (
        <p className="text-center text-xs text-muted">
          Ваше місце: <span className="font-display text-amber">#{myIndex + 1}</span> з {rows.length}. Сусіди не сплять.
        </p>
      ) : null}
    </div>
  );
}
