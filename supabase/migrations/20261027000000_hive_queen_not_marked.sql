-- ============================================================================
-- A "not marked" queen colour for hives whose queen carries no mark — a
-- queenless colony, or one whose requeening failed and has raised its own
-- queen. Added to the allowed values alongside the five year/colour marks.
-- ============================================================================

alter table public.hives
  drop constraint hives_queen_colour_check,
  add constraint hives_queen_colour_check
    check (queen_colour in ('white', 'yellow', 'red', 'green', 'blue', 'not marked'));
