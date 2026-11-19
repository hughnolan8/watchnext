"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Suggestion } from "@/lib/types";
import { watchLinks } from "@/lib/watchLinks";

export function scoreColour(score: number) {
  if (score >= 80) return "bg-good text-bg";
  if (score >= 65) return "bg-accent text-bg";
  return "bg-surface-2 text-fg";
}

function Arrow({ dir, onClick, show }: { dir: "left" | "right"; onClick: () => void; show: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === "left" ? "Scroll left" : "Scroll right"}
      tabIndex={-1}
      className={`absolute inset-y-0 z-10 hidden w-12 items-center justify-center bg-bg/70 text-fg opacity-0 backdrop-blur-sm transition group-hover/row:opacity-100 hover:bg-bg/85 sm:flex ${
        dir === "left" ? "left-0 rounded-r-xl" : "right-0 rounded-l-xl"
      } ${show ? "" : "pointer-events-none !opacity-0"}`}
    >
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-7 w-7" aria-hidden>
        <path d={dir === "left" ? "M12.5 4.5L7 10l5.5 5.5" : "M7.5 4.5L13 10l-5.5 5.5"} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function PosterCard({ s, onOpen }: { s: Suggestion; onOpen: () => void }) {
  const first = watchLinks(s)[0];
  return (
    <div className="group/card relative w-36 shrink-0 snap-start sm:w-40 lg:w-44">
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-surface-2 ring-1 ring-line transition duration-200 group-hover/card:scale-[1.04] group-hover/card:ring-accent/60 group-hover/card:shadow-2xl">
        {s.poster ? (
          <img src={s.poster} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center p-3 text-center font-display font-semibold">
            {s.title}
          </span>
        )}
        <span
          className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums shadow-lg ${scoreColour(s.score)}`}
          title="WatchNext score"
        >
          {s.score}
        </span>
        <div className="absolute right-2 top-2 flex flex-col gap-1">
          {s.providers.slice(0, 3).map((p) => (
            <img key={p.id} src={p.logo} alt="" className="h-6 w-6 rounded-md shadow ring-1 ring-black/40" />
          ))}
        </div>

        {/* Whole poster opens the details; the watch link sits above it */}
        <button type="button" onClick={onOpen} className="absolute inset-0" aria-label={`More about ${s.title}`} />

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-2.5 pt-10 text-white opacity-0 transition group-hover/card:opacity-100 group-focus-within/card:opacity-100">
          <p className="line-clamp-2 text-sm font-semibold leading-tight">{s.title}</p>
          <p className="text-[11px] text-white/70">
            {[s.type === "movie" ? "Film" : "Show", s.year, s.imdb.rating && `IMDb ${s.imdb.rating.toFixed(1)}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {first && (
            <a
              href={first.url}
              target="_blank"
              rel="noreferrer"
              className="pointer-events-auto mt-2 flex items-center justify-center gap-1 rounded-md bg-white py-1 text-xs font-semibold text-black hover:bg-white/85"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden>
                <path d="M6 4l10 6-10 6z" />
              </svg>
              {first.provider.name}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/** A Netflix-style row: a heading and posters that scroll sideways. */
export function PosterRow({
  title,
  items,
  onOpen,
}: {
  title: string;
  items: Suggestion[];
  onOpen: (s: Suggestion) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure, items]);

  const page = (dir: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  return (
    <section className="space-y-2">
      <h2 className="flex items-baseline gap-2 px-4 font-display text-lg font-semibold sm:px-8 sm:text-xl">
        {title}
        <span className="text-xs font-normal text-muted">{items.length}</span>
      </h2>
      <div className="group/row relative">
        <Arrow dir="left" show={edges.left} onClick={() => page(-1)} />
        <div
          ref={ref}
          onScroll={measure}
          className="no-scrollbar flex snap-x snap-mandatory scroll-px-4 gap-2.5 overflow-x-auto px-4 py-3 sm:scroll-px-8 sm:gap-3 sm:px-8"
        >
          {items.map((s) => (
            <PosterCard key={s.key} s={s} onOpen={() => onOpen(s)} />
          ))}
        </div>
        <Arrow dir="right" show={edges.right} onClick={() => page(1)} />
      </div>
    </section>
  );
}
