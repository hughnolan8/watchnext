"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { activeFilterCount, applyFilters, DEFAULT_FILTERS, type FilterState } from "@/lib/filter";
import { buildRows } from "@/lib/rows";
import { load, save } from "@/lib/storage";
import type { Account, ProviderInfo, RecommendResponse, Seed, Suggestion } from "@/lib/types";
import { AccountMenu } from "./AccountMenu";
import { Filters } from "./Filters";
import { PosterRow } from "./PosterRow";
import { metaLine, TitleDetails, WatchButtons } from "./TitleDetails";

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

/** What the server keeps for the account (see lib/userData.ts). Any key may be missing. */
export interface SavedData {
  seeds?: Seed[];
  hidden?: Hidden[];
  filters?: Partial<FilterState>;
  results?: Stored | null;
}

const signatureOf = (region: string, providers: number[], seeds: Seed[]) =>
  JSON.stringify([region, [...providers].sort(), seeds.map((s) => `${s.type}:${s.id}`).sort()]);

export function WatchNext({
  user,
  subscriptions,
  saved,
  hasTmdb,
  hasOmdb,
}: {
  user: Account;
  subscriptions: ProviderInfo[]; // from the account; edited on /account
  saved: SavedData; // favourites, hidden, filters and suggestions stored on the account
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

  // Favourites, hidden titles, filters and fetched picks are stored on the account (server).
  // Anything the server doesn't have yet is taken from this browser's older local copy, then
  // uploaded, so data saved before it moved to the server isn't lost.
  const lastSent = useRef<Record<string, string>>({});
  useEffect(() => {
    const key = (k: string) => `u${user.id}.${k}`;
    for (const [k, v] of Object.entries(saved)) if (v !== undefined) lastSent.current[k] = JSON.stringify(v);
    setSeeds(saved.seeds ?? load(key("seeds"), load("seeds", [])));
    setFilters({ ...DEFAULT_FILTERS, ...(saved.filters ?? load(key("filters"), load("filters", {}))) });
    setHidden(saved.hidden ?? load(key("hidden"), load("hidden", [])));
    setStored(saved.results !== undefined ? saved.results : load<Stored | null>(key("results"), load("results", null)));
    setReady(true);
  }, [user.id, saved]);

  // Save changes to the server, a moment after they stop, and only the keys that changed.
  useEffect(() => {
    if (!ready) return;
    save("region", region); // so a new account on this browser starts in the same region
    const timer = setTimeout(() => {
      const values: Record<string, unknown> = { seeds, hidden, filters, results: stored };
      for (const [k, value] of Object.entries(values)) {
        const json = JSON.stringify(value);
        if (lastSent.current[k] === json) continue;
        lastSent.current[k] = json;
        fetch("/api/account/data", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key: k, value }),
          keepalive: json.length < 60_000, // lets small saves finish if the tab closes
        })
          .then((res) => {
            if (!res.ok) delete lastSent.current[k]; // retry on the next change
          })
          .catch(() => delete lastSent.current[k]);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [ready, region, seeds, filters, hidden, stored]);

  const addSeed = (s: Seed) =>
    setSeeds((prev) => (prev.some((p) => p.id === s.id && p.type === s.type) ? prev : [...prev, s].slice(-10)));

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

  const rows = useMemo(() => buildRows(visible), [visible]);
  const hero = visible.find((s) => s.backdrop) ?? visible[0];

  const [open, setOpen] = useState<Suggestion | null>(null);
  const closeDetails = useCallback(() => setOpen(null), []);
  const act = (fn: (s: Suggestion) => void) => () => {
    if (open) fn(open);
    setOpen(null);
  };

  const pad = "px-4 sm:px-8";

  return (
    <div className="pb-24">
      <header className={`relative z-40 sm:sticky sm:top-0 flex flex-wrap items-center justify-between gap-4 bg-gradient-to-b from-bg via-bg/90 to-bg/0 py-4 ${pad}`}>
        <div className="flex items-baseline gap-4">
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Watch<span className="text-accent">Next</span>
          </h1>
          <p className="hidden text-sm text-muted md:block">Great things to watch on the services you already pay for.</p>
        </div>
        <div className="flex items-center gap-3">
          {stored && <Filters value={filters} onChange={setFilters} matchCount={visible.length} />}
          <AccountMenu user={user} />
        </div>
      </header>

      <div className={`space-y-4 ${pad}`}>
        {!hasTmdb && (
          <div className="rounded-2xl border border-bad/50 bg-bad/10 p-5 text-sm">
            <p className="font-semibold">Add your API keys to get started</p>
            <p className="mt-1 text-muted">
              Copy <code>.env.example</code> to <code>.env.local</code>, add a free TMDB key (and an OMDb key for IMDb
              ratings), then restart <code>npm run dev</code>. The README has the links.
            </p>
          </div>
        )}
        {hasTmdb && !hasOmdb && (
          <div className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
            IMDb ratings are off: add <code>OMDB_API_KEY</code> to <code>.env.local</code> to turn them on.
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={fetchSuggestions}
            disabled={loading || !selected.length || !hasTmdb}
            className={`rounded-full font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
              stored
                ? "border border-line px-4 py-2 text-sm hover:border-fg/30"
                : "bg-accent px-7 py-3 text-bg shadow-lg shadow-accent/20 hover:brightness-110"
            }`}
          >
            {loading ? "Finding picks…" : stored ? "Refresh suggestions" : "Get suggestions"}
          </button>
          {!selected.length && hasTmdb && (
            <span className="text-sm text-muted">
              <Link href="/account" className="text-accent hover:underline">
                Add the services you pay for
              </Link>{" "}
              to get suggestions.
            </span>
          )}
          {stale && !loading && (
            <span className="text-sm text-accent">Your region, services or favourites changed. Refresh to update.</span>
          )}
          {stored && !stale && !loading && (
            <span className="text-sm text-muted">
              Saved {timeAgo(stored.fetchedAt)} ·{" "}
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
          )}
        </div>

        {error && <p className="rounded-xl border border-bad/50 bg-bad/10 p-4 text-sm">{error}</p>}
        {stored?.warnings.map((w) => (
          <p key={w} className="text-sm text-muted">
            {w}
          </p>
        ))}
      </div>

      <section id="results" className="scroll-mt-20 pt-6">
        {loading && !stored && (
          <div className="space-y-8">
            {Array.from({ length: 3 }, (_, r) => (
              <div key={r} className={`space-y-3 ${pad}`}>
                <div className="h-5 w-48 animate-pulse rounded bg-surface" />
                <div className="flex gap-3 overflow-hidden">
                  {Array.from({ length: 8 }, (_, i) => (
                    <div key={i} className="aspect-[2/3] w-36 shrink-0 animate-pulse rounded-xl bg-surface sm:w-40 lg:w-44" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {stored && (
          <div className={loading ? "pointer-events-none opacity-50 transition" : "transition"}>
            {hero && <Hero s={hero} onMore={() => setOpen(hero)} className={pad} />}
            {rows.length ? (
              <div className="space-y-6 pt-6">
                {rows.map((r) => (
                  <PosterRow key={r.id} title={r.title} items={r.items} onOpen={setOpen} />
                ))}
              </div>
            ) : (
              <p className={`mx-4 rounded-2xl border border-line bg-surface p-6 text-muted sm:mx-8`}>
                {visible.length
                  ? "Only a handful of picks match these filters. Loosen them, or refresh to fetch a new batch."
                  : "None of your saved picks match these filters. Loosen them, or refresh to fetch a new batch."}
              </p>
            )}
          </div>
        )}
      </section>

      {open && (
        <TitleDetails
          s={open}
          onClose={closeDetails}
          onLoved={act(loved)}
          onSeen={act(hide)}
          onNotForMe={act(hide)}
        />
      )}

      <footer className={`mt-16 border-t border-line pt-6 text-xs text-muted ${pad}`}>
        Streaming data from JustWatch via TMDB. IMDb ratings via OMDb. Letterboxd ratings from public film pages.
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </footer>
    </div>
  );
}

/** The big banner at the top: the best pick, with its watch buttons. */
function Hero({ s, onMore, className }: { s: Suggestion; onMore: () => void; className: string }) {
  const image = s.backdrop ?? s.poster;
  return (
    <div className="relative mb-2 overflow-hidden bg-black text-white">
      {image && (
        <img
          src={image}
          alt=""
          className={`absolute inset-0 h-full w-full object-cover ${s.backdrop ? "object-top" : "scale-110 blur-lg brightness-50"}`}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-transparent to-transparent" />
      <div className={`relative flex min-h-[22rem] max-w-2xl flex-col justify-end gap-3 pb-10 pt-24 sm:min-h-[28rem] ${className}`}>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Top pick for you</p>
        <h2 className="font-display text-3xl font-bold leading-tight sm:text-5xl">{s.title}</h2>
        <p className="text-sm text-white/80">{metaLine(s)}</p>
        <p className="line-clamp-3 text-sm text-white/85 sm:text-base">{s.overview}</p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <WatchButtons s={s} size="lg" />
          <button
            type="button"
            onClick={onMore}
            className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-5 py-2.5 font-semibold backdrop-blur transition hover:bg-white/25"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
              <circle cx="10" cy="10" r="7.5" />
              <path d="M10 9v5M10 6.5v.01" strokeLinecap="round" />
            </svg>
            More info
          </button>
        </div>
      </div>
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
