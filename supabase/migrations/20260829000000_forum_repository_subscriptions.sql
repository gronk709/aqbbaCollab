-- ============================================================================
-- Phase 3 of the mock-data → Supabase migration: forum + repository metadata,
-- and subscriptions. See /root/.claude/plans/zazzy-swinging-scone.md (or the
-- README's backend-migration section) for the full phased plan.
--
-- Two different purge decisions in one migration, deliberately:
--
--   - Forum threads/posts are NOT carried over. The six seeded discussions
--     are entirely invented conversations authored by fake seed members
--     ('m1'..'m10', which don't exist as real `members` rows) — same
--     reasoning as the marketplace listings purge in Phase 2. The forum
--     starts empty; real threads accumulate from here on, from real
--     Wild-Apricot-signed-in members only.
--
--   - Repository tracks/sub-topics ARE carried over intact, unlike the
--     forum. Unlike a mock conversation, this structure is real: sub-topic
--     ids like 'rs-graft' and 'rs-vsh' are load-bearing — they're the
--     literal folder names under content/repository/ that real Markdown
--     articles and document attachments already live in (see js/content.js
--     and content/repository/manifest.json), and the URLs
--     #/repository/<id> members already have bookmarked. Only the mock
--     "curated by" attribution is dropped (it pointed at fake seed members
--     with no real `members` row) — repository_sub_topics.curator_id is a
--     nullable FK for a real Web Admin to set later, once more real
--     members exist.
--
-- Article/document content itself stays exactly as-is — flat files under
-- content/repository/, indexed by manifest.json, loaded by js/content.js —
-- this migration does not touch that at all.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Repository structure
-- ----------------------------------------------------------------------------

create table public.repository_tracks (
  id         text primary key,
  ord        text not null,
  name       text not null,
  blurb      text not null,
  sort_order int  not null
);

create table public.repository_sub_topics (
  id          text primary key,
  track_id    text not null references public.repository_tracks(id) on delete cascade,
  curator_id  uuid references public.members(id),
  name        text not null,
  summary     text not null,
  sort_order  int  not null
);

-- ----------------------------------------------------------------------------
-- Forum structure + member-authored content
-- ----------------------------------------------------------------------------

create table public.forum_categories (
  id         text primary key,
  name       text not null,
  sort_order int  not null
);

-- body holds the opening post — mirrors the app's existing model (a thread
-- is created with a title + first post together; forum_posts below is
-- replies only), so the view layer barely changes shape from the mock
-- version.
create table public.forum_threads (
  id          uuid primary key default gen_random_uuid(),
  category_id text not null references public.forum_categories(id),
  author_id   uuid not null references public.members(id),
  title       text not null,
  body        text not null,
  pinned      boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.forum_posts (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.forum_threads(id) on delete cascade,
  author_id  uuid not null references public.members(id),
  body       text not null,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Subscriptions — replaces the local 'thread:t1'-style string keys in
-- js/store.js's state.subs. subscribable_type reuses the exact short
-- prefixes the app already uses ('thread', 'cat', 'repo') rather than
-- introducing new enum names, so the view layer's existing `${type}:${id}`
-- key convention barely changes.
-- ----------------------------------------------------------------------------

create table public.subscriptions (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid not null references public.members(id) on delete cascade,
  subscribable_type text not null check (subscribable_type in ('thread', 'cat', 'repo')),
  subscribable_id   text not null,
  created_at        timestamptz not null default now(),
  unique (member_id, subscribable_type, subscribable_id)
);

-- Lets the UI show "N watching/subscribed" without every member needing
-- broad read access to who else is subscribed to what — subscriptions
-- stay self-only (see RLS below), this just exposes an aggregate count.
create function public.subscriber_count(p_type text, p_id text)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*) from public.subscriptions
  where subscribable_type = p_type and subscribable_id = p_id;
$$;

-- Batch form for a list of items (e.g. every thread on the forum index) —
-- avoids an N+1 round trip per row. Also why the "Members watching" avatar
-- list the mock forum thread page used to show is gone rather than
-- rebuilt: individual subscriber identity isn't broadly visible under this
-- schema's RLS (self-only, on purpose), only this kind of aggregate is.
create function public.subscriber_counts(p_type text, p_ids text[])
returns table(subscribable_id text, cnt bigint)
language sql
stable
security definer
set search_path = public
as $$
  select subscribable_id, count(*) as cnt
  from public.subscriptions
  where subscribable_type = p_type and subscribable_id = any(p_ids)
  group by subscribable_id;
$$;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------

alter table public.repository_tracks     enable row level security;
alter table public.repository_sub_topics enable row level security;
alter table public.forum_categories      enable row level security;
alter table public.forum_threads         enable row level security;
alter table public.forum_posts           enable row level security;
alter table public.subscriptions         enable row level security;

-- Structure tables: broadly readable, Web-Admin-only to change (adding a
-- track or sub-topic is a rare, deliberate admin action, same as
-- role_options in Phase 1).
create policy repository_tracks_select on public.repository_tracks
  for select to authenticated using (true);
create policy repository_tracks_write on public.repository_tracks
  for all to authenticated using (public.is_web_admin()) with check (public.is_web_admin());

create policy repository_sub_topics_select on public.repository_sub_topics
  for select to authenticated using (true);
create policy repository_sub_topics_write on public.repository_sub_topics
  for all to authenticated using (public.is_web_admin()) with check (public.is_web_admin());

create policy forum_categories_select on public.forum_categories
  for select to authenticated using (true);
create policy forum_categories_write on public.forum_categories
  for all to authenticated using (public.is_web_admin()) with check (public.is_web_admin());

-- forum_threads/forum_posts: broadly readable, self-service create,
-- author-or-Web-Admin edit/delete — same shape as marketplace_listings
-- in Phase 2.
create policy forum_threads_select on public.forum_threads
  for select to authenticated using (true);
create policy forum_threads_insert on public.forum_threads
  for insert to authenticated with check (author_id = public.current_member_id());
create policy forum_threads_update on public.forum_threads
  for update to authenticated
  using (author_id = public.current_member_id() or public.is_web_admin())
  with check (author_id = public.current_member_id() or public.is_web_admin());
create policy forum_threads_delete on public.forum_threads
  for delete to authenticated
  using (author_id = public.current_member_id() or public.is_web_admin());

create policy forum_posts_select on public.forum_posts
  for select to authenticated using (true);
create policy forum_posts_insert on public.forum_posts
  for insert to authenticated with check (author_id = public.current_member_id());
create policy forum_posts_update on public.forum_posts
  for update to authenticated
  using (author_id = public.current_member_id() or public.is_web_admin())
  with check (author_id = public.current_member_id() or public.is_web_admin());
create policy forum_posts_delete on public.forum_posts
  for delete to authenticated
  using (author_id = public.current_member_id() or public.is_web_admin());

-- subscriptions: self-only. Aggregate visibility for everyone else comes
-- through subscriber_count() above, not by loosening this.
create policy subscriptions_select on public.subscriptions
  for select to authenticated using (member_id = public.current_member_id());
create policy subscriptions_insert on public.subscriptions
  for insert to authenticated with check (member_id = public.current_member_id());
create policy subscriptions_delete on public.subscriptions
  for delete to authenticated using (member_id = public.current_member_id());

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------

grant select, insert, update        on public.repository_tracks     to authenticated;
grant select, insert, update        on public.repository_sub_topics to authenticated;
grant select, insert, update        on public.forum_categories      to authenticated;
grant select, insert, update, delete on public.forum_threads         to authenticated;
grant select, insert, update, delete on public.forum_posts           to authenticated;
grant select, insert, delete        on public.subscriptions         to authenticated;

grant execute on function public.subscriber_count(text, text) to authenticated;
grant execute on function public.subscriber_counts(text, text[]) to authenticated;

-- ----------------------------------------------------------------------------
-- Seed: the real repository structure and forum categories, carried over
-- from js/data.js exactly (see this file's header comment for why the
-- repository side, specifically, is seeded rather than starting empty).
-- ----------------------------------------------------------------------------

insert into public.repository_tracks (id, ord, name, blurb, sort_order) values
  ('rp-foundation', 'I',   'Foundation',
   'Queen rearing from first principles, plus the hygiene and nutrition groundwork that determines whether anything else you do will work.', 1),
  ('rp-production',  'II',  'Queen Production',
   'Scaling from a dozen cells on the kitchen bench to a commercial operation, and the systems that stop quality collapsing as volume rises.', 2),
  ('rp-breeding',    'III', 'Queen Breeding',
   'Establishing and maintaining a breeding program: queen lines, assessment and selection, and bringing outside traits in without losing what you have.', 3);

insert into public.repository_sub_topics (id, track_id, name, summary, sort_order) values
  ('rs-graft',   'rp-foundation', 'Grafting and cell raising',           'Larval age selection, cell bar setup, and why a starter colony fails.', 1),
  ('rs-nutri',   'rp-foundation', 'Colony nutrition for queen rearing',  'Pollen reserves, protein supplements, and the timing that matters.', 2),
  ('rs-hygiene', 'rp-foundation', 'Apiary hygiene and disease basics',   'Equipment sterilisation, AFB awareness, and moving frames safely between colonies.', 3),
  ('rs-mating',  'rp-foundation', 'Mating nucs and queen introduction',  'Nuc configuration, introduction methods, and acceptance rates.', 4),
  ('rs-record',  'rp-foundation', 'Record keeping for beginners',        'The minimum you must write down for your data to be worth anything later.', 5),
  ('rs-scale',   'rp-production', 'Scaling cell production',            'Cell builder rotation, batch scheduling, and realistic weekly throughput.', 1),
  ('rs-yard',    'rp-production', 'Mating yard design and management',  'Drone saturation, yard spacing, orientation, and heat management.', 2),
  ('rs-banking', 'rp-production', 'Queen banking and shipping',         'Bank colony maintenance, cage types, and interstate freight requirements.', 3),
  ('rs-labour',  'rp-production', 'Labour, timing and season planning', 'Building a production calendar backwards from your customers'' delivery dates.', 4),
  ('rs-qa',      'rp-production', 'Quality control at volume',          'Sampling regimes, cull criteria, and what to do when a batch is off.', 5),
  ('rs-assess',  'rp-breeding',   'Assessment methods',                 'Freeze-killed brood, recapping counts, alcohol wash, and what each measure is actually good for.', 1),
  ('rs-select',  'rp-breeding',   'Selection and breeding value',       'Ranking colonies, weighting traits, and avoiding selection on noise.', 2),
  ('rs-lines',   'rp-breeding',   'Establishing and maintaining lines', 'Founding a line, generation records, and monitoring for inbreeding depression.', 3),
  ('rs-integ',   'rp-breeding',   'Integrating outside stock',          'Outcrossing strategy, backcross recovery, and keeping trait gains through the introduction.', 4),
  ('rs-ii',      'rp-breeding',   'Instrumental insemination',          'Equipment, technique, semen storage, and when II earns its considerable cost.', 5),
  ('rs-vsh',     'rp-breeding',   'VSH: the trait and its measurement', 'What varroa sensitive hygiene is, how it is inherited, and how to measure it defensibly.', 6);

insert into public.forum_categories (id, name, sort_order) values
  ('fc-field',  'Field practice',         1),
  ('fc-assess', 'Assessment & assays',    2),
  ('fc-genet',  'Genetics & lines',       3),
  ('fc-gear',   'Equipment',              4),
  ('fc-admin',  'Association',            5);
