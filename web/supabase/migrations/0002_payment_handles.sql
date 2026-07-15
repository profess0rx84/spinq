-- Public, read-only lookup so a guest can fetch just the DJ's payment
-- handles (nothing else from dj_profiles) to build a Venmo/Cash App deep
-- link. Safe to expose: these are meant to be shared publicly anyway.
create or replace function get_payment_handles(p_venue_slug text)
returns table (venmo_handle text, cashapp_handle text)
language sql stable security definer set search_path = public as $$
  select venmo_handle, cashapp_handle from dj_profiles where venue_slug = p_venue_slug;
$$;
