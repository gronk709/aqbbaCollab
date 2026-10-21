/* ==========================================================================
   Notifications. Real now (20260916000000... — see that migration's header
   comment): notify-subscribers writes one row per notified subscriber
   alongside the email it sends, and this reads them back. The route's
   `load` (js/app.js) is loadNotifications(), which populates
   state.notifications; feed()/unreadCount() (js/store.js) read that cache
   synchronously — this file doesn't touch Supabase directly.
   ========================================================================== */

import { relDays, subById, threadById } from '../data.js';
import { feed, markAllRead, markRead, state, unreadCount, currentUser } from '../store.js';
import { esc, icons, toast } from '../ui.js';
import {
  button, pageHeader, pageBody, twoColumn, card, countBadge, tag, personRow, emptyState,
} from '../components.js';

/* created_at is a real Postgres timestamp — relDays/relHours in data.js
   expect a day-offset-from-today number instead, same reasoning as
   forum.js/marketplace.js's own local daysAgo() helpers. This one keeps
   minute/hour granularity for anything under a day old, which a stream of
   recent activity actually needs (relDays alone collapses same-day items
   to just "today"). */
function agoLabel(isoTimestamp) {
  const mins = (Date.now() - new Date(isoTimestamp).getTime()) / 60000;
  if (mins < 60) return `${Math.max(1, Math.round(mins))} min ago`;
  const hours = mins / 60;
  if (hours < 24) return `${Math.round(hours)} h ago`;
  return relDays(-Math.floor(hours / 24));
}

const kindMeta = {
  reply:  { label: 'Reply',       icon: 'forum',  tone: 'outline' },
  thread: { label: 'New topic',   icon: 'forum',  tone: 'amber' },
  repo:   { label: 'Repository',  icon: 'book',   tone: 'blue' },
  insp:   { label: 'Inspection',  icon: 'apiary', tone: 'green' },
  apiary: { label: 'New apiary',  icon: 'apiary', tone: 'amber' },
  market: { label: 'Marketplace', icon: 'tag',    tone: 'outline' },
};

/* The "what you follow" chips that link somewhere (complete class strings,
   not assembled, so the compiler can see them). */
const CHIP_LINK_BASE = 'tw:inline-flex tw:max-w-full tw:items-center tw:gap-1.5 tw:rounded-2xl tw:px-2.5 tw:py-1 tw:text-left tw:leading-snug tw:font-mono tw:text-[10.5px] tw:font-medium tw:uppercase tw:tracking-[0.06em] tw:transition';
const CHIP_LINKS = {
  outline: `${CHIP_LINK_BASE} tw:border tw:border-comb-shade tw:text-propolis-60 tw:hover:border-amber tw:hover:text-amber-deep`,
  amber: `${CHIP_LINK_BASE} tw:bg-amber-wash tw:text-amber-deep tw:hover:bg-amber/25`,
};

export function renderNotifications() {
  const items = feed();
  const unread = items.filter((n) => n.unread).length;

  const threadSubs = state.subs.filter((s) => s.startsWith('thread:'));
  const repoSubs = state.subs.filter((s) => s.startsWith('repo:'));
  const catSubs = state.subs.filter((s) => s.startsWith('cat:'));
  const apiarySubs = state.subs.filter((s) => s.startsWith('apiary:'));

  const rows = items.map((n) => {
    const meta = kindMeta[n.kind] || kindMeta.reply;
    return `
      <a class="tw:flex tw:items-center tw:gap-3 tw:px-6 tw:py-4 tw:transition ${n.unread ? 'tw:bg-amber-wash tw:hover:bg-amber-wash/60' : 'tw:hover:bg-comb/60'}" href="${n.link_path}" data-notif="${n.id}">
        <span class="tw:size-2 tw:shrink-0 ${n.unread ? 'tw:bg-amber' : 'tw:bg-transparent'} tw:rounded-full"></span>
        <div class="tw:min-w-0 tw:flex-1">
          <div class="tw:mb-1 tw:flex tw:flex-wrap tw:items-center tw:gap-2">
            ${tag(meta.label, meta.tone)}
            <span class="tw:text-sm tw:text-propolis-40">${esc(n.source_name)}</span>
          </div>
          <strong class="tw:block tw:text-[15px] ${n.unread ? 'tw:font-semibold' : 'tw:font-normal'} tw:text-propolis">${esc(n.body)}</strong>
        </div>
        <div class="tw:shrink-0 tw:text-right tw:font-mono tw:text-xs tw:text-propolis-40">${agoLabel(n.created_at)}</div>
      </a>`;
  });

  const feedCard = card({
    title: 'Recent activity',
    right: countBadge(items.length),
    flush: true,
    body: items.length
      ? `<ul class="tw:divide-y tw:divide-comb-shade/70">${rows.map((r) => `<li>${r}</li>`).join('')}</ul>`
      : emptyState({
        title: 'Nothing here yet',
        text: 'Subscribe to a forum topic or a repository sub-topic and activity will appear here.',
        action: button({ href: '#/forum', label: 'Browse the forum' }),
        bordered: false,
      }),
  });

  const me = currentUser();
  const deliveryCard = card({
    title: 'Delivery',
    body: `
      ${personRow({ initials: me.initials, name: me.name, sub: me.wa })}
      <div class="field tw:mt-5">
        <label for="n-digest">Email frequency</label>
        <select id="n-digest">
          <option value="instant" ${state.digest === 'instant' ? 'selected' : ''}>Each new post</option>
          <option value="daily" ${state.digest === 'daily' ? 'selected' : ''}>Daily digest, 6am AEST</option>
          <option value="weekly" ${state.digest === 'weekly' ? 'selected' : ''}>Weekly digest, Monday</option>
        </select>
      </div>
      <p class="tw:text-sm tw:text-propolis-60">
        ${me.wa
          ? 'The address comes from your Wild Apricot record. Change it there and it updates here at next sign-in.'
          : 'Update the address this goes to from <a href="#/settings" class="tw:underline tw:transition tw:hover:text-amber-deep">Account settings</a>.'}
      </p>`,
  });

  const followCard = card({
    title: 'What you follow',
    right: countBadge(state.subs.length),
    body: `
      ${section('Forum topics', threadSubs.map((k) => {
        /* threadById only knows the old mock seed threads — a real
           Postgres thread (Phase 3) isn't resolvable here yet, so a
           real thread subscription just doesn't get a title in this
           list rather than crashing. Unrelated to notifications
           themselves being real now (that's the activity feed
           above) — this is only the subscription-chips sidebar. */
        const t = threadById(k.slice(7));
        return t ? `<a class="${CHIP_LINKS.outline}" href="#/forum/${k.slice(7)}">${esc(t.title.slice(0, 46))}${t.title.length > 46 ? '…' : ''}</a>` : '';
      }))}
      ${section('Repository sub-topics', repoSubs.map((k) => {
        const s = subById(k.slice(5));
        return s ? `<a class="${CHIP_LINKS.amber}" href="#/repository/${s.id}">${esc(s.name)}</a>` : '';
      }))}
      ${section('Categories', catSubs.map((k) => tag(k.slice(4), 'blue')))}
      ${section('Research apiaries', apiarySubs.map(() => `<a class="${CHIP_LINKS.amber}" href="#/apiaries">New research apiaries</a>`))}
      ${state.subs.length === 0 ? '<p class="tw:text-sm tw:text-propolis-60">Nothing followed yet.</p>' : ''}`,
  });

  const html = `
    <div class="view">
      ${pageHeader({
        eyebrow: unread ? `${unread} unread` : 'All caught up',
        title: 'Notifications',
        actions: unread ? button({ id: 'mark-read', label: 'Mark all read', icon: icons.check, variant: 'outline', size: 'sm' }) : '',
      })}
      ${pageBody(twoColumn({ main: feedCard, side: deliveryCard + followCard }))}
    </div>`;

  setTimeout(() => {
    const btn = document.getElementById('mark-read');
    if (btn) btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await markAllRead();
      } catch (err) {
        toast(`Couldn't mark all read: ${err.message}`);
        btn.disabled = false;
        return;
      }
      toast('All notifications marked read.');
      window.__aqbba_render();
    });

    /* Fire-and-forget: the click also navigates via the anchor's own href,
       so this shouldn't block or preventDefault that — a failed mark-read
       just means the badge stays stale by one, not worth surfacing a toast
       for on the way out of the page. */
    document.querySelectorAll('[data-notif]').forEach((a) => {
      a.addEventListener('click', () => {
        markRead(a.dataset.notif).catch((err) => console.warn('Could not mark notification read:', err));
      });
    });

    const digest = document.getElementById('n-digest');
    if (digest) digest.addEventListener('change', (e) => {
      state.digest = e.target.value;
      const label = { instant: 'each new post', daily: 'a daily digest', weekly: 'a weekly digest' }[state.digest];
      toast(`Email frequency set to ${label}.`);
    });
  }, 0);

  return html;
}

function section(label, chips) {
  const clean = chips.filter(Boolean);
  if (!clean.length) return '';
  return `
    <div class="tw:mb-4 tw:last:mb-0">
      <div class="tw:mb-2 tw:font-mono tw:text-[10.5px] tw:font-medium tw:uppercase tw:tracking-[0.12em] tw:text-propolis-40">${label}</div>
      <div class="tw:flex tw:flex-wrap tw:gap-1.5">${clean.join('')}</div>
    </div>`;
}
