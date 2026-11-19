// Shared by client and server. TMDB uses different genre ids for films and TV,
// so each genre here maps to the ids for both.

export interface Genre {
  key: string;
  label: string;
  movie: number[];
  tv: number[];
}

export const GENRES: Genre[] = [
  { key: "action", label: "Action", movie: [28], tv: [10759] },
  { key: "adventure", label: "Adventure", movie: [12], tv: [10759] },
  { key: "animation", label: "Animation", movie: [16], tv: [16] },
  { key: "comedy", label: "Comedy", movie: [35], tv: [35] },
  { key: "crime", label: "Crime", movie: [80], tv: [80] },
  { key: "documentary", label: "Documentary", movie: [99], tv: [99] },
  { key: "drama", label: "Drama", movie: [18], tv: [18] },
  { key: "family", label: "Family", movie: [10751], tv: [10751, 10762] },
  { key: "fantasy", label: "Fantasy", movie: [14], tv: [10765] },
  { key: "history", label: "History", movie: [36], tv: [10768] },
  { key: "horror", label: "Horror", movie: [27], tv: [] },
  { key: "mystery", label: "Mystery", movie: [9648], tv: [9648] },
  { key: "romance", label: "Romance", movie: [10749], tv: [] },
  { key: "scifi", label: "Sci-fi", movie: [878], tv: [10765] },
  { key: "thriller", label: "Thriller", movie: [53], tv: [9648, 80] },
  { key: "war", label: "War", movie: [10752], tv: [10768] },
  { key: "western", label: "Western", movie: [37], tv: [37] },
  { key: "reality", label: "Reality", movie: [], tv: [10764] },
];

export interface Mood {
  key: string;
  label: string;
  genres: string[];
}

export const MOODS: Mood[] = [
  { key: "light", label: "Light & funny", genres: ["comedy", "family", "animation", "romance"] },
  { key: "tense", label: "Edge of your seat", genres: ["thriller", "crime", "mystery", "action"] },
  { key: "mind", label: "Mind-bending", genres: ["scifi", "mystery", "fantasy"] },
  { key: "feel", label: "Something moving", genres: ["drama", "romance", "history"] },
  { key: "dark", label: "Dark & twisted", genres: ["horror", "crime", "thriller"] },
  { key: "real", label: "Real stories", genres: ["documentary", "history"] },
];

export function genreIdsFor(keys: string[], type: "movie" | "tv"): number[] {
  const ids = new Set<number>();
  for (const g of GENRES) if (keys.includes(g.key)) g[type].forEach((id) => ids.add(id));
  return [...ids];
}
