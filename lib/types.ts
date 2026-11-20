// Types shared between the API routes and the browser.

export type MediaType = "movie" | "tv";
export type TypeFilter = "all" | MediaType;

export interface ProviderInfo {
  id: number;
  name: string;
  logo: string;
}

export interface Seed {
  id: number;
  type: MediaType;
  title: string;
  year: number | null;
  poster: string | null;
}

/** Filters are applied in the browser to stored results, so they're not part of the request. */
export interface RecommendRequest {
  region: string;
  providers: number[];
  seeds: Pick<Seed, "id" | "type" | "title">[];
  exclude: string[]; // "movie:123" / "tv:456"
}

export interface RatingInfo {
  rating: number | null;
  votes: number | null;
  url: string | null;
}

export interface Suggestion {
  key: string; // "movie:123"
  id: number;
  type: MediaType;
  title: string;
  year: number | null;
  overview: string;
  poster: string | null;
  backdrop?: string | null; // wide image for the hero banner (missing on older saved picks)
  genres: string[];
  genreIds: number[];
  runtime: number | null;
  seasons: number | null;
  episodes?: number | null; // total episodes for shows (missing on older saved picks)
  providers: ProviderInfo[];
  watchLink: string | null;
  imdb: RatingInfo;
  letterboxd: RatingInfo | null; // null for TV (Letterboxd is films only)
  tmdb: RatingInfo;
  score: number; // 0–100 blended
  reason: string;
  becauseOf?: string[]; // favourites that led here (missing on older saved picks)
}

export interface RecommendResponse {
  results: Suggestion[];
  warnings: string[];
}

/** A signed-in user. Subscriptions are stored per region alongside the account. */
export interface Account {
  id: number;
  email: string;
  name: string;
  region: string;
}

/** A search hit and the services it streams on in the user's region. */
export interface SearchResult {
  id: number;
  type: MediaType;
  title: string;
  year: number | null;
  poster: string | null;
  providers: ProviderInfo[];
  watchLink: string | null;
}
