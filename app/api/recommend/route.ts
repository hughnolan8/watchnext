import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, isRegion } from "@/lib/api";
import { recommend } from "@/lib/recommend";
import type { RecommendRequest } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: Partial<RecommendRequest>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  if (!isRegion(body.region)) return NextResponse.json({ error: "bad_region" }, { status: 400 });
  const providers = (body.providers ?? []).filter((p) => Number.isInteger(p)).slice(0, 50);
  if (!providers.length) return NextResponse.json({ error: "no_providers" }, { status: 400 });

  const seeds = (body.seeds ?? [])
    .filter((s) => Number.isInteger(s?.id) && (s.type === "movie" || s.type === "tv"))
    .slice(0, 10)
    .map((s) => ({ id: s.id, type: s.type, title: String(s.title ?? "").slice(0, 200) }));

  try {
    const result = await recommend({
      region: body.region,
      providers,
      seeds,
      exclude: (body.exclude ?? []).filter((x) => typeof x === "string").slice(0, 2000),
    });
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
