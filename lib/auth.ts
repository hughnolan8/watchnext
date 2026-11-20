import "server-only";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { db } from "./db";
import type { Account } from "./types";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = "wn_session";
const SESSION_DAYS = 30;

// ---- Passwords (scrypt, salted) ----

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, saltB64, keyB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const actual = await scryptAsync(password, Buffer.from(saltB64, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

// ---- Sessions (random token in an httpOnly cookie; only its hash is stored) ----

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function startSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expires = Date.now() + SESSION_DAYS * 864e5;
  const sql = await db();
  await sql`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (${sha256(token)}, ${userId}, ${expires})`;
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expires),
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const sql = await db();
    await sql`DELETE FROM sessions WHERE token_hash = ${sha256(token)}`;
  }
  jar.delete(SESSION_COOKIE);
}

/** The signed-in account, or null. Safe to call from server components and route handlers. */
export async function currentUser(): Promise<Account | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const sql = await db();
  const [row] = await sql`
    SELECT u.id, u.email, u.name, u.region, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${sha256(token)}`;
  if (!row) return null;
  if (Number(row.expires_at) < Date.now()) {
    await sql`DELETE FROM sessions WHERE token_hash = ${sha256(token)}`;
    return null;
  }
  return { id: Number(row.id), email: String(row.email), name: String(row.name), region: String(row.region) };
}

export async function cleanExpiredSessions() {
  const sql = await db();
  await sql`DELETE FROM sessions WHERE expires_at < ${Date.now()}`;
}
