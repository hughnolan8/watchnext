import "server-only";
import { genreIdsFor } from "./genres";
import { getImdbRating } from "./omdb";
import { getLetterboxdRating } from "./letterboxd";
import { discover, getDetails, getRelated, yearOf, type Details, type TmdbListItem } from "./tmdb";
import type { MediaType, RecommendRequest, RecommendResponse, Suggestion } from "./types";

const DETAIL_POOL = 60; // candidates we check availability for
const RATED_POOL = 30; // available titles we fetch IMDb/Letterboxd ratings for
const MAX_RESULTS = 24;

interface Candidate {
  key: string;
  type: MediaType;
  item: TmdbListItem;
  affinity: number; // how strongly the seeds point at this title
  likedBy: Set<string>; // seed titles that led here
  fromDiscover: boolean;
}

export async function recommend(req: RecommendRequest): Promise<RecommendResponse> {
  const warnings: string[] = [];
  const excluded = new Set(req.exclude);
  for (const s of req.seeds) excluded.add(`${s.type}:${s.id}`);
  const wantType = (t: MediaType) => req.type === "all" || req.type === t;

  const candidates = new Map<string, Candidate>();
  const add = (type: MediaType, item: TmdbListItem, weight: number, seedTitle: string | null) => {
    const key = `${type}:${item.id}`;
    if (excluded.has(key)) return;
    let c = candidates.get(key);
    if (!c) {
      c = { key, type, item, affinity: 0, likedBy: new Set(), fromDiscover: seedTitle === null };
      candidates.set(key, c);
    }
    c.affinity += weight;
    if (seedTitle) {
      c.likedBy.add(seedTitle);
      c.fromDiscover = false;
    }
  };

  // 1. Gather candidates from the titles you love
  const related = await Promise.all(
    req.seeds.map(async (s) => ({ seed: s, ...(await getRelated(s.type, s.id)) })),
  );
  for (const { seed, recs, similar } of related) {
    // Earlier results are stronger matches; TMDB "recommendations" beat "similar".
    recs.forEach((item, i) => add(seed.type, item, 1 - i / 40, seed.title));
    similar.forEach((item, i) => add(seed.type, item, 0.5 - i / 80, seed.title));
  }

  // 2. Filter on what we know from list results
  const genreMatch = (c: Candidate) => {
    if (!req.genres.length) return true;
    const ids = genreIdsFor(req.genres, c.type);
    return c.item.genre_ids?.some((g) => ids.includes(g)) ?? false;
  };
  const passes = (c: Candidate) => {
    if (!wantType(c.type)) return false;
    if (c.item.vote_count < 30) return false;
    if (req.minYear) {
      const y = yearOf(c.item.release_date ?? c.item.first_air_date);
      if (!y || y < req.minYear) return false;
    }
    return genreMatch(c);
  };
  let pool = [...candidates.values()].filter(passes);

  // 3. Top up from "best rated on your services" if seeds are missing or thin
  if (pool.length < 25) {
    const types = (["movie", "tv"] as const).filter(wantType);
    const pages = req.seeds.length ? [1] : [1, 2];
    const found = await Promise.all(
      types.flatMap((type) =>
        pages.map((page) =>
          discover(type, {
            region: req.region,
            providers: req.providers,
            genreIds: genreIdsFor(req.genres, type),
            minYear: req.minYear ?? undefined,
            page,
          }).then((items) => items.map((item) => ({ type, item }))),
        ),
      ),
    );
    for (const { type, item } of found.flat()) add(type, item, 0, null);
    pool = [...candidates.values()].filter(passes);
  }

  // 4. Shortlist by a cheap preliminary score, then check real availability
  const maxAffinity = Math.max(1e-6, ...pool.map((c) => c.affinity));
  const pre = (c: Candidate) =>
    (req.seeds.length ? 0.6 * (c.affinity / maxAffinity) : 0) +
    0.4 * (c.item.vote_average / 10) * Math.min(1, Math.log10(c.item.vote_count + 1) / 3);
  pool.sort((a, b) => pre(b) - pre(a));
  const shortlist = pool.slice(0, DETAIL_POOL);

  const details = await mapLimit(shortlist, 8, (c) =>
    getDetails(c.type, c.item.id, req.region).catch(() => null),
  );
  const mine = new Set(req.providers);
  const available: { c: Candidate; d: Details }[] = [];
  shortlist.forEach((c, i) => {
    const d = details[i];
    if (!d) return;
    if (!d.streaming.some((p) => mine.has(p.id))) return;
    if (req.maxRuntime && d.runtime && d.runtime > req.maxRuntime) return;
    available.push({ c, d });
  });

  // 5. Ratings for the best available titles
  const rated = available.slice(0, RATED_POOL);
  if (!process.env.OMDB_API_KEY) warnings.push("OMDB_API_KEY is not set, so IMDb ratings are missing.");
  const ratings = await mapLimit(rated, 5, async ({ d }) => {
    const [imdb, lb] = await Promise.all([
      getImdbRating(d.imdbId),
      d.type === "movie" ? getLetterboxdRating(d.id) : Promise.resolve(null),
    ]);
    return { imdb, lb };
  });

  // 6. Blend and explain
  const results: Suggestion[] = rated.map(({ c, d }, i) => {
    const { imdb, lb } = ratings[i];
    const parts: [number, number][] = []; // [score 0-100, weight]
    if (imdb.rating != null) parts.push([imdb.rating * 10, 0.4]);
    if (lb?.rating != null) parts.push([lb.rating * 20, 0.4]);
    if (d.tmdbVotes >= 50) parts.push([d.tmdbRating * 10, 0.2]);
    const totalW = parts.reduce((s, [, w]) => s + w, 0);
    const quality = totalW ? parts.reduce((s, [v, w]) => s + v * w, 0) / totalW : 50;
    const affinity = req.seeds.length ? (c.affinity / maxAffinity) * 100 : 0;
    const score = req.seeds.length ? 0.65 * quality + 0.35 * affinity : quality;

    const providers = d.streaming.filter((p) => mine.has(p.id));
    const on = providers.map((p) => p.name).slice(0, 2).join(" & ");
    const liked = [...c.likedBy];
    const reason = liked.length
      ? `Because you liked ${listJoin(liked.slice(0, 3))} · on ${on}`
      : `Among the best rated on ${on}`;

    return {
      key: c.key,
      id: d.id,
      type: d.type,
      title: d.title,
      year: d.year,
      overview: d.overview,
      poster: d.poster,
      genres: d.genres,
      runtime: d.runtime,
      seasons: d.seasons,
      providers: providers.map(({ id, name, logo }) => ({ id, name, logo })),
      watchLink: d.watchLink,
      imdb: {
        rating: imdb.rating,
        votes: imdb.votes,
        url: d.imdbId ? `https://www.imdb.com/title/${d.imdbId}/` : null,
      },
      letterboxd: lb ? { rating: lb.rating, votes: lb.votes, url: lb.url } : null,
      tmdb: {
        rating: d.tmdbVotes ? d.tmdbRating : null,
        votes: d.tmdbVotes,
        url: `https://www.themoviedb.org/${d.type}/${d.id}`,
      },
      score: Math.round(score),
      reason,
    };
  });

  results.sort((a, b) => b.score - a.score);
  return { results: results.slice(0, MAX_RESULTS), warnings };
}

function listJoin(xs: string[]) {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} & ${xs[xs.length - 1]}`;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
