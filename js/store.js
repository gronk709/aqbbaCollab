/* ==========================================================================
   Session state. Subscriptions, notifications and drafts live here.
   Persisted to localStorage so a page reload keeps what the member chose.
   ========================================================================== */

import {
  threads, allSubs, notifications, projects, apiaries, inspections, queenLines,
  members as seedMembers, currentUser as seedCurrentUser,
} from './data.js';
import { getSupabase } from './supabaseClient.js';

const KEY = 'aqbba.session.v1';

const seedSubs = () => {
  const set = new Set();
  threads.filter((t) => t.subscribed).forEach((t) => set.add(`thread:${t.id}`));
  allSubs.filter((s) => s.subscribed).forEach((s) => set.add(`repo:${s.id}`));
  return [...set];
};

const defaults = () => ({
  signedIn: false,
  subs: seedSubs(),
  read: notifications.filter((n) => !n.unread).map((n) => n.id),
  newThreads: [],
  newPosts: {},
  newProjects: [],
  projectJoins: [],
  projectParticipants: {},
  newApiaries: [],
  newHives: [],
  newInspections: [],
  contactDetails: {},
  roleOverrides: {},
  apiaryManagerOverrides: {},
  hiveOverrides: {},
  apiaryOverrides: {},
  newQueenLines: [],
  queenLineOverrides: {},
  breeders: [],
  breederOverrides: {},
  previewAs: null,
  digest: 'instant',
  currentUserId: null,
  provisionedMembers: [],
  remoteMember: null,
});

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    return { ...defaults(), ...JSON.parse(raw) };
  } catch {
    return defaults();
  }
}

export const state = load();

const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function commit() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ }
  listeners.forEach((fn) => fn());
}

/* --- identity -------------------------------------------------------------
   currentUser is session state, not a constant — which member it resolves
   to depends on how sign-in happened. The simulated demo path (signIn, used
   by the gate's plain email/password form) always resolves to the seed
   currentUser (Pete Czeti, full access, for testing) via state.currentUserId
   — kept only for that testing convenience (see README: "no production
   equivalent"), not touched by real sign-in.

   A real Wild Apricot login goes through completeWildApricotLogin (js/
   waAuth.js), which sets a real Supabase Auth session, then
   loadSignedInMember() below, which reads that signed-in member's own row
   — id, name, roles, contact details — from Postgres (RLS lets a member
   read their own full row; see supabase/migrations) and caches it as
   state.remoteMember. Everything else in this app still keeps working
   synchronously off that cache; only the sign-in moment itself is async,
   deliberately, rather than threading async through every render. */

export function allMembers() {
  const base = [...seedMembers, ...state.provisionedMembers];
  if (state.remoteMember && !base.some((m) => m.id === state.remoteMember.id)) {
    return [...base, state.remoteMember];
  }
  return base;
}

export function memberById(id) {
  if (state.remoteMember && state.remoteMember.id === id) return state.remoteMember;
  return allMembers().find((m) => m.id === id) || seedCurrentUser;
}

export function currentUser() {
  if (state.remoteMember) return state.remoteMember;
  return memberById(state.currentUserId || seedCurrentUser.id);
}

/* Reads the signed-in member's own row from Supabase and caches it as
   state.remoteMember — the one async step the real sign-in path needs.
   Called right after completeWildApricotLogin sets a session, and once at
   boot to restore a session that survived a page reload (Supabase persists
   it in its own localStorage key, separately from this app's session
   state).

   Returns null only for "there's genuinely no session to restore" — the
   ordinary case on a fresh visit or after the simulated demo sign-in,
   where boot's silent console.warn-and-carry-on handling is correct.
   Throws for every other failure (the member row can't be read, RLS
   denies it, no row is linked to this auth user yet) so the caller right
   after a real Wild Apricot sign-in — which already wraps this in the
   same try/catch as completeWildApricotLogin — shows an actual error
   toast instead of a false "Welcome" for a sign-in that didn't really
   finish. */
export async function loadSignedInMember() {
  const supabase = await getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data: row, error } = await supabase
    .from('members')
    /* member_roles!member_id hints PostgREST at which foreign key to embed
       on — member_roles has two FKs to members (member_id, whose row it
       is, and granted_by, who granted it), which is otherwise ambiguous. */
    .select('id, name, initials, state, member_since, member_roles!member_id(role_name), member_contact_details(phone, email, address)')
    .eq('auth_user_id', session.user.id)
    .maybeSingle();
  if (error) {
    console.error('Could not load the signed-in member:', error);
    throw new Error(`Couldn't load your member record (${error.message}).`);
  }
  if (!row) {
    throw new Error('Signed in, but no member record is linked to this account. Contact your Web Admin.');
  }

  const contact = Array.isArray(row.member_contact_details) ? row.member_contact_details[0] : row.member_contact_details;
  state.remoteMember = {
    id: row.id,
    name: row.name,
    initials: row.initials,
    state: row.state,
    since: row.member_since,
    roles: (row.member_roles || []).map((r) => r.role_name),
    phone: contact?.phone || '',
    email: contact?.email || '',
    address: contact?.address || '',
  };
  state.signedIn = true;
  commit();
  return state.remoteMember;
}

export function signIn() {
  state.currentUserId = null;
  state.signedIn = true;
  commit();
}

/* --- subscriptions ------------------------------------------------------- */

export const isSubscribed = (key) => state.subs.includes(key);

export function toggleSub(key) {
  const i = state.subs.indexOf(key);
  if (i === -1) state.subs.push(key); else state.subs.splice(i, 1);
  commit();
  return state.subs.includes(key);
}

/* --- notifications ------------------------------------------------------- */

export function feed() {
  const generated = [
    ...state.newThreads.map((t) => ({
      id: `gn-${t.id}`, kind: 'thread', at: t.at, source: t.categoryName, by: currentUser().id,
      text: `You created the topic “${t.title}”. Subscribers have been notified.`, to: `#/forum/${t.id}`,
    })),
    /* A "your listing is live" echo used to be generated here from
       state.newListings, same pattern as the thread one above — removed
       now that marketplace listings are real Supabase rows, not local
       session state. Notifications move to Postgres in their own later
       phase; rebuilding this specific echo against real data belongs
       there; see the plan doc for the phase ordering rationale (feed
       aggregates activity from every migrated entity, so it's migrated
       last, once, rather than partially rebuilt each phase). */
  ];
  return [...generated, ...notifications]
    .map((n) => ({ ...n, unread: !state.read.includes(n.id) }))
    .sort((a, b) => b.at - a.at);
}

export const unreadCount = () => feed().filter((n) => n.unread).length;

export function markAllRead() {
  feed().forEach((n) => { if (!state.read.includes(n.id)) state.read.push(n.id); });
  commit();
}

export function markRead(id) {
  if (!state.read.includes(id)) { state.read.push(id); commit(); }
}

/* --- member-authored content -------------------------------------------- */

export function addThread({ title, category, categoryName, body }) {
  const t = {
    id: `ut-${Date.now()}`, title, category, categoryName, body,
    author: currentUser().id, at: 0, created: 0, replies: 0, watchers: 1,
  };
  state.newThreads.unshift(t);
  state.subs.push(`thread:${t.id}`);
  commit();
  return t;
}

export function addPost(threadId, body) {
  if (!state.newPosts[threadId]) state.newPosts[threadId] = [];
  state.newPosts[threadId].push({ by: currentUser().id, at: 0, body });
  commit();
}

export const postsFor = (threadId) => state.newPosts[threadId] || [];

/* --- marketplace -----------------------------------------------------------
   The first entity migrated to real Postgres tables (Phase 2 — see the
   plan doc) — deliberately the simplest one, to prove the read/write/RLS
   pattern before the bigger entities. Both functions require a real
   Wild Apricot sign-in (state.remoteMember): the simulated demo identity
   (seedCurrentUser) has a fake, non-UUID id that no real `members` row
   matches, and has no Supabase session at all, so RLS would reject it —
   checked explicitly here for a clear error rather than a raw Postgres
   one. */

function requireRealMember() {
  if (!state.remoteMember) {
    throw new Error('This needs a real Wild Apricot sign-in — the demo sign-in can\'t be used here yet.');
  }
  return state.remoteMember;
}

export async function loadListings() {
  requireRealMember();
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('marketplace_listings')
    .select('id, kind, title, price, unit, qty, detail, state, created_at, seller:members(id, name, initials)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function addListing({ kind, title, price, unit, qty, detail }) {
  const me = requireRealMember();
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('marketplace_listings')
    .insert({ seller_id: me.id, kind, title, price, unit, qty, detail, state: me.state || null })
    .select('id, kind, title, price, unit, qty, detail, state, created_at, seller:members(id, name, initials)')
    .single();
  if (error) throw error;
  return data;
}

export const memberThreads = () => state.newThreads;

/* --- projects -------------------------------------------------------------
   A project is joined, not subscribed to: joining records what the member
   is contributing, not just that they want to hear about it. */

export const isJoined = (projectId) => state.projectJoins.includes(projectId);

export function joinProject(projectId, contribution) {
  if (!state.projectJoins.includes(projectId)) state.projectJoins.push(projectId);
  if (!state.projectParticipants[projectId]) state.projectParticipants[projectId] = [];
  state.projectParticipants[projectId].push({
    member: currentUser().id, contribution: contribution || 'Joined without a stated contribution.', joined: 0,
  });
  commit();
}

export const sessionParticipantsFor = (projectId) => state.projectParticipants[projectId] || [];

export function addProject({ title, summary, background, aims, questions, methods, addons, sites, openSites }) {
  const p = {
    id: `up-${Date.now()}`, code: `PRJ-${String(projects.length + state.newProjects.length + 1).padStart(2, '0')}`,
    status: 'recruiting', title, summary,
    background: [background], aims, questions, sites, openSites,
    participation: { summary: methods, methods: [methods], addons },
    timeline: 'Timeline to be confirmed once the project has its first participants.',
    coordinators: [currentUser().id], created: 0, participants: [],
  };
  state.newProjects.unshift(p);
  commit();
  return p;
}

export const memberProjects = () => state.newProjects;

export function recruitingCount() {
  const seeded = projects.filter((p) => p.status === 'recruiting').length;
  const mine = state.newProjects.filter((p) => p.status === 'recruiting').length;
  return seeded + mine;
}

/* --- apiaries, hives & inspections ----------------------------------------
   These are the program's own research data, not member social content, so
   they're kept separate from the forum/marketplace/project patterns above
   even though the shape of "seeded + member-added, merged for rendering" is
   the same idea throughout. */

/* A hive's fields can be corrected or updated after the fact — either the
   full Edit Hive form, or just a status change from a hive-level inspection
   (see addInspection below) — stored the same way as roleOverrides etc.,
   keyed by hive id and applied on top of whichever base record (seed or
   member-added) the hive came from. */
function withHiveOverrides(h) {
  const o = state.hiveOverrides[h.id];
  return o ? { ...h, ...o } : h;
}

function setHiveStatus(hiveId, status) {
  state.hiveOverrides[hiveId] = { ...(state.hiveOverrides[hiveId] || {}), status, lastSeen: 0 };
}

export function updateHive(hiveId, patch) {
  state.hiveOverrides[hiveId] = { ...(state.hiveOverrides[hiveId] || {}), ...patch };
  commit();
}

/* An apiary's fields — including status — are editable after creation from
   its own page, same override pattern as hives above. */
export function updateApiary(apiaryId, patch) {
  state.apiaryOverrides[apiaryId] = { ...(state.apiaryOverrides[apiaryId] || {}), ...patch };
  commit();
}

/* --- queen lines & breeders --------------------------------------------------
   Queen lines are a program-wide record, not scoped to one apiary — hives
   reference a line by its code (hive.line), so the code stays fixed once a
   line is created, same reasoning as hive ids. Unlike hive id, the code is
   never shown in the UI — members only ever see and edit the line's name,
   which can change; the code is an internal key only, so it's generated
   here rather than entered. A line's breeder can be either an existing
   member (id like 'm7') or a standalone breeder record added below, for
   someone contributing a line who isn't a registered platform member —
   resolved uniformly by breederById. */

export function allQueenLines() {
  return [...state.newQueenLines, ...queenLines].map((l) => ({ ...l, ...(state.queenLineOverrides[l.code] || {}) }));
}

export const lineByCode = (code) => allQueenLines().find((l) => l.code === code);

function generateLineCode(name) {
  const base = (name.match(/[A-Za-z]+/) || ['LIN'])[0].slice(0, 3).toUpperCase() || 'LIN';
  const taken = new Set(allQueenLines().map((l) => l.code));
  let n = 1;
  let code = `${base}-${String(n).padStart(2, '0')}`;
  while (taken.has(code)) { n++; code = `${base}-${String(n).padStart(2, '0')}`; }
  return code;
}

export function addQueenLine({ name, breeder, gen, vshMean, note }) {
  const line = { code: generateLineCode(name), name, breeder, gen: gen || 1, vshMean: vshMean ?? 0, note: note || '' };
  state.newQueenLines.unshift(line);
  commit();
  return line;
}

export function updateQueenLine(code, patch) {
  state.queenLineOverrides[code] = { ...(state.queenLineOverrides[code] || {}), ...patch };
  commit();
}

const initialsOf = (name) => name.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 3) || '?';

export function allBreeders() {
  return state.breeders.map((b) => ({ ...b, ...(state.breederOverrides[b.id] || {}) }));
}

export function addBreeder({ name, state: region, note }) {
  const b = { id: `br-${Date.now()}`, name, state: region || '', note: note || '', initials: initialsOf(name) };
  state.breeders.unshift(b);
  commit();
  return b;
}

export function updateBreeder(breederId, patch) {
  state.breederOverrides[breederId] = { ...(state.breederOverrides[breederId] || {}), ...patch };
  commit();
}

/* A queen line's breeder is either a member id ('m7') or a standalone
   breeder id ('br-...') — resolve to a display-ready shape either way. */
export function breederById(id) {
  if (/^m\d+$/.test(id)) return memberById(id);
  return allBreeders().find((b) => b.id === id) || { id, name: 'Unknown breeder', state: '', initials: '?' };
}

function withMemberHives(ap) {
  const extra = state.newHives.filter((h) => h.apiary === ap.id);
  const hiveRecords = [...(ap.hiveRecords || []), ...extra].map(withHiveOverrides);
  const override = state.apiaryOverrides[ap.id] || {};
  return { ...ap, ...override, hiveRecords, hives: hiveRecords.length, managers: managersFor(ap.id) };
}

export function allApiaries() {
  return [...state.newApiaries, ...apiaries].map(withMemberHives);
}

export const allApiaryById = (id) => allApiaries().find((a) => a.id === id);

export function addApiary({ name, region, coords, flora, brief, manager, established, stage }) {
  const initials = name.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 4) || 'NEW';
  const taken = new Set(allApiaries().map((a) => a.code));
  let code = initials;
  for (let n = 2; taken.has(code); n++) code = `${initials}${n}`;

  const ap = {
    id: `ap-${Date.now()}`, name, code,
    region, coords: coords || '—',
    stage: stage || 'establishing', manager,
    established: established || new Date().getFullYear(),
    hives: 0, flora: flora || '—', brief, hiveRecords: [], managers: [manager],
  };
  state.newApiaries.unshift(ap);
  commit();
  return ap;
}

/* Hive ID is entered by whoever registers the hive (validated for
   uniqueness in the Add Hive form) rather than assigned automatically. */
export function addHive(apiaryId, hive) {
  const record = { apiary: apiaryId, lastSeen: 0, ...hive };
  state.newHives.push(record);
  commit();
  return record;
}

function daysFromToday(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

function hydrateInspection(i) {
  return { ...i, date: new Date(`${i.dateStr}T00:00:00`), offset: daysFromToday(i.dateStr) };
}

export function addInspection({ apiary, kind, by, hiveIds, status, note, dateStr, done }) {
  const insp = {
    id: `ui-${Date.now()}`, apiary, kind, by: by || currentUser().id,
    hiveIds: hiveIds || [], status: status || null, done: !!done, note: note || '', dateStr,
  };
  state.newInspections.push(insp);
  if (status) insp.hiveIds.forEach((hiveId) => setHiveStatus(hiveId, status));
  commit();
  return insp;
}

export const allInspections = () => [...state.newInspections.map(hydrateInspection), ...inspections];
export const allRecentInspections = () => allInspections().filter((i) => i.done).sort((a, b) => b.date - a.date);
export const allUpcomingInspections = () => allInspections().filter((i) => !i.done).sort((a, b) => a.date - b.date);

/* --- contact details --------------------------------------------------------
   Phone and email are mandatory once a member's contact record is saved, so
   the only valid states are "nothing saved yet" and "phone + email present"
   — never a half-filled record sitting in storage. */

export function contactFor(memberId) {
  const base = memberById(memberId);
  const saved = state.contactDetails[memberId];
  return {
    phone: saved?.phone ?? base.phone ?? '',
    email: saved?.email ?? base.email ?? '',
    address: saved?.address ?? base.address ?? '',
  };
}

export const hasContact = (memberId) => {
  const c = contactFor(memberId);
  return Boolean(c.phone && c.email);
};

export function setContact(memberId, { phone, email, address }) {
  state.contactDetails[memberId] = { phone, email, address: address || '' };
  commit();
}

/* --- roles & apiary access --------------------------------------------------
   A member can hold several roles at once. "Apiary Manager" is a title, not
   itself a grant — the actual permission to add hives or log inspections at
   a given site comes from that apiary's own managers list, set separately
   below. Holding the role without being on any site's list means exactly
   that: the title, but nothing to act on yet. */

export function rolesFor(memberId) {
  const base = memberById(memberId);
  return state.roleOverrides[memberId] ?? base.roles ?? [];
}

export const roleLabel = (memberId) => rolesFor(memberId).join(' & ') || '—';

export function setRoles(memberId, roles) {
  state.roleOverrides[memberId] = roles;
  commit();
}

/* Reads the raw seed + member-added apiary lists directly (never
   allApiaries()) so this can't recurse through withMemberHives, which calls
   this function to build each apiary's live .managers field. */
export function managersFor(apiaryId) {
  if (state.apiaryManagerOverrides[apiaryId]) return state.apiaryManagerOverrides[apiaryId];
  const ap = [...state.newApiaries, ...apiaries].find((a) => a.id === apiaryId);
  return ap?.managers || (ap?.manager ? [ap.manager] : []);
}

export function setManagedApiaries(memberId, apiaryIds) {
  [...state.newApiaries, ...apiaries].forEach((ap) => {
    const current = managersFor(ap.id);
    const has = current.includes(memberId);
    const want = apiaryIds.includes(ap.id);
    if (want && !has) state.apiaryManagerOverrides[ap.id] = [...current, memberId];
    if (!want && has) state.apiaryManagerOverrides[ap.id] = current.filter((id) => id !== memberId);
  });
  commit();
}

/* --- permission preview -----------------------------------------------------
   This app has exactly one real signed-in identity — everyone who opens it
   is Web Admin, who can act on every site. To make per-site restrictions
   demonstrable at all, this lets a tester preview the apiary pages as if
   signed in as someone else. It only affects the two gated actions below
   (adding a hive, logging an inspection, and creating a new apiary);
   authorship of forum posts, listings, and project joins always stays the
   real signed-in member. There is no real multi-user session here —
   production would derive this from the actual authenticated member. */

export function setPreviewAs(memberId) { state.previewAs = memberId || null; commit(); }
export const previewUser = () => memberById(state.previewAs || currentUser().id);

export const isWebAdmin = (memberId = previewUser().id) => rolesFor(memberId).includes('Web Admin');

export function canEditApiary(apiaryId) {
  const uid = previewUser().id;
  if (isWebAdmin(uid)) return true;
  return managersFor(apiaryId).includes(uid);
}

/* --- repository permissions --------------------------------------------------
   Member is read-only in the repository; Creator adds Member's access plus
   the ability to contribute content. The operational roles (Web Admin,
   Apiary Manager, Operator, Breeder) keep the full repository access they've
   always had, unrelated to the apiary edit grants above. */

const REPOSITORY_CONTRIBUTOR_ROLES = ['Web Admin', 'Apiary Manager', 'Operator', 'Breeder', 'Creator'];

export function canContributeRepository(memberId = previewUser().id) {
  return rolesFor(memberId).some((r) => REPOSITORY_CONTRIBUTOR_ROLES.includes(r));
}

/* --- session ------------------------------------------------------------- */

/* Async because a real sign-in needs its Supabase session cleared too —
   otherwise a page reload would silently sign the member back in via that
   persisted session. Best-effort: if Supabase itself can't be reached, the
   local state still clears and the member is signed out of this app. */
export async function signOut() {
  state.signedIn = false;
  state.remoteMember = null;
  commit();
  try {
    const supabase = await getSupabase();
    await supabase.auth.signOut();
  } catch (err) {
    console.warn('Could not clear the Supabase session:', err);
  }
}
