---
name: add-api-route
description: Add a new server endpoint under app/api in WatchNext following the repo's auth, validation and error-handling pattern. Use when a feature needs a new API route.
---

# Add an API route

Create `app/api/<name>/route.ts`. Model it on `app/api/search/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/api";
import { currentUser } from "@/lib/auth";

/** One line saying what this endpoint is for. */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim().slice(0, 100) ?? "";
  // validate everything; return 400 { error: "bad_request" } on bad input

  try {
    return NextResponse.json(await doTheWork(q, user.region));
  } catch (e) {
    return errorResponse(e); // 503 for missing API keys, 502 for upstream failures
  }
}
```

Checklist:
- Logic lives in `lib/`, in a module starting with `import "server-only"` if it touches keys or the DB. The route stays thin.
- Validate input with helpers in `lib/validate.ts` / `lib/api.ts` (`isRegion`, `cleanServices`); add a new helper there rather than inline ad-hoc checks if it'll be reused.
- For `POST`/`PUT`, parse with `await req.json().catch(() => null)` and validate the shape; cap sizes.
- DB access via `const sql = await db()` and tagged templates only. New tables/columns go in `migrate()` in `lib/db.ts`.
- If the browser calls it, add a small typed fetch helper next to the existing ones (see `lib/titleFetch.ts`) rather than calling `fetch` inline in components.
- API responses must never be cached by `public/sw.js` (it already skips `/api/`); don't change that.
- Finish with `npm run lint && npm run build`, then hit the route in `npm run dev` signed in and signed out (expect 401).
