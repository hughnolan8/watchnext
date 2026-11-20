import "server-only";
import { db } from "./db";

/** The app data each account keeps on the server, so it follows them to any device. */
export const USER_DATA_KEYS = ["seeds", "hidden", "filters", "results"] as const;
export type UserDataKey = (typeof USER_DATA_KEYS)[number];
export type UserData = Partial<Record<UserDataKey, unknown>>;

/** Largest JSON value accepted for one key (a batch of suggestions is usually ~100 KB). */
export const MAX_USER_DATA_BYTES = 1_000_000;

export const isUserDataKey = (k: unknown): k is UserDataKey =>
  typeof k === "string" && (USER_DATA_KEYS as readonly string[]).includes(k);

export async function getUserData(userId: number): Promise<UserData> {
  const sql = await db();
  const rows = await sql`SELECT key, value FROM user_data WHERE user_id = ${userId}`;
  const data: UserData = {};
  for (const r of rows) if (isUserDataKey(r.key)) data[r.key] = r.value;
  return data;
}

export async function setUserData(userId: number, key: UserDataKey, value: unknown) {
  const sql = await db();
  await sql`
    INSERT INTO user_data (user_id, key, value, updated_at)
    VALUES (${userId}, ${key}, ${JSON.stringify(value)}::jsonb, ${Date.now()})
    ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`;
}
