"use client";

import { useEffect, useMemo, useState } from "react";
import { useSupabaseClient, useTableRows } from "@/lib/realtime";
import { useOpenSessionBySlug } from "@/lib/session";
import { sortQueue } from "@/lib/queue";
import { QrCode } from "@/components/QrCode";
import type { Session, QueueItem } from "@/lib/supabase/types";

export function ScreenView({
  venueSlug,
  initialSession,
}: {
  venueSlug: string;
  initialSession: Session;
}) {
  const supabase = useSupabaseClient();
  const session = useOpenSessionBySlug(venueSlug, initialSession);
  const [queueItems] = useTableRows<QueueItem>("queue_items", "session_id", session?.id ?? null);
  const [stats, setStats] = useState({ req_total: initialSession.req_total, voters: 0 });
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    // window is unavailable during the server render of this client
    // component, so the guest URL can only be read after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    async function refresh() {
      const { data } = await supabase.rpc("get_session_public_stats", { p_session_id: session!.id });
      const row = Array.isArray(data) ? data[0] : data;
      if (!cancelled && row) setStats(row);
    }
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [supabase, session]);

  const upNext = useMemo(
    () => (session ? sortQueue(queueItems, session.order_mode)[0] : undefined),
    [queueItems, session]
  );

  if (!session) return null;

  const guestUrl = origin ? `${origin.replace(/^https?:\/\//, "")}/${venueSlug}` : `/${venueSlug}`;

  return (
    <div className="flex min-h-dvh flex-col overflow-hidden bg-bg text-text">
      <div className="flex items-center justify-between px-[clamp(20px,4vw,40px)] pt-[clamp(16px,3vh,28px)]">
        <div className="text-[clamp(14px,1.6vw,18px)] font-bold tracking-[.06em]">SPINQ</div>
        <div className="flex items-center gap-2 text-[clamp(11px,1.3vw,14px)] text-text-2">
          <div
            className="h-2 w-2 rounded-full"
            style={{ background: session.is_live ? "var(--accent)" : "rgba(255,255,255,.3)" }}
          />
          {session.is_live ? "Requests are open" : "Requests are closed"}
        </div>
      </div>

      {session.is_live ? (
        <div className="flex flex-1 items-center gap-12 px-[clamp(20px,4vw,40px)]">
          <div className="flex flex-1 flex-col gap-3.5">
            <div className="text-[clamp(11px,1.1vw,14px)] font-semibold tracking-[.18em] text-accent">
              NOW PLAYING
            </div>
            <div className="text-[clamp(28px,5.8vw,56px)] font-bold leading-[1.05] tracking-[-.01em]">
              {session.now_title ?? "Nothing yet"}
            </div>
            <div className="text-[clamp(14px,2.3vw,22px)] text-text-2">
              {session.now_artist ?? "Requests will appear here once the DJ hits play"}
            </div>
            {upNext && (
              <div className="mt-2.5 flex items-center gap-3.5 text-[clamp(12px,1.5vw,15px)] text-text-2">
                <span className="text-[clamp(10px,1.2vw,12px)] font-semibold tracking-[.14em] text-text-4">
                  UP NEXT
                </span>
                {upNext.title} · {upNext.artist} <span className="text-accent">▲ {upNext.votes}</span>
              </div>
            )}
          </div>
          <div className="flex flex-col items-center gap-3 rounded-[20px] bg-surface p-[clamp(16px,2.7vw,26px)]">
            <QrCode value={`https://${guestUrl}`} size={150} />
            <div className="text-[clamp(12px,1.5vw,15px)] font-semibold">Scan to request a song</div>
            <div className="text-[clamp(10px,1.3vw,12.5px)] text-text-3">{guestUrl}</div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-20 text-center">
          <div className="text-[clamp(24px,4.6vw,44px)] font-bold leading-[1.1]">
            Requests open when the DJ goes live
          </div>
          <div className="text-[clamp(13px,1.9vw,18px)] text-text-2">
            Keep this page — the request line opens right here.
          </div>
        </div>
      )}

      <div className="flex items-center gap-2.5 px-[clamp(20px,4vw,40px)] pb-[clamp(16px,3vh,26px)] text-[clamp(11px,1.4vw,13px)] text-text-3">
        {session.is_live && (
          <>
            <div className="h-1.5 w-1.5 rounded-full bg-accent" />
            Tonight: {stats.req_total} requests · {stats.voters} people voting
          </>
        )}
        {!session.is_live && `${session.venue_name}`}
      </div>
    </div>
  );
}
