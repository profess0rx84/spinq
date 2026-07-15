-- Caps a guest at 2 outstanding pending requests (per the original spec).
-- Voting on an already-queued/accepted song doesn't count — only requests
-- still waiting on the DJ (new ones, or ones a guest's tip got pooled
-- into) do.
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
  v_pending_count int;
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

  select count(*) into v_pending_count
    from incoming_request_guests g join incoming_requests r on r.id = g.request_id
    where g.guest_id = p_guest_id and r.session_id = p_session_id;
  if v_pending_count >= 2 then
    raise exception 'rate_limited';
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
