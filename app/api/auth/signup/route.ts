import { NextResponse, type NextRequest } from "next/server";
import { createUser, EMAIL_RE, findUserByEmail, MIN_PASSWORD } from "@/lib/account";
import { isRegion } from "@/lib/api";
import { hashPassword, startSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  const name = String(body?.name ?? "").trim().slice(0, 80);
  const region = isRegion(body?.region) ? body.region : (process.env.DEFAULT_REGION ?? "GB").trim().toUpperCase();

  if (!EMAIL_RE.test(email) || email.length > 254) return NextResponse.json({ error: "bad_email" }, { status: 400 });
  if (password.length < MIN_PASSWORD || password.length > 200)
    return NextResponse.json({ error: "weak_password", min: MIN_PASSWORD }, { status: 400 });
  if (findUserByEmail(email)) return NextResponse.json({ error: "email_taken" }, { status: 409 });

  const userId = createUser(email, name, await hashPassword(password), isRegion(region) ? region : "GB");

  await startSession(userId);
  return NextResponse.json({ ok: true });
}
