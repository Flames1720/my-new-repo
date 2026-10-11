-- Public aggregate only: no account identifiers or access to player records.
create function island_private.availability() returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('capacity', c.player_limit, 'remaining', greatest(0, c.player_limit - (select count(*) from island_private.players)))
 from island_private.config c where c.id = true
$$;
revoke all on function island_private.availability() from public;
grant execute on function island_private.availability() to anon, authenticated;
create function public.pilot_availability() returns jsonb
language sql stable security invoker set search_path = '' as $$
 select island_private.availability()
$$;
revoke all on function public.pilot_availability() from public;
grant execute on function public.pilot_availability() to anon, authenticated;
