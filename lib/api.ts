import "server-only";
import { NextResponse } from "next/server";
import { MissingKeyError } from "./tmdb";

export function isRegion(r: unknown): r is string {
  return typeof r === "string" && /^[A-Z]{2}$/.test(r);
}

export function errorResponse(err: unknown) {
  if (err instanceof MissingKeyError) {
    return NextResponse.json({ error: "missing_key", key: err.key }, { status: 503 });
  }
  console.error(err);
  return NextResponse.json({ error: "upstream", message: String(err) }, { status: 502 });
}
