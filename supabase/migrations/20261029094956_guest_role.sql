-- ============================================================================
-- Adds the "Guest" role — automatically granted to a direct (non–Wild
-- Apricot) collaborator account (supabase/functions/invite-collaborator),
-- the same way "Member" is automatically granted to a real Wild Apricot
-- sign-in (wildapricot-auth's DEFAULT_ROLES).
--
-- Carries identical permissions to Member: nothing in this schema's RLS or
-- helper functions (is_web_admin, can_contribute_repository) ever checks
-- for 'Member' by name — every forum/marketplace/subscription write is
-- already open to any signed-in member regardless of role, and repository
-- contribution is gated by its own elevated-roles list that Member was
-- never part of either. So Guest needs no policy or grant changes of its
-- own; it exists purely so a direct account's role label correctly
-- reflects how they signed in, instead of sharing a label ("Member")
-- that's meant to mean "a real Wild Apricot member."
-- ============================================================================

insert into public.role_options (name, description, sort_order) values
  ('Guest', 'Same access as Member — read-only access to apiary data and the information repository, full forum access, and can add Marketplace listings. Automatically assigned to a direct (non–Wild Apricot) collaborator account, the same way Member is automatically assigned to a real Wild Apricot sign-in.', 10);
