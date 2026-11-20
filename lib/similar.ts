// Runs in the browser: picks the stored suggestions most like one title.
// TMDB's own "recommendations / similar" list comes first (in its order), then titles of
// the same kind that share most of its genres, so the row is full even when few of TMDB's
// matches are on your services.
import type { MediaType, Suggestion } from "./types";

/** The title the "More like this" filter is built around. */
export interface LikeSource {
  key: string;
  id: number;
  type: MediaType;
  title: string;
  genreIds: number[];
}

const MAX = 24;

export function similarTo(
  src: LikeSource,
  related: string[],
  picks: Suggestion[],
): { closest: Suggestion[]; alike: Suggestion[] } {
  const byKey = new Map(picks.map((s) => [s.key, s]));
  const closest = related
    .map((k) => byKey.get(k))
    .filter((s): s is Suggestion => !!s && s.key !== src.key)
    .slice(0, MAX);

  const used = new Set([src.key, ...closest.map((s) => s.key)]);
  const mine = new Set(src.genreIds);
  const alike = picks
    .filter((s) => s.type === src.type && !used.has(s.key) && mine.size)
    .map((s) => {
      const theirs = s.genreIds ?? [];
      const shared = theirs.filter((g) => mine.has(g)).length;
      const overlap = shared / new Set([...theirs, ...mine]).size; // 0–1
      return { s, shared, rank: 0.7 * overlap + 0.3 * (s.score / 100) };
    })
    .filter(({ shared }) => shared >= Math.min(2, mine.size))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, MAX)
    .map(({ s }) => s);

  return { closest, alike };
}
