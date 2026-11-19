"use client";

import type { FilterState, SortKey } from "@/lib/filter";
import { GENRES, MOODS } from "@/lib/genres";

const SORTS: [SortKey, string][] = [
  ["score", "Best match"],
  ["imdb", "IMDb rating"],
  ["letterboxd", "Letterboxd rating"],
  ["year", "Newest"],
];

const YEARS = [2024, 2020, 2015, 2010, 2000, 1990, 1980];
const RUNTIMES = [30, 60, 90, 120, 150];

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

export function Filters({ value, onChange }: { value: FilterState; onChange: (f: FilterState) => void }) {
  const set = (patch: Partial<FilterState>) => onChange({ ...value, ...patch });
  const toggleGenre = (k: string) =>
    set({ genres: value.genres.includes(k) ? value.genres.filter((g) => g !== k) : [...value.genres, k] });
  const moodOn = (genres: string[]) =>
    genres.length === value.genres.length && genres.every((g) => value.genres.includes(g));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-2 inline-flex rounded-full border border-line p-1">
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
              onClick={() => set({ type: k })}
              className={`rounded-full px-4 py-1 text-sm ${
                value.type === k ? "bg-fg text-bg" : "text-muted hover:text-fg"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          From
          <select
            value={value.minYear ?? ""}
            onChange={(e) => set({ minYear: e.target.value ? Number(e.target.value) : null })}
            className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-fg"
          >
            <option value="">any year</option>
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}+
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          Max length
          <select
            value={value.maxRuntime ?? ""}
            onChange={(e) => set({ maxRuntime: e.target.value ? Number(e.target.value) : null })}
            className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-fg"
            title="Film runtime, or episode length for shows"
          >
            <option value="">any</option>
            {RUNTIMES.map((r) => (
              <option key={r} value={r}>
                {r} min
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          Sort by
          <select
            value={value.sort}
            onChange={(e) => set({ sort: e.target.value as SortKey })}
            className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-fg"
          >
            {SORTS.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <p className="mb-2 text-xs uppercase tracking-widest text-muted">Mood</p>
        <div className="flex flex-wrap gap-2">
          {MOODS.map((m) => (
            <Chip
              key={m.key}
              on={moodOn(m.genres)}
              onClick={() => set({ genres: moodOn(m.genres) ? [] : m.genres })}
            >
              {m.label}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs uppercase tracking-widest text-muted">Genres</p>
        <div className="flex flex-wrap gap-2">
          {GENRES.map((g) => (
            <Chip key={g.key} on={value.genres.includes(g.key)} onClick={() => toggleGenre(g.key)}>
              {g.label}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );
}
