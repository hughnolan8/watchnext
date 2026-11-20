import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// Postgres (Neon) holds accounts, sessions and each account's subscriptions.
// On Vercel, adding the Neon integration sets DATABASE_URL for you. Locally, put it in .env.local.

const globalForDb = globalThis as unknown as {
  watchnextSql?: NeonQueryFunction<false, false>;
  watchnextSchema?: Promise<void>;
};

function connect() {
  const url = (process.env.DATABASE_URL || process.env.POSTGRES_URL)?.trim();
  if (!url) throw new Error("DATABASE_URL is not set. Add a Postgres (Neon) database; see README.");
  return neon(url);
}

async function migrate(sql: NeonQueryFunction<false, false>) {
  // One statement per call: the HTTP driver doesn't run multi-statement strings.
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         TEXT NOT NULL,
      name          TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      region        TEXT NOT NULL,
      created_at    BIGINT NOT NULL
    )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower ON users (lower(email))`;
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at BIGINT NOT NULL
    )`;
  // A user's subscriptions, per region (service IDs differ between countries).
  // Name and logo are kept so the home page can show them without calling TMDB.
  await sql`
    CREATE TABLE IF NOT EXISTS subscriptions (
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      region      TEXT NOT NULL,
      provider_id INTEGER NOT NULL,
      name        TEXT NOT NULL,
      logo        TEXT NOT NULL,
      added_at    BIGINT NOT NULL,
      PRIMARY KEY (user_id, region, provider_id)
    )`;
  // Per-account app data that used to live only in the browser: favourites (seeds), hidden
  // titles and filters. One JSON value per key.
  // Shared suggestions, rebuilt daily by the cron job: the best titles on each popular
  // service in each supported region (see lib/catalogue.ts). Everyone reads from this.
  await sql`
    CREATE TABLE IF NOT EXISTS catalogue (
      region      TEXT NOT NULL,
      provider_id INTEGER NOT NULL,
      results     JSONB NOT NULL,
      built_at    BIGINT NOT NULL,
      PRIMARY KEY (region, provider_id)
    )`;
  // IMDb and Letterboxd ratings remembered between catalogue builds (see lib/ratingsCache.ts),
  // so a bigger catalogue doesn't mean more OMDb lookups than the free tier allows.
  await sql`
    CREATE TABLE IF NOT EXISTS title_ratings (
      key         TEXT PRIMARY KEY,
      imdb_rating REAL,
      imdb_votes  INTEGER,
      lb_rating   REAL,
      lb_votes    INTEGER,
      lb_url      TEXT,
      fetched_at  BIGINT NOT NULL
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS user_data (
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key        TEXT NOT NULL,
      value      JSONB NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (user_id, key)
    )`;
  // One row per AI search ("Ask WatchNext"), for per-account rate limits. Old rows are pruned.
  await sql`
    CREATE TABLE IF NOT EXISTS ask_log (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      at      BIGINT NOT NULL
    )`;
  await sql`CREATE INDEX IF NOT EXISTS ask_log_user_at ON ask_log (user_id, at)`;
}

/**
 * The SQL client, with tables created on first use in each server instance.
 * Connected lazily (not at import) so builds never need the database.
 */
export async function db() {
  const sql = (globalForDb.watchnextSql ??= connect());
  globalForDb.watchnextSchema ??= migrate(sql).catch((e) => {
    globalForDb.watchnextSchema = undefined; // retry next time
    throw e;
  });
  await globalForDb.watchnextSchema;
  return sql;
}
