/* ==========================================================================
   Forum. Members create topics, subscribe, and are notified by email when
   new posts land. The email step is shown on screen in this prototype.

   Phase 3 of the backend migration (see the plan doc): threads, posts, and
   subscriptions are real Supabase rows now. js/app.js's router loads this
   page's data (loadForumThreads / loadThread in js/store.js) before calling
   the render functions below, which stay plain and synchronous — they just
   take that data as a parameter instead of importing mock arrays.
   ========================================================================== */

import { relDays, projectForThread } from '../data.js';
import {
  isSubscribed, addThread, addPost, deleteForumPost, state, currentUser, isWebAdmin,
  openForumAttachment, addForumAttachments, updateForumAttachment, deleteForumAttachment,
  ATTACHMENT_MAX_BYTES, ATTACHMENT_ACCEPT,
} from '../store.js';
import { esc, icons, avatar, subButton, modal, closeModal, toast } from '../ui.js';
import {
  button, pageHeader, pageBody, twoColumn, card, countBadge, rowList, tag, emptyState,
  personRow, CARD,
} from '../components.js';

const roleLabelFrom = (roles) => (roles && roles.length ? roles.join(' & ') : '—');

/* A tag that carries an icon: components.js's tag() escapes its text, so
   markup with an icon in it gets its own small helper. Same pill, same tones. */
const ICON_TAG_TONES = {
  amber: 'tw:bg-amber-wash tw:text-amber-deep',
  green: 'tw:bg-mark-green/15 tw:text-[#375B3A]',
  blue: 'tw:bg-mark-blue/15 tw:text-[#274865]',
};
const iconTag = (icon, text, tone) => `
  <span class="tw:inline-flex tw:items-center tw:gap-1.5 tw:whitespace-nowrap tw:rounded-full tw:px-2.5 tw:py-1 tw:font-mono tw:text-[10.5px] tw:font-medium tw:uppercase tw:tracking-[0.06em] tw:[&_svg]:size-3 ${ICON_TAG_TONES[tone]}">${icon} ${esc(text)}</span>`;

function threadCard(t) {
  const key = `thread:${t.id}`;
  const on = isSubscribed(key);
  const project = projectForThread(t.id);

  return `
    <a class="tw:block tw:px-6 tw:py-5 tw:transition-colors tw:hover:bg-comb/60 ${t.pinned ? 'tw:shadow-[inset_3px_0_0_var(--amber)]' : ''}" href="#/forum/${t.id}">
      <div class="tw:mb-2 tw:flex tw:flex-wrap tw:items-center tw:gap-2">
        ${tag(t.category?.name || 'General', 'outline')}
        ${t.pinned ? iconTag(icons.pin, 'Pinned', 'amber') : ''}
        ${on ? iconTag(icons.bellOn, 'Subscribed', 'green') : ''}
        ${project ? iconTag(icons.beaker, `Became ${project.code}`, 'blue') : ''}
      </div>
      <h3 class="tw:font-display tw:text-xl tw:font-medium tw:leading-snug tw:text-propolis">${esc(t.title)}</h3>
      <p class="tw:mt-1.5 tw:line-clamp-2 tw:text-[15px] tw:leading-relaxed tw:text-propolis-60">${esc(t.body.slice(0, 190))}</p>
      <div class="tw:mt-4 tw:flex tw:flex-wrap tw:items-center tw:gap-x-4 tw:gap-y-2 tw:text-sm tw:text-propolis-40">
        ${avatar(t.author)}
        <span><strong class="tw:font-semibold tw:text-propolis">${esc(t.author.name)}</strong> · ${relDays(daysAgo(t.created_at))}</span>
        <span class="tw:ml-auto tw:flex tw:flex-wrap tw:gap-x-4 tw:font-mono tw:text-xs">
          <span>${t.replyCount} ${t.replyCount === 1 ? 'reply' : 'replies'}</span>
          <span>${t.watchers} watching</span>
        </span>
      </div>
    </a>`;
}

/* --- attachments: shared between the new-topic composer and the reply
   box below a thread. Links are plain input rows read at submit time;
   files are whatever the native multi-file input holds — no separate JS
   tracking needed for either, so "remove" for files is just "reopen the
   picker and choose again". --------------------------------------------- */

function attachFieldsHTML() {
  return `
    <div class="field">
      <label>Links</label>
      <div data-links></div>
      <button type="button" class="btn btn-ghost btn-sm" data-add-link>${icons.link} Add a link</button>
    </div>
    <div class="field">
      <label>Documents</label>
      <input type="file" data-files multiple accept="${ATTACHMENT_ACCEPT}">
      <p class="tw:mt-1.5 tw:text-[13px] tw:text-propolis-40">Supported formats: PDF, Word, Spreadsheet, Slides, Text (Max 20MB)</p>
    </div>`;
}

function addLinkRow(list) {
  const row = document.createElement('div');
  row.className = 'tw:mb-2 tw:flex tw:items-center tw:gap-2';
  row.innerHTML = `
    <input type="url" placeholder="https://…" data-link-url class="tw:min-w-0 tw:flex-1">
    <input type="text" placeholder="Label (optional)" data-link-title class="tw:min-w-0 tw:flex-1">
    <button type="button" class="attach-remove tw:grid tw:size-9 tw:shrink-0 tw:place-items-center tw:rounded-lg tw:border tw:border-comb-shade tw:bg-white tw:text-propolis-40 tw:transition tw:hover:border-propolis-40 tw:hover:text-propolis tw:[&_svg]:size-3.5" aria-label="Remove link">${icons.x}</button>`;
  row.querySelector('.attach-remove').addEventListener('click', () => row.remove());
  list.appendChild(row);
}

function bindAttachFields(container) {
  const list = container.querySelector('[data-links]');
  container.querySelector('[data-add-link]').addEventListener('click', () => addLinkRow(list));
}

function collectLinks(container) {
  const urls = [...container.querySelectorAll('[data-link-url]')];
  const titles = [...container.querySelectorAll('[data-link-title]')];
  return urls.map((input, i) => {
    const url = input.value.trim();
    if (!url) return null;
    const title = titles[i].value.trim();
    return { url: /^https?:\/\//i.test(url) ? url : `https://${url}`, title };
  }).filter(Boolean);
}

function collectFiles(container) {
  const input = container.querySelector('[data-files]');
  return input && input.files ? [...input.files] : [];
}

/* Returns the offending file's name if anything is over the limit — the
   caller checks this before the actual publish/post call, so a too-big
   file fails fast with a clear message instead of an upload error deep
   inside saveAttachments. */
function oversizeFile(files) {
  return files.find((f) => f.size > ATTACHMENT_MAX_BYTES)?.name;
}

/* Only a link's url/label is ever edited in place — a file's own bytes
   aren't (see updateForumAttachment in store.js), so this is the only
   "edit" affordance an attachment chip gets. */
function openEditAttachmentModal(a, onSaved) {
  const body = `
    <div class="field">
      <label for="edit-url">URL</label>
      <input id="edit-url" type="url" value="${esc(a.url)}">
    </div>
    <div class="field">
      <label for="edit-title">Label</label>
      <input id="edit-title" type="text" value="${esc(a.filename)}">
    </div>`;
  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-primary" id="save-edit-attach">Save</button>`;
  const scrim = modal({ title: 'Edit link', body, actions });

  scrim.querySelector('#save-edit-attach').addEventListener('click', async () => {
    const url = scrim.querySelector('#edit-url').value.trim();
    const title = scrim.querySelector('#edit-title').value.trim();
    if (!url) { toast('A link needs a URL.'); return; }
    try {
      await updateForumAttachment(a, { url: /^https?:\/\//i.test(url) ? url : `https://${url}`, title });
    } catch (err) {
      toast(`Couldn't update the link: ${err.message}`);
      return;
    }
    closeModal();
    toast('Link updated.');
    onSaved();
  });
}

/* A reply, unlike the topic itself, was never frozen — its author (or
   Web Admin) can remove it outright, so this asks for actual
   confirmation first, unlike an attachment chip's immediate remove. */
function openDeleteReplyModal(post, onDeleted) {
  const body = `<p>Delete this reply? This can't be undone, and removes any attachments on it too.</p>`;
  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-danger" id="confirm-delete-reply">Delete reply</button>`;
  const scrim = modal({ title: 'Delete reply', body, actions });

  scrim.querySelector('#confirm-delete-reply').addEventListener('click', async (e) => {
    e.target.disabled = true;
    e.target.textContent = 'Deleting…';
    try {
      await deleteForumPost(post);
    } catch (err) {
      toast(`Couldn't delete that reply: ${err.message}`);
      e.target.disabled = false;
      e.target.textContent = 'Delete reply';
      return;
    }
    closeModal();
    toast('Reply deleted.');
    onDeleted();
  });
}

/* created_at is a real Postgres timestamp now, not the old seed data's
   day-offset-from-today number relDays expects. */
function daysAgo(isoTimestamp) {
  const then = new Date(isoTimestamp);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  then.setHours(0, 0, 0, 0);
  return Math.round((then - today) / 86400000);
}

export function renderForum(data) {
  const { categories, threads } = data;
  const pinned = threads.filter((t) => t.pinned);
  const rest = threads.filter((t) => !t.pinned);
  const subCount = state.subs.filter((s) => s.startsWith('thread:')).length;

  const topics = threads.length
    ? rowList([...pinned, ...rest].map(threadCard))
    : emptyState({ title: 'No topics yet', text: 'Be the first to start a discussion.', bordered: false });

  const categoryRows = categories.map((c) => {
    const n = threads.filter((t) => t.category?.id === c.id).length;
    return `
      <div class="tw:flex tw:items-center tw:gap-3 tw:px-6 tw:py-3.5">
        <div class="tw:min-w-0 tw:flex-1">
          <strong class="tw:block tw:text-[15px] tw:font-semibold tw:text-propolis">${esc(c.name)}</strong>
          <span class="tw:text-sm tw:text-propolis-60">${n} ${n === 1 ? 'topic' : 'topics'}</span>
        </div>
        ${subButton(`cat:${c.id}`, isSubscribed(`cat:${c.id}`), 'Notify')}
      </div>`;
  });

  const html = `
    <div class="view">
      ${pageHeader({
        eyebrow: 'Member discussion',
        title: 'Forum',
        actions: button({ id: 'new-topic', label: 'New topic', icon: icons.plus, size: 'sm' }),
      })}
      ${pageBody(twoColumn({
        main: card({ title: 'All topics', right: countBadge(threads.length), flush: true, body: topics }),
        side: `
          ${card({ title: 'Categories', flush: true, body: rowList(categoryRows) })}
          ${card({
            title: 'Your notifications',
            body: `
              <p class="tw:text-sm tw:leading-relaxed tw:text-propolis-60">
                You are subscribed to ${subCount} ${subCount === 1 ? 'topic' : 'topics'}.
                New posts are emailed to <span class="tw:font-mono tw:text-xs">${esc(currentUser().email || '')}</span>
                on file.
              </p>
              <div class="field tw:mt-4">
                <label for="digest">Delivery</label>
                <select id="digest">
                  <option value="instant" ${state.digest === 'instant' ? 'selected' : ''}>Email each new post</option>
                  <option value="daily" ${state.digest === 'daily' ? 'selected' : ''}>Daily digest, 6am AEST</option>
                  <option value="weekly" ${state.digest === 'weekly' ? 'selected' : ''}>Weekly digest, Monday</option>
                </select>
              </div>
              <p class="tw:text-[13px] tw:leading-relaxed tw:text-propolis-40">
                Subscribing to a category notifies you when any member opens a new topic in it.
              </p>`,
          })}`,
      }))}
    </div>`;

  setTimeout(() => bindForum(categories), 0);
  return html;
}

function bindForum(categories) {
  const btn = document.getElementById('new-topic');
  if (btn) btn.addEventListener('click', () => openComposer(categories));

  const digest = document.getElementById('digest');
  if (digest) digest.addEventListener('change', (e) => {
    state.digest = e.target.value;
    const label = { instant: 'each new post', daily: 'a daily digest', weekly: 'a weekly digest' }[state.digest];
    toast(`Delivery set to ${label}.`);
  });
}

function openComposer(categories) {
  const body = `
    <p class="tw:mb-5 tw:text-[13px] tw:text-propolis-40">
      Subscribers to the category you choose are notified as soon as you publish.
    </p>
    <form id="topic-form">
      <div class="field">
        <label for="t-title">Topic title</label>
        <input id="t-title" required placeholder="What are you trying to work out?">
      </div>
      <div class="field">
        <label for="t-cat">Category</label>
        <select id="t-cat">
          ${categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="t-body">First post</label>
        <textarea id="t-body" required placeholder="Give enough detail that someone can answer without asking three follow-up questions."></textarea>
      </div>
      ${attachFieldsHTML()}
    </form>`;

  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-primary" id="publish">Publish topic</button>`;

  const scrim = modal({ title: 'New topic', body, actions });
  bindAttachFields(scrim);
  const publishBtn = scrim.querySelector('#publish');

  publishBtn.addEventListener('click', async () => {
    const title = scrim.querySelector('#t-title').value.trim();
    const categoryId = scrim.querySelector('#t-cat').value;
    const text = scrim.querySelector('#t-body').value.trim();

    if (!title || !text) {
      toast('Add a title and a first post before publishing.');
      return;
    }
    const links = collectLinks(scrim);
    const files = collectFiles(scrim);
    const tooBig = oversizeFile(files);
    if (tooBig) {
      toast(`${tooBig} is over the 20MB limit — remove it before publishing.`);
      return;
    }

    publishBtn.disabled = true;
    publishBtn.textContent = 'Publishing…';
    let t;
    try {
      t = await addThread({ title, categoryId, body: text, links, files });
    } catch (err) {
      toast(`Couldn't publish the topic: ${err.message}`);
      publishBtn.disabled = false;
      publishBtn.textContent = 'Publish topic';
      return;
    }

    closeModal();
    const catName = categories.find((c) => c.id === categoryId)?.name || 'the category';
    toast(`Published to ${catName}.`);
    window.__aqbba_invalidateData();
    location.hash = `#/forum/${t.id}`;
  });
}

/* --- single thread -------------------------------------------------------- */

export function renderThread(data) {
  const { thread: t, posts, watchers, attachments } = data;
  const key = `thread:${t.id}`;
  const on = isSubscribed(key);
  const me = currentUser();
  const admin = isWebAdmin(me.id);

  const allPosts = [{ id: 'op', author: t.author, created_at: t.created_at, body: t.body }, ...posts];

  const attachmentsById = Object.fromEntries(attachments.map((a) => [a.id, a]));
  const postsById = Object.fromEntries(allPosts.map((p) => [p.id, p]));
  const attachmentsByPost = {};
  attachments.forEach((a) => {
    const k = a.post_id || 'op';
    (attachmentsByPost[k] ||= []).push(a);
  });

  /* A link's url/label stays editable by whoever added it; any attachment
     stays deletable by whoever added it, or by a Web Admin moderating —
     same author-or-admin shape as every other member-authored row here.
     The post/topic it hangs off of is a different story (see the
     permissions migration's header comment): frozen once published,
     which is exactly why attachment upkeep doesn't route through editing
     the post at all. */
  const CHIP_BUTTON = 'tw:grid tw:w-8 tw:shrink-0 tw:place-items-center tw:border-l tw:border-comb-shade tw:text-propolis-40 tw:transition tw:hover:bg-comb tw:hover:text-propolis tw:[&_svg]:size-3';
  const attachmentChip = (a) => {
    const own = a.author_id === me.id;
    return `
      <span class="tw:inline-flex tw:max-w-full tw:items-stretch tw:overflow-hidden tw:rounded-full tw:border tw:border-comb-shade tw:bg-white tw:transition tw:hover:border-amber">
        <button type="button" class="tw:inline-flex tw:min-w-0 tw:items-center tw:gap-1.5 tw:py-1.5 tw:pr-3 tw:pl-3.5 tw:text-[13px] tw:font-medium tw:text-propolis-60 tw:transition tw:hover:text-amber-deep tw:[&_svg]:size-3.5 tw:[&_svg]:shrink-0" data-open-attachment="${a.id}">
          ${a.kind === 'url' ? icons.link : icons.attach}<span class="tw:truncate">${esc(a.filename)}</span>
        </button>
        ${own && a.kind === 'url' ? `<button type="button" class="${CHIP_BUTTON}" data-edit-attachment="${a.id}" aria-label="Edit link">${icons.pen}</button>` : ''}
        ${own || admin ? `<button type="button" class="${CHIP_BUTTON}" data-delete-attachment="${a.id}" aria-label="Remove attachment">${icons.x}</button>` : ''}
      </span>`;
  };

  const postHTML = allPosts.map((p) => {
    const paras = p.body.split('\n\n').map((x) => `<p>${esc(x)}</p>`).join('');
    const postAttachments = attachmentsByPost[p.id] || [];
    const canAddHere = p.author.id === me.id;
    /* The opening post is the topic itself — frozen, not deletable here.
       A reply was never frozen, so its author (or Web Admin) can remove
       it outright. */
    const canDeleteHere = p.id !== 'op' && (p.author.id === me.id || admin);
    return `
      <article class="tw:grid tw:grid-cols-[2rem_minmax(0,1fr)] tw:gap-4 tw:px-6 tw:py-6" id="post-${p.id}">
        ${avatar(p.author)}
        <div class="tw:min-w-0">
          <div class="tw:mb-2 tw:flex tw:flex-wrap tw:items-center tw:gap-x-3 tw:gap-y-0.5">
            <strong class="tw:text-[15px] tw:font-semibold tw:text-propolis">${esc(p.author.name)}</strong>
            <span class="tw:text-sm tw:text-propolis-40">${esc(roleLabelFrom(p.author.roles))}</span>
            <span class="tw:ml-auto tw:font-mono tw:text-xs tw:text-propolis-40">${relDays(daysAgo(p.created_at))}</span>
            ${canDeleteHere ? `<button type="button" class="tw:grid tw:size-6 tw:shrink-0 tw:place-items-center tw:rounded-md tw:text-propolis-40 tw:transition tw:hover:bg-mark-red/10 tw:hover:text-mark-red tw:[&_svg]:size-3" data-delete-reply="${p.id}" aria-label="Delete reply">${icons.x}</button>` : ''}
          </div>
          <div class="tw:space-y-4 tw:font-display tw:text-[17px] tw:leading-relaxed tw:text-propolis tw:[overflow-wrap:anywhere]">${paras}</div>
          ${postAttachments.length ? `<div class="tw:mt-4 tw:flex tw:flex-wrap tw:gap-2">${postAttachments.map(attachmentChip).join('')}</div>` : ''}
          ${canAddHere ? `
            <div class="tw:mt-4 tw:rounded-xl tw:border tw:border-comb-shade tw:bg-comb/60 tw:p-4" data-attach-manage="${p.id}" hidden>
              ${attachFieldsHTML()}
              <div class="tw:flex tw:justify-end tw:gap-2">
                <button type="button" class="btn btn-ghost btn-sm" data-cancel-add-attach="${p.id}">Cancel</button>
                <button type="button" class="btn btn-primary btn-sm" data-save-add-attach="${p.id}">Save</button>
              </div>
            </div>
            <button type="button" class="tw:mt-4 tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-full tw:border tw:border-dashed tw:border-amber/60 tw:px-3.5 tw:py-1.5 tw:text-sm tw:font-medium tw:text-amber-deep tw:transition tw:hover:border-amber tw:hover:bg-amber-wash tw:[&[hidden]]:hidden" data-toggle-add-attach="${p.id}">${icons.plus} Add attachment</button>` : ''}
        </div>
      </article>`;
  }).join('');

  const attachmentSummaryHTML = attachments.length ? card({
    title: 'Attachments',
    right: countBadge(attachments.length),
    flush: true,
    body: rowList(attachments.map((a) => `
      <div class="tw:flex tw:items-center tw:gap-3 tw:px-6 tw:py-3.5">
        <div class="tw:min-w-0 tw:flex-1">
          <strong class="tw:line-clamp-2 tw:text-[15px] tw:font-semibold tw:leading-snug tw:text-propolis tw:[overflow-wrap:anywhere]">${esc(a.filename)}</strong>
          <span class="tw:block tw:truncate tw:text-sm tw:text-propolis-60">${a.kind === 'url' ? 'Link' : (a.mime_type || 'Document')} · ${relDays(daysAgo(a.created_at))}</span>
        </div>
        <button type="button" class="tw:inline-flex tw:shrink-0 tw:items-center tw:gap-1.5 tw:rounded-full tw:border tw:border-comb-shade tw:bg-white tw:px-3 tw:py-1.5 tw:font-mono tw:text-[10.5px] tw:font-medium tw:uppercase tw:tracking-[0.08em] tw:text-propolis-60 tw:transition tw:hover:border-amber tw:hover:text-amber-deep tw:[&_svg]:size-3" data-jump-to="post-${a.post_id || 'op'}">${icons.chevron}<span>Jump to post</span></button>
      </div>`)),
  }) : '';

  const project = projectForThread(t.id);

  const html = `
    <div class="view">
      ${pageHeader({
        crumbs: [{ label: 'Forum', href: '#/forum' }, { label: t.category?.name || 'General' }],
        title: t.title,
        compact: true,
        actions: subButton(key, on, 'Subscribe'),
      })}
      ${pageBody(twoColumn({
        main: `
          <section class="${CARD} tw:min-w-0 tw:overflow-hidden">
            <div class="tw:divide-y tw:divide-comb-shade/70">
              ${postHTML}
            </div>

            <div id="reply-box" class="tw:border-t tw:border-comb-shade tw:bg-comb/60 tw:p-6">
              <div class="field">
                <label for="reply">Add a reply</label>
                <textarea id="reply" placeholder="Reply to ${esc(t.author.name.split(' ')[0])}."></textarea>
              </div>
              ${attachFieldsHTML()}
              <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-x-4 tw:gap-y-3">
                <p class="tw:min-w-52 tw:flex-1 tw:text-[13px] tw:leading-relaxed tw:text-propolis-40">
                  Replies are emailed to everyone watching. Posting subscribes you to the topic.
                </p>
                ${button({ id: 'post-reply', label: 'Post reply', size: 'sm' })}
              </div>
            </div>
          </section>`,
        side: `
          ${card({
            title: 'Topic',
            body: `
              ${personRow({ initials: t.author.initials, name: t.author.name, sub: `Opened ${relDays(daysAgo(t.created_at))}` })}
              <div class="tw:mt-5 tw:flex tw:items-center tw:justify-between tw:border-t tw:border-comb-shade/70 tw:pt-4 tw:text-sm tw:text-propolis-60">
                <span>Replies</span>
                <span class="tw:font-mono tw:text-propolis">${posts.length}</span>
              </div>
              <div class="tw:mt-2 tw:flex tw:items-center tw:justify-between tw:text-sm tw:text-propolis-60">
                <span>Watching</span>
                <span class="tw:font-mono tw:text-propolis">${watchers}</span>
              </div>`,
          })}
          ${attachmentSummaryHTML}
          ${project ? card({
            title: 'Became a project',
            body: `
              <p class="tw:mb-4 tw:text-sm tw:leading-relaxed tw:text-propolis-60">
                This discussion turned into a coordinated research project.
              </p>
              <a class="tw:block tw:rounded-xl tw:border tw:border-comb-shade tw:p-4 tw:transition tw:hover:border-amber tw:hover:bg-comb/60" href="#/projects/${project.id}">
                ${tag(project.code, 'outline')}
                <h3 class="tw:mt-2 tw:font-display tw:text-lg tw:font-medium tw:leading-snug tw:text-propolis">${esc(project.title)}</h3>
                <p class="tw:mt-2 tw:inline-flex tw:items-center tw:gap-1 tw:text-sm tw:font-medium tw:text-amber-deep">View the project ${icons.chevron}</p>
              </a>`,
          }) : ''}`,
      }))}
    </div>`;

  setTimeout(() => {
    const replyBox = document.getElementById('reply-box');
    if (replyBox) bindAttachFields(replyBox);

    document.querySelectorAll('[data-jump-to]').forEach((el) => {
      el.addEventListener('click', () => {
        const target = document.getElementById(el.dataset.jumpTo);
        if (!target) return;
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        target.classList.add('flash');
        setTimeout(() => target.classList.remove('flash'), 1600);
      });
    });

    document.querySelectorAll('[data-open-attachment]').forEach((el) => {
      el.addEventListener('click', async () => {
        try {
          await openForumAttachment(attachmentsById[el.dataset.openAttachment]);
        } catch (err) {
          toast(`Couldn't open that attachment: ${err.message}`);
        }
      });
    });

    document.querySelectorAll('[data-edit-attachment]').forEach((el) => {
      el.addEventListener('click', () => {
        openEditAttachmentModal(attachmentsById[el.dataset.editAttachment], () => {
          window.__aqbba_invalidateData();
          window.__aqbba_render();
        });
      });
    });

    document.querySelectorAll('[data-delete-reply]').forEach((el) => {
      el.addEventListener('click', () => {
        openDeleteReplyModal(postsById[el.dataset.deleteReply], () => {
          window.__aqbba_invalidateData();
          window.__aqbba_render();
        });
      });
    });

    document.querySelectorAll('[data-delete-attachment]').forEach((el) => {
      el.addEventListener('click', async () => {
        const a = attachmentsById[el.dataset.deleteAttachment];
        el.disabled = true;
        try {
          await deleteForumAttachment(a);
        } catch (err) {
          toast(`Couldn't remove that attachment: ${err.message}`);
          el.disabled = false;
          return;
        }
        toast('Attachment removed.');
        window.__aqbba_invalidateData();
        window.__aqbba_render();
      });
    });

    document.querySelectorAll('[data-toggle-add-attach]').forEach((toggleBtn) => {
      toggleBtn.addEventListener('click', () => {
        const postId = toggleBtn.dataset.toggleAddAttach;
        const box = document.querySelector(`[data-attach-manage="${postId}"]`);
        if (!box) return;
        if (!box.dataset.bound) { bindAttachFields(box); box.dataset.bound = '1'; }
        box.hidden = false;
        toggleBtn.hidden = true;
      });
    });

    document.querySelectorAll('[data-cancel-add-attach]').forEach((cancelBtn) => {
      cancelBtn.addEventListener('click', () => {
        const postId = cancelBtn.dataset.cancelAddAttach;
        const box = document.querySelector(`[data-attach-manage="${postId}"]`);
        const toggleBtn = document.querySelector(`[data-toggle-add-attach="${postId}"]`);
        if (box) box.hidden = true;
        if (toggleBtn) toggleBtn.hidden = false;
      });
    });

    document.querySelectorAll('[data-save-add-attach]').forEach((saveBtn) => {
      saveBtn.addEventListener('click', async () => {
        const postId = saveBtn.dataset.saveAddAttach;
        const box = document.querySelector(`[data-attach-manage="${postId}"]`);
        const links = collectLinks(box);
        const files = collectFiles(box);
        if (!links.length && !files.length) { toast('Add a link or a file first.'); return; }
        const tooBig = oversizeFile(files);
        if (tooBig) { toast(`${tooBig} is over the 20MB limit.`); return; }
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';
        try {
          await addForumAttachments(t.id, postId === 'op' ? null : postId, currentUser().id, links, files);
        } catch (err) {
          toast(`Couldn't add that attachment: ${err.message}`);
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save';
          return;
        }
        toast('Attachment added.');
        window.__aqbba_invalidateData();
        window.__aqbba_render();
      });
    });

    const btn = document.getElementById('post-reply');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const box = document.getElementById('reply');
      const text = box.value.trim();
      if (!text) { toast('Write something before posting.'); return; }
      const links = collectLinks(replyBox);
      const files = collectFiles(replyBox);
      const tooBig = oversizeFile(files);
      if (tooBig) { toast(`${tooBig} is over the 20MB limit — remove it before posting.`); return; }
      btn.disabled = true;
      btn.textContent = 'Posting…';
      try {
        await addPost(t.id, text, links, files);
      } catch (err) {
        toast(`Couldn't post the reply: ${err.message}`);
        btn.disabled = false;
        btn.textContent = 'Post reply';
        return;
      }
      toast('Reply posted.');
      window.__aqbba_invalidateData();
      window.__aqbba_render();
    });
  }, 0);

  return html;
}
