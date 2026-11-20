---
name: rebuild-catalogue
description: Run WatchNext's daily suggestions build by hand, locally or in production, for all services or one. Use after changing ranking/catalogue code, or when suggestions look stale or empty.
---

# Rebuild the catalogue

The build is `GET /api/cron/refresh-catalogue`, protected by `Authorization: Bearer $CRON_SECRET`.

**Locally**
1. Make sure `.env.local` has `CRON_SECRET` (any long random string; add it if missing — don't print it) plus `TMDB_API_KEY`, `OMDB_API_KEY` and `DATABASE_URL`.
2. Start `npm run dev` (in the background).
3. Run, preferably for one service to save OMDb quota:
   ```bash
   set -a; source .env.local; set +a
   curl -s -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/refresh-catalogue?region=GB&provider=8"
   ```
   Drop `&provider=…` to rebuild a whole region, or both params for everything (up to ~2 minutes, at most 750 new OMDb lookups a day — cached ratings are reused).

Note: the local `.env.local` from `npm run setup` points at the Development database, so this doesn't touch production data.

**Production**: ask the user before running it — it spends the shared daily OMDb quota. Then press **Run** next to the job in Vercel → Settings → Cron Jobs.

Read the JSON report: `ok: false` or any entry with `error` is a failure — show it verbatim. A very low `titles` count usually means a wrong provider ID for that region or an exhausted OMDb quota (ratings missing).
