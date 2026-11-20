import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/api";
import { getSubscriptions } from "@/lib/account";
import { currentUser } from "@/lib/auth";
import { titleDetails } from "@/lib/recommend";

/** Details, ratings and where to watch for one film or show (opened from search). */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const type = req.nextUrl.searchParams.get("type");
  const id = Number(req.nextUrl.searchParams.get("id"));
  if ((type !== "movie" && type !== "tv") || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  try {
    const subs = await getSubscriptions(user.id, user.region);
    return NextResponse.json(await titleDetails(type, id, user.region, subs.map((s) => s.id)));
  } catch (e) {
    return errorResponse(e);
  }
}
