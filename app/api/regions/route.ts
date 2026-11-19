import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { getRegions } from "@/lib/tmdb";

export async function GET() {
  try {
    return NextResponse.json(await getRegions());
  } catch (e) {
    return errorResponse(e);
  }
}
