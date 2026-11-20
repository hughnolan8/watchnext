import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { searchWhereToWatch } from "@/lib/tmdb";

/** Search any film or show and say which services stream it in the user's region. */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);
  const all = req.nextUrl.searchParams.get("all") === "1"; // Enter in the search box: every match, not just the top few
  try {
    return NextResponse.json(await searchWhereToWatch(q.slice(0, 100), user.region, all ? 60 : 8));
  } catch (e) {
    return errorResponse(e);
  }
}
