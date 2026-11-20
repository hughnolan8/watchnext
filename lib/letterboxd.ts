import "server-only";

export interface LetterboxdRating {
  rating: number | null; // 0–5
  votes: number | null;
  url: string;
}

/**
 * Letterboxd has no public API. Its /tmdb/{id} path redirects to the film page,
 * which embeds a schema.org JSON-LD block containing the average rating.
 * Films only. Never throws: returns a null rating on any failure.
 */
export async function getLetterboxdRating(tmdbMovieId: number, timeoutMs = 8000): Promise<LetterboxdRating> {
  const fallbackUrl = `https://letterboxd.com/tmdb/${tmdbMovieId}/`;
  try {
    const res = await fetch(fallbackUrl, {
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; WatchNext/1.0)",
        accept: "text/html",
      },
      next: { revalidate: 60 * 60 * 24 },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const url = res.url || fallbackUrl;
    if (!res.ok) return { rating: null, votes: null, url };
    const html = await res.text();
    return { ...parseLetterboxd(html), url };
  } catch {
    return { rating: null, votes: null, url: fallbackUrl };
  }
}

export function parseLetterboxd(html: string): { rating: number | null; votes: number | null } {
  const blocks = html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g);
  for (const [, raw] of blocks) {
    const json = raw
      .replace(/\/\*\s*<!\[CDATA\[\s*\*\//, "")
      .replace(/\/\*\s*\]\]>\s*\*\//, "")
      .trim();
    try {
      const data = JSON.parse(json);
      const agg = data?.aggregateRating;
      if (agg?.ratingValue != null) {
        const rating = Number(agg.ratingValue);
        const votes = Number(agg.ratingCount ?? agg.reviewCount);
        return {
          rating: Number.isFinite(rating) ? rating : null,
          votes: Number.isFinite(votes) ? votes : null,
        };
      }
    } catch {
      /* try next block */
    }
  }
  // Fallback: the twitter:data2 meta tag reads e.g. "4.21 out of 5"
  const meta = html.match(/name="twitter:data2" content="([\d.]+) out of 5"/);
  return { rating: meta ? parseFloat(meta[1]) : null, votes: null };
}
