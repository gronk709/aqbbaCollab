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
  setRepositoryTeamMember, removeRepositoryTeamMember, loadRealMembers, loadSubTopicDocuments,
  isSubscribed, uploadRepositoryImage, signRepositoryImages,
  REPOSITORY_DOC_MAX_BYTES, REPOSITORY_DOC_ACCEPT,
} from '../store.js';
import { contentFor, articleFor, fetchArticleBody, mdToHtml, hydrateImages, slugify } from '../content.js';
import { IMAGE_ACCEPT, prepareImage, altFromFilename } from '../images.js';
import { esc, icons, avatar, subButton, modal, closeModal, toast } from '../ui.js';
import { members } from '../data.js';
import {
  button, pageHeader, pageBody, twoColumn, card, CARD, countBadge, rowList, personRow, emptyState,
  ICON_BUTTON, ICON_BUTTON_DANGER,
} from '../components.js';

/* Article body (js/content.js's Markdown renderer) is injected HTML, so its
   type is set from a wrapper with arbitrary variants rather than on each tag.
   Serif body ~15.5px / 1.72; headings carry the amber underline bar used by
   sectionHeading; blockquote has the amber rule. Whole class strings only. */
const MD_PROSE = [
  'tw:font-display tw:text-[15.5px] tw:leading-[1.72] tw:text-[#33291C] tw:md:text-[16.5px]',
  'tw:[&_p]:mt-4 tw:[&_p:first-child]:mt-0',
  'tw:[&_h3]:mt-12 tw:[&_h3]:mb-5 tw:[&_h3]:font-display tw:[&_h3]:text-2xl tw:[&_h3]:font-medium tw:[&_h3]:leading-snug tw:[&_h3]:tracking-tight tw:[&_h3]:text-propolis tw:[&_h3:first-child]:mt-0',
  "tw:[&_h3]:after:mt-2.5 tw:[&_h3]:after:block tw:[&_h3]:after:h-1 tw:[&_h3]:after:w-10 tw:[&_h3]:after:rounded-full tw:[&_h3]:after:bg-amber tw:[&_h3]:after:content-['']",
  'tw:[&_ul]:my-5 tw:[&_ul]:list-disc tw:[&_ul]:pl-6 tw:[&_ol]:my-5 tw:[&_ol]:list-decimal tw:[&_ol]:pl-6',
  'tw:[&_li]:mb-2 tw:[&_li]:pl-1 tw:[&_li]:marker:text-amber',
  'tw:[&_blockquote]:my-7 tw:[&_blockquote]:border-l-[3px] tw:[&_blockquote]:border-amber tw:[&_blockquote]:pl-5 tw:[&_blockquote]:italic tw:[&_blockquote]:text-propolis-60',
  'tw:[&_strong]:font-semibold tw:[&_strong]:text-propolis',
  'tw:[&_a]:text-amber-deep tw:[&_a]:underline tw:[&_a]:underline-offset-2 tw:[&_a]:hover:text-amber',
].join(' ');

const LOADING = '<p class="tw:text-sm tw:text-propolis-40">Loading…</p>';

const initialsOf = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

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
    <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-x-5 tw:gap-y-3 tw:px-6 tw:py-4 tw:transition tw:hover:bg-comb/60 tw:md:px-8">
      <div class="tw:min-w-0 tw:flex-1 tw:basis-64">
        <a href="#/repository/${s.id}" class="tw:block tw:font-display tw:text-lg tw:font-medium tw:text-propolis tw:transition tw:hover:text-amber-deep">${esc(s.name)}</a>
        <p class="tw:mt-0.5 tw:text-sm tw:leading-snug tw:text-propolis-60">${esc(s.summary)}</p>
      </div>
      <div class="tw:shrink-0 tw:text-left tw:sm:min-w-28 tw:sm:text-right">
        <div class="tw:font-mono tw:text-[13px] tw:text-propolis">${n} ${n === 1 ? 'item' : 'items'}</div>
        <div class="tw:font-mono tw:text-[10.5px] tw:uppercase tw:tracking-[0.12em] tw:text-propolis-40">${c || s.dbCount ? 'documents attached' : 'no content yet'}</div>
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
    <section class="${CARD} tw:overflow-hidden">
      <div class="tw:flex tw:items-start tw:gap-4 tw:px-6 tw:py-7 tw:md:gap-6 tw:md:px-8">
        <div class="tw:w-11 tw:shrink-0 tw:font-display tw:text-3xl tw:leading-none tw:font-medium tw:text-amber/50 tw:md:w-20 tw:md:text-6xl">${track.ord}</div>
        <div class="tw:min-w-0">
          <h2 class="tw:font-display tw:text-2xl tw:font-medium tw:tracking-tight tw:text-propolis tw:md:text-3xl">${esc(track.name)}</h2>
          <p class="tw:mt-2 tw:max-w-[62ch] tw:leading-relaxed tw:text-propolis-60">${esc(track.blurb)}</p>
        </div>
      </div>
      <div class="tw:divide-y tw:divide-comb-shade/70 tw:border-t tw:border-comb-shade/70">${track.subs.map(subRow).join('')}</div>
    </section>`).join('');

  const subscribed = allSubsFlat.filter((s) => isSubscribed(`repo:${s.id}`));
  const subscriptions = card({
    title: 'Your subscriptions',
    right: countBadge(subCount),
    body: subCount === 0
      ? emptyState({
        title: 'Nothing subscribed yet',
        text: 'Subscribe to a sub-topic and new contributions arrive by email.',
        bordered: false,
      })
      : `
        <div class="tw:flex tw:flex-wrap tw:gap-2">
          ${subscribed.map((s) =>
            `<a class="tw:inline-flex tw:items-center tw:gap-1.5 tw:whitespace-nowrap tw:rounded-full tw:bg-amber-wash tw:px-3 tw:py-1.5 tw:font-mono tw:text-[10.5px] tw:font-medium tw:uppercase tw:tracking-[0.06em] tw:text-amber-deep tw:transition tw:hover:bg-amber/25" href="#/repository/${s.id}">${icons.bellOn} ${esc(s.name)}</a>`).join('')}
        </div>
        <p class="tw:mt-4 tw:text-sm tw:text-propolis-60">
          Delivered to the address on your Wild Apricot record.
        </p>`,
  });

  const html = `
    <div class="view">
      ${pageHeader({
        eyebrow: `Member knowledge base · ${totalItems} items`,
        title: 'Repository',
        actions: contributable.length ? button({ id: 'contribute', label: 'Contribute', icon: icons.pen, size: 'sm' }) : '',
        lede: `Three tracks in sequence. Foundation assumes nothing; Queen Production assumes
          Foundation; Queen Breeding assumes both. Subscribe to any sub-topic to be emailed
          when a member adds to it.`,
      })}
      ${pageBody(`<div class="tw:space-y-8">${tracksHTML}${subscriptions}</div>`)}
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
        <p class="tw:mt-1.5 tw:text-xs tw:text-propolis-40">Markdown — headings, **bold**, *italic*, lists, links, images.</p>
      </div>
      <div class="field">
        <label for="c-doc-picker">Add document or link</label>
        <select id="c-doc-picker">
          <option value="">Choose one to insert into the content above…</option>
        </select>
        <p class="tw:mt-1.5 tw:text-xs tw:text-propolis-40">Inserts a link that jumps to that item in the Documents list once published — add the document or link itself first if it isn't in the list yet.</p>
      </div>
      <div class="field">
        <label for="c-img-picker">Add image</label>
        <input type="file" id="c-img-picker" accept="${IMAGE_ACCEPT}">
        <p class="tw:mt-1.5 tw:text-xs tw:text-propolis-40">JPEG or PNG. Resized and compressed for the web automatically, then inserted into the content above — edit the text in [brackets] to change its description.</p>
      </div>
    </div>
    <div id="c-document-fields" hidden>
      <div class="field">
        <label for="c-file">File</label>
        <input type="file" id="c-file" accept="${REPOSITORY_DOC_ACCEPT}">
        <p class="tw:mt-1.5 tw:text-xs tw:text-propolis-40">Supported formats: PDF, Word, Spreadsheet, Slides, Text, Images/JPG (Max 20MB)</p>
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

  const subSelect = scrim.querySelector('#c-sub');
  bindDocPicker(scrim, 'c-doc-picker', 'c-body', () => subSelect.value, subSelect);
  bindImagePicker(scrim, 'c-img-picker', 'c-body', () => subSelect.value);

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

function openEditArticleModal(article, subId, onSaved) {
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
      <p class="tw:mt-1.5 tw:text-xs tw:text-propolis-40">Markdown — headings, **bold**, *italic*, lists, links, images.</p>
    </div>
    <div class="field">
      <label for="e-doc-picker">Add document or link</label>
      <select id="e-doc-picker">
        <option value="">Choose one to insert into the content above…</option>
      </select>
      <p class="tw:mt-1.5 tw:text-xs tw:text-propolis-40">Inserts a link that jumps to that item in the Documents list once published — add the document or link itself first if it isn't in the list yet.</p>
    </div>
    <div class="field">
      <label for="e-img-picker">Add image</label>
      <input type="file" id="e-img-picker" accept="${IMAGE_ACCEPT}">
      <p class="tw:mt-1.5 tw:text-xs tw:text-propolis-40">JPEG or PNG. Resized and compressed for the web automatically, then inserted into the content above — edit the text in [brackets] to change its description.</p>
    </div>`;
  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-primary" id="save-article">Save</button>`;
  const scrim = modal({ title: 'Edit article', body, actions });

  bindDocPicker(scrim, 'e-doc-picker', 'e-body', () => subId);
  bindImagePicker(scrim, 'e-img-picker', 'e-body', () => subId);

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
  const manage = data.isAdmin
    ? `<button type="button" id="manage-repo-team" class="tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-lg tw:px-2.5 tw:py-1 tw:text-sm tw:font-medium tw:text-amber-deep tw:transition tw:hover:bg-amber-wash">${icons.pen} Manage</button>`
    : '';
  return card({
    title: 'Repository team', right: manage,
    body: data.team.length
      ? `<ul class="tw:space-y-3">${data.team.map((t) => `<li>${personRow({ ...t.member, sub: t.access_level === 'manage' ? 'Repository Manager' : 'Creator' })}</li>`).join('')}</ul>`
      : '<p class="tw:text-sm tw:text-propolis-60">No one assigned yet — a Web Admin assigns Repository Managers and Creators here.</p>',
  });
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
    <div class="tw:mb-5 tw:divide-y tw:divide-comb-shade/70 tw:rounded-xl tw:border tw:border-comb-shade">
      ${data.team.length ? data.team.map((t) => `
        <div class="tw:flex tw:items-center tw:gap-3 tw:px-4 tw:py-3">
          ${avatar(t.member)}
          <div class="tw:min-w-0 tw:flex-1">
            <strong class="tw:block tw:text-sm tw:font-semibold">${esc(t.member.name)}</strong>
            <span class="tw:text-xs tw:text-propolis-40">${t.access_level === 'manage' ? 'Repository Manager' : 'Creator'}</span>
          </div>
          <button type="button" class="${ICON_BUTTON_DANGER}" data-remove-repo-team="${t.member_id}" aria-label="Remove">${icons.x}</button>
        </div>`).join('') : `<p class="tw:p-4 tw:text-sm tw:text-propolis-40">No one assigned yet.</p>`}
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
      </div>` : '<p class="tw:text-sm tw:text-propolis-40">Every member is already on this sub-topic\'s team.</p>'}`;

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
    /* .doc-row.flash is the highlight animation (tools/tailwind/components-repository.css). */
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1600);
  });
}

/* Wires an "Add document or link" <select> (id=pickerId) that inserts
   [name](doc:slug) into a textarea (id=bodyFieldId) at the cursor on
   selection — shared by the Contribute composer's article fields and the
   Edit article modal. subIdOf is a function so Contribute (whose own
   Sub-topic select can change) can re-resolve it on each refresh; Edit
   article's sub-topic is fixed, so it just passes () => subId. Pass
   watchEl (an element to listen for 'change' on) to refetch when the
   available documents could differ — only Contribute needs this, since
   only its sub-topic can change after the modal opens. */
function bindDocPicker(scrim, pickerId, bodyFieldId, subIdOf, watchEl) {
  const picker = scrim.querySelector(`#${pickerId}`);
  const bodyField = scrim.querySelector(`#${bodyFieldId}`);
  /* Keyed by the picker's own option value (its index as a string) rather
     than re-parsing name/slug back out of the option — avoids needing to
     encode two fields into one attribute value. */
  let pickerItems = [];

  async function refresh() {
    picker.disabled = true;
    picker.innerHTML = '<option value="">Loading…</option>';
    const subId = subIdOf();
    let dbDocuments;
    try {
      dbDocuments = await loadSubTopicDocuments(subId);
    } catch {
      picker.innerHTML = '<option value="">Couldn’t load this sub-topic’s documents</option>';
      return;
    }
    pickerItems = mergedDocuments(contentFor(subId), dbDocuments)
      .map((d) => ({ name: d.name, slug: slugify(d.name) }));
    picker.innerHTML = pickerItems.length
      ? `<option value="">Choose one to insert into the content above…</option>${
          pickerItems.map((d, i) => `<option value="${i}">${esc(d.name)}</option>`).join('')}`
      : '<option value="">Nothing in this sub-topic’s Documents list yet</option>';
    picker.disabled = pickerItems.length === 0;
  }
  refresh();
  if (watchEl) watchEl.addEventListener('change', refresh);

  picker.addEventListener('change', () => {
    if (!picker.value) return;
    const item = pickerItems[Number(picker.value)];
    const snippet = `[${item.name}](doc:${item.slug})`;
    const start = bodyField.selectionStart ?? bodyField.value.length;
    const end = bodyField.selectionEnd ?? bodyField.value.length;
    bodyField.setRangeText(snippet, start, end, 'end');
    bodyField.focus();
    picker.value = '';
  });
}

/* Wires an "Add image" file input: the chosen JPEG/PNG is resized and
   compressed in the browser (js/images.js), uploaded, and inserted into the
   article textarea as `![description](img:path)` at the cursor. */
function bindImagePicker(scrim, inputId, bodyFieldId, subIdOf) {
  const input = scrim.querySelector(`#${inputId}`);
  const bodyField = scrim.querySelector(`#${bodyFieldId}`);
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    input.disabled = true;
    try {
      const prepared = await prepareImage(file);
      const path = await uploadRepositoryImage(subIdOf(), prepared);
      const snippet = `![${altFromFilename(file.name)}](img:${path})`;
      const start = bodyField.selectionStart ?? bodyField.value.length;
      const end = bodyField.selectionEnd ?? bodyField.value.length;
      bodyField.setRangeText(`${start > 0 ? '\n\n' : ''}${snippet}\n\n`, start, end, 'end');
      bodyField.focus();
    } catch (err) {
      toast(`Couldn't add that image: ${err.message}`);
    } finally {
      input.value = '';
      input.disabled = false;
    }
  });
}

function attachmentsPanel(docs, canContribute, canManage) {
  if (!docs.length) return '';
  const ROW = 'doc-row tw:flex tw:items-center tw:gap-3 tw:px-6 tw:py-3.5 tw:transition tw:hover:bg-comb/60';
  return card({
    title: 'Documents', right: countBadge(docs.length), flush: true,
    body: rowList(docs.map((d) => {
      if (d.source === 'file') {
        return `
          <a class="${ROW}" id="${docAnchorId(d.key)}" href="${d.href}" target="_blank" rel="noopener">
            <div class="tw:min-w-0 tw:flex-1">
              <strong class="tw:block tw:text-sm tw:font-semibold tw:text-propolis">${esc(d.name)}</strong>
              <span class="tw:block tw:text-xs tw:leading-snug tw:text-propolis-40 tw:[overflow-wrap:anywhere]">${esc(d.meta)}</span>
            </div>
          </a>`;
      }
      return `
        <div class="${ROW}" id="${docAnchorId(d.key)}">
          <button type="button" class="tw:min-w-0 tw:flex-1 tw:cursor-pointer tw:text-left" data-open-doc="${d.id}">
            <strong class="tw:block tw:text-sm tw:font-semibold tw:text-propolis">${d.isLink ? `${icons.link} ` : ''}${esc(d.name)}</strong>
            <span class="tw:block tw:text-xs tw:leading-snug tw:text-propolis-40 tw:[overflow-wrap:anywhere]">${esc(d.meta)}</span>
          </button>
          ${canManage ? `<button type="button" class="${ICON_BUTTON_DANGER}" data-delete-doc="${d.id}" aria-label="Delete">${icons.x}</button>` : ''}
        </div>`;
    })),
  });
}

function articleListPanel(s, articles, activeKey = null) {
  if (!articles.length) return '';
  return card({
    title: 'Articles', right: countBadge(articles.length), flush: true,
    body: rowList(articles.map((a) => {
      const here = a.key === activeKey;
      const href = a.source === 'file' ? `#/repository/${s.id}/${a.slug}` : `#/repository/${s.id}/${a.id}`;
      return `
        <a class="tw:flex tw:items-center tw:gap-3 tw:px-6 tw:py-3.5 tw:transition ${here ? 'tw:bg-amber-wash' : 'tw:hover:bg-comb/60'}" href="${href}">
          <div class="tw:min-w-0 tw:flex-1">
            <strong class="tw:block tw:text-sm tw:font-semibold tw:text-propolis">${esc(a.title)}</strong>
            <span class="tw:text-xs tw:text-propolis-40">${esc(a.authorName)}${a.dateLabel ? ` · ${esc(a.dateLabel)}` : ''}</span>
          </div>
          <span class="tw:shrink-0 tw:text-propolis-40">${icons.chevron}</span>
        </a>`;
    })),
  });
}

/* Fetch a file-based article body into the placeholder the page rendered. */
function hydrateFileArticle(article, docs) {
  setTimeout(async () => {
    const el = document.getElementById('md-body');
    if (!el) return;
    try {
      const md = await fetchArticleBody(article);
      el.innerHTML = mdToHtml(md, docs);
      hydrateImages(el, signRepositoryImages);
    } catch {
      el.innerHTML = '<p class="tw:text-sm tw:text-propolis-40">This article could not be loaded. Check that the content files were pushed alongside the manifest.</p>';
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
      <article class="${CARD} tw:min-w-0 tw:overflow-hidden">
        <div class="tw:flex tw:items-start tw:gap-3 tw:px-6 tw:pt-6 tw:md:px-10 tw:md:pt-8">
          <div class="tw:min-w-0">
            <p class="tw:font-mono tw:text-[10.5px] tw:uppercase tw:tracking-[0.12em] tw:text-propolis-40">Most recent</p>
            <h2 class="tw:mt-1 tw:font-display tw:text-2xl tw:leading-tight tw:font-medium tw:tracking-tight tw:text-propolis tw:md:text-3xl">${esc(newest.title)}</h2>
          </div>
          <div class="tw:ml-auto tw:flex tw:shrink-0 tw:items-center tw:gap-1">
            ${canEditNewest ? `<button type="button" class="${ICON_BUTTON}" data-edit-article="${newest.id}" aria-label="Edit">${icons.pen}</button>` : ''}
            ${canDeleteNewest ? `<button type="button" class="${ICON_BUTTON_DANGER}" data-delete-article="${newest.id}" aria-label="Delete">${icons.x}</button>` : ''}
          </div>
        </div>
        <div class="tw:px-6 tw:pt-5 tw:pb-8 tw:md:px-10 tw:md:pb-10">
          <div class="tw:border-b tw:border-comb-shade/70 tw:pb-5">
            <div class="tw:text-[15px] tw:font-semibold tw:text-propolis">${esc(newest.authorName)}</div>
            <div class="tw:text-sm tw:text-propolis-60">${newest.dateLabel ? esc(newest.dateLabel) : ''}</div>
          </div>
          <div class="${MD_PROSE} tw:mt-7" id="md-body">
            ${LOADING}
          </div>
        </div>
      </article>
      ${attachmentsPanel(docs, canContribute, canManage)}`;
  } else {
    mainColumn = emptyState({
      title: 'No content here yet',
      text: canContribute ? 'Use "Add item" to publish the first article or document here.' : `
        Add Markdown articles and documents under
        <span class="tw:font-mono tw:text-[12px]">content/repository/${s.id}/</span>,
        or ask a Web Admin for repository access to publish here directly.`,
    });
  }

  const html = `
    <div class="view">
      ${pageHeader({
        crumbs: [{ label: 'Repository', href: '#/repository' }, { label: `${track.ord} · ${track.name}` }],
        eyebrow: `${itemCount({ id: s.id, dbCount: dbArticles.length + dbDocuments.length })} items`,
        title: s.name,
        actions: `${subButton(key, on, 'Subscribe')}${canContribute ? button({ id: 'add-here', label: 'Add item', icon: icons.plus, size: 'sm' }) : ''}`,
      })}
      ${pageBody(twoColumn({
        main: mainColumn,
        side: `
          ${articleListPanel(s, articles.slice(1), newest ? newest.key : null)}
          ${card({
            title: 'Notifications',
            body: `
              <p class="tw:text-sm tw:leading-relaxed tw:text-propolis-60">
                New items in <strong class="tw:font-semibold tw:text-propolis">${esc(s.name)}</strong> are emailed to subscribers as
                soon as they are published.
              </p>
              <div class="tw:mt-4">${subButton(key, on, 'Subscribe')}</div>`,
          })}
          ${teamPanelHTML(data)}
          ${card({
            title: `${track.ord} · ${track.name}`, flush: true,
            body: rowList(siblings.map((x) => `
              <div class="tw:flex tw:items-center tw:gap-3 tw:px-6 tw:py-3.5 tw:transition tw:hover:bg-comb/60">
                <div class="tw:min-w-0 tw:flex-1">
                  <a href="#/repository/${x.id}" class="tw:block tw:text-sm tw:font-semibold tw:text-propolis tw:transition tw:hover:text-amber-deep">${esc(x.name)}</a>
                  <span class="tw:text-xs tw:text-propolis-40">${itemCount(x)} items</span>
                </div>
                <span class="tw:shrink-0 tw:text-propolis-40">${icons.chevron}</span>
              </div>`)),
          })}`,
      }))}
    </div>`;

  if (newest) {
    if (newest.source === 'file') hydrateFileArticle(newest.raw, docs);
    else setTimeout(() => {
      const el = document.getElementById('md-body');
      if (el) { el.innerHTML = mdToHtml(newest.raw.body, docs); hydrateImages(el, signRepositoryImages); }
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
        openEditArticleModal(newest.raw, s.id, () => {
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
    <div class="view">
      ${pageHeader({
        crumbs: [
          { label: 'Repository', href: '#/repository' },
          { label: s.name, href: `#/repository/${s.id}` },
          { label: 'Article' },
        ],
        eyebrow: `${esc(track.ord)} · ${esc(track.name)}`,
        title,
        compact: true,
        actions: `${canEdit ? button({ id: 'edit-this-article', label: 'Edit', icon: icons.pen, variant: 'outline', size: 'sm' }) : ''}${canDelete ? button({ id: 'delete-this-article', label: 'Delete', icon: icons.x, variant: 'outline', size: 'sm' }) : ''}${subButton(key, on, 'Subscribe')}`,
      })}
      ${pageBody(twoColumn({
        main: `
          <article class="${CARD} tw:min-w-0 tw:px-6 tw:py-8 tw:md:px-12 tw:md:py-12">
            <div class="tw:border-b tw:border-comb-shade/70 tw:pb-6">
              ${personRow({ initials: dbArticle?.author?.initials || initialsOf(who.name), name: who.name, sub: `${who.sub}${dateLabel ? ` · ${dateLabel}` : ''}` })}
            </div>
            <div class="${MD_PROSE} tw:mt-8 tw:max-w-[70ch]" id="md-body">
              ${LOADING}
            </div>
          </article>`,
        side: `
          ${articleListPanel(s, articles, dbArticle ? `db:${dbArticle.id}` : `file:${slug}`)}
          ${attachmentsPanel(docs, canContribute, canManage)}`,
      }))}
    </div>`;

  if (dbArticle) {
    setTimeout(() => {
      const el = document.getElementById('md-body');
      if (el) { el.innerHTML = mdToHtml(dbArticle.body, docs); hydrateImages(el, signRepositoryImages); }
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
      openEditArticleModal(dbArticle, s.id, () => {
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
