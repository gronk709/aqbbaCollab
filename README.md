# AQBBA — Queen Breeders Collaboration Platform

A members-only platform for the Australian Queen Bee Breeders Association: a varroa
sensitive hygiene (VSH) research dashboard, a topic-driven forum, a structured
information repository, and a member marketplace.

This is a **high-fidelity prototype**. Every screen, interaction and state transition is
real; the data behind them is mock data, and the two external integrations (Wild Apricot
authentication, notification email) are stubbed at their boundaries so they can be
swapped for live services without reworking the interface.

## Running it

No build step and no dependencies — not even Node. Serve the directory over HTTP, since ES
modules will not load from `file://`:

```bash
python3 serve.py
```

Then open <http://localhost:4173>. Correct Wild Apricot or direct sign-in credentials are required.

`serve.py` is a plain static server that adds `Cache-Control: no-store`. Use it rather
than `python3 -m http.server`, which sends no cache headers at all and lets the browser
serve stale JS and CSS after an edit.

## What's built

**Sign-in gate** — the only surface outside the member wall, per the members-only access
model. Offers Wild Apricot SSO (simulated handoff) or direct credentials.

**The VSH program is itself a project.** The Varroa Sensitive Hygiene Breeding Program is
PRJ-00 — the flagship entry on the Projects page, with the same structure any project
gets (Background, Aims, Questions, Participation, Timeline, a Project team, Participants).
What it has that a single-question project doesn't is a **Topic areas** panel
(an optional `topics` field on any project) linking to its working surfaces: the research
dashboard, the apiary records, and the two assessment-related repository sub-topics.
Because the program is the organizing concept, **Projects is the landing page** (`#/`);
there is no top-level Dashboard nav item any more.

**Research dashboard** (`#/projects/p0/dashboard`) — a topic area of PRJ-00, reached from
the program's summary page and breadcrumbed back to it. Program-wide figures, then a card
per research apiary showing location, coordinates, apiary status (Establishing /
Assessment / Maintenance / Re-queening), manager, hive count, mean VSH, hives being
treated and hives treatment-free for three or more seasons. Below that: the honeycomb
hive grid, a colony status breakdown (hive status is its own separate field — Thriving /
Good / Average / Poor / Treating, recorded per hive and updatable via Log Inspection),
upcoming and recently completed inspections, and the contributing breeders with their
queen lines — the program's other two editable records, Web Admin only:

- **Queen lines** — name, breeder, generation, mean VSH, and a note. Hives reference a
  line by an internal code (`hive.line`), same reasoning as hive ids, but that code is
  never shown or entered anywhere — members only see and edit the line's name, which can
  change over time, while the code stays fixed and is generated automatically
  (`js/store.js`'s `addQueenLine`/`lineByCode`/`allQueenLines`).
- **Breeders** — a queen line's breeder is either an existing member, or a standalone
  breeder record (name, state, note) for someone contributing a line who isn't a
  registered platform member. Standalone breeders have no login and no roles; they exist
  purely to be credited on a line (`addBreeder`/`breederById` in `js/store.js`), since this
  app has no general "Add Member" feature — membership is meant to come from Wild Apricot,
  not be created here.

Every apiary and hive field is editable after creation, not just status — **Edit apiary**
(on the apiary's own page) covers name, region, coordinates, year established, status,
manager and dominant flora; **Edit** on a selected hive's readout covers everything set
at registration (status, queen line, queen ID, queen marking, hive configuration, UBEEO/
Harbo results, treatment-free seasons, comments) except the hive ID itself, which stays
fixed once assigned since inspections and other records refer to it. Both are stored the
same way as role/contact overrides — `updateApiary` / `updateHive` in `js/store.js` —
merged on top of the seed or member-added record whenever it's read, and gated by the
same manager/Web Admin permission as adding a hive or logging an inspection at that site.

**Apiary records** (`#/apiaries`) — a comparison table across sites, then per-apiary: the
full hive grid, queen lines present with site performance measured against each line's
program mean, the complete inspection schedule, site detail, and which research projects
are currently running there. This is also where the program's own data gets maintained:
**Add apiary** registers a new research site, **Add hive** registers a new hive at a site
(the hive ID and the queen's own ID are both entered at registration, validated for
uniqueness against every existing hive — the queen's breeding line, a separate field, is
picked from a dropdown), and **Log inspection** records a completed or scheduled
inspection against one, several, or all of an apiary's hives. Inspections are
hive-level, not just an apiary headcount: the form's Apiary field is itself a picker
(scoped to whichever sites the signed-in member can edit), its Hives field is a checklist
of that apiary's actual hives with an "All hives" toggle, and an optional Status field
updates every selected hive's status the moment the inspection is saved — so an inspection
is how a hive's status changes after it's first registered, not just a log entry (see
`setHiveStatus` / `addInspection` in `js/store.js`). Inspection type is one of three
categories — Assessment, Maintenance, Biosecurity — rather than a specific assay name;
older, more specific seed inspections keep that detail in their notes instead. These
maintenance flows are meaningfully different from the member-facing composers elsewhere
(forum, marketplace, repository) — they alter the program's research data rather than
adding social content, so they're access-gated: adding a new apiary is Web Admin only,
and adding a hive or logging an inspection at an existing site requires Web Admin or that
site's manager grant (see "Roles & apiary access" below).

**Manager details** (`#/managers/:id`) — phone, email and postal address for whoever is
listed as an apiary's manager. Phone and email are mandatory once a record is saved
(validated on submit — an email that doesn't look like an email is rejected, and the
record is never left half-filled); address is optional. Reached from the manager's name
on the apiaries table and on each apiary's detail page, where an unfilled manager also
gets a small "No contact on file" flag. The page also lists every site that member
manages. This is keyed by member id, not by the literal "Apiary Manager" role — in the
seed data, Ani Rahmawati (a Breeder) manages Oradale, and the page works the same either
way, since who runs a given site is whoever `apiary.manager` names, not a fixed job title.

**Roles & apiary access** — also on the manager details page. A member can hold several
roles at once (e.g. a Breeder who is also an Apiary Manager), edited from a fixed list
(`roleOptions` in `js/data.js`), each carrying a short description shown next to its
checkbox in the roles editor:

- **Web Admin** — superuser; full access everywhere, including every apiary and every
  member's roles/access grants.
- **Apiary Manager** — complete CRUD privileges for the apiary they manage.
- **Operator** — assists the Apiary Manager with inspections and data updates; change
  and update privileges only, no create or delete.
- **Breeder** — change and update privileges only. Replaces the old Breeder — Level 1/2/3,
  Instrumental Insem., and Laboratory — Assays roles, which have been retired.
- **Member** — read-only on apiary data and the repository; full forum access (publish,
  subscribe, notifications) and can list items in the Marketplace.
- **Creator** — add and update content (articles, documents) on repository sub-topics
  they've been assigned to support; cannot delete content, create a track/sub-topic, or
  manage one they haven't been assigned to.
- **Project Manager** — update and delete content (background, aims, questions, timeline,
  participation, participants) on research projects they've been assigned to manage.
- **Contributor** — add and update project content on projects they've been assigned to
  support; cannot delete content, and cannot create, delete, or manage a project.
- **Repository Manager** — add, edit and delete content on repository sub-topics they've
  been assigned to manage; cannot create a new track/sub-topic, or manage one they
  haven't been assigned to.

Holding the "Apiary Manager" title is not itself a site-level permission — actual edit
access to a specific site (adding a hive, logging an inspection) is a separate grant,
checked per apiary via `canEditApiary` in `js/store.js`. A member with that grant for
Barrowfield cannot touch Oradale's data unless separately granted there too; Web Admin
can always edit every site, and creating a brand-new apiary is Web Admin only. Project
Manager/Contributor and Repository Manager/Creator follow the identical pattern one
level down: the role tag is a label, and a Web Admin separately assigns a member
'manage' or 'contribute' access to one specific project or repository sub-topic
(`project_team` / `repository_team` — see "Projects" and "Repository" above), never
apiary-wide, project-wide or repository-wide by default. Creating a track/sub-topic
itself, like creating a brand-new project, stays Web-Admin-only. Editing roles and
grants themselves is restricted to Web Admin.

These checks run against the real signed-in member (`currentUser()`) now that Wild
Apricot sign-in is real. Earlier in the prototype, before that existed, everyone who
opened the app was signed in as the same seed Web Admin, so a rail selector let a tester
"preview" the apiary/repository checks as if signed in as someone else — clearly marked
`(prototype)`, never affecting authorship of forum posts, listings, or project joins. It
has since been removed (`previewUser`/`setPreviewAs` in `js/store.js`, the rail's
"Preview access as" selector) now that a real per-member identity makes it redundant.

**Projects** (`#/projects`) — coordinated research initiatives, distinct from apiaries: a
project is a question with a method attached, and can span apiaries, run at one, or wait
for a member to volunteer a site. Real Postgres rows now (Phase 6 of the backend
migration — see "Hosting & backend" below): only a Web Admin creates or deletes a
project; its content — Background, Aims, Research questions, Participation & methods, a
Timeline — is what the Project Managers and Contributors a Web Admin assigns to it can
add, edit and (Project Manager only) delete, one bullet/paragraph at a time, from the
project's own page. Any member can still join or leave a project with a stated
contribution regardless of team assignment — that's unrelated to content permissions,
same as it was before. Of the original five seed projects only PRJ-00 (the VSH program)
remains; the other four, each originally proposed from a forum discussion by a member,
were removed, and project creation is Web-Admin-only from here on rather than a
member-facing "propose" flow.

**Forum** (`#/forum`) — real member discussions now (Phase 3 of the backend migration —
see "Hosting & backend" below), starting empty rather than the six invented seed
discussions this used to show. Members create topics, subscribe to topics or whole
categories, and set email delivery frequency (each post / daily digest / weekly digest).
A published topic's own title/body is frozen for its author from then on (Web Admin can
still edit or remove one, for moderation) — replies were never frozen the same way, and
their own author (or Web Admin) can delete one outright. Any post — the topic's opening
one or a reply — can carry links and documents (PDF, Word, text, spreadsheet, slide
files, real Supabase Storage uploads via a signed URL, never a public link): add one at
any time from the post itself, and a thread page's own Attachments panel lists every one
across the whole topic with a link back to the post that added it.

**Repository** (`#/repository`) — the three tracks from the brief (Foundation → Queen
Production → Queen Breeding), sixteen sub-topics, each independently subscribable —
real Postgres rows (Phase 3). Content comes from two merged sources: the original
**real association material** under `content/repository/` (Markdown articles, an
article reader at `#/repository/<sub>/<slug>`, and document attachments served as
download links — see "Authoring repository content" below, unchanged and permanent),
and articles/documents **published from inside the app** (real Supabase rows and
Storage uploads — the "Contribute"/"Add item" composer actually writes now, rather
than simulating it). Publishing is scoped per sub-topic, the same shape as an
apiary's or project's own manager grant: a Web Admin assigns a member "Repository
Manager" (add, edit, delete) or "Creator" (add, edit) access to one specific
sub-topic. A sub-topic with no content at all yet shows an honest "no content here
yet" empty state.

**Marketplace** (`#/marketplace`) — queens, nucs, semen and equipment, filterable by
category, with a listing composer and a seller enquiry flow.

**Notifications** (`#/notifications`) — every notification the subscription machinery
would have emailed, with unread state, plus a summary of everything the member follows.

## The honeycomb grid

The dashboard renders all ~100 hives in an apiary as one interlocking honeycomb field.
Each hexagon is a real hive record; click it to read that hive's four assessment data
points (VSH/UBEEO score, mite load/Harbo assay result, hive configuration, last
inspection) plus its queen line, its own queen ID, contributing breeder, queen marking,
and any comments recorded when the hive was registered.

Cell colours quote the **international queen-marking colour code** — the one colour
system every queen breeder already reads fluently — rather than an arbitrary palette.

## Design

- **Crest** — `assets/logo.png` is the association's own crest, background removed so it
  sits cleanly on both the dark rail and the cream page ground (`assets/logo-original.png`
  is the untouched upload, kept as a backup). It's used at real size (36–44px) rather than
  icon scale, since the fine detail — the circular wordmark, the bee anatomy — is
  illegible any smaller.
- **Palette** — comb wax ground (`#F7F4ED`), propolis ink (`#241C12`), and an action
  colour (`#8D491C`) sampled directly from the crest rather than chosen freehand. A second
  accent, `--amber-bright` (`#CD631D`), exists specifically for text/icons/focus rings
  against the dark propolis ground — the base action colour is a fairly dark rust, and
  reads at a poor contrast ratio (2.5:1) directly on near-black, so anywhere the accent
  sits on the dark rail or the gate hero uses the brighter variant instead. Status colours
  are unrelated to brand and still come from the queen-marking code.
- **Type** — Spectral for display and long-form prose (a scientific-journal serif),
  Instrument Sans for interface, IBM Plex Mono for hive IDs, scores and dates, so field
  data reads as data.
- **Ordinals** — the repository's I / II / III are used because the tracks are a genuine
  progression a member works through in order. They appear nowhere else.

Responsive to 375px, keyboard focus visible throughout, `prefers-reduced-motion`
respected.

## File layout

```
index.html
css/main.css          Design tokens and all component styles
js/
  app.js              Shell, hash router, delegated global behaviour
  data.js             Mock data. Seeded generator — hive records are stable across reloads
  store.js            Session state: subscriptions, read state, member-authored content
  ui.js               Render helpers, icon set, toasts, modals
  views/
    gate.js           Sign-in
    dashboard.js      Research dashboard
    comb.js           The honeycomb grid and hive readout
    apiaries.js       Apiary index and per-apiary record
    managers.js       Manager contact details: view, edit, validate
    projects.js       Research initiatives: index, detail, content editor, team, join
    forum.js          Topic list, thread view, composer
    repository.js     Tracks, sub-topics, article reader
    marketplace.js    Listings, filters, composer, enquiry
    notifications.js  Activity feed and subscription summary
  content.js          Repository content loader + minimal Markdown renderer
content/repository/   Real repository content: articles, documents, manifest
tools/rebuild_manifest.py   Regenerates the content manifest from disk
```

## Authoring repository content

There are two ways to add repository content now, deliberately kept separate. This
section covers the older, permanent one: real association material committed as plain
files in the repo — no CMS, no build step. Use it for material meant to last (the kind
of thing a Web Admin or the association itself stands behind). For a quick addition by
whoever's been assigned Repository Manager/Creator access to a sub-topic, use the
in-app "Contribute"/"Add item" composer instead — see "Repository" above and the
"Roles & apiary access" section for how that access is granted. Both sources are read
side by side on the same sub-topic page.

To add or change a file-based item:

1. Put files in `content/repository/<sub-topic-id>/` (the ids are in `js/data.js`:
   `rs-graft`, `rs-nutri`, `rs-vsh`, and so on — also the real, authoritative
   `repository_sub_topics` table now that Phase 3 of the backend migration has landed;
   the two are seeded to match exactly, but adding a genuinely new sub-topic beyond the
   current sixteen means a Web Admin inserting a row there too, not just adding files).
   - **Articles** are Markdown files with a front-matter header:

     ```markdown
     ---
     title: Scoring partial removals in the freeze-killed brood assay
     author: m9            # a member id from js/data.js, or a plain name
     date: 2026-08-07      # ISO date; newest article is featured on the page
     summary: One line shown in the article list.
     ---

     Body in Markdown: ## headings, **bold**, *italic*, lists, > quotes, links.
     ```

     Link to a specific document or link attachment already in this sub-topic's
     Documents panel with `[label](doc:some-slug)` — `some-slug` is matched against
     the attachment's display name, slugified the same way
     `tools/rebuild_manifest.py` slugs filenames (lowercased, non-alphanumeric runs
     collapsed to a single `-`), as a substring so it doesn't need to be exact: the
     attachment "Larry Connor - 'Queen Rearing Essentials'" is reachable as
     `doc:queen-rearing-essentials` or even just `doc:connor`. Clicking it scrolls to
     and briefly highlights that row instead of opening a second copy of the link —
     works the same way whether the target is a file-based attachment above or one
     added through the in-app composer below. This is the same Markdown renderer
     (`js/content.js`'s `mdToHtml`) both kinds of articles use — nothing special
     about file-based content specifically.

   - **Documents** (PDF, Word, Excel, images) go in the same folder and appear as
     download links with type and size. An optional `_names.json` in the folder maps
     filenames to proper display titles.

2. Run `python3 tools/rebuild_manifest.py` — it regenerates
   `content/repository/manifest.json` from what's on disk.
3. Commit and push. The app reads only the manifest at boot and fetches article bodies
   on demand.

The in-app "Contribute" form is real now (`repository_articles`/`repository_documents`
in Supabase) — it's a second, parallel source rather than a replacement for the
files-and-push path above, which stays exactly as it was for real, permanent
association material.

**Copyright note:** this repo is public. Only commit documents you have the right to
redistribute — your own material and openly-licensed references (e.g. the COLOSS
standard-methods series). Publisher PDFs should stay out unless the repo goes private.

## Hosting & backend

**Decision: Vercel (hosting) + Supabase, Sydney region (Postgres + auth + Edge
Functions).** Vercel deploys straight from this GitHub repo on every push, no separate
build config needed since the app has no build step. Supabase was chosen over a plain
managed Postgres because it also gives small serverless "Edge Functions" — the natural
home for the Wild Apricot token exchange (see below), so it solves hosting the database
*and* hosting the one piece of server-side logic this app needs, rather than requiring a
second platform for that. Sydney region matters here specifically because the program
stores member personal data (phone, email, home address) — keeping it in Australia is
free on Supabase and awkward to change after the fact.

Both have free tiers that comfortably cover AQBBA's scale; there's no reason to pay until
real usage says otherwise. Setup, once you're ready to move off `serve.py`:

1. **Supabase** — sign up at supabase.com, create a new project, and pick the **Sydney
   (ap-southeast-2)** region at creation time (this can't be changed later without
   migrating). The project's **Connect** dialog (or Settings → API Keys) gives you the
   values for `.env.local` (copy `.env.example` from the repo root) — `SUPABASE_URL` and
   `SUPABASE_PUBLISHABLE_KEY` are safe to expose in frontend code; `SUPABASE_SECRET_KEY`
   is not and never leaves server-side environment variables. (Supabase renamed these
   from `anon`/`service_role` in 2025 — the old keys still work but are being phased out,
   so use the new publishable/secret pair for anything set up now.)
2. **Vercel** — sign up at vercel.com with the same GitHub account this repo is under,
   then "Import Project" and select it. No configuration should be needed for the static
   site to deploy; every push to `main` then auto-deploys.
3. Add the Supabase and Wild Apricot environment variables to the Vercel project's
   Settings → Environment Variables (not committed to the repo — that's what
   `.env.example` documents instead of real values).
4. **Edge Functions deploy themselves** — `.github/workflows/deploy-supabase-functions.yml`
   runs `supabase functions deploy` on every push to `main` that touches
   `supabase/functions/`, so merging a PR is enough; nobody needs to run the CLI by hand
   afterward. One-time setup: add a `SUPABASE_ACCESS_TOKEN` repository secret (Supabase
   dashboard → Account → Access Tokens — a personal CLI/Management API token, not the
   project's anon/service-role key). Each function's own header comment still shows the
   one-off manual command (`supabase functions deploy <name>`) too, useful for deploying
   a single function immediately without waiting on a push.

**Backend migration, in progress.** The app is moving off mock data + localStorage onto
real Postgres tables with Row Level Security, entity by entity — see
`/root/.claude/plans/zazzy-swinging-scone.md` for the full phased plan (identity first,
then marketplace, forum/repository, queen lines/breeders, apiaries/hives/inspections,
projects, notifications, then a final cleanup pass). Phases aren't strictly done in that
order — Projects (Phase 6) landed before queen lines/breeders and apiaries/hives/
inspections (Phases 4-5), simply because that's what was needed next.

Phase 1 (identity — `members`, `member_roles`, `apiary_managers`, contact details, and
the Wild Apricot auth bridge) is **live and verified**: a real Wild Apricot sign-in
resolves to a real `members` row over a real Supabase session, RLS-gated.

Phase 2 (marketplace listings — deliberately the simplest entity, done to prove the
read/write/RLS pattern cheaply before the bigger ones) is **live and verified**. It
introduced two things every later phase reuses: every migrated entity requires a real
Wild Apricot sign-in specifically (the old simulated demo sign-in has no Supabase session
and a non-UUID id, so it gets a clear "needs a real sign-in" message rather than being
able to browse or post), and `js/app.js`'s router supports a `load` function per route —
run before the still-synchronous view, with a loading state, an error panel with retry,
and a small cache invalidated on real navigation or right after a successful write.

Phase 3 (forum + repository metadata + subscriptions —
`supabase/migrations/20260829000000_forum_repository_subscriptions.sql`) is **live and
verified**. Two different purge decisions in this one phase, worth remembering: the
forum's six seed discussions don't carry over (invented conversations by fake seed
members, same reasoning as Phase 2's listings), but the repository's three tracks and
~16 sub-topic ids (`rs-graft`, `rs-vsh`, etc.) **do** carry over intact — those ids are
load-bearing, referenced by real Markdown articles and documents already committed under
`content/repository/`, which this phase doesn't touch at all (article content stays
exactly as file-based as before — see "Authoring repository content" above; there's no
plan to move it into Postgres). One real, deliberate product change: a thread's "N
watching" is a real aggregate count now (via a `subscriber_count`/`subscriber_counts`
RPC), but the old "Members watching" avatar list is gone — individual subscriber
identity isn't broadly visible under this schema's RLS (self-only, on purpose), only the
aggregate is. Several follow-on migrations built on top of Phase 3 afterward, same
Supabase-backed rigor: `forum_attachments` (links/documents on a post — see "Forum"
above); a permissions pass freezing a published topic's own content against its
author while leaving attachment management and reply deletion open (`author_id`/
`is_web_admin()` policies on `forum_threads`/`forum_posts`, unchanged from Phase 3 for
posts, tightened for threads); and real in-app Repository content authoring
(`repository_articles`/`repository_documents`/`repository_team` — see "Repository"
above and "Authoring repository content" below), scoped per sub-topic the same way
Phase 6's `project_team` is scoped per project.

Phase 6 (projects — `supabase/migrations/20260901000000_projects.sql`) is **live and
verified**: only Web Admin creates or deletes a project; its content
(`project_sections`, one row per bullet/paragraph) is real Postgres now, with
Contributor-or-above able to add/edit a row and only Manager-or-above able to delete
one — the per-project grant (`project_team`) a Web Admin assigns, same shape as
`apiary_managers`. Of the five seed projects, only PRJ-00 carried over.

Phase 7 (notifications — `supabase/migrations/20260916000000_notifications.sql`) is
**live and verified**: `notify-subscribers` (see "Notification email" below) writes one
real row per notified subscriber, and the Notifications page (`js/views/notifications.js`)
reads them back — self-only RLS, same shape as `subscriptions`, with no insert/delete
policy for `authenticated` at all since every row is written by that Edge Function
running as the service role. The "What you follow" sidebar's forum-topic chips still
can't resolve a real thread's title (an unrelated, smaller gap — see that file's own
comment), and the "Email frequency" digest selector remains UI-only; every notification
is still sent the instant it happens, not batched.

Phase 5 (apiaries/hives/inspections —
`supabase/migrations/20260923000000_apiaries_hives_inspections.sql`) is **live and
verified**: finishes what Phase 1 started — `apiary_managers` was created back then with
an unconstrained `apiary_id` and a `manage`/`operate` `access_level` nothing enforced yet;
this migration adds `apiaries`/`hives`/`inspections`, wires up the FK, and actually
enforces the split (`manage` = create/edit/delete hives, edit the apiary; `operate` =
update hives, log inspections). Only Web Admin creates/edits/removes an apiary; site
access is a real per-apiary grant now, assigned from the apiary's own page ("Team" panel),
same shape as `project_team`. Of the three seed apiaries, all three carry over (real
research sites, not illustrative content) but their hives and inspections don't — those
were entirely RNG-fabricated demo filler, so every site starts with zero hives/
inspections in production, same as marketplace/forum started with zero real listings/
threads. A hive's "last inspected" is a real timestamp now, not a number that only ever
rots. Queen lines/breeders (Phase 4) stays mock — nothing here depends on it moving too;
`hives.queen_line` stays an unconstrained column until it does, same precedent
`apiary_managers.apiary_id` set for this phase.

## Wiring up the real integrations

**Wild Apricot** — live and confirmed working end-to-end (real login → real member signed
in). `js/waAuth.js` handles the browser-safe parts (the redirect to Wild Apricot's login,
parsing the callback) and calls the part that can't run in a browser — exchanging the code
for a token, which needs the application's client secret — via a Supabase Edge Function,
`supabase/functions/wildapricot-auth/index.ts`, that does the token exchange and fetches
the signed-in member's own contact record. See `js/waAuth.js`'s header comment for the
full setup checklist.

Two Wild Apricot API details worth remembering if this ever needs debugging again: the
login/authorize redirect goes to AQBBA's *own* Wild Apricot site
(`https://aqbba.org.au/sys/login/OAuthLogin`), not a shared host, and only takes exactly
four query params (`client_id`, `redirect_uri`, `scope`, `state` — no `response_type`);
the token exchange afterward *is* a shared host (`oauth.wildapricot.org/auth/token`) and
needs `client_id` and `scope` in the POST body in addition to the Basic-auth header, not
just `grant_type`/`code`/`redirect_uri`. Both were wrong on the first real test and had to
be corrected against Wild Apricot's own API docs.

Roles are deliberately **not** derived from anything in Wild Apricot — Membership Level
there is a fee tier (e.g. Individual vs. Student, unrelated to what someone should be able
to do on this site), and Groups are general-purpose org bundling that doesn't map cleanly
onto this site's roles either, and would silently couple whatever WA groups are used for
to access control here. So every real sign-in provisions with the plain `Member` role
(`DEFAULT_ROLES` in the Edge Function) and an admin assigns real roles afterward via the
roles editor — a deliberate action instead of an implicit one.

The gate's "Continue with Wild Apricot" button automatically uses the real redirect once
`WA_CONFIG.clientId` is set (its caption changes to match); before that it stays on the
simulated sign-in the prototype always had.

`currentUser` is genuinely session state now (`js/store.js`), not the constant it used to
be — it resolves to whichever member last signed in, by whichever path. The simulated
demo path (`signIn`, the gate's plain email/password form) still always resolves to the
seed `currentUser` (Pete Czeti), kept only as a testing convenience with no production
equivalent, same as before. A real Wild Apricot sign-in is different now that Phase 1's
identity migration is written: `completeWildApricotLogin` (`js/waAuth.js`) sets a real
Supabase Auth session from the Edge Function's tokens, and `loadSignedInMember` (`js/
store.js`) then reads that member's own row straight from Postgres — the matching,
auto-provisioning (default `Member` role, no site/manager grants — an admin adjusts
access afterward via the roles editor, same as any other member), and `auth.users`
creation all happen server-side in the Edge Function now, against real tables, gated by
real RLS, instead of client-side against a local array.

**Members directory** (`#/members`, Web Admin only) — fully migrated to Postgres: every
row is a real `members` table read (`loadMembersDirectory`/`loadMemberDetail`, `js/
store.js`), no seed/demo roster involved any more. The directory's "Sign-in" column is
tri-state: "Signed in via Wild Apricot" (`wa_contact_id` set), "Signed in directly" (a
collaborator invited straight from this site — see below), or "Not yet signed in".

**Direct (non–Wild Apricot) sign-in** — lets someone collaborate on this site without a
Wild Apricot membership (and the license seat that comes with one). A Web Admin invites
them from the Members page ("Invite collaborator"): `inviteCollaborator` (`js/store.js`)
calls `supabase/functions/invite-collaborator`, a Web-Admin-only Edge Function that
provisions `members`/`member_contact_details`/`member_roles` and has Supabase email an
invite link via `auth.admin.inviteUserByEmail`. That link redirects back with real
session tokens in the URL hash (`#access_token=...&type=invite` — Supabase's standard
shape for every email-based auth link); `js/inviteAuth.js` intercepts and clears that hash
at boot, ahead of the app's own hash router, then `js/views/setPassword.js` walks them
through setting a password before they land in the app. Returning collaborators sign in
for real via the gate's email/password form (`js/views/gate.js`'s `#creds`, now wired to
`supabase.auth.signInWithPassword`; leaving both fields blank still falls back to the
quick demo sign-in for testing). No schema changes were needed for this — `members.
auth_user_id` and `wa_contact_id` are independent nullable columns, and every RLS
policy/role check already keyed off `auth_user_id`/`current_member_id()` only, never
Wild Apricot specifically.

Known limitation: if someone abandons the tab between clicking the invite link and
setting a password, their session (already established by the link) persists as normal
via `supabase-js`'s own storage, so a later reload treats them as signed in without ever
setting one — not a security gap, just a UX rough edge, closed by adding a "forgot
password" entry point later.

**Notification email** — real now, not simulated: forum topic publish, forum reply, and
repository contribution (article/document/link) each call `notifySubscribers` (`js/
store.js`), which invokes the `notify-subscribers` Edge Function
(`supabase/functions/notify-subscribers/`). It looks up `subscriptions` rows for that
`thread:<id>`/`repo:<id>`/`cat:<id>` key (Phase 3), writes a real `notifications` row
(Phase 7) for every one of them regardless of whether they have an email on file, then
separately resolves whichever do from `member_contact_details` and sends via Resend. The
call is fire-and-forget from the client — a publish still succeeds even if email sending
fails or isn't configured yet, and the in-app notification doesn't depend on the email
succeeding either.

Needs one-time setup before it actually delivers: a Resend account, a verified sending
domain (SPF/DKIM records on whichever domain the from-address uses), and

```
supabase secrets set RESEND_API_KEY=...
supabase secrets set NOTIFY_FROM_EMAIL='AQBBA <notifications@aqbba.org.au>'   # optional — this is the default
```

then `supabase functions deploy notify-subscribers`. See that function's header comment
for the full payload shape and the Resend sandbox-sender workaround for testing before a
domain is verified.

**Persistence** — `js/store.js` still writes some entities to `localStorage` behind a
small interface (`commit`, `addQueenLine`, `updateApiary`). Identity (`loadSignedInMember`,
`signOut`), marketplace listings (`loadListings`, `addListing`), forum/repository/
subscriptions (`loadForumThreads`, `loadThread`, `addThread`, `addPost`, `loadRepository`,
`loadSubTopic`, `loadMySubscriptions`, `toggleSub`, `addForumAttachments`,
`addRepositoryArticle`, `addRepositoryDocument`, `setRepositoryTeamMember`), and
projects (`loadProjects`, `loadProject`, `addProject`, `deleteProject`,
`addProjectSection`, `joinProject`, `setProjectTeamMember`) now read/write real
Supabase state instead; every other entity's functions in this module are next, one
migration phase at a time.

**Data** — `js/data.js` exports plain arrays and lookup helpers, each tagged `[PERMANENT]`
(pure reference/formatting code that survives the migration) or `[SEED — Phase N]` (mock
content standing in for a real table, deleted in that phase once views read from Supabase
instead) — see the module's own header comment.
