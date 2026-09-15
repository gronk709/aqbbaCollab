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

const roleLabelFrom = (roles) => (roles && roles.length ? roles.join(' & ') : '—');

function threadCard(t) {
  const key = `thread:${t.id}`;
  const on = isSubscribed(key);
  const project = projectForThread(t.id);

  return `
    <a class="thread ${t.pinned ? 'thread-pinned' : ''}" href="#/forum/${t.id}">
      <div class="thread-top">
        <span class="tag tag-outline">${esc(t.category?.name || 'General')}</span>
        ${t.pinned ? `<span class="tag tag-amber">${icons.pin} Pinned</span>` : ''}
        ${on ? `<span class="tag tag-green">${icons.bellOn} Subscribed</span>` : ''}
        ${project ? `<span class="tag tag-blue">${icons.beaker} Became ${project.code}</span>` : ''}
      </div>
      <h3>${esc(t.title)}</h3>
      <p class="thread-excerpt">${esc(t.body.slice(0, 190))}</p>
      <div class="thread-foot">
        ${avatar(t.author)}
        <span><strong style="color:var(--propolis);font-weight:600">${esc(t.author.name)}</strong> · ${relDays(daysAgo(t.created_at))}</span>
        <span class="spacer"></span>
        <span class="mono">${t.replyCount} ${t.replyCount === 1 ? 'reply' : 'replies'}</span>
        <span class="mono">${t.watchers} watching</span>
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
      <div class="attach-links" data-links></div>
      <button type="button" class="btn btn-ghost btn-sm" data-add-link>${icons.link} Add a link</button>
    </div>
    <div class="field">
      <label>Documents</label>
      <input type="file" data-files multiple accept="${ATTACHMENT_ACCEPT}">
      <p class="caption" style="margin-top:6px">PDF, Word, text, spreadsheet or slide files — up to 20MB each.</p>
    </div>`;
}

function addLinkRow(list) {
  const row = document.createElement('div');
  row.className = 'attach-link-row';
  row.innerHTML = `
    <input type="url" placeholder="https://…" data-link-url>
    <input type="text" placeholder="Label (optional)" data-link-title>
    <button type="button" class="attach-remove" aria-label="Remove link">${icons.x}</button>`;
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

  const html = `
    <div class="topbar">
      <div style="width:100%">
        <div class="eyebrow">Member discussion</div>
        <h1>Forum</h1>
      </div>
      <div class="topbar-actions">
        <button class="btn btn-primary btn-sm" id="new-topic">${icons.plus} New topic</button>
      </div>
    </div>

    <div class="wrap view">
      <div class="grid grid-dash">
        <div class="panel">
          <div class="panel-head">
            <h2>All topics</h2>
            <span class="spacer"></span>
            <span class="caption mono">${threads.length}</span>
          </div>
          <div>${threads.length ? [...pinned, ...rest].map(threadCard).join('') : `
            <div class="empty" style="padding:var(--s6) 0">
              <h3>No topics yet</h3>
              <p>Be the first to start a discussion.</p>
            </div>`}</div>
        </div>

        <div class="stack">
          <div class="panel">
            <div class="panel-head"><h2>Categories</h2></div>
            <div class="panel-body panel-body-flush">
              ${categories.map((c) => {
                const n = threads.filter((t) => t.category?.id === c.id).length;
                return `
                  <div class="sub">
                    <div class="sub-title">
                      <strong>${esc(c.name)}</strong>
                      <span>${n} ${n === 1 ? 'topic' : 'topics'}</span>
                    </div>
                    ${subButton(`cat:${c.id}`, isSubscribed(`cat:${c.id}`), 'Notify')}
                  </div>`;
              }).join('')}
            </div>
          </div>

          <div class="panel">
            <div class="panel-head"><h2>Your notifications</h2></div>
            <div class="panel-body">
              <p style="font-size:13px;color:var(--propolis-60)">
                You are subscribed to ${subCount} ${subCount === 1 ? 'topic' : 'topics'}.
                New posts are emailed to <span class="mono" style="font-size:12px">${esc(currentUser().email || '')}</span>
                on file.
              </p>
              <div class="field" style="margin-top:var(--s4)">
                <label for="digest">Delivery</label>
                <select id="digest">
                  <option value="instant" ${state.digest === 'instant' ? 'selected' : ''}>Email each new post</option>
                  <option value="daily" ${state.digest === 'daily' ? 'selected' : ''}>Daily digest, 6am AEST</option>
                  <option value="weekly" ${state.digest === 'weekly' ? 'selected' : ''}>Weekly digest, Monday</option>
                </select>
              </div>
              <p class="caption">
                Subscribing to a category notifies you when any member opens a new topic in it.
              </p>
            </div>
          </div>
        </div>
      </div>
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
    <p class="caption" style="margin-bottom:var(--s5)">
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
  const attachmentChip = (a) => {
    const own = a.author_id === me.id;
    return `
      <span class="attach-chip">
        <button type="button" class="attach-chip-open" data-open-attachment="${a.id}">
          ${a.kind === 'url' ? icons.link : icons.attach}<span>${esc(a.filename)}</span>
        </button>
        ${own && a.kind === 'url' ? `<button type="button" class="attach-chip-btn" data-edit-attachment="${a.id}" aria-label="Edit link">${icons.pen}</button>` : ''}
        ${own || admin ? `<button type="button" class="attach-chip-btn" data-delete-attachment="${a.id}" aria-label="Remove attachment">${icons.x}</button>` : ''}
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
      <article class="post" id="post-${p.id}">
        ${avatar(p.author)}
        <div>
          <div class="post-who">
            <strong>${esc(p.author.name)}</strong>
            <span class="caption">${esc(roleLabelFrom(p.author.roles))}</span>
            <span class="spacer"></span>
            <span class="caption mono">${relDays(daysAgo(p.created_at))}</span>
            ${canDeleteHere ? `<button type="button" class="post-delete" data-delete-reply="${p.id}" aria-label="Delete reply">${icons.x}</button>` : ''}
          </div>
          <div class="post-body">${paras}</div>
          ${postAttachments.length ? `<div class="attach-inline">${postAttachments.map(attachmentChip).join('')}</div>` : ''}
          ${canAddHere ? `
            <div class="attach-manage" data-attach-manage="${p.id}" hidden>
              ${attachFieldsHTML()}
              <div class="row" style="justify-content:flex-end;gap:var(--s2)">
                <button type="button" class="btn btn-ghost btn-sm" data-cancel-add-attach="${p.id}">Cancel</button>
                <button type="button" class="btn btn-primary btn-sm" data-save-add-attach="${p.id}">Save</button>
              </div>
            </div>
            <button type="button" class="btn btn-ghost btn-sm attach-add-toggle" data-toggle-add-attach="${p.id}">${icons.plus} Add attachment</button>` : ''}
        </div>
      </article>`;
  }).join('');

  const attachmentSummaryHTML = attachments.length ? `
    <div class="panel">
      <div class="panel-head">
        <h2>Attachments</h2>
        <span class="spacer"></span>
        <span class="caption mono">${attachments.length}</span>
      </div>
      <div class="panel-body panel-body-flush">
        ${attachments.map((a) => `
          <div class="sub">
            <div class="sub-title">
              <strong>${esc(a.filename)}</strong>
              <span>${a.kind === 'url' ? 'Link' : (a.mime_type || 'Document')} · ${relDays(daysAgo(a.created_at))}</span>
            </div>
            <button type="button" class="sub-btn" data-jump-to="post-${a.post_id || 'op'}">${icons.chevron}<span>Jump to post</span></button>
          </div>`).join('')}
      </div>
    </div>` : '';

  const project = projectForThread(t.id);

  const html = `
    <div class="topbar">
      <div style="width:100%">
        <div class="crumb">
          <a href="#/forum">Forum</a> ${icons.chevron}
          <span>${esc(t.category?.name || 'General')}</span>
        </div>
        <h1 style="font-size:clamp(1.375rem,2.4vw,1.75rem);max-width:34ch">${esc(t.title)}</h1>
      </div>
      <div class="topbar-actions">
        ${subButton(key, on, 'Subscribe')}
      </div>
    </div>

    <div class="wrap view">
      <div class="grid grid-dash">
        <div class="panel">
          <div class="panel-body">
            ${postHTML}
          </div>

          <div id="reply-box" style="padding:var(--s5);border-top:1px solid var(--comb-shade);background:var(--comb)">
            <div class="field">
              <label for="reply">Add a reply</label>
              <textarea id="reply" placeholder="Reply to ${esc(t.author.name.split(' ')[0])}."></textarea>
            </div>
            ${attachFieldsHTML()}
            <div class="row">
              <p class="caption" style="flex:1">
                Replies are emailed to everyone watching. Posting subscribes you to the topic.
              </p>
              <button class="btn btn-primary btn-sm" id="post-reply">Post reply</button>
            </div>
          </div>
        </div>

        <div class="stack">
          <div class="panel">
            <div class="panel-head"><h2>Topic</h2></div>
            <div class="panel-body">
              <div class="row" style="gap:var(--s3)">
                ${avatar(t.author)}
                <div>
                  <div style="font-size:13.5px;font-weight:600">${esc(t.author.name)}</div>
                  <div class="caption">Opened ${relDays(daysAgo(t.created_at))}</div>
                </div>
              </div>
              <div class="row" style="justify-content:space-between;margin-top:var(--s5);padding-top:var(--s4);border-top:1px solid var(--comb-shade)">
                <span style="font-size:13px">Replies</span>
                <span class="mono" style="font-size:13px">${posts.length}</span>
              </div>
              <div class="row" style="justify-content:space-between;margin-top:var(--s2)">
                <span style="font-size:13px">Watching</span>
                <span class="mono" style="font-size:13px">${watchers}</span>
              </div>
            </div>
          </div>

          ${attachmentSummaryHTML}

          ${project ? `
            <div class="panel">
              <div class="panel-head"><h2>Became a project</h2></div>
              <div class="panel-body">
                <p class="caption" style="margin-bottom:var(--s3)">
                  This discussion turned into a coordinated research project.
                </p>
                <a class="thread" style="border:1px solid var(--comb-shade);border-radius:3px;padding:var(--s3)" href="#/projects/${project.id}">
                  <div class="row" style="gap:6px;margin-bottom:4px">
                    <span class="tag tag-outline">${project.code}</span>
                  </div>
                  <h3 style="font-size:13.5px">${esc(project.title)}</h3>
                  <p class="caption" style="margin-top:4px">View the project ${icons.chevron}</p>
                </a>
              </div>
            </div>` : ''}
        </div>
      </div>
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
