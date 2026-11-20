"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { activeFilterCount, applyFilters, DEFAULT_FILTERS, type FilterState } from "@/lib/filter";
import { buildRows, type Row } from "@/lib/rows";
import { similarTo, type LikeSource } from "@/lib/similar";
import { load, save } from "@/lib/storage";
import { fetchTitle } from "@/lib/titleFetch";
import type { CatalogueView } from "@/lib/catalogue";
import type { Account, ProviderInfo, SearchResult, Seed, Suggestion } from "@/lib/types";
import { AccountMenu } from "./AccountMenu";
import { Filters } from "./Filters";
import { PosterRow } from "./PosterRow";
import { SearchBox } from "./SearchBox";
import { metaLine, TitleDetails, WatchButtons } from "./TitleDetails";

interface Hidden {
  key: string;
  title: string;
}

/** What the server keeps for the account (see lib/userData.ts). Any key may be missing. */
export interface SavedData {
  seeds?: Seed[];
  hidden?: Hidden[];
  filters?: Partial<FilterState>;
}

export function WatchNext({
  user,
  subscriptions,
  catalogue,
  saved,
  hasTmdb,
  hasOmdb,
}: {
  user: Account;
  subscriptions: ProviderInfo[]; // from the account; edited on /account
  catalogue: CatalogueView; // shared suggestions for these services, rebuilt weekly on the server
  saved: SavedData; // favourites, hidden titles and filters stored on the account
  hasTmdb: boolean;
  hasOmdb: boolean;
}) {
  const region = user.region;
  const [ready, setReady] = useState(false);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [hidden, setHidden] = useState<Hidden[]>([]);
  const stored = catalogue.results.length ? catalogue : null;

  // Favourites, hidden titles and filters are stored on the account (server).
  // Anything the server doesn't have yet is taken from this browser's older local copy, then
  // uploaded, so data saved before it moved to the server isn't lost.
  const lastSent = useRef<Record<string, string>>({});
  useEffect(() => {
    const key = (k: string) => `u${user.id}.${k}`;
    for (const [k, v] of Object.entries(saved)) if (v !== undefined) lastSent.current[k] = JSON.stringify(v);
    setSeeds(saved.seeds ?? load(key("seeds"), load("seeds", [])));
    setFilters({ ...DEFAULT_FILTERS, ...(saved.filters ?? load(key("filters"), load("filters", {}))) });
    setHidden(saved.hidden ?? load(key("hidden"), load("hidden", [])));
    setReady(true);
  }, [user.id, saved]);

  // Save changes to the server, a moment after they stop, and only the keys that changed.
  useEffect(() => {
    if (!ready) return;
    save("region", region); // so a new account on this browser starts in the same region
    const timer = setTimeout(() => {
      const values: Record<string, unknown> = { seeds, hidden, filters };
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
  }, [ready, region, seeds, filters, hidden]);

  const addSeed = (s: Seed) =>
    setSeeds((prev) => (prev.some((p) => p.id === s.id && p.type === s.type) ? prev : [...prev, s].slice(-10)));

  const hiddenKeys = useMemo(() => new Set(hidden.map((h) => h.key)), [hidden]);
  const visible = useMemo(
    () => (stored ? applyFilters(stored.results, filters, hiddenKeys) : []),
    [stored, filters, hiddenKeys],
  );

  const activeFilters = activeFilterCount(filters) > 0;
  const hide = (s: Suggestion) => setHidden((prev) => [...prev, { key: s.key, title: s.title }]);
  const loved = (s: Suggestion) => {
    addSeed({ id: s.id, type: s.type, title: s.title, year: s.year, poster: s.poster });
    hide(s);
  };

  const [open, setOpen] = useState<Suggestion | null>(null);

  // "More like this": swaps the home rows for titles similar to one the user picked.
  const [like, setLike] = useState<LikeSource | null>(null);
  const [related, setRelated] = useState<string[] | null>(null); // null while loading
  const moreLike = (s: Suggestion) => {
    setLike({ key: s.key, id: s.id, type: s.type, title: s.title, genreIds: s.genreIds ?? [] });
    setOpen(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  useEffect(() => {
    if (!like) return;
    let live = true;
    setRelated(null);
    fetch(`/api/similar?type=${like.type}&id=${like.id}`)
      .then((res) => (res.ok ? res.json() : []))
      .catch(() => [])
      .then((keys: string[]) => live && setRelated(Array.isArray(keys) ? keys : []));
    return () => {
      live = false;
    };
  }, [like]);

  const rows = useMemo<Row[]>(() => {
    if (!like) return buildRows(visible);
    if (!related) return [];
    const { closest, alike } = similarTo(like, related, visible);
    const kind = like.type === "movie" ? "films" : "shows";
    return [
      { id: "like:closest", title: `Because you watched ${like.title}`, items: closest },
      { id: "like:alike", title: `More ${kind} like ${like.title}`, items: alike },
    ].filter((r) => r.items.length);
  }, [visible, like, related]);
  const hero = like ? undefined : (visible.find((s) => s.backdrop) ?? visible[0]);

  const closeDetails = useCallback(() => setOpen(null), []);

  // Search results open the same details pop-up, loaded on demand (they're not in the catalogue).
  const [titleLoad, setTitleLoad] = useState<{ title: string; failed: boolean } | null>(null);
  const [dismissSearch, setDismissSearch] = useState(0);
  const loadReq = useRef(0);
  const openSearchResult = (r: SearchResult) => {
    const req = ++loadReq.current;
    setTitleLoad({ title: r.title, failed: false });
    fetchTitle(r)
      .then((s) => {
        if (req !== loadReq.current) return;
        setTitleLoad(null);
        setOpen(s);
      })
      .catch(() => req === loadReq.current && setTitleLoad({ title: r.title, failed: true }));
  };
  const cancelTitleLoad = useCallback(() => {
    loadReq.current++;
    setTitleLoad(null);
  }, []);
  const act = (fn: (s: Suggestion) => void) => () => {
    if (open) fn(open);
    setOpen(null);
  };

  const pad = "px-4 sm:px-8";

  return (
    <div className="pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <header className={`relative z-40 sm:sticky sm:top-[env(safe-area-inset-top)] flex flex-wrap items-center justify-between gap-4 bg-gradient-to-b from-bg via-bg/90 to-bg/0 py-4 ${pad}`}>
        <h1 className="w-full text-center font-display text-2xl font-bold tracking-tight sm:w-auto sm:text-left sm:text-3xl">
          Watch<span className="text-accent">Next</span>
        </h1>
        <div className="flex w-full items-center gap-3 sm:w-auto">
          {hasTmdb && (
            <SearchBox
              subscriptions={subscriptions}
              onOpenTitle={openSearchResult}
              detailsOpen={!!open || !!titleLoad}
              dismiss={dismissSearch}
            />
          )}
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

        <div className="flex flex-wrap items-center gap-4 text-sm text-muted">
          {!subscriptions.length ? (
            <span>
              <Link href="/account" className="text-accent hover:underline">
                Add the services you pay for
              </Link>{" "}
              to see suggestions.
            </span>
          ) : !catalogue.supported.length ? (
            <span>Suggestions aren&apos;t available for your region yet.</span>
          ) : !catalogue.covered.length && !catalogue.builtAt ? (
            <span>
              Suggestions are built weekly for {listNames(catalogue.supported)}.{" "}
              {subscriptions.some((s) => catalogue.supportedIds.includes(s.id))
                ? "The first batch isn't ready yet. Check back soon."
                : "Add one of these on your account to see suggestions."}
            </span>
          ) : (
            stored &&
            hidden.length > 0 && (
              <span>
                {hidden.length} hidden ·{" "}
                <button type="button" onClick={() => setHidden([])} className="text-accent hover:underline">
                  show again
                </button>
              </span>
            )
          )}
        </div>
      </div>

      <section id="results" className="scroll-mt-20 pt-6">
        {stored && (
          <div>
            {like && (
              <div className={`flex flex-wrap items-center gap-3 ${pad}`}>
                <span className="inline-flex items-center gap-2 rounded-full border border-accent/60 bg-accent/10 py-1 pl-3 pr-1 text-sm">
                  More like <strong className="font-semibold">{like.title}</strong>
                  <button
                    type="button"
                    onClick={() => setLike(null)}
                    aria-label="Clear the More like this filter"
                    className="rounded-full p-1 text-muted hover:bg-surface-2 hover:text-fg"
                  >
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden>
                      <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
                    </svg>
                  </button>
                </span>
                <button type="button" onClick={() => setLike(null)} className="text-sm text-accent hover:underline">
                  Back to all picks
                </button>
              </div>
            )}
            {hero && <Hero s={hero} onMore={() => setOpen(hero)} className={pad} />}
            {like && !related ? (
              <p className={`pt-6 text-sm text-muted ${pad}`}>Finding titles like {like.title}…</p>
            ) : rows.length ? (
              <div className="space-y-6 pt-6">
                {rows.map((r) => (
                  <PosterRow key={r.id} title={r.title} items={r.items} onOpen={setOpen} onMoreLike={moreLike} />
                ))}
              </div>
            ) : like ? (
              <p className={`mx-4 rounded-2xl border border-line bg-surface p-6 text-muted sm:mx-8`}>
                Nothing like {like.title} is on your services this week{activeFilters ? " with these filters" : ""}.
              </p>
            ) : (
              <p className={`mx-4 rounded-2xl border border-line bg-surface p-6 text-muted sm:mx-8`}>
                {visible.length
                  ? "Only a handful of picks match these filters. Try loosening them."
                  : "None of this week's picks match these filters. Try loosening them."}
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
          onMoreLike={() => {
            setDismissSearch((n) => n + 1);
            moreLike(open);
          }}
        />
      )}

      {titleLoad && <TitleLoading title={titleLoad.title} failed={titleLoad.failed} onClose={cancelTitleLoad} />}

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

/** Shown while a search result's details load. */
function TitleLoading({ title, failed, onClose }: { title: string; failed: boolean; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6" role="status">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative rounded-2xl border border-line bg-surface px-6 py-5 text-sm shadow-2xl">
        {failed ? (
          <>
            <p>Couldn&apos;t load {title}. Try again in a moment.</p>
            <button type="button" onClick={onClose} className="mt-3 text-accent hover:underline">
              Close
            </button>
          </>
        ) : (
          <p className="text-muted">Loading {title}…</p>
        )}
      </div>
    </div>
  );
}

function listNames(xs: string[]) {
  return xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}
