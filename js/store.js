/* ==========================================================================
   Session state. Subscriptions, notifications and drafts live here.
   Persisted to localStorage so a page reload keeps what the member chose.
   ========================================================================== */

import {
  threads, allSubs, notifications, currentUser, projects, apiaries, inspections, memberById,
} from './data.js';

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
  newListings: [],
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
  previewAs: null,
  digest: 'instant',
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
      id: `gn-${t.id}`, kind: 'thread', at: t.at, source: t.categoryName, by: currentUser.id,
      text: `You created the topic “${t.title}”. Subscribers have been notified.`, to: `#/forum/${t.id}`,
    })),
    ...state.newListings.map((l) => ({
      id: `gl-${l.id}`, kind: 'market', at: l.at, source: 'Marketplace', by: currentUser.id,
      text: `Your listing “${l.title}” is live.`, to: '#/marketplace',
    })),
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
    author: currentUser.id, at: 0, created: 0, replies: 0, watchers: 1,
  };
  state.newThreads.unshift(t);
  state.subs.push(`thread:${t.id}`);
  commit();
  return t;
}

export function addPost(threadId, body) {
  if (!state.newPosts[threadId]) state.newPosts[threadId] = [];
  state.newPosts[threadId].push({ by: currentUser.id, at: 0, body });
  commit();
}

export const postsFor = (threadId) => state.newPosts[threadId] || [];

export function addListing(listing) {
  const l = { ...listing, id: `ul-${Date.now()}`, at: 0, posted: 0, seller: currentUser.id };
  state.newListings.unshift(l);
  commit();
  return l;
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
    member: currentUser.id, contribution: contribution || 'Joined without a stated contribution.', joined: 0,
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
    coordinators: [currentUser.id], created: 0, participants: [],
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

/* A hive's status can be updated after the fact by a hive-level inspection
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

function withMemberHives(ap) {
  const extra = state.newHives.filter((h) => h.apiary === ap.id);
  const hiveRecords = [...(ap.hiveRecords || []), ...extra].map(withHiveOverrides);
  return { ...ap, hiveRecords, hives: hiveRecords.length, managers: managersFor(ap.id) };
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
    stage: stage || 'initialising', manager,
    established: established || new Date().getFullYear(),
    hives: 0, flora: flora || '—', brief, hiveRecords: [], managers: [manager],
  };
  state.newApiaries.unshift(ap);
  commit();
  return ap;
}

export function addHive(apiaryId, hive) {
  const ap = allApiaryById(apiaryId);
  const n = ap.hiveRecords.length + 1;
  const record = {
    id: `${ap.code}-${String(n).padStart(3, '0')}`,
    apiary: apiaryId, lastSeen: 0,
    ...hive,
  };
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
    id: `ui-${Date.now()}`, apiary, kind, by: by || currentUser.id,
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
export const previewUser = () => memberById(state.previewAs || currentUser.id);

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

export function signIn() { state.signedIn = true; commit(); }
export function signOut() { state.signedIn = false; commit(); }
