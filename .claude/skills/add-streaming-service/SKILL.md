---
name: add-streaming-service
description: Add a streaming service (or a new region) to WatchNext's daily catalogue so it gets suggestions. Use when someone asks to support another service like NOW, ITVX, Hulu, or another country.
---

# Add a streaming service or region

Suggestions only exist for services listed in `CATALOGUE` in `lib/catalogue.ts`.

1. **Find the TMDB provider ID** for the service in that region: `GET https://api.themoviedb.org/3/watch/providers/movie?watch_region=<REGION>` (and `/tv`) using `TMDB_API_KEY` from `.env.local`. Use the ID that appears for both films and TV. Don't print the key.
2. **Check the time budget.** OMDb is capped per day (`OMDB_BUDGET`) and ratings are cached, so more services just take longer to fill in. Each run builds services longest-unbuilt first for ~2 minutes; if the report regularly shows many `skipped`, services are rebuilt less than daily — tell the user.
3. **Edit `CATALOGUE`**: add `{ id, name }` under the region (create the region key if new, using a two-letter code).
4. **Update the README** "How suggestions work" list of services.
5. **Build just that service locally** (see `/rebuild-catalogue`) with `?region=<REGION>&provider=<id>` and confirm the report shows a sensible `titles` count and no `error`.
6. `npm run lint && npm run build`, then `/ship`. Production picks it up at the next daily 05:00 UTC run, or run the cron job by hand in Vercel (Settings → Cron Jobs → Run).
