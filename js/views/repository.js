/* ==========================================================================
   Information repository. Three tracks, each with sub-topics members can
   subscribe to, publish to, and be notified about.

   Content comes from two layers: real association material under
   content/repository/ (Markdown articles + document attachments, indexed by
   a manifest — see js/content.js), with the original seeded placeholder
   shown only for sub-topics that have no real content yet.

   The ordinals here are earned: Foundation → Production → Breeding is a real
   progression, and a member working through it needs to know the order.
   ========================================================================== */

import {
  repository, allSubs, subById, memberById, sampleArticle, relDays, currentUser,
} from '../data.js';
import { isSubscribed, state, roleLabel } from '../store.js';
import { contentFor, articleFor, fetchArticleBody, mdToHtml } from '../content.js';
import { esc, icons, avatar, subButton, modal, closeModal, toast } from '../ui.js';

/* Article authors in front-matter are member ids where possible, but plain
   names are allowed for guest contributors. */
function authorDisplay(author) {
  if (/^m\d+$/.test(author)) {
    const m = memberById(author);
    return { name: m.name, sub: roleLabel(m.id), avatar: avatar(m) };
  }
  return { name: author || 'AQBBA', sub: 'Contributor', avatar: '' };
}

function itemCount(s) {
  const c = contentFor(s.id);
  return c ? c.articles.length + c.attachments.length : s.items;
}

function subRow(s) {
  const key = `repo:${s.id}`;
  const on = isSubscribed(key);
  const c = contentFor(s.id);
  const n = itemCount(s);
  return `
    <div class="sub">
      <div class="sub-title">
        <strong><a href="#/repository/${s.id}">${esc(s.name)}</a></strong>
        <span>${esc(s.summary)}</span>
      </div>
      <div style="flex:none;text-align:right;min-width:96px">
        <div class="mono" style="font-size:12.5px">${n} ${n === 1 ? 'item' : 'items'}</div>
        <div class="caption" style="font-size:11px">${c ? 'documents attached' : relDays(s.updated)}</div>
      </div>
      ${subButton(key, on, 'Subscribe')}
    </div>`;
}

export function renderRepository() {
  const subCount = state.subs.filter((s) => s.startsWith('repo:')).length;
  const totalItems = allSubs.reduce((n, s) => n + itemCount(s), 0);

  const tracks = repository.map((track) => `
    <section class="track">
      <div class="track-head">
        <div class="track-ord mono">${track.ord}</div>
        <div>
          <h2>${esc(track.name)}</h2>
          <p>${esc(track.blurb)}</p>
        </div>
      </div>
      <div class="track-subs">${track.subs.map(subRow).join('')}</div>
    </section>`).join('');

  const html = `
    <div class="topbar">
      <div style="width:100%">
        <div class="eyebrow">Member knowledge base · ${totalItems} items</div>
        <h1>Repository</h1>
      </div>
      <div class="topbar-actions">
        <button class="btn btn-primary btn-sm" id="contribute">${icons.pen} Contribute</button>
      </div>
    </div>

    <div class="wrap view">
      <p class="lede" style="max-width:64ch;margin-bottom:var(--s6)">
        Three tracks in sequence. Foundation assumes nothing; Queen Production assumes
        Foundation; Queen Breeding assumes both. Subscribe to any sub-topic to be emailed
        when a member adds to it.
      </p>

      ${tracks}

      <div class="panel" style="margin-top:var(--s6)">
        <div class="panel-head">
          <h2>Your subscriptions</h2>
          <span class="spacer"></span>
          <span class="caption mono">${subCount}</span>
        </div>
        <div class="panel-body">
          ${subCount === 0 ? `
            <div class="empty" style="padding:var(--s5) 0">
              <h3>Nothing subscribed yet</h3>
              <p>Subscribe to a sub-topic and new contributions arrive by email.</p>
            </div>` : `
            <div class="row row-wrap" style="gap:var(--s2)">
              ${state.subs.filter((k) => k.startsWith('repo:')).map((k) => {
                const s = subById(k.slice(5));
                return s ? `<a class="tag tag-amber" href="#/repository/${s.id}">${icons.bellOn} ${esc(s.name)}</a>` : '';
              }).join('')}
            </div>
            <p class="caption" style="margin-top:var(--s4)">
              Delivered to the address on your Wild Apricot record.
            </p>`}
        </div>
      </div>
    </div>`;

  setTimeout(() => {
    const btn = document.getElementById('contribute');
    if (btn) btn.addEventListener('click', openContribute);
  }, 0);

  return html;
}

function openContribute(preselect) {
  const body = `
    <p class="caption" style="margin-bottom:var(--s5)">
      Everyone subscribed to the sub-topic you choose is notified when you publish.
    </p>
    <form id="contrib-form">
      <div class="field">
        <label for="c-sub">Sub-topic</label>
        <select id="c-sub">
          ${repository.map((t) => `
            <optgroup label="${esc(t.ord)} · ${esc(t.name)}">
              ${t.subs.map((s) => `<option value="${s.id}" ${s.id === preselect ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
            </optgroup>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="c-title">Title</label>
        <input id="c-title" required placeholder="What does this cover?">
      </div>
      <div class="field">
        <label for="c-body">Content</label>
        <textarea id="c-body" required placeholder="Write for a member who knows the previous track but not this one."></textarea>
      </div>
    </form>
    <div class="gate-hint" style="margin-top:var(--s4)">
      <strong>Prototype.</strong> This form simulates publishing. Real content is added as
      Markdown files and documents under <code>content/repository/</code> — see the
      README's authoring guide.
    </div>`;

  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-primary" id="pub-contrib">Publish</button>`;

  const scrim = modal({ title: 'Contribute to the repository', body, actions });

  scrim.querySelector('#pub-contrib').addEventListener('click', () => {
    const title = scrim.querySelector('#c-title').value.trim();
    const text = scrim.querySelector('#c-body').value.trim();
    const subId = scrim.querySelector('#c-sub').value;
    if (!title || !text) { toast('Add a title and some content before publishing.'); return; }

    const s = subById(subId);
    closeModal();
    const notified = 4 + Math.floor(Math.random() * 14);
    toast(`Published to ${s.name}. ${notified} subscribers notified by email.`);
  });
}

/* --- shared pieces -------------------------------------------------------- */

function attachmentsPanel(c) {
  if (!c || !c.attachments.length) return '';
  return `
    <div class="panel">
      <div class="panel-head">
        <h2>Documents</h2>
        <span class="spacer"></span>
        <span class="caption mono">${c.attachments.length}</span>
      </div>
      <div class="panel-body panel-body-flush">
        ${c.attachments.map((a) => `
          <a class="sub" href="${a.file}" target="_blank" rel="noopener">
            <div class="sub-title">
              <strong>${esc(a.name)}</strong>
              <span>${esc(a.kind)} · ${esc(a.size)}</span>
            </div>
            <span class="tag tag-outline">${esc(a.kind)}</span>
          </a>`).join('')}
      </div>
    </div>`;
}

function articleListPanel(s, c, activeSlug = null) {
  if (!c || !c.articles.length) return '';
  return `
    <div class="panel">
      <div class="panel-head">
        <h2>Articles</h2>
        <span class="spacer"></span>
        <span class="caption mono">${c.articles.length}</span>
      </div>
      <div class="panel-body panel-body-flush">
        ${c.articles.map((a) => {
          const who = authorDisplay(a.author);
          const here = a.slug === activeSlug;
          return `
            <a class="sub" href="#/repository/${s.id}/${a.slug}"
               style="${here ? 'background:var(--amber-wash)' : ''}">
              <div class="sub-title">
                <strong>${esc(a.title)}</strong>
                <span>${esc(who.name)}${a.date ? ` · ${esc(a.date)}` : ''}</span>
              </div>
              ${icons.chevron}
            </a>`;
        }).join('')}
      </div>
    </div>`;
}

/* Fetch an article body into the placeholder the page rendered. */
function hydrateArticle(article) {
  setTimeout(async () => {
    const el = document.getElementById('md-body');
    if (!el) return;
    try {
      const md = await fetchArticleBody(article);
      el.innerHTML = mdToHtml(md);
    } catch {
      el.innerHTML = '<p class="caption">This article could not be loaded. Check that the content files were pushed alongside the manifest.</p>';
    }
  }, 0);
}

/* Old-style seeded article body (used only by placeholder sub-topics). */
function renderProse(lines) {
  return lines.map((l) => {
    if (l.startsWith('h3:')) return `<h3>${esc(l.slice(3))}</h3>`;
    if (l.startsWith('quote:')) return `<blockquote>${esc(l.slice(6))}</blockquote>`;
    if (l.startsWith('list:')) {
      return `<ul>${l.slice(5).split('|').map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
    }
    return `<p>${esc(l)}</p>`;
  }).join('');
}

/* --- sub-topic ------------------------------------------------------------ */

export function renderSubTopic(id) {
  const s = subById(id);
  if (!s) return '';

  const key = `repo:${s.id}`;
  const on = isSubscribed(key);
  const by = memberById(s.by);
  const track = repository.find((t) => t.id === s.trackId);
  const c = contentFor(s.id);
  const siblings = track.subs.filter((x) => x.id !== s.id);

  const newest = c && c.articles.length ? c.articles[0] : null;
  const newestWho = newest ? authorDisplay(newest.author) : null;

  let mainColumn;
  if (c) {
    mainColumn = `
      ${newest ? `
        <article class="panel">
          <div class="panel-head">
            <div style="min-width:0">
              <div class="eyebrow">Most recent</div>
              <h2 style="margin-top:2px;line-height:1.3">${esc(newest.title)}</h2>
            </div>
          </div>
          <div class="panel-body">
            <div class="row" style="gap:var(--s3);padding-bottom:var(--s5);border-bottom:1px solid var(--comb-shade)">
              ${newestWho.avatar}
              <div>
                <div style="font-size:13.5px;font-weight:600">${esc(newestWho.name)}</div>
                <div class="caption">${esc(newestWho.sub)}${newest.date ? ` · ${esc(newest.date)}` : ''}</div>
              </div>
            </div>
            <div class="prose" style="margin-top:var(--s5)" id="md-body">
              <p class="caption">Loading…</p>
            </div>
          </div>
        </article>` : ''}
      ${attachmentsPanel(c)}`;
  } else {
    const author = memberById(sampleArticle.by);
    mainColumn = `
      <article class="panel">
        <div class="panel-head">
          <div style="min-width:0">
            <div class="eyebrow">Most recent</div>
            <h2 style="margin-top:2px;line-height:1.3">${esc(sampleArticle.title)}</h2>
          </div>
        </div>
        <div class="panel-body">
          <div class="row" style="gap:var(--s3);padding-bottom:var(--s5);border-bottom:1px solid var(--comb-shade)">
            ${avatar(author)}
            <div>
              <div style="font-size:13.5px;font-weight:600">${esc(author.name)}</div>
              <div class="caption">${esc(roleLabel(author.id))} · published today</div>
            </div>
          </div>
          <div class="prose" style="margin-top:var(--s5)">
            ${renderProse(sampleArticle.body)}
          </div>
        </div>
      </article>

      <div class="panel">
        <div class="panel-body">
          <p class="caption">
            No real content has been added to this sub-topic yet — the article above is a
            placeholder. Add Markdown articles and documents under
            <span class="mono" style="font-size:11.5px">content/repository/${s.id}/</span>
            and they replace it.
          </p>
        </div>
      </div>`;
  }

  const html = `
    <div class="topbar">
      <div style="width:100%">
        <div class="crumb">
          <a href="#/repository">Repository</a> ${icons.chevron}
          <span>${esc(track.ord)} · ${esc(track.name)}</span>
        </div>
        <div class="eyebrow">${itemCount(s)} items · curated by ${esc(by.name)}</div>
        <h1>${esc(s.name)}</h1>
      </div>
      <div class="topbar-actions">
        ${subButton(key, on, 'Subscribe')}
        <button class="btn btn-primary btn-sm" id="add-here">${icons.plus} Add item</button>
      </div>
    </div>

    <div class="wrap view">
      <div class="grid grid-dash">
        <div class="stack">
          ${mainColumn}
        </div>

        <div class="stack">
          ${articleListPanel(s, c, newest ? newest.slug : null)}

          <div class="panel">
            <div class="panel-head"><h2>Notifications</h2></div>
            <div class="panel-body">
              <p style="font-size:13px;color:var(--propolis-60)">
                New items in <strong>${esc(s.name)}</strong> are emailed to subscribers as
                soon as they are published. ${esc(by.name)} curates this sub-topic.
              </p>
              <div style="margin-top:var(--s4)">${subButton(key, on, 'Subscribe')}</div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-head"><h2>${esc(track.ord)} · ${esc(track.name)}</h2></div>
            <div class="panel-body panel-body-flush">
              ${siblings.map((x) => `
                <div class="sub">
                  <div class="sub-title">
                    <strong><a href="#/repository/${x.id}">${esc(x.name)}</a></strong>
                    <span>${itemCount(x)} items</span>
                  </div>
                  ${icons.chevron}
                </div>`).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>`;

  if (newest) hydrateArticle(newest);

  setTimeout(() => {
    const btn = document.getElementById('add-here');
    if (btn) btn.addEventListener('click', () => openContribute(s.id));
  }, 0);

  return html;
}

/* --- article reader ------------------------------------------------------- */

export function renderArticle(subId, slug) {
  const s = subById(subId);
  const article = articleFor(subId, slug);
  if (!s || !article) return '';

  const track = repository.find((t) => t.id === s.trackId);
  const c = contentFor(s.id);
  const who = authorDisplay(article.author);
  const key = `repo:${s.id}`;
  const on = isSubscribed(key);

  const html = `
    <div class="topbar">
      <div style="width:100%">
        <div class="crumb">
          <a href="#/repository">Repository</a> ${icons.chevron}
          <a href="#/repository/${s.id}">${esc(s.name)}</a> ${icons.chevron}
          <span>Article</span>
        </div>
        <div class="eyebrow">${esc(track.ord)} · ${esc(track.name)}</div>
        <h1 style="font-size:clamp(1.375rem,2.4vw,1.75rem);max-width:36ch">${esc(article.title)}</h1>
      </div>
      <div class="topbar-actions">
        ${subButton(key, on, 'Subscribe')}
      </div>
    </div>

    <div class="wrap view">
      <div class="grid grid-dash">
        <div class="stack">
          <article class="panel">
            <div class="panel-body">
              <div class="row" style="gap:var(--s3);padding-bottom:var(--s5);border-bottom:1px solid var(--comb-shade)">
                ${who.avatar}
                <div>
                  <div style="font-size:13.5px;font-weight:600">${esc(who.name)}</div>
                  <div class="caption">${esc(who.sub)}${article.date ? ` · ${esc(article.date)}` : ''}</div>
                </div>
              </div>
              <div class="prose" style="margin-top:var(--s5)" id="md-body">
                <p class="caption">Loading…</p>
              </div>
            </div>
          </article>
        </div>

        <div class="stack">
          ${articleListPanel(s, c, slug)}
          ${attachmentsPanel(c)}
        </div>
      </div>
    </div>`;

  hydrateArticle(article);
  return html;
}
