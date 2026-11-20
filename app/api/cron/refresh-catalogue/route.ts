import { NextResponse, type NextRequest } from "next/server";
import { buildCatalogue, CATALOGUE } from "@/lib/catalogue";

// Rebuilding every service takes a few minutes of TMDB/OMDb/Letterboxd calls.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Weekly rebuild of the shared suggestions (scheduled in vercel.json).
 * Vercel sends `Authorization: Bearer $CRON_SECRET`. To run it by hand:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/cron/refresh-catalogue
 * Optional: ?region=GB to limit to one region, &provider=8 to limit to one service.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const regions = params.get("region") ? [params.get("region")!.toUpperCase()] : Object.keys(CATALOGUE);
  const provider = Number(params.get("provider")) || undefined;

  const report: Record<string, Awaited<ReturnType<typeof buildCatalogue>>> = {};
  for (const region of regions) report[region] = await buildCatalogue(region, provider ? [provider] : undefined);
  const failed = Object.values(report).flat().some((r) => r.error);
  return NextResponse.json({ ok: !failed, report }, { status: failed ? 500 : 200 });
}
