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
  isSubscribed, addThread, addPost, state, currentUser,
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
    </form>`;

  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-primary" id="publish">Publish topic</button>`;

  const scrim = modal({ title: 'New topic', body, actions });
  const publishBtn = scrim.querySelector('#publish');

  publishBtn.addEventListener('click', async () => {
    const title = scrim.querySelector('#t-title').value.trim();
    const categoryId = scrim.querySelector('#t-cat').value;
    const text = scrim.querySelector('#t-body').value.trim();

    if (!title || !text) {
      toast('Add a title and a first post before publishing.');
      return;
    }

    publishBtn.disabled = true;
    publishBtn.textContent = 'Publishing…';
    let t;
    try {
      t = await addThread({ title, categoryId, body: text });
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
  const { thread: t, posts, watchers } = data;
  const key = `thread:${t.id}`;
  const on = isSubscribed(key);

  const allPosts = [{ author: t.author, created_at: t.created_at, body: t.body }, ...posts];

  const postHTML = allPosts.map((p) => {
    const paras = p.body.split('\n\n').map((x) => `<p>${esc(x)}</p>`).join('');
    return `
      <article class="post">
        ${avatar(p.author)}
        <div>
          <div class="post-who">
            <strong>${esc(p.author.name)}</strong>
            <span class="caption">${esc(roleLabelFrom(p.author.roles))}</span>
            <span class="spacer"></span>
            <span class="caption mono">${relDays(daysAgo(p.created_at))}</span>
          </div>
          <div class="post-body">${paras}</div>
        </div>
      </article>`;
  }).join('');

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

          <div style="padding:var(--s5);border-top:1px solid var(--comb-shade);background:var(--comb)">
            <div class="field">
              <label for="reply">Add a reply</label>
              <textarea id="reply" placeholder="Reply to ${esc(t.author.name.split(' ')[0])}."></textarea>
            </div>
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
    const btn = document.getElementById('post-reply');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const box = document.getElementById('reply');
      const text = box.value.trim();
      if (!text) { toast('Write something before posting.'); return; }
      btn.disabled = true;
      btn.textContent = 'Posting…';
      try {
        await addPost(t.id, text);
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
