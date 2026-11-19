# WatchNext

Suggestions for films and TV that are streaming **on the services you already pay for**, ranked by a blend of IMDb, Letterboxd and TMDB ratings, and steered by titles you love.

## Setup

```bash
npm install
cp .env.example .env.local   # then add your keys
npm run dev                  # http://localhost:3000
```

### Keys

| Variable | Needed for | Where to get it |
| --- | --- | --- |
| `TMDB_API_KEY` | Everything: search, recommendations, which service has what | Free at <https://www.themoviedb.org/settings/api> (v3 key or v4 read token both work) |
| `OMDB_API_KEY` | IMDb ratings | Free at <https://www.omdbapi.com/apikey.aspx> (1,000 lookups/day) |
| `DEFAULT_REGION` | Default streaming country | Two-letter code, `GB` by default. Users can switch in the header. |

Letterboxd needs no key. It has no public API, so the server reads the average rating from each film's public page (`letterboxd.com/tmdb/{id}`). If that fails, the card shows "—". Letterboxd only covers films, so shows have no Letterboxd rating.

## How suggestions work

1. **Your services.** You pick your subscriptions for your region. Only subscription, free and ad-supported availability counts (not rent/buy). Data is from JustWatch via TMDB.
2. **Candidates.** For each title you love, TMDB's *recommendations* and *similar* lists are collected. Titles that several of your favourites point to score higher. With no favourites (or too few matches), it tops up with the best-rated titles on your services.
3. **Filters.** Films/shows, genres or a mood preset, earliest year, and max runtime (episode length for shows).
4. **Availability check.** The top ~60 candidates are checked against your services in your region.
5. **Ratings and score.** IMDb (OMDb) and Letterboxd ratings are fetched for the top 30. The score (0–100) is a weighted average of IMDb 40%, Letterboxd 40% and TMDB 20%, using whichever are available. With favourites, it's 65% rating and 35% how strongly your favourites point to the title.

"Loved it" adds a result to your favourites and hides it. "Seen it" and "Not for me" just hide it. All preferences are stored in your browser.

## Layout

```
app/api/{regions,providers,search,recommend}/route.ts   server endpoints (keys stay server-side)
lib/tmdb.ts, lib/omdb.ts, lib/letterboxd.ts              data sources
lib/recommend.ts                                         candidate gathering, filtering, scoring
components/                                              UI
```

This product uses the TMDB API but is not endorsed or certified by TMDB.
