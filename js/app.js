/* ==========================================================================
   Application shell + hash router.
   ========================================================================== */

import { currentUser, members } from './data.js';
import {
  state, signOut, unreadCount, recruitingCount, onChange, toggleSub,
  roleLabel, previewUser, setPreviewAs,
} from './store.js';
import { icons, brandMark, avatar, toast, esc } from './ui.js';
import { renderGate } from './views/gate.js';
import { renderDashboard } from './views/dashboard.js';
import { renderApiaries, renderApiary } from './views/apiaries.js';
import { renderManager } from './views/managers.js';
import { renderProjects, renderProject } from './views/projects.js';
import { renderForum, renderThread } from './views/forum.js';
import { renderRepository, renderSubTopic } from './views/repository.js';
import { renderMarketplace } from './views/marketplace.js';
import { renderNotifications } from './views/notifications.js';

const app = document.getElementById('app');

const NAV = [
  { group: 'Research' },
  { path: '#/',            label: 'Dashboard',    icon: 'chart' },
  { path: '#/apiaries',    label: 'Apiaries',     icon: 'apiary' },
  { path: '#/projects',    label: 'Projects',     icon: 'beaker', badge: recruitingCount },
  { group: 'Collaboration' },
  { path: '#/forum',       label: 'Forum',        icon: 'forum' },
  { path: '#/repository',  label: 'Repository',   icon: 'book' },
  { path: '#/marketplace', label: 'Marketplace',  icon: 'tag' },
  { group: 'You' },
  { path: '#/notifications', label: 'Notifications', icon: 'bell', badge: unreadCount },
];

const ROUTES = [
  { test: /^#\/?$/,                    view: renderDashboard },
  { test: /^#\/apiaries\/?$/,          view: renderApiaries },
  { test: /^#\/apiaries\/(.+)$/,       view: renderApiary },
  { test: /^#\/managers\/(.+)$/,       view: renderManager },
  { test: /^#\/projects\/?$/,          view: renderProjects },
  { test: /^#\/projects\/(.+)$/,       view: renderProject },
  { test: /^#\/forum\/?$/,             view: renderForum },
  { test: /^#\/forum\/(.+)$/,          view: renderThread },
  { test: /^#\/repository\/?$/,        view: renderRepository },
  { test: /^#\/repository\/(.+)$/,     view: renderSubTopic },
  { test: /^#\/marketplace\/?$/,       view: renderMarketplace },
  { test: /^#\/notifications\/?$/,     view: renderNotifications },
];

function shellHTML(inner) {
  const hash = location.hash || '#/';
  const nav = NAV.map((item) => {
    if (item.group) return `<div class="rail-group"><span>${item.group}</span></div>`;
    const active = item.path === '#/'
      ? /^#\/?$/.test(hash)
      : hash.startsWith(item.path);
    const n = item.badge ? item.badge() : 0;
    return `
      <a class="nav-item ${active ? 'is-on' : ''}" href="${item.path}">
        ${icons[item.icon]}
        <span>${item.label}</span>
        ${n ? `<span class="nav-count">${n}</span>` : ''}
      </a>`;
  }).join('');

  return `
    <button class="rail-toggle" data-rail aria-label="Open navigation">${icons.menu}</button>
    <div class="rail-scrim" data-rail-close></div>
    <div class="shell">
      <aside class="rail">
        <a class="rail-mark" href="#/">
          ${brandMark(36)}
          <b>AQBBA</b>
        </a>
        <nav>${nav}</nav>
        <div class="rail-foot">
          <div class="rail-who">
            ${avatar(currentUser)}
            <div>
              <strong>${esc(currentUser.name)}</strong>
              <span>${esc(roleLabel(currentUser.id))}</span>
            </div>
          </div>
          <button class="rail-out" data-signout>Sign out</button>

          <div class="rail-preview">
            <label for="preview-as">Preview apiary access as <span title="Testing only — doesn't change who posts, joins or lists things as you.">(prototype)</span></label>
            <select id="preview-as">
              ${members.map((m) => `<option value="${m.id}" ${previewUser().id === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
            </select>
          </div>
        </div>
      </aside>
      <main class="main" id="main">${inner}</main>
    </div>`;
}

function render() {
  if (!state.signedIn) {
    app.innerHTML = renderGate();
    bindGlobal();
    return;
  }

  const hash = location.hash || '#/';
  let inner = '';
  for (const r of ROUTES) {
    const m = hash.match(r.test);
    if (m) { inner = r.view(m[1]); break; }
  }
  if (!inner) {
    inner = `
      <div class="wrap">
        <div class="empty">
          <h3>That page isn't here</h3>
          <p>The link may be out of date. The dashboard is a good place to pick up from.</p>
          <a class="btn btn-primary" href="#/">Go to dashboard</a>
        </div>
      </div>`;
  }

  app.innerHTML = shellHTML(inner);
  bindGlobal();
  document.body.classList.remove('rail-open');
}

/* --- global delegated behaviour ----------------------------------------- */

function bindGlobal() {
  const toggle = app.querySelector('[data-rail]');
  if (toggle) toggle.addEventListener('click', () => document.body.classList.toggle('rail-open'));

  const scrim = app.querySelector('[data-rail-close]');
  if (scrim) scrim.addEventListener('click', () => document.body.classList.remove('rail-open'));

  const out = app.querySelector('[data-signout]');
  if (out) out.addEventListener('click', () => { signOut(); location.hash = '#/'; render(); });

  const preview = app.querySelector('#preview-as');
  if (preview) preview.addEventListener('change', (e) => {
    setPreviewAs(e.target.value);
    toast(`Previewing apiary access as ${previewUser().name}.`);
    render();
  });

  /* Subscribe buttons work identically wherever they appear. A page may show
     more than one control for the same subscription, so update them all. */
  app.querySelectorAll('[data-sub]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.sub;
      const now = toggleSub(key);
      app.querySelectorAll(`[data-sub="${key}"]`).forEach((peer) => {
        peer.classList.toggle('is-on', now);
        peer.setAttribute('aria-pressed', String(now));
        peer.innerHTML = `${now ? icons.bellOn : icons.bell}<span>${now ? 'Subscribed' : 'Subscribe'}</span>`;
      });
      const what = btn.dataset.subLabel || 'this topic';
      toast(now
        ? `Subscribed to ${what}. New posts will go to ${currentUser.name.split(' ')[0].toLowerCase()}@…, matching your digest setting.`
        : `Unsubscribed from ${what}. No further email.`);
      refreshBadge();
    });
  });
}

function refreshBadge() {
  const n = unreadCount();
  const link = app.querySelector('a[href="#/notifications"]');
  if (!link) return;
  const existing = link.querySelector('.nav-count');
  if (n && existing) existing.textContent = n;
  else if (n) link.insertAdjacentHTML('beforeend', `<span class="nav-count">${n}</span>`);
  else if (existing) existing.remove();
}

/* --- boot ---------------------------------------------------------------- */

window.addEventListener('hashchange', () => {
  render();
  const main = document.getElementById('main');
  if (main) main.scrollIntoView({ block: 'start' });
  window.scrollTo(0, 0);
});

onChange(refreshBadge);

/* Views ask for a re-render after mutating state. */
window.__aqbba_render = render;

render();
