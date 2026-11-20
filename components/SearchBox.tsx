"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ProviderInfo, SearchResult } from "@/lib/types";
import { prefetchTitle } from "@/lib/titleFetch";
import { SparkIcon } from "./PosterRow";
import { watchLinks } from "@/lib/watchLinks";

/**
 * Search any show or film. Each result lists every service it streams on: the ones you pay for are
 * highlighted in full colour, the rest are greyed out. Titles not on any of your services are greyed out.
 */
export function SearchBox({
  subscriptions,
  onOpenTitle,
  detailsOpen,
  onAsk,
}: {
  subscriptions: ProviderInfo[];
  onOpenTitle: (r: SearchResult) => void; // click a result: show its details pop-up
  detailsOpen: boolean; // a details pop-up is on top, so Esc belongs to it
  onAsk?: (q: string) => void; // AI search ("Ask WatchNext"); missing when it isn't set up
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const mine = useMemo(() => new Set(subscriptions.map((s) => s.id)), [subscriptions]);

  // Enter shows every match in a full-screen list; typing goes back to the quick dropdown.
  const [all, setAll] = useState(false);

  // Leaving search (click away, Escape, or closing the results) empties the box.
  const exit = () => {
    setQ("");
    setResults([]);
    setStatus("idle");
    setOpen(false);
    setAll(false);
  };

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      setStatus("idle");
      return;
    }
    setStatus("loading");
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}${all ? "&all=1" : ""}`, { signal: ctrl.signal })
        .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
        .then((data: SearchResult[]) => {
          setResults(data);
          setStatus("done");
        })
        .catch((e) => {
          if (!ctrl.signal.aborted) setStatus("error");
          void e;
        });
    }, all ? 0 : 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, all]);

  useEffect(() => {
    if (!all) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !detailsOpen && exit();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [all, detailsOpen]);

  useEffect(() => {
    if (!open || detailsOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) exit();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && exit();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, detailsOpen]);

  const showPanel = open && !all && q.trim().length >= 2;

  return (
    <div ref={wrap} className="relative w-full sm:w-72 lg:w-80">
      <label className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 focus-within:border-accent/70">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0 text-muted" aria-hidden>
          <circle cx="8.5" cy="8.5" r="5.5" />
          <path d="M13 13l4 4" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setAll(false);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && q.trim().length >= 2) {
              e.preventDefault();
              if (onAsk && looksLikeRequest(q)) {
                onAsk(q.trim());
                exit();
                e.currentTarget.blur();
                return;
              }
              setOpen(false);
              setAll(true);
              e.currentTarget.blur(); // closes the phone keyboard
            }
          }}
          enterKeyHint="search"
          onFocus={() => setOpen(true)}
          placeholder={onAsk ? "Search, or ask for anything" : "Search shows and films"}
          aria-label="Search for a film or show"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
        />
      </label>

      {showPanel && (
        <div className="absolute right-0 z-50 mt-2 max-h-[70dvh] w-full overflow-y-auto rounded-xl border border-line bg-surface shadow-2xl sm:w-[26rem]">
          {onAsk && (
            <button
              type="button"
              onClick={() => {
                onAsk(q.trim());
                exit();
              }}
              className="flex w-full items-center gap-2 border-b border-line p-3 text-left text-sm hover:bg-surface-2"
            >
              <SparkIcon className="h-4 w-4 shrink-0 text-accent" />
              <span className="min-w-0 flex-1 truncate">
                Ask WatchNext: <span className="font-semibold">&ldquo;{q.trim()}&rdquo;</span>
              </span>
              {looksLikeRequest(q) && <span className="shrink-0 text-xs text-muted">Enter</span>}
            </button>
          )}
          {status === "loading" && !results.length && <p className="p-4 text-sm text-muted">Searching…</p>}
          {status === "error" && <p className="p-4 text-sm text-bad">Search isn&apos;t working right now. Try again in a moment.</p>}
          {status === "done" && !results.length && <p className="p-4 text-sm text-muted">No films or shows found.</p>}
          {results.length > 0 && (
            <ul className="divide-y divide-line">
              {results.map((r) => (
                <ResultRow key={`${r.type}:${r.id}`} r={r} mine={mine} onOpen={() => onOpenTitle(r)} />
              ))}
            </ul>
          )}
          {!subscriptions.length && results.length > 0 && (
            <p className="border-t border-line p-3 text-xs text-muted">
              <Link href="/account" className="text-accent hover:underline">
                Add the services you pay for
              </Link>{" "}
              to see which of these you can already watch.
            </p>
          )}
          {results.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setAll(true);
              }}
              className="w-full border-t border-line p-3 text-center text-xs font-semibold text-accent hover:bg-surface-2"
            >
              See all results · press Enter
            </button>
          )}
        </div>
      )}

      {all && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Search results for ${q.trim()}`}
          className="fixed inset-0 z-[60] flex flex-col bg-bg/95 pt-[env(safe-area-inset-top)] backdrop-blur"
        >
          <div className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-8">
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-lg font-bold">Results for &ldquo;{q.trim()}&rdquo;</p>
              <p className="text-xs text-muted">
                {status === "loading"
                  ? "Searching…"
                  : status === "done"
                    ? `${results.length} ${results.length === 1 ? "title" : "titles"} · ${
                        results.filter((r) => r.providers.some((p) => mine.has(p.id))).length
                      } on your services`
                    : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={exit}
              aria-label="Close search results"
              className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-fg"
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
                <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-8">
            {status === "loading" && !results.length && <p className="py-6 text-sm text-muted">Searching…</p>}
            {status === "error" && <p className="py-6 text-sm text-bad">Search isn&apos;t working right now. Try again in a moment.</p>}
            {status === "done" && !results.length && <p className="py-6 text-sm text-muted">No films or shows found.</p>}
            {results.length > 0 && (
              <ul className="mx-auto grid max-w-6xl gap-x-6 divide-y divide-line md:grid-cols-2 md:divide-y-0">
                {sortYoursFirst(results, mine).map((r) => (
                  <ResultRow key={`${r.type}:${r.id}`} r={r} mine={mine} onOpen={() => onOpenTitle(r)} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Does this read like a request ("shows like Luther", "action films above 7") rather than a title?
 * Enter sends requests to AI search and titles to the normal search; both are always a click away.
 */
export function looksLikeRequest(q: string) {
  const t = q.trim().toLowerCase();
  if (t.split(/\s+/).length >= 6) return true;
  return /\b(like|similar|only|rated|rating|imdb|letterboxd|above|below|over|under|something|anything|shows|series|films|movies|without|recommend|suggest|binge|\d0s|\d+\+)(?=\W|$)/.test(t);
}

/** Titles on your services first, keeping the search's own order within each group. */
function sortYoursFirst(results: SearchResult[], mine: Set<number>) {
  const yours = (r: SearchResult) => r.providers.some((p) => mine.has(p.id));
  return [...results.filter(yours), ...results.filter((r) => !yours(r))];
}

function ResultRow({ r, mine, onOpen }: { r: SearchResult; mine: Set<number>; onOpen: () => void }) {
  const links = watchLinks(r);
  const yours = links.filter((l) => mine.has(l.provider.id));
  const others = links.filter((l) => !mine.has(l.provider.id));
  const canWatch = yours.length > 0;
  const dim = canWatch ? "" : "opacity-50 grayscale";
  // Load the details pop-up while the pointer rests on the row, so it's ready when clicked.
  const hover = useRef<ReturnType<typeof setTimeout>>(undefined);
  const startPrefetch = () => {
    clearTimeout(hover.current);
    hover.current = setTimeout(() => prefetchTitle(r), 120);
  };
  const stopPrefetch = () => clearTimeout(hover.current);
  useEffect(() => stopPrefetch, []);

  return (
    <li
      onClick={onOpen}
      onMouseEnter={startPrefetch}
      onMouseLeave={stopPrefetch}
      onPointerDown={() => prefetchTitle(r)}
      onFocus={() => prefetchTitle(r)}
      className={`group flex cursor-pointer gap-3 p-3 transition hover:bg-surface-2 ${canWatch ? "" : "bg-surface-2/40"}`}
    >
      <div className={`h-20 w-14 shrink-0 overflow-hidden rounded-md bg-surface-2 ${dim}`}>
        {r.poster && <img src={r.poster} alt="" loading="lazy" className="h-full w-full object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className={`block max-w-full truncate text-left text-sm font-semibold group-hover:underline ${canWatch ? "" : "text-muted"}`}
        >
          {r.title}
        </button>
        <p className="text-xs text-muted">{[r.type === "movie" ? "Film" : "Show", r.year].filter(Boolean).join(" · ")}</p>

        <p className={`mt-1 text-xs font-semibold ${canWatch ? "text-good" : "text-muted"}`}>
          {canWatch ? "✓ On your services" : links.length ? "Not on your services" : "Not streaming"}
        </p>

        {links.length > 0 && (
          <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Streaming on">
            {[...yours, ...others].map(({ provider, url }) => {
              const has = mine.has(provider.id);
              return (
                <li key={provider.id}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title={has ? `Watch on ${provider.name} (you have it)` : `On ${provider.name} (you don't have it)`}
                    className={`flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2 text-[11px] transition ${
                      has
                        ? "bg-accent/10 font-semibold text-fg ring-2 ring-accent hover:bg-accent/20"
                        : "text-muted opacity-50 ring-1 ring-line grayscale hover:opacity-80"
                    }`}
                  >
                    <img src={provider.logo} alt="" className="h-5 w-5 rounded-full" />
                    <span className="max-w-[8rem] truncate">{provider.name}</span>
                    {has && <span className="text-accent">· You have it</span>}
                  </a>
                </li>
              );
            })}
          </ul>
        )}
        {!links.length && r.watchLink && (
          <a
            href={r.watchLink}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-1 inline-block text-xs text-muted hover:text-fg hover:underline">
            Rent / buy ↗
          </a>
        )}
      </div>
    </li>
  );
}
