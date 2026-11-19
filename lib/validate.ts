import type { ProviderInfo } from "./types";

/** Sanitise a list of services sent from the browser. */
export function cleanServices(input: unknown): ProviderInfo[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<number>();
  const out: ProviderInfo[] = [];
  for (const s of input.slice(0, 50)) {
    const id = Number(s?.id);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    const logo = String(s?.logo ?? "");
    seen.add(id);
    out.push({
      id,
      name: String(s?.name ?? "").slice(0, 100),
      // Only TMDB image URLs, so nothing odd gets rendered as an <img>
      logo: logo.startsWith("https://image.tmdb.org/") ? logo.slice(0, 300) : "",
    });
  }
  return out;
}
