import "server-only";

const BASE = "https://api.themoviedb.org/3";
export const IMG = "https://image.tmdb.org/t/p";

export type MediaType = "movie" | "tv";

export class MissingKeyError extends Error {
  constructor(public key: string) {
    super(`Missing ${key}`);
  }
}

/** Accepts either a v3 API key or a v4 "API Read Access Token". */
export async function tmdb<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  revalidate = 60 * 60 * 6,
): Promise<T> {
  const key = process.env.TMDB_API_KEY?.trim();
  if (!key) throw new MissingKeyError("TMDB_API_KEY");

  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  const headers: Record<string, string> = { accept: "application/json" };
  if (key.length > 40) headers.Authorization = `Bearer ${key}`;
  else url.searchParams.set("api_key", key);

  const res = await fetch(url, { headers, next: { revalidate } });
  if (!res.ok) throw new Error(`TMDB ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

/* ---------- shapes ---------- */

export interface TmdbListItem {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path: string | null;
  overview: string;
  genre_ids: number[];
  vote_average: number;
  vote_count: number;
  popularity: number;
  original_language?: string;
}

interface ProviderEntry {
  provider_id: number;
  provider_name: string;
  logo_path: string;
  display_priority?: number;
  display_priorities?: Record<string, number>;
}

export interface Provider {
  id: number;
  name: string;
  logo: string;
  priority: number;
}

export interface Details {
  id: number;
  type: MediaType;
  title: string;
  year: number | null;
  overview: string;
  poster: string | null;
  backdrop: string | null;
  genres: string[];
  genreIds: number[];
  runtime: number | null; // minutes (movie) or typical episode length (tv)
  seasons: number | null;
  imdbId: string | null;
  tmdbRating: number;
  tmdbVotes: number;
  /** subscription / free / ad-supported providers in the requested region */
  streaming: Provider[];
  watchLink: string | null;
}

/* ---------- endpoints ---------- */

export async function getRegions() {
  const data = await tmdb<{ results: { iso_3166_1: string; english_name: string }[] }>(
    "/watch/providers/regions",
    {},
    60 * 60 * 24 * 7,
  );
  return data.results
    .map((r) => ({ code: r.iso_3166_1, name: r.english_name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getProviders(region: string): Promise<Provider[]> {
  const [m, t] = await Promise.all(
    (["movie", "tv"] as const).map((type) =>
      tmdb<{ results: ProviderEntry[] }>(
        `/watch/providers/${type}`,
        { watch_region: region },
        60 * 60 * 24,
      ),
    ),
  );
  const byId = new Map<number, Provider>();
  for (const p of [...m.results, ...t.results]) {
    const priority = p.display_priorities?.[region] ?? p.display_priority ?? 999;
    const existing = byId.get(p.provider_id);
    if (!existing || priority < existing.priority) {
      byId.set(p.provider_id, {
        id: p.provider_id,
        name: p.provider_name,
        logo: `${IMG}/w92${p.logo_path}`,
        priority,
      });
    }
  }
  return [...byId.values()].sort((a, b) => a.priority - b.priority);
}

export async function searchTitles(query: string) {
  const data = await tmdb<{ results: TmdbListItem[] }>(
    "/search/multi",
    { query, include_adult: "false" },
    60 * 60,
  );
  return data.results
    .filter((r) => r.media_type === "movie" || r.media_type === "tv")
    .slice(0, 8)
    .map((r) => ({
      id: r.id,
      type: r.media_type as MediaType,
      title: (r.title ?? r.name) || "Untitled",
      year: yearOf(r.release_date ?? r.first_air_date),
      poster: r.poster_path ? `${IMG}/w92${r.poster_path}` : null,
    }));
}

export async function getRelated(type: MediaType, id: number) {
  const [recs, similar] = await Promise.all([
    tmdb<{ results: TmdbListItem[] }>(`/${type}/${id}/recommendations`).catch(() => ({ results: [] })),
    tmdb<{ results: TmdbListItem[] }>(`/${type}/${id}/similar`).catch(() => ({ results: [] })),
  ]);
  return { recs: recs.results, similar: similar.results };
}

export async function discover(
  type: MediaType,
  opts: {
    region: string;
    providers: number[];
    genreIds?: number[];
    minYear?: number;
    page?: number;
    sort?: "vote_average.desc" | "popularity.desc";
  },
) {
  const dateKey = type === "movie" ? "primary_release_date.gte" : "first_air_date.gte";
  const data = await tmdb<{ results: TmdbListItem[] }>(`/discover/${type}`, {
    watch_region: opts.region,
    with_watch_providers: opts.providers.join("|"),
    with_watch_monetization_types: "flatrate|free|ads",
    with_genres: opts.genreIds?.length ? opts.genreIds.join("|") : undefined,
    [dateKey]: opts.minYear ? `${opts.minYear}-01-01` : undefined,
    sort_by: opts.sort ?? "vote_average.desc",
    "vote_count.gte": type === "movie" ? 400 : 150,
    page: opts.page ?? 1,
  });
  return data.results.map((r) => ({ ...r, media_type: type }));
}

interface RawDetails {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path?: string | null;
  genres: { id: number; name: string }[];
  runtime?: number;
  episode_run_time?: number[];
  number_of_seasons?: number;
  imdb_id?: string | null;
  external_ids?: { imdb_id?: string | null };
  vote_average: number;
  vote_count: number;
  "watch/providers"?: {
    results: Record<
      string,
      { link?: string; flatrate?: ProviderEntry[]; free?: ProviderEntry[]; ads?: ProviderEntry[] }
    >;
  };
}

export async function getDetails(type: MediaType, id: number, region: string): Promise<Details> {
  const d = await tmdb<RawDetails>(`/${type}/${id}`, {
    append_to_response: "external_ids,watch/providers",
  });
  const wp = d["watch/providers"]?.results?.[region];
  const seen = new Set<number>();
  const streaming: Provider[] = [];
  for (const p of [...(wp?.flatrate ?? []), ...(wp?.free ?? []), ...(wp?.ads ?? [])]) {
    if (seen.has(p.provider_id)) continue;
    seen.add(p.provider_id);
    streaming.push({
      id: p.provider_id,
      name: p.provider_name,
      logo: `${IMG}/w92${p.logo_path}`,
      priority: p.display_priority ?? 999,
    });
  }
  return {
    id: d.id,
    type,
    title: (d.title ?? d.name) || "Untitled",
    year: yearOf(d.release_date ?? d.first_air_date),
    overview: d.overview,
    poster: d.poster_path ? `${IMG}/w342${d.poster_path}` : null,
    backdrop: d.backdrop_path ? `${IMG}/w1280${d.backdrop_path}` : null,
    genres: d.genres.map((g) => g.name),
    genreIds: d.genres.map((g) => g.id),
    runtime: type === "movie" ? d.runtime || null : d.episode_run_time?.[0] ?? null,
    seasons: type === "tv" ? d.number_of_seasons ?? null : null,
    imdbId: d.imdb_id || d.external_ids?.imdb_id || null,
    tmdbRating: d.vote_average,
    tmdbVotes: d.vote_count,
    streaming,
    watchLink: wp?.link ?? null,
  };
}

export function yearOf(date?: string): number | null {
  const y = date ? parseInt(date.slice(0, 4), 10) : NaN;
  return Number.isFinite(y) ? y : null;
}
