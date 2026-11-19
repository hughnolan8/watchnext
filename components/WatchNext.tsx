"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { activeFilterCount, applyFilters, DEFAULT_FILTERS, type FilterState } from "@/lib/filter";
import { load, save } from "@/lib/storage";
import type { Account, ProviderInfo, RecommendResponse, Seed, Suggestion } from "@/lib/types";
import { AccountMenu } from "./AccountMenu";
import { Filters } from "./Filters";
import { SeedSearch } from "./SeedSearch";
import { TitleCard } from "./TitleCard";

interface Hidden {
  key: string;
  title: string;
}

/** Suggestions fetched once and kept in the browser; filters run over these locally. */
interface Stored {
  results: Suggestion[];
  warnings: string[];
  fetchedAt: number;
  signature: string; // region + services + favourites used for this fetch
}

const signatureOf = (region: string, providers: number[], seeds: Seed[]) =>
  JSON.stringify([region, [...providers].sort(), seeds.map((s) => `${s.type}:${s.id}`).sort()]);

export function WatchNext({
  user,
  subscriptions,
  hasTmdb,
  hasOmdb,
}: {
  user: Account;
  subscriptions: ProviderInfo[]; // from the account; edited on /account
  hasTmdb: boolean;
  hasOmdb: boolean;
}) {
  const region = user.region;
  const [ready, setReady] = useState(false);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [hidden, setHidden] = useState<Hidden[]>([]);
  const [stored, setStored] = useState<Stored | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(() => subscriptions.map((s) => s.id), [subscriptions]);

  // Favourites, filters and saved picks stay in this browser, kept separate per account.
  // The first account to sign in here picks up anything saved before accounts existed.
  const key = useCallback((k: string) => `u${user.id}.${k}`, [user.id]);
  useEffect(() => {
    setSeeds(load(key("seeds"), load("seeds", [])));
    setFilters({ ...DEFAULT_FILTERS, ...load(key("filters"), load("filters", {})) });
    setHidden(load(key("hidden"), load("hidden", [])));
    setStored(load<Stored | null>(key("results"), load("results", null)));
    setReady(true);
  }, [key]);

  useEffect(() => {
    if (!ready) return;
    save(key("seeds"), seeds);
    save(key("filters"), filters);
    save(key("hidden"), hidden);
    save(key("results"), stored);
    save("region", region); // so a new account on this browser starts in the same region
  }, [ready, key, region, seeds, filters, hidden, stored]);

  const addSeed = (s: Seed) =>
    setSeeds((prev) => (prev.some((p) => p.id === s.id && p.type === s.type) ? prev : [...prev, s].slice(-10)));
  const removeSeed = (s: Seed) => setSeeds((prev) => prev.filter((p) => !(p.id === s.id && p.type === s.type)));

  const signature = signatureOf(region, selected, seeds);
  const stale = !!stored && stored.signature !== signature;

  // The only network call for suggestions. Filters never trigger it.
  const fetchSuggestions = useCallback(async () => {
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
          exclude: hidden.map((h) => h.key),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error === "unauthorised"
            ? "You've been signed out. Sign in again to get suggestions."
            : data.error === "missing_key"
            ? `Add ${data.key} to .env.local and restart the server.`
            : data.error === "no_providers"
              ? "Pick at least one streaming service first."
              : "Something went wrong fetching suggestions. Try again.",
        );
        return;
      }
      const { results, warnings } = data as RecommendResponse;
      setStored({ results, warnings, fetchedAt: Date.now(), signature: signatureOf(region, selected, seeds) });
      requestAnimationFrame(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth" }));
    } catch {
      setError("Network error. Is the dev server running?");
    } finally {
      setLoading(false);
    }
  }, [region, selected, seeds, hidden]);

  const hiddenKeys = useMemo(() => new Set(hidden.map((h) => h.key)), [hidden]);
  const visible = useMemo(
    () => (stored ? applyFilters(stored.results, filters, hiddenKeys) : []),
    [stored, filters, hiddenKeys],
  );
  const unhiddenTotal = stored ? stored.results.filter((s) => !hiddenKeys.has(s.key)).length : 0;
  const filtersActive = activeFilterCount(filters) > 0;

  const hide = (s: Suggestion) => setHidden((prev) => [...prev, { key: s.key, title: s.title }]);
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
        <AccountMenu user={user} />
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
        <Section step="1" title="Your services" hint={`${selected.length} on your account · ${region}`}>
          {subscriptions.length ? (
            <div className="flex flex-wrap items-center gap-2">
              {subscriptions.map((p) => (
                <span
                  key={p.id}
                  className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 py-1.5 pl-1.5 pr-3 text-sm"
                >
                  {p.logo && <img src={p.logo} alt="" className="h-7 w-7 rounded-lg" loading="lazy" />}
                  {p.name}
                </span>
              ))}
              <Link href="/account" className="ml-1 text-sm text-accent hover:underline">
                Manage subscriptions
              </Link>
            </div>
          ) : (
            <p className="text-sm text-muted">
              You haven&apos;t added any subscriptions yet.{" "}
              <Link href="/account" className="text-accent hover:underline">
                Add the services you pay for
              </Link>
            </p>
          )}
        </Section>

        <Section step="2" title="Things you love" hint="Optional, but makes picks much better">
          <SeedSearch seeds={seeds} onAdd={addSeed} onRemove={removeSeed} />
        </Section>

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={fetchSuggestions}
            disabled={loading || !selected.length || !hasTmdb}
            className="rounded-full bg-accent px-7 py-3 font-semibold text-bg shadow-lg shadow-accent/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Finding picks…" : stored ? "Refresh suggestions" : "Get suggestions"}
          </button>
          {!selected.length && hasTmdb && (
            <span className="text-sm text-muted">Add at least one service to your account.</span>
          )}
          {stale && !loading && (
            <span className="text-sm text-accent">
              Your region, services or favourites changed. Refresh to update.
            </span>
          )}
          {stored && !stale && !loading && (
            <span className="text-sm text-muted">Saved {timeAgo(stored.fetchedAt)}</span>
          )}
        </div>

        {error && <p className="rounded-xl border border-bad/50 bg-bad/10 p-4 text-sm">{error}</p>}
      </div>

      <section id="results" className="scroll-mt-6 pt-10">
        {loading && !stored && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="aspect-[2/3] animate-pulse rounded-2xl bg-surface" />
            ))}
          </div>
        )}
        {stored && (
          <div className={loading ? "pointer-events-none opacity-50 transition" : "transition"}>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-2xl font-semibold">Your picks</h2>
              <span className="text-sm text-muted">
                {filtersActive || visible.length !== unhiddenTotal
                  ? `${visible.length} of ${unhiddenTotal} match`
                  : `${visible.length} titles`}
                {hidden.length > 0 && (
                  <>
                    {" "}
                    · {hidden.length} hidden ·{" "}
                    <button type="button" onClick={() => setHidden([])} className="text-accent hover:underline">
                      show again
                    </button>
                  </>
                )}
              </span>
            </div>

            <div className="mb-6">
              <Filters value={filters} onChange={setFilters} matchCount={visible.length} />
            </div>

            {stored.warnings.map((w) => (
              <p key={w} className="mb-3 text-sm text-muted">
                {w}
              </p>
            ))}
            {visible.length ? (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {visible.map((s) => (
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
                None of your saved picks match these filters. Loosen them, or refresh to fetch a new batch.
              </p>
            )}
          </div>
        )}
      </section>

      <footer className="mt-16 border-t border-line pt-6 text-xs text-muted">
        Streaming data from JustWatch via TMDB. IMDb ratings via OMDb. Letterboxd ratings from public film pages.
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </footer>
    </div>
  );
}

function timeAgo(ts: number) {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
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
