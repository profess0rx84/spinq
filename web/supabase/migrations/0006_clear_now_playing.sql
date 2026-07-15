-- Lets a DJ clear the "now playing" slot (song finished, taking a beat
-- before picking what's next) without playing another queue item and
-- without ending the whole session. The cleared song still gets logged
-- to played_items, same as play_next does when it advances.
create or replace function clear_now_playing(p_session_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_session sessions;
begin
  perform _require_dj(p_session_id);
  select * into v_session from sessions where id = p_session_id;

  if v_session.now_title is not null then
    insert into played_items (session_id, title, artist)
      values (p_session_id, v_session.now_title, v_session.now_artist);
  end if;

  update sessions set now_title = null, now_artist = null, now_art_url = null
    where id = p_session_id;
end;
$$;
