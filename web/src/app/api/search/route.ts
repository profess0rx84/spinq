import { NextRequest, NextResponse } from "next/server";

// Server-side proxy for Spotify's search API. Runs on the server (not the
// browser) for two reasons: it needs the app's client secret, which can
// never be exposed to guests, and it avoids CORS entirely.
//
// Spotify's Client Credentials flow issues a token good for ~1 hour; we
// cache it in module scope so repeated searches don't re-auth every time.
// This is per-serverless-instance, not shared across instances, but that's
// fine — worst case is a few extra token requests, well under Spotify's
// rate limits.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Spotify credentials not configured");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Spotify auth failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  cachedToken = { value: json.access_token, expiresAt: Date.now() + (json.expires_in - 60) * 1000 };
  return cachedToken.value;
}

export async function GET(req: NextRequest) {
  const term = req.nextUrl.searchParams.get("term")?.trim();
  if (!term) return NextResponse.json({ results: [] });

  try {
    const token = await getAccessToken();
    const res = await fetch(
      "https://api.spotify.com/v1/search?type=track&limit=8&q=" + encodeURIComponent(term),
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      return NextResponse.json({ error: `spotify lookup failed: ${res.status} ${await res.text()}` }, { status: 502 });
    }
    const json = await res.json();
    return NextResponse.json(json, { headers: { "Cache-Control": "s-maxage=300" } });
  } catch (e) {
    console.error("search route failed", e);
    return NextResponse.json({ error: "spotify lookup failed", detail: String(e) }, { status: 502 });
  }
}
