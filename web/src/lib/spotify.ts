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

type SpotifyTrack = {
  name: string;
  artists: { name: string }[];
  album: { images: { url: string }[] };
};

// Spotify Web API search, called through our own /api/search route since
// it needs a server-held client secret. Falls back to the mock catalog on
// failure (offline network, missing credentials, etc).
export async function searchSpotify(query: string): Promise<CatalogSong[] | null> {
  try {
    const res = await fetch("/api/search?term=" + encodeURIComponent(query));
    if (!res.ok) return null;
    const json = await res.json();
    const tracks = json?.tracks?.items;
    if (!Array.isArray(tracks)) return null;
    return tracks.map((t: SpotifyTrack) => ({
      title: t.name,
      artist: t.artists.map((a) => a.name).join(", "),
      art: t.album.images[0]?.url,
    }));
  } catch {
    return null;
  }
}
