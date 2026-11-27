# AQBBA — Queen Breeders Collaboration Platform

A members-only platform for the Australian Queen Bee Breeders Association: a varroa
sensitive hygiene (VSH) research program with apiary and hive records, a topic-driven
forum, a structured information repository, a member marketplace, and a confidential
Committee Forum.

> This is a live platform, not a mock-up. Everything a member sees or writes is backed by
> real Postgres tables on Supabase with Row Level Security. Both sign-in paths (Wild Apricot
> OAuth and direct collaborator accounts) and notification email (Resend) are real
> integrations. The one leftover from the original prototype is a handful of seed arrays in
> `js/data.js` that a couple of views still read for lookups — see "Data and state" below.
> Confirmed bugs that haven't been fixed yet are tracked in [BUGS.md](BUGS.md).

## Running it

There is no build step for the app itself and no dependencies to install — not even Node.
Serve the directory over HTTP, since ES modules will not load from `file://`:

```bash
python3 serve.py          # port 4173; pass a port number to use another
```

Then open <http://localhost:4173>. The app talks to the live Supabase project configured in
`js/supabaseClient.js`, so you need a network connection and a real sign-in — a Wild Apricot
account or a direct collaborator account. Signing in from `http://localhost:4173` works
against production: that origin is on the Edge Functions' CORS allowlist
(`supabase/functions/_shared/cors.ts`), and Wild Apricot login redirects back to whatever
origin you're running from (`WA_CONFIG.redirectUri` in `js/waAuth.js`). This is a
deliberate convenience for contributors, not a sandbox: anything you write while running
locally goes to the same production database, and the localhost origin stays allowlisted in
production.

`serve.py` is a plain static server that adds `Cache-Control: no-store`. Use it rather
than `python3 -m http.server`, which sends no cache headers at all and lets the browser
serve stale JS and CSS after an edit.

The one exception to "no build step" is the CSS: Tailwind output is compiled ahead of time
and committed — see "Styling with Tailwind".

## What's built

**Sign-in gate** — the only surface outside the member wall. It offers "Continue with Wild
Apricot" (a real OAuth redirect) or an email-and-password form for direct collaborator
accounts, with a "Forgot password?" link. The gate also shows two live headline figures
(research apiaries, contributing members), served by a single anonymous-safe database
function (`public_landing_stats`) — the only data reachable without a session. See
"Sign-in" below for how each path works.

**Home** (`#/`) — the signed-in landing page, laid out after iNaturalist's home page:
a hero, a "With AQBBA, you can" row linking into each part of the site, the current
research projects as story cards, the latest inspection told as who/what/where/when
(with the hive lit up in its apiary's honeycomb), and live counts. All live data.

**The VSH program is itself a project.** The Varroa Sensitive Hygiene Breeding Program is
PRJ-00 — the flagship entry on the Projects page, with the same structure any project
gets (Background, Aims, Questions, Participation, Timeline, a Project team, Participants).
What it has that a single-question project doesn't is a **Topic areas** panel
(an optional `topics` field on any project) linking to its working surfaces: the research
dashboard, the apiary records, and the two assessment-related repository sub-topics.
There is no top-level Dashboard nav item; the dashboard lives under Projects.

**Research dashboard** (`#/projects/p0/dashboard`) — a topic area of PRJ-00, reached from
the program's summary page and breadcrumbed back to it. Program-wide figures, then a card
per research apiary showing location, apiary status (Establishing / Assessment /
Maintenance / Re-queening), hive count, mean VSH, hives being treated and hives
treatment-free for three or more seasons. Below that: the honeycomb hive grid, a colony
status breakdown, upcoming and recently completed inspections, and the contributing breeders
with their queen lines.

**Queen lines** are the program's other editable record, Web Admin only: name, breeder,
generation, mean VSH, and a note. A line's breeder must be a real member who holds the
**Breeder** role — enforced by a database trigger, not just the picker
(`20260923223117_queen_line_breeder_role_restriction.sql`). The earlier "standalone breeder"
record for contributors who aren't platform members was removed, along with the `breeders`
table. Hives reference a line by an internal code (`hives.queen_line`) that is generated
automatically and never shown or typed anywhere — members see and edit only the line's name,
which can change over time while the code stays fixed (`addQueenLine`/`loadQueenLines` in
`js/store.js`).

**Apiary records** (`#/apiaries`) — a comparison table across sites, then per-apiary: the
full hive grid, queen lines present with site performance measured against each line's
program mean, the complete inspection schedule, site detail, and which research projects
are currently running there. Apiary URLs are readable slugs of the apiary's name
(`#/apiaries/newcastle`); old `ap-…` links are redirected (`LEGACY_APIARY_IDS` in
`js/app.js`). This is also where the program's own data gets maintained:

- **Add apiary** registers a new research site (Web Admin only), and notifies anyone
  subscribed to the "new research apiary" channel.
- **Edit apiary** (on the apiary's own page) covers name, region, year established, status,
  dominant flora and the site brief. Who has access to the site is managed separately, in
  the page's "Team" panel.
- **Add hive** registers a hive at a site. The hive ID and the queen's own ID are both
  entered at registration and validated for uniqueness against every existing hive; the
  queen's breeding line is picked from a dropdown. **Edit** on a selected hive's readout
  covers everything set at registration except the hive ID, which stays fixed because
  inspections and other records refer to it.
- **Log inspection** records a completed or scheduled inspection against one, several, or
  all of an apiary's hives. The form's Apiary field is itself a picker (scoped to the sites
  the signed-in member can edit), its Hives field is a checklist of that apiary's actual
  hives with an "All hives" toggle, and an optional Status field updates every selected
  hive's status when the inspection is saved — so an inspection is how a hive's status
  changes after it's first registered (`addInspection`/`setHiveStatus` in `js/store.js`).
  Inspection type is one of three categories — Assessment, Maintenance, Biosecurity. An
  inspection can record assessment scores, assay results (including the Harbo assay),
  disease and biosecurity checks, an optional **colony weight in kg** (0.1–500, to the
  nearest 0.1) and optional **weather** (free text, at most 40 characters). A hive's readout
  shows its most recent recorded weight and date when one exists. A hive's mite load is
  derived from the most recent recorded mite count, not entered directly.
- **Bulk upload (.csv)** for both hives and inspections, with a downloadable template and
  per-row validation (`js/csv.js`, a small hand-written parser — no library).

A hive's **status** is its own field, recorded per hive: **New** (light grey, "New colony
currently undergoing setup"), **Thriving**, **Good**, **Average**, **Poor**, **Critical**
(deep red, "Colony is queen-less or failing" — counts toward the apiaries table's Critical
column and the dashboard's Needs attention), **Treating**, and **Retired**. A retired hive
is left out of every apiary view, count and the dashboard, and is listed instead by the
**Retired hives** report (`#/reports/retired-hives`, linked from the apiaries pages), where
a Web Admin or that apiary's manager can reinstate it under a chosen status.

These maintenance flows are meaningfully different from the member-facing composers elsewhere
(forum, marketplace, repository) — they alter the program's research data rather than adding
social content, so they're access-gated: adding an apiary is Web Admin only, and adding a
hive or logging an inspection at an existing site requires Web Admin or that site's manager
or operator grant (see "Roles & access" below).

**Members directory** (`#/members`, Web Admin only) — every row is a real `members` read.
The "Sign-in" column is tri-state: "Signed in via Wild Apricot" (`wa_contact_id` set),
"Signed in directly" (a collaborator invited from this site), or "Not yet signed in".
A Web Admin can **invite a collaborator** from here (see "Direct sign-in"), and can
**deactivate** and **reactivate** members. Deactivation is a soft delete — it revokes
every role and apiary access grant and erases the member's contact details, but keeps the
row (and name), because forum and repository content references members and silently
erasing that content to remove a member would be worse
(`20260918072629_member_deactivation.sql`). Deactivated members appear dimmed with a
"Deactivated" tag.

**Manager details** (`#/managers/:id`) — phone, email and postal address for a member.
Phone and email are mandatory once a record is saved (validated on submit — an email that
doesn't look like an email is rejected, and the record is never left half-filled); address
is optional. Reached from a manager's name on the apiaries table and on each apiary's detail
page, where an unfilled manager also gets a small "No contact on file" flag. The page also
lists every site that member manages, and is where a Web Admin edits that member's roles.

**Account settings** (`#/settings`, reached by clicking your own name in the rail) — a
self-only page for your own phone and email. For a direct (non–Wild Apricot) account,
changing the email also updates the address you sign in with, and a password-change form is
shown. Wild-Apricot-linked members have no password on this site at all, so they're pointed
to Wild Apricot instead.

**Projects** (`#/projects`) — coordinated research initiatives, distinct from apiaries: a
project is a question with a method attached, and can span apiaries, run at one, or wait
for a member to volunteer a site. Only a Web Admin creates or deletes a project; its
content — Background, Aims, Research questions, Participation & methods, a Timeline — is
what the Project Managers and Contributors a Web Admin assigns to it can add, edit and
(Project Manager only) delete, one bullet/paragraph at a time, from the project's own page.
Any member can join or leave a project with a stated contribution regardless of team
assignment. Only PRJ-00 (the VSH program) exists as seed content. The index is a grid of
photo cards with status filters (Recruiting / Active / Concluding), and each project page
opens with its photo as a banner (a project without one gets generated honeycomb artwork).

**Forum** (`#/forum`) — real member discussions grouped into categories. Members create
topics, subscribe to topics or whole categories, and reply. Editing is author-only, with a
Web Admin moderation override: a topic's author can edit its title and body, a reply's
author can edit or delete that reply, and an edited post shows an "edited" timestamp
(`20261021220000_author_only_edits.sql`, `20261021230000_forum_edited_at.sql`). Any post — the
topic's opening one or a reply — can carry links, documents (PDF, Word, text, spreadsheet,
slide files — real Supabase Storage uploads served by signed URL, never a public link) and
images; add one at any time from the post itself, and a thread page's Attachments panel
lists every one across the topic with a link back to the post that added it.

**Committee Forum** (`#/committee-forum`) — a confidential discussion space visible only to
members holding the **Committee** role (and Web Admin). It has the same shape as the public
forum (topics, replies, attachments, subscriptions, email notification) but a single flat
list of topics rather than categories. It is deliberately a separate set of tables, storage
bucket and functions (`committee_threads`, `committee_posts`, `committee_attachments` —
`20261103080309_committee_forum.sql`), not a flag on the public forum's, so that RLS on those
tables is what guarantees confidentiality. The nav item is hidden from everyone else. The
Committee role can only be granted to a member who also holds the Member role.

**Repository** (`#/repository`) — three tracks (Foundation → Queen Production → Queen
Breeding) holding sixteen sub-topics, each independently subscribable. The tracks and
sub-topics are real Postgres rows. Content comes from two merged sources: **documents**
committed to the repo under `content/repository/` (served as download links — see
"Authoring repository content" below), and **articles, documents and links published from
inside the app** (real Supabase rows and Storage uploads). Publishing is scoped per
sub-topic, the same shape as an apiary's or project's manager grant: a Web Admin assigns a
member "Repository Manager" (add, edit, delete) or "Creator" (add, edit) access to one
specific sub-topic. Editing an existing article is limited to its author (Web Admin
override). Articles are written in Markdown and can include images. A sub-topic with no
content yet shows an honest empty state.

**Marketplace** (`#/marketplace`) — queens, nucs, semen and equipment, filterable by
category, with a listing composer for any member and an "Enquire" flow on each listing.

**Notifications** (`#/notifications`) — a real, per-member feed. `notify-subscribers` writes
one row per notified subscriber when something they follow is published (forum topic or
reply, repository article/document/link, a new research apiary, Committee Forum activity),
with unread state, plus a summary of everything the member follows. The nav badge shows the
unread count.

## The honeycomb grid

The dashboard and each apiary page render every hive in an apiary as one interlocking
honeycomb field (14 cells per row). Each hexagon is a real hive record; click it to read
that hive's assessment data points, its latest colony weight when it has been weighed,
plus its queen line, its own queen ID, contributing breeder, queen marking, and any
comments recorded when the hive was registered.

Cell colours quote the **international queen-marking colour code** (white, yellow, red,
green, blue, plus "not marked" for a queenless colony or one that raised its own queen,
shown as an empty ring) — the one colour system every queen breeder already reads
fluently — rather than an arbitrary palette. Colony *status* has its own separate colour
scale.

## Roles & access

A member can hold several roles at once (e.g. a Breeder who is also an Apiary Manager),
edited from a fixed list (`roleOptions` in `js/data.js`) by a Web Admin on the manager
details page, each carrying a short description shown next to its checkbox:

- **Web Admin** — superuser; full access everywhere, including every apiary and every
  member's roles and access grants.
- **Apiary Manager** — complete CRUD privileges for the apiary they manage.
- **Operator** — assists the Apiary Manager with inspections and data updates; change and
  update privileges only, no create or delete.
- **Breeder** — change and update privileges only. The only role that can be credited as a
  queen line's breeder.
- **Member** — read-only on apiary data and the repository; full forum access (publish,
  subscribe, notifications) and can list items in the Marketplace. Assigned automatically
  to a real Wild Apricot sign-in.
- **Guest** — the same access as Member. Assigned automatically to a direct (non–Wild
  Apricot) collaborator account, so the role label reflects how they signed in.
- **Creator** — add and update content (articles, documents) on repository sub-topics
  they've been assigned to support; cannot delete content, create a track/sub-topic, or
  manage one they haven't been assigned to.
- **Project Manager** — update and delete content on research projects they've been
  assigned to manage.
- **Contributor** — add and update project content on projects they've been assigned to
  support; cannot delete content, and cannot create, delete, or manage a project.
- **Repository Manager** — add, edit and delete content on repository sub-topics they've
  been assigned to manage; cannot create a new track/sub-topic, or manage one they
  haven't been assigned to.
- **Committee** — full access to the confidential Committee Forum.

The role tag is a label, not a permission on its own. Actual edit access to a specific
site, project or sub-topic is a separate grant a Web Admin assigns, stored in
`apiary_managers` (`manage`/`operate`), `project_team` and `repository_team`
(`manage`/`contribute`) — checked per apiary via `canEditApiary` in `js/store.js` and by RLS
policies in the database. A member with a grant for one apiary cannot touch another's data
unless separately granted there too; Web Admin can always edit everything. Creating a
brand-new apiary, project or repository track/sub-topic is Web-Admin-only, as is editing
roles and grants themselves.

These checks run against the real signed-in member (`currentUser()`), and the database's
RLS enforces the same rules independently of the UI.

## Design

- **Crest** — `assets/logo.png` is the association's own crest, background removed so it
  sits cleanly on both the dark rail and the cream page ground (`assets/logo-original.png`
  is the untouched upload, kept as a backup). It's used at real size (36–44px) rather than
  icon scale, since the fine detail — the circular wordmark, the bee anatomy — is
  illegible any smaller.
- **Palette** — defined as custom properties in `css/main.css`: a honey-lit comb-wax ground
  (`--comb`, `#FBF6E9`), dark honey ink (`--propolis`, `#2B1F0E`), and a golden-honey action
  colour (`--amber`, `#C1811A`, with `--amber-deep` for hover and dark text on a wash).
  `--amber-bright` (`#E0A83E`) is a lifted variant used for text, icons and focus rings on
  the dark propolis ground, where the base amber is too close in value to read at AA
  contrast. Colony status colours (`--st-*`) are separate from the brand palette and draw
  on the queen-marking code.
- **Type** — Spectral for display and long-form prose (a scientific-journal serif),
  Instrument Sans for interface, IBM Plex Mono for hive IDs, scores and dates, so field
  data reads as data. Loaded from Google Fonts in `index.html`.
- **Ordinals** — the repository's I / II / III are used because the tracks are a genuine
  progression a member works through in order. They appear nowhere else.

Responsive to 375px, keyboard focus visible throughout, `prefers-reduced-motion`
respected. `index.html` loads Google Tag Manager, and `js/app.js` pushes a `page_view`
event on each route change for analytics.

## File layout

```
index.html
serve.py              Local static server (no-store caching)
.env.example          Names of the Supabase / Wild Apricot values (real ones live in dashboards)
.github/workflows/    deploy-supabase-functions.yml — deploys Edge Functions on push to main
BUGS.md               Confirmed, not-yet-fixed issues
css/
  app.css             The one stylesheet index.html loads — sets cascade order, imports the two below
  main.css            Design tokens (colours, fonts), the base reset and shared keyframes
  tailwind.css        Compiled Tailwind output (generated — see "Styling with Tailwind")
js/
  app.js              Shell, hash router (routes with async `load`), delegated global behaviour
  supabaseClient.js   The shared, lazily-loaded Supabase client and its public config
  store.js            Session state, permission checks, and every Supabase read/write
  data.js             Display vocabularies and pure helpers, plus leftover seed arrays (see below)
  waAuth.js           Wild Apricot OAuth: redirect, callback parsing, session handoff
  inviteAuth.js       Intercepts invite and password-recovery links (#access_token=…) at boot
  ui.js               Render helpers, icon set, toasts, modals
  components.js       Shared Tailwind building blocks: pageHeader, pageBody, card, table, tag, button, ...
  attachFields.js     Shared link/file attachment fields for forum and committee composers
  images.js           In-browser image resize before upload
  csv.js              Minimal CSV parse/build for the bulk-upload flows
  content.js          Repository content loader (file-based manifest) + Markdown renderer
  projectArt.js       Project photos/artwork and the project card, shared by home and projects
  views/
    gate.js           Sign-in
    setPassword.js    Set-a-password screen for invited collaborators and password resets
    home.js           Signed-in landing page (#/)
    dashboard.js      Research dashboard
    comb.js           The honeycomb grid and hive readout
    apiaries.js       Apiary index, per-apiary record, hive/inspection forms, bulk upload, retired-hives report
    managers.js       Members directory, manager contact details, roles editor
    settings.js       Your own account settings
    projects.js       Research initiatives: index, detail, content editor, team, join
    forum.js          Topic list, thread view, composer
    committeeForum.js Confidential Committee Forum
    repository.js     Tracks, sub-topics, article reader and editor
    marketplace.js    Listings, filters, composer, enquiry
    notifications.js  Notification feed and subscription summary
content/repository/   File-based repository documents plus manifest.json
supabase/
  migrations/         The schema, one dated SQL file per change (35 so far)
  functions/          Edge Functions: wildapricot-auth, invite-collaborator,
                      forgot-password, notify-subscribers (+ _shared/cors.ts)
tools/rebuild_manifest.py   Regenerates the content manifest from disk
tools/tailwind/       Dev-time Tailwind compiler (pinned versions, entry file, build script) and
                      the shared component styles: components.css, components-<area>.css
assets/               Crest and photography
```

## Styling with Tailwind

The whole site is styled with Tailwind CSS. Every page is built from the same
pieces, so a header, card, table, tag or button looks the same wherever it
appears.

- **Page structure** comes from `js/components.js`: `pageHeader` (the tinted
  band with breadcrumb, eyebrow, title and actions), `pageBody`, `twoColumn`,
  `card`, `table`, `rowList`, `tag`, `filterPill`, `personRow`, `emptyState`,
  `button` and friends. Write a new page from these rather than from raw markup.
- **Classes are prefixed `tw:`** — `tw:flex`, `tw:md:grid-cols-3`,
  `tw:hover:bg-white`.
- **Brand tokens are shared.** `tw:bg-propolis`, `tw:text-amber-deep`,
  `tw:font-display` and friends resolve to the custom properties in
  `css/main.css` (declared for Tailwind in `tools/tailwind/input.css`), so the
  palette and fonts have a single source of truth.
- **`css/main.css`** holds only those tokens, the base reset and the keyframes.
  Everything else is Tailwind.
- **Shared and page-specific styles** that utilities in markup can't express
  (the hive grid's clip-path cells, the sign-in page's animated comb, state
  classes toggled from JS, the pop-up form fields and buttons `.field`/`.btn`)
  live in `tools/tailwind/components.css` and `components-<area>.css`, written
  with `@apply tw:...` and compiled in the `components` layer.
- **Write class names out in full.** Tailwind finds classes by scanning the
  source text, so a class assembled from pieces (`'tw:bg-' + tone`) is never
  generated. Pick from complete strings instead — see `js/components.js`.
- **No preflight.** `main.css` ships the base reset; Tailwind's is switched off.

After adding or changing any `tw:` class, regenerate the compiled CSS and commit
it alongside your change:

```
cd tools/tailwind
npm install        # first time only
npm run build      # writes css/tailwind.css
```

(`npm run watch` rebuilds on every save while you work.) The tooling lives in
`tools/tailwind/` rather than at the repo root on purpose: with no root
`package.json`, Vercel keeps serving the site as plain static files with no
install or build step. Forgetting to rebuild doesn't break anything — new
classes just won't take effect until the next build is committed.

## Authoring repository content

There are two ways to add repository content, deliberately kept separate. This section
covers the permanent one: real association material committed as plain files in the repo —
no CMS, no build step. Use it for material meant to last (the kind of thing a Web Admin or
the association itself stands behind). For a quick addition by whoever's been assigned
Repository Manager/Creator access to a sub-topic, use the in-app "Contribute"/"Add item"
composer instead — see "Repository" above and "Roles & access" for how that access is
granted. Both sources are read side by side on the same sub-topic page.

Today the file-based path holds **documents** (PDFs, spreadsheets, images) only. The
association's original reading-list articles were moved into the database, so they can be
edited and deleted in the app like any other article; the `articles` list in
`content/repository/manifest.json` is empty for every sub-topic. The loader and Markdown
renderer still support file-based articles if you ever want a permanent, code-reviewed one.

To add or change a file-based item:

1. Put files in `content/repository/<sub-topic-id>/`. The sub-topic ids (`rs-graft`,
   `rs-vsh`, and so on) are the primary keys of the `repository_sub_topics` table, which
   is the authority — adding a genuinely new sub-topic beyond the current sixteen means a
   Web Admin inserting a row there too, not just adding files.
   - **Documents** (PDF, Word, Excel, images) go in the folder and appear as download
     links with type and size. An optional `_names.json` in the folder maps filenames to
     proper display titles.
   - **Articles** (optional) are Markdown files with a front-matter header:

     ```markdown
     ---
     title: Scoring partial removals in the freeze-killed brood assay
     author: Jane Citizen  # a plain name
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
     and briefly highlights that row. This works for both file-based attachments and
     ones added through the in-app composer, and in both kinds of article — they share
     one Markdown renderer (`js/content.js`'s `mdToHtml`).

2. Run `python3 tools/rebuild_manifest.py` — it regenerates
   `content/repository/manifest.json` from what's on disk.
3. Commit and push. The app reads only the manifest at boot and fetches article bodies
   on demand.

**Images.** Articles and forum posts can include pictures (JPEG or PNG only).
`js/images.js` resizes every picked image in the browser before upload — longest
side 800px, re-encoded and shrunk toward ~200KB — so what is stored is always
web-sized. In a repository article, "Add image" uploads it to the private
`repository-documents` bucket under `<sub-topic>/images/` (the first path segment must be
the sub-topic id: the storage policy checks access to it) and inserts
`![description](img:<path>)` into the Markdown; the page swaps in short-lived
signed URLs when it renders, and removing an image from the text (or deleting
the article) deletes the stored file. In the forum, the "Images" field on a new
topic, reply or "Add attachment" stores them as ordinary `forum_attachments`
files and shows them inline under the post.

**Copyright note:** this repo is public. Only commit documents you have the right to
redistribute — your own material and openly-licensed references (e.g. the COLOSS
standard-methods series). Publisher PDFs should stay out unless the repo goes private.

## Hosting & backend

**Vercel (hosting) + Supabase, Sydney region (Postgres, auth, storage and Edge
Functions).** Vercel serves the repo as plain static files, deploying from GitHub on every
push; there is no separate build config because the app has no build step. Supabase
provides the database and also the small serverless Edge Functions that hold the few pieces
of server-side logic the app needs (the Wild Apricot token exchange, invites, password
resets, notification email). The Sydney region matters because the program stores member
personal data (phone, email, home address), and keeping it in Australia is free on Supabase
and awkward to change after the fact. Production is at <https://aqbba-collab.vercel.app>.

Both have free tiers that comfortably cover AQBBA's scale. Setting the stack up from
scratch:

1. **Supabase** — create a project in the **Sydney (ap-southeast-2)** region (this can't be
   changed later without migrating). The project's **Connect** dialog (or Settings → API
   Keys) gives you the values documented in `.env.example` — `SUPABASE_URL` and
   `SUPABASE_PUBLISHABLE_KEY` are safe to expose in frontend code (the frontend reads them
   from `js/supabaseClient.js`, not from an env file); `SUPABASE_SECRET_KEY` is not and
   never leaves server-side environment variables. Apply the migrations in
   `supabase/migrations/` in filename order.
2. **Vercel** — sign up with the same GitHub account this repo is under, "Import Project"
   and select it. No configuration is needed for the static site to deploy; every push to
   `main` then auto-deploys.
3. Add any Supabase and Wild Apricot secrets the Edge Functions need as Supabase secrets
   (never committed to the repo — `.env.example` documents the names instead of real values).
4. **Edge Functions deploy themselves** — `.github/workflows/deploy-supabase-functions.yml`
   runs `supabase functions deploy` on every push to `main` that touches
   `supabase/functions/`, so merging a PR is enough. One-time setup: add a
   `SUPABASE_ACCESS_TOKEN` repository secret (Supabase dashboard → Account → Access Tokens —
   a personal CLI/Management API token, not the project's anon or service-role key). Each
   function's own header comment also shows the manual command
   (`supabase functions deploy <name>`), useful for deploying one function immediately.

**Schema.** The app is fully on Postgres with Row Level Security; nothing the member sees is
mock data any more. The migrations in `supabase/migrations/` are the authoritative
description of the schema and its policies. In outline:

- **Identity** — `members`, `member_roles`, `member_contact_details`, `apiary_managers`,
  and the Wild Apricot auth bridge. Every other table's RLS is `to authenticated`; the one
  anonymous-reachable surface is the `public_landing_stats()` function behind the sign-in
  gate's two figures.
- **Marketplace** — `marketplace_listings`.
- **Forum, repository and subscriptions** — forum categories, threads, posts and
  attachments; repository tracks, sub-topics, articles, documents and `repository_team`;
  and a generic `subscriptions` table (types `thread`, `cat`, `repo`, `apiary`, `cforum`,
  `cthread`) with aggregate subscriber-count RPCs (individual subscribers are visible only
  to themselves, by design).
- **Projects** — `projects`, `project_sections` (one row per bullet/paragraph),
  `project_team`, and `project_participants`.
- **Research data** — `apiaries`, `hives`, `inspections`, `queen_lines`.
- **Notifications** — `notifications`, written only by the `notify-subscribers` Edge
  Function running as the service role (no insert policy for `authenticated`).
- **Committee Forum** — its own `committee_*` tables and storage bucket.

## Sign-in

**Wild Apricot** — live and confirmed working end-to-end (real login → real member signed
in). `js/waAuth.js` handles the browser-safe parts (the redirect to Wild Apricot's login,
parsing the callback) and calls the part that can't run in a browser — exchanging the code
for a token, which needs the application's client secret — via the Supabase Edge Function
`supabase/functions/wildapricot-auth/index.ts`, which does the token exchange, fetches the
signed-in member's own contact record, provisions the member if needed, and returns a real
Supabase session. See `js/waAuth.js`'s header comment for the full setup checklist. The
redirect URI is `window.location.origin`, so every origin you sign in from (production and
local development alike) has to be registered on the Wild Apricot application.

Two Wild Apricot API details worth remembering if this ever needs debugging again: the
login/authorize redirect goes to AQBBA's *own* Wild Apricot site
(`https://aqbba.org.au/sys/login/OAuthLogin`), not a shared host, and only takes exactly
four query params (`client_id`, `redirect_uri`, `scope`, `state` — no `response_type`);
the token exchange afterward *is* a shared host (`oauth.wildapricot.org/auth/token`) and
needs `client_id` and `scope` in the POST body in addition to the Basic-auth header, not
just `grant_type`/`code`/`redirect_uri`.

Roles are deliberately **not** derived from anything in Wild Apricot — Membership Level
there is a fee tier (e.g. Individual vs. Student, unrelated to what someone should be able
to do on this site), and Groups are general-purpose org bundling that doesn't map cleanly
onto this site's roles either, and would silently couple whatever WA groups are used for
to access control here. So every real sign-in provisions with the plain `Member` role
(`DEFAULT_ROLES` in the Edge Function) and an admin assigns real roles afterward via the
roles editor — a deliberate action instead of an implicit one.

After sign-in, `completeWildApricotLogin` (`js/waAuth.js`) sets the Supabase Auth session
from the Edge Function's tokens, and `loadSignedInMember` (`js/store.js`) reads that
member's own row from Postgres. `currentUser()` resolves to that member (cached as
`state.remoteMember`); a session that survives a page reload is restored the same way at
boot.

**Direct (non–Wild Apricot) sign-in** — lets someone collaborate without a Wild Apricot
membership (and the license seat that comes with one). A Web Admin invites them from the
Members page ("Invite collaborator"): `inviteCollaborator` (`js/store.js`) calls
`supabase/functions/invite-collaborator`, a Web-Admin-only Edge Function that provisions
`members`/`member_contact_details`/`member_roles` (with the `Guest` role) and has Supabase
email an invite link via `auth.admin.inviteUserByEmail`. That link redirects back with real
session tokens in the URL hash (`#access_token=...&type=invite`); `js/inviteAuth.js`
intercepts and clears that hash at boot, ahead of the app's own hash router, then
`js/views/setPassword.js` walks them through setting a password before they land in the
app. Returning collaborators sign in through the gate's email/password form
(`supabase.auth.signInWithPassword`). Nothing in the schema is specific to Wild Apricot:
`members.auth_user_id` and `wa_contact_id` are independent nullable columns, and every RLS
policy keys off `auth_user_id`/`current_member_id()` only.

**Forgot password** — the gate's "Forgot password?" link calls the public
`supabase/functions/forgot-password` Edge Function. For a direct account it asks Supabase to
send a recovery email (the link comes back as `type=recovery` and goes through the same
`inviteAuth.js` → `setPassword.js` path). For a Wild-Apricot-linked member it refuses and
points them at Wild Apricot, since a Wild-Apricot-linked account has no password here and a
working recovery link would create a second, parallel way in that bypasses Wild Apricot.
It deliberately reveals nothing about whether an unknown address has an account.

Known limitation: if someone abandons the tab between clicking an invite link and setting
a password, their session (already established by the link) persists as normal via
`supabase-js`'s own storage, so a later reload treats them as signed in without ever
setting one. It isn't a security gap, just a UX rough edge — they can set a password later
through "Forgot password?" or Account settings.

**Fallback demo sign-in.** `signIn()` in `js/store.js` and the gate's simulated Wild Apricot
handoff survive from the original prototype: with no `WA_CONFIG.clientId` set, the button
signs in as the seed Web Admin from `js/data.js` instead of redirecting. Production always
has a client ID, so this path is dormant, and every database-backed feature refuses a
demo identity ("This needs a real sign-in") anyway. It is slated for removal in the
cleanup pass.

## Notification email

Forum topic publish, forum reply, repository contribution (article/document/link), a new
research apiary, and Committee Forum topics and replies each call `notifySubscribers`
(`js/store.js`), which invokes the `notify-subscribers` Edge Function
(`supabase/functions/notify-subscribers/`). It looks up `subscriptions` rows for the
relevant channel, writes a real `notifications` row for every subscriber regardless of
whether they have an email on file, then separately resolves whichever do from
`member_contact_details` and sends via Resend. The call is fire-and-forget from the client —
a publish still succeeds even if email sending fails or isn't configured, and the in-app
notification doesn't depend on the email succeeding either. Every notification is sent the
instant it happens; the "Email frequency" (daily/weekly digest) selector on the
Notifications page is UI-only and is not yet honoured by the function.

See [BUGS.md](BUGS.md) for a known security gap in this function (it trusts the caller's
payload).

Needs one-time setup before it actually delivers: a Resend account, a verified sending
domain (SPF/DKIM records on whichever domain the from-address uses), and

```
supabase secrets set RESEND_API_KEY=...
supabase secrets set NOTIFY_FROM_EMAIL='AQBBA <notifications@aqbba.org.au>'   # optional — this is the default
```

then `supabase functions deploy notify-subscribers` (or let the GitHub workflow do it). See
that function's header comment for the full payload shape and the Resend sandbox-sender
workaround for testing before a domain is verified.

## Data and state

**Persistence.** Everything a member creates or reads lives in Supabase. `js/store.js` also
keeps a small session object in `localStorage` (`aqbba.session.v1`): the signed-in flag, the
cached signed-in member, cached subscription and notification lists (reloaded from Supabase
when the relevant page is visited), and the email-frequency selector value. The router
(`js/app.js`) gives each async route a `load` function and renders a loading state, an error
panel with retry, and a small cache that is cleared on real navigation or after a
successful write.

**`js/data.js`** is mostly permanent reference code: display vocabularies (apiary and hive
status labels and notes, queen colours, inspection kinds, project status labels, marketplace
kinds, the role list) and pure helpers (`tally`, `vshAverage`, date formatting). It still
holds some seed content from the original prototype that nothing user-facing depends on any
more — the mock `members` roster and demo `currentUser` (used only by the dormant demo
sign-in), and the `threads` and `repository` seed arrays, kept only because
`js/views/notifications.js` resolves an older subscription's title through them. The file's
own header comment tags each export as `[PERMANENT]` or `[SEED — Phase N]`. Removing the
seed arrays and the demo sign-in is the remaining cleanup pass.
