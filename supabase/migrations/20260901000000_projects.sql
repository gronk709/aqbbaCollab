-- ============================================================================
-- Phase 6 of the backend migration: Projects (per js/data.js's own phase
-- numbering — queen lines and apiaries/hives/inspections, Phases 4-5, are
-- still mock, unmigrated; done out of order because this is what was
-- asked for). Moves js/data.js's `projects` array and js/store.js's
-- localStorage patches for it onto real Postgres, and adds the
-- permission model requested alongside it: only Web Admin creates or
-- deletes a project; two new per-project-assignable roles (Project
-- Manager, Contributor) get real, RLS-enforced rights over a project's
-- *content* — never the project row itself.
--
-- Purge decision, same reasoning as Phase 2/3: of the five seed projects
-- (PRJ-00..PRJ-04), only PRJ-00 (the VSH program) carries over. PRJ-01..04
-- are dropped per this request, not because they're fake — but because
-- they exist only as illustrative example content and the request was to
-- remove them. PRJ-00's own background/aims/questions/timeline/
-- participation text is real, authored content and carries over intact;
-- its `coordinators`/`participants`, however, reference mock seed members
-- ('m1', 'm5', ...) that don't exist as real `members` rows (same gap
-- Phase 2/3 hit with mock listings/threads), so those do NOT carry over —
-- the program starts with zero real participants until real members join.
--
-- Content model: a project's identity (id, code, status, title, summary,
-- sites) lives on `projects` itself and is Web-Admin-only to write, same
-- as create/delete. Everything narrative (background, aims, questions,
-- timeline, participation) lives in `project_sections` — one row per
-- bullet/paragraph — specifically so "add/update" and "delete" are
-- genuinely different SQL operations (INSERT/UPDATE vs DELETE) that RLS
-- can gate separately: a Contributor can insert and update a section row
-- but not delete one; a Project Manager (or Web Admin) can do all three.
-- `topics` (the flagship program's link-out panel — only PRJ-00 has one)
-- stays a plain jsonb column on `projects`, Web-Admin-only, since it's
-- app navigation config, not project content.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- New roles
-- ----------------------------------------------------------------------------

insert into public.role_options (name, description, sort_order) values
  ('Project Manager', 'Update and delete content (background, aims, questions, timeline, participation, participants) on research projects they''ve been assigned to manage. Cannot create or delete a project itself, or manage a project they haven''t been assigned to.', 7),
  ('Contributor',      'Add and update content on research projects they''ve been assigned to support. Cannot delete project content, and cannot create, delete, or manage a project.', 8);

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

create table public.projects (
  id         text primary key,                 -- 'p0' — the VSH program's dashboard route (#/projects/p0/dashboard) hardcodes this id, so it's kept stable rather than switched to a uuid
  code       text not null unique,              -- 'PRJ-00', display-only
  status     text not null check (status in ('active', 'recruiting', 'concluding')),
  title      text not null,
  summary    text not null,
  sites      jsonb not null default '[]',       -- apiary ids; apiaries hasn't migrated off js/data.js yet, so this is a plain array, not an FK
  open_sites boolean not null default true,
  topics     jsonb,                             -- the VSH program's link-out panel (dashboard/apiaries/repository); nullable, Web-Admin-only, not part of the content model below
  created_at timestamptz not null default now()
);

-- One row per bullet/paragraph. `section` distinguishes which part of the
-- project page it belongs to; sort_order controls display order within a
-- section. A single-paragraph field (timeline, participation's summary/
-- addons) is just a section that conventionally holds one row.
create table public.project_sections (
  id         uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  section    text not null check (section in (
               'background', 'aims', 'questions', 'timeline',
               'participation_summary', 'participation_method', 'participation_addons'
             )),
  body       text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index project_sections_project_idx on public.project_sections (project_id, section, sort_order);

create table public.project_participants (
  project_id   text not null references public.projects(id) on delete cascade,
  member_id    uuid not null references public.members(id) on delete cascade,
  contribution text,
  joined_at    timestamptz not null default now(),
  primary key (project_id, member_id)
);

-- The actual permission grant — per project, same shape as apiary_managers
-- (Phase 1). Holding the "Project Manager"/"Contributor" role in
-- member_roles is just a label; this table is what a member can actually
-- do, and only on the specific project(s) a Web Admin has assigned them
-- to, exactly like Apiary Manager's site-scoped grant.
create table public.project_team (
  project_id   text not null references public.projects(id) on delete cascade,
  member_id    uuid not null references public.members(id) on delete cascade,
  access_level text not null check (access_level in ('manage', 'contribute')),
  granted_by   uuid references public.members(id),
  granted_at   timestamptz not null default now(),
  primary key (project_id, member_id)
);

-- ----------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER + fixed search_path, same reasoning
-- as current_member_id()/is_web_admin() in Phase 1: short RLS predicates
-- that can't be tricked by search_path and don't recurse into RLS).
-- ----------------------------------------------------------------------------

create function public.project_access_level(p_project_id text, p_member_id uuid default public.current_member_id())
returns text
language sql
stable
security definer
set search_path = public
as $$
  select access_level from public.project_team
  where project_id = p_project_id and member_id = p_member_id;
$$;

-- Contribute-or-better: Web Admin, or assigned 'manage'/'contribute' on
-- this specific project. Gates insert/update on project content.
create function public.can_contribute_project(p_project_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_web_admin() or public.project_access_level(p_project_id) in ('manage', 'contribute');
$$;

-- Manage-or-better: Web Admin, or assigned 'manage' on this specific
-- project. Gates delete on project content (never the project row).
create function public.can_manage_project(p_project_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_web_admin() or public.project_access_level(p_project_id) = 'manage';
$$;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------

alter table public.projects             enable row level security;
alter table public.project_sections     enable row level security;
alter table public.project_participants enable row level security;
alter table public.project_team         enable row level security;

-- projects: broadly readable; create/update/delete is Web-Admin-only, in
-- full — including the "content-ish" title/summary fields, since the
-- request was specifically that only Web Admin adds or deletes a
-- project, and this row is the project's identity, not its narrative
-- content (that's project_sections, below).
create policy projects_select on public.projects
  for select to authenticated using (true);
create policy projects_insert on public.projects
  for insert to authenticated with check (public.is_web_admin());
create policy projects_update on public.projects
  for update to authenticated using (public.is_web_admin()) with check (public.is_web_admin());
create policy projects_delete on public.projects
  for delete to authenticated using (public.is_web_admin());

-- project_sections: broadly readable; add/edit open to Contributor-or-
-- better, delete restricted to Manager-or-better — the actual mechanism
-- behind "Contributor can add/update but not delete."
create policy project_sections_select on public.project_sections
  for select to authenticated using (true);
create policy project_sections_insert on public.project_sections
  for insert to authenticated with check (public.can_contribute_project(project_id));
create policy project_sections_update on public.project_sections
  for update to authenticated
  using (public.can_contribute_project(project_id))
  with check (public.can_contribute_project(project_id));
create policy project_sections_delete on public.project_sections
  for delete to authenticated using (public.can_manage_project(project_id));

-- project_participants: broadly readable; a member can always add or
-- remove themself (the existing self-service "join a project" flow),
-- and Contributor-or-better can add/update anyone's row (recording
-- someone else's contribution), but only Manager-or-better can remove
-- someone else.
create policy project_participants_select on public.project_participants
  for select to authenticated using (true);
create policy project_participants_insert on public.project_participants
  for insert to authenticated
  with check (member_id = public.current_member_id() or public.can_contribute_project(project_id));
create policy project_participants_update on public.project_participants
  for update to authenticated
  using (member_id = public.current_member_id() or public.can_contribute_project(project_id))
  with check (member_id = public.current_member_id() or public.can_contribute_project(project_id));
create policy project_participants_delete on public.project_participants
  for delete to authenticated
  using (member_id = public.current_member_id() or public.can_manage_project(project_id));

-- project_team: the grant itself is Web-Admin-only to change, same as
-- apiary_managers; broadly readable so a project's page can show who
-- manages/contributes to it.
create policy project_team_select on public.project_team
  for select to authenticated using (true);
create policy project_team_write on public.project_team
  for all to authenticated using (public.is_web_admin()) with check (public.is_web_admin());

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------

grant select, insert, update, delete on public.projects             to authenticated;
grant select, insert, update, delete on public.project_sections     to authenticated;
grant select, insert, update, delete on public.project_participants to authenticated;
grant select, insert, update, delete on public.project_team         to authenticated;

grant execute on function public.project_access_level(text, uuid) to authenticated;
grant execute on function public.can_contribute_project(text)     to authenticated;
grant execute on function public.can_manage_project(text)         to authenticated;

-- ----------------------------------------------------------------------------
-- Seed: PRJ-00 only, carried over from js/data.js exactly (see header).
-- ----------------------------------------------------------------------------

insert into public.projects (id, code, status, title, summary, sites, open_sites, topics) values (
  'p0', 'PRJ-00', 'active',
  'Varroa Sensitive Hygiene Breeding Program',
  'The association''s flagship program: breeding and assessing queen lines for varroa sensitive hygiene across three research apiaries, against a common protocol.',
  '["ap-tambo", "ap-barrow", "ap-oradale"]',
  true,
  '[
    {"name": "Research dashboard", "href": "#/projects/p0/dashboard",
     "desc": "Live status of every hive across the three research apiaries — colony status, VSH scores, mite loads, inspections and contributing lines."},
    {"name": "Research apiaries", "href": "#/apiaries",
     "desc": "Site records for Tambo Crossing, Barrowfield and Oradale: hive grids, queen lines on site, and inspection schedules."},
    {"name": "Assessment methods", "href": "#/repository/rs-assess",
     "desc": "The standard protocols every program assessment uses, and what each measure is actually good for."},
    {"name": "VSH: the trait and its measurement", "href": "#/repository/rs-vsh",
     "desc": "What varroa sensitive hygiene is, how it is inherited, and how to measure it defensibly."}
  ]'
);

insert into public.project_sections (project_id, section, body, sort_order) values
  ('p0', 'background', 'Varroa sensitive hygiene — the heritable behaviour by which workers detect and remove mite-infested brood — is the most promising path to keeping bees without standing miticide treatment. Overseas programs have shown the trait can be concentrated by selection; whether that holds under Australian conditions, with Australian stock and forage, is the question this program exists to answer.', 1),
  ('p0', 'background', 'The program runs across three research apiaries at different stages of the selection cycle: Tambo Crossing, the closed-population reference site; Barrowfield, where candidate lines are assessed against the Tambo benchmark; and Oradale, commissioned in 2026 to extend the program into subtropical conditions. Members contribute queen lines, host colonies, and record assessments against a common protocol, and every member sees every other member''s results alongside their own.', 2),

  ('p0', 'aims', 'Establish and maintain Australian queen lines with reliable, heritable VSH expression.', 1),
  ('p0', 'aims', 'Measure every colony in the program against one shared assessment protocol, so results are comparable across sites, seasons and operators.', 2),
  ('p0', 'aims', 'Grow the number of colonies running treatment-free without collapsing survival or productivity.', 3),
  ('p0', 'aims', 'Publish an annual line performance table members can select and breed from with confidence.', 4),

  ('p0', 'questions', 'Which lines hold their VSH expression across different climates and forage conditions?', 1),
  ('p0', 'questions', 'How many generations of selection does a line need before treatment-free management is defensible?', 2),
  ('p0', 'questions', 'Can VSH be concentrated without the inbreeding penalties seen in narrow closed populations?', 3),

  ('p0', 'timeline', 'Running since 2019. Tambo Crossing is nine generations in; Barrowfield is mid-assessment against the Tambo benchmark; Oradale was commissioned March 2026. The annual line performance table is published each autumn.', 1),

  ('p0', 'participation_summary', 'The program is open to any member. Contribute a queen line for assessment, host program colonies at your own apiary, or take part in the structured assessments run at the three research sites.', 1),
  ('p0', 'participation_method', 'Queen lines enter through a contributing breeder and are assessed for at least two full seasons before appearing in the line performance table.', 1),
  ('p0', 'participation_method', 'All assessment uses the program''s standard protocols — freeze-killed brood assay, alcohol wash, brood pattern and recapping counts — recorded at the point of inspection.', 2),
  ('p0', 'participation_method', 'Colonies under miticide treatment stay in the program but are excluded from selection data for the cycle.', 3),
  ('p0', 'participation_addons', 'Members outside the three research sites can still contribute: run the standard assessments on your own stock and submit season data, or volunteer your apiary as a future satellite site.', 1);
