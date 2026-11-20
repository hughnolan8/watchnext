import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { genreIdsFor, GENRES } from "./genres";
import { similarTo } from "./similar";
import { getRelated, searchTitles, tmdb } from "./tmdb";
import type { AskResult, MediaType, Suggestion } from "./types";

// "Ask WatchNext": a plain-English question ("shows like Luther", "action thrillers above 7 on
// IMDb", "something cosy for a Sunday") is turned into a search over the stored weekly
// catalogue. Claude only interprets the question (and, for themes, reads plot summaries);
// every rating comes from what's already stored, so this costs no OMDb lookups.

const MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5";
const HAS_FALLBACK = /^claude-(opus-5|fable-5|mythos-5|sonnet-5-5)/.test(MODEL);
const GENRE_KEYS = GENRES.map((g) => g.key);
const SORTS = ["best", "imdb", "letterboxd", "newest", "oldest", "shortest", "longest", "hidden_gems", "popular"] as const;
type Sort = (typeof SORTS)[number];

export interface AskSpec {
  type: "all" | MediaType;
  genresAll: string[];
  genresAny: string[];
  excludeGenres: string[];
  minImdb: number | null;
  maxImdb: number | null;
  minLetterboxd: number | null;
  minImdbVotes: number | null;
  maxImdbVotes: number | null;
  yearFrom: number | null;
  yearTo: number | null;
  minRuntime: number | null;
  maxRuntime: number | null;
  minSeasons: number | null;
  maxSeasons: number | null;
  minEpisodes: number | null;
  maxEpisodes: number | null;
  services: string[];
  likeTitles: { title: string; year: number | null }[];
  theme: string | null;
  sort: Sort;
  limit: number | null;
  summary: string;
  unsupported: string[];
}

const num = { anyOf: [{ type: "number" }, { type: "null" }] };
const int = { anyOf: [{ type: "integer" }, { type: "null" }] };
const genreList = { type: "array", items: { type: "string", enum: GENRE_KEYS } };

const SPEC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    type: { type: "string", enum: ["all", "movie", "tv"] },
    genresAll: genreList,
    genresAny: genreList,
    excludeGenres: genreList,
    minImdb: num,
    maxImdb: num,
    minLetterboxd: num,
    minImdbVotes: int,
    maxImdbVotes: int,
    yearFrom: int,
    yearTo: int,
    minRuntime: int,
    maxRuntime: int,
    minSeasons: int,
    maxSeasons: int,
    minEpisodes: int,
    maxEpisodes: int,
    services: { type: "array", items: { type: "string" } },
    likeTitles: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { title: { type: "string" }, year: int },
        required: ["title", "year"],
      },
    },
    theme: { anyOf: [{ type: "string" }, { type: "null" }] },
    sort: { type: "string", enum: [...SORTS] },
    limit: int,
    summary: { type: "string" },
    unsupported: { type: "array", items: { type: "string" } },
  },
  required: [
    "type", "genresAll", "genresAny", "excludeGenres", "minImdb", "maxImdb", "minLetterboxd",
    "minImdbVotes", "maxImdbVotes", "yearFrom", "yearTo", "minRuntime", "maxRuntime", "minSeasons",
    "maxSeasons", "minEpisodes", "maxEpisodes", "services", "likeTitles", "theme", "sort", "limit",
    "summary", "unsupported",
  ],
};

const SPEC_SYSTEM = `You turn a viewer's request on WatchNext, a site that suggests films and TV shows from the streaming services they pay for, into a search over a stored catalogue.

Each catalogue title has only these details: film or show, title, year, genres, a short plot summary, runtime (films, minutes), seasons and total episodes (shows), IMDb rating (0-10) and vote count, Letterboxd rating (0-5, films only), TMDB rating, and which of the viewer's services it streams on.

Fill every field; use null, [] or "all" for anything the request doesn't mention. Guidance:
- type: "tv" for shows/series/box sets, "movie" for films/movies, otherwise "all".
- Genres use these keys only: ${GENRE_KEYS.join(", ")}. Combined genres ("action thrillers", "sci-fi horror") go in genresAll; alternatives ("comedy or romance", "something funny or scary") go in genresAny; anything to avoid goes in excludeGenres. Map loose words to genres (cartoons → animation, whodunnit → mystery, cop show → crime, spooky → horror). Don't add genres the request doesn't imply.
- Ratings: "above 7"/"7+"/"rated at least 7" on IMDb → minImdb 7. "Highly rated"/"acclaimed" without a number → minImdb 7.5. "Good" alone → minImdb 7. A Letterboxd number (0-5) → minLetterboxd. "Hidden gems"/"underrated" → minImdb 7, maxImdbVotes 50000, sort "hidden_gems".
- Years: "90s" → 1990-1999; "recent"/"new" → yearFrom = current year minus 3; "classic"/"old" → yearTo 1995.
- Length: "short film"/"under 2 hours" → maxRuntime (100 / 120); "quick watch"/"one season" shows → maxSeasons 1; "miniseries"/"limited series" → maxSeasons 1, maxEpisodes 10; "long series to binge" → minSeasons 4.
- services: names of the viewer's services the request restricts to, spelled as listed below.
- likeTitles: every film or show the viewer names as a reference ("like Luther", "if I liked Line of Duty"). Include the year only if given.
- theme: anything about mood, plot, setting, tone, era, country, characters or subject that the fields above can't express ("set in London", "female detective", "cosy", "feel-good", "twisty", "based on a true story", "Scandinavian"). Write it as a short description to judge plot summaries against. null if there's nothing like that. Don't repeat what genres already cover.
- sort: "best" unless the viewer asks for an order ("newest", "highest rated" → "imdb", "most popular" → "popular", "shortest").
- limit: only if the viewer asks for a number ("give me 5").
- summary: a short, friendly line (max 12 words) saying what you're showing, e.g. "Crime dramas like Luther, rated 7+ on IMDb".
- unsupported: plain-English notes for parts of the request the catalogue can't answer (actors, directors, age ratings, release this week, still running). Keep each note short.
If the request isn't about finding something to watch, return the defaults and put a short note in unsupported.`;

const THEME_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { picks: { type: "array", items: { type: "integer" } } },
  required: ["picks"],
};

let client: Anthropic | null = null;
export const hasAnthropicKey = () => !!process.env.ANTHROPIC_API_KEY?.trim();
const anthropic = () => (client ??= new Anthropic());

/** One structured-output call. Returns the parsed JSON object. */
async function askJson<T>(system: string, user: string, schema: Record<string, unknown>, maxTokens: number): Promise<T> {
  const res = await anthropic().beta.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    // Refusals are very unlikely for film questions, but if one happens the API retries on a
    // fallback model. Only some models support this (not Haiku), so it's left off for the rest.
    ...(HAS_FALLBACK ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
    output_config: { effort: "low", format: { type: "json_schema", schema } },
  });
  if (res.stop_reason === "refusal") throw new AskError("refused");
  if (res.stop_reason === "max_tokens") throw new AskError("too_long");
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return JSON.parse(text) as T;
}

export class AskError extends Error {}

/** Clean up what the model returned, so a bad value can't break filtering. */
function sanitise(raw: AskSpec): AskSpec {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const genres = (v: unknown) => (Array.isArray(v) ? v.filter((g) => GENRE_KEYS.includes(g)) : []);
  const strings = (v: unknown, max: number) =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && !!s.trim()).slice(0, max) : [];
  return {
    type: raw.type === "movie" || raw.type === "tv" ? raw.type : "all",
    genresAll: genres(raw.genresAll),
    genresAny: genres(raw.genresAny),
    excludeGenres: genres(raw.excludeGenres),
    minImdb: n(raw.minImdb),
    maxImdb: n(raw.maxImdb),
    minLetterboxd: n(raw.minLetterboxd),
    minImdbVotes: n(raw.minImdbVotes),
    maxImdbVotes: n(raw.maxImdbVotes),
    yearFrom: n(raw.yearFrom),
    yearTo: n(raw.yearTo),
    minRuntime: n(raw.minRuntime),
    maxRuntime: n(raw.maxRuntime),
    minSeasons: n(raw.minSeasons),
    maxSeasons: n(raw.maxSeasons),
    minEpisodes: n(raw.minEpisodes),
    maxEpisodes: n(raw.maxEpisodes),
    services: strings(raw.services, 10),
    likeTitles: (Array.isArray(raw.likeTitles) ? raw.likeTitles : [])
      .filter((t) => t && typeof t.title === "string" && t.title.trim())
      .slice(0, 3)
      .map((t) => ({ title: t.title.trim().slice(0, 100), year: n(t.year) })),
    theme: typeof raw.theme === "string" && raw.theme.trim() ? raw.theme.trim().slice(0, 300) : null,
    sort: SORTS.includes(raw.sort) ? raw.sort : "best",
    limit: n(raw.limit),
    summary: typeof raw.summary === "string" ? raw.summary.slice(0, 120) : "",
    unsupported: strings(raw.unsupported, 4).map((s) => s.slice(0, 160)),
  };
}

export async function interpret(question: string, services: string[]): Promise<AskSpec> {
  const today = new Date().toISOString().slice(0, 10);
  const user = `Today is ${today}. The viewer's services: ${services.join(", ") || "none"}.\n\nRequest: ${question}`;
  return sanitise(await askJson<AskSpec>(SPEC_SYSTEM, user, SPEC_SCHEMA, 2000));
}

const between = (v: number | null | undefined, lo: number | null, hi: number | null) => {
  if (lo == null && hi == null) return true;
  if (v == null) return false;
  return (lo == null || v >= lo) && (hi == null || v <= hi);
};

/** The hard filters: everything the stored fields can answer directly. */
export function applySpec(pool: Suggestion[], spec: AskSpec): Suggestion[] {
  const wantServices = spec.services.map((s) => s.toLowerCase());
  return pool.filter((s) => {
    if (spec.type !== "all" && s.type !== spec.type) return false;
    const ids = s.genreIds ?? [];
    if (spec.genresAll.some((g) => !ids.some((id) => genreIdsFor([g], s.type).includes(id)))) return false;
    if (spec.genresAny.length && !ids.some((id) => genreIdsFor(spec.genresAny, s.type).includes(id))) return false;
    if (spec.excludeGenres.length && ids.some((id) => genreIdsFor(spec.excludeGenres, s.type).includes(id))) return false;
    if (!between(s.imdb.rating, spec.minImdb, spec.maxImdb)) return false;
    if (!between(s.imdb.votes, spec.minImdbVotes, spec.maxImdbVotes)) return false;
    if (spec.minLetterboxd != null && !between(s.letterboxd?.rating, spec.minLetterboxd, null)) return false;
    if (!between(s.year, spec.yearFrom, spec.yearTo)) return false;
    // Runtime applies to films, seasons and episodes to shows; asking for one implies that type.
    if (spec.minRuntime != null || spec.maxRuntime != null) {
      if (s.type !== "movie" || !between(s.runtime, spec.minRuntime, spec.maxRuntime)) return false;
    }
    if (spec.minSeasons != null || spec.maxSeasons != null || spec.minEpisodes != null || spec.maxEpisodes != null) {
      if (s.type !== "tv") return false;
      if (!between(s.seasons, spec.minSeasons, spec.maxSeasons)) return false;
      if (s.episodes != null && !between(s.episodes, spec.minEpisodes, spec.maxEpisodes)) return false;
    }
    if (wantServices.length && !s.providers.some((p) => wantServices.includes(p.name.toLowerCase()))) return false;
    return true;
  });
}

function sortBy(list: Suggestion[], sort: Sort): Suggestion[] {
  // Titles missing the value always go last.
  const by = (f: (s: Suggestion) => number | null | undefined, dir: 1 | -1) =>
    [...list].sort((a, b) => {
      const x = f(a), y = f(b);
      if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
      return dir * (x - y);
    });
  switch (sort) {
    case "imdb": return by((s) => s.imdb.rating, -1);
    case "letterboxd": return by((s) => s.letterboxd?.rating, -1);
    case "newest": return by((s) => s.year, -1);
    case "oldest": return by((s) => s.year, 1);
    case "shortest": return by((s) => (s.type === "movie" ? s.runtime : s.episodes), 1);
    case "longest": return by((s) => (s.type === "movie" ? s.runtime : s.episodes), -1);
    case "popular": return by((s) => s.imdb.votes ?? s.tmdb.votes, -1);
    case "hidden_gems": return by((s) => (s.imdb.rating ?? 0) - Math.log10(1 + (s.imdb.votes ?? 0)) / 4, -1);
    default: return [...list].sort((a, b) => b.score - a.score);
  }
}

/** Ask Claude which of these titles fit a mood/plot/setting, best fit first. */
async function rankByTheme(list: Suggestion[], theme: string, question: string): Promise<Suggestion[]> {
  const candidates = list.slice(0, 200);
  if (!candidates.length) return [];
  const lines = candidates.map((s, i) =>
    [i, `${s.title} (${s.year ?? "?"})`, s.type === "movie" ? "Film" : "Show", s.genres.join("/"), s.overview.slice(0, 220).replace(/\s+/g, " ")].join(" | "),
  );
  const { picks } = await askJson<{ picks: number[] }>(
    "You pick films and shows that fit a viewer's request, using only the titles, genres and plot summaries given. Return the numbers of the titles that genuinely fit, best fit first, at most 40. Leave out anything that doesn't clearly fit. Return an empty list if nothing fits.",
    `Request: ${question}\nWhat to look for: ${theme}\n\nTitles (number | title | kind | genres | plot):\n${lines.join("\n")}`,
    THEME_SCHEMA,
    4000,
  );
  const seen = new Set<number>();
  return (Array.isArray(picks) ? picks : [])
    .filter((i) => Number.isInteger(i) && candidates[i] && !seen.has(i) && (seen.add(i), true))
    .map((i) => candidates[i]);
}

/** Look up a named title on TMDB and order the list by how alike each title is. */
async function orderByLike(list: Suggestion[], like: AskSpec["likeTitles"]) {
  const notFound: string[] = [];
  const sources: { key: string; related: string[]; src: Parameters<typeof similarTo>[0] }[] = [];
  await Promise.all(
    like.map(async ({ title, year }) => {
      const hits = await searchTitles(title, 5).catch(() => []);
      const hit = hits.find((h) => year == null || h.year === year) ?? hits[0];
      if (!hit) return void notFound.push(title);
      const [{ recs, similar }, details] = await Promise.all([
        getRelated(hit.type, hit.id),
        tmdb<{ genres?: { id: number }[] }>(`/${hit.type}/${hit.id}`).catch(() => ({ genres: [] })),
      ]);
      const key = `${hit.type}:${hit.id}`;
      sources.push({
        key,
        related: [...new Set([...recs, ...similar].map((r) => `${hit.type}:${r.id}`))],
        src: { key, id: hit.id, type: hit.type, title: hit.title, genreIds: (details.genres ?? []).map((g) => g.id) },
      });
    }),
  );
  if (!sources.length) return { list, notFound, matched: false };
  const exclude = new Set(sources.map((s) => s.key));
  const out: Suggestion[] = [];
  const used = new Set<string>();
  // Interleave each source's closest matches, then the genre-alike ones.
  const parts = sources.map(({ src, related }) => similarTo(src, related, list));
  for (const pick of ["closest", "alike"] as const) {
    const lists = parts.map((p) => p[pick]);
    for (let i = 0; lists.some((l) => i < l.length); i++) {
      for (const l of lists) {
        const s = l[i];
        if (!s || used.has(s.key) || exclude.has(s.key)) continue;
        used.add(s.key);
        out.push(s);
      }
    }
  }
  return { list: out, notFound, matched: true };
}

/** Short labels for what was applied, shown above the results. */
export function chipsFor(spec: AskSpec, likeNames: string[]): string[] {
  const label = (k: string) => GENRES.find((g) => g.key === k)?.label ?? k;
  const range = (lo: number | null, hi: number | null, unit: string) =>
    lo != null && hi != null ? `${lo}–${hi}${unit}` : lo != null ? `${lo}+${unit}` : hi != null ? `Up to ${hi}${unit}` : null;
  const count = (lo: number | null, hi: number | null, unit: string) => {
    if (lo == null && hi == null) return null;
    const one = lo === hi ? lo : hi === 1 ? 1 : null;
    return one != null ? `${one} ${unit}${one === 1 ? "" : "s"}` : range(lo, hi, ` ${unit}s`);
  };
  return [
    ...likeNames.map((t) => `Like ${t}`),
    spec.type === "tv" ? "Shows" : spec.type === "movie" ? "Films" : null,
    spec.genresAll.length ? spec.genresAll.map(label).join(" + ") : null,
    spec.genresAny.length ? spec.genresAny.map(label).join(" or ") : null,
    ...spec.excludeGenres.map((g) => `No ${label(g)}`),
    spec.minImdb != null || spec.maxImdb != null ? `IMDb ${range(spec.minImdb, spec.maxImdb, "")}` : null,
    spec.minLetterboxd != null ? `Letterboxd ${spec.minLetterboxd}+` : null,
    spec.maxImdbVotes != null ? "Lesser known" : null,
    spec.yearFrom != null || spec.yearTo != null
      ? spec.yearFrom != null && spec.yearTo != null
        ? `${spec.yearFrom}–${spec.yearTo}`
        : spec.yearFrom != null ? `${spec.yearFrom} on` : `Up to ${spec.yearTo}`
      : null,
    range(spec.minRuntime, spec.maxRuntime, " min"),
    count(spec.minSeasons, spec.maxSeasons, "season"),
    count(spec.minEpisodes, spec.maxEpisodes, "episode"),
    ...spec.services,
    spec.theme ? `“${spec.theme.length > 40 ? spec.theme.slice(0, 38) + "…" : spec.theme}”` : null,
  ].filter((c): c is string => !!c);
}

/** Answer a question over the user's stored suggestions. */
export async function ask(question: string, pool: Suggestion[], services: string[]): Promise<AskResult> {
  const spec = await interpret(question, services);
  let list = applySpec(pool, spec);
  let ordered = false;
  if (spec.theme && list.length) {
    list = await rankByTheme(sortBy(list, "best"), spec.theme, question);
    ordered = true;
  }
  const like = spec.likeTitles.length ? await orderByLike(list, spec.likeTitles) : null;
  if (like?.matched) {
    list = like.list;
    ordered = true;
  }
  if (!ordered || spec.sort !== "best") list = sortBy(list, spec.sort);
  const limit = spec.limit != null && spec.limit > 0 ? Math.min(spec.limit, 60) : 60;
  const notFound = like?.notFound ?? [];
  return {
    results: list.slice(0, limit),
    summary: spec.summary,
    chips: chipsFor(spec, spec.likeTitles.map((t) => t.title).filter((t) => !notFound.includes(t))),
    unsupported: spec.unsupported,
    notFound,
  };
}
