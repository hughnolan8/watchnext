"use client";

import type { Suggestion } from "@/lib/types";

const compact = new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 });

function scoreColour(score: number) {
  if (score >= 80) return "bg-good text-bg";
  if (score >= 65) return "bg-accent text-bg";
  return "bg-surface-2 text-fg";
}

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
      <span className="font-semibold tabular-nums">
        {value != null ? value.toFixed(1) : "—"}
      </span>
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

export function TitleCard({
  s,
  onLoved,
  onSeen,
  onNotForMe,
}: {
  s: Suggestion;
  onLoved: () => void;
  onSeen: () => void;
  onNotForMe: () => void;
}) {
  const meta = [
    s.type === "movie" ? "Film" : "Show",
    s.year,
    s.type === "movie"
      ? s.runtime && `${Math.floor(s.runtime / 60)}h ${s.runtime % 60}m`
      : s.seasons && `${s.seasons} season${s.seasons > 1 ? "s" : ""}`,
    s.genres.slice(0, 2).join(", "),
  ].filter(Boolean);

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="relative aspect-[2/3] bg-surface-2">
        {s.poster && (
          <img src={s.poster} alt="" loading="lazy" className="h-full w-full object-cover" />
        )}
        <span
          className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-sm font-bold tabular-nums shadow-lg ${scoreColour(s.score)}`}
          title="WatchNext score: blend of IMDb, Letterboxd and TMDB ratings, plus how closely it matches what you love"
        >
          {s.score}
        </span>
        <div className="absolute bottom-2 right-2 flex gap-1">
          {s.providers.map((p) => (
            <img
              key={p.id}
              src={p.logo}
              alt={p.name}
              title={`On ${p.name}`}
              className="h-8 w-8 rounded-lg shadow-lg ring-1 ring-black/40"
            />
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="font-display text-lg font-semibold leading-snug">
            {s.watchLink ? (
              <a href={s.watchLink} target="_blank" rel="noreferrer" className="hover:underline">
                {s.title}
              </a>
            ) : (
              s.title
            )}
          </h3>
          <p className="text-sm text-muted">{meta.join(" · ")}</p>
        </div>

        <p className="text-sm text-accent">{s.reason}</p>

        <div className="space-y-1.5 text-sm">
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

        <p className="line-clamp-3 text-sm text-muted">{s.overview}</p>

        <div className="mt-auto grid grid-cols-3 gap-1.5 pt-1 text-xs">
          <button type="button" onClick={onLoved} className="rounded-lg border border-line py-1.5 hover:border-good hover:text-good" title="Seen it and loved it: use it to steer suggestions">
            ♥ Loved it
          </button>
          <button type="button" onClick={onSeen} className="rounded-lg border border-line py-1.5 hover:border-fg/40">
            Seen it
          </button>
          <button type="button" onClick={onNotForMe} className="rounded-lg border border-line py-1.5 hover:border-bad hover:text-bad">
            Not for me
          </button>
        </div>
      </div>
    </article>
  );
}
