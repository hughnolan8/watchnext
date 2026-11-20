import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { getRelated } from "@/lib/tmdb";

/** Titles TMDB says are like this one, best match first, as "movie:123" keys. */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const type = req.nextUrl.searchParams.get("type");
  const id = Number(req.nextUrl.searchParams.get("id"));
  if ((type !== "movie" && type !== "tv") || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  try {
    const { recs, similar } = await getRelated(type, id);
    const keys = [...new Set([...recs, ...similar].map((item) => `${type}:${item.id}`))];
    return NextResponse.json(keys);
  } catch (e) {
    return errorResponse(e);
  }
}
