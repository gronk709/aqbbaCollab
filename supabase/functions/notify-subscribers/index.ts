/* ==========================================================================
   Sends the "you're subscribed" email that Repository and Forum contribution
   have always promised (see the Forum "New topic" composer's own copy —
   "Subscribers to the category you choose are notified as soon as you
   publish" — and README's "Notification email" section) but never actually
   sent: every add-content call site just called toast() instead. This
   function is the real send; js/store.js's notifySubscribers() calls it,
   fire-and-forget, right after a successful publish (see addRepositoryArticle,
   addRepositoryDocument, addRepositoryLink, addThread, addPost, addApiary). It also
   writes one row per notified subscriber into the real `notifications` table
   (20260916000000...) — the in-app Notifications page reads that, and gets
   one regardless of whether that subscriber even has an email on file.

   Called with:
     {
       type: 'repo' | 'thread' | 'cat' | 'apiary',   // matches subscriptions.subscribable_type
       id: string,                        // subscribable_id ('new' for type 'apiary' -- see
                                           // 20260925000000_apiary_subscriptions.sql's header comment)
       contextName: string,               // sub-topic / thread / category / apiary-channel name
       itemKind: 'article' | 'document' | 'link' | 'thread' | 'reply' | 'apiary',
       itemTitle: string,                 // article title, filename, link name, reply preview, or apiary name
       actorName: string,                 // who published it
       actorId: string,                   // members.id of whoever published it
       path: string,                      // in-app hash route, e.g. '#/repository/rs-graft'
       excludeMemberId?: string,          // don't notify the person who just published
     }

   The emailed link is built from this request's Origin header + `path`
   (falling back to the production URL if there's no Origin, e.g. a direct
   test call) — so it's correct whether this was triggered from production
   or a local dev server, without needing to know that here.

   Requires the caller to hold a real Supabase session (checked via
   auth.getUser(jwt) below) — same trust boundary as the rest of the app:
   any signed-in real member can trigger this, same as any signed-in member
   can already post to the forum or contribute to the repository. It does
   NOT re-check contribute/manage permissions on the target sub-topic/thread/
   category — the write it's reporting on already went through that gate
   (RLS on repository_documents/forum_threads/etc.), and by the time this
   runs, that content exists either way.

   Deploy:
     supabase functions deploy notify-subscribers

   Secrets (set once — never put these in this file or the repo):
     supabase secrets set RESEND_API_KEY=...
     supabase secrets set NOTIFY_FROM_EMAIL='AQBBA <notifications@aqbba.org.au>'   # optional, see default below

   notifications@aqbba.org.au needs to be a domain Resend has verified
   (SPF/DKIM records on aqbba.org.au) before real mail will deliver — until
   then, Resend's sandbox sender (onboarding@resend.dev) works but can only
   deliver to the Resend account's own verified address. See
   https://resend.com/domains.

   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY do NOT need to be set as
   secrets — Supabase injects both automatically into every Edge Function's
   environment. */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeadersFor } from '../_shared/cors.ts';

const SUBSCRIBABLE_TYPES = new Set(['repo', 'thread', 'cat', 'apiary']);
const ITEM_KINDS: Record<string, string> = {
  article: 'article', document: 'document', link: 'link', thread: 'topic', reply: 'reply',
  apiary: 'research apiary',
};
/* notifications.kind is a narrower set than itemKind — an article, document
   or link are all just "repo" activity to the in-app feed. */
const NOTIFICATION_KIND: Record<string, string> = {
  reply: 'reply', thread: 'thread', article: 'repo', document: 'repo', link: 'repo',
  apiary: 'apiary',
};
const DEFAULT_APP_ORIGIN = 'https://aqbba-collab.vercel.app';
const RESEND_BATCH_URL = 'https://api.resend.com/emails/batch';
const RESEND_BATCH_SIZE = 100;

interface NotifyPayload {
  type?: string;
  id?: string;
  contextName?: string;
  itemKind?: string;
  itemTitle?: string;
  actorName?: string;
  actorId?: string;
  path?: string;
  excludeMemberId?: string;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req.headers.get('origin'));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  let payload: NotifyPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400);
  }

  const { type, id, contextName, itemKind, itemTitle, actorName, actorId, path, excludeMemberId } = payload;
  if (!type || !SUBSCRIBABLE_TYPES.has(type)) return json({ error: 'type must be one of repo, thread, cat.' }, 400);
  if (!id || !contextName || !itemTitle || !actorName || !path) {
    return json({ error: 'Missing one of: id, contextName, itemTitle, actorName, path.' }, 400);
  }
  const itemKindLabel = ITEM_KINDS[itemKind || ''] || 'update';
  const notificationKind = NOTIFICATION_KIND[itemKind || ''] || 'repo';
  const appOrigin = req.headers.get('origin') || DEFAULT_APP_ORIGIN;
  const url = `${appOrigin}/${path}`;

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Require a real, currently-valid session — same trust boundary as every
  // other write in the app (a real Wild Apricot sign-in), just checked
  // manually here since this function otherwise runs entirely as the
  // service role.
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Missing Authorization header.' }, 401);
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
  if (userErr || !userData.user) return json({ error: 'Not signed in.' }, 401);

  try {
    const { data: subs, error: subsErr } = await supabaseAdmin
      .from('subscriptions')
      .select('member_id')
      .eq('subscribable_type', type)
      .eq('subscribable_id', id);
    if (subsErr) throw subsErr;

    const memberIds = [...new Set(subs.map((s) => s.member_id))].filter((m) => m !== excludeMemberId);
    if (!memberIds.length) return json({ notified: 0, sent: 0 });

    // In-app notification rows go to every subscriber regardless of whether
    // they have an email on file — that's checked separately, below, only
    // for the email send.
    const { error: notifErr } = await supabaseAdmin.from('notifications').insert(
      memberIds.map((memberId) => ({
        member_id: memberId,
        actor_id: actorId || null,
        kind: notificationKind,
        source_name: contextName,
        body: `${actorName} added a new ${itemKindLabel}: ${itemTitle}`,
        link_path: path,
      })),
    );
    if (notifErr) throw notifErr;

    const { data: contacts, error: contactsErr } = await supabaseAdmin
      .from('member_contact_details')
      .select('email')
      .in('member_id', memberIds);
    if (contactsErr) throw contactsErr;

    const emails = [...new Set(contacts.map((c) => c.email).filter((e): e is string => !!e))];
    if (!emails.length) return json({ notified: memberIds.length, sent: 0 });

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY not set — see this function\'s header comment.');
      return json({ notified: memberIds.length, sent: 0, error: 'Email sending is not configured.' }, 200);
    }
    const from = Deno.env.get('NOTIFY_FROM_EMAIL') || 'AQBBA <notifications@aqbba.org.au>';

    const subject = `${actorName} posted in ${contextName}`;
    const safeContext = escapeHtml(contextName);
    const safeTitle = escapeHtml(itemTitle);
    const safeActor = escapeHtml(actorName);
    const safeUrl = escapeHtml(url);
    const html = `
      <p>${safeActor} added a new ${itemKindLabel} to <strong>${safeContext}</strong> on AQBBA:</p>
      <p style="font-size:16px;font-weight:600">${safeTitle}</p>
      <p><a href="${safeUrl}">View it on AQBBA</a></p>
      <p style="color:#767676;font-size:13px">You're receiving this because you're subscribed to ${safeContext}. Manage your subscriptions from Notifications in the app.</p>`;
    const text = `${actorName} added a new ${itemKindLabel} to ${contextName} on AQBBA:\n\n${itemTitle}\n\nView it: ${url}\n\nYou're receiving this because you're subscribed to ${contextName}.`;

    let sent = 0;
    let failed = 0;
    for (const batch of chunk(emails, RESEND_BATCH_SIZE)) {
      const res = await fetch(RESEND_BATCH_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(batch.map((to) => ({ from, to: [to], subject, html, text }))),
      });
      if (res.ok) {
        sent += batch.length;
      } else {
        failed += batch.length;
        console.error('Resend batch send failed:', res.status, await res.text());
      }
    }

    return json({ notified: memberIds.length, sent, failed });
  } catch (err) {
    console.error('Unexpected error sending subscriber notifications:', err);
    return json({ error: 'Unexpected error sending notifications.' }, 500);
  }
});
