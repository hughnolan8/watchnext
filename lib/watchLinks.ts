// Shared by client and server. TMDB doesn't give per-service deep links, only a
// JustWatch page per title, so we link to each service's own search for the title.
// That lands on the title (or one click from it) in the service's app or site.

import type { ProviderInfo, Suggestion } from "./types";

type Builder = (q: string) => string;

// Matched against the lower-cased provider name, first match wins.
const SERVICES: [RegExp, Builder][] = [
  [/netflix/, (q) => `https://www.netflix.com/search?q=${q}`],
  [/amazon|prime video/, (q) => `https://www.primevideo.com/search/?phrase=${q}`],
  [/disney/, (q) => `https://www.disneyplus.com/search?q=${q}`],
  [/apple tv/, (q) => `https://tv.apple.com/search?term=${q}`],
  [/hulu/, (q) => `https://www.hulu.com/search?q=${q}`],
  [/^max$|hbo/, (q) => `https://play.max.com/search?q=${q}`],
  [/paramount/, (q) => `https://www.paramountplus.com/search/?q=${q}`],
  [/peacock/, (q) => `https://www.peacocktv.com/search?q=${q}`],
  [/now tv|^now$/, (q) => `https://www.nowtv.com/search?q=${q}`],
  [/sky go/, (q) => `https://www.sky.com/watch/search?term=${q}`],
  [/iplayer/, (q) => `https://www.bbc.co.uk/iplayer/search?q=${q}`],
  [/itvx/, (q) => `https://www.itv.com/watch/search?q=${q}`],
  [/channel 4|channel4/, (q) => `https://www.channel4.com/search?q=${q}`],
  [/my5|channel 5/, (q) => `https://www.channel5.com/search?q=${q}`],
  [/mubi/, (q) => `https://mubi.com/en/search/films?query=${q}`],
  [/crunchyroll/, (q) => `https://www.crunchyroll.com/search?q=${q}`],
  [/britbox/, (q) => `https://www.britbox.com/search?q=${q}`],
  [/shudder/, (q) => `https://www.shudder.com/search?q=${q}`],
  [/stan$|^stan/, (q) => `https://www.stan.com.au/search?q=${q}`],
  [/binge/, (q) => `https://binge.com.au/search?q=${q}`],
  [/crave/, (q) => `https://www.crave.ca/en/search?q=${q}`],
  [/pluto/, (q) => `https://pluto.tv/search/details?query=${q}`],
  [/tubi/, (q) => `https://tubitv.com/search/${q}`],
  [/youtube/, (q) => `https://www.youtube.com/results?search_query=${q}`],
];

export interface WatchLink {
  provider: ProviderInfo;
  url: string;
}

/** One link per service the title is on, falling back to the JustWatch page when we don't know the service. */
export function watchLinks(s: Pick<Suggestion, "title" | "providers" | "watchLink">): WatchLink[] {
  const q = encodeURIComponent(s.title);
  return s.providers.flatMap((provider) => {
    const name = provider.name.toLowerCase();
    const build = SERVICES.find(([re]) => re.test(name))?.[1];
    const url = build ? build(q) : s.watchLink;
    return url ? [{ provider, url }] : [];
  });
}
