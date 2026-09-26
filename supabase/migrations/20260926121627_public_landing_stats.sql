-- The sign-in gate (js/views/gate.js) is the one page in this app rendered
-- before any session exists — every other table's RLS is uniformly
-- `to authenticated` (see identity_and_auth_bridge's own header comment), so
-- an unauthenticated request against apiaries/members returns zero rows, not
-- real data. Its "Research apiaries" / "Contributing members" ticker used to
-- be a hardcoded 3 and js/data.js's mock seed array length — neither tracked
-- production at all.
--
-- Rather than opening real SELECT access to apiaries/members themselves
-- (which would hand every member's name to the public internet), this is a
-- single SECURITY DEFINER function returning just the two counts — same
-- "active only" filtering loadApiaries()/loadRealMembers() already apply
-- (date_removed/deactivated_at is null) — with EXECUTE granted to anon. This
-- is the only anon-reachable surface in the app; every other grant stays
-- authenticated-only.
create function public.public_landing_stats()
returns table (apiary_count bigint, member_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.apiaries where date_removed is null),
    (select count(*) from public.members where deactivated_at is null);
$$;

grant execute on function public.public_landing_stats() to anon, authenticated;
