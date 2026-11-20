"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ProviderInfo, SearchResult } from "@/lib/types";
import { watchLinks } from "@/lib/watchLinks";

/**
 * "Where can I watch …?" Search any title. Titles on a service you pay for look normal;
 * titles only on services you don't have are greyed out, with those services' logos still in colour.
 */
export function SearchBox({ subscriptions }: { subscriptions: ProviderInfo[] }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const mine = useMemo(() => new Set(subscriptions.map((s) => s.id)), [subscriptions]);

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
      fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
        .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
        .then((data: SearchResult[]) => {
          setResults(data);
          setStatus("done");
        })
        .catch((e) => {
          if (!ctrl.signal.aborted) setStatus("error");
          void e;
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const showPanel = open && q.trim().length >= 2;

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
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Where can I watch…"
          aria-label="Search for a film or show"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
        />
      </label>

      {showPanel && (
        <div className="absolute right-0 z-50 mt-2 max-h-[70vh] w-full overflow-y-auto rounded-xl border border-line bg-surface shadow-2xl sm:w-[26rem]">
          {status === "loading" && !results.length && <p className="p-4 text-sm text-muted">Searching…</p>}
          {status === "error" && <p className="p-4 text-sm text-bad">Search isn&apos;t working right now. Try again in a moment.</p>}
          {status === "done" && !results.length && <p className="p-4 text-sm text-muted">No films or shows found.</p>}
          {results.length > 0 && (
            <ul className="divide-y divide-line">
              {results.map((r) => (
                <ResultRow key={`${r.type}:${r.id}`} r={r} mine={mine} />
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
        </div>
      )}
    </div>
  );
}

function ResultRow({ r, mine }: { r: SearchResult; mine: Set<number> }) {
  const links = watchLinks(r);
  const yours = links.filter((l) => mine.has(l.provider.id));
  const others = links.filter((l) => !mine.has(l.provider.id));
  const canWatch = yours.length > 0;
  const shown = canWatch ? yours : others;

  return (
    <li className="flex items-center gap-3 p-3">
      <div className={`h-16 w-11 shrink-0 overflow-hidden rounded-md bg-surface-2 ${canWatch ? "" : "opacity-50 grayscale"}`}>
        {r.poster && <img src={r.poster} alt="" loading="lazy" className="h-full w-full object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-semibold ${canWatch ? "" : "text-muted"}`}>{r.title}</p>
        <p className="text-xs text-muted">
          {[r.type === "movie" ? "Film" : "Show", r.year].filter(Boolean).join(" · ")}
          {" · "}
          {canWatch
            ? `On ${yours.map((l) => l.provider.name).join(", ")}`
            : others.length
              ? "Not on your services"
              : "Not streaming in your region"}
        </p>
        {canWatch && others.length > 0 && (
          <p className="truncate text-[11px] text-muted/80">Also on {others.map((l) => l.provider.name).join(", ")}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
        {shown.slice(0, 4).map(({ provider, url }) => (
          <a
            key={provider.id}
            href={url}
            target="_blank"
            rel="noreferrer"
            title={`${canWatch ? "Watch" : "Available"} on ${provider.name}`}
            className="transition hover:scale-110"
          >
            <img src={provider.logo} alt={provider.name} className="h-8 w-8 rounded-md ring-1 ring-black/20" />
          </a>
        ))}
        {!links.length && r.watchLink && (
          <a href={r.watchLink} target="_blank" rel="noreferrer" className="text-xs text-muted hover:text-fg hover:underline">
            Rent / buy ↗
          </a>
        )}
      </div>
    </li>
  );
}
