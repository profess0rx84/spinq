-- Lets a DJ pull a queue item that landed by mistake (wrong song, prank
-- request, etc.) without having to play it or end the session. Silent by
-- design, same as decline_request — no guest notification.
create or replace function remove_queue_item(p_queue_item_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_session_id uuid;
begin
  select session_id into v_session_id from queue_items where id = p_queue_item_id;
  if v_session_id is null then raise exception 'queue item not found'; end if;
  perform _require_dj(v_session_id);
  delete from queue_items where id = p_queue_item_id;
end;
$$;
