// Runs in the browser: turns a plain-English request like "I don't want any
// animated shows" into changes to the filters. Rule-based, so it's instant and
// needs no network calls.
import { DEFAULT_FILTERS, rangeLabel, type FilterState } from "./filter";
import { GENRES } from "./genres";

export interface DescribeResult {
  filters: FilterState;
  /** What changed, in words, e.g. ["Hiding Animation", "Films only"]. Empty if nothing was understood. */
  changes: string[];
}

/** Words that point at each genre. Matched as whole words (a trailing "s" is allowed). */
const GENRE_WORDS: Record<string, string[]> = {
  action: ["action", "explosions?"],
  adventure: ["adventures?"],
  animation: ["animated", "animations?", "cartoons?", "anime", "pixar", "disney animated"],
  comedy: ["comed(?:y|ies)", "funny", "sitcoms?", "laughs?", "humou?r", "comedic"],
  crime: ["crime", "gangsters?", "heists?", "detectives?", "cops?", "police"],
  documentary: ["documentar(?:y|ies)", "docuseries", "docs?", "true stor(?:y|ies)"],
  drama: ["dramas?", "dramatic"],
  family: ["family", "kids?", "children'?s?", "child friendly", "family friendly"],
  fantasy: ["fantasy", "fantasies", "magic(?:al)?", "dragons?", "wizards?"],
  history: ["history", "historical", "period dramas?", "period pieces?"],
  horror: ["horror", "scary", "gory", "gore", "slashers?", "frightening"],
  mystery: ["myster(?:y|ies)", "whodunn?its?"],
  romance: ["romance", "romances", "romantic", "rom-?coms?", "love stor(?:y|ies)"],
  scifi: ["sci-?fi", "science fiction", "space", "aliens?", "futuristic"],
  thriller: ["thrillers?", "suspense(?:ful)?", "tense"],
  war: ["war", "wars", "military"],
  western: ["westerns?", "cowboys?"],
  reality: ["reality(?: tv| shows?)?"],
};

const NUMBER_WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6",
  seven: "7", eight: "8", nine: "9", ten: "10", single: "1",
};

const NEGATION =
  /\b(no|not|non|never|without|except|avoid|skip|hate|hates|dislike|exclude|excluding|nothing|none|zero|anything but|tired of|sick of|can't stand|cannot stand|don't|dont|do not|doesn't|won't|isn't|aren't|less)\b/;
const ALLOW =
  /\b(fine|ok|okay|allow|include|including|again|back|don't mind|dont mind|do not mind|alright|all right)\b/;
const POSITIVE_CUE =
  /\b(want|wanna|like|love|prefer|show me|give me|only|just|into|fancy|mood|looking for|i'm after|after some)\b/;
const ONLY = /\b(only|just|exclusively|nothing but)\b/;
const RESET = /\b(reset|clear|start over|remove (?:all|every)|no filters|anything goes|everything)\b/;

const MOVIE_WORDS = /\b(films?|movies?|cinema)\b/;
const TV_WORDS = /\b(shows?|series|tv|television|telly|box ?sets?)\b/;

function genresIn(text: string): string[] {
  const found: string[] = [];
  for (const [key, words] of Object.entries(GENRE_WORDS)) {
    if (new RegExp(`\\b(?:${words.join("|")})\\b`).test(text)) found.push(key);
  }
  return found;
}

const label = (key: string) => GENRES.find((g) => g.key === key)?.label ?? key;

/** A season/episode range from words like "under 3 seasons" or "2 to 4 episodes". */
function countRange(text: string, unit: "seasons?" | "episodes?"): string | null {
  const n = `(\\d+)\\s*\\+?\\s*(?:${unit})`;
  let m: RegExpMatchArray | null;
  if ((m = text.match(new RegExp(`(\\d+)\\s*(?:-|to|–)\\s*(\\d+)\\s*(?:${unit})`)))) return `${m[1]}-${m[2]}`;
  if ((m = text.match(new RegExp(`\\b(?:under|less than|fewer than|below)\\s+${n}`)))) return `-${Math.max(1, +m[1] - 1)}`;
  if ((m = text.match(new RegExp(`\\b(?:at most|no more than|up to|max(?:imum)?|or less|or fewer)\\s+${n}`)))) return `-${m[1]}`;
  if ((m = text.match(new RegExp(`${n}\\s+(?:or (?:less|fewer)|max(?:imum)?|at most)`)))) return `-${m[1]}`;
  if ((m = text.match(new RegExp(`\\b(?:over|more than|longer than)\\s+${n}`)))) return `${+m[1] + 1}-`;
  if ((m = text.match(new RegExp(`\\b(?:at least|minimum|min)\\s+${n}`)))) return `${m[1]}-`;
  if ((m = text.match(new RegExp(`(\\d+)\\s*\\+\\s*(?:${unit})|${n}\\s+or more`)))) return `${m[1] ?? m[2]}-`;
  if ((m = text.match(new RegExp(`\\b${n}`)))) return m[1];
  return null;
}

/** A minimum IMDb rating from words like "rated 7+", "above 7.5" or "highly rated". */
function minRating(text: string): number | null | undefined {
  if (/\b(any rating|don't care about (?:the )?rating|ratings? don't matter)\b/.test(text)) return null;
  if (/\b(seasons?|episodes?)\b/.test(text)) return undefined;
  const pats = [
    /(\d+(?:\.\d+)?)\s*(?:\+|stars?|\/\s*10|or (?:more|higher|above|better)|and (?:up|above))/,
    /\b(?:rated|rating|ratings|imdb|score)\D{0,20}?(\d+(?:\.\d+)?)/,
    /\b(?:above|over|at least|minimum|min|better than|higher than)\s+(\d+(?:\.\d+)?)/,
  ];
  for (const p of pats) {
    const m = text.match(p);
    if (m) {
      const v = Number(m[1]);
      if (v >= 1 && v <= 10) return Math.round(v * 2) / 2;
    }
  }
  if (/\b(highly rated|well rated|top rated|critically acclaimed|acclaimed|good reviews|great reviews|only the best|the best|good ones|really good|high quality)\b/.test(text)) return 7.5;
  return undefined;
}

/** Split into clauses; "and …" without its own cue keeps the clause before it's yes/no. */
function clauses(text: string): { text: string; negative: boolean; allow: boolean }[] {
  const out: { text: string; negative: boolean; allow: boolean }[] = [];
  for (const sentence of text.split(/[,.;!?\n]|\b(?:but|though|although|however|also|plus)\b/)) {
    let prevNegative = false;
    for (const part of sentence.split(/\b(?:and|or|nor|&)\b/)) {
      const t = part.trim();
      if (!t) continue;
      const allow = ALLOW.test(t);
      const negative: boolean = !allow && (NEGATION.test(t) || (!POSITIVE_CUE.test(t) && prevNegative));
      out.push({ text: t, negative, allow });
      prevNegative = negative;
    }
  }
  return out;
}

export function describeFilters(input: string, current: FilterState): DescribeResult {
  let text = ` ${input.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ")} `;
  for (const [w, d] of Object.entries(NUMBER_WORDS)) text = text.replace(new RegExp(`\\b${w}\\b`, "g"), d);

  let f: FilterState = { ...DEFAULT_FILTERS, ...current };
  const changes: string[] = [];

  if (RESET.test(text) && !genresIn(text).length) {
    return { filters: DEFAULT_FILTERS, changes: ["Cleared all filters"] };
  }

  // Ratings, seasons and episodes read across the whole request.
  const rating = minRating(text);
  if (rating !== undefined) {
    f.minImdb = rating;
    changes.push(rating == null ? "Any IMDb rating" : `IMDb ${rating.toFixed(1)}+`);
  }
  const miniseries = /\b(mini-?series|limited series|1 season|single season|one-?offs?)\b/.test(text);
  const seasons = miniseries ? "1" : countRange(text, "seasons?");
  const episodes = countRange(text, "episodes?");
  const shortShows = /\b(short|quick) (shows?|series)\b/.test(text);
  const longShows = /\b(long-?running|long (shows?|series)|lots of seasons|many seasons)\b/.test(text);
  const pickedSeasons = seasons ?? (shortShows ? "-2" : longShows ? "4-" : null);
  if (pickedSeasons) {
    f.seasons = pickedSeasons;
    changes.push(`${rangeLabel(pickedSeasons)} ${pickedSeasons === "1" ? "season" : "seasons"}`);
  }
  if (episodes) {
    f.episodes = episodes;
    changes.push(`${rangeLabel(episodes)} episodes`);
  }

  // Genres and film/show type, clause by clause.
  let onlyGenres: string[] | null = null;
  for (const c of clauses(text)) {
    const genres = genresIn(c.text);
    const movie = MOVIE_WORDS.test(c.text);
    const tv = TV_WORDS.test(c.text.replace(/\bshow (?:me|us)\b/g, "")) && !/\b(seasons?|episodes?)\b/.test(c.text);

    for (const g of genres) {
      if (c.allow) {
        if (f.excludeGenres.includes(g)) {
          f.excludeGenres = f.excludeGenres.filter((x) => x !== g);
          changes.push(`Showing ${label(g)} again`);
        }
      } else if (c.negative) {
        f.genres = f.genres.filter((x) => x !== g);
        if (!f.excludeGenres.includes(g)) f.excludeGenres = [...f.excludeGenres, g];
        changes.push(`Hiding ${label(g)}`);
      } else {
        f.excludeGenres = f.excludeGenres.filter((x) => x !== g);
        if (ONLY.test(c.text)) onlyGenres = [...(onlyGenres ?? []), g];
        else if (!f.genres.includes(g)) f.genres = [...f.genres, g];
        if (!ONLY.test(c.text)) changes.push(`Including ${label(g)}`);
      }
    }

    // "no animated shows" is about the genre, not about hiding every show.
    if (c.negative && genres.length) continue;
    if (movie && tv) {
      if (!c.negative) {
        f.type = "all";
        changes.push("Films and shows");
      }
    } else if (movie || tv) {
      const type = (movie !== c.negative) ? "movie" : "tv";
      f.type = type;
      changes.push(type === "movie" ? "Films only" : "Shows only");
    }
  }
  if (onlyGenres) {
    f.genres = [...new Set(onlyGenres)];
    changes.push(`Only ${f.genres.map(label).join(" / ")}`);
  }

  // Season/episode filters only make sense for shows.
  if ((f.seasons || f.episodes) && f.type === "movie") {
    if (pickedSeasons || episodes) {
      f.type = "tv";
      if (!changes.includes("Shows only")) changes.push("Shows only");
    } else f = { ...f, seasons: null, episodes: null };
  }

  return { filters: f, changes: [...new Set(changes)] };
}
