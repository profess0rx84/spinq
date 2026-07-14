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

// Public, no-key iTunes Search API. Falls back to the mock catalog on
// failure (offline network, blocked request, etc). Production should swap
// this for Apple MusicKit or the Spotify Web API — see README.
export async function searchAppleMusic(query: string): Promise<CatalogSong[] | null> {
  try {
    const res = await fetch(
      "https://itunes.apple.com/search?media=music&entity=song&limit=8&term=" +
        encodeURIComponent(query)
    );
    const json = await res.json();
    return json.results.map((t: { trackName: string; artistName: string; artworkUrl100?: string }) => ({
      title: t.trackName,
      artist: t.artistName,
      art: t.artworkUrl100,
    }));
  } catch {
    return null;
  }
}
