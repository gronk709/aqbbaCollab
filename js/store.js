/* ==========================================================================
   Session state. Subscriptions, notifications and drafts live here.
   Persisted to localStorage so a page reload keeps what the member chose.
   ========================================================================== */

import { threads, allSubs, notifications, currentUser } from './data.js';

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

/* --- session ------------------------------------------------------------- */

export function signIn() { state.signedIn = true; commit(); }
export function signOut() { state.signedIn = false; commit(); }
