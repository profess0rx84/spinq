-- SPINQ schema: DJs run a booth for one venue; guests join anonymously via
-- a venue slug; a "session" is one night. Tips live in a separate DJ-only
-- table so guest/screen surfaces can never see them, even by accident.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table dj_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  venue_slug text not null unique,
  venmo_handle text,
  cashapp_handle text,
  created_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  dj_id uuid not null references dj_profiles (id) on delete cascade,
  venue_slug text not null,
  venue_name text not null default 'My Venue',
  is_live boolean not null default false,
  order_mode text not null default 'auto' check (order_mode in ('auto', 'manual')),
  chime_enabled boolean not null default true,
  now_title text,
  now_artist text,
  now_art_url text,
  req_total integer not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index sessions_open_idx on sessions (venue_slug) where ended_at is null;
create index sessions_dj_idx on sessions (dj_id, started_at desc);

-- DJ-only. Never exposed to guest/screen surfaces.
create table session_tips (
  session_id uuid primary key references sessions (id) on delete cascade,
  venmo integer not null default 0,
  cashapp integer not null default 0
);

create table queue_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  title text not null,
  artist text not null,
  votes integer not null default 0,
  boosted boolean not null default false,
  note text not null default '',
  requested_by uuid[] not null default '{}',
  position bigint not null default (extract(epoch from clock_timestamp()) * 1000)::bigint,
  created_at timestamptz not null default now()
);

create index queue_items_session_idx on queue_items (session_id);

create table votes (
  session_id uuid not null references sessions (id) on delete cascade,
  queue_item_id uuid not null references queue_items (id) on delete cascade,
  guest_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (queue_item_id, guest_id)
);

-- DJ-only. Guests never list these directly; they arrive/merge via submit_request().
create table incoming_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  title text not null,
  artist text not null,
  art_url text,
  requester_name text not null default 'Guest',
  tip integer not null default 0,
  pay_method text not null default '',
  note text not null default '',
  note_approved boolean not null default false,
  merged_count integer not null default 1,
  created_at timestamptz not null default now()
);

create index incoming_requests_session_idx on incoming_requests (session_id);

create table incoming_request_guests (
  request_id uuid not null references incoming_requests (id) on delete cascade,
  guest_id uuid not null,
  primary key (request_id, guest_id)
);

create table played_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  title text not null,
  artist text not null,
  played_at timestamptz not null default now()
);

create index played_items_session_idx on played_items (session_id);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  guest_id uuid not null,
  message text not null,
  created_at timestamptz not null default now(),
  read boolean not null default false
);

create index notifications_guest_idx on notifications (guest_id, created_at desc);

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

alter table dj_profiles enable row level security;
alter table sessions enable row level security;
alter table session_tips enable row level security;
alter table queue_items enable row level security;
alter table votes enable row level security;
alter table incoming_requests enable row level security;
alter table incoming_request_guests enable row level security;
alter table played_items enable row level security;
alter table notifications enable row level security;

-- dj_profiles: a DJ can see/manage only their own row.
create policy "dj reads own profile" on dj_profiles for select
  using (id = auth.uid());
create policy "dj creates own profile" on dj_profiles for insert
  with check (id = auth.uid());
create policy "dj updates own profile" on dj_profiles for update
  using (id = auth.uid());

-- sessions: no sensitive columns live here (tips are split out), so any
-- guest, screen, or DJ can read. Realtime needs this to fan out to guests.
create policy "sessions are publicly readable" on sessions for select
  using (true);
create policy "dj manages own sessions" on sessions for all
  using (dj_id = auth.uid()) with check (dj_id = auth.uid());

-- session_tips: DJ-only, always.
create policy "dj reads own tips" on session_tips for select
  using (exists (select 1 from sessions s where s.id = session_id and s.dj_id = auth.uid()));

-- queue_items / votes / played_items: public read (no tip data), writes
-- happen through SECURITY DEFINER RPCs below, but we also allow the owning
-- DJ direct row access as a fallback/for admin tooling.
create policy "queue is publicly readable" on queue_items for select using (true);
create policy "dj manages own queue" on queue_items for all
  using (exists (select 1 from sessions s where s.id = session_id and s.dj_id = auth.uid()))
  with check (exists (select 1 from sessions s where s.id = session_id and s.dj_id = auth.uid()));

create policy "votes are publicly readable" on votes for select using (true);
create policy "guests manage their own vote" on votes for all
  using (guest_id = auth.uid()) with check (guest_id = auth.uid());

create policy "played is publicly readable" on played_items for select using (true);
create policy "dj manages own played" on played_items for all
  using (exists (select 1 from sessions s where s.id = session_id and s.dj_id = auth.uid()))
  with check (exists (select 1 from sessions s where s.id = session_id and s.dj_id = auth.uid()));

-- incoming_requests / incoming_request_guests: DJ-only. Guests submit via
-- the submit_request() RPC, which runs as the function owner.
create policy "dj reads own incoming" on incoming_requests for select
  using (exists (select 1 from sessions s where s.id = session_id and s.dj_id = auth.uid()));
create policy "dj manages own incoming" on incoming_requests for all
  using (exists (select 1 from sessions s where s.id = session_id and s.dj_id = auth.uid()))
  with check (exists (select 1 from sessions s where s.id = session_id and s.dj_id = auth.uid()));

create policy "dj reads own incoming guests" on incoming_request_guests for select
  using (exists (
    select 1 from incoming_requests r join sessions s on s.id = r.session_id
    where r.id = request_id and s.dj_id = auth.uid()
  ));

-- notifications: a guest can only ever see their own.
create policy "guest reads own notifications" on notifications for select
  using (guest_id = auth.uid());
create policy "guest marks own notifications read" on notifications for update
  using (guest_id = auth.uid()) with check (guest_id = auth.uid());

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

create or replace function _require_dj(p_session_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from sessions where id = p_session_id and dj_id = auth.uid()) then
    raise exception 'not authorized for this session';
  end if;
end;
$$;

-- Public, read-only lookup so a guest/screen can resolve a venue slug to
-- the venue's current open session without any broader table access.
create or replace function get_open_session(p_venue_slug text)
returns sessions
language sql stable security definer set search_path = public as $$
  select * from sessions
  where venue_slug = p_venue_slug and ended_at is null
  order by started_at desc
  limit 1;
$$;

-- Guest-facing stats for the big screen: request count + distinct voters.
-- Deliberately excludes tips.
create or replace function get_session_public_stats(p_session_id uuid)
returns table (req_total integer, voters integer)
language sql stable security definer set search_path = public as $$
  select s.req_total, (select count(distinct v.guest_id) from votes v where v.session_id = p_session_id)::int
  from sessions s where s.id = p_session_id;
$$;

-- DJ history: past sessions with tip splits + a short setlist summary.
create or replace function get_session_history(p_dj_id uuid)
returns table (
  id uuid, venue_name text, started_at timestamptz, ended_at timestamptz,
  requests integer, played_count integer, venmo integer, cashapp integer, songs text
)
language sql stable security definer set search_path = public as $$
  select
    s.id, s.venue_name, s.started_at, s.ended_at,
    s.req_total,
    played.total_count as played_count,
    coalesce(t.venmo, 0), coalesce(t.cashapp, 0),
    coalesce(setlist.titles, '') ||
      (case when played.total_count > 4 then ' · +' || (played.total_count - 4) || ' more' else '' end) as songs
  from sessions s
  left join session_tips t on t.session_id = s.id
  left join lateral (
    select count(*)::int + (case when s.now_title is not null then 1 else 0 end) as total_count
    from played_items p where p.session_id = s.id
  ) played on true
  left join lateral (
    select string_agg(title, ' · ' order by at desc) as titles
    from (
      select title, at from (
        select p.title, p.played_at as at from played_items p where p.session_id = s.id
        union all
        select s.now_title, s.started_at where s.now_title is not null
      ) all_played
      order by at desc limit 4
    ) top4
  ) setlist on true
  where s.dj_id = p_dj_id and s.ended_at is not null
  order by s.ended_at desc;
$$;

-- ---------------------------------------------------------------------
-- Guest actions
-- ---------------------------------------------------------------------

create or replace function submit_request(
  p_session_id uuid, p_title text, p_artist text, p_art_url text,
  p_guest_id uuid, p_requester_name text, p_tip integer, p_pay_method text, p_note text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_session sessions;
  v_key text := lower(p_title || '|' || p_artist);
  v_queue_item queue_items;
  v_incoming incoming_requests;
begin
  if p_guest_id <> auth.uid() then raise exception 'guest id mismatch'; end if;

  select * into v_session from sessions where id = p_session_id;
  if v_session is null or not v_session.is_live then
    raise exception 'requests are closed';
  end if;

  select * into v_queue_item from queue_items
    where session_id = p_session_id and lower(title || '|' || artist) = v_key
    limit 1;
  if v_queue_item is not null then
    if not exists (select 1 from votes where queue_item_id = v_queue_item.id and guest_id = p_guest_id) then
      insert into votes (session_id, queue_item_id, guest_id) values (p_session_id, v_queue_item.id, p_guest_id);
      update queue_items set votes = votes + 1 where id = v_queue_item.id;
    end if;
    return 'queued_vote';
  end if;

  select * into v_incoming from incoming_requests
    where session_id = p_session_id and lower(title || '|' || artist) = v_key
    limit 1;
  if v_incoming is not null then
    update incoming_requests
      set merged_count = merged_count + 1, tip = tip + p_tip
      where id = v_incoming.id;
    insert into incoming_request_guests (request_id, guest_id) values (v_incoming.id, p_guest_id)
      on conflict do nothing;
    update sessions set req_total = req_total + 1 where id = p_session_id;
    return 'merged_pending';
  end if;

  insert into incoming_requests (session_id, title, artist, art_url, requester_name, tip, pay_method, note)
    values (p_session_id, p_title, p_artist, p_art_url, coalesce(nullif(p_requester_name, ''), 'Guest'), p_tip,
      case when p_tip > 0 then p_pay_method else '' end, coalesce(p_note, ''))
    returning * into v_incoming;
  insert into incoming_request_guests (request_id, guest_id) values (v_incoming.id, p_guest_id);
  update sessions set req_total = req_total + 1 where id = p_session_id;
  return 'created';
end;
$$;

create or replace function toggle_vote(p_session_id uuid, p_queue_item_id uuid, p_guest_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_now_voted boolean;
begin
  if p_guest_id <> auth.uid() then raise exception 'guest id mismatch'; end if;

  if exists (select 1 from votes where queue_item_id = p_queue_item_id and guest_id = p_guest_id) then
    delete from votes where queue_item_id = p_queue_item_id and guest_id = p_guest_id;
    update queue_items set votes = votes - 1 where id = p_queue_item_id;
    v_now_voted := false;
  else
    insert into votes (session_id, queue_item_id, guest_id) values (p_session_id, p_queue_item_id, p_guest_id);
    update queue_items set votes = votes + 1 where id = p_queue_item_id;
    v_now_voted := true;
  end if;
  return v_now_voted;
end;
$$;

-- ---------------------------------------------------------------------
-- DJ actions
-- ---------------------------------------------------------------------

create or replace function accept_request(p_request_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_req incoming_requests;
  v_guests uuid[];
  v_new_id uuid;
begin
  select * into v_req from incoming_requests where id = p_request_id;
  if v_req is null then raise exception 'request not found'; end if;
  perform _require_dj(v_req.session_id);

  select coalesce(array_agg(guest_id), '{}') into v_guests
    from incoming_request_guests where request_id = p_request_id;

  insert into queue_items (session_id, title, artist, votes, boosted, note, requested_by)
    values (
      v_req.session_id, v_req.title, v_req.artist,
      case when v_req.merged_count > 1 then v_req.merged_count else 0 end,
      v_req.tip >= 5,
      case when v_req.note_approved then v_req.note else '' end,
      v_guests
    )
    returning id into v_new_id;

  if v_req.tip > 0 then
    insert into session_tips (session_id, venmo, cashapp) values (v_req.session_id, 0, 0)
      on conflict (session_id) do nothing;
    update session_tips set
      venmo = venmo + case when v_req.pay_method = 'Venmo' then v_req.tip else 0 end,
      cashapp = cashapp + case when v_req.pay_method = 'Cash App' then v_req.tip else 0 end
      where session_id = v_req.session_id;
  end if;

  insert into notifications (session_id, guest_id, message)
    select v_req.session_id, g, 'Your request "' || v_req.title || '" was accepted ✓'
    from unnest(v_guests) g;

  delete from incoming_requests where id = p_request_id;
  return v_new_id;
end;
$$;

create or replace function decline_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_session_id uuid;
begin
  select session_id into v_session_id from incoming_requests where id = p_request_id;
  if v_session_id is null then raise exception 'request not found'; end if;
  perform _require_dj(v_session_id);
  -- Silent by design: no notification on decline.
  delete from incoming_requests where id = p_request_id;
end;
$$;

create or replace function toggle_note_approval(p_request_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_session_id uuid; v_now boolean;
begin
  select session_id into v_session_id from incoming_requests where id = p_request_id;
  if v_session_id is null then raise exception 'request not found'; end if;
  perform _require_dj(v_session_id);
  update incoming_requests set note_approved = not note_approved where id = p_request_id
    returning note_approved into v_now;
  return v_now;
end;
$$;

create or replace function play_next(p_session_id uuid, p_queue_item_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_session sessions;
  v_item queue_items;
  v_top queue_items;
begin
  perform _require_dj(p_session_id);
  select * into v_session from sessions where id = p_session_id;
  select * into v_item from queue_items where id = p_queue_item_id and session_id = p_session_id;
  if v_item is null then raise exception 'queue item not found'; end if;

  if v_session.now_title is not null then
    insert into played_items (session_id, title, artist) values (p_session_id, v_session.now_title, v_session.now_artist);
  end if;

  if v_session.order_mode = 'manual' then
    select * into v_top from queue_items
      where session_id = p_session_id and id <> p_queue_item_id
      order by position asc limit 1;
  else
    select * into v_top from queue_items
      where session_id = p_session_id and id <> p_queue_item_id
      order by boosted desc, votes desc, created_at asc limit 1;
  end if;

  update sessions set now_title = v_item.title, now_artist = v_item.artist, now_art_url = null
    where id = p_session_id;

  insert into notifications (session_id, guest_id, message)
    select p_session_id, g, 'Your song "' || v_item.title || '" is playing now 🎉'
    from unnest(v_item.requested_by) g;

  if v_top is not null then
    insert into notifications (session_id, guest_id, message)
      select p_session_id, g, 'Your song "' || v_top.title || '" is up next!'
      from unnest(v_top.requested_by) g;
  end if;

  delete from queue_items where id = p_queue_item_id;
end;
$$;

create or replace function reorder_queue(p_session_id uuid, p_queue_item_id uuid, p_direction text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_session sessions;
  v_ids uuid[];
  v_idx int;
  v_swap_idx int;
  v_pos_a bigint;
  v_pos_b bigint;
begin
  perform _require_dj(p_session_id);
  if p_direction not in ('up', 'down') then raise exception 'bad direction'; end if;

  select * into v_session from sessions where id = p_session_id;

  if v_session.order_mode = 'auto' then
    with ordered as (
      select id, row_number() over (order by boosted desc, votes desc, created_at asc) as rn
      from queue_items where session_id = p_session_id
    )
    update queue_items q set position = ordered.rn * 10
      from ordered where ordered.id = q.id;
    update sessions set order_mode = 'manual' where id = p_session_id;
  end if;

  select array_agg(id order by position asc) into v_ids from queue_items where session_id = p_session_id;
  v_idx := array_position(v_ids, p_queue_item_id);
  if v_idx is null then raise exception 'queue item not found'; end if;
  v_swap_idx := case when p_direction = 'up' then v_idx - 1 else v_idx + 1 end;
  if v_swap_idx < 1 or v_swap_idx > array_length(v_ids, 1) then return; end if;

  select position into v_pos_a from queue_items where id = v_ids[v_idx];
  select position into v_pos_b from queue_items where id = v_ids[v_swap_idx];
  update queue_items set position = v_pos_b where id = v_ids[v_idx];
  update queue_items set position = v_pos_a where id = v_ids[v_swap_idx];
end;
$$;

create or replace function autosort_queue(p_session_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _require_dj(p_session_id);
  update sessions set order_mode = 'auto' where id = p_session_id;
end;
$$;

create or replace function set_live(p_session_id uuid, p_live boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _require_dj(p_session_id);
  update sessions set is_live = p_live where id = p_session_id;
end;
$$;

create or replace function set_venue_name(p_session_id uuid, p_venue_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _require_dj(p_session_id);
  update sessions set venue_name = p_venue_name where id = p_session_id;
end;
$$;

create or replace function set_chime(p_session_id uuid, p_enabled boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _require_dj(p_session_id);
  update sessions set chime_enabled = p_enabled where id = p_session_id;
end;
$$;

-- Archives the current session and opens a fresh one for the same venue.
create or replace function end_session(p_session_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_session sessions;
  v_new_id uuid;
begin
  perform _require_dj(p_session_id);
  select * into v_session from sessions where id = p_session_id;

  update sessions set ended_at = now(), is_live = false where id = p_session_id;
  delete from incoming_requests where session_id = p_session_id;

  insert into sessions (dj_id, venue_slug, venue_name, is_live, order_mode)
    values (v_session.dj_id, v_session.venue_slug, v_session.venue_name, false, 'auto')
    returning id into v_new_id;
  insert into session_tips (session_id, venmo, cashapp) values (v_new_id, 0, 0);

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------
-- New DJ bootstrap: first open session for a freshly created profile.
-- ---------------------------------------------------------------------

create or replace function start_first_session(p_venue_slug text, p_venue_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not exists (select 1 from dj_profiles where id = auth.uid() and venue_slug = p_venue_slug) then
    raise exception 'not authorized';
  end if;
  insert into sessions (dj_id, venue_slug, venue_name, is_live, order_mode)
    values (auth.uid(), p_venue_slug, p_venue_name, false, 'auto')
    returning id into v_id;
  insert into session_tips (session_id, venmo, cashapp) values (v_id, 0, 0);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Realtime: broadcast changes on the tables guests/screen/booth subscribe to.
-- ---------------------------------------------------------------------

alter publication supabase_realtime add table sessions;
alter publication supabase_realtime add table queue_items;
alter publication supabase_realtime add table votes;
alter publication supabase_realtime add table played_items;
alter publication supabase_realtime add table incoming_requests;
alter publication supabase_realtime add table notifications;
