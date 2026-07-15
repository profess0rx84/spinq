export type CatalogSong = { title: string; artist: string; art?: string };

const MOCK_CATALOG: CatalogSong[] = [
  { title: "Glass", artist: "Animal Collective" },
  { title: "Heat Waves", artist: "Glass Animals" },
  { title: "One More Time", artist: "Daft Punk" },
  { title: "Da Funk", artist: "Daft Punk" },
  { title: "Around the World", artist: "Daft Punk" },
  { title: "Blinding Lights", artist: "The Weeknd" },
  { title: "Levitating", artist: "Dua Lipa" },
  { title: "Dance Yrself Clean", artist: "LCD Soundsystem" },
  { title: "Midnight City", artist: "M83" },
  { title: "Groove Is in the Heart", artist: "Deee-Lite" },
  { title: "Everybody Dance", artist: "CHIC" },
  { title: "On the Floor", artist: "Jennifer Lopez" },
];

export function mockResults(query: string): CatalogSong[] {
  const q = query.trim().toLowerCase();
  if (!q) return MOCK_CATALOG.slice(0, 6);
  return MOCK_CATALOG.filter((c) => (c.title + " " + c.artist).toLowerCase().includes(q));
}

// Public, no-key iTunes Search API, called through our own /api/search
// route rather than directly from the browser — itunes.apple.com doesn't
// reliably send CORS headers, which mobile Safari enforces strictly and
// silently fails the fetch. Falls back to the mock catalog on failure
// (offline network, etc). Spotify's Web API was tried as a swap-in but
// requires the developer account to have Spotify Premium to call the
// Web API at all — revisit if that changes.
export async function searchAppleMusic(query: string): Promise<CatalogSong[] | null> {
  try {
    const res = await fetch("/api/search?term=" + encodeURIComponent(query));
    if (!res.ok) return null;
    const json = await res.json();
    if (!Array.isArray(json.results)) return null;
    return json.results.map((t: { trackName: string; artistName: string; artworkUrl100?: string }) => ({
      title: t.trackName,
      artist: t.artistName,
      art: t.artworkUrl100,
    }));
  } catch {
    return null;
  }
}
