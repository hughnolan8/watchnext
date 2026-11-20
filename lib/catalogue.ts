import "server-only";
import { db } from "./db";
import { type PoolSize, recommend } from "./recommend";
import type { Suggestion } from "./types";

/**
 * The services we build shared suggestions for, per region. Suggestions are built once a week
 * by the cron job (app/api/cron/refresh-catalogue) and stored, so visitors cost no API calls.
 * IDs are TMDB watch-provider IDs. Each service costs up to CATALOGUE_POOL.rated OMDb lookups
 * per build (OMDb's free tier allows 1,000 a day), and ~CATALOGUE_POOL.shortlist TMDB calls.
 */
export const CATALOGUE: Record<string, { id: number; name: string }[]> = {
  GB: [
    { id: 8, name: "Netflix" },
    { id: 9, name: "Amazon Prime Video" },
    { id: 337, name: "Disney Plus" },
    { id: 350, name: "Apple TV" },
    { id: 531, name: "Paramount Plus" },
    { id: 38, name: "BBC iPlayer" },
  ],
};

/** Per service: 8 pages of best rated + 5 of most popular (per films and shows), the best 120 rated. */
export const CATALOGUE_POOL: PoolSize = { ratedPages: 8, popularPages: 5, shortlist: 280, rated: 120 };

export interface CatalogueView {
  results: Suggestion[];
  builtAt: number | null; // when the oldest of the user's services was last built
  covered: string[]; // the user's services we have suggestions for
  supported: string[]; // every service we build for in this region
  supportedIds: number[];
}

/** Rebuild stored suggestions for a region (all its catalogue services, or just `only`). */
export async function buildCatalogue(region: string, only?: number[]) {
  const services = (CATALOGUE[region] ?? []).filter((p) => !only || only.includes(p.id));
  const sql = await db();
  const report: { provider: string; titles?: number; error?: string; ms: number }[] = [];
  // One service at a time, saving each as it finishes, so a failure keeps the rest.
  for (const p of services) {
    const started = Date.now();
    try {
      const { results } = await recommend({ region, providers: [p.id], seeds: [], exclude: [] }, CATALOGUE_POOL);
      await sql`
        INSERT INTO catalogue (region, provider_id, results, built_at)
        VALUES (${region}, ${p.id}, ${JSON.stringify(results)}::jsonb, ${Date.now()})
        ON CONFLICT (region, provider_id) DO UPDATE SET results = EXCLUDED.results, built_at = EXCLUDED.built_at`;
      report.push({ provider: p.name, titles: results.length, ms: Date.now() - started });
    } catch (e) {
      report.push({ provider: p.name, error: e instanceof Error ? e.message : String(e), ms: Date.now() - started });
    }
  }
  return report;
}

/** Stored suggestions for a user's services, merged across services and best first. */
export async function getCatalogue(region: string, providerIds: number[]): Promise<CatalogueView> {
  const supportedList = CATALOGUE[region] ?? [];
  const mine = new Set(providerIds);
  const wanted = supportedList.filter((p) => mine.has(p.id)).map((p) => p.id);
  const view: CatalogueView = { results: [], builtAt: null, covered: [], supported: supportedList.map((p) => p.name),
    supportedIds: supportedList.map((p) => p.id),
  };
  if (!wanted.length) return view;

  const sql = await db();
  const rows = await sql`
    SELECT provider_id, results, built_at FROM catalogue
    WHERE region = ${region} AND provider_id = ANY(${wanted}::int[])`;

  const merged = new Map<string, Suggestion>();
  for (const row of rows) {
    view.builtAt = Math.min(view.builtAt ?? Infinity, Number(row.built_at));
    const name = supportedList.find((p) => p.id === Number(row.provider_id))?.name;
    if (name) view.covered.push(name);
    for (const s of row.results as Suggestion[]) {
      const seen = merged.get(s.key);
      if (!seen) {
        merged.set(s.key, { ...s, providers: [...s.providers] });
      } else {
        for (const p of s.providers) if (!seen.providers.some((q) => q.id === p.id)) seen.providers.push(p);
        seen.score = Math.max(seen.score, s.score);
      }
    }
  }

  view.results = [...merged.values()]
    .map((s) => {
      const providers = s.providers.filter((p) => mine.has(p.id));
      const on = providers.map((p) => p.name).slice(0, 2).join(" & ");
      return { ...s, providers, reason: `Among the best rated on ${on}`, becauseOf: [] };
    })
    .sort((a, b) => b.score - a.score);
  return view;
}
