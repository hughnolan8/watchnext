import { NextResponse, type NextRequest } from "next/server";
import { setSubscriptions } from "@/lib/account";
import { isRegion } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { cleanServices } from "@/lib/validate";

/** Replace the signed-in user's subscriptions for a region. Body: { region, services: [{id,name,logo}] } */
export async function PUT(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!isRegion(body?.region)) return NextResponse.json({ error: "bad_region" }, { status: 400 });
  const services = cleanServices(body.services);
  await setSubscriptions(user.id, body.region, services);
  return NextResponse.json({ ok: true, count: services.length });
}
