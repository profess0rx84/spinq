import { NextRequest, NextResponse } from "next/server";

// Server-side proxy for the iTunes Search API. The browser can't always
// call itunes.apple.com directly (it doesn't reliably send CORS headers,
// which mobile Safari in particular enforces strictly), so this route
// makes the request from the server instead, where CORS doesn't apply.
export async function GET(req: NextRequest) {
  const term = req.nextUrl.searchParams.get("term")?.trim();
  if (!term) return NextResponse.json({ results: [] });

  const res = await fetch(
    "https://itunes.apple.com/search?media=music&entity=song&limit=8&term=" +
      encodeURIComponent(term),
    { headers: { "User-Agent": "SPINQ/1.0" } }
  );
  if (!res.ok) {
    return NextResponse.json({ error: "itunes lookup failed" }, { status: 502 });
  }
  const json = await res.json();
  return NextResponse.json(json, { headers: { "Cache-Control": "s-maxage=300" } });
}
