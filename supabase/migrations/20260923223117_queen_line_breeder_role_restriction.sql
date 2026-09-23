-- ============================================================================
-- Restricts a queen line's breeder to a real member holding the "Breeder"
-- role (member_roles), and removes the standalone (non-member) breeder
-- path entirely -- both requested together, after the free-text "Add
-- breeder" form was flagged as bypassing the member-directory check the
-- FK-based path already has.
--
-- Confirmed on production before writing this: `breeders` has 0 rows, and
-- the one existing queen line (E-01) is already credited to a real member
-- (breeder_member_id, not breeder_id) who already holds the Breeder role --
-- so nothing already there is invalidated by this.
--
-- Enforced server-side via a trigger, not just by filtering the client's
-- picker -- mirrors is_web_admin()'s role, just for one more role instead
-- of the DB accepting whatever the UI happens to send it.
-- ============================================================================

alter table public.queen_lines drop constraint queen_lines_breeder_xor;

create function public.is_breeder(p_member_id uuid default public.current_member_id())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.member_roles
    where member_id = p_member_id and role_name = 'Breeder'
  );
$$;

create function public.enforce_queen_line_breeder_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_breeder(new.breeder_member_id) then
    raise exception 'breeder_member_id must reference a member holding the Breeder role';
  end if;
  return new;
end;
$$;

create trigger queen_lines_breeder_role_check
  before insert or update on public.queen_lines
  for each row execute function public.enforce_queen_line_breeder_role();

alter table public.queen_lines
  drop column breeder_id,
  alter column breeder_member_id set not null;

drop table public.breeders;

grant execute on function public.is_breeder(uuid) to authenticated;
