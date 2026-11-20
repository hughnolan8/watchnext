# WatchNext — notes for Claude (shared by everyone on the project)

WatchNext suggests films and TV streaming on the services a user already pays for, ranked by IMDb, Letterboxd and TMDB ratings. Next.js 15 (App Router) + React 19 + Tailwind 4, Postgres on Neon, deployed on Vercel. Read [README.md](README.md) for setup, keys and how suggestions are built.

Two people work on this repo, often at the same time. Keep changes small and focused, one feature per branch/PR, and pull `main` before starting.

## Commands

```bash
npm run setup   # first time: install, link Vercel, pull .env.local
npm run dev     # http://localhost:3000
npm run lint    # eslint (next/core-web-vitals + next/typescript)
npm run build   # type-check + production build — run before every PR
```

There is no test suite. "Verified" means `npm run lint` and `npm run build` pass, and for UI changes the page was checked in the browser (desktop and ~375px mobile width).

## Layout

- `app/api/**/route.ts` — server endpoints. API keys never leave the server.
- `app/{login,signup,account}/page.tsx`, `app/page.tsx` — pages.
- `components/` — client UI. `WatchNext.tsx` is the home page shell.
- `lib/` — logic. Files that touch secrets or the DB start with `import "server-only"` (`db`, `auth`, `account`, `userData`, `catalogue`, `tmdb`, `omdb`, `letterboxd`, `api`). Files that run in the browser (`filter`, `describeFilter`, `rows`, `storage`, `titleFetch`, `genres`, `types`) must not import those.
- `public/sw.js` — service worker. Bump `VERSION` whenever you change it.
- `vercel.json` — weekly cron for `/api/cron/refresh-catalogue`.

## Conventions

- **API routes**: auth with `currentUser()` from `lib/auth` and return `401 { error: "unauthorised" }` if missing. Wrap upstream calls in `try { … } catch (e) { return errorResponse(e) }` from `lib/api`. Validate every input (`isRegion`, `cleanServices` in `lib/validate`, clamp string lengths with `.slice`). See `app/api/search/route.ts` as the model.
- **Database**: schema lives only in `migrate()` in `lib/db.ts`, as idempotent `CREATE … IF NOT EXISTS` / `ALTER … IF NOT EXISTS`, **one statement per `sql` call** (the Neon HTTP driver can't run multi-statement strings). Always use the tagged template (`sql\`… ${value}\``) — never build SQL by string concatenation. Timestamps are `BIGINT` milliseconds (`Date.now()`).
- **Per-account data** (favourites, hidden, filters) goes through `user_data` / `lib/userData.ts`; add a key to `USER_DATA_KEYS` rather than a new table.
- **Shared suggestions** are built weekly into the `catalogue` table; the home page must not call TMDB/OMDb/Letterboxd per user. OMDb's free tier is 1,000 lookups/day and a full build uses ~720 — anything that adds OMDb calls must stay under that.
- **Images**: plain `<img>` with TMDB CDN URLs (`https://image.tmdb.org/…`) is intentional; only allow that host for user-supplied logos.
- **Copy**: plain British English ("favourites", "colour"), short and friendly. No jargon in the UI.
- **Comments**: explain *why*, not what. Keep the existing short doc-comment style.
- **Mobile/PWA**: the app is installed on iPhone; respect safe-area insets and test at phone width.
- Keep dependencies minimal — ask before adding a package.

## Git and PRs

- Branch from up-to-date `main`; never push straight to `main`.
- PR titles are short, imperative, user-facing ("Show 'More like this' inside the details pop-up"). The body says what changed and how it was checked.
- `main` auto-deploys to production on Vercel; every other branch gets a preview URL. After merging, check the production deployment succeeds.
- Never commit `.env*` files (only `.env.example`). If you add an env var, add it to `.env.example`, the README "Keys" table and `REQUIRED_VARS`/`OPTIONAL_VARS` in `scripts/setup-local.sh`.

## Project agents and skills

- Agents in `.claude/agents/`: `reviewer` (reviews a diff against these conventions), `data-sources` (TMDB/OMDb/Letterboxd/catalogue questions and debugging).
- Skills in `.claude/skills/`: `/ship` (check, PR, merge, verify deploy), `/add-api-route`, `/add-streaming-service`, `/rebuild-catalogue`.

Personal preferences go in `CLAUDE.local.md` or `.claude/settings.local.json` (both git-ignored), not here.
