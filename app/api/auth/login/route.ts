import { NextResponse, type NextRequest } from "next/server";
import { findUserByEmail } from "@/lib/account";
import { cleanExpiredSessions, hashPassword, startSession, verifyPassword } from "@/lib/auth";

// Hash a throwaway password once so unknown emails take as long as wrong passwords
const dummyHash = hashPassword("not-a-real-password");

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "").slice(0, 200);

  const user = email ? await findUserByEmail(email) : undefined;
  const ok = await verifyPassword(password, user?.password_hash ?? (await dummyHash));
  if (!user || !ok) return NextResponse.json({ error: "bad_credentials" }, { status: 401 });

  await cleanExpiredSessions();
  await startSession(user.id);
  return NextResponse.json({ ok: true });
}
