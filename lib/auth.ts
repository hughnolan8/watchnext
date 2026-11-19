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
  db().prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(
    sha256(token),
    userId,
    expires,
  );
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
  if (token) db().prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
  jar.delete(SESSION_COOKIE);
}

/** The signed-in account, or null. Safe to call from server components and route handlers. */
export async function currentUser(): Promise<Account | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = db()
    .prepare(
      `SELECT u.id, u.email, u.name, u.region, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .get(sha256(token)) as (Account & { expires_at: number }) | undefined;
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    db().prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
    return null;
  }
  return { id: row.id, email: row.email, name: row.name, region: row.region };
}

export function cleanExpiredSessions() {
  db().prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
}
