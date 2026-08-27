/* ==========================================================================
   Notifications. Every entry corresponds to an email the subscription
   machinery would have sent. Shown on screen while email delivery is stubbed.
   ========================================================================== */

import { relHours, allSubs, subById, threads, threadById } from '../data.js';
import { feed, markAllRead, markRead, state, unreadCount, memberById, currentUser } from '../store.js';
import { esc, icons, avatar, toast } from '../ui.js';

const kindMeta = {
  reply:  { label: 'Reply',       icon: 'forum',  variant: 'tag-outline' },
  thread: { label: 'New topic',   icon: 'forum',  variant: 'tag-amber' },
  repo:   { label: 'Repository',  icon: 'book',   variant: 'tag-blue' },
  insp:   { label: 'Inspection',  icon: 'apiary', variant: 'tag-green' },
  market: { label: 'Marketplace', icon: 'tag',    variant: 'tag-outline' },
};

export function renderNotifications() {
  const items = feed();
  const unread = items.filter((n) => n.unread).length;

  const threadSubs = state.subs.filter((s) => s.startsWith('thread:'));
  const repoSubs = state.subs.filter((s) => s.startsWith('repo:'));
  const catSubs = state.subs.filter((s) => s.startsWith('cat:'));

  const rows = items.map((n) => {
    const meta = kindMeta[n.kind] || kindMeta.reply;
    const who = memberById(n.by);
    return `
      <li>
        <a class="line" href="${n.to}" data-notif="${n.id}"
           style="${n.unread ? 'background:var(--amber-wash)' : ''}">
          <span class="pip" style="background:${n.unread ? 'var(--amber)' : 'transparent'};margin-left:4px"></span>
          <div class="line-body">
            <div class="row" style="gap:var(--s2);margin-bottom:2px">
              <span class="tag ${meta.variant}">${meta.label}</span>
              <span class="caption">${esc(n.source)}</span>
            </div>
            <strong style="font-weight:${n.unread ? 600 : 400}">${esc(n.text)}</strong>
          </div>
          <div class="line-meta">
            <div class="caption mono">${relHours(n.at)}</div>
          </div>
        </a>
      </li>`;
  }).join('');

  const html = `
    <div class="topbar">
      <div style="width:100%">
        <div class="eyebrow">${unread ? `${unread} unread` : 'All caught up'}</div>
        <h1>Notifications</h1>
      </div>
      <div class="topbar-actions">
        ${unread ? `<button class="btn btn-ghost btn-sm" id="mark-read">${icons.check} Mark all read</button>` : ''}
      </div>
    </div>

    <div class="wrap view">
      <div class="grid grid-dash">
        <div class="panel">
          <div class="panel-head">
            <h2>Recent activity</h2>
            <span class="spacer"></span>
            <span class="caption mono">${items.length}</span>
          </div>
          ${items.length ? `<ul class="list">${rows}</ul>` : `
            <div class="empty">
              <h3>Nothing here yet</h3>
              <p>Subscribe to a forum topic or a repository sub-topic and activity will appear here.</p>
              <a class="btn btn-primary" href="#/forum">Browse the forum</a>
            </div>`}
        </div>

        <div class="stack">
          <div class="panel">
            <div class="panel-head"><h2>Delivery</h2></div>
            <div class="panel-body">
              <div class="row" style="gap:var(--s3)">
                ${avatar(currentUser())}
                <div style="min-width:0">
                  <div style="font-size:13.5px;font-weight:600">${esc(currentUser().name)}</div>
                  <div class="caption mono" style="font-size:11.5px">${esc(currentUser().wa)}</div>
                </div>
              </div>
              <div class="field" style="margin-top:var(--s5)">
                <label for="n-digest">Email frequency</label>
                <select id="n-digest">
                  <option value="instant" ${state.digest === 'instant' ? 'selected' : ''}>Each new post</option>
                  <option value="daily" ${state.digest === 'daily' ? 'selected' : ''}>Daily digest, 6am AEST</option>
                  <option value="weekly" ${state.digest === 'weekly' ? 'selected' : ''}>Weekly digest, Monday</option>
                </select>
              </div>
              <p class="caption">
                The address comes from your Wild Apricot record. Change it there and it
                updates here at next sign-in.
              </p>
            </div>
          </div>

          <div class="panel">
            <div class="panel-head">
              <h2>What you follow</h2>
              <span class="spacer"></span>
              <span class="caption mono">${state.subs.length}</span>
            </div>
            <div class="panel-body">
              ${section('Forum topics', threadSubs.map((k) => {
                /* threadById only knows the old mock seed threads — real
                   Postgres threads (Phase 3) aren't resolvable here yet.
                   Notifications itself is a later migration phase; until
                   then a real thread subscription just doesn't get a title
                   in this list rather than crashing on removed local state. */
                const t = threadById(k.slice(7));
                return t ? `<a class="tag tag-outline" href="#/forum/${k.slice(7)}">${esc(t.title.slice(0, 46))}${t.title.length > 46 ? '…' : ''}</a>` : '';
              }))}
              ${section('Repository sub-topics', repoSubs.map((k) => {
                const s = subById(k.slice(5));
                return s ? `<a class="tag tag-amber" href="#/repository/${s.id}">${esc(s.name)}</a>` : '';
              }))}
              ${section('Categories', catSubs.map((k) => `<span class="tag tag-blue">${esc(k.slice(4))}</span>`))}
              ${state.subs.length === 0 ? '<p class="caption">Nothing followed yet.</p>' : ''}
            </div>
          </div>
        </div>
      </div>
    </div>`;

  setTimeout(() => {
    const btn = document.getElementById('mark-read');
    if (btn) btn.addEventListener('click', () => {
      markAllRead();
      toast('All notifications marked read.');
      window.__aqbba_render();
    });

    document.querySelectorAll('[data-notif]').forEach((a) => {
      a.addEventListener('click', () => markRead(a.dataset.notif));
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
    <div style="margin-bottom:var(--s4)">
      <div class="eyebrow" style="margin-bottom:var(--s2)">${label}</div>
      <div class="row row-wrap" style="gap:6px">${clean.join('')}</div>
    </div>`;
}
