# WatchNext

Suggestions for films and TV that are streaming **on the services you already pay for**, ranked by a blend of IMDb, Letterboxd and TMDB ratings, and steered by titles you love.

## Setup

```bash
npm run setup   # installs, links Vercel, pulls .env.local
npm run dev     # http://localhost:3000
```

`npm run setup` ([scripts/setup-local.sh](scripts/setup-local.sh)) checks Node 20+, runs `npm install`, logs you in to Vercel, links the `watchnext` project, pulls the Development environment variables (database URL and API keys) into `.env.local` (backing up any existing one), and checks the required ones are there. It's safe to re-run.

You need access to the `hugh-nolans-projects` team on Vercel for the pull to work; ask the project owner to invite you. Without access, the script copies `.env.example` to `.env.local` and lists which values to fill in by hand (see **Keys** below).

### Keys

| Variable | Needed for | Where to get it |
| --- | --- | --- |
| `TMDB_API_KEY` | Everything: search, recommendations, which service has what | Free at <https://www.themoviedb.org/settings/api> (v3 key or v4 read token both work) |
| `OMDB_API_KEY` | IMDb ratings | Free at <https://www.omdbapi.com/apikey.aspx> (1,000 lookups/day) |
| `ANTHROPIC_API_KEY` | "Ask WatchNext" AI search (optional) | <https://platform.claude.com/settings/keys>. Each question is one or two Claude calls; limited to 20 per 10 minutes and 150 a day per account |
| `DEFAULT_REGION` | Default streaming country for new accounts | Two-letter code, `GB` by default. Users can change it on their Account page. |
| `DATABASE_URL` | Accounts and subscriptions | Postgres connection string. Free from [Neon](https://neon.tech), or added for you by Vercel's Neon integration. Tables are created automatically on first use. |

Letterboxd needs no key. It has no public API, so the server reads the average rating from each film's public page (`letterboxd.com/tmdb/{id}`). If that fails, the card shows "—". Letterboxd only covers films, so shows have no Letterboxd rating.

## Deploying to Vercel

The repo deploys to Vercel as a standard Next.js project; every push to `main` goes to production and every other branch gets a preview URL. In the Vercel project, add the **Neon** integration (Storage tab) so `DATABASE_URL` is set, and add `TMDB_API_KEY`, `OMDB_API_KEY` and `DEFAULT_REGION` under Settings → Environment Variables.

## Installing the app (iPhone, iPad, Mac)

WatchNext is a progressive web app, so it installs from the browser and opens in its own window with no address bar.

- **iPhone / iPad (Safari):** Share → **Add to Home Screen**. The app shows a hint with these steps the first time.
- **Mac (Safari 17+):** File → **Add to Dock**.
- **Mac / PC (Chrome or Edge):** the **Install** button the app offers, or the install icon in the address bar.

The pieces: [app/manifest.ts](app/manifest.ts) (name, icons, colours), the iOS tags and safe-area viewport in [app/layout.tsx](app/layout.tsx), and [public/sw.js](public/sw.js), a service worker registered by [components/PwaSetup.tsx](components/PwaSetup.tsx). It caches build assets and posters, keeps the last copy of each page for offline use, and shows [public/offline.html](public/offline.html) otherwise. API calls are never cached, and signing out clears the saved pages. The service worker only registers in production builds (`npm run build && npm start`). After changing it, bump `VERSION` in `sw.js` so installed apps drop old caches.

## Accounts and subscriptions

You sign up with an email and password. Each account stores the streaming services you subscribe to, so they follow you to any device. New accounts go straight to picking their services; you can change them any time from **Account** (top right), along with your name and region. Subscriptions are saved per region, because service IDs differ by country.

Accounts live in Postgres (Neon, via `@neondatabase/serverless`). Passwords are hashed with scrypt; sessions are a random token in an httpOnly cookie, with only its hash stored. Favourites, hidden titles and filters are saved to the account too (the `user_data` table, via `/api/account/data`), so they're the same on every device. Anything saved in a browser before this moved to the server is uploaded the first time that account opens the app there.

## How suggestions work

Suggestions are **built once a week on the server and shared by everyone**, so opening the app costs no TMDB, OMDb or Letterboxd calls.

1. **Weekly build.** A Vercel cron job (`vercel.json`, Mondays 05:00 UTC) calls `/api/cron/refresh-catalogue`. For each popular service in `CATALOGUE` ([lib/catalogue.ts](lib/catalogue.ts)), currently Netflix, Prime Video, Disney+, Apple TV, Paramount+ and BBC iPlayer in the UK, it collects the best-rated and the most popular films and shows on that service (TMDB discover), checks they're really streaming there, and fetches IMDb and Letterboxd ratings for the best 120 (`CATALOGUE_POOL`). The results go in the `catalogue` table, one row per region and service. A full build takes under a minute and uses about 720 OMDb lookups (the free tier allows 1,000 a day).
2. **Score.** 0–100, a weighted average of IMDb 40%, Letterboxd 40% and TMDB 20%, using whichever are available.
3. **Your picks.** The home page merges the stored lists for the services on your account and ranks them by score. Services outside `CATALOGUE`, and regions without one, don't get suggestions yet. Add them to `CATALOGUE` to include them.

**Running the build by hand.** The route needs `CRON_SECRET` (set in Vercel for Production; Vercel sends it automatically for cron runs). Locally, add `CRON_SECRET` to `.env.local`, then run:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/refresh-catalogue"
```

Add `?region=GB&provider=8` to rebuild one service. In Vercel you can also press **Run** next to the job under Settings → Cron Jobs.

The home page groups them into rows of 12 (top picks, new, genres, acclaimed, per service, series, films), and each title appears in only one row. Filters (films/shows, mood or genre, year, length, sort) run in the browser over those picks. "Loved it" saves a title to your favourites and hides it. "Seen it" and "Not for me" just hide it. Favourites don't change the shared suggestions.

## Layout

```
app/api/{regions,providers,search}/route.ts             server endpoints (keys stay server-side)
app/api/cron/refresh-catalogue                           weekly build of the shared suggestions
app/api/auth/{signup,login,logout}, app/api/account      accounts, subscriptions, saved app data
app/{login,signup,account}/page.tsx                      sign-in, sign-up, account settings
lib/db.ts, lib/auth.ts, lib/account.ts, lib/userData.ts  Postgres schema, sessions, account queries
lib/tmdb.ts, lib/omdb.ts, lib/letterboxd.ts              data sources
lib/catalogue.ts, lib/recommend.ts                       weekly catalogue, candidate gathering and scoring
components/                                              UI
```

This product uses the TMDB API but is not endorsed or certified by TMDB.
