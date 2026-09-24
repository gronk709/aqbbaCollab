/* ==========================================================================
   Session state. Subscriptions, notifications and drafts live here.
   Persisted to localStorage so a page reload keeps what the member chose.
   ========================================================================== */

import {
  members as seedMembers, currentUser as seedCurrentUser,
} from './data.js';
import { getSupabase, SUPABASE_CONFIG } from './supabaseClient.js';

const KEY = 'aqbba.session.v1';

const defaults = () => ({
  signedIn: false,
  /* Loaded fresh from Supabase (loadMySubscriptions) whenever the forum or
     repository is visited — not seeded from anywhere locally, unlike
     before real subscriptions existed. */
  subs: [],
  /* Loaded fresh from Supabase (loadNotifications) — see the "notifications"
     section below. Empty until that first resolves, same as subs above. */
  notifications: [],
  contactDetails: {},
  roleOverrides: {},
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

/* allMembers() above mixes in seed/demo members whose ids ('m1', 'm2', …)
   aren't real uuids — fine for read-only display, but project_team.member_id
   is a real FK to this table, so assigning one of those ids would fail
   (or worse, silently attach the grant to nothing). Anywhere that writes a
   real per-member row — like the project team picker — needs to read this
   table directly instead. */
export async function loadRealMembers() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('members').select('id, name, initials')
    .is('deactivated_at', null).order('name');
  if (error) throw error;
  return data;
}

/* --- members directory -------------------------------------------------
   The #/members directory and #/managers/:id detail page (js/views/
   managers.js) — unlike the callers above, these show every real member
   in full (roles, contact details, Wild Apricot sign-in status), not a
   name-only picker, so they use the same normalizeMemberRow() shape
   loadSignedInMember() does rather than loadRealMembers()'s lean one. */

export async function loadMembersDirectory() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('members').select(MEMBER_ROW_FIELDS).order('name');
  if (error) throw error;
  return data.map(normalizeMemberRow);
}

export async function loadMemberDetail(id) {
  const supabase = await getSupabase();
  const [{ data: row, error }, { data: grants, error: grantsErr }] = await Promise.all([
    supabase.from('members').select(MEMBER_ROW_FIELDS).eq('id', id).single(),
    /* Real per-site access (Phase 5, apiary_managers) — replaces the old
       mock-only "Manages" panel, which read allApiaries().filter(a =>
       a.managers.includes(m.id)), a function that no longer exists. */
    supabase.from('apiary_managers').select('access_level, apiary:apiaries(id, code, name)').eq('member_id', id),
  ]);
  if (error) throw error;
  if (grantsErr) throw grantsErr;

  return {
    ...normalizeMemberRow(row),
    manages: grants.map((g) => ({ ...g.apiary, accessLevel: g.access_level })),
  };
}

/* Upserts (member_id is member_contact_details' own primary key) rather
   than insert-or-update, since a Web Admin editing someone else's page —
   or the member themselves, first time — may or may not have a row yet.
   RLS (member_id = current_member_id() or is_web_admin()) governs both
   the insert and the update path this can take. */
export async function setMemberContact(memberId, { phone, email, address }) {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from('member_contact_details')
    .upsert({ member_id: memberId, phone, email, address: address || null }, { onConflict: 'member_id' });
  if (error) throw error;
}

export function memberById(id) {
  if (state.remoteMember && state.remoteMember.id === id) return state.remoteMember;
  return allMembers().find((m) => m.id === id) || seedCurrentUser;
}

export function currentUser() {
  if (state.remoteMember) return state.remoteMember;
  return memberById(state.currentUserId || seedCurrentUser.id);
}

/* Shared shape for a real `members` row, how every real-data caller
   (loadSignedInMember, loadMembersDirectory, loadMemberDetail) presents
   one — matches the seed roster's own field names (state/since/wa/roles)
   so view code didn't need to change field names when it moved off mock
   data, just where the data came from. */
const MEMBER_ROW_FIELDS = 'id, name, initials, state, member_since, wa_contact_id, auth_user_id, deactivated_at, member_roles!member_id(role_name), member_contact_details(phone, email, address)';

function normalizeMemberRow(row) {
  const contact = Array.isArray(row.member_contact_details) ? row.member_contact_details[0] : row.member_contact_details;
  return {
    id: row.id,
    name: row.name,
    initials: row.initials,
    state: row.state,
    since: row.member_since,
    wa: row.wa_contact_id || '',
    hasSignedIn: !!row.auth_user_id,
    deactivated: !!row.deactivated_at,
    roles: (row.member_roles || []).map((r) => r.role_name),
    phone: contact?.phone || '',
    email: contact?.email || '',
    address: contact?.address || '',
  };
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
    .select(MEMBER_ROW_FIELDS)
    .eq('auth_user_id', session.user.id)
    .maybeSingle();
  if (error) {
    console.error('Could not load the signed-in member:', error);
    throw new Error(`Couldn't load your member record (${error.message}).`);
  }
  if (!row) {
    throw new Error('Signed in, but no member record is linked to this account. Contact your Web Admin.');
  }

  state.remoteMember = normalizeMemberRow(row);
  state.signedIn = true;
  commit();
  return state.remoteMember;
}

/* Called once, right after a collaborator accepts an email invite, or sets
   a new password from a "forgot password" recovery link (js/inviteAuth.js /
   js/views/setPassword.js) — either link already established a real
   Supabase session on its own, this just gives it a password so they can
   sign in again later without repeating that link flow. Shared by both,
   since the underlying operation (and the account this runs against) is
   identical either way — only the page copy leading up to it differs (see
   setPassword.js's own mode param). */
export async function completeCollaboratorPasswordSetup(password) {
  const supabase = await getSupabase();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  state.awaitingPasswordSetup = false;
  state.awaitingPasswordReset = false;
  await loadSignedInMember();
}

/* Real sign-in for a direct (non–Wild Apricot) account — js/views/gate.js's
   #creds form. Throws on bad credentials; the caller still needs to call
   loadSignedInMember() after this succeeds, same as completeWildApricotLogin's
   callers do, since this only establishes the session. */
export async function signInWithPassword(email, password) {
  const supabase = await getSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/* js/views/gate.js's "Forgot password?" link — public and unauthenticated
   by design, same shape as wildapricot-auth, since nobody asking to reset a
   password is signed in yet. Nothing client-side can tell whether this
   email belongs to a Wild-Apricot-linked member (RLS blocks every read of
   members/member_contact_details for a signed-out session), so that check
   has to happen in the forgot-password Edge Function, with the service role
   key — see its own header comment for why a Wild-Apricot-linked member
   never gets an actual reset email (their auth.users row has no password
   at all; sending one would open a second, WA-independent way to sign in).
   Resolves to { method: 'wildapricot' } (gate.js shows a "manage this
   through Wild Apricot" dialog and stops) or { method: 'email' } (the
   function has already asked Supabase to send a real recovery email — a
   silent no-op if the address doesn't match a real account, Supabase's own
   anti-enumeration behaviour, not anything this app adds itself). */
export async function requestPasswordReset(email) {
  const res = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/forgot-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_CONFIG.anonKey}`,
      apikey: SUPABASE_CONFIG.anonKey,
    },
    body: JSON.stringify({ email }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Could not process that request.');
  return body;
}

export function signIn() {
  state.currentUserId = null;
  state.signedIn = true;
  commit();
}

/* --- subscriptions ---------------------------------------------------------
   Phase 3 of the backend migration (see the plan doc) — real rows in the
   `subscriptions` table now, replacing the local 'thread:t1'-style keys
   this app always displayed with. isSubscribed still reads the same
   state.subs array of "type:id" keys synchronously, unchanged — only
   where that array comes from is different: loadMySubscriptions()
   (called by the forum/repository route loaders) replaces it with this
   member's real subscription rows, and toggleSub is now async, writing
   through to Postgres before updating it locally. */

export const isSubscribed = (key) => state.subs.includes(key);

export async function loadMySubscriptions() {
  const me = requireRealMember();
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('subscriptions')
    .select('subscribable_type, subscribable_id')
    .eq('member_id', me.id);
  if (error) throw error;
  state.subs = data.map((s) => `${s.subscribable_type}:${s.subscribable_id}`);
  commit();
}

export async function toggleSub(key) {
  const me = requireRealMember();
  const [type, id] = key.split(':');
  const supabase = await getSupabase();
  if (state.subs.includes(key)) {
    const { error } = await supabase.from('subscriptions').delete()
      .eq('member_id', me.id).eq('subscribable_type', type).eq('subscribable_id', id);
    if (error) throw error;
    state.subs = state.subs.filter((s) => s !== key);
  } else {
    const { error } = await supabase.from('subscriptions')
      .insert({ member_id: me.id, subscribable_type: type, subscribable_id: id });
    if (error) throw error;
    state.subs.push(key);
  }
  commit();
  return state.subs.includes(key);
}

/* Aggregate subscriber counts for a batch of same-type ids in one round
   trip (the subscriber_counts RPC — see the migration) — e.g. every
   thread on the forum index at once, rather than one query per thread.
   Missing ids (nobody subscribed) just don't come back as rows, so this
   fills those in as 0 for a plain lookup object. */
export async function subscriberCounts(type, ids) {
  if (!ids.length) return {};
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('subscriber_counts', { p_type: type, p_ids: ids });
  if (error) throw error;
  const counts = Object.fromEntries(ids.map((id) => [id, 0]));
  data.forEach((row) => { counts[row.subscribable_id] = Number(row.cnt); });
  return counts;
}

/* Fires the real subscriber notification (supabase/functions/notify-
   subscribers) after a successful publish — forum thread/reply and
   repository article/document/link all call this the same way. It writes
   the in-app notifications row AND sends the email, both server-side.
   Fire-and-forget: a broken or unconfigured email provider (e.g.
   RESEND_API_KEY not set yet) shouldn't stop the publish that already
   succeeded, so failures just log. `path` is a relative in-app route
   (e.g. '#/forum/<id>') — the function builds the absolute emailed link
   from its own request Origin, not from anything passed here. */
async function notifySubscribers({ type, id, contextName, itemKind, itemTitle, path, excludeMemberId }) {
  try {
    const me = currentUser();
    const supabase = await getSupabase();
    const { error } = await supabase.functions.invoke('notify-subscribers', {
      body: { type, id, contextName, itemKind, itemTitle, actorName: me.name, actorId: me.id, path, excludeMemberId },
    });
    if (error) console.warn('Notification failed to send:', error.message || error);
  } catch (err) {
    console.warn('Notification failed to send:', err);
  }
}

/* --- notifications ---------------------------------------------------------
   Real now (20260916000000...) — notify-subscribers writes one row per
   notified subscriber alongside the email it sends. state.notifications is
   a client-side cache, same pattern as state.subs: loadNotifications() is
   the '#/notifications' route's `load` (js/app.js), and is also fired
   fire-and-forget right after a real sign-in resolves, purely so the rail's
   unread badge (unreadCount(), read synchronously on every render) is
   accurate from first paint rather than only after visiting the page once. */

export function feed() {
  return state.notifications.map((n) => ({ ...n, unread: !n.read_at }));
}

export const unreadCount = () => state.notifications.filter((n) => !n.read_at).length;

export async function loadNotifications() {
  const me = requireRealMember();
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('notifications')
    /* actor:members!actor_id hints PostgREST at which foreign key to embed
       on — notifications has two FKs to members (member_id, the
       recipient, and actor_id, who triggered it), otherwise ambiguous.
       Same class of bug as the Phase 3 member_roles embed fix. */
    .select('id, kind, source_name, body, link_path, created_at, read_at, actor:members!actor_id(id, name)')
    .eq('member_id', me.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  state.notifications = data;
  commit();
  return data;
}

export async function markAllRead() {
  const me = requireRealMember();
  const unread = state.notifications.filter((n) => !n.read_at);
  if (!unread.length) return;
  const supabase = await getSupabase();
  const now = new Date().toISOString();
  const { error } = await supabase.from('notifications')
    .update({ read_at: now }).eq('member_id', me.id).is('read_at', null);
  if (error) throw error;
  state.notifications = state.notifications.map((n) => (n.read_at ? n : { ...n, read_at: now }));
  commit();
}

export async function markRead(id) {
  const n = state.notifications.find((x) => x.id === id);
  if (!n || n.read_at) return;
  const supabase = await getSupabase();
  const now = new Date().toISOString();
  const { error } = await supabase.from('notifications').update({ read_at: now }).eq('id', id);
  if (error) throw error;
  n.read_at = now;
  commit();
}

/* --- forum -------------------------------------------------------------
   Phase 3 of the backend migration (see the plan doc). Like marketplace
   listings in Phase 2, every function here requires a real Wild Apricot
   sign-in (requireRealMember, defined below) — and like marketplace, the
   six old seed discussions aren't carried over (fake seed authors, no
   real `members` row), so the forum starts empty.

   Author info (name/initials/roles) is embedded directly in these queries
   rather than resolved via memberById/roleLabel — those only know about
   the seed roster plus whichever single member is currently signed in
   (state.remoteMember), not an arbitrary real author of someone else's
   post, since the members directory itself hasn't moved to Postgres yet. */

const MEMBER_DISPLAY_FIELDS = 'id, name, initials, member_roles!member_id(role_name)';

function withRoles(m) {
  return m ? { ...m, roles: (m.member_roles || []).map((r) => r.role_name) } : m;
}

export async function loadForumThreads() {
  requireRealMember();
  const supabase = await getSupabase();

  const [, { data: categories, error: catErr }, { data: threads, error: threadErr }] = await Promise.all([
    loadMySubscriptions(),
    supabase.from('forum_categories').select('id, name').order('sort_order'),
    supabase.from('forum_threads')
      .select(`id, title, body, pinned, created_at, category:forum_categories(id, name), author:members(${MEMBER_DISPLAY_FIELDS}), forum_posts(count)`)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false }),
  ]);
  if (catErr) throw catErr;
  if (threadErr) throw threadErr;

  const counts = await subscriberCounts('thread', threads.map((t) => t.id));
  return {
    categories,
    threads: threads.map((t) => ({
      ...t,
      author: withRoles(t.author),
      replyCount: t.forum_posts[0]?.count ?? 0,
      watchers: counts[t.id] ?? 0,
    })),
  };
}

export async function loadThread(id) {
  requireRealMember();
  const supabase = await getSupabase();
  await loadMySubscriptions();

  const { data: thread, error: threadErr } = await supabase
    .from('forum_threads')
    .select(`id, title, body, pinned, created_at, category:forum_categories(id, name), author:members(${MEMBER_DISPLAY_FIELDS})`)
    .eq('id', id)
    .single();
  if (threadErr) throw threadErr;

  const { data: posts, error: postsErr } = await supabase
    .from('forum_posts')
    .select(`id, body, created_at, author:members(${MEMBER_DISPLAY_FIELDS})`)
    .eq('thread_id', id)
    .order('created_at', { ascending: true });
  if (postsErr) throw postsErr;

  const { data: attachments, error: attErr } = await supabase
    .from('forum_attachments')
    .select('id, post_id, author_id, kind, url, storage_path, filename, mime_type, size_bytes, created_at')
    .eq('thread_id', id)
    .order('created_at', { ascending: true });
  if (attErr) throw attErr;

  const watchers = (await subscriberCounts('thread', [id]))[id] ?? 0;

  return {
    thread: { ...thread, author: withRoles(thread.author) },
    posts: posts.map((p) => ({ ...p, author: withRoles(p.author) })),
    attachments,
    watchers,
  };
}

export async function addThread({ title, categoryId, body, links = [], files = [] }) {
  const me = requireRealMember();
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('forum_threads')
    .insert({ category_id: categoryId, author_id: me.id, title, body })
    .select('id, category:forum_categories(name)')
    .single();
  if (error) throw error;
  await supabase.from('subscriptions').insert({ member_id: me.id, subscribable_type: 'thread', subscribable_id: data.id });
  await saveAttachments(data.id, null, me.id, links, files);
  notifySubscribers({
    type: 'cat', id: categoryId, contextName: data.category?.name || 'the forum', itemKind: 'thread',
    itemTitle: title, path: `#/forum/${data.id}`, excludeMemberId: me.id,
  });
  return data;
}

export async function addPost(threadId, body, links = [], files = []) {
  const me = requireRealMember();
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('forum_posts')
    .insert({ thread_id: threadId, author_id: me.id, body })
    .select('id, thread:forum_threads(title)')
    .single();
  if (error) throw error;
  notifySubscribers({
    type: 'thread', id: threadId, contextName: data.thread?.title || 'a thread', itemKind: 'reply',
    itemTitle: body.length > 140 ? `${body.slice(0, 140)}…` : body,
    path: `#/forum/${threadId}`, excludeMemberId: me.id,
  });
  await saveAttachments(threadId, data.id, me.id, links, files);
  if (!isSubscribed(`thread:${threadId}`)) {
    await supabase.from('subscriptions').insert({ member_id: me.id, subscribable_type: 'thread', subscribable_id: threadId });
    state.subs.push(`thread:${threadId}`);
    commit();
  }
}

/* A reply, unlike the topic itself, was never frozen (see the permissions
   migration's header comment for why those two are treated differently)
   — its author can still remove it outright, same as Web Admin
   moderating. forum_attachments rows on it cascade-delete in Postgres
   automatically (the FK is ON DELETE CASCADE), but that only removes
   the metadata rows — a file-kind attachment's actual Storage object
   doesn't cascade, so it's cleaned up here first. */
export async function deleteForumPost(post) {
  const me = requireRealMember();
  if (post.author.id !== me.id && !isWebAdmin(me.id)) throw new Error('You can only delete your own replies.');
  const supabase = await getSupabase();

  const { data: files, error: filesErr } = await supabase
    .from('forum_attachments')
    .select('storage_path')
    .eq('post_id', post.id)
    .eq('kind', 'file');
  if (filesErr) throw filesErr;
  if (files.length) {
    await supabase.storage.from(ATTACHMENTS_BUCKET).remove(files.map((f) => f.storage_path));
  }

  const { error } = await supabase.from('forum_posts').delete().eq('id', post.id);
  if (error) throw error;
}

/* --- forum attachments -------------------------------------------------
   URLs and documents attached to a topic's opening post (post_id null) or
   a reply (post_id set). Files land in the private 'forum-attachments'
   Storage bucket (see the Phase 3+ migration) — never a public one, so
   opening one always goes through a freshly-signed, short-lived URL
   (openForumAttachment) rather than a plain link. */

const ATTACHMENTS_BUCKET = 'forum-attachments';
export const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
export const ATTACHMENT_ACCEPT = '.pdf,.doc,.docx,.txt,.rtf,.odt,.xls,.xlsx,.csv,.ppt,.pptx';

async function saveAttachments(threadId, postId, authorId, links, files) {
  if (!links.length && !files.length) return;
  await addForumAttachments(threadId, postId, authorId, links, files);
}

/* Adds links/documents to a post that may already exist and have replies
   of its own — unlike addThread/addPost's own use of this (attachments
   created in the same breath as the post), this is also called standalone
   any time afterward, since attachment management stays open to an
   author even once the post itself is frozen (see the permissions
   migration's header comment for why those are different). */
/* Storage keys are far stricter than filenames — Supabase Storage rejects
   spaces, brackets and other punctuation with a bare "Invalid key" error
   (hit in practice on a real filename like "American Bee Journal . March
   2026 Vol 166 No 3[26].pdf"). The original name is kept as-is in
   `filename` for display; only the upload path itself gets sanitized. */
function safeStorageSegment(name) {
  return name.normalize('NFKD').replace(/[^\w.-]+/g, '_');
}

export async function addForumAttachments(threadId, postId, authorId, links, files) {
  const supabase = await getSupabase();
  const rows = links.map((l) => ({
    thread_id: threadId, post_id: postId, author_id: authorId,
    kind: 'url', url: l.url, filename: l.title || l.url,
  }));

  for (const file of files) {
    const path = `${threadId}/${postId ?? 'op'}/${crypto.randomUUID()}-${safeStorageSegment(file.name)}`;
    const { error: upErr } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(path, file);
    if (upErr) throw upErr;
    rows.push({
      thread_id: threadId, post_id: postId, author_id: authorId,
      kind: 'file', storage_path: path, filename: file.name,
      mime_type: file.type || null, size_bytes: file.size,
    });
  }

  if (!rows.length) return;
  const { error } = await supabase.from('forum_attachments').insert(rows);
  if (error) throw error;
}

/* Only a url-kind attachment is ever editable in place — a file's bytes
   aren't, so the composer only offers this for links (see forum.js). RLS
   enforces the ownership check too; this one's just for a fast, clear
   error rather than a raw Postgres one. */
export async function updateForumAttachment(a, { url, title }) {
  const me = requireRealMember();
  if (a.author_id !== me.id) throw new Error('You can only edit attachments you added.');
  const supabase = await getSupabase();
  const { error } = await supabase
    .from('forum_attachments')
    .update({ url, filename: title || url })
    .eq('id', a.id);
  if (error) throw error;
}

export async function deleteForumAttachment(a) {
  const me = requireRealMember();
  if (a.author_id !== me.id && !isWebAdmin(me.id)) throw new Error('You can only remove attachments you added.');
  const supabase = await getSupabase();
  const { error } = await supabase.from('forum_attachments').delete().eq('id', a.id);
  if (error) throw error;
  if (a.kind === 'file') {
    await supabase.storage.from(ATTACHMENTS_BUCKET).remove([a.storage_path]);
  }
}

/* Opens an attachment: a plain new tab for a URL, or a freshly-signed
   (1 hour) Storage URL for a file — the bucket is private, so there's no
   permanent public link to hand out.

   The tab is opened synchronously, before the `await` below, and then
   redirected once the signed URL comes back — opening it only after the
   await would run outside the click's user-gesture window and get
   popup-blocked in most browsers, since a blocked popup can't be
   retried once the gesture is gone. */
export async function openForumAttachment(a) {
  if (a.kind === 'url') {
    window.open(a.url, '_blank', 'noopener');
    return;
  }
  const tab = window.open('', '_blank');
  const supabase = await getSupabase();
  const { data, error } = await supabase.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(a.storage_path, 3600);
  if (error) {
    tab?.close();
    throw error;
  }
  if (tab) tab.location.href = data.signedUrl;
  else window.open(data.signedUrl, '_blank', 'noopener');
}

/* --- repository --------------------------------------------------------
   Track/sub-topic structure is Phase 3 (seeded, not purged — see that
   migration's header comment: real Markdown content on disk already
   depends on these exact sub-topic ids). Article/document *content*
   authored from inside the app is a later addition (repository_articles/
   repository_documents), living alongside the older file-based content
   under content/repository/ rather than replacing it — merged client-side
   in js/views/repository.js.

   Permissions are scoped per sub-topic (repository_team), same shape as
   apiary_managers/project_team: holding "Repository Manager" or "Creator"
   as a role tag is just a label — a Web Admin separately assigns
   'manage'/'contribute' access on one specific sub-topic, checked here
   via repository_access_level. */

const REPOSITORY_DOCUMENTS_BUCKET = 'repository-documents';
export const REPOSITORY_DOC_MAX_BYTES = 20 * 1024 * 1024;
export const REPOSITORY_DOC_ACCEPT = '.pdf,.doc,.docx,.txt,.rtf,.odt,.xls,.xlsx,.csv,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp';

async function myRepositoryAccess() {
  const me = currentUser();
  if (isWebAdmin(me.id)) return { admin: true, grants: {} };
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('repository_team').select('sub_topic_id, access_level').eq('member_id', me.id);
  if (error) throw error;
  const grants = {};
  data.forEach((r) => { grants[r.sub_topic_id] = r.access_level; });
  return { admin: false, grants };
}

function accessFor(access, subId) {
  const level = access.grants[subId];
  return {
    canContribute: access.admin || level === 'manage' || level === 'contribute',
    canManage: access.admin || level === 'manage',
  };
}

async function repositoryContentCounts(subIds) {
  if (!subIds.length) return {};
  const supabase = await getSupabase();
  const [{ data: arts, error: e1 }, { data: docs, error: e2 }] = await Promise.all([
    supabase.from('repository_articles').select('sub_topic_id').in('sub_topic_id', subIds),
    supabase.from('repository_documents').select('sub_topic_id').in('sub_topic_id', subIds),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const counts = {};
  [...arts, ...docs].forEach((r) => { counts[r.sub_topic_id] = (counts[r.sub_topic_id] || 0) + 1; });
  return counts;
}

export async function loadRepository() {
  requireRealMember();
  const supabase = await getSupabase();
  await loadMySubscriptions();
  const [{ data: tracks, error: trackErr }, access] = await Promise.all([
    supabase
      .from('repository_tracks')
      .select('id, ord, name, blurb, repository_sub_topics(id, name, summary)')
      .order('sort_order')
      .order('sort_order', { foreignTable: 'repository_sub_topics' }),
    myRepositoryAccess(),
  ]);
  if (trackErr) throw trackErr;

  const allSubIds = tracks.flatMap((t) => t.repository_sub_topics.map((s) => s.id));
  const dbCounts = await repositoryContentCounts(allSubIds);

  return tracks.map((t) => ({
    ...t,
    subs: t.repository_sub_topics.map((s) => ({ ...s, dbCount: dbCounts[s.id] || 0, ...accessFor(access, s.id) })),
  }));
}

export async function loadSubTopic(id) {
  requireRealMember();
  const supabase = await getSupabase();
  await loadMySubscriptions();
  const { data: sub, error } = await supabase
    .from('repository_sub_topics')
    .select('id, name, summary, track:repository_tracks(id, ord, name, blurb)')
    .eq('id', id)
    .single();
  if (error) throw error;

  const { data: siblingSubs, error: sibErr } = await supabase
    .from('repository_sub_topics')
    .select('id, name, summary')
    .eq('track_id', sub.track.id)
    .order('sort_order');
  if (sibErr) throw sibErr;

  const [
    { data: articles, error: artErr },
    { data: documents, error: docErr },
    { data: team, error: teamErr },
    access,
  ] = await Promise.all([
    supabase.from('repository_articles')
      .select(`id, title, summary, body, created_at, updated_at, author:members(${MEMBER_DISPLAY_FIELDS})`)
      .eq('sub_topic_id', id).order('created_at', { ascending: false }),
    supabase.from('repository_documents')
      .select(`id, filename, storage_path, mime_type, size_bytes, external_url, created_at, author:members(${MEMBER_DISPLAY_FIELDS})`)
      .eq('sub_topic_id', id).order('created_at', { ascending: false }),
    /* repository_team has two FKs to members (member_id, granted_by) —
       same ambiguity member_roles/project_team hit; !member_id disambiguates. */
    supabase.from('repository_team').select(`member_id, access_level, member:members!member_id(${MEMBER_DISPLAY_FIELDS})`).eq('sub_topic_id', id),
    myRepositoryAccess(),
  ]);
  if (artErr) throw artErr;
  if (docErr) throw docErr;
  if (teamErr) throw teamErr;

  return {
    sub: { id: sub.id, name: sub.name, summary: sub.summary },
    track: { ...sub.track, subs: siblingSubs },
    dbArticles: articles.map((a) => ({ ...a, author: withRoles(a.author) })),
    dbDocuments: documents.map((d) => ({ ...d, author: withRoles(d.author) })),
    team: team.map((t) => ({ ...t, member: withRoles(t.member) })),
    isAdmin: access.admin,
    ...accessFor(access, id),
  };
}

/* Just the db-authored documents (no articles/team/access) — used by the
   Contribute composer's "insert a document/link" picker (js/views/
   repository.js), which needs a sub-topic's document list on demand as the
   composer's own Sub-topic select changes, without the rest of loadSubTopic's
   page-load work. */
export async function loadSubTopicDocuments(subTopicId) {
  requireRealMember();
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('repository_documents')
    .select('id, filename, storage_path, mime_type, size_bytes, external_url')
    .eq('sub_topic_id', subTopicId);
  if (error) throw error;
  return data;
}

export async function addRepositoryArticle(subTopicId, { title, summary, body }) {
  const me = requireRealMember();
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('repository_articles')
    .insert({ sub_topic_id: subTopicId, author_id: me.id, title, summary, body })
    .select('id, sub_topic:repository_sub_topics(name)')
    .single();
  if (error) throw error;
  notifySubscribers({
    type: 'repo', id: subTopicId, contextName: data.sub_topic?.name || 'the repository', itemKind: 'article',
    itemTitle: title, path: `#/repository/${subTopicId}/${data.id}`, excludeMemberId: me.id,
  });
}

export async function updateRepositoryArticle(id, { title, summary, body }) {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from('repository_articles')
    .update({ title, summary, body, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteRepositoryArticle(id) {
  const supabase = await getSupabase();
  const { error } = await supabase.from('repository_articles').delete().eq('id', id);
  if (error) throw error;
}

export async function addRepositoryDocument(subTopicId, file) {
  const me = requireRealMember();
  const supabase = await getSupabase();
  const path = `${subTopicId}/${crypto.randomUUID()}-${safeStorageSegment(file.name)}`;
  const { error: upErr } = await supabase.storage.from(REPOSITORY_DOCUMENTS_BUCKET).upload(path, file);
  if (upErr) throw upErr;
  const { data, error } = await supabase.from('repository_documents').insert({
    sub_topic_id: subTopicId, author_id: me.id, filename: file.name, storage_path: path,
    mime_type: file.type || null, size_bytes: file.size,
  }).select('sub_topic:repository_sub_topics(name)').single();
  if (error) throw error;
  notifySubscribers({
    type: 'repo', id: subTopicId, contextName: data.sub_topic?.name || 'the repository', itemKind: 'document',
    itemTitle: file.name, path: `#/repository/${subTopicId}`, excludeMemberId: me.id,
  });
}

export async function addRepositoryLink(subTopicId, { name, url }) {
  const me = requireRealMember();
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('repository_documents').insert({
    sub_topic_id: subTopicId, author_id: me.id, filename: name, external_url: url,
  }).select('sub_topic:repository_sub_topics(name)').single();
  if (error) throw error;
  notifySubscribers({
    type: 'repo', id: subTopicId, contextName: data.sub_topic?.name || 'the repository', itemKind: 'link',
    itemTitle: name, path: `#/repository/${subTopicId}`, excludeMemberId: me.id,
  });
}

export async function deleteRepositoryDocument(doc) {
  const supabase = await getSupabase();
  const { error } = await supabase.from('repository_documents').delete().eq('id', doc.id);
  if (error) throw error;
  if (doc.storage_path) await supabase.storage.from(REPOSITORY_DOCUMENTS_BUCKET).remove([doc.storage_path]);
}

/* A link attachment just opens its URL directly. A file attachment's
   bucket is private, so it always needs a freshly-signed, short-lived
   URL first, same reasoning as openForumAttachment. */
export async function openRepositoryDocument(doc) {
  if (doc.external_url) {
    window.open(doc.external_url, '_blank', 'noopener');
    return;
  }
  const tab = window.open('', '_blank');
  const supabase = await getSupabase();
  const { data, error } = await supabase.storage.from(REPOSITORY_DOCUMENTS_BUCKET).createSignedUrl(doc.storage_path, 3600);
  if (error) {
    tab?.close();
    throw error;
  }
  if (tab) tab.location.href = data.signedUrl;
  else window.open(data.signedUrl, '_blank', 'noopener');
}

/* The actual permission grant behind Repository Manager/Creator —
   Web-Admin-only to change, exactly like apiary_managers/project_team. */
export async function setRepositoryTeamMember(subTopicId, memberId, accessLevel) {
  if (!isWebAdmin()) throw new Error('Only a Web Admin can assign repository team access.');
  const me = requireRealMember();
  const supabase = await getSupabase();
  const { error } = await supabase
    .from('repository_team')
    .upsert({ sub_topic_id: subTopicId, member_id: memberId, access_level: accessLevel, granted_by: me.id }, { onConflict: 'sub_topic_id,member_id' });
  if (error) throw error;
}

export async function removeRepositoryTeamMember(subTopicId, memberId) {
  if (!isWebAdmin()) throw new Error('Only a Web Admin can change repository team access.');
  const supabase = await getSupabase();
  const { error } = await supabase.from('repository_team').delete().eq('sub_topic_id', subTopicId).eq('member_id', memberId);
  if (error) throw error;
}

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
    throw new Error('This needs a real sign-in (Wild Apricot or a direct account) — the demo sign-in can\'t be used here yet.');
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

/* --- projects ---------------------------------------------------------
   Phase 6 of the backend migration: real Supabase rows now (see
   supabase/migrations/20260901000000_projects.sql). Only Web Admin can
   create or delete a project (projects_insert/delete RLS); a project's
   narrative content — background/aims/questions/timeline/participation —
   lives in project_sections, one row per bullet/paragraph, specifically
   so "add or edit" and "delete" are different SQL operations RLS can
   gate separately: Contributor-or-above can insert/update a section,
   only Manager-or-above (or Web Admin) can delete one. Holding the
   "Project Manager"/"Contributor" role tag is just a label, same as
   Apiary Manager — the real grant is project_team, assignable only by a
   Web Admin, one project at a time (mirrors apiary_managers exactly). */

let cachedRecruitingCount = 0;
/* Reads a cache populated by the last loadProjects() call — recruitingCount
   is a synchronous nav-badge read (js/app.js's shellHTML renders on every
   page, not just Projects), so it can't itself await a Supabase query. The
   badge is simply 0 until Projects has been loaded once this session. */
export const recruitingCount = () => cachedRecruitingCount;

/* projects.sites is a plain jsonb array of apiary ids (apiaries didn't
   exist when Phase 6 shipped) — resolves those ids to {id, code, name} for
   display (js/views/projects.js's sitesLine/Sites panel), same lean-lookup
   shape as loadRealMembers vs. the richer loadMembersDirectory. Replaces
   the old synchronous allApiaryById, which read a mock array nothing here
   still has by the time Phase 5 makes apiaries real. */
async function siteDetailsFor(supabase, siteIdArrays) {
  const ids = [...new Set(siteIdArrays.flat())];
  if (!ids.length) return () => [];
  const { data, error } = await supabase.from('apiaries').select('id, code, name').in('id', ids);
  if (error) throw error;
  const byId = {};
  data.forEach((a) => { byId[a.id] = a; });
  return (siteIds) => (siteIds || []).map((id) => byId[id]).filter(Boolean);
}

export async function loadProjects() {
  const supabase = await getSupabase();
  const { data: rows, error } = await supabase
    .from('projects')
    .select('id, code, status, title, summary, sites, open_sites, created_at')
    .order('created_at', { ascending: true });
  if (error) throw error;

  const counts = await participantCounts(rows.map((p) => p.id));
  const resolveSites = await siteDetailsFor(supabase, rows.map((p) => p.sites || []));
  cachedRecruitingCount = rows.filter((p) => p.status === 'recruiting').length;
  return rows.map((p) => ({ ...p, participantCount: counts[p.id] ?? 0, siteDetails: resolveSites(p.sites) }));
}

async function participantCounts(projectIds) {
  if (!projectIds.length) return {};
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('project_participants')
    .select('project_id')
    .in('project_id', projectIds);
  if (error) throw error;
  return data.reduce((acc, r) => { acc[r.project_id] = (acc[r.project_id] || 0) + 1; return acc; }, {});
}

export async function loadProject(id) {
  const supabase = await getSupabase();
  const [
    { data: project, error: projErr },
    { data: sections, error: secErr },
    { data: participants, error: partErr },
    { data: team, error: teamErr },
  ] = await Promise.all([
    supabase.from('projects').select('id, code, status, title, summary, sites, open_sites, topics, created_at').eq('id', id).single(),
    supabase.from('project_sections').select('id, section, body, sort_order').eq('project_id', id).order('sort_order'),
    supabase.from('project_participants').select(`project_id, contribution, joined_at, member:members(${MEMBER_DISPLAY_FIELDS})`).eq('project_id', id).order('joined_at'),
    /* project_team has two FKs to members (member_id, granted_by) — same
       ambiguity member_roles hit; !member_id picks the right one. */
    supabase.from('project_team').select(`member_id, access_level, member:members!member_id(${MEMBER_DISPLAY_FIELDS})`).eq('project_id', id),
  ]);
  if (projErr) throw projErr;
  if (secErr) throw secErr;
  if (partErr) throw partErr;
  if (teamErr) throw teamErr;

  const me = currentUser();
  const admin = isWebAdmin(me.id);
  const myAccess = team.find((t) => t.member_id === me.id)?.access_level ?? null;
  const resolveSites = await siteDetailsFor(supabase, [project.sites || []]);

  return {
    project: { ...project, siteDetails: resolveSites(project.sites) },
    sections,
    participants: participants.map((p) => ({ ...p, member: withRoles(p.member) })),
    team: team.map((t) => ({ ...t, member: withRoles(t.member) })),
    isAdmin: admin,
    canManage: admin || myAccess === 'manage',
    canContribute: admin || myAccess === 'manage' || myAccess === 'contribute',
    isParticipant: participants.some((p) => p.member?.id === me.id),
  };
}

export async function addProject({ title, summary }) {
  if (!isWebAdmin()) throw new Error('Only a Web Admin can create a project.');
  const me = requireRealMember();
  const supabase = await getSupabase();
  const { count, error: countErr } = await supabase.from('projects').select('id', { count: 'exact', head: true });
  if (countErr) throw countErr;
  const id = `proj-${crypto.randomUUID()}`;
  const code = `PRJ-${String((count ?? 0) + 1).padStart(2, '0')}`;

  const { data: project, error } = await supabase
    .from('projects')
    .insert({ id, code, status: 'recruiting', title, summary })
    .select('id, code, status, title, summary, sites, open_sites, created_at')
    .single();
  if (error) throw error;

  /* The creator gets 'manage' access immediately — otherwise a brand-new
     project would have no Project Manager and nobody but a second Web
     Admin action could ever add its content. */
  const { error: teamErr } = await supabase
    .from('project_team')
    .insert({ project_id: id, member_id: me.id, access_level: 'manage', granted_by: me.id });
  if (teamErr) throw teamErr;

  return project;
}

export async function deleteProject(id) {
  if (!isWebAdmin()) throw new Error('Only a Web Admin can delete a project.');
  const supabase = await getSupabase();
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}

export async function addProjectSection(projectId, section, body) {
  const supabase = await getSupabase();
  const { data: last, error: lastErr } = await supabase
    .from('project_sections')
    .select('sort_order')
    .eq('project_id', projectId).eq('section', section)
    .order('sort_order', { ascending: false }).limit(1);
  if (lastErr) throw lastErr;
  const { error } = await supabase
    .from('project_sections')
    .insert({ project_id: projectId, section, body, sort_order: (last[0]?.sort_order ?? 0) + 1 });
  if (error) throw error;
}

export async function updateProjectSection(sectionId, body) {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from('project_sections')
    .update({ body, updated_at: new Date().toISOString() })
    .eq('id', sectionId);
  if (error) throw error;
}

export async function deleteProjectSection(sectionId) {
  const supabase = await getSupabase();
  const { error } = await supabase.from('project_sections').delete().eq('id', sectionId);
  if (error) throw error;
}

/* A project is joined, not subscribed to: joining records what the member
   is contributing, not just that they want to hear about it. Any member
   can join/leave themself regardless of project_team access — that's
   unrelated to the Manager/Contributor content permissions above. */
export async function joinProject(projectId, contribution) {
  const me = requireRealMember();
  const supabase = await getSupabase();
  const { error } = await supabase
    .from('project_participants')
    .insert({ project_id: projectId, member_id: me.id, contribution: contribution || 'Joined without a stated contribution.' });
  if (error) throw error;
}

export async function leaveProject(projectId, memberId) {
  const supabase = await getSupabase();
  const { error } = await supabase.from('project_participants').delete().eq('project_id', projectId).eq('member_id', memberId);
  if (error) throw error;
}

export async function updateProjectParticipant(projectId, memberId, contribution) {
  const supabase = await getSupabase();
  const { error } = await supabase.from('project_participants').update({ contribution }).eq('project_id', projectId).eq('member_id', memberId);
  if (error) throw error;
}

/* The actual permission grant behind Project Manager/Contributor —
   Web-Admin-only to change, exactly like apiary_managers. */
export async function setProjectTeamMember(projectId, memberId, accessLevel) {
  if (!isWebAdmin()) throw new Error('Only a Web Admin can assign project team access.');
  const me = requireRealMember();
  const supabase = await getSupabase();
  const { error } = await supabase
    .from('project_team')
    .upsert({ project_id: projectId, member_id: memberId, access_level: accessLevel, granted_by: me.id }, { onConflict: 'project_id,member_id' });
  if (error) throw error;
}

export async function removeProjectTeamMember(projectId, memberId) {
  if (!isWebAdmin()) throw new Error('Only a Web Admin can change project team access.');
  const supabase = await getSupabase();
  const { error } = await supabase.from('project_team').delete().eq('project_id', projectId).eq('member_id', memberId);
  if (error) throw error;
}

/* --- apiaries, hives & inspections ----------------------------------------
   Phase 5 of the backend migration — real Supabase tables now (see
   supabase/migrations/20260923000000_apiaries_hives_inspections.sql), same
   shape every prior phase's real entities settled into: a lean loadX() for
   list/dashboard use, a richer loadOne(id) for the detail page (including
   the per-entity team grant), and plain insert/update writers with RLS as
   the real backstop — content-level writes (hives, inspections) don't
   duplicate that check client-side, exactly like addProjectSection/
   updateProjectSection don't; only identity-level writes (the apiary row
   itself, and the team grant) get a client-side isWebAdmin() pre-check,
   exactly like addProject/setProjectTeamMember do. */

/* --- queen lines & breeders --------------------------------------------------
   Phase 4 of the backend migration — real Supabase tables now (see
   supabase/migrations/20260924000000_queen_lines_breeders.sql). Queen
   lines are a program-wide record, not scoped to one apiary — hives
   reference a line by its code (hive.line — see hives.queen_line), so the
   code stays fixed once a line is created, same reasoning as hive ids and
   never shown/edited in the UI, generated server-side instead.

   A line's breeder must be a real member who holds the "Breeder" role
   (member_roles) — enforced server-side by a trigger
   (queen_lines_breeder_role_check, see 20260923223117_queen_line_breeder_
   role_restriction.sql), not just by which members this form offers. The
   standalone (non-member) breeder path this used to also support is gone
   — a free-text name was the one place in this schema nothing checked
   against the real member directory, so it's removed rather than
   tightened. loadQueenLines() embeds the credited member directly onto
   each line as `breeder`, so nothing downstream needs a separate lookup
   call. */

const QUEEN_LINE_FIELDS = 'code, name, generation, vsh_mean, note, breeder:members!breeder_member_id(id, name, state, initials)';

function normalizeQueenLineRow(row) {
  return { code: row.code, name: row.name, gen: row.generation, vshMean: row.vsh_mean, note: row.note, breeder: row.breeder };
}

export async function loadQueenLines() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('queen_lines').select(QUEEN_LINE_FIELDS).order('name');
  if (error) throw error;
  return data.map(normalizeQueenLineRow);
}

/* Every real member holding the "Breeder" role (member_roles) — the only
   members selectable as a queen line's breeder. Assigning that role
   happens on a member's own page (js/views/managers.js's role editor),
   not here; this dashboard only picks among members who already have it. */
export async function loadBreederMembers() {
  const supabase = await getSupabase();
  const { data: grants, error: grantsErr } = await supabase
    .from('member_roles')
    .select('member_id')
    .eq('role_name', 'Breeder');
  if (grantsErr) throw grantsErr;
  const ids = grants.map((g) => g.member_id);
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from('members')
    .select('id, name, initials')
    .in('id', ids)
    .is('deactivated_at', null)
    .order('name');
  if (error) throw error;
  return data;
}

/* Auto-generates a unique code from name initials, same shape addApiary's
   own code generation uses. */
async function generateQueenLineCode(supabase, name) {
  const base = (name.match(/[A-Za-z]+/) || ['LIN'])[0].slice(0, 3).toUpperCase() || 'LIN';
  const { data: existing, error } = await supabase.from('queen_lines').select('code');
  if (error) throw error;
  const taken = new Set(existing.map((l) => l.code));
  let n = 1;
  let code = `${base}-${String(n).padStart(2, '0')}`;
  while (taken.has(code)) { n++; code = `${base}-${String(n).padStart(2, '0')}`; }
  return code;
}

export async function addQueenLine({ name, breederMemberId, generation, vshMean, note }) {
  if (!isWebAdmin()) throw new Error('Only a Web Admin can add a queen line.');
  const supabase = await getSupabase();
  const code = await generateQueenLineCode(supabase, name);
  const { data, error } = await supabase
    .from('queen_lines')
    .insert({ code, name, breeder_member_id: breederMemberId, generation: generation || 1, vsh_mean: vshMean ?? null, note: note || null })
    .select(QUEEN_LINE_FIELDS)
    .single();
  if (error) throw error;
  return normalizeQueenLineRow(data);
}

export async function updateQueenLine(code, { name, breederMemberId, generation, vshMean, note }) {
  if (!isWebAdmin()) throw new Error('Only a Web Admin can edit a queen line.');
  const supabase = await getSupabase();
  const { error } = await supabase
    .from('queen_lines')
    .update({ name, breeder_member_id: breederMemberId, generation: generation || 1, vsh_mean: vshMean ?? null, note: note || null })
    .eq('code', code);
  if (error) throw error;
}

/* Translates real Postgres rows into the exact shape js/data.js's mock
   apiaries/hives/inspections arrays already had — same reasoning as
   normalizeMemberRow above: nothing downstream (js/views/apiaries.js,
   js/views/comb.js, js/views/dashboard.js) needs to change field names,
   just where the data came from. */
function normalizeApiaryRow(ap) {
  return {
    id: ap.id, code: ap.code, name: ap.name, region: ap.region,
    stage: ap.stage, dateEstablished: ap.date_established, dateRemoved: ap.date_removed,
    flora: ap.flora, brief: ap.brief,
  };
}

function normalizeHiveRow(h) {
  return {
    id: h.id, apiary: h.apiary_id, status: h.status, line: h.queen_line,
    queenId: h.queen_id, queenColour: h.queen_colour, queenYear: h.queen_year,
    vsh: h.vsh, miteLoad: h.mite_load, broodFrames: h.hive_configuration,
    treatmentFree: h.treatment_free_seasons, comment: h.comment,
    /* ISO timestamp or null — was a stored "days since" int (lastSeen);
       js/views/comb.js computes the relative label from this instead. */
    lastInspectedAt: h.last_inspected_at,
    /* Resolved queen line + breeder, or null — `line` above stays the
       plain code (still needed as-is for the hive edit form's <select>);
       this is the ready-to-render shape js/views/comb.js's renderReadout
       and js/views/apiaries.js's "Queen lines on this site" table read
       directly, no separate lookup call needed. */
    lineInfo: h.queen_line_info ? normalizeQueenLineRow(h.queen_line_info) : null,
  };
}

/* apiary isn't part of the raw row any more (inspections.hive_id replaced
   apiary_id — see 20260923233933_inspections_per_hive.sql) — callers that
   need it already know each hive's apiary_id from the hive rows they just
   fetched, so they attach it themselves after normalizing. */
function normalizeInspectionRow(i) {
  return {
    id: i.id, hiveId: i.hive_id, kind: i.kind,
    /* The real inspector row (id, name, initials), embedded via the
       inspector_id FK — inspections.by used to be a mock member id string,
       resolved with memberById() in the view; that only ever knew about
       the seed roster plus whichever real member is currently signed in,
       never an arbitrary other real member, so a real inspector now needs
       an actual join instead. */
    by: i.inspector,
    status: i.resulting_status,
    productivity: i.productivity, temperament: i.temperament, vigour: i.vigour,
    broodPattern: i.brood_pattern,
    miteCount: i.mite_count, ubeeoPct: i.ubeeo_pct, pkdPct: i.pkd_pct,
    chalkbrood: i.chalkbrood, sacbrood: i.sacbrood, efb: i.efb, shb: i.shb, harboAssay: i.harbo_assay,
    nosemaPresent: i.nosema_present, waxMothPresent: i.wax_moth_present, viruses: i.viruses,
    note: i.note, done: i.done, date: new Date(`${i.occurred_on}T00:00:00`),
  };
}

/* Every real apiary (excluding decommissioned ones — see updateApiary's
   dateRemoved) with its hives embedded as hiveRecords, and every
   inspection tagged with its hive's apiary (inspections.hive_id is the
   only FK now — apiary is looked up through the hive rows already
   fetched, not stored on the row itself) — same shape js/data.js's mock
   apiaries/inspections arrays already had, so renderApiaries and
   renderDashboard (both need "every apiary + every hive + every
   inspection") barely change. Used by both the #/apiaries list route and
   the dashboard route. */
export async function loadApiaries() {
  const supabase = await getSupabase();
  const { data: apiaryRows, error: apErr } = await supabase
    .from('apiaries').select('*').is('date_removed', null).order('name');
  if (apErr) throw apErr;

  const apiaryIds = apiaryRows.map((a) => a.id);
  const { data: hiveRows, error: hiveErr } = await supabase
    .from('hives').select(`*, queen_line_info:queen_lines!queen_line(${QUEEN_LINE_FIELDS})`).in('apiary_id', apiaryIds);
  if (hiveErr) throw hiveErr;

  const hivesByApiary = {};
  const apiaryByHive = {};
  hiveRows.forEach((h) => {
    (hivesByApiary[h.apiary_id] ||= []).push(normalizeHiveRow(h));
    apiaryByHive[h.id] = h.apiary_id;
  });

  const hiveIds = hiveRows.map((h) => h.id);
  const { data: inspRows, error: inspErr } = hiveIds.length
    ? await supabase.from('inspections').select('*, inspector:members!inspector_id(id, name, initials)').in('hive_id', hiveIds).order('occurred_on', { ascending: false })
    : { data: [], error: null };
  if (inspErr) throw inspErr;

  const apiariesOut = apiaryRows.map((ap) => {
    const hiveRecords = hivesByApiary[ap.id] || [];
    return { ...normalizeApiaryRow(ap), hiveRecords, hives: hiveRecords.length };
  });

  const inspections = inspRows.map((i) => ({ ...normalizeInspectionRow(i), apiary: apiaryByHive[i.hive_id] }));
  return { apiaries: apiariesOut, inspections };
}

/* One apiary in full: its hives, its inspections (each tagged with this
   apiary's own id — every hive here belongs to it, so there's no lookup
   needed the way loadApiaries' cross-apiary case has), and its team
   (apiary_managers joined to members — apiary_managers has two FKs to
   members, member_id/granted_by, same ambiguity member_roles/project_team
   hit; !member_id picks the right one) plus this member's own
   isAdmin/canManage/canOperate, same shape loadProject's canManage/
   canContribute already use. */
export async function loadApiary(id) {
  const supabase = await getSupabase();
  const [
    { data: apiary, error: apErr },
    { data: hives, error: hiveErr },
    { data: team, error: teamErr },
  ] = await Promise.all([
    supabase.from('apiaries').select('*').eq('id', id).single(),
    supabase.from('hives').select(`*, queen_line_info:queen_lines!queen_line(${QUEEN_LINE_FIELDS})`).eq('apiary_id', id).order('id'),
    supabase.from('apiary_managers').select(`member_id, access_level, member:members!member_id(${MEMBER_DISPLAY_FIELDS})`).eq('apiary_id', id),
  ]);
  if (apErr) throw apErr;
  if (hiveErr) throw hiveErr;
  if (teamErr) throw teamErr;

  const hiveIds = hives.map((h) => h.id);
  const { data: inspections, error: inspErr } = hiveIds.length
    ? await supabase.from('inspections').select('*, inspector:members!inspector_id(id, name, initials)').in('hive_id', hiveIds).order('occurred_on', { ascending: false })
    : { data: [], error: null };
  if (inspErr) throw inspErr;

  const me = currentUser();
  const admin = isWebAdmin(me.id);
  const myAccess = team.find((t) => t.member_id === me.id)?.access_level ?? null;

  return {
    apiary: normalizeApiaryRow(apiary),
    hives: hives.map(normalizeHiveRow),
    inspections: inspections.map((i) => ({ ...normalizeInspectionRow(i), apiary: id })),
    team: team.map((t) => ({ ...t, member: withRoles(t.member) })),
    isAdmin: admin,
    canManage: admin || myAccess === 'manage',
    canOperate: admin || myAccess === 'manage' || myAccess === 'operate',
  };
}

/* Auto-generates a unique 3-letter code from the name's first word — same
   base-letters convention generateQueenLineCode uses, so "Carwoola" reads
   as "CAR" the same way a queen line named "Carwoola 3" would read "CAR".
   The Add Apiary form has no code field of its own.

   Notifies the 'apiary:new' channel (see 20260925000000_apiary_subscriptions
   .sql) — the one subscription with no existing row to attach to, since the
   whole point is being told about a site before you'd otherwise know it
   exists. */
export async function addApiary({ name, region, stage, dateEstablished, flora, brief }) {
  if (!isWebAdmin()) throw new Error('Only a Web Admin can add an apiary.');
  const supabase = await getSupabase();

  const initials = (name.match(/[A-Za-z]+/) || ['NEW'])[0].slice(0, 3).toUpperCase() || 'NEW';
  const { data: existing, error: existingErr } = await supabase.from('apiaries').select('code');
  if (existingErr) throw existingErr;
  const taken = new Set(existing.map((a) => a.code));
  let code = initials;
  for (let n = 2; taken.has(code); n++) code = `${initials}${n}`;

  const me = currentUser();
  const { data, error } = await supabase
    .from('apiaries')
    .insert({
      id: `ap-${Date.now()}`, code, name, region, stage: stage || 'establishing',
      date_established: dateEstablished || null, flora: flora || null, brief: brief || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  notifySubscribers({
    type: 'apiary', id: 'new', contextName: 'New research apiaries', itemKind: 'apiary',
    itemTitle: name, path: `#/apiaries/${data.id}`, excludeMemberId: me.id,
  });
  return normalizeApiaryRow(data);
}

/* Same field names addApiary takes, plus dateRemoved (only ever set to
   decommission a site — no UI writes it yet, so it's simply omitted from
   every ordinary edit-apiary save). */
export async function updateApiary(apiaryId, { name, region, flora, brief, stage, dateEstablished, dateRemoved }) {
  if (!isWebAdmin()) throw new Error('Only a Web Admin can edit an apiary.');
  const supabase = await getSupabase();
  const { error } = await supabase.from('apiaries').update({
    name, region, flora: flora || null, brief, stage,
    date_established: dateEstablished || null, date_removed: dateRemoved,
  }).eq('id', apiaryId);
  if (error) throw error;
}

/* Shared by addHive and addHivesBulk — vsh/mite_load are deliberately not
   set here. Neither is writable from any hive form any more (first
   dropped from "Add hive", then from "Edit hive" too, once inspections
   grew their own UBeeO Score and Harbo Assay fields) — that per-visit
   assessment data now belongs on the inspection that measured it, not
   duplicated as a standing property of the hive. */
function hiveInsertPayload(apiaryId, hive) {
  return {
    id: hive.id, apiary_id: apiaryId, status: hive.status,
    queen_line: hive.line || null, queen_id: hive.queenId || null,
    queen_colour: hive.queenColour || null, queen_year: hive.queenYear || null,
    hive_configuration: hive.broodFrames || null,
    treatment_free_seasons: hive.treatmentFree || 0,
    comment: hive.comment || null,
  };
}

/* Hive ID is entered by whoever registers the hive — the table's own
   primary key now enforces uniqueness instead of only a client-side check.
   No client-side permission check, same as addProjectSection — the "Add
   hive" button only shows when loadApiary's canManage said so, and RLS
   (can_manage_apiary) is the real backstop either way. */
export async function addHive(apiaryId, hive) {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('hives')
    .insert(hiveInsertPayload(apiaryId, hive))
    .select('*')
    .single();
  if (error) throw error;
  return normalizeHiveRow(data);
}

/* Which of these ids already exist anywhere (hives.id is a global PK, not
   scoped per apiary) — the CSV bulk-upload form (js/views/apiaries.js)
   calls this to flag "already exists" per row before ever attempting an
   insert, rather than letting one duplicate fail the whole batch. */
export async function checkExistingHiveIds(ids) {
  if (!ids.length) return new Set();
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('hives').select('id').in('id', ids);
  if (error) throw error;
  return new Set(data.map((h) => h.id));
}

/* Bulk counterpart to addHive — one multi-row insert for every
   already-validated row from a CSV upload (js/views/apiaries.js's
   openHiveBulkUploadForm has already checked each id is new and every
   enum value is valid; this only writes). A single INSERT is atomic in
   Postgres, so the caller pre-filtering to valid-only rows is what makes
   "insert the good rows, report the rest" possible — a row this DB call
   itself rejects (a race against another write, not caught by the
   pre-check) fails the whole call, same as any other insert. */
export async function addHivesBulk(apiaryId, hives) {
  if (!hives.length) return [];
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('hives')
    .insert(hives.map((hive) => hiveInsertPayload(apiaryId, hive)))
    .select('*');
  if (error) throw error;
  return data.map(normalizeHiveRow);
}

/* vsh/mite_load are deliberately absent from this patch — see
   hiveInsertPayload's comment. Neither hive form collects them any more,
   so an Edit-hive save no longer touches either column at all (not even
   to null) — whatever value a hive already has just stays frozen; that
   per-visit data now only ever gets recorded on inspections
   (ubeeo_pct/harbo_assay), which don't write back to the hive row. */
export async function updateHive(hiveId, patch) {
  const supabase = await getSupabase();
  const { error } = await supabase.from('hives').update({
    status: patch.status, queen_line: patch.line || null, queen_id: patch.queenId || null,
    queen_colour: patch.queenColour || null, queen_year: patch.queenYear || null,
    hive_configuration: patch.broodFrames || null,
    treatment_free_seasons: patch.treatmentFree || 0,
    comment: patch.comment || null,
  }).eq('id', hiveId);
  if (error) throw error;
}

/* Shared by addInspection and addInspectionsBulk. mite_count/ubeeo_pct/
   pkd_pct/chalkbrood/sacbrood/efb/shb and nosema/wax moth can legitimately
   be 0/false (a real mite wash finding zero mites; assessed and not
   found) — `?? null` only, never `|| null`, so those real results survive
   instead of collapsing to "not recorded". harbo_assay/scores stay on
   `|| null` since their scales never include 0. */
function inspectionInsertPayload({
  hiveId, kind, by, status,
  productivity, temperament, vigour, broodPattern,
  miteCount, ubeeoPct, pkdPct, chalkbrood, sacbrood, efb, shb, harboAssay,
  nosemaPresent, waxMothPresent, viruses,
  note, dateStr, done,
}) {
  return {
    hive_id: hiveId, kind, inspector_id: by,
    resulting_status: status || null,
    productivity: productivity || null, temperament: temperament || null,
    vigour: vigour || null, brood_pattern: broodPattern || null,
    mite_count: miteCount ?? null, ubeeo_pct: ubeeoPct ?? null, pkd_pct: pkdPct ?? null,
    chalkbrood: chalkbrood ?? null, sacbrood: sacbrood ?? null, efb: efb ?? null, shb: shb ?? null,
    harbo_assay: harboAssay || null,
    nosema_present: nosemaPresent ?? null, wax_moth_present: waxMothPresent ?? null,
    viruses: viruses || null,
    note: note || null, occurred_on: dateStr, done: !!done,
  };
}

/* Stamps last_inspected_at on every hive an inspection batch touched, and
   — if any of that hive's rows set a resulting status — its status too.
   Shared by addInspection (one hive) and addInspectionsBulk (however many
   distinct hives the CSV covered); "last row for that hive wins" when a
   bulk file logs the same hive more than once, same as running addInspection
   that many times in file order would have. */
async function touchInspectedHives(supabase, rows) {
  const statusByHive = {};
  rows.forEach((r) => { if (r.status) statusByHive[r.hiveId] = r.status; });
  const hiveIds = [...new Set(rows.map((r) => r.hiveId))];
  const now = new Date().toISOString();
  await Promise.all(hiveIds.map((hiveId) => {
    const patch = { last_inspected_at: now };
    if (statusByHive[hiveId]) patch.status = statusByHive[hiveId];
    return supabase.from('hives').update(patch).eq('id', hiveId);
  }));
}

/* Logs an inspection against exactly one hive, and — since logging *any*
   inspection is itself "seeing" that hive — stamps its last_inspected_at,
   not only when a resulting status also changes it (the mock's
   setHiveStatus only touched lastSeen on a status change, which reads
   more like a shortcut than an intentional choice for a field that's
   meant to mean "last seen/inspected" at all). Sequential writes, same as
   setMemberRoles's remove-then-add — nothing in this schema wraps a
   multi-step write in a transaction.

   Inspections used to cover a batch of hives at once (inspection_hives,
   many-to-many) with one shared set of scores — replaced with hive_id, a
   plain FK, since a colony's Productivity/Mite Count/etc. was never
   something a group of hives could share a single value for. Inspecting
   several hives on the same visit now means calling this once per hive
   (or using the CSV bulk upload, addInspectionsBulk). */
export async function addInspection(row) {
  const supabase = await getSupabase();
  const { data: inspection, error } = await supabase
    .from('inspections')
    .insert(inspectionInsertPayload(row))
    .select('*')
    .single();
  if (error) throw error;

  await touchInspectedHives(supabase, [row]);

  return normalizeInspectionRow(inspection);
}

/* Bulk counterpart — one multi-row insert for every already-validated row
   from a CSV upload (js/views/apiaries.js's openInspectionBulkUploadForm
   has already checked each hive id exists at this apiary and every value
   is in range; this only writes). Same atomicity caveat as
   addHivesBulk: a single INSERT is all-or-nothing, so a row this call
   itself rejects (not caught by the pre-check) fails the whole call. */
export async function addInspectionsBulk(rows) {
  if (!rows.length) return [];
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('inspections')
    .insert(rows.map(inspectionInsertPayload))
    .select('*');
  if (error) throw error;

  await touchInspectedHives(supabase, rows);

  return data.map(normalizeInspectionRow);
}

/* The actual permission grant behind Apiary Manager's manage/operate
   tiers — Web-Admin-only to change, exactly like setProjectTeamMember. */
export async function setApiaryTeamMember(apiaryId, memberId, accessLevel) {
  if (!isWebAdmin()) throw new Error('Only a Web Admin can assign apiary team access.');
  const me = requireRealMember();
  const supabase = await getSupabase();
  const { error } = await supabase
    .from('apiary_managers')
    .upsert({ apiary_id: apiaryId, member_id: memberId, access_level: accessLevel, granted_by: me.id }, { onConflict: 'apiary_id,member_id' });
  if (error) throw error;
}

export async function removeApiaryTeamMember(apiaryId, memberId) {
  if (!isWebAdmin()) throw new Error('Only a Web Admin can change apiary team access.');
  const supabase = await getSupabase();
  const { error } = await supabase.from('apiary_managers').delete().eq('apiary_id', apiaryId).eq('member_id', memberId);
  if (error) throw error;
}

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

/* Real role-tag grant/revoke — member_roles is a real Phase 1 table (RLS:
   only a Web Admin can write), but nothing wrote to it until now; setRoles
   above is local-only (state.roleOverrides), a prototype stand-in that
   predates real per-member sessions and never got wired to Supabase once
   they existed. Used by managers.js's "Manage roles" panel — deliberately
   separate from the Members directory itself, which still can't see a real
   member who isn't the one currently signed in (see allMembers' comment;
   loadRealMembers below is how this panel finds them instead). */
export async function loadMemberRoles(memberId) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('member_roles').select('role_name').eq('member_id', memberId);
  if (error) throw error;
  return data.map((r) => r.role_name);
}

export async function setMemberRoles(memberId, currentRoles, roles) {
  const me = requireRealMember();
  if (!isWebAdmin(me.id)) throw new Error('Only a Web Admin can change roles.');
  const supabase = await getSupabase();
  const toRemove = currentRoles.filter((r) => !roles.includes(r));
  const toAdd = roles.filter((r) => !currentRoles.includes(r));
  if (toRemove.length) {
    const { error } = await supabase.from('member_roles').delete()
      .eq('member_id', memberId).in('role_name', toRemove);
    if (error) throw error;
  }
  if (toAdd.length) {
    const { error } = await supabase.from('member_roles')
      .insert(toAdd.map((role_name) => ({ member_id: memberId, role_name, granted_by: me.id })));
    if (error) throw error;
  }
}

/* "Delete a member" (Members directory) is a soft delete — see this
   migration's comment (20260918072629_member_deactivation.sql) for why a
   real row delete isn't viable. Removes the roles and apiary access first,
   in that order and each as its own request, so a failure (most likely
   member_roles_protect_last_admin blocking removal of the last Web Admin)
   surfaces before anything else — contact details in particular — has
   already been erased. */
export async function deactivateMember(memberId) {
  const me = requireRealMember();
  if (!isWebAdmin(me.id)) throw new Error('Only a Web Admin can delete a member.');
  if (memberId === me.id) throw new Error("You can't delete your own member record.");
  const supabase = await getSupabase();

  const roles = await supabase.from('member_roles').delete().eq('member_id', memberId);
  if (roles.error) throw roles.error;

  const access = await supabase.from('apiary_managers').delete().eq('member_id', memberId);
  if (access.error) throw access.error;

  const contact = await supabase.from('member_contact_details').delete().eq('member_id', memberId);
  if (contact.error) throw contact.error;

  const { error } = await supabase.from('members')
    .update({ deactivated_at: new Date().toISOString() }).eq('id', memberId);
  if (error) throw error;
}

/* Un-does deactivated_at only — roles, apiary access and contact details
   were deleted, not archived, so a Web Admin re-grants them from scratch
   (the same "Manage roles"/contact-form flows used for any other member)
   rather than this trying to restore what was there before. */
export async function reactivateMember(memberId) {
  const me = requireRealMember();
  if (!isWebAdmin(me.id)) throw new Error('Only a Web Admin can reactivate a member.');
  const supabase = await getSupabase();
  const { error } = await supabase.from('members')
    .update({ deactivated_at: null }).eq('id', memberId);
  if (error) throw error;
}

/* Web-Admin-only: invites a non-Wild-Apricot collaborator by email — see
   supabase/functions/invite-collaborator for what actually happens
   server-side (it independently re-checks Web-Admin-ness from the caller's
   own verified session; this client-side check is just so the button isn't
   shown to someone who'd only get a 403). Needs the caller's own access
   token, not the anon key, since the Edge Function authenticates the caller
   by it — same shape as any other authenticated fetch to an Edge Function,
   just this project's first one that isn't public (contrast
   completeWildApricotLogin in js/waAuth.js, which calls wildapricot-auth
   with only the anon key because Wild Apricot itself is the identity proof
   there). */
export async function inviteCollaborator({ name, email, roles }) {
  const me = requireRealMember();
  if (!isWebAdmin(me.id)) throw new Error('Only a Web Admin can invite collaborators.');

  const supabase = await getSupabase();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Your session has expired — sign in again and retry.');

  const res = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/invite-collaborator`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_CONFIG.anonKey,
    },
    body: JSON.stringify({ name, email, roles }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Could not send the invite.');
}

/* --- permissions -------------------------------------------------------------
   Used to be checked against a "preview as" identity rather than the real
   signed-in member — a stand-in for not having real per-member sessions,
   back when everyone who opened the app was signed in as the same seed
   Web Admin. Removed now that real Wild Apricot sign-in (Phase 1 of the
   backend migration) makes currentUser() a genuine, distinct identity per
   member. */

export const isWebAdmin = (memberId = currentUser().id) => rolesFor(memberId).includes('Web Admin');

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
