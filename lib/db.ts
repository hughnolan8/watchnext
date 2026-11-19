import "server-only";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

// One SQLite file holds accounts, sessions and each account's subscriptions.
// Uses Node's built-in SQLite (Node 22.13+), so there's nothing extra to install.

const DB_PATH = resolve(process.env.DATABASE_PATH?.trim() || "data/watchnext.db");

const globalForDb = globalThis as unknown as { watchnextDb?: DatabaseSync };

function open() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH, { timeout: 5000 });
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name          TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      region        TEXT NOT NULL,
      created_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );

    -- A user's subscriptions, per region (service IDs differ between countries).
    -- Name and logo are kept so the home page can show them without calling TMDB.
    CREATE TABLE IF NOT EXISTS subscriptions (
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      region      TEXT NOT NULL,
      provider_id INTEGER NOT NULL,
      name        TEXT NOT NULL,
      logo        TEXT NOT NULL,
      added_at    INTEGER NOT NULL,
      PRIMARY KEY (user_id, region, provider_id)
    );
  `);
  return db;
}

/** Opened on first use (not at import, so builds never touch the file) and reused across hot reloads. */
export function db() {
  return (globalForDb.watchnextDb ??= open());
}
