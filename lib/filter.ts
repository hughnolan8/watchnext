// Runs in the browser over stored suggestions: no network calls.
import { genreIdsFor } from "./genres";
import type { Suggestion, TypeFilter } from "./types";

export type SortKey = "score" | "imdb" | "letterboxd" | "year";

export interface FilterState {
  type: TypeFilter;
  genres: string[];
  minYear: number | null;
  maxRuntime: number | null;
  sort: SortKey;
}

export const DEFAULT_FILTERS: FilterState = {
  type: "all",
  genres: [],
  minYear: null,
  maxRuntime: null,
  sort: "score",
};

export function applyFilters(results: Suggestion[], f: FilterState, hidden: Set<string>): Suggestion[] {
  const out = results.filter((s) => {
    if (hidden.has(s.key)) return false;
    if (f.type !== "all" && s.type !== f.type) return false;
    if (f.minYear && (!s.year || s.year < f.minYear)) return false;
    if (f.maxRuntime && s.runtime && s.runtime > f.maxRuntime) return false;
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
