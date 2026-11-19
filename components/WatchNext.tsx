"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { load, save } from "@/lib/storage";
import type { ProviderInfo, RecommendResponse, Seed, Suggestion } from "@/lib/types";
import { DEFAULT_FILTERS, Filters, type FilterState } from "./Filters";
import { SeedSearch } from "./SeedSearch";
import { ServicePicker } from "./ServicePicker";
import { TitleCard } from "./TitleCard";

interface Hidden {
  key: string;
  title: string;
}

export function WatchNext({
  defaultRegion,
  hasTmdb,
  hasOmdb,
}: {
  defaultRegion: string;
  hasTmdb: boolean;
  hasOmdb: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [region, setRegion] = useState(defaultRegion);
  const [regions, setRegions] = useState<{ code: string; name: string }[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [selectedByRegion, setSelectedByRegion] = useState<Record<string, number[]>>({});
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [hidden, setHidden] = useState<Hidden[]>([]);

  const [results, setResults] = useState<Suggestion[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(() => selectedByRegion[region] ?? [], [selectedByRegion, region]);

  // Load saved preferences once, after hydration
  useEffect(() => {
    setRegion(load("region", defaultRegion));
    setSelectedByRegion(load("services", {}));
    setSeeds(load("seeds", []));
    setFilters({ ...DEFAULT_FILTERS, ...load("filters", {}) });
    setHidden(load("hidden", []));
    setReady(true);
  }, [defaultRegion]);

  useEffect(() => {
    if (!ready) return;
    save("region", region);
    save("services", selectedByRegion);
    save("seeds", seeds);
    save("filters", filters);
    save("hidden", hidden);
  }, [ready, region, selectedByRegion, seeds, filters, hidden]);

  useEffect(() => {
    if (!hasTmdb) return;
    fetch("/api/regions")
      .then((r) => (r.ok ? r.json() : []))
      .then(setRegions)
      .catch(() => {});
  }, [hasTmdb]);

  // Reload the service list whenever the region changes
  useEffect(() => {
    if (!ready || !hasTmdb) return;
    let cancelled = false;
    setProvidersLoading(true);
    fetch(`/api/providers?region=${region}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((list: ProviderInfo[]) => {
        if (cancelled) return;
        setProviders(list);
        // Drop any saved services this region doesn't have
        const ids = new Set(list.map((p) => p.id));
        setSelectedByRegion((prev) => ({ ...prev, [region]: (prev[region] ?? []).filter((id) => ids.has(id)) }));
      })
      .catch(() => !cancelled && setError("Couldn't load streaming services for this region."))
      .finally(() => !cancelled && setProvidersLoading(false));
    setResults(null);
    return () => {
      cancelled = true;
    };
  }, [region, ready, hasTmdb]);

  const toggleService = (id: number) =>
    setSelectedByRegion((prev) => {
      const cur = prev[region] ?? [];
      return { ...prev, [region]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
    });

  const addSeed = (s: Seed) =>
    setSeeds((prev) => (prev.some((p) => p.id === s.id && p.type === s.type) ? prev : [...prev, s].slice(-10)));
  const removeSeed = (s: Seed) => setSeeds((prev) => prev.filter((p) => !(p.id === s.id && p.type === s.type)));

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          region,
          providers: selected,
          seeds: seeds.map(({ id, type, title }) => ({ id, type, title })),
          ...filters,
          exclude: hidden.map((h) => h.key),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error === "missing_key"
            ? `Add ${data.key} to .env.local and restart the server.`
            : data.error === "no_providers"
              ? "Pick at least one streaming service first."
              : "Something went wrong fetching suggestions. Try again.",
        );
        return;
      }
      const { results, warnings } = data as RecommendResponse;
      setResults(results);
      setWarnings(warnings);
      requestAnimationFrame(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth" }));
    } catch {
      setError("Network error. Is the dev server running?");
    } finally {
      setLoading(false);
    }
  }, [region, selected, seeds, filters, hidden]);

  const hide = (s: Suggestion) => {
    setHidden((prev) => [...prev, { key: s.key, title: s.title }]);
    setResults((prev) => prev?.filter((r) => r.key !== s.key) ?? null);
  };
  const loved = (s: Suggestion) => {
    addSeed({ id: s.id, type: s.type, title: s.title, year: s.year, poster: s.poster });
    hide(s);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4 py-6">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Watch<span className="text-accent">Next</span>
          </h1>
          <p className="text-sm text-muted">Great things to watch on the services you already pay for.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          Region
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-fg"
          >
            {(regions.length ? regions : [{ code: region, name: region }]).map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      {!hasTmdb && (
        <div className="mb-6 rounded-2xl border border-bad/50 bg-bad/10 p-5 text-sm">
          <p className="font-semibold">Add your API keys to get started</p>
          <p className="mt-1 text-muted">
            Copy <code>.env.example</code> to <code>.env.local</code>, add a free TMDB key (and an OMDb key for IMDb
            ratings), then restart <code>npm run dev</code>. The README has the links.
          </p>
        </div>
      )}
      {hasTmdb && !hasOmdb && (
        <div className="mb-6 rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
          IMDb ratings are off: add <code>OMDB_API_KEY</code> to <code>.env.local</code> to turn them on.
        </div>
      )}

      <div className="space-y-6">
        <Section step="1" title="Your services" hint={`${selected.length} selected`}>
          <ServicePicker
            providers={providers}
            selected={selected}
            onToggle={toggleService}
            loading={hasTmdb && providersLoading}
          />
        </Section>

        <Section step="2" title="Things you love" hint="Optional, but makes picks much better">
          <SeedSearch seeds={seeds} onAdd={addSeed} onRemove={removeSeed} />
        </Section>

        <Section step="3" title="What are you in the mood for?">
          <Filters value={filters} onChange={setFilters} />
        </Section>

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={run}
            disabled={loading || !selected.length || !hasTmdb}
            className="rounded-full bg-accent px-7 py-3 font-semibold text-bg shadow-lg shadow-accent/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Finding picks…" : "Find something to watch"}
          </button>
          {!selected.length && hasTmdb && <span className="text-sm text-muted">Pick at least one service.</span>}
          {hidden.length > 0 && (
            <span className="text-sm text-muted">
              {hidden.length} hidden ·{" "}
              <button type="button" onClick={() => setHidden([])} className="text-accent hover:underline">
                show them again
              </button>
            </span>
          )}
        </div>

        {error && <p className="rounded-xl border border-bad/50 bg-bad/10 p-4 text-sm">{error}</p>}
      </div>

      <section id="results" className="scroll-mt-6 pt-10">
        {loading && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="aspect-[2/3] animate-pulse rounded-2xl bg-surface" />
            ))}
          </div>
        )}
        {!loading && results && (
          <>
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="font-display text-2xl font-semibold">Your picks</h2>
              <span className="text-sm text-muted">{results.length} titles, best first</span>
            </div>
            {warnings.map((w) => (
              <p key={w} className="mb-3 text-sm text-muted">
                {w}
              </p>
            ))}
            {results.length ? (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {results.map((s) => (
                  <TitleCard
                    key={s.key}
                    s={s}
                    onLoved={() => loved(s)}
                    onSeen={() => hide(s)}
                    onNotForMe={() => hide(s)}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-line bg-surface p-6 text-muted">
                Nothing matched on your services. Try fewer genres, an earlier year, or add another service.
              </p>
            )}
          </>
        )}
      </section>

      <footer className="mt-16 border-t border-line pt-6 text-xs text-muted">
        Streaming data from JustWatch via TMDB. IMDb ratings via OMDb. Letterboxd ratings from public film pages.
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </footer>
    </div>
  );
}

function Section({
  step,
  title,
  hint,
  children,
}: {
  step: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-display text-sm font-bold text-accent">{step}</span>
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        {hint && <span className="text-sm text-muted">{hint}</span>}
      </div>
      {children}
    </section>
  );
}
