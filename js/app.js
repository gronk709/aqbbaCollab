/* ==========================================================================
   Application shell + hash router.
   ========================================================================== */

import {
  state, signOut, unreadCount, recruitingCount, onChange, toggleSub,
  roleLabel, previewUser, setPreviewAs, currentUser, allMembers, loadSignedInMember,
  isWebAdmin,
} from './store.js';
import { icons, brandMark, avatar, toast, esc } from './ui.js';
import { renderGate } from './views/gate.js';
import { renderDashboard } from './views/dashboard.js';
import { renderApiaries, renderApiary } from './views/apiaries.js';
import { renderManager, renderMembers } from './views/managers.js';
import { renderProjects, renderProject } from './views/projects.js';
import { renderForum, renderThread } from './views/forum.js';
import { renderRepository, renderSubTopic, renderArticle } from './views/repository.js';
import { renderMarketplace } from './views/marketplace.js';
import { renderNotifications } from './views/notifications.js';
import { loadContent } from './content.js';
import { isWildApricotCallback, consumeWildApricotCallback, completeWildApricotLogin } from './waAuth.js';

const app = document.getElementById('app');

/* Projects is the organizing concept — the VSH program itself is PRJ-00,
   and the old top-level Dashboard now lives under it as a topic area — so
   Projects is also the landing page ('#/'). */
const NAV = [
  { group: 'Research' },
  { path: '#/projects',    label: 'Projects',     icon: 'beaker', badge: recruitingCount, home: true },
  { path: '#/apiaries',    label: 'Apiaries',     icon: 'apiary' },
  { group: 'Collaboration' },
  { path: '#/forum',       label: 'Forum',        icon: 'forum' },
  { path: '#/repository',  label: 'Repository',   icon: 'book' },
  { path: '#/marketplace', label: 'Marketplace',  icon: 'tag' },
  { group: 'You' },
  { path: '#/notifications', label: 'Notifications', icon: 'bell', badge: unreadCount },
  { path: '#/members',     label: 'Members',      icon: 'user', adminOnly: true },
];

const ROUTES = [
  { test: /^#\/?$/,                    view: renderProjects },
  { test: /^#\/apiaries\/?$/,          view: renderApiaries },
  { test: /^#\/apiaries\/(.+)$/,       view: renderApiary },
  { test: /^#\/members\/?$/,           view: renderMembers },
  { test: /^#\/managers\/(.+)$/,       view: renderManager },
  { test: /^#\/projects\/?$/,          view: renderProjects },
  /* The dashboard is a topic area of the VSH program (PRJ-00), not a page in
     its own right — hence the project-scoped route. Must precede the generic
     project route, which would otherwise swallow "p0/dashboard" as an id. */
  { test: /^#\/projects\/p0\/dashboard\/?$/, view: renderDashboard },
  { test: /^#\/projects\/(.+)$/,       view: renderProject },
  { test: /^#\/forum\/?$/,             view: renderForum },
  { test: /^#\/forum\/(.+)$/,          view: renderThread },
  { test: /^#\/repository\/?$/,        view: renderRepository },
  /* Article reader before the sub-topic route, which would otherwise swallow
     "rs-graft/some-article" whole as a sub-topic id. */
  { test: /^#\/repository\/([^/]+)\/(.+)$/, view: renderArticle },
  { test: /^#\/repository\/(.+)$/,     view: renderSubTopic },
  { test: /^#\/marketplace\/?$/,       view: renderMarketplace },
  { test: /^#\/notifications\/?$/,     view: renderNotifications },
];

function shellHTML(inner) {
  const me = currentUser();
  const canManageMembers = isWebAdmin(me.id);
  const hash = location.hash || '#/';
  const nav = NAV.filter((item) => !item.adminOnly || canManageMembers).map((item) => {
    if (item.group) return `<div class="rail-group"><span>${item.group}</span></div>`;
    const active = hash.startsWith(item.path) || (item.home && /^#\/?$/.test(hash));
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
            ${avatar(me)}
            <div>
              <strong>${esc(me.name)}</strong>
              <span>${esc(roleLabel(me.id))}</span>
            </div>
          </div>
          <button class="rail-out" data-signout>Sign out</button>

          <div class="rail-preview">
            <label for="preview-as">Preview access as <span title="Testing only — doesn't change who posts to the forum, joins projects, or lists items in the marketplace as you.">(prototype)</span></label>
            <select id="preview-as">
              ${allMembers().map((m) => `<option value="${m.id}" ${previewUser().id === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
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
    if (m) { inner = r.view(m[1], m[2]); break; }
  }
  if (!inner) {
    inner = `
      <div class="wrap">
        <div class="empty">
          <h3>That page isn't here</h3>
          <p>The link may be out of date. Projects is a good place to pick up from.</p>
          <a class="btn btn-primary" href="#/">Go to projects</a>
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
  if (out) out.addEventListener('click', async () => { await signOut(); location.hash = '#/'; render(); });

  const preview = app.querySelector('#preview-as');
  if (preview) preview.addEventListener('change', (e) => {
    setPreviewAs(e.target.value);
    toast(`Previewing access as ${previewUser().name}.`);
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
        ? `Subscribed to ${what}. New posts will go to ${currentUser().name.split(' ')[0].toLowerCase()}@…, matching your digest setting.`
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

/* Wild Apricot redirects back with a real page load and ?code=/?error= in
   the query string, not the hash — so this has to run once at boot, ahead
   of the hash router, regardless of sign-in state. completeWildApricotLogin
   calls the server-side token exchange (js/waAuth.js) and sets a real
   Supabase session from its result; loadSignedInMember() (js/store.js) then
   reads that signed-in member's own row so currentUser() resolves to them
   from here on. */
if (isWildApricotCallback()) {
  const result = consumeWildApricotCallback();
  if (result.error) {
    toast(`Wild Apricot sign-in failed: ${result.error}`);
  } else {
    try {
      const { firstName } = await completeWildApricotLogin(result.code);
      await loadSignedInMember();
      toast(`Welcome, ${firstName}.`);
    } catch (err) {
      toast(`Wild Apricot sign-in failed: ${err.message}`);
    }
  }
} else {
  /* Not a fresh Wild Apricot redirect — but a previous real sign-in's
     Supabase session may still be valid (it persists in its own
     localStorage key across reloads). Best-effort and silent: if this
     fails (offline, CDN unreachable), the app still boots — it just shows
     the sign-in gate rather than resuming a session it couldn't check. */
  try {
    await loadSignedInMember();
  } catch (err) {
    console.warn('Could not check for a persisted Supabase session:', err);
  }
}

/* The repository content manifest loads before first paint (top-level await
   in an ES module). If it's missing, loadContent leaves an empty index and
   the repository falls back to seeded placeholders. */
await loadContent();

render();
