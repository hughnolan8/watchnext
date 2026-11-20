import type { SearchResult, Suggestion } from "./types";

// Client-side cache of /api/title lookups, so a result hovered (or opened before) pops up instantly.
const cache = new Map<string, Promise<Suggestion>>();

export function fetchTitle(r: Pick<SearchResult, "type" | "id">): Promise<Suggestion> {
  const key = `${r.type}:${r.id}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(`/api/title?type=${r.type}&id=${r.id}`).then((res) =>
      res.ok ? (res.json() as Promise<Suggestion>) : Promise.reject(res.status),
    );
    p.catch(() => cache.delete(key)); // let a failed lookup be retried
    cache.set(key, p);
  }
  return p;
}

/** Start loading a result's details ahead of the click; errors surface on the real open. */
export function prefetchTitle(r: Pick<SearchResult, "type" | "id">) {
  fetchTitle(r).catch(() => {});
}
