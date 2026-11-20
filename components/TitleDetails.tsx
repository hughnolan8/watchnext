"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { similarTo } from "@/lib/similar";
import type { Suggestion } from "@/lib/types";
import { watchLinks } from "@/lib/watchLinks";
import { PosterCard, scoreColour, SparkIcon } from "./PosterRow";

const SIMILAR_MAX = 18;

const compact = new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 });

function Rating({
  label,
  value,
  outOf,
  votes,
  url,
  className,
}: {
  label: string;
  value: number | null;
  outOf: number;
  votes: number | null;
  url: string | null;
  className: string;
}) {
  const body = (
    <>
      <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${className}`}>{label}</span>
      <span className="font-semibold tabular-nums">{value != null ? value.toFixed(1) : "—"}</span>
      <span className="text-xs text-muted">
        /{outOf}
        {votes ? ` · ${compact.format(votes)}` : ""}
      </span>
    </>
  );
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:underline">
      {body}
    </a>
  ) : (
    <span className="flex items-center gap-1.5">{body}</span>
  );
}

export function metaLine(s: Suggestion) {
  return [
    s.type === "movie" ? "Film" : "Show",
    s.year,
    s.type === "movie"
      ? s.runtime && `${Math.floor(s.runtime / 60)}h ${s.runtime % 60}m`
      : [
          s.seasons && `${s.seasons} season${s.seasons > 1 ? "s" : ""}`,
          s.episodes && `${s.episodes} episode${s.episodes > 1 ? "s" : ""}`,
        ]
          .filter(Boolean)
          .join(", "),
    s.genres.slice(0, 3).join(", "),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** "Watch on …" buttons, one per service the title is on. */
export function WatchButtons({ s, size = "md" }: { s: Suggestion; size?: "md" | "lg" }) {
  const links = watchLinks(s);
  const pad = size === "lg" ? "px-5 py-2.5 text-base" : "px-4 py-2 text-sm";
  return (
    <div className="flex flex-wrap gap-2">
      {links.map(({ provider, url }, i) => (
        <a
          key={provider.id}
          href={url}
          target="_blank"
          rel="noreferrer"
          className={`inline-flex items-center gap-2 rounded-lg font-semibold transition ${pad} ${
            i === 0 ? "bg-white text-black hover:bg-white/85" : "bg-white/15 text-white backdrop-blur hover:bg-white/25"
          }`}
        >
          <img src={provider.logo} alt="" className="h-5 w-5 rounded" />
          Watch on {provider.name}
        </a>
      ))}
    </div>
  );
}

export function TitleDetails({
  s,
  onClose,
  onLoved,
  onSeen,
  onNotForMe,
  picks,
  onOpen,
  startAtSimilar = false,
}: {
  s: Suggestion;
  onClose: () => void;
  onLoved: () => void;
  onSeen: () => void;
  onNotForMe: () => void;
  picks: Suggestion[]; // the user's visible suggestions, searched for titles like this one
  onOpen: (s: Suggestion) => void;
  startAtSimilar?: boolean; // scroll straight to "More like this" once it loads
}) {
  const ref = useRef<HTMLDivElement>(null);
  const similarRef = useRef<HTMLElement>(null);

  // Titles TMDB says are like this one ("movie:123" keys); null while loading.
  const [related, setRelated] = useState<string[] | null>(null);
  useEffect(() => {
    let live = true;
    setRelated(null);
    fetch(`/api/similar?type=${s.type}&id=${s.id}`)
      .then((res) => (res.ok ? res.json() : []))
      .catch(() => [])
      .then((keys: string[]) => live && setRelated(Array.isArray(keys) ? keys : []));
    return () => {
      live = false;
    };
  }, [s.type, s.id]);

  const similar = useMemo(() => {
    if (!related) return null;
    const src = { key: s.key, id: s.id, type: s.type, title: s.title, genreIds: s.genreIds ?? [] };
    const { closest, alike } = similarTo(src, related, picks);
    return [...closest, ...alike].slice(0, SIMILAR_MAX);
  }, [related, picks, s]);

  const scrollToSimilar = () => similarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  // Opened from a poster's "More like this": jump down once the list is in.
  const jumped = useRef(false);
  useEffect(() => {
    if (!startAtSimilar || jumped.current || !similar) return;
    jumped.current = true;
    requestAnimationFrame(scrollToSimilar);
  }, [startAtSimilar, similar]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const image = s.backdrop ?? s.poster;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="title-details"
        tabIndex={-1}
        className="relative max-h-[92dvh] w-full max-w-3xl overflow-y-auto overscroll-contain rounded-t-2xl border border-line bg-surface shadow-2xl outline-none sm:rounded-2xl"
      >
        <div className="relative aspect-video max-h-[50dvh] w-full overflow-hidden bg-black">
          {image && (
            <img
              src={image}
              alt=""
              className={`h-full w-full object-cover ${s.backdrop ? "" : "scale-110 blur-md brightness-75"}`}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
          <div className="absolute inset-x-0 bottom-0 space-y-3 p-5 text-white sm:p-7">
            <h2 id="title-details" className="font-display text-2xl font-bold leading-tight sm:text-4xl">
              {s.title}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <WatchButtons s={s} />
              <button
                type="button"
                onClick={scrollToSimilar}
                className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/25"
              >
                <SparkIcon className="h-4 w-4" />
                More like this
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-6 p-5 sm:grid-cols-[1fr_auto] sm:p-7">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${scoreColour(s.score)}`}>
                {s.score}
              </span>
              {metaLine(s)}
            </div>
            <p className="text-sm text-accent">{s.reason}</p>
            <p className="text-sm leading-relaxed">{s.overview}</p>
            {s.watchLink && (
              <a href={s.watchLink} target="_blank" rel="noreferrer" className="inline-block text-xs text-muted hover:text-fg hover:underline">
                All ways to watch (JustWatch) ↗
              </a>
            )}
          </div>
          <div className="space-y-1.5 text-sm sm:min-w-44">
            <Rating label="IMDb" value={s.imdb.rating} outOf={10} votes={s.imdb.votes} url={s.imdb.url} className="bg-[#f5c518] text-black" />
            {s.letterboxd && (
              <Rating
                label="LB"
                value={s.letterboxd.rating}
                outOf={5}
                votes={s.letterboxd.votes}
                url={s.letterboxd.url}
                className="bg-[#202830] text-[#00e054] ring-1 ring-[#40bcf4]/50"
              />
            )}
            <Rating label="TMDB" value={s.tmdb.rating} outOf={10} votes={s.tmdb.votes} url={s.tmdb.url} className="bg-[#0d253f] text-[#01b4e4]" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-line px-5 py-5 text-sm sm:px-7">
          <button type="button" onClick={onLoved} className="rounded-lg border border-line py-2 hover:border-good hover:text-good" title="Seen it and loved it: use it to steer suggestions">
            ♥ Loved it
          </button>
          <button type="button" onClick={onSeen} className="rounded-lg border border-line py-2 hover:border-fg/40">
            Seen it
          </button>
          <button type="button" onClick={onNotForMe} className="rounded-lg border border-line py-2 hover:border-bad hover:text-bad">
            Not for me
          </button>
        </div>

        <section ref={similarRef} aria-labelledby="similar-heading" className="scroll-mt-2 border-t border-line px-5 pt-5 pb-safe-5 sm:px-7">
          <h3 id="similar-heading" className="flex items-center gap-2 font-display text-lg font-semibold">
            <SparkIcon className="h-4 w-4 text-accent" />
            More like {s.title}
          </h3>
          {!similar ? (
            <p className="py-6 text-sm text-muted">Finding titles like {s.title}…</p>
          ) : similar.length ? (
            <div className="grid grid-cols-3 gap-2.5 py-4 sm:grid-cols-4 sm:gap-3">
              {similar.map((x) => (
                <PosterCard key={x.key} s={x} onOpen={() => onOpen(x)} className="w-full" />
              ))}
            </div>
          ) : (
            <p className="py-6 text-sm text-muted">Nothing like {s.title} is on your services this week.</p>
          )}
        </section>
      </div>
    </div>
  );
}
