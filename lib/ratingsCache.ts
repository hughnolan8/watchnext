import "server-only";
import type { db } from "./db";
import { getImdbRating, type ImdbRating } from "./omdb";
import { getLetterboxdRating, type LetterboxdRating } from "./letterboxd";
import type { Details } from "./tmdb";

type Sql = Awaited<ReturnType<typeof db>>;

// Ratings barely move week to week, so the catalogue build reuses them for a month. A missing IMDb
// rating (often a timeout or OMDb's daily limit) is retried sooner.
const FRESH_MS = 30 * 24 * 60 * 60 * 1000;
const RETRY_MS = 7 * 24 * 60 * 60 * 1000;

interface Row {
  key: string;
  imdb_rating: number | null;
  imdb_votes: number | null;
  lb_rating: number | null;
  lb_votes: number | null;
  lb_url: string | null;
  fetched_at: string | number;
}

export interface Rater {
  rate(d: Details): Promise<{ imdb: ImdbRating; lb: LetterboxdRating | null }>;
  /** Saves new lookups. Call after each service so a later failure keeps them. */
  flush(): Promise<void>;
  stats(): { cached: number; fetched: number; omdbLeft: number };
}

/**
 * Ratings for the catalogue build, read from the `title_ratings` cache where fresh and looked up
 * otherwise. `omdbPerDay` caps new OMDb calls across all runs in the last 24 hours (the free tier is
 * 1,000 a day and people's own searches need some); past it, titles go without IMDb until a later run.
 */
export async function createRater(sql: Sql, omdbPerDay: number): Promise<Rater> {
  const rows = (await sql`SELECT * FROM title_ratings`) as Row[];
  const cache = new Map(rows.map((r) => [r.key, r]));
  const pending = new Map<string, Row>();
  // Every saved row cost at most one OMDb call, so recent rows are a safe count of today's spend.
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const spentToday = rows.filter((r) => Number(r.fetched_at) > dayAgo).length;
  let omdbLeft = Math.max(0, omdbPerDay - spentToday);
  let cached = 0;
  let fetched = 0;

  const isFresh = (r: Row, now: number) =>
    now - Number(r.fetched_at) < (r.imdb_rating == null ? RETRY_MS : FRESH_MS);

  return {
    async rate(d) {
      const key = `${d.type}:${d.id}`;
      const lbUrl = `https://letterboxd.com/tmdb/${d.id}/`;
      const hit = cache.get(key);
      const now = Date.now();
      if (hit && isFresh(hit, now)) {
        cached++;
        return {
          imdb: { rating: hit.imdb_rating, votes: hit.imdb_votes },
          lb: d.type === "movie" ? { rating: hit.lb_rating, votes: hit.lb_votes, url: hit.lb_url ?? lbUrl } : null,
        };
      }
      const canOmdb = !!d.imdbId && omdbLeft > 0;
      if (canOmdb) omdbLeft--;
      const [imdb, lb] = await Promise.all([
        canOmdb ? getImdbRating(d.imdbId) : Promise.resolve(hit ? { rating: hit.imdb_rating, votes: hit.imdb_votes } : null),
        d.type === "movie" ? getLetterboxdRating(d.id) : Promise.resolve(null),
      ]);
      fetched++;
      // Only cache once IMDb has really been asked (or there's no IMDb id), so budget-skipped titles retry.
      if (canOmdb || !d.imdbId) {
        const row: Row = {
          key,
          imdb_rating: imdb?.rating ?? null,
          imdb_votes: imdb?.votes ?? null,
          lb_rating: lb?.rating ?? null,
          lb_votes: lb?.votes ?? null,
          lb_url: lb?.url ?? null,
          fetched_at: now,
        };
        cache.set(key, row);
        pending.set(key, row);
      }
      return { imdb: imdb ?? { rating: null, votes: null }, lb };
    },

    async flush() {
      if (!pending.size) return;
      const rs = [...pending.values()];
      pending.clear();
      // One statement for the whole batch: the Neon HTTP driver makes a round trip per query.
      await sql`
        INSERT INTO title_ratings (key, imdb_rating, imdb_votes, lb_rating, lb_votes, lb_url, fetched_at)
        SELECT * FROM UNNEST(
          ${rs.map((r) => r.key)}::text[], ${rs.map((r) => r.imdb_rating)}::real[], ${rs.map((r) => r.imdb_votes)}::int[],
          ${rs.map((r) => r.lb_rating)}::real[], ${rs.map((r) => r.lb_votes)}::int[], ${rs.map((r) => r.lb_url)}::text[],
          ${rs.map((r) => Number(r.fetched_at))}::bigint[])
        ON CONFLICT (key) DO UPDATE SET imdb_rating = EXCLUDED.imdb_rating, imdb_votes = EXCLUDED.imdb_votes,
          lb_rating = EXCLUDED.lb_rating, lb_votes = EXCLUDED.lb_votes, lb_url = EXCLUDED.lb_url,
          fetched_at = EXCLUDED.fetched_at`;
    },

    stats: () => ({ cached, fetched, omdbLeft }),
  };
}
