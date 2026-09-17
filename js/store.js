/* ==========================================================================
   Session state. Subscriptions, notifications and drafts live here.
   Persisted to localStorage so a page reload keeps what the member chose.
   ========================================================================== */

import {
  apiaries, inspections, queenLines,
  members as seedMembers, currentUser as seedCurrentUser,
} from './data.js';
import { getSupabase } from './supabaseClient.js';

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
  const { data, error } = await supabase.from('members').select('id, name, initials').order('name');
  if (error) throw error;
  return data;
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
    .select('id, name, initials, state, member_since, wa_contact_id, member_roles!member_id(role_name), member_contact_details(phone, email, address)')
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
    /* Real wa_contact_id is a plain numeric Wild Apricot contact id, unlike
       the seed roster's 'WA-XXXXX'-formatted string (js/data.js) — was
       missing entirely before (BUGS.md: showed as "undefined" wherever a
       real member's own record displayed it), not reformatted to match. */
    wa: row.wa_contact_id || '',
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

export async function loadProjects() {
  const supabase = await getSupabase();
  const { data: rows, error } = await supabase
    .from('projects')
    .select('id, code, status, title, summary, sites, open_sites, created_at')
    .order('created_at', { ascending: true });
  if (error) throw error;

  const counts = await participantCounts(rows.map((p) => p.id));
  cachedRecruitingCount = rows.filter((p) => p.status === 'recruiting').length;
  return rows.map((p) => ({ ...p, participantCount: counts[p.id] ?? 0 }));
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

  return {
    project,
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

/* --- permissions -------------------------------------------------------------
   Used to be checked against a "preview as" identity rather than the real
   signed-in member — a stand-in for not having real per-member sessions,
   back when everyone who opened the app was signed in as the same seed
   Web Admin. Removed now that real Wild Apricot sign-in (Phase 1 of the
   backend migration) makes currentUser() a genuine, distinct identity per
   member. */

export const isWebAdmin = (memberId = currentUser().id) => rolesFor(memberId).includes('Web Admin');

export function canEditApiary(apiaryId) {
  const uid = currentUser().id;
  if (isWebAdmin(uid)) return true;
  return managersFor(apiaryId).includes(uid);
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
