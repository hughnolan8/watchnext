// Runs in the browser over stored suggestions: no network calls.
import { genreIdsFor } from "./genres";
import type { Suggestion, TypeFilter } from "./types";

export type SortKey = "score" | "imdb" | "letterboxd" | "year";

export interface FilterState {
  type: TypeFilter;
  genres: string[];
  minYear: number | null;
  maxRuntime: number | null;
  minImdb: number | null;
  sort: SortKey;
}

export const DEFAULT_FILTERS: FilterState = {
  type: "all",
  genres: [],
  minYear: null,
  maxRuntime: null,
  minImdb: null,
  sort: "score",
};

export function applyFilters(results: Suggestion[], f: FilterState, hidden: Set<string>): Suggestion[] {
  const out = results.filter((s) => {
    if (hidden.has(s.key)) return false;
    if (f.type !== "all" && s.type !== f.type) return false;
    if (f.minYear && (!s.year || s.year < f.minYear)) return false;
    if (f.maxRuntime && s.runtime && s.runtime > f.maxRuntime) return false;
    if (f.minImdb && (s.imdb.rating == null || s.imdb.rating < f.minImdb)) return false;
    if (f.genres.length) {
      const ids = genreIdsFor(f.genres, s.type);
      if (!s.genreIds?.some((g) => ids.includes(g))) return false;
    }
    return true;
  });

  const by: Record<SortKey, (s: Suggestion) => number> = {
    score: (s) => s.score,
    imdb: (s) => s.imdb.rating ?? -1,
    letterboxd: (s) => s.letterboxd?.rating ?? -1,
    year: (s) => s.year ?? 0,
  };
  const key = by[f.sort] ?? by.score;
  return out.sort((a, b) => key(b) - key(a) || b.score - a.score);
}

/** How many filters (not counting sort) differ from the defaults. */
export function activeFilterCount(f: FilterState): number {
  return (
    (f.type !== "all" ? 1 : 0) +
    (f.genres.length ? 1 : 0) +
    (f.minYear != null ? 1 : 0) +
    (f.maxRuntime != null ? 1 : 0) +
    (f.minImdb != null ? 1 : 0)
  );
}
