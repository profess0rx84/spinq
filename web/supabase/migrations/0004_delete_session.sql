-- Lets a DJ permanently delete one of their own past (ended) sessions
-- from History. Deleting the session row cascades to session_tips,
-- queue_items, played_items, incoming_requests, and votes via foreign
-- keys, so nothing is left behind.
create or replace function delete_session(p_session_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_ended_at timestamptz;
begin
  select ended_at into v_ended_at from sessions where id = p_session_id and dj_id = auth.uid();
  if v_ended_at is null then
    raise exception 'session not found, not yours, or still active';
  end if;
  delete from sessions where id = p_session_id;
end;
$$;
