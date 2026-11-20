"use client";

import { useEffect, useRef, useState } from "react";
import { describeFilters } from "@/lib/describeFilter";
import { activeFilterCount, DEFAULT_FILTERS, rangeLabel, type FilterState } from "@/lib/filter";
import { GENRES, MOODS } from "@/lib/genres";

const IMDB_MINS = [6, 6.5, 7, 7.5, 8, 8.5];
const SEASON_RANGES: [string, string][] = [
  ["1", "1"],
  ["2-3", "2–3"],
  ["4-6", "4–6"],
  ["7-", "7+"],
];
const EPISODE_RANGES: [string, string][] = [
  ["-10", "Up to 10"],
  ["11-30", "11–30"],
  ["31-60", "31–60"],
  ["61-100", "61–100"],
  ["101-", "100+"],
];

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-3 py-1.5 text-sm transition ${
        on ? "border-accent bg-accent text-bg" : "border-line text-muted hover:border-fg/30 hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

/** A plain-English box: "no animated shows, rated 7+" → filters. */
function Describe({ value, onChange }: { value: FilterState; onChange: (f: FilterState) => void }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const { filters, changes } = describeFilters(text, value);
    if (changes.length) {
      onChange(filters);
      setText("");
      setResult({ ok: true, message: changes.join(" · ") });
    } else {
      setResult({ ok: false, message: "Couldn't turn that into a filter. Try a genre, “films”, “shows”, a rating or a season count." });
    }
  };

  return (
    <form onSubmit={apply}>
      <label htmlFor="describe-filter" className="mb-2 block text-xs uppercase tracking-widest text-muted">
        Describe it
      </label>
      <div className="flex gap-2">
        <input
          id="describe-filter"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setResult(null);
          }}
          placeholder="e.g. no animated shows, rated 7+"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-full border border-line bg-bg px-4 py-2 text-base outline-none placeholder:text-muted focus:border-fg/40 sm:text-sm"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="rounded-full bg-fg px-4 py-2 text-sm font-medium text-bg transition hover:brightness-110 disabled:opacity-40"
        >
          Apply
        </button>
      </div>
      {result && (
        <p role="status" className={`mt-2 text-sm ${result.ok ? "text-fg" : "text-muted"}`}>
          {result.ok && <span className="text-accent">✓ </span>}
          {result.message}
        </p>
      )}
    </form>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-widest text-muted">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/**
 * A "Filters" button that opens a popup with every filter. Changes apply live,
 * so `matchCount` tells the user how many picks they'll see.
 */
export function Filters({
  value,
  onChange,
  matchCount,
}: {
  value: FilterState;
  onChange: (f: FilterState) => void;
  matchCount: number;
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const active = activeFilterCount(value);

  const set = (patch: Partial<FilterState>) => onChange({ ...value, ...patch });
  const excluded = value.excludeGenres ?? [];
  const toggleGenre = (k: string) =>
    set({
      genres: value.genres.includes(k) ? value.genres.filter((g) => g !== k) : [...value.genres, k],
      excludeGenres: excluded.filter((g) => g !== k),
    });
  const toggleHidden = (k: string) =>
    set({
      excludeGenres: excluded.includes(k) ? excluded.filter((g) => g !== k) : [...excluded, k],
      genres: value.genres.filter((g) => g !== k),
    });
  const moodOn = (genres: string[]) =>
    genres.length === value.genres.length && genres.every((g) => value.genres.includes(g));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium transition hover:border-fg/30"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden>
          <path d="M3 5h14M6 10h8M9 15h2" strokeLinecap="round" />
        </svg>
        Filters
        {active > 0 && (
          <span className="rounded-full bg-accent px-1.5 text-xs font-semibold leading-5 text-bg">{active}</span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="filters-title"
            tabIndex={-1}
            className="relative flex max-h-[90dvh] w-full max-w-xl flex-col overscroll-contain rounded-t-2xl border border-line bg-surface shadow-2xl outline-none sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 id="filters-title" className="font-display text-xl font-semibold">
                Filters
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close filters"
                className="rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-fg"
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                  <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="space-y-6 overflow-y-auto px-5 py-5">
              <Describe value={value} onChange={onChange} />

              <Group label="Show me">
                <div className="inline-flex rounded-full border border-line p-1">
                  {(
                    [
                      ["all", "Both"],
                      ["movie", "Films"],
                      ["tv", "Shows"],
                    ] as const
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() =>
                        set(k === "movie" ? { type: k, seasons: null, episodes: null } : { type: k })
                      }
                      className={`rounded-full px-4 py-1 text-sm ${
                        value.type === k ? "bg-fg text-bg" : "text-muted hover:text-fg"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Group>

              <Group label="Minimum IMDb rating">
                <Chip on={value.minImdb == null} onClick={() => set({ minImdb: null })}>
                  Any
                </Chip>
                {value.minImdb != null && !IMDB_MINS.includes(value.minImdb) && (
                  <Chip on onClick={() => set({ minImdb: null })}>
                    {value.minImdb.toFixed(1)}+
                  </Chip>
                )}
                {IMDB_MINS.map((r) => (
                  <Chip key={r} on={value.minImdb === r} onClick={() => set({ minImdb: r })}>
                    {r.toFixed(1)}+
                  </Chip>
                ))}
              </Group>

              {value.type !== "movie" && (
                <>
                  <Group label="Seasons (shows)">
                    <Chip on={value.seasons == null} onClick={() => set({ seasons: null })}>
                      Any
                    </Chip>
                    {value.seasons && !SEASON_RANGES.some(([k]) => k === value.seasons) && (
                      <Chip on onClick={() => set({ seasons: null })}>
                        {rangeLabel(value.seasons)}
                      </Chip>
                    )}
                    {SEASON_RANGES.map(([k, label]) => (
                      <Chip key={k} on={value.seasons === k} onClick={() => set({ seasons: k })}>
                        {label}
                      </Chip>
                    ))}
                  </Group>

                  <Group label="Episodes in total (shows)">
                    <Chip on={value.episodes == null} onClick={() => set({ episodes: null })}>
                      Any
                    </Chip>
                    {value.episodes && !EPISODE_RANGES.some(([k]) => k === value.episodes) && (
                      <Chip on onClick={() => set({ episodes: null })}>
                        {rangeLabel(value.episodes)}
                      </Chip>
                    )}
                    {EPISODE_RANGES.map(([k, label]) => (
                      <Chip key={k} on={value.episodes === k} onClick={() => set({ episodes: k })}>
                        {label}
                      </Chip>
                    ))}
                  </Group>
                </>
              )}

              <Group label="Mood">
                {MOODS.map((m) => (
                  <Chip
                    key={m.key}
                    on={moodOn(m.genres)}
                    onClick={() => set({ genres: moodOn(m.genres) ? [] : m.genres })}
                  >
                    {m.label}
                  </Chip>
                ))}
              </Group>

              <Group label="Genres">
                {GENRES.map((g) => (
                  <Chip key={g.key} on={value.genres.includes(g.key)} onClick={() => toggleGenre(g.key)}>
                    {g.label}
                  </Chip>
                ))}
              </Group>

              <Group label="Hide genres">
                {GENRES.map((g) => (
                  <Chip key={g.key} on={excluded.includes(g.key)} onClick={() => toggleHidden(g.key)}>
                    {excluded.includes(g.key) ? "✕ " : ""}
                    {g.label}
                  </Chip>
                ))}
              </Group>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-line px-5 pt-4 pb-safe-4">
              <button
                type="button"
                onClick={() => onChange(DEFAULT_FILTERS)}
                disabled={active === 0}
                className="text-sm text-accent hover:underline disabled:cursor-default disabled:text-muted disabled:no-underline"
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-bg transition hover:brightness-110"
              >
                Show {matchCount} {matchCount === 1 ? "pick" : "picks"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
