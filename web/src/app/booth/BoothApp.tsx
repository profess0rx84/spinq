"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSupabaseClient, useTableRow, useTableRows } from "@/lib/realtime";
import { sortQueue } from "@/lib/queue";
import { todayLabel, relativeLabel, dateLabel } from "@/lib/format";
import { EqBars } from "@/components/EqBars";
import { SectionLabel } from "@/components/SectionLabel";
import { QrCode } from "@/components/QrCode";
import { cleanHandle } from "@/lib/payments";
import type {
  DjProfile,
  Session,
  SessionTips,
  QueueItem,
  IncomingRequest,
  PlayedItem,
  SessionHistoryRow,
} from "@/lib/supabase/types";

export function BoothApp({ profile, initialSession }: { profile: DjProfile; initialSession: Session }) {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const [currentSessionId, setCurrentSessionId] = useState(initialSession.id);
  const [session, refetchSession] = useTableRow<Session>("sessions", currentSessionId, initialSession);
  const [tips, refetchTips] = useTableRow<SessionTips>("session_tips", currentSessionId, null, "session_id");
  const [incoming, refetchIncoming] = useTableRows<IncomingRequest>("incoming_requests", "session_id", currentSessionId, {
    column: "created_at",
    ascending: false,
  });
  const [queueItems, refetchQueue] = useTableRows<QueueItem>("queue_items", "session_id", currentSessionId);
  const [playedItems, refetchPlayed] = useTableRows<PlayedItem>("played_items", "session_id", currentSessionId, {
    column: "played_at",
    ascending: false,
  });

  const [view, setView] = useState<"tonight" | "history">("tonight");
  const [history, setHistory] = useState<SessionHistoryRow[]>([]);
  const [venueName, setVenueName] = useState(initialSession.venue_name);
  const [venueNameSessionId, setVenueNameSessionId] = useState(currentSessionId);
  const venueTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Local editable copy of the venue name resets when the booth switches to
  // a different session (e.g. "End session" opens a fresh one) — adjusted
  // during render rather than an effect, see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (currentSessionId !== venueNameSessionId) {
    setVenueNameSessionId(currentSessionId);
    setVenueName(session?.venue_name ?? "");
  }

  useEffect(() => {
    let cancelled = false;
    supabase.rpc("get_session_history", { p_dj_id: profile.id }).then(({ data }) => {
      if (!cancelled && data) setHistory(data);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, profile.id, currentSessionId]);

  async function deleteHistorySession(sessionId: string) {
    if (!window.confirm("Delete this session permanently? This can't be undone.")) return;
    await supabase.rpc("delete_session", { p_session_id: sessionId });
    const { data } = await supabase.rpc("get_session_history", { p_dj_id: profile.id });
    if (data) setHistory(data);
  }

  function onVenueNameChange(value: string) {
    setVenueName(value);
    clearTimeout(venueTimer.current);
    venueTimer.current = setTimeout(() => {
      supabase.rpc("set_venue_name", { p_session_id: currentSessionId, p_venue_name: value });
    }, 400);
  }

  const sortedQueue = useMemo(
    () => (session ? sortQueue(queueItems, session.order_mode) : []),
    [queueItems, session]
  );

  async function goLive(live: boolean) {
    await supabase.rpc("set_live", { p_session_id: currentSessionId, p_live: live });
    refetchSession();
  }
  async function toggleChime() {
    if (!session) return;
    await supabase.rpc("set_chime", { p_session_id: currentSessionId, p_enabled: !session.chime_enabled });
    refetchSession();
  }
  async function accept(id: string) {
    await supabase.rpc("accept_request", { p_request_id: id });
    refetchIncoming();
    refetchQueue();
    refetchTips();
  }
  async function decline(id: string) {
    await supabase.rpc("decline_request", { p_request_id: id });
    refetchIncoming();
  }
  async function toggleNote(id: string) {
    await supabase.rpc("toggle_note_approval", { p_request_id: id });
    refetchIncoming();
  }
  async function moveQueue(id: string, direction: "up" | "down") {
    await supabase.rpc("reorder_queue", { p_session_id: currentSessionId, p_queue_item_id: id, p_direction: direction });
    refetchQueue();
    refetchSession();
  }
  async function playItem(id: string) {
    await supabase.rpc("play_next", { p_session_id: currentSessionId, p_queue_item_id: id });
    refetchQueue();
    refetchPlayed();
    refetchSession();
  }
  async function removeFromQueue(id: string) {
    await supabase.rpc("remove_queue_item", { p_queue_item_id: id });
    refetchQueue();
  }
  async function autoSort() {
    await supabase.rpc("autosort_queue", { p_session_id: currentSessionId });
    refetchSession();
  }
  async function endSession() {
    const { data: newId } = await supabase.rpc("end_session", { p_session_id: currentSessionId });
    if (newId) {
      setCurrentSessionId(newId);
      setView("history");
    }
  }
  async function signOut() {
    await supabase.auth.signOut();
    router.push("/booth/login");
    router.refresh();
  }

  const [linkOpen, setLinkOpen] = useState(false);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // window is unavailable during the server render of this client
    // component, so the guest URL can only be read after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);

  const guestPath = session ? `/${session.venue_slug}` : "";
  const guestUrl = origin ? `${origin}${guestPath}` : guestPath;
  const guestUrlDisplay = guestUrl.replace(/^https?:\/\//, "");

  function copyGuestLink() {
    navigator.clipboard.writeText(guestUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const [payOpen, setPayOpen] = useState(false);
  const [venmoHandle, setVenmoHandle] = useState(profile.venmo_handle ?? "");
  const [cashHandle, setCashHandle] = useState(profile.cashapp_handle ?? "");
  const [paySaved, setPaySaved] = useState(false);

  async function savePaymentHandles() {
    const venmo = cleanHandle(venmoHandle);
    const cash = cleanHandle(cashHandle);
    setVenmoHandle(venmo);
    setCashHandle(cash);
    await supabase
      .from("dj_profiles")
      .update({ venmo_handle: venmo || null, cashapp_handle: cash || null })
      .eq("id", profile.id);
    setPaySaved(true);
    setTimeout(() => setPaySaved(false), 2000);
  }

  if (!session) return null;
  const live = session.is_live;

  return (
    <div className="flex h-screen flex-col bg-bg text-text">
      {/* Header row 1 */}
      <div className="flex items-center gap-[18px] border-b border-border px-6 py-3.5">
        <div className="text-[17px] font-bold tracking-[.04em]">
          SPINQ <span className="font-normal text-text-3">Booth</span>
        </div>
        <div className="flex items-center rounded-[11px] bg-surface p-[3px]">
          <div
            onClick={() => goLive(true)}
            className="flex cursor-pointer items-center gap-[7px] rounded-[9px] px-4 py-2 text-[13px] font-bold"
            style={{ background: live ? "var(--accent)" : "transparent", color: live ? "var(--on-accent)" : "rgba(255,255,255,.5)" }}
          >
            <div className="h-[7px] w-[7px] rounded-full" style={{ background: live ? "var(--on-accent)" : "rgba(255,255,255,.35)" }} />
            Live
          </div>
          <div
            onClick={() => goLive(false)}
            className="cursor-pointer rounded-[9px] px-4 py-2 text-[13px]"
            style={{
              background: !live ? "rgba(255,255,255,.12)" : "transparent",
              color: !live ? "#f2f2ef" : "rgba(255,255,255,.5)",
              fontWeight: !live ? 700 : 400,
            }}
          >
            Offline
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-[9px] bg-surface px-3 py-1.5">
          <input
            value={venueName}
            onChange={(e) => onVenueNameChange(e.target.value)}
            placeholder="Venue name"
            className="w-[130px] bg-transparent text-[13px] font-semibold text-text"
          />
          <span className="text-[12px] text-text-3">{todayLabel()}</span>
        </div>
        <div className="text-[12.5px] text-text-3">
          {live ? "Guests can send requests" : "Requests are closed for guests"}
        </div>
        <div className="relative">
          <div
            onClick={() => setLinkOpen((v) => !v)}
            className="cursor-pointer rounded-[9px] border border-border-3 px-3 py-1.5 text-[12.5px] text-white/65 hover:bg-white/[.06]"
          >
            🔗 Guest link
          </div>
          {linkOpen && (
            <div className="absolute left-0 top-[calc(100%+8px)] z-20 flex w-[280px] flex-col gap-3 rounded-[14px] border border-border-2 bg-surface-2 p-4 shadow-[0_12px_40px_rgba(0,0,0,.6)]">
              <div className="flex items-center justify-between">
                <SectionLabel>Guest link</SectionLabel>
                <div onClick={() => setLinkOpen(false)} className="cursor-pointer text-[12px] text-text-3">
                  close
                </div>
              </div>
              <div className="flex justify-center rounded-xl bg-surface p-3">
                <QrCode value={guestUrl || "/"} size={140} />
              </div>
              <div className="break-all rounded-[10px] bg-bg px-3 py-2.5 text-center font-mono text-[12px] text-text">
                {guestUrlDisplay}
              </div>
              <div
                onClick={copyGuestLink}
                className="cursor-pointer rounded-[10px] bg-accent py-2.5 text-center text-[13px] font-bold text-on-accent"
              >
                {copied ? "Copied ✓" : "Copy link"}
              </div>
              <a
                href={`${guestPath}/screen`}
                target="_blank"
                rel="noreferrer"
                className="text-center text-[12px] text-text-3 hover:text-text-2"
              >
                Open big screen display ↗
              </a>
            </div>
          )}
        </div>
        <div className="relative">
          <div
            onClick={() => setPayOpen((v) => !v)}
            className="cursor-pointer rounded-[9px] border border-border-3 px-3 py-1.5 text-[12.5px] text-white/65 hover:bg-white/[.06]"
          >
            💳 Payment info
          </div>
          {payOpen && (
            <div className="absolute left-0 top-[calc(100%+8px)] z-20 flex w-[260px] flex-col gap-3 rounded-[14px] border border-border-2 bg-surface-2 p-4 shadow-[0_12px_40px_rgba(0,0,0,.6)]">
              <div className="flex items-center justify-between">
                <SectionLabel>Payment handles</SectionLabel>
                <div onClick={() => setPayOpen(false)} className="cursor-pointer text-[12px] text-text-3">
                  close
                </div>
              </div>
              <div className="text-[11.5px] leading-[1.4] text-text-3">
                Guests who tip get sent straight here to pay — no fees, no middleman.
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="text-[11px] text-text-3">Venmo username</div>
                <input
                  value={venmoHandle}
                  onChange={(e) => setVenmoHandle(e.target.value)}
                  placeholder="e.g. dj-nova"
                  className="rounded-[10px] bg-bg px-3 py-2.5 text-[13px] text-text placeholder:text-text-4"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="text-[11px] text-text-3">Cash App $cashtag</div>
                <input
                  value={cashHandle}
                  onChange={(e) => setCashHandle(e.target.value)}
                  placeholder="e.g. djnova"
                  className="rounded-[10px] bg-bg px-3 py-2.5 text-[13px] text-text placeholder:text-text-4"
                />
              </div>
              <div
                onClick={savePaymentHandles}
                className="cursor-pointer rounded-[10px] bg-accent py-2.5 text-center text-[13px] font-bold text-on-accent"
              >
                {paySaved ? "Saved ✓" : "Save"}
              </div>
            </div>
          )}
        </div>
        <div className="ml-auto flex items-center gap-3.5 text-[13px] text-text-2">
          <div>
            Requests <span className="font-semibold text-text">{incoming.length}</span>
          </div>
          <div className="flex items-center gap-2.5 rounded-[9px] bg-surface px-[11px] py-1.5">
            <span>
              Venmo <span className="font-bold text-accent">${tips?.venmo ?? 0}</span>
            </span>
            <span className="text-white/20">|</span>
            <span>
              Cash App <span className="font-bold text-accent">${tips?.cashapp ?? 0}</span>
            </span>
            <span className="text-[10.5px] text-text-4">only you see this</span>
          </div>
        </div>
      </div>

      {/* Header row 2 */}
      <div className="flex items-center gap-2 border-b border-border px-6 py-2.5">
        <div
          onClick={() => setView("tonight")}
          className="cursor-pointer rounded-[9px] px-4 py-[7px] text-[13px] font-semibold"
          style={{ background: view === "tonight" ? "rgba(255,255,255,.12)" : "transparent", color: view === "tonight" ? "#f2f2ef" : "rgba(255,255,255,.5)" }}
        >
          Tonight
        </div>
        <div
          onClick={() => setView("history")}
          className="cursor-pointer rounded-[9px] px-4 py-[7px] text-[13px] font-semibold"
          style={{ background: view === "history" ? "rgba(255,255,255,.12)" : "transparent", color: view === "history" ? "#f2f2ef" : "rgba(255,255,255,.5)" }}
        >
          History
        </div>
        <div onClick={signOut} className="ml-auto cursor-pointer text-[12.5px] text-text-3 hover:text-text-2">
          Sign out
        </div>
        <div
          onClick={endSession}
          className="cursor-pointer rounded-[9px] border border-border-3 px-3.5 py-[7px] text-[12.5px] text-white/65 hover:bg-white/[.06]"
        >
          End session
        </div>
      </div>

      {view === "tonight" ? (
        <div className="grid min-h-0 flex-1 grid-cols-2">
          {/* INCOMING */}
          <div className="flex min-h-0 flex-col border-r border-border">
            <div className="flex items-baseline justify-between px-6 pb-2.5 pt-4">
              <div className="flex items-center gap-2">
                <SectionLabel>Incoming</SectionLabel>
                {incoming.length > 0 && (
                  <div className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-[5px] text-[11px] font-bold text-on-accent">
                    {incoming.length}
                  </div>
                )}
              </div>
              <div onClick={toggleChime} className="cursor-pointer text-[12px]" style={{ color: session.chime_enabled ? "var(--accent)" : "rgba(255,255,255,.4)" }}>
                {session.chime_enabled ? "🔊 Chime on" : "🔇 Chime off"}
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-auto px-6 pb-4">
              {incoming.length === 0 && (
                <div className="py-[26px] text-center text-[13px] text-text-3">No pending requests — send one from the phone →</div>
              )}
              {incoming.map((r) => {
                const boosted = r.tip >= 5;
                return (
                  <div
                    key={r.id}
                    className="flex flex-col gap-2 rounded-[14px] bg-surface p-3.5"
                    style={{ border: `1px solid ${boosted ? "var(--accent-40)" : "var(--border)"}` }}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="text-[15px] font-semibold">
                          {r.title} <span className="font-normal text-text-2">· {r.artist}</span>
                        </div>
                        <div className="text-[12px] text-text-2">
                          {(r.merged_count > 1 ? `${r.merged_count} people` : r.requester_name)} · {relativeLabel(r.created_at)}
                        </div>
                      </div>
                      {r.tip > 0 && (
                        <div className="rounded-[7px] bg-accent-15 px-2.5 py-1 text-[12px] font-bold text-accent">
                          ${r.tip} · {r.pay_method}
                        </div>
                      )}
                    </div>
                    {r.note && (
                      <div className="flex items-center gap-2">
                        <div
                          className="flex-1 rounded-lg bg-bg px-2.5 py-2 text-[12.5px] text-white/65"
                          style={{ opacity: r.note_approved ? 1 : 0.45 }}
                        >
                          &ldquo;{r.note}&rdquo;
                        </div>
                        <div
                          onClick={() => toggleNote(r.id)}
                          className="flex-none cursor-pointer rounded-[7px] border px-2.5 py-1.5 text-[11px]"
                          style={{
                            borderColor: r.note_approved ? "var(--accent-50)" : "var(--border-2)",
                            color: r.note_approved ? "var(--accent)" : "rgba(255,255,255,.5)",
                          }}
                        >
                          {r.note_approved ? "✓ Note approved" : "Approve note"}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <div
                        onClick={() => accept(r.id)}
                        className="flex-1 cursor-pointer rounded-[9px] bg-accent py-2 text-center text-[13px] font-bold text-on-accent"
                      >
                        Accept
                      </div>
                      <div
                        onClick={() => decline(r.id)}
                        className="flex-1 cursor-pointer rounded-[9px] border border-border-2 py-2 text-center text-[13px] text-white/60 hover:bg-white/[.06]"
                      >
                        Decline
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* QUEUE */}
          <div className="flex min-h-0 flex-col">
            <div className="flex items-baseline justify-between px-6 pb-2.5 pt-4">
              <SectionLabel>Queue</SectionLabel>
              <div className="flex items-center gap-2.5">
                <div className="text-[12px] text-text-3">
                  {session.order_mode === "manual" ? "manual order" : "sorted by votes · ↑↓ to take over"}
                </div>
                {session.order_mode === "manual" && (
                  <div onClick={autoSort} className="cursor-pointer rounded-[7px] border border-border-3 px-2.5 py-[5px] text-[11.5px] text-white/60">
                    Re-sort by votes
                  </div>
                )}
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-auto px-6">
              {sortedQueue.map((item, i) => (
                <div key={item.id} className="flex items-center gap-3 border-b border-border py-[11px]">
                  <div className="w-[18px] font-mono text-[12px] text-white/30">{String(i + 1).padStart(2, "0")}</div>
                  <div className="flex min-w-0 flex-1 flex-col gap-px">
                    <div className="text-[14px] font-medium">{item.title}</div>
                    <div className="text-[12px] text-text-2">
                      {item.artist} · ▲ {item.votes}
                      {item.boosted ? " · BOOSTED" : ""}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <div
                      onClick={() => i > 0 && moveQueue(item.id, "up")}
                      className="flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-[7px] border border-border-2 text-[12px] hover:bg-white/[.08]"
                      style={{ color: i === 0 ? "rgba(255,255,255,.2)" : "rgba(255,255,255,.6)" }}
                    >
                      ↑
                    </div>
                    <div
                      onClick={() => i < sortedQueue.length - 1 && moveQueue(item.id, "down")}
                      className="flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-[7px] border border-border-2 text-[12px] hover:bg-white/[.08]"
                      style={{ color: i === sortedQueue.length - 1 ? "rgba(255,255,255,.2)" : "rgba(255,255,255,.6)" }}
                    >
                      ↓
                    </div>
                  </div>
                  <div
                    onClick={() => playItem(item.id)}
                    className="cursor-pointer rounded-lg border border-accent-40 px-[11px] py-1.5 text-[12px] font-semibold text-accent hover:bg-accent-10"
                  >
                    Play ▸
                  </div>
                  <div
                    onClick={() => removeFromQueue(item.id)}
                    title="Remove from queue"
                    className="flex h-[26px] w-[26px] flex-none cursor-pointer items-center justify-center rounded-[7px] border border-border-2 text-[12px] text-white/40 hover:border-red-400/40 hover:text-red-400"
                  >
                    ✕
                  </div>
                </div>
              ))}
              {sortedQueue.length === 0 && (
                <div className="py-[26px] text-center text-[13px] text-text-3">Queue is empty</div>
              )}
              {playedItems.length > 0 && (
                <>
                  <div className="pb-1.5 pt-4 text-[11px] font-semibold tracking-[.12em] text-white/30">
                    PLAYED · clears when session ends
                  </div>
                  {playedItems.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 border-b border-white/[.04] py-[9px] opacity-45">
                      <div className="w-[18px] text-[12px] text-text-3">✓</div>
                      <div className="flex min-w-0 flex-1 flex-col gap-px">
                        <div className="text-[14px] font-medium line-through">{p.title}</div>
                        <div className="text-[12px] text-text-2">
                          {p.artist} · {relativeLabel(p.played_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
            <div className="flex items-center gap-2.5 border-t border-border px-6 py-3.5 text-[12.5px] text-text-2">
              <EqBars />
              Now playing: <span className="font-semibold text-text">{session.now_title ?? "—"}</span>
              {session.now_artist ? ` · ${session.now_artist}` : ""}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-6 py-[18px]">
          <SectionLabel>Past sessions</SectionLabel>
          {history.length === 0 && (
            <div className="py-[26px] text-center text-[13px] text-text-3">No sessions yet — end tonight&apos;s session to save it here.</div>
          )}
          {history.map((h) => (
            <div key={h.id} className="flex flex-col gap-2.5 rounded-2xl bg-surface p-[18px]">
              <div className="flex items-baseline gap-3">
                <div className="text-[15px] font-semibold">{h.venue_name}</div>
                <div className="text-[12.5px] text-text-3">{dateLabel(h.started_at)}</div>
                <div className="ml-auto flex items-center gap-3.5 text-[12.5px] text-text-2">
                  <span>{h.requests} requests</span>
                  <span>{h.played_count} played</span>
                  <div
                    onClick={() => deleteHistorySession(h.id)}
                    className="cursor-pointer rounded-[7px] border border-border-2 px-2.5 py-1 text-[11.5px] text-text-3 hover:border-red-400/40 hover:text-red-400"
                  >
                    Delete
                  </div>
                </div>
              </div>
              <div className="flex gap-2.5">
                <div className="flex flex-1 flex-col gap-0.5 rounded-[10px] bg-bg px-3 py-2.5">
                  <div className="text-[10.5px] tracking-[.1em] text-text-3">VENMO</div>
                  <div className="text-[16px] font-bold text-accent">${h.venmo}</div>
                </div>
                <div className="flex flex-1 flex-col gap-0.5 rounded-[10px] bg-bg px-3 py-2.5">
                  <div className="text-[10.5px] tracking-[.1em] text-text-3">CASH APP</div>
                  <div className="text-[16px] font-bold text-accent">${h.cashapp}</div>
                </div>
                <div className="flex flex-1 flex-col gap-0.5 rounded-[10px] bg-bg px-3 py-2.5">
                  <div className="text-[10.5px] tracking-[.1em] text-text-3">TOTAL TIPS</div>
                  <div className="text-[16px] font-bold text-text">${h.venmo + h.cashapp}</div>
                </div>
              </div>
              <div className="text-[12.5px] leading-[1.5] text-text-2">{h.songs}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
