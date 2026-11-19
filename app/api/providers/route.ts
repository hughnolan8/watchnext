import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, isRegion } from "@/lib/api";
import { getProviders } from "@/lib/tmdb";

export async function GET(req: NextRequest) {
  const region = req.nextUrl.searchParams.get("region");
  if (!isRegion(region)) return NextResponse.json({ error: "bad_region" }, { status: 400 });
  try {
    const providers = await getProviders(region);
    return NextResponse.json(providers.map(({ id, name, logo }) => ({ id, name, logo })));
  } catch (e) {
    return errorResponse(e);
  }
}
