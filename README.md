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
| `DEFAULT_REGION` | Default streaming country for new accounts | Two-letter code, `GB` by default. Users can change it on their Account page. |
| `DATABASE_URL` | Accounts and subscriptions | Postgres connection string. Free from [Neon](https://neon.tech), or added for you by Vercel's Neon integration. Tables are created automatically on first use. |

Letterboxd needs no key. It has no public API, so the server reads the average rating from each film's public page (`letterboxd.com/tmdb/{id}`). If that fails, the card shows "—". Letterboxd only covers films, so shows have no Letterboxd rating.

## Deploying to Vercel

The repo deploys to Vercel as a standard Next.js project; every push to `main` goes to production and every other branch gets a preview URL. In the Vercel project, add the **Neon** integration (Storage tab) so `DATABASE_URL` is set, and add `TMDB_API_KEY`, `OMDB_API_KEY` and `DEFAULT_REGION` under Settings → Environment Variables.

## Accounts and subscriptions

You sign up with an email and password. Each account stores the streaming services you subscribe to, so they follow you to any device. New accounts go straight to picking their services; you can change them any time from **Account** (top right), along with your name and region. Subscriptions are saved per region, because service IDs differ by country.

Accounts live in Postgres (Neon, via `@neondatabase/serverless`). Passwords are hashed with scrypt; sessions are a random token in an httpOnly cookie, with only its hash stored. Favourites, filters, hidden titles and saved picks are still kept in the browser, separately for each account.

## How suggestions work

1. **Your services.** The subscriptions saved on your account for your region. Only subscription, free and ad-supported availability counts (not rent/buy). Data is from JustWatch via TMDB.
2. **Candidates.** For each title you love, TMDB's *recommendations* and *similar* lists are collected. Titles that several of your favourites point to score higher. The best-rated films and shows on your services are always mixed in too, so there's plenty of variety.
3. **Availability check.** Up to ~120 candidates are checked against your services in your region.
4. **Ratings and score.** IMDb (OMDb) and Letterboxd ratings are fetched for the top 70. The score (0–100) is a weighted average of IMDb 40%, Letterboxd 40% and TMDB 20%, using whichever are available. With favourites, it's 65% rating and 35% how strongly your favourites point to the title.

**Fetch once, filter instantly.** "Get suggestions" is the only call that fetches suggestions. The results (usually 50–70 titles) are saved in your browser. Filters for films/shows, mood or genre, earliest year and max length, plus sorting by match, IMDb, Letterboxd or newest, all run locally over those saved results with no network requests. The page tells you when your region, services or favourites have changed since the last fetch, so you know when to refresh.

"Loved it" adds a result to your favourites and hides it. "Seen it" and "Not for me" just hide it.

## Layout

```
app/api/{regions,providers,search,recommend}/route.ts   server endpoints (keys stay server-side)
app/api/auth/{signup,login,logout}, app/api/account      accounts and subscriptions
app/{login,signup,account}/page.tsx                      sign-in, sign-up, account settings
lib/db.ts, lib/auth.ts, lib/account.ts                   Postgres schema, sessions, account queries
lib/tmdb.ts, lib/omdb.ts, lib/letterboxd.ts              data sources
lib/recommend.ts                                         candidate gathering, filtering, scoring
components/                                              UI
```

This product uses the TMDB API but is not endorsed or certified by TMDB.
