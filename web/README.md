# SPINQ

DJ song-request platform: guests scan a QR code and request songs from
their phone (search, dedication, tip, upvote); the DJ runs a booth
dashboard (accept/decline, live queue, tips, session history); a big
screen shows now-playing + the QR code. Built from the `SPINQ Prototype.dc.html`
Claude Design handoff — see `../README.md` and `../chats/` in the repo root
for the original design brief.

"SPINQ" is a placeholder name — see `../project/design_handoff_spinq/DJ Requests Explorations.dc.html`
for six alternate name directions if you want to rebrand later.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS v4)
- **Supabase**: Postgres + Row Level Security, Realtime, Auth (DJ
  email/password, guest anonymous sign-in)
- No custom backend server — the browser talks to Supabase directly
  (RLS + `SECURITY DEFINER` RPC functions enforce the rules below)

## Data model & security, in one paragraph

Guests never see tips, even by accident: tip totals live in a separate
`session_tips` table with DJ-only Row Level Security, physically apart
from anything a guest or the big screen can query. Every guest phone gets
a real (anonymous) Supabase auth user on first visit, so votes,
notifications, and "which requests are mine" are tied to a genuine
`auth.uid()` instead of a spoofable client-side flag. All state-changing
actions that need to be atomic or cross a trust boundary (submitting a
request, merging a duplicate, accepting/declining, reordering the queue,
ending a session) go through Postgres RPC functions rather than direct
table writes — see `supabase/migrations/0001_init.sql`.

## Setup

### 1. Create a Supabase project

Create a free project at [supabase.com](https://supabase.com/dashboard).

### 2. Run the migration

Open the SQL Editor in your Supabase project and paste the full contents
of `supabase/migrations/0001_init.sql`, then run it. (Or, if you use the
Supabase CLI: `supabase link` then `supabase db push`.)

This creates all tables, RLS policies, and RPC functions, and adds the
realtime tables to the `supabase_realtime` publication.

If you're updating an existing project rather than starting fresh, also
run any newer files in `supabase/migrations/` (e.g. `0002_payment_handles.sql`)
that you haven't applied yet — same steps, just paste and run.

### 3. Enable anonymous sign-ins

Guests never create an account or type a name — they get a transparent
anonymous Supabase auth session on first visit. In your Supabase
dashboard: **Authentication → Sign In / Providers → Anonymous Sign-Ins →
Enable**.

### 4. (Recommended for testing) disable email confirmation

By default Supabase requires DJs to click a confirmation link before
their first sign-in works. For quick local testing:
**Authentication → Sign In / Providers → Email → turn off "Confirm email"**.
Leave it on for a real production deployment.

### 5. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
from **Project Settings → API** in your Supabase dashboard.

Fill in `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` from a free app at
the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
(Create app → any name/description → no redirect URI needed, this only
uses the Client Credentials flow for search, not user login). These stay
server-side only — no `NEXT_PUBLIC_` prefix.

### 6. Run it

```bash
npm install
npm run dev
```

- `/` — landing page
- `/booth/login` — DJ creates a booth (venue name + email/password) or signs in
- `/booth` — DJ dashboard (Tonight / History)
- `/{venue-slug}` — guest app (the slug is generated at signup, e.g. `club-velour-a1b2`)
- `/{venue-slug}/screen` — big screen display, meant for a TV/projector behind the DJ

## What's stubbed (by design, for this first pass)

Per scope agreed with the requester, these are intentionally left as
follow-ups rather than built now:

- ~~Music search uses the free, keyless iTunes Search API~~ — **done**:
  search now runs against the Spotify Web API (`src/lib/spotify.ts` +
  `src/app/api/search/route.ts`), requiring a free Spotify Developer app
  (see setup step 5).
- ~~Tips are declared amounts, not real payments~~ — **done**: the DJ sets
  a Venmo/Cash App handle from the booth header ("💳 Payment info"), and
  guests who tip get sent straight to a venmo.com/cash.app payment screen
  after sending their request.
- ~~No guest rate limiting~~ — **done**: `submit_request()` caps a guest at
  2 outstanding pending requests (voting doesn't count toward the cap).
- **Accent color theming**: the design supports lime/cyan/pink/amber
  accents via CSS variables in `globals.css`, but there's no DJ-facing UI
  to switch it yet (defaults to lime, matching the prototype).
- **No "forgot password" flow** on `/booth/login` yet — Supabase Auth
  supports it (`resetPasswordForEmail`), just not wired into the UI.

## Deploying

Any Next.js host works (Vercel is the path of least resistance). Set the
same two environment variables there. No other infrastructure is
required — Supabase is the entire backend.
