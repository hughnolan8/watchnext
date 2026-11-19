import "server-only";
import { db } from "./db";
import type { Account, ProviderInfo } from "./types";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD = 8;

export function findUserByEmail(email: string) {
  return db().prepare("SELECT id, email, name, region, password_hash FROM users WHERE email = ?").get(email) as
    | (Account & { password_hash: string })
    | undefined;
}

export function createUser(email: string, name: string, passwordHash: string, region: string): number {
  const res = db()
    .prepare("INSERT INTO users (email, name, password_hash, region, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(email, name, passwordHash, region, Date.now());
  return Number(res.lastInsertRowid);
}

export function updateProfile(userId: number, changes: { name?: string; region?: string }) {
  if (changes.name != null) db().prepare("UPDATE users SET name = ? WHERE id = ?").run(changes.name, userId);
  if (changes.region != null) db().prepare("UPDATE users SET region = ? WHERE id = ?").run(changes.region, userId);
}

export function getSubscriptions(userId: number, region: string): ProviderInfo[] {
  return db()
    .prepare(
      "SELECT provider_id AS id, name, logo FROM subscriptions WHERE user_id = ? AND region = ? ORDER BY added_at, name",
    )
    .all(userId, region)
    // SQLite rows have a null prototype; React only passes plain objects to client components
    .map((r) => ({ id: Number(r.id), name: String(r.name), logo: String(r.logo) }));
}

/** Replace the user's subscriptions for one region. Keeps the original added date for services that stay. */
export function setSubscriptions(userId: number, region: string, services: ProviderInfo[]) {
  const now = Date.now();
  db().exec("BEGIN");
  try {
    const keep = services.map((s) => s.id);
    db().prepare(
      `DELETE FROM subscriptions WHERE user_id = ? AND region = ?
       AND provider_id NOT IN (SELECT value FROM json_each(?))`,
    ).run(userId, region, JSON.stringify(keep));
    const upsert = db().prepare(
      `INSERT INTO subscriptions (user_id, region, provider_id, name, logo, added_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, region, provider_id) DO UPDATE SET name = excluded.name, logo = excluded.logo`,
    );
    services.forEach((s, i) => upsert.run(userId, region, s.id, s.name, s.logo, now + i));
    db().exec("COMMIT");
  } catch (e) {
    db().exec("ROLLBACK");
    throw e;
  }
}
