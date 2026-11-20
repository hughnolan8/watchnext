import "server-only";
import { db } from "./db";
import type { Account, ProviderInfo } from "./types";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD = 8;

export async function findUserByEmail(email: string) {
  const sql = await db();
  const [row] = await sql`
    SELECT id, email, name, region, password_hash FROM users WHERE lower(email) = lower(${email})`;
  if (!row) return undefined;
  return {
    id: Number(row.id),
    email: String(row.email),
    name: String(row.name),
    region: String(row.region),
    password_hash: String(row.password_hash),
  } satisfies Account & { password_hash: string };
}

export async function createUser(email: string, name: string, passwordHash: string, region: string): Promise<number> {
  const sql = await db();
  const [row] = await sql`
    INSERT INTO users (email, name, password_hash, region, created_at)
    VALUES (${email}, ${name}, ${passwordHash}, ${region}, ${Date.now()})
    RETURNING id`;
  return Number(row.id);
}

export async function updateProfile(userId: number, changes: { name?: string; region?: string }) {
  const sql = await db();
  if (changes.name != null) await sql`UPDATE users SET name = ${changes.name} WHERE id = ${userId}`;
  if (changes.region != null) await sql`UPDATE users SET region = ${changes.region} WHERE id = ${userId}`;
}

export async function getSubscriptions(userId: number, region: string): Promise<ProviderInfo[]> {
  const sql = await db();
  const rows = await sql`
    SELECT provider_id AS id, name, logo FROM subscriptions
    WHERE user_id = ${userId} AND region = ${region}
    ORDER BY added_at, name`;
  return rows.map((r) => ({ id: Number(r.id), name: String(r.name), logo: String(r.logo) }));
}

/** Replace the user's subscriptions for one region. Keeps the original added date for services that stay. */
export async function setSubscriptions(userId: number, region: string, services: ProviderInfo[]) {
  const sql = await db();
  const now = Date.now();
  const keep = services.map((s) => s.id);
  await sql.transaction([
    sql`DELETE FROM subscriptions WHERE user_id = ${userId} AND region = ${region}
        AND NOT (provider_id = ANY(${keep}::int[]))`,
    ...services.map(
      (s, i) => sql`
        INSERT INTO subscriptions (user_id, region, provider_id, name, logo, added_at)
        VALUES (${userId}, ${region}, ${s.id}, ${s.name}, ${s.logo}, ${now + i})
        ON CONFLICT (user_id, region, provider_id) DO UPDATE SET name = EXCLUDED.name, logo = EXCLUDED.logo`,
    ),
  ]);
}
