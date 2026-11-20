import "server-only";
import { db } from "./db";
import { createRater } from "./ratingsCache";
import { type PoolSize, recommend } from "./recommend";
import type { Suggestion } from "./types";

/**
 * The services we build shared suggestions for, per region. Suggestions are built daily
 * by the cron job (app/api/cron/refresh-catalogue) and stored, so visitors cost no API calls.
 * IDs are TMDB watch-provider IDs. Ratings are cached for a month (lib/ratingsCache.ts), so a
 * build only spends OMDb lookups on titles it hasn't seen, capped at OMDB_BUDGET per run.
 */
export const CATALOGUE: Record<string, { id: number; name: string }[]> = {
  GB: [
    { id: 8, name: "Netflix" },
    { id: 9, name: "Amazon Prime Video" },
    { id: 337, name: "Disney Plus" },
    { id: 350, name: "Apple TV" },
    { id: 531, name: "Paramount Plus" },
    { id: 38, name: "BBC iPlayer" },
    { id: 39, name: "NOW" },
    { id: 29, name: "Sky Go" },
    { id: 41, name: "ITVX" },
    { id: 103, name: "Channel 4" },
    { id: 11, name: "MUBI" },
  ],
};

/** Per service: 15 pages of best rated + 10 of most popular (per films and shows), the best 400 rated. */
export const CATALOGUE_POOL: PoolSize = {
  ratedPages: 15,
  popularPages: 10,
  shortlist: 700,
  rated: 400,
  // Lower than the quick-search defaults so smaller services (and UK shows) aren't cut to a handful.
  minVotes: { movie: 150, tv: 50 },
};

/** New OMDb lookups per 24 hours. The free tier is 1,000 a day; the rest is left for people's own searches. */
const OMDB_BUDGET = 750;
/**
 * Stop starting new services after this long. A cold service takes ~45s, so this leaves plenty of
 * room inside the route's 300s limit (being cut off would lose that service's ratings).
 */
const TIME_BUDGET_MS = 120_000;
/** Most titles sent to the home page, best first, so a long list of services stays quick on a phone. */
const MAX_RESULTS = 1500;

export interface CatalogueView {
  results: Suggestion[];
  builtAt: number | null; // when the oldest of the user's services was last built
  covered: string[]; // the user's services we have suggestions for
  supported: string[]; // every service we build for in this region
  supportedIds: number[];
}

/**
 * Rebuild stored suggestions for a region (all its catalogue services, or just `only`), the
 * longest-unbuilt first. Runs daily; services that don't fit in the time budget go first next time.
 */
export async function buildCatalogue(region: string, only?: number[]) {
  const runStarted = Date.now();
  const sql = await db();
  const builtRows = await sql`SELECT provider_id, built_at FROM catalogue WHERE region = ${region}`;
  const builtAt = new Map(builtRows.map((r) => [Number(r.provider_id), Number(r.built_at)]));
  const services = (CATALOGUE[region] ?? [])
    .filter((p) => !only || only.includes(p.id))
    .sort((a, b) => (builtAt.get(a.id) ?? 0) - (builtAt.get(b.id) ?? 0));
  const rater = await createRater(sql, OMDB_BUDGET);
  const report: { provider: string; titles?: number; error?: string; skipped?: string; ms: number }[] = [];
  // One service at a time, saving each as it finishes, so a failure keeps the rest.
  for (const p of services) {
    const started = Date.now();
    if (started - runStarted > TIME_BUDGET_MS) {
      report.push({ provider: p.name, skipped: "out of time, first in line next run", ms: 0 });
      continue;
    }
    try {
      const { results } = await recommend(
        { region, providers: [p.id], seeds: [], exclude: [] },
        CATALOGUE_POOL,
        (d) => rater.rate(d),
      );
      await rater.flush();
      await sql`
        INSERT INTO catalogue (region, provider_id, results, built_at)
        VALUES (${region}, ${p.id}, ${JSON.stringify(results)}::jsonb, ${Date.now()})
        ON CONFLICT (region, provider_id) DO UPDATE SET results = EXCLUDED.results, built_at = EXCLUDED.built_at`;
      report.push({ provider: p.name, titles: results.length, ms: Date.now() - started });
    } catch (e) {
      report.push({ provider: p.name, error: e instanceof Error ? e.message : String(e), ms: Date.now() - started });
    }
  }
  return { services: report, ratings: rater.stats() };
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
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS);
  return view;
}
