"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSupabaseClient, useTableRows } from "@/lib/realtime";
import { useOpenSessionBySlug } from "@/lib/session";
import { ensureGuestId } from "@/lib/guest";
import { sortQueue } from "@/lib/queue";
import { todayLabel, timeLabel } from "@/lib/format";
import { mockResults, searchAppleMusic, type CatalogSong } from "@/lib/itunes";
import { venmoLink, cashAppLink } from "@/lib/payments";
import { EqBars } from "@/components/EqBars";
import { Toast } from "@/components/Toast";
import type { Session, QueueItem, Vote, Notification } from "@/lib/supabase/types";

type Picked = CatalogSong;

export function GuestApp({
  venueSlug,
  initialSession,
}: {
  venueSlug: string;
  initialSession: Session;
}) {
  const supabase = useSupabaseClient();
  const session = useOpenSessionBySlug(venueSlug, initialSession);
  const [guestId, setGuestId] = useState<string | null>(null);

  useEffect(() => {
    ensureGuestId().then(setGuestId);
  }, []);

  const [payHandles, setPayHandles] = useState<{ venmo_handle: string | null; cashapp_handle: string | null }>({
    venmo_handle: null,
    cashapp_handle: null,
  });

  useEffect(() => {
    let cancelled = false;
    supabase.rpc("get_payment_handles", { p_venue_slug: venueSlug }).then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : data;
      if (!cancelled && row) setPayHandles(row);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, venueSlug]);

  const [queueItems, refetchQueue] = useTableRows<QueueItem>("queue_items", "session_id", session?.id ?? null);
  const [votes, refetchVotes] = useTableRows<Vote>("votes", "session_id", session?.id ?? null);
  const [notifications, refetchNotifications] = useTableRows<Notification>("notifications", "guest_id", guestId, {
    column: "created_at",
    ascending: false,
  });

  const [notifOpen, setNotifOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [apiResults, setApiResults] = useState<CatalogSong[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [sel, setSel] = useState<Picked | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualArtist, setManualArtist] = useState("");
  const [dedication, setDedication] = useState("");
  const [tip, setTip] = useState(0);
  const [customTipOpen, setCustomTipOpen] = useState(false);
  const [customTipValue, setCustomTipValue] = useState("");
  const [pay, setPay] = useState<"Venmo" | "Cash App">("Venmo");
  const [toast, setToast] = useState("");
  const [sending, setSending] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function showToast(msg: string) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }

  const unread = notifications.filter((n) => !n.read).length;

  async function toggleNotifs() {
    const opening = !notifOpen;
    setNotifOpen(opening);
    if (opening && guestId) {
      await supabase.from("notifications").update({ read: true }).eq("guest_id", guestId).eq("read", false);
      refetchNotifications();
    }
  }

  const votedIds = useMemo(
    () => new Set(votes.filter((v) => v.guest_id === guestId).map((v) => v.queue_item_id)),
    [votes, guestId]
  );

  const sortedQueue = useMemo(
    () => (session ? sortQueue(queueItems, session.order_mode) : []),
    [queueItems, session]
  );

  async function onVote(item: QueueItem) {
    if (!session || !guestId) return;
    await supabase.rpc("toggle_vote", {
      p_session_id: session.id,
      p_queue_item_id: item.id,
      p_guest_id: guestId,
    });
    refetchQueue();
    refetchVotes();
  }

  function openSheet() {
    setSheetOpen(true);
    setSearch("");
    setApiResults(null);
    setSel(null);
    setManualOpen(false);
    setManualTitle("");
    setManualArtist("");
    setDedication("");
    setTip(0);
    setCustomTipOpen(false);
    setCustomTipValue("");
  }
  function useManualEntry() {
    const title = manualTitle.trim();
    const artist = manualArtist.trim();
    if (!title || !artist) return;
    setSel({ title, artist });
    setManualOpen(false);
  }
  function closeSheet() {
    setSheetOpen(false);
  }

  function onSearchChange(value: string) {
    setSearch(value);
    clearTimeout(searchTimer.current);
    const q = value.trim();
    if (!q) {
      setApiResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      const results = await searchAppleMusic(q);
      if (search.trim() !== q) return;
      setSearching(false);
      setApiResults(results);
    }, 350);
  }

  const hasQuery = search.trim().length > 0;
  const results = apiResults != null ? apiResults : hasQuery ? mockResults(search) : [];
  const searchHint = apiResults != null ? "Apple Music catalog" : "Suggestions";

  function openPaymentIfNeeded() {
    if (tip <= 0) return;
    if (pay === "Venmo" && payHandles.venmo_handle) {
      window.open(venmoLink(payHandles.venmo_handle, tip, sel ? `${sel.title} — ${sel.artist}` : "song request"), "_blank");
    } else if (pay === "Cash App" && payHandles.cashapp_handle) {
      window.open(cashAppLink(payHandles.cashapp_handle, tip), "_blank");
    }
  }

  async function sendRequest() {
    if (!sel || !session || !guestId || sending) return;
    setSending(true);
    try {
      const { data: status, error } = await supabase.rpc("submit_request", {
        p_session_id: session.id,
        p_title: sel.title,
        p_artist: sel.artist,
        p_art_url: sel.art ?? null,
        p_guest_id: guestId,
        p_requester_name: "Guest",
        p_tip: tip,
        p_pay_method: pay,
        p_note: dedication.trim(),
      });
      if (error) {
        if (error.message.includes("rate_limited")) {
          showToast("You've got 2 requests waiting already — hang tight for the DJ");
        } else {
          showToast("Couldn't send that — try again");
        }
        return;
      }
      setSheetOpen(false);
      if (status === "queued_vote") {
        showToast("Already in the queue — we added your vote ▲");
        refetchQueue();
        refetchVotes();
      } else if (status === "merged_pending") {
        showToast("Someone beat you to it — we bumped that request ✓");
        openPaymentIfNeeded();
      } else {
        showToast("Request sent — waiting for the DJ ✓");
        openPaymentIfNeeded();
      }
    } finally {
      setSending(false);
    }
  }

  if (!session) return null;

  const artUrl300 = sel?.art ? sel.art.replace("100x100", "300x300") : null;

  return (
    <div className="relative mx-auto flex min-h-dvh max-w-md flex-col overflow-hidden bg-bg text-text">
      <div className="flex items-center justify-between px-5 pt-3">
        <div className="text-[20px] font-bold tracking-[.04em]">SPINQ</div>
        <div className="flex items-center gap-2.5">
          <div className="text-[12px] text-text-2">
            {session.venue_name} · {todayLabel()}
          </div>
          <div
            onClick={toggleNotifs}
            className="relative flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-full bg-surface text-[15px]"
          >
            🔔
            {unread > 0 && (
              <div className="absolute -right-[3px] -top-[3px] flex h-4 min-w-4 items-center justify-center rounded-lg bg-accent px-1 text-[10px] font-bold text-on-accent">
                {unread}
              </div>
            )}
          </div>
        </div>
      </div>

      {notifOpen && (
        <div className="absolute left-5 right-5 top-14 z-10 flex flex-col overflow-hidden rounded-[14px] border border-border-2 bg-surface-2 shadow-[0_12px_40px_rgba(0,0,0,.6)]">
          <div className="flex items-center justify-between border-b border-border px-3.5 py-3">
            <div className="text-[12px] font-semibold tracking-[.1em] text-text-2">NOTIFICATIONS</div>
            <div onClick={toggleNotifs} className="cursor-pointer text-[12px] text-text-3">
              close
            </div>
          </div>
          {notifications.length === 0 && (
            <div className="p-[22px] text-center text-[12.5px] text-text-3">Nothing yet — request a song!</div>
          )}
          {notifications.slice(0, 20).map((n) => (
            <div key={n.id} className="flex items-baseline gap-2.5 border-b border-white/5 px-3.5 py-[11px]">
              <div className="flex-1 text-[13px] leading-[1.4]">{n.message}</div>
              <div className="flex-none text-[11px] text-text-4">{timeLabel(n.created_at)}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mx-5 mt-3.5 flex flex-col gap-2.5 rounded-2xl bg-surface p-4">
        <div className="flex items-center gap-2">
          <EqBars size="md" active={!!session.now_title} />
          <div className="text-[11px] font-semibold tracking-[.12em] text-accent">NOW PLAYING</div>
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="text-[17px] font-semibold">{session.now_title ?? "Nothing yet"}</div>
          <div className="text-[12.5px] text-text-2">
            {session.now_artist ?? "Requests will show up here once the DJ hits play"}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto px-5 pt-3.5">
        <div className="flex items-baseline justify-between pb-2">
          <div className="text-[11px] font-semibold tracking-[.12em] text-text-3">UP NEXT</div>
          <div className="text-[11px] text-text-4">tap ▲ to vote</div>
        </div>
        {sortedQueue.length === 0 && (
          <div className="py-[26px] text-center text-[13px] text-text-3">Queue is empty — request something!</div>
        )}
        {sortedQueue.map((q) => {
          const voted = votedIds.has(q.id);
          return (
            <div key={q.id} className="flex items-center gap-3 border-b border-border py-3">
              <div
                onClick={() => onVote(q)}
                className="flex w-[34px] cursor-pointer flex-col items-center gap-0.5 rounded-[10px] border py-[7px]"
                style={{
                  background: voted ? "var(--accent-12)" : "transparent",
                  borderColor: voted ? "var(--accent-50)" : "var(--border-2)",
                  color: voted ? "var(--accent)" : "rgba(255,255,255,.7)",
                }}
              >
                <div className="text-[11px]">▲</div>
                <div className="text-[12px] font-bold">{q.votes}</div>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="truncate text-[15px] font-medium">{q.title}</div>
                <div className="text-[12px] text-text-2">{q.artist}</div>
              </div>
              {q.boosted && (
                <div className="rounded-md bg-accent-15 px-2 py-1 text-[10.5px] font-bold tracking-[.06em] text-accent">
                  BOOSTED
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-5 pb-[18px] pt-3">
        {session.is_live ? (
          <div
            onClick={openSheet}
            className="cursor-pointer rounded-[14px] bg-accent py-[15px] text-center text-[15px] font-bold text-on-accent"
          >
            + Request a song
          </div>
        ) : (
          <div className="flex flex-col gap-1 rounded-[14px] bg-surface px-4 py-3.5 text-center">
            <div className="text-[14px] font-semibold text-white/75">Requests are closed</div>
            <div className="text-[12px] leading-[1.5] text-text-3">
              They&apos;ll open right here when the DJ goes live — keep browsing the queue and voting.
            </div>
          </div>
        )}
      </div>

      {sheetOpen && (
        <div className="absolute inset-0 flex flex-col bg-bg pt-[54px]">
          <div className="flex items-center justify-between px-5 pb-3 pt-1.5">
            <div className="text-[17px] font-bold">Request a song</div>
            <div
              onClick={closeSheet}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-surface text-[14px] text-white/60"
            >
              ✕
            </div>
          </div>
          <div className="px-5 pb-3">
            <div className="flex items-center gap-2.5 rounded-[14px] border border-accent-35 bg-surface-2 px-3.5 py-3">
              <span className="text-[14px] text-text-3">⌕</span>
              <input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Song or artist"
                className="flex-1 bg-transparent text-[15px] text-text"
              />
            </div>
          </div>

          {!sel && (
            <div className="min-h-0 flex-1 overflow-auto px-5">
              {hasQuery && (
                <div className="flex items-center justify-between pb-1.5 pt-0.5">
                  <div className="text-[10.5px] font-semibold uppercase tracking-[.12em] text-text-4">
                    {searchHint}
                  </div>
                  {searching && <div className="text-[11px] text-accent">searching…</div>}
                </div>
              )}
              {results.map((song, i) => (
                <div
                  key={i}
                  onClick={() => setSel(song)}
                  className="flex cursor-pointer items-center gap-3 border-b border-border py-[11px]"
                >
                  {song.art ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={song.art} alt="" width={44} height={44} className="rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-surface-2 font-mono text-[11px] text-text-4">
                      {song.title.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="text-[15px] font-medium">{song.title}</div>
                    <div className="text-[12px] text-text-2">{song.artist}</div>
                  </div>
                  <div className="rounded-full bg-white/10 px-3.5 py-2 text-[12.5px] font-semibold">Pick</div>
                </div>
              ))}
              {hasQuery && results.length === 0 && !searching && (
                <div className="py-[26px] text-center text-[13px] text-text-3">No matches — try another search</div>
              )}
              {hasQuery && !manualOpen && (
                <div
                  onClick={() => {
                    setManualOpen(true);
                    setManualTitle(search);
                  }}
                  className="cursor-pointer py-3 text-center text-[12px] text-accent"
                >
                  Can&apos;t find it? Enter it manually
                </div>
              )}
              {manualOpen && (
                <div className="mt-1 flex flex-col gap-2.5 rounded-[14px] bg-surface p-3.5">
                  <input
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    placeholder="Song title"
                    autoFocus
                    className="rounded-[10px] bg-bg px-3 py-2.5 text-[13.5px] text-text placeholder:text-text-4"
                  />
                  <input
                    value={manualArtist}
                    onChange={(e) => setManualArtist(e.target.value)}
                    placeholder="Artist"
                    className="rounded-[10px] bg-bg px-3 py-2.5 text-[13.5px] text-text placeholder:text-text-4"
                  />
                  <div className="flex gap-2">
                    <div
                      onClick={() => setManualOpen(false)}
                      className="flex-1 cursor-pointer rounded-[10px] border border-border-2 py-2.5 text-center text-[13px] text-white/60"
                    >
                      Cancel
                    </div>
                    <div
                      onClick={useManualEntry}
                      className="flex-1 cursor-pointer rounded-[10px] bg-accent py-2.5 text-center text-[13px] font-bold text-on-accent"
                      style={{ opacity: manualTitle.trim() && manualArtist.trim() ? 1 : 0.5 }}
                    >
                      Use this
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {sel && (
            <div className="flex flex-1 flex-col justify-end px-5 pb-[18px]">
              <div className="flex flex-col gap-3 rounded-[18px] bg-surface p-[18px]">
                <div className="flex items-center gap-3.5">
                  {artUrl300 ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={artUrl300}
                      alt=""
                      width={84}
                      height={84}
                      className="flex-none rounded-xl object-cover shadow-[0_6px_24px_rgba(0,0,0,.5)]"
                    />
                  ) : (
                    <div className="flex h-[84px] w-[84px] flex-none items-center justify-center rounded-xl bg-surface-2 font-mono text-[13px] text-text-4">
                      {sel.title.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <div className="text-[16px] font-semibold leading-[1.25]">{sel.title}</div>
                    <div className="text-[13px] text-text-2">{sel.artist}</div>
                  </div>
                  <div onClick={() => setSel(null)} className="cursor-pointer self-start text-[12px] text-text-3">
                    change
                  </div>
                </div>
                <input
                  value={dedication}
                  onChange={(e) => setDedication(e.target.value)}
                  placeholder="Add a dedication (optional)"
                  className="rounded-[10px] bg-bg px-3 py-3 text-[13.5px] text-text"
                />
                <div className="flex gap-2">
                  {[
                    { label: "No tip", v: 0 },
                    { label: "$2", v: 2 },
                    { label: "$5 · Boost", v: 5 },
                  ].map((t) => {
                    const on = !customTipOpen && tip === t.v;
                    return (
                      <div
                        key={t.v}
                        onClick={() => {
                          setCustomTipOpen(false);
                          setTip(t.v);
                        }}
                        className="flex-1 cursor-pointer rounded-[10px] border py-2.5 text-center text-[13px]"
                        style={{
                          borderColor: on ? "var(--accent)" : "var(--border-2)",
                          background: on ? "var(--accent-12)" : "transparent",
                          color: on ? "var(--accent)" : "rgba(255,255,255,.7)",
                          fontWeight: on ? 600 : 400,
                        }}
                      >
                        {t.label}
                      </div>
                    );
                  })}
                  <div
                    onClick={() => {
                      setCustomTipOpen(true);
                      setCustomTipValue(tip > 0 ? String(tip) : "");
                    }}
                    className="flex-1 cursor-pointer rounded-[10px] border py-2.5 text-center text-[13px]"
                    style={{
                      borderColor: customTipOpen ? "var(--accent)" : "var(--border-2)",
                      background: customTipOpen ? "var(--accent-12)" : "transparent",
                      color: customTipOpen ? "var(--accent)" : "rgba(255,255,255,.7)",
                      fontWeight: customTipOpen ? 600 : 400,
                    }}
                  >
                    Custom
                  </div>
                </div>
                {customTipOpen && (
                  <div className="flex items-center gap-2 rounded-[10px] bg-bg px-3 py-1">
                    <span className="text-[14px] text-text-2">$</span>
                    <input
                      value={customTipValue}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, "");
                        setCustomTipValue(raw);
                        setTip(raw ? parseInt(raw, 10) : 0);
                      }}
                      inputMode="numeric"
                      placeholder="Enter amount"
                      autoFocus
                      className="flex-1 bg-transparent py-2.5 text-[13.5px] text-text placeholder:text-text-4"
                    />
                  </div>
                )}
                {tip > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="text-[12px] text-text-2">Pay with</div>
                    {(["Venmo", "Cash App"] as const).map((p) => {
                      const on = pay === p;
                      return (
                        <div
                          key={p}
                          onClick={() => setPay(p)}
                          className="flex-1 cursor-pointer rounded-[10px] border py-[9px] text-center text-[12.5px]"
                          style={{
                            borderColor: on ? "var(--accent)" : "var(--border-2)",
                            background: on ? "var(--accent-12)" : "transparent",
                            color: on ? "var(--accent)" : "rgba(255,255,255,.7)",
                            fontWeight: on ? 600 : 400,
                          }}
                        >
                          {p}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="text-center text-[11px] text-text-3">
                  $5 boosts your song toward the top · tips go straight to the DJ
                </div>
                <div
                  onClick={sendRequest}
                  className="cursor-pointer rounded-xl bg-accent py-3.5 text-center text-[15px] font-bold text-on-accent"
                >
                  {sending ? "Sending…" : tip ? `Send request · $${tip}` : "Send request"}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <Toast message={toast || null} />
    </div>
  );
}
