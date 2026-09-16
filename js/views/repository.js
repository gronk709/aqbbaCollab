/* ==========================================================================
   Information repository. Three tracks, each with sub-topics members can
   subscribe to, publish to, and be notified about.

   Content comes from two layers, merged per sub-topic: real association
   material under content/repository/ (Markdown articles + document
   attachments, indexed by a manifest — see js/content.js, unaffected by
   any of the migrations below and never edited from inside the app), and
   articles/documents authored from inside the app (repository_articles/
   repository_documents — real Supabase rows + Storage uploads), which is
   what the "Contribute"/"Add item" composer actually writes now instead
   of simulating a publish.

   Track/sub-topic structure itself is a real Supabase table (Phase 3 —
   see the plan doc); js/app.js's router loads it (loadRepository /
   loadSubTopic in js/store.js) before calling the render functions below.

   Permissions are scoped per sub-topic (repository_team), same shape as
   apiary_managers/project_team: holding "Repository Manager" or "Creator"
   as a role tag is just a label — a Web Admin assigns 'manage' (add,
   edit, delete) or 'contribute' (add, edit) access to one specific
   sub-topic. Creating a track or sub-topic itself stays Web-Admin-only,
   unchanged from Phase 3.

   The ordinals here are earned: Foundation → Production → Breeding is a real
   progression, and a member working through it needs to know the order.
   ========================================================================== */

import {
  addRepositoryArticle, updateRepositoryArticle, deleteRepositoryArticle,
  addRepositoryDocument, addRepositoryLink, deleteRepositoryDocument, openRepositoryDocument,
  setRepositoryTeamMember, removeRepositoryTeamMember, loadRealMembers,
  isSubscribed,
  REPOSITORY_DOC_MAX_BYTES, REPOSITORY_DOC_ACCEPT,
} from '../store.js';
import { contentFor, articleFor, fetchArticleBody, mdToHtml } from '../content.js';
import { esc, icons, avatar, subButton, modal, closeModal, toast } from '../ui.js';
import { members } from '../data.js';

/* Article authors in front-matter are member ids where possible (resolved
   via the seed roster — real, non-seed authors aren't supported by this
   file-based content path), but plain names are allowed for guest
   contributors. Unchanged by any of this — still file-only. */
function authorDisplay(author) {
  if (author && /^m\d+$/.test(author)) {
    const m = members.find((x) => x.id === author);
    if (m) return { name: m.name, sub: 'Contributor', avatar: '' };
  }
  return { name: author || 'AQBBA', sub: 'Contributor', avatar: '' };
}

function fmtBytes(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/* --- merging the two content sources into one display list --------------- */

function mergedArticles(subId, c, dbArticles) {
  const file = (c ? c.articles : []).map((a) => ({
    key: `file:${a.slug}`, source: 'file', slug: a.slug,
    title: a.title, authorName: authorDisplay(a.author).name,
    dateLabel: a.date, dateSort: a.date ? new Date(a.date).getTime() : 0,
    raw: a,
  }));
  const db = dbArticles.map((a) => ({
    key: `db:${a.id}`, source: 'db', id: a.id,
    title: a.title, authorName: a.author?.name || 'Member', authorId: a.author?.id,
    dateLabel: (a.updated_at || a.created_at).slice(0, 10), dateSort: new Date(a.created_at).getTime(),
    raw: a,
  }));
  return [...file, ...db].sort((x, y) => y.dateSort - x.dateSort);
}

function mergedDocuments(c, dbDocuments) {
  const file = (c ? c.attachments : []).map((a) => ({
    key: `file:${a.file}`, source: 'file', name: a.name, meta: `${a.kind} · ${a.size}`, href: a.file,
  }));
  const db = dbDocuments.map((d) => ({
    key: `db:${d.id}`, source: 'db', id: d.id, name: d.filename,
    meta: d.external_url ? d.external_url.replace(/^https?:\/\//, '').replace(/\/$/, '') : `${d.mime_type || 'Document'} · ${fmtBytes(d.size_bytes)}`,
    isLink: !!d.external_url, authorId: d.author?.id, raw: d,
  }));
  return [...file, ...db];
}

/* --- index ----------------------------------------------------------------- */

function itemCount(s) {
  const c = contentFor(s.id);
  return (c ? c.articles.length + c.attachments.length : 0) + (s.dbCount || 0);
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
        <div class="caption" style="font-size:11px">${c || s.dbCount ? 'documents attached' : 'no content yet'}</div>
      </div>
      ${subButton(key, on, 'Subscribe')}
    </div>`;
}

export function renderRepository(tracks) {
  const allSubsFlat = tracks.flatMap((t) => t.subs);
  const subCount = allSubsFlat.filter((s) => isSubscribed(`repo:${s.id}`)).length;
  const totalItems = allSubsFlat.reduce((n, s) => n + itemCount(s), 0);
  const contributable = allSubsFlat.filter((s) => s.canContribute);

  const tracksHTML = tracks.map((track) => `
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
        ${contributable.length ? `<button class="btn btn-primary btn-sm" id="contribute">${icons.pen} Contribute</button>` : ''}
      </div>
    </div>

    <div class="wrap view">
      <p class="lede" style="max-width:64ch;margin-bottom:var(--s6)">
        Three tracks in sequence. Foundation assumes nothing; Queen Production assumes
        Foundation; Queen Breeding assumes both. Subscribe to any sub-topic to be emailed
        when a member adds to it.
      </p>

      ${tracksHTML}

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
              ${allSubsFlat.filter((s) => isSubscribed(`repo:${s.id}`)).map((s) =>
                `<a class="tag tag-amber" href="#/repository/${s.id}">${icons.bellOn} ${esc(s.name)}</a>`).join('')}
            </div>
            <p class="caption" style="margin-top:var(--s4)">
              Delivered to the address on your Wild Apricot record.
            </p>`}
        </div>
      </div>
    </div>`;

  setTimeout(() => {
    const btn = document.getElementById('contribute');
    if (btn) btn.addEventListener('click', () => openContribute(contributable));
  }, 0);

  return html;
}

/* --- contribute (real add-article / add-document composer) --------------- */

function openContribute(eligibleSubs, preselect) {
  const body = `
    <div class="field">
      <label for="c-sub">Sub-topic</label>
      <select id="c-sub">
        ${eligibleSubs.map((s) => `<option value="${s.id}" ${s.id === preselect ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label for="c-kind">Adding</label>
      <select id="c-kind">
        <option value="article">An article</option>
        <option value="document">A document</option>
        <option value="link">A website link</option>
      </select>
    </div>
    <div id="c-article-fields">
      <div class="field">
        <label for="c-title">Title</label>
        <input id="c-title" placeholder="What does this cover?">
      </div>
      <div class="field">
        <label for="c-summary">One-line summary</label>
        <input id="c-summary" placeholder="Shown in the article list">
      </div>
      <div class="field">
        <label for="c-body">Content</label>
        <textarea id="c-body" placeholder="Write for a member who knows the previous track but not this one."></textarea>
        <p class="caption" style="margin-top:6px">Markdown — headings, **bold**, lists, links. Jump to a document or link below with [label](doc:some-words-from-its-name).</p>
      </div>
    </div>
    <div id="c-document-fields" hidden>
      <div class="field">
        <label for="c-file">File</label>
        <input type="file" id="c-file" accept="${REPOSITORY_DOC_ACCEPT}">
        <p class="caption" style="margin-top:6px">PDF, Word, text, spreadsheet, slide or image files — up to 20MB.</p>
      </div>
    </div>
    <div id="c-link-fields" hidden>
      <div class="field">
        <label for="c-link-name">Name</label>
        <input id="c-link-name" placeholder="How this should appear in the list">
      </div>
      <div class="field">
        <label for="c-link-url">URL</label>
        <input id="c-link-url" placeholder="https://…">
      </div>
    </div>`;

  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-primary" id="pub-contrib">Publish</button>`;

  const scrim = modal({ title: 'Contribute to the repository', body, actions });

  const kindSelect = scrim.querySelector('#c-kind');
  const articleFields = scrim.querySelector('#c-article-fields');
  const documentFields = scrim.querySelector('#c-document-fields');
  const linkFields = scrim.querySelector('#c-link-fields');
  kindSelect.addEventListener('change', () => {
    articleFields.hidden = kindSelect.value !== 'article';
    documentFields.hidden = kindSelect.value !== 'document';
    linkFields.hidden = kindSelect.value !== 'link';
  });

  const btn = scrim.querySelector('#pub-contrib');
  btn.addEventListener('click', async () => {
    const subId = scrim.querySelector('#c-sub').value;
    const kind = kindSelect.value;

    if (kind === 'article') {
      const title = scrim.querySelector('#c-title').value.trim();
      const summary = scrim.querySelector('#c-summary').value.trim();
      const text = scrim.querySelector('#c-body').value.trim();
      if (!title || !summary || !text) { toast('Add a title, summary and content before publishing.'); return; }
      btn.disabled = true;
      btn.textContent = 'Publishing…';
      try {
        await addRepositoryArticle(subId, { title, summary, body: text });
      } catch (err) {
        toast(`Couldn't publish: ${err.message}`);
        btn.disabled = false;
        btn.textContent = 'Publish';
        return;
      }
    } else if (kind === 'document') {
      const file = scrim.querySelector('#c-file').files[0];
      if (!file) { toast('Choose a file first.'); return; }
      if (file.size > REPOSITORY_DOC_MAX_BYTES) { toast(`${file.name} is over the 20MB limit.`); return; }
      btn.disabled = true;
      btn.textContent = 'Uploading…';
      try {
        await addRepositoryDocument(subId, file);
      } catch (err) {
        toast(`Couldn't upload: ${err.message}`);
        btn.disabled = false;
        btn.textContent = 'Publish';
        return;
      }
    } else {
      const name = scrim.querySelector('#c-link-name').value.trim();
      const url = scrim.querySelector('#c-link-url').value.trim();
      if (!name || !url) { toast('Add a name and a URL before publishing.'); return; }
      if (!/^https?:\/\//i.test(url)) { toast('The URL needs to start with http:// or https://.'); return; }
      btn.disabled = true;
      btn.textContent = 'Publishing…';
      try {
        await addRepositoryLink(subId, { name, url });
      } catch (err) {
        toast(`Couldn't publish: ${err.message}`);
        btn.disabled = false;
        btn.textContent = 'Publish';
        return;
      }
    }

    closeModal();
    toast('Published.');
    window.__aqbba_invalidateData();
    window.__aqbba_render();
  });
}

function openEditArticleModal(article, onSaved) {
  const body = `
    <div class="field">
      <label for="e-title">Title</label>
      <input id="e-title" value="${esc(article.title)}">
    </div>
    <div class="field">
      <label for="e-summary">One-line summary</label>
      <input id="e-summary" value="${esc(article.summary)}">
    </div>
    <div class="field">
      <label for="e-body">Content</label>
      <textarea id="e-body">${esc(article.body)}</textarea>
      <p class="caption" style="margin-top:6px">Markdown — headings, **bold**, lists, links. Jump to a document or link below with [label](doc:some-words-from-its-name).</p>
    </div>`;
  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-primary" id="save-article">Save</button>`;
  const scrim = modal({ title: 'Edit article', body, actions });

  scrim.querySelector('#save-article').addEventListener('click', async (e) => {
    const title = scrim.querySelector('#e-title').value.trim();
    const summary = scrim.querySelector('#e-summary').value.trim();
    const text = scrim.querySelector('#e-body').value.trim();
    if (!title || !summary || !text) { toast('Title, summary and content are all required.'); return; }
    e.target.disabled = true;
    try {
      await updateRepositoryArticle(article.id, { title, summary, body: text });
    } catch (err) {
      toast(`Couldn't save: ${err.message}`);
      e.target.disabled = false;
      return;
    }
    closeModal();
    toast('Article updated.');
    onSaved();
  });
}

/* --- team (Repository Manager / Creator assignment) ----------------------- */

function teamPanelHTML(data) {
  return `
    <div class="panel">
      <div class="panel-head">
        <h2>Repository team</h2>
        <span class="spacer"></span>
        ${data.isAdmin ? `<button type="button" class="btn btn-ghost btn-sm" id="manage-repo-team">${icons.pen} Manage</button>` : ''}
      </div>
      <div class="panel-body panel-body-flush">
        ${data.team.length ? data.team.map((t) => `
          <div class="breeder">
            ${avatar(t.member)}
            <div style="flex:1;min-width:0">
              <strong style="font-size:13.5px;font-weight:600;display:block">${esc(t.member.name)}</strong>
              <span class="caption">${t.access_level === 'manage' ? 'Repository Manager' : 'Creator'}</span>
            </div>
          </div>`).join('') : `
          <div class="empty" style="padding:var(--s5)"><p class="caption">No one assigned yet — a Web Admin assigns Repository Managers and Creators here.</p></div>`}
      </div>
    </div>`;
}

async function openManageRepoTeamModal(subId, data) {
  let realMembers;
  try {
    realMembers = await loadRealMembers();
  } catch (err) {
    toast(`Couldn't load members: ${err.message}`);
    return;
  }
  const already = new Set(data.team.map((t) => t.member_id));
  const eligible = realMembers.filter((m) => !already.has(m.id));

  const body = `
    <div style="border:1px solid var(--comb-shade);border-radius:4px;margin-bottom:var(--s5)">
      ${data.team.length ? data.team.map((t) => `
        <div class="breeder">
          ${avatar(t.member)}
          <div style="flex:1;min-width:0">
            <strong style="font-size:13.5px;font-weight:600;display:block">${esc(t.member.name)}</strong>
            <span class="caption">${t.access_level === 'manage' ? 'Repository Manager' : 'Creator'}</span>
          </div>
          <button type="button" class="attach-remove" data-remove-repo-team="${t.member_id}" aria-label="Remove">${icons.x}</button>
        </div>`).join('') : `<div class="empty" style="padding:var(--s4)"><p class="caption">No one assigned yet.</p></div>`}
    </div>
    ${eligible.length ? `
      <div class="field">
        <label for="repo-team-member">Add a member</label>
        <select id="repo-team-member">
          ${eligible.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="repo-team-level">As</label>
        <select id="repo-team-level">
          <option value="manage">Repository Manager — add, edit, delete content</option>
          <option value="contribute">Creator — add, edit content, no delete</option>
        </select>
      </div>` : '<p class="caption">Every member is already on this sub-topic\'s team.</p>'}`;

  const actions = eligible.length ? `
    <button class="btn btn-ghost" data-close>Close</button>
    <button class="btn btn-primary" id="add-repo-team-member">Add to team</button>` : `
    <button class="btn btn-ghost" data-close>Close</button>`;

  const scrim = modal({ title: 'Manage repository team', body, actions });

  scrim.querySelectorAll('[data-remove-repo-team]').forEach((b) => {
    b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        await removeRepositoryTeamMember(subId, b.dataset.removeRepoTeam);
      } catch (err) {
        toast(`Couldn't remove: ${err.message}`);
        b.disabled = false;
        return;
      }
      closeModal();
      window.__aqbba_invalidateData();
      window.__aqbba_render();
    });
  });

  const addBtn = scrim.querySelector('#add-repo-team-member');
  if (addBtn) addBtn.addEventListener('click', async () => {
    const memberId = scrim.querySelector('#repo-team-member').value;
    const level = scrim.querySelector('#repo-team-level').value;
    addBtn.disabled = true;
    try {
      await setRepositoryTeamMember(subId, memberId, level);
    } catch (err) {
      toast(`Couldn't assign: ${err.message}`);
      addBtn.disabled = false;
      return;
    }
    closeModal();
    window.__aqbba_invalidateData();
    window.__aqbba_render();
  });
}

/* --- shared pieces -------------------------------------------------------- */

/* A doc's key ('file:content/...' or 'db:<uuid>') as a safe HTML id, so an
   article's `doc:some-slug` link (js/content.js) can scroll to and briefly
   highlight the matching row here, instead of the reader having to hunt
   for it by eye in the list below. */
function docAnchorId(key) {
  return `doc-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

/* Delegated on the article body container (not on each [data-jump-doc]
   link individually) because a file-based article's body arrives later,
   asynchronously (hydrateFileArticle's fetch) — long after this container
   itself exists and this listener was attached. */
function bindDocJumpLinks(container) {
  if (!container) return;
  container.addEventListener('click', (e) => {
    const a = e.target.closest('[data-jump-doc]');
    if (!a) return;
    e.preventDefault();
    const el = document.getElementById(docAnchorId(a.dataset.jumpDoc));
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.background = 'var(--amber-wash)';
    setTimeout(() => { el.style.background = ''; }, 1600);
  });
}

function attachmentsPanel(docs, canContribute, canManage) {
  if (!docs.length) return '';
  return `
    <div class="panel">
      <div class="panel-head">
        <h2>Documents</h2>
        <span class="spacer"></span>
        <span class="caption mono">${docs.length}</span>
      </div>
      <div class="panel-body panel-body-flush">
        ${docs.map((d) => {
          if (d.source === 'file') {
            return `
              <a class="sub" id="${docAnchorId(d.key)}" href="${d.href}" target="_blank" rel="noopener">
                <div class="sub-title">
                  <strong>${esc(d.name)}</strong>
                  <span>${esc(d.meta)}</span>
                </div>
              </a>`;
          }
          return `
            <div class="sub" id="${docAnchorId(d.key)}">
              <button type="button" class="sub-title" style="text-align:left;background:none;border:none;cursor:pointer" data-open-doc="${d.id}">
                <strong>${d.isLink ? `${icons.link} ` : ''}${esc(d.name)}</strong>
                <span>${esc(d.meta)}</span>
              </button>
              ${canManage ? `<button type="button" class="attach-remove" data-delete-doc="${d.id}" aria-label="Delete">${icons.x}</button>` : ''}
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

function articleListPanel(s, articles, activeKey = null) {
  if (!articles.length) return '';
  return `
    <div class="panel">
      <div class="panel-head">
        <h2>Articles</h2>
        <span class="spacer"></span>
        <span class="caption mono">${articles.length}</span>
      </div>
      <div class="panel-body panel-body-flush">
        ${articles.map((a) => {
          const here = a.key === activeKey;
          const href = a.source === 'file' ? `#/repository/${s.id}/${a.slug}` : `#/repository/${s.id}/${a.id}`;
          return `
            <a class="sub" href="${href}"
               style="${here ? 'background:var(--amber-wash)' : ''}">
              <div class="sub-title">
                <strong>${esc(a.title)}</strong>
                <span>${esc(a.authorName)}${a.dateLabel ? ` · ${esc(a.dateLabel)}` : ''}</span>
              </div>
              ${icons.chevron}
            </a>`;
        }).join('')}
      </div>
    </div>`;
}

/* Fetch a file-based article body into the placeholder the page rendered. */
function hydrateFileArticle(article, docs) {
  setTimeout(async () => {
    const el = document.getElementById('md-body');
    if (!el) return;
    try {
      const md = await fetchArticleBody(article);
      el.innerHTML = mdToHtml(md, docs);
    } catch {
      el.innerHTML = '<p class="caption">This article could not be loaded. Check that the content files were pushed alongside the manifest.</p>';
    }
  }, 0);
}

function bindDocButtons(docsById) {
  document.querySelectorAll('[data-open-doc]').forEach((el) => {
    el.addEventListener('click', async () => {
      try {
        await openRepositoryDocument(docsById[el.dataset.openDoc].raw);
      } catch (err) {
        toast(`Couldn't open that document: ${err.message}`);
      }
    });
  });
  document.querySelectorAll('[data-delete-doc]').forEach((el) => {
    el.addEventListener('click', async () => {
      el.disabled = true;
      try {
        await deleteRepositoryDocument(docsById[el.dataset.deleteDoc].raw);
      } catch (err) {
        toast(`Couldn't delete: ${err.message}`);
        el.disabled = false;
        return;
      }
      window.__aqbba_invalidateData();
      window.__aqbba_render();
    });
  });
}

/* --- sub-topic ------------------------------------------------------------ */

export function renderSubTopic(data) {
  const { sub: s, track, dbArticles, dbDocuments, canContribute, canManage } = data;
  const key = `repo:${s.id}`;
  const on = isSubscribed(key);
  const c = contentFor(s.id);
  const siblings = track.subs.filter((x) => x.id !== s.id);

  const articles = mergedArticles(s.id, c, dbArticles);
  const docs = mergedDocuments(c, dbDocuments);
  const docsById = Object.fromEntries(docs.filter((d) => d.source === 'db').map((d) => [d.id, d]));
  const newest = articles[0] || null;

  let mainColumn;
  if (newest) {
    const canEditNewest = newest.source === 'db' && canContribute;
    const canDeleteNewest = newest.source === 'db' && canManage;
    mainColumn = `
      <article class="panel">
        <div class="panel-head">
          <div style="min-width:0">
            <div class="eyebrow">Most recent</div>
            <h2 style="margin-top:2px;line-height:1.3">${esc(newest.title)}</h2>
          </div>
          <span class="spacer"></span>
          ${canEditNewest ? `<button type="button" class="attach-remove" data-edit-article="${newest.id}" aria-label="Edit">${icons.pen}</button>` : ''}
          ${canDeleteNewest ? `<button type="button" class="attach-remove" data-delete-article="${newest.id}" aria-label="Delete">${icons.x}</button>` : ''}
        </div>
        <div class="panel-body">
          <div class="row" style="gap:var(--s3);padding-bottom:var(--s5);border-bottom:1px solid var(--comb-shade)">
            <div>
              <div style="font-size:13.5px;font-weight:600">${esc(newest.authorName)}</div>
              <div class="caption">${newest.dateLabel ? esc(newest.dateLabel) : ''}</div>
            </div>
          </div>
          <div class="prose" style="margin-top:var(--s5)" id="md-body">
            <p class="caption">Loading…</p>
          </div>
        </div>
      </article>
      ${attachmentsPanel(docs, canContribute, canManage)}`;
  } else {
    mainColumn = `
      <div class="panel">
        <div class="panel-body">
          <div class="empty" style="padding:var(--s5) 0">
            <h3>No content here yet</h3>
            <p>
              ${canContribute ? 'Use "Add item" to publish the first article or document here.' : `
              Add Markdown articles and documents under
              <span class="mono" style="font-size:11.5px">content/repository/${s.id}/</span>,
              or ask a Web Admin for repository access to publish here directly.`}
            </p>
          </div>
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
        <div class="eyebrow">${itemCount({ id: s.id, dbCount: dbArticles.length + dbDocuments.length })} items</div>
        <h1>${esc(s.name)}</h1>
      </div>
      <div class="topbar-actions">
        ${subButton(key, on, 'Subscribe')}
        ${canContribute ? `<button class="btn btn-primary btn-sm" id="add-here">${icons.plus} Add item</button>` : ''}
      </div>
    </div>

    <div class="wrap view">
      <div class="grid grid-dash">
        <div class="stack">
          ${mainColumn}
        </div>

        <div class="stack">
          ${articleListPanel(s, articles.slice(1), newest ? newest.key : null)}

          <div class="panel">
            <div class="panel-head"><h2>Notifications</h2></div>
            <div class="panel-body">
              <p style="font-size:13px;color:var(--propolis-60)">
                New items in <strong>${esc(s.name)}</strong> are emailed to subscribers as
                soon as they are published.
              </p>
              <div style="margin-top:var(--s4)">${subButton(key, on, 'Subscribe')}</div>
            </div>
          </div>

          ${teamPanelHTML(data)}

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

  if (newest) {
    if (newest.source === 'file') hydrateFileArticle(newest.raw, docs);
    else setTimeout(() => {
      const el = document.getElementById('md-body');
      if (el) el.innerHTML = mdToHtml(newest.raw.body, docs);
    }, 0);
  }

  setTimeout(() => {
    const btn = document.getElementById('add-here');
    if (btn) btn.addEventListener('click', () => openContribute([{ id: s.id, name: s.name }], s.id));

    const teamBtn = document.getElementById('manage-repo-team');
    if (teamBtn) teamBtn.addEventListener('click', () => openManageRepoTeamModal(s.id, data));

    bindDocButtons(docsById);
    bindDocJumpLinks(document.getElementById('md-body'));

    document.querySelectorAll('[data-edit-article]').forEach((el) => {
      el.addEventListener('click', () => {
        openEditArticleModal(newest.raw, () => {
          window.__aqbba_invalidateData();
          window.__aqbba_render();
        });
      });
    });
    document.querySelectorAll('[data-delete-article]').forEach((el) => {
      el.addEventListener('click', async () => {
        el.disabled = true;
        try {
          await deleteRepositoryArticle(el.dataset.deleteArticle);
        } catch (err) {
          toast(`Couldn't delete: ${err.message}`);
          el.disabled = false;
          return;
        }
        window.__aqbba_invalidateData();
        window.__aqbba_render();
      });
    });
  }, 0);

  return html;
}

/* --- article reader ------------------------------------------------------- */

export function renderArticle(data, subId, slug) {
  const { sub: s, track, dbArticles, dbDocuments, canContribute, canManage } = data;
  const dbArticle = dbArticles.find((a) => a.id === slug);
  const fileArticle = dbArticle ? null : articleFor(subId, slug);
  if (!dbArticle && !fileArticle) return '';

  const c = contentFor(s.id);
  const articles = mergedArticles(s.id, c, dbArticles);
  const docs = mergedDocuments(c, dbDocuments);
  const key = `repo:${s.id}`;
  const on = isSubscribed(key);

  const title = dbArticle ? dbArticle.title : fileArticle.title;
  const who = dbArticle ? { name: dbArticle.author?.name || 'Member', sub: 'Contributor' } : authorDisplay(fileArticle.author);
  const dateLabel = dbArticle ? (dbArticle.updated_at || dbArticle.created_at).slice(0, 10) : fileArticle.date;
  const canEdit = dbArticle && canContribute;
  const canDelete = dbArticle && canManage;

  const html = `
    <div class="topbar">
      <div style="width:100%">
        <div class="crumb">
          <a href="#/repository">Repository</a> ${icons.chevron}
          <a href="#/repository/${s.id}">${esc(s.name)}</a> ${icons.chevron}
          <span>Article</span>
        </div>
        <div class="eyebrow">${esc(track.ord)} · ${esc(track.name)}</div>
        <h1 style="font-size:clamp(1.375rem,2.4vw,1.75rem);max-width:36ch">${esc(title)}</h1>
      </div>
      <div class="topbar-actions" style="gap:var(--s2)">
        ${canEdit ? `<button class="btn btn-ghost btn-sm" id="edit-this-article">${icons.pen} Edit</button>` : ''}
        ${canDelete ? `<button class="btn btn-ghost btn-sm" id="delete-this-article">${icons.x} Delete</button>` : ''}
        ${subButton(key, on, 'Subscribe')}
      </div>
    </div>

    <div class="wrap view">
      <div class="grid grid-dash">
        <div class="stack">
          <article class="panel">
            <div class="panel-body">
              <div class="row" style="gap:var(--s3);padding-bottom:var(--s5);border-bottom:1px solid var(--comb-shade)">
                <div>
                  <div style="font-size:13.5px;font-weight:600">${esc(who.name)}</div>
                  <div class="caption">${esc(who.sub)}${dateLabel ? ` · ${esc(dateLabel)}` : ''}</div>
                </div>
              </div>
              <div class="prose" style="margin-top:var(--s5)" id="md-body">
                <p class="caption">Loading…</p>
              </div>
            </div>
          </article>
        </div>

        <div class="stack">
          ${articleListPanel(s, articles, dbArticle ? `db:${dbArticle.id}` : `file:${slug}`)}
          ${attachmentsPanel(docs, canContribute, canManage)}
        </div>
      </div>
    </div>`;

  if (dbArticle) {
    setTimeout(() => {
      const el = document.getElementById('md-body');
      if (el) el.innerHTML = mdToHtml(dbArticle.body, docs);
    }, 0);
  } else {
    hydrateFileArticle(fileArticle, docs);
  }

  setTimeout(() => {
    const docsById = Object.fromEntries(docs.filter((d) => d.source === 'db').map((d) => [d.id, d]));
    bindDocButtons(docsById);
    bindDocJumpLinks(document.getElementById('md-body'));

    const editBtn = document.getElementById('edit-this-article');
    if (editBtn) editBtn.addEventListener('click', () => {
      openEditArticleModal(dbArticle, () => {
        window.__aqbba_invalidateData();
        window.__aqbba_render();
      });
    });
    const deleteBtn = document.getElementById('delete-this-article');
    if (deleteBtn) deleteBtn.addEventListener('click', async () => {
      deleteBtn.disabled = true;
      try {
        await deleteRepositoryArticle(dbArticle.id);
      } catch (err) {
        toast(`Couldn't delete: ${err.message}`);
        deleteBtn.disabled = false;
        return;
      }
      toast('Article deleted.');
      window.__aqbba_invalidateData();
      location.hash = `#/repository/${s.id}`;
    });
  }, 0);

  return html;
}
