import { NextResponse, type NextRequest } from "next/server";
import { getSubscriptions, updateProfile } from "@/lib/account";
import { isRegion } from "@/lib/api";
import { currentUser } from "@/lib/auth";

/** The signed-in account and its subscriptions (for its region, or ?region=XX). */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const q = req.nextUrl.searchParams.get("region");
  const region = isRegion(q) ? q : user.region;
  return NextResponse.json({ user, region, subscriptions: await getSubscriptions(user.id, region) });
}

/** Update name and/or home region. */
export async function PATCH(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (body?.region != null && !isRegion(body.region))
    return NextResponse.json({ error: "bad_region" }, { status: 400 });
  await updateProfile(user.id, {
    name: body?.name != null ? String(body.name).trim().slice(0, 80) : undefined,
    region: body?.region ?? undefined,
  });
  return NextResponse.json({ ok: true });
}
