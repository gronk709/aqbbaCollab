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

Then open <http://localhost:4173>. Any email and password signs you in.

`serve.py` is a plain static server that adds `Cache-Control: no-store`. Use it rather
than `python3 -m http.server`, which sends no cache headers at all and lets the browser
serve stale JS and CSS after an edit.

## What's built

**Sign-in gate** — the only surface outside the member wall, per the members-only access
model. Offers Wild Apricot SSO (simulated handoff) or direct credentials.

**The VSH program is itself a project.** The Varroa Sensitive Hygiene Breeding Program is
PRJ-00 — the flagship entry on the Projects page, with the same structure as every other
project (Background, Aims, Questions, Participation, Timeline, Coordinators,
Participants). What it has that single-question projects don't is a **Topic areas** panel
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
queen lines.

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
site's manager grant (see "Roles & apiary access" below). The prototype enforces this
today via the **"Preview access as"** selector, since there's only one real signed-in
user to test with otherwise.

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
- **Creator** — everything Member has, plus the ability to contribute repository content.

Holding the "Apiary Manager" title is not itself a site-level permission — actual edit
access to a specific site (adding a hive, logging an inspection) is a separate grant,
checked per apiary via `canEditApiary` in `js/store.js`. A member with that grant for
Barrowfield cannot touch Oradale's data unless separately granted there too; Web Admin
can always edit every site, and creating a brand-new apiary is Web Admin only.
Repository contribution (`canContributeRepository` in `js/store.js`) is gated by role
instead — to the four operational roles above plus Creator — so a plain Member sees the
repository read-only, with no Contribute button. Editing roles and grants themselves is
restricted to Web Admin.

This app has exactly one real signed-in identity, so these restrictions would never
actually trigger in testing — everyone who opens it is Web Admin. To make them
demonstrable, the rail has a **"Preview access as"** selector, clearly marked
`(prototype)`. It affects the apiary actions above (add hive, log inspection, add
apiary) and the repository's Contribute button — authorship of forum posts, listings and
project joins always stays the real signed-in member. This selector has no production
equivalent; a real deployment derives permissions from the actual authenticated Wild
Apricot member, and this whole mechanism (`previewUser`/`setPreviewAs` in `js/store.js`)
should be deleted once that's wired up.

**Projects** (`#/projects`) — coordinated research initiatives, distinct from apiaries: a
project is a question with a method attached, and can span apiaries, run at one, or wait
for a member to volunteer a site. Each has Background, Aims, Research questions,
Participation & methods, a Timeline, named coordinators and a participant list. Members
propose new projects and join existing ones with a stated contribution; joining and
proposing are separate flows from forum subscription, since a project is something you
do, not just something you follow. Every seeded project traces back to a real forum
thread, and both directions link to each other, so the life cycle a member actually sees
is: a problem raised in the forum → a project proposed to answer it → members joining
with what they can contribute.

**Forum** (`#/forum`) — six seeded topics with realistic multi-post discussions. Members
create topics, subscribe to topics or whole categories, and set email delivery frequency
(each post / daily digest / weekly digest). Publishing a topic or reply reports how many
subscribers were notified.

**Repository** (`#/repository`) — the three tracks from the brief (Foundation → Queen
Production → Queen Breeding), sixteen sub-topics, each independently subscribable and
publishable. Sub-topics carry **real association content**: Markdown articles (with an
article reader at `#/repository/<sub>/<slug>`) and document attachments (PDF, Word,
Excel, images) served as download links with type and size. Sub-topics with no real
content yet fall back to a seeded placeholder article, labelled as such. See "Authoring
repository content" below for how to add material.

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
    projects.js       Research initiatives: index, detail, propose, join
    forum.js          Topic list, thread view, composer
    repository.js     Tracks, sub-topics, article reader
    marketplace.js    Listings, filters, composer, enquiry
    notifications.js  Activity feed and subscription summary
  content.js          Repository content loader + minimal Markdown renderer
content/repository/   Real repository content: articles, documents, manifest
tools/rebuild_manifest.py   Regenerates the content manifest from disk
```

## Authoring repository content

Repository content is plain files in the repo — no CMS, no build step. To add or change
material:

1. Put files in `content/repository/<sub-topic-id>/` (the ids are in `js/data.js`:
   `rs-graft`, `rs-nutri`, `rs-vsh`, and so on).
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

   - **Documents** (PDF, Word, Excel, images) go in the same folder and appear as
     download links with type and size. An optional `_names.json` in the folder maps
     filenames to proper display titles.

2. Run `python3 tools/rebuild_manifest.py` — it regenerates
   `content/repository/manifest.json` from what's on disk.
3. Commit and push. The app reads only the manifest at boot and fetches article bodies
   on demand.

The in-app "Contribute" form remains a simulation until the backend exists — anything a
browser "saves" locally is invisible to other members, so real content goes through the
files-and-push path above. When the backend lands, a folder of front-mattered Markdown
imports straight into a database.

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
   migrating). Project Settings → API gives you the values for `.env.local` (copy
   `.env.example` from the repo root) — `SUPABASE_URL` and `SUPABASE_ANON_KEY` are safe to
   expose in frontend code; `SUPABASE_SERVICE_ROLE_KEY` is not and never leaves
   server-side environment variables.
2. **Vercel** — sign up at vercel.com with the same GitHub account this repo is under,
   then "Import Project" and select it. No configuration should be needed for the static
   site to deploy; every push to `main` then auto-deploys.
3. Add the Supabase and Wild Apricot environment variables to the Vercel project's
   Settings → Environment Variables (not committed to the repo — that's what
   `.env.example` documents instead of real values).

Nothing in the app depends on this yet — it still runs entirely from `serve.py` with mock
data. This section exists so the decision is written down and the next session (or
person) doesn't have to re-derive it.

## Wiring up the real integrations

**Wild Apricot** — the client-side half of the OAuth flow is built (`js/waAuth.js`); the
server-side half is not, because it needs a client secret, which can't live in a browser.
See that file's header comment for the full setup checklist and exactly which two calls
the server side needs to make. In short:

1. In the Wild Apricot admin, create an Authorized Application (contact-level access, not
   the account-wide API key) and note its Client ID and Client Secret.
2. Fill in `WA_CONFIG.clientId` in `js/waAuth.js` — the ID is not sensitive. The Client
   Secret goes nowhere near this repo; it belongs only in Vercel's environment variables
   (`WA_CLIENT_SECRET` in `.env.example`).
3. Add a Supabase Edge Function (see "Hosting & backend" above) that does the token
   exchange and calls `/contacts/me`, and have `js/waAuth.js`'s
   `completeWildApricotLogin(code)` (sketched but commented out at the bottom of that
   file) call it. Map the returned contact's membership level to the roles in
   `js/data.js`.

Until then, `WA_CONFIG.clientId` stays empty and the gate's "Continue with Wild Apricot"
button keeps using the simulated sign-in it always has — filling in the client ID is what
switches it over to a real (but not yet completable) redirect, which is why the button's
caption changes automatically once it's set. The interface reads the signed-in member
from a single exported `currentUser` in `js/store.js`, so nothing else in the app needs
to change once real sign-in lands.

**Notification email** — every point that would send mail currently calls `toast()` with
the message and recipient count. Those call sites are the integration points: forum
topic publish, forum reply, repository contribution. Subscriptions are already stored as
stable keys (`thread:<id>`, `repo:<id>`, `cat:<id>`) ready to become subscription rows.

**Persistence** — `js/store.js` writes to `localStorage` behind a small interface
(`commit`, `toggleSub`, `addThread`, `addPost`, `addListing`). Swapping it for API calls
is contained to that module.

**Data** — `js/data.js` exports plain arrays and lookup helpers. Replace the module with
fetches returning the same shapes.
