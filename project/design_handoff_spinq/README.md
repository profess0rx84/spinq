# Handoff: SPINQ — DJ Song Request Platform

## Overview
SPINQ lets guests at a venue scan a QR code and request songs from the DJ on their phones — search the Apple Music catalog, add a dedication, tip via Venmo or Cash App, and upvote others' requests. The DJ runs a booth dashboard: goes live/offline, accepts/declines requests, moderates dedication notes, manages the queue, tracks tips split by payment source, and archives each session to history. A big-screen display shows now-playing plus the QR code.

("SPINQ" is a placeholder name — final name TBD.)

## About the Design Files
The files in this bundle are **design references created in HTML** — interactive prototypes showing intended look and behavior, not production code to ship. The task is to **recreate these designs in a real product environment**. No codebase exists yet; choose an appropriate stack. Recommended shape:

- **Web app** (guests must reach it from a QR scan with zero install): e.g. Next.js/React + a realtime backend (Supabase Realtime, Firebase, or WebSockets) so all guest phones and the DJ booth share one live queue.
- **Three routes**: `/{venue-slug}` (guest, mobile), `/booth` (DJ, auth required), `/{venue-slug}/screen` (big-screen display).
- **Payments**: tips deep-link to the DJ's Venmo / Cash App handles (configured in DJ profile). No in-app payment processing in v1; the app records the declared tip amount + source.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and copy are final-intent. Recreate pixel-perfectly.

## Design Tokens
- Background (page): `#0a0a0c`
- Surface (cards): `#16161a`; deeper surface / input wells: `#1c1c22`; canvas behind frames: `#111114`
- Text primary: `#f2f2ef`; secondary: `rgba(255,255,255,.5)`; tertiary: `rgba(255,255,255,.35–.4)`
- Accent (themeable): default lime `#c8f542`; alternates cyan `#5ce1e6`, pink `#ff6ec7`, amber `#ffb02e`. Accent alphas used: 10/12/15/35/40/50%.
- Text on accent: `#0a0a0c`
- Borders: `rgba(255,255,255,.06–.18)`; accent borders for selected/boosted states
- Font: **Space Grotesk** (400/500/600/700), Google Fonts. Monospace bits (track initials, queue numbers): `ui-monospace`
- Radii: pills 999px; buttons/inputs 10–14px; cards 14–18px; phone CTA 14px
- Type scale (mobile): heading 20px/700, item title 15px/500, secondary 12–13px, section labels 11px/600 letter-spacing .12em uppercase
- Section label pattern: 11px, weight 600, letter-spacing .12em, `rgba(255,255,255,.4)`, uppercase

## Screens / Views

### 1. Guest app (mobile, `SPINQ Mobile.dc.html` + phone in `SPINQ Prototype.dc.html`)
- **Header**: wordmark left; venue + auto date right; bell icon (34px circle, `#16161a`) with accent unread-count badge.
- **Now Playing card**: surface card, radius 16, EQ animation (3 accent bars, `scaleY` .3→1, .6–.8s alternating, negative delays) + "NOW PLAYING" label in accent, track title 17px/600, subtitle 12.5px.
- **Up Next queue**: rows with vote button (34px wide, ▲ + count, accent fill/border when voted), title/artist, BOOSTED chip (accent 15% bg, accent text, 10.5px/700).
- **CTA**: full-width accent button "+ Request a song" (radius 14, 700). When DJ offline → replaced by surface card: "Requests are closed / They'll open right here when the DJ goes live — keep browsing the queue and voting."
- **Request sheet** (full-screen overlay): search input (well `#1c1c22`, accent 35% border), results from **iTunes Search API** (`itunes.apple.com/search?media=music&entity=song&limit=8`, debounced 350ms, label "Apple Music catalog", artwork 44px radius 8; production should use Apple MusicKit or Spotify Web API). Pick → compose card: 84px artwork (300x300 upgrade), title/artist, "change" link, dedication input, tip chips (No tip / $2 / $5 · Boost — selected = accent border + 12% bg), "Pay with Venmo / Cash App" chips (shown only when tip > 0), helper line "$5 boosts your song toward the top · tips go straight to the DJ", accent send button ("Send request · $N").
- **Toasts**: bottom-floating card, `#1c1c22`, accent 40% border, ~2.6s, slide-up 250ms.
- **Notifications feed**: dropdown panel under bell; entries with message + timestamp. Generated: "request accepted ✓", "your song is up next!", "your song is playing now 🎉". **Declines are silent by design.**

### 2. DJ Booth (desktop 1100×680, `SPINQ Prototype.dc.html`)
- **Login gate**: centered 340px column — wordmark, email/password wells, accent sign-in button, note "Requests stay offline until you go live."
- **Header row 1**: wordmark "SPINQ Booth"; **Live/Offline segmented toggle** (pill container `#16161a`, active segment accent bg + dark text); editable **venue name input** + auto date; status hint ("Guests can send requests" / "Requests are closed for guests"); right: request count + tips box "Venmo $X | Cash App $Y" with caption "only you see this". **Tips never appear on guest or screen views.**
- **Header row 2**: tabs Tonight / History (active = white 12% bg); right: "End session" outline button.
- **Tonight, left column — INCOMING**: count badge (accent pill) + "Chime on/off" toggle. Request cards: title · artist, meta ("Marco · just now" or "2 people · just now" when duplicates merge), tip chip "$5 · Venmo" (accent 15% bg), accent 40% border when tip ≥ $5. Dedication note shown at 45% opacity with **"Approve note"** toggle (accent border when approved) — only approved notes travel with the accepted song. Buttons: Accept (accent fill) / Decline (outline).
- **Tonight, right column — QUEUE**: numbered rows (mono), title, "artist · ▲ votes · BOOSTED", ↑/↓ reorder buttons (26px square, radius 7, white 15% border), accent-outline "Play ▸" button. Header right shows "sorted by votes · ↑↓ to take over" or "manual order" + "Re-sort by votes" outline button. Below: **PLAYED** section ("clears when session ends") — 45% opacity, strikethrough title, ✓ + timestamp. Footer: EQ animation + "Now playing: …".
- **History tab**: session cards — venue, date, request/played counts, three stat wells (VENMO / CASH APP / TOTAL TIPS, accent numbers), setlist line ("One More Time · Levitating · +14 more").

### 3. Big-screen display (960×540 shown; design for 1920×1080, `DJ Requests Explorations.dc.html` §2c/2d)
- Live: "Requests are open" status dot, NOW PLAYING label (accent, letter-spacing .18em), title 56px/700, "requested by" line, UP NEXT line, QR card (surface, "Scan to request a song" + short URL). Footer stats: requests + voters count — **no tip info ever**.
- Offline: "Requests are closed" (dimmed dot), centered "Requests open when the DJ goes live" 44px/700, start-time footer.

## Interactions & Behavior
- **Live/Offline** (DJ): offline hides guest request CTA and shows closed card; big screen switches to closed state. New sessions start offline until DJ goes live.
- **Request flow**: guest search → pick → optional dedication/tip → send → appears at top of booth INCOMING. Accept → into queue (votes 0; tip ≥ $5 = boosted, inserted by sort). Decline → removed silently.
- **Queue sort**: boosted first, then votes desc. Vote = toggle (±1). **DJ manual override**: ↑/↓ buttons on each queue row move it on the fly; first move switches the queue to "manual order" (auto vote-sorting pauses, order is DJ-authoritative and syncs to all surfaces). A "Re-sort by votes" button reverts to automatic sorting. Top/bottom rows show disabled arrow states (20% white).
- **Duplicate merge**: request matching a queued song (title+artist, case-insensitive) → adds a vote instead, toast "Already in the queue — we added your vote ▲". Matching a pending request → increments its count and pools the tip, toast "Someone beat you to it — we bumped that request ✓".
- **Play ▸**: current now-playing moves to PLAYED (greyed) with timestamp; item becomes now-playing on all surfaces. If requester's song plays / reaches queue top → guest notification.
- **End session**: archives {venue, date, request count, played count, venmo, cashapp, total, setlist} to History; resets tips/played/incoming; flips offline.
- **Rate limit (spec'd, not prototyped)**: max 2 pending requests per guest.

## State Management
Realtime-shared: queue, incoming, now-playing, live flag, per-session tips (by source), played list. Per-guest: voted set, own request ids, notification feed. Per-DJ: auth, venue name, payment handles, session history (persistent DB).

## Assets
No image assets; artwork comes from the music search API at runtime. QR code generated per venue URL. Google Font: Space Grotesk.

## Screenshots
`screenshots/` — reference captures: `login-and-guest-queue.png` (booth login + guest queue), `booth-tonight-and-request-sheet.png` (booth live view + guest request sheet), `booth-history.png` (session history with tip splits).

## Files
- `SPINQ Prototype.dc.html` — main interactive prototype: guest phone + DJ booth, fully wired (source of truth for behavior)
- `SPINQ Mobile.dc.html` — standalone phone-only guest app
- `DJ Requests Explorations.dc.html` — earlier explorations incl. big-screen live/offline layouts (§2c, 2d) and login (§2a)
- `ios-frame.jsx`, `browser-window.jsx`, `support.js` — presentation shells/runtime for the prototypes; not part of the product design
