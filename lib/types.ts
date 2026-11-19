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

export interface RecommendRequest {
  region: string;
  providers: number[];
  seeds: Pick<Seed, "id" | "type" | "title">[];
  type: TypeFilter;
  genres: string[];
  minYear?: number | null;
  maxRuntime?: number | null;
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
  genres: string[];
  runtime: number | null;
  seasons: number | null;
  providers: ProviderInfo[];
  watchLink: string | null;
  imdb: RatingInfo;
  letterboxd: RatingInfo | null; // null for TV (Letterboxd is films only)
  tmdb: RatingInfo;
  score: number; // 0–100 blended
  reason: string;
}

export interface RecommendResponse {
  results: Suggestion[];
  warnings: string[];
}
