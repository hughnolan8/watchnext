"use client";

import { useEffect, useRef, useState } from "react";
import type { Seed } from "@/lib/types";

export function SeedSearch({
  seeds,
  onAdd,
  onRemove,
}: {
  seeds: Seed[];
  onAdd: (s: Seed) => void;
  onRemove: (s: Seed) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Seed[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        if (res.ok) {
          setResults(await res.json());
          setActive(0);
          setOpen(true);
        }
      } catch {
        /* aborted or offline */
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (s: Seed) => {
    onAdd(s);
    setQ("");
    setResults([]);
    setOpen(false);
  };

  return (
    <div className="space-y-3">
      <div ref={boxRef} className="relative">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={(e) => {
            if (!open || !results.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % results.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a - 1 + results.length) % results.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              pick(results[active]);
            } else if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Search a film or show you love, e.g. Arrival, Fleabag…"
          className="w-full rounded-xl border border-line bg-surface-2 px-4 py-3 outline-none placeholder:text-muted focus:border-accent"
          role="combobox"
          aria-expanded={open}
          aria-controls="seed-results"
        />
        {open && results.length > 0 && (
          <ul
            id="seed-results"
            role="listbox"
            className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-xl border border-line bg-surface shadow-2xl"
          >
            {results.map((r, i) => (
              <li key={`${r.type}:${r.id}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(r)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left ${
                    i === active ? "bg-surface-2" : ""
                  }`}
                >
                  {r.poster ? (
                    <img src={r.poster} alt="" className="h-12 w-8 rounded object-cover" />
                  ) : (
                    <div className="h-12 w-8 rounded bg-surface-2" />
                  )}
                  <span className="flex-1">
                    {r.title} <span className="text-muted">{r.year ?? ""}</span>
                  </span>
                  <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">
                    {r.type === "movie" ? "Film" : "Show"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {seeds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {seeds.map((s) => (
            <span
              key={`${s.type}:${s.id}`}
              className="flex items-center gap-2 rounded-full border border-line bg-surface-2 py-1 pl-1 pr-2 text-sm"
            >
              {s.poster ? (
                <img src={s.poster} alt="" className="h-7 w-7 rounded-full object-cover" />
              ) : (
                <span className="h-7 w-7 rounded-full bg-surface" />
              )}
              {s.title}
              <button
                type="button"
                onClick={() => onRemove(s)}
                className="ml-1 text-muted hover:text-fg"
                aria-label={`Remove ${s.title}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
