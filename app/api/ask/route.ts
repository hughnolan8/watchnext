import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/api";
import { getSubscriptions } from "@/lib/account";
import { ask, AskError, hasAnthropicKey } from "@/lib/ask";
import { currentUser } from "@/lib/auth";
import { getCatalogue } from "@/lib/catalogue";
import { db } from "@/lib/db";
import { getUserData } from "@/lib/userData";

// Each question is one or two Claude calls, so keep a lid on how many one account can make.
const PER_10_MIN = 20;
const PER_DAY = 150;

/** Is this account under its limits? Records the question if so. */
async function allow(userId: number) {
  const sql = await db();
  const now = Date.now();
  const day = now - 24 * 60 * 60 * 1000;
  await sql`DELETE FROM ask_log WHERE user_id = ${userId} AND at < ${day}`;
  const [row] = await sql`
    SELECT count(*)::int AS day, count(*) FILTER (WHERE at > ${now - 10 * 60 * 1000})::int AS recent
    FROM ask_log WHERE user_id = ${userId}`;
  if (row.recent >= PER_10_MIN || row.day >= PER_DAY) return false;
  await sql`INSERT INTO ask_log (user_id, at) VALUES (${userId}, ${now})`;
  return true;
}

/** "Ask WatchNext": answer a plain-English request from this week's stored suggestions. */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  if (!hasAnthropicKey()) return NextResponse.json({ error: "missing_key", key: "ANTHROPIC_API_KEY" }, { status: 503 });

  const body = await req.json().catch(() => null);
  const q = typeof body?.q === "string" ? body.q.trim().slice(0, 300) : "";
  if (q.length < 2) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  try {
    if (!(await allow(user.id))) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    const subscriptions = await getSubscriptions(user.id, user.region);
    const [catalogue, data] = await Promise.all([
      getCatalogue(user.region, subscriptions.map((s) => s.id)),
      getUserData(user.id),
    ]);
    const hidden = new Set(
      (Array.isArray(data.hidden) ? data.hidden : []).map((h: { key?: unknown }) => String(h?.key)),
    );
    const pool = catalogue.results.filter((s) => !hidden.has(s.key));
    return NextResponse.json(await ask(q, pool, catalogue.covered));
  } catch (e) {
    if (e instanceof AskError || e instanceof SyntaxError) {
      return NextResponse.json({ error: "not_understood" }, { status: 422 });
    }
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "busy" }, { status: 503 });
    return errorResponse(e);
  }
}
