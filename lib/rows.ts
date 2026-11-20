// Runs in the browser: groups the (already filtered and sorted) picks into
// categorised rows for the home page. Each title appears in only one row: rows are
// filled in order, and a later row only gets titles no earlier row has used.
import { GENRES, genreIdsFor } from "./genres";
import type { Suggestion } from "./types";

export interface Row {
  id: string;
  title: string;
  items: Suggestion[];
}

const ROW_SIZE = 12; // titles per row
const MIN_ROW = 4; // rows with fewer unused titles than this are dropped
const MAX_GENRE_ROWS = 8;

export function buildRows(picks: Suggestion[]): Row[] {
  const rows: Row[] = [];
  const used = new Set<string>();
  const push = (id: string, title: string, candidates: Suggestion[]) => {
    const items = candidates.filter((s) => !used.has(s.key)).slice(0, ROW_SIZE);
    if (items.length < MIN_ROW) return;
    items.forEach((s) => used.add(s.key));
    rows.push({ id, title, items });
  };

  push("top", "Top picks for you", picks);

  // "Because you liked …" for each favourite that led to enough picks
  const bySeed = new Map<string, Suggestion[]>();
  for (const s of picks) for (const seed of s.becauseOf ?? []) bySeed.set(seed, [...(bySeed.get(seed) ?? []), s]);
  [...bySeed.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([seed, items]) => push(`seed:${seed}`, `Because you liked ${seed}`, items));

  const year = new Date().getFullYear();
  push("new", "New & recent", picks.filter((s) => s.year && s.year >= year - 2));

  // Genre rows next, so titles spread across categories before the broad rows take them.
  // Smallest genres first, so niche rows aren't emptied by big ones like Drama.
  GENRES.map((g) => ({
    g,
    items: picks.filter((s) => s.genreIds?.some((id) => genreIdsFor([g.key], s.type).includes(id))),
  }))
    .filter(({ items }) => items.length >= MIN_ROW)
    .sort((a, b) => a.items.length - b.items.length)
    .slice(-MAX_GENRE_ROWS)
    .forEach(({ g, items }) => push(`genre:${g.key}`, g.label, items));

  push(
    "acclaimed",
    "Critically acclaimed",
    picks.filter((s) => (s.imdb.rating ?? 0) >= 8 || (s.letterboxd?.rating ?? 0) >= 4),
  );

  // One row per service you subscribe to, biggest first
  const byProvider = new Map<number, { name: string; items: Suggestion[] }>();
  for (const s of picks)
    for (const p of s.providers) {
      const entry = byProvider.get(p.id) ?? { name: p.name, items: [] };
      entry.items.push(s);
      byProvider.set(p.id, entry);
    }
  [...byProvider.entries()]
    .sort((a, b) => b[1].items.length - a[1].items.length)
    .forEach(([id, { name, items }]) => push(`provider:${id}`, `On ${name}`, items));

  push("tv", "Series to binge", picks.filter((s) => s.type === "tv"));
  push("movie", "Films for tonight", picks.filter((s) => s.type === "movie"));

  return rows;
}
