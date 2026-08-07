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

**Research dashboard** (`#/`) — program-wide figures, then a card per research apiary
showing location, coordinates, program stage (initialising / assessment / maintenance),
manager, hive count, mean VSH, hives in treatment and hives treatment-free for three or
more seasons. Below that: the honeycomb hive grid, a colony status breakdown, upcoming
and recently completed inspections, and the contributing breeders with their queen lines.

**Apiary records** (`#/apiaries`) — a comparison table across sites, then per-apiary: the
full hive grid, queen lines present with site performance measured against each line's
program mean, the complete inspection schedule, site detail, and which research projects
are currently running there. This is also where the program's own data gets maintained:
**Add apiary** registers a new research site, **Add hive** registers a new hive at a site
(the hive ID is assigned automatically), and **Log inspection** records a completed or
scheduled inspection. These three are meaningfully different from the member-facing
composers elsewhere (forum, marketplace, repository) — they alter the program's research
data rather than adding social content, so in a production build they'd want to be
restricted to apiary managers and the research coordinator rather than open to any member.
The prototype doesn't enforce that distinction since there's only one signed-in user to
test with, but it's a real access-control decision for later, not an oversight.

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
(`roleOptions` in `js/data.js`, which includes "Operator" alongside the original roles).
Holding the "Apiary Manager" title is not itself a permission — actual edit access to a
site (adding a hive, logging an inspection, and creating new apiaries) is a separate
grant, checked per apiary. A member with that grant for Barrowfield cannot touch
Oradale's data unless separately granted there too; the Research Coordinator can always
edit every site. Editing roles and grants is itself restricted to the Coordinator.

This app has exactly one real signed-in identity, so the restriction above would never
actually trigger in testing — everyone who opens it is the Coordinator. To make it
demonstrable, the rail has a **"Preview apiary access as"** selector, clearly marked
`(prototype)`. It only affects the three gated actions (add hive, log inspection, add
apiary) — authorship of forum posts, listings and project joins always stays the real
signed-in member. This selector has no production equivalent; a real deployment derives
permissions from the actual authenticated Wild Apricot member, and this whole mechanism
(`previewUser`/`setPreviewAs` in `js/store.js`) should be deleted once that's wired up.

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
publishable. One sub-topic carries a full representative article to show the reading
experience.

**Marketplace** (`#/marketplace`) — queens, nucs, semen and equipment, filterable by
category, with a listing composer and a seller enquiry flow.

**Notifications** (`#/notifications`) — every notification the subscription machinery
would have emailed, with unread state, plus a summary of everything the member follows.

## The honeycomb grid

The dashboard renders all ~100 hives in an apiary as one interlocking honeycomb field.
Each hexagon is a real hive record; click it to read that hive's five assessment data
points (VSH score, mite load, brood frames, temperament, last inspection) plus its queen
line, contributing breeder, and queen marking.

Cell colours quote the **international queen-marking colour code** — the one colour
system every queen breeder already reads fluently — rather than an arbitrary palette.

## Design

- **Palette** — comb wax ground (`#F7F4ED`), propolis ink (`#241C12`), raw honey as the
  single action colour (`#C77F0A`). Status colours come from the queen-marking code.
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
    repository.js     Tracks, sub-topics, article view
    marketplace.js    Listings, filters, composer, enquiry
    notifications.js  Activity feed and subscription summary
```

## Wiring up the real integrations

**Wild Apricot** — replace `signIn()` in `js/store.js` with the OAuth flow. Wild Apricot
exposes a standard authorization-code flow; on return, exchange the code for a token,
call `/accounts/{id}/contacts/me`, and map the contact's membership level to the roles in
`js/data.js`. The interface reads the signed-in member from a single exported
`currentUser`, so nothing else needs to change.

**Notification email** — every point that would send mail currently calls `toast()` with
the message and recipient count. Those call sites are the integration points: forum
topic publish, forum reply, repository contribution. Subscriptions are already stored as
stable keys (`thread:<id>`, `repo:<id>`, `cat:<id>`) ready to become subscription rows.

**Persistence** — `js/store.js` writes to `localStorage` behind a small interface
(`commit`, `toggleSub`, `addThread`, `addPost`, `addListing`). Swapping it for API calls
is contained to that module.

**Data** — `js/data.js` exports plain arrays and lookup helpers. Replace the module with
fetches returning the same shapes.
