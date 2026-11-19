import "server-only";

export interface ImdbRating {
  rating: number | null; // 0–10
  votes: number | null;
}

/** IMDb rating via OMDb. Returns nulls (never throws) if the key is missing or the lookup fails. */
export async function getImdbRating(imdbId: string | null): Promise<ImdbRating> {
  const key = process.env.OMDB_API_KEY?.trim();
  if (!key || !imdbId) return { rating: null, votes: null };
  try {
    const url = new URL("https://www.omdbapi.com/");
    url.searchParams.set("i", imdbId);
    url.searchParams.set("apikey", key);
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } });
    if (!res.ok) return { rating: null, votes: null };
    const data = (await res.json()) as { Response?: string; imdbRating?: string; imdbVotes?: string };
    if (data.Response !== "True") return { rating: null, votes: null };
    const rating = parseFloat(data.imdbRating ?? "");
    const votes = parseInt((data.imdbVotes ?? "").replace(/,/g, ""), 10);
    return {
      rating: Number.isFinite(rating) ? rating : null,
      votes: Number.isFinite(votes) ? votes : null,
    };
  } catch {
    return { rating: null, votes: null };
  }
}
