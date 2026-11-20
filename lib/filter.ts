// Runs in the browser over stored suggestions: no network calls.
import { genreIdsFor } from "./genres";
import type { Suggestion, TypeFilter } from "./types";

export interface FilterState {
  type: TypeFilter;
  genres: string[];
  /** Genres to hide, e.g. "no animated shows". */
  excludeGenres: string[];
  minImdb: number | null;
  /** Show-only: a season / episode count range, e.g. "2-3" or "7-". */
  seasons: string | null;
  episodes: string | null;
}

export const DEFAULT_FILTERS: FilterState = {
  type: "all",
  genres: [],
  excludeGenres: [],
  minImdb: null,
  seasons: null,
  episodes: null,
};

/** "2-3" → [2, 3]; "7-" → [7, Infinity]; "1" → [1, 1]. */
export function parseRange(r: string): [number, number] {
  const [lo, hi] = r.split("-");
  const min = Number(lo) || 0;
  if (hi === undefined) return [min, min];
  return [min, hi === "" ? Infinity : Number(hi)];
}

/** "2-3" → "2–3"; "7-" → "7+"; "-10" → "Up to 10"; "1" → "1". */
export function rangeLabel(r: string): string {
  const [min, max] = parseRange(r);
  if (max === Infinity) return `${min}+`;
  if (min === 0) return `Up to ${max}`;
  return min === max ? `${min}` : `${min}–${max}`;
}

function inRange(n: number | null | undefined, r: string | null): boolean {
  if (!r || n == null) return true; // unknown counts (older saved picks) aren't filtered out
  const [min, max] = parseRange(r);
  return n >= min && n <= max;
}

export function applyFilters(results: Suggestion[], f: FilterState, hidden: Set<string>): Suggestion[] {
  const out = results.filter((s) => {
    if (hidden.has(s.key)) return false;
    if (f.type !== "all" && s.type !== f.type) return false;
    if (f.minImdb && (s.imdb.rating == null || s.imdb.rating < f.minImdb)) return false;
    if ((f.seasons || f.episodes) && s.type !== "tv") return false;
    if (!inRange(s.seasons, f.seasons) || !inRange(s.episodes, f.episodes)) return false;
    if (f.genres.length) {
      const ids = genreIdsFor(f.genres, s.type);
      if (!s.genreIds?.some((g) => ids.includes(g))) return false;
    }
    if (f.excludeGenres?.length) {
      const ids = genreIdsFor(f.excludeGenres, s.type);
      if (s.genreIds?.some((g) => ids.includes(g))) return false;
    }
    return true;
  });

  return out.sort((a, b) => b.score - a.score);
}

/** How many filters differ from the defaults. */
export function activeFilterCount(f: FilterState): number {
  return (
    (f.type !== "all" ? 1 : 0) +
    (f.genres.length ? 1 : 0) +
    (f.excludeGenres?.length ? 1 : 0) +
    (f.minImdb != null ? 1 : 0) +
    (f.seasons != null ? 1 : 0) +
    (f.episodes != null ? 1 : 0)
  );
}
