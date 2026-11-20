import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { getUserData, isUserDataKey, MAX_USER_DATA_BYTES, setUserData } from "@/lib/userData";

/** The signed-in account's saved favourites, hidden titles and filters. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  return NextResponse.json(await getUserData(user.id));
}

/** Save one of them. Body: { key: "seeds" | "hidden" | "filters", value } */
export async function PUT(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const raw = await req.text();
  if (raw.length > MAX_USER_DATA_BYTES + 100) return NextResponse.json({ error: "too_large" }, { status: 413 });
  let body: { key?: unknown; value?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  if (!isUserDataKey(body.key)) return NextResponse.json({ error: "bad_key" }, { status: 400 });
  if (body.value === undefined) return NextResponse.json({ error: "missing_value" }, { status: 400 });
  await setUserData(user.id, body.key, body.value);
  return NextResponse.json({ ok: true });
}
