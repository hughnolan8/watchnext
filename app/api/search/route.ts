import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/api";
import { searchTitles } from "@/lib/tmdb";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);
  try {
    return NextResponse.json(await searchTitles(q.slice(0, 100)));
  } catch (e) {
    return errorResponse(e);
  }
}
