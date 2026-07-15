"use client";

import { useEffect, useState } from "react";
import { useSupabaseClient } from "@/lib/realtime";
import type { Session } from "@/lib/supabase/types";

const POLL_MS = 4000;

// Guests/screen resolve a venue by slug rather than session id, so that
// when the DJ ends a session (which opens a new one under the same slug)
// their view picks up the new session automatically. Polls alongside
// Realtime as a fallback — see the comment in lib/realtime.ts.
export function useOpenSessionBySlug(venueSlug: string, initial: Session | null): Session | null {
  const supabase = useSupabaseClient();
  const [session, setSession] = useState<Session | null>(initial);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      const { data } = await supabase.rpc("get_open_session", { p_venue_slug: venueSlug });
      if (!cancelled) setSession((data as Session | null) ?? null);
    }

    if (!initial) refresh();

    const channel = supabase
      .channel(`sessions:slug:${venueSlug}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions", filter: `venue_slug=eq.${venueSlug}` },
        () => refresh()
      )
      .subscribe();

    const interval = setInterval(refresh, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, venueSlug]);

  return session;
}
