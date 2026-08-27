/* ==========================================================================
   Forum. Members create topics, subscribe, and are notified by email when
   new posts land. The email step is shown on screen in this prototype.
   ========================================================================== */

import {
  threads, threadById, forumCategories, categoryName,
  members, relDays, relHours, projectForThread,
} from '../data.js';
import {
  isSubscribed, addThread, addPost, postsFor, memberThreads, state, roleLabel,
  memberById, currentUser,
} from '../store.js';
import { esc, icons, avatar, subButton, modal, closeModal, toast } from '../ui.js';

/* Member-authored threads sit alongside the seeded ones. */
function allThreads() {
  const mine = memberThreads().map((t) => ({
    ...t,
    excerpt: t.body.slice(0, 190),
    posts: [{ by: t.author, at: 0, body: t.body }],
  }));
  return [...mine, ...threads];
}

function threadCard(t) {
  const author = memberById(t.author);
  const key = `thread:${t.id}`;
  const on = isSubscribed(key);
  const replyCount = t.replies + postsFor(t.id).length;
  const project = projectForThread(t.id);

  return `
    <a class="thread ${t.pinned ? 'thread-pinned' : ''}" href="#/forum/${t.id}">
      <div class="thread-top">
        <span class="tag tag-outline">${esc(categoryName(t.category) || t.categoryName || 'General')}</span>
        ${t.pinned ? `<span class="tag tag-amber">${icons.pin} Pinned</span>` : ''}
        ${on ? `<span class="tag tag-green">${icons.bellOn} Subscribed</span>` : ''}
        ${project ? `<span class="tag tag-blue">${icons.beaker} Became ${project.code}</span>` : ''}
      </div>
      <h3>${esc(t.title)}</h3>
      <p class="thread-excerpt">${esc(t.excerpt)}</p>
      <div class="thread-foot">
        ${avatar(author)}
        <span><strong style="color:var(--propolis);font-weight:600">${esc(author.name)}</strong> · ${relDays(t.created)}</span>
        <span class="spacer"></span>
        <span class="mono">${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}</span>
        <span class="mono">${t.watchers} watching</span>
      </div>
    </a>`;
}

export function renderForum() {
  const list = allThreads();
  const pinned = list.filter((t) => t.pinned);
  const rest = list.filter((t) => !t.pinned);
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
            <span class="caption mono">${list.length}</span>
          </div>
          <div>${[...pinned, ...rest].map(threadCard).join('')}</div>
        </div>

        <div class="stack">
          <div class="panel">
            <div class="panel-head"><h2>Categories</h2></div>
            <div class="panel-body panel-body-flush">
              ${forumCategories.map((c) => {
                const n = list.filter((t) => t.category === c.id).length;
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
                New posts are emailed to <span class="mono" style="font-size:12px">${esc(currentUser().wa)}</span>
                on file with Wild Apricot.
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

  setTimeout(bindForum, 0);
  return html;
}

function bindForum() {
  const btn = document.getElementById('new-topic');
  if (btn) btn.addEventListener('click', openComposer);

  const digest = document.getElementById('digest');
  if (digest) digest.addEventListener('change', (e) => {
    state.digest = e.target.value;
    const label = { instant: 'each new post', daily: 'a daily digest', weekly: 'a weekly digest' }[state.digest];
    toast(`Delivery set to ${label}.`);
  });
}

function openComposer() {
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
          ${forumCategories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
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

  scrim.querySelector('#publish').addEventListener('click', () => {
    const title = scrim.querySelector('#t-title').value.trim();
    const cat = scrim.querySelector('#t-cat').value;
    const text = scrim.querySelector('#t-body').value.trim();

    if (!title || !text) {
      toast('Add a title and a first post before publishing.');
      return;
    }

    const catName = categoryName(cat);
    const t = addThread({ title, category: cat, categoryName: catName, body: text });
    closeModal();

    /* How many members would this actually email? */
    const notified = 3 + Math.floor(Math.random() * 9);
    toast(`Published to ${catName}. ${notified} subscribers notified by email.`);
    location.hash = `#/forum/${t.id}`;
  });
}

/* --- single thread -------------------------------------------------------- */

export function renderThread(id) {
  const t = allThreads().find((x) => x.id === id);
  if (!t) return '';

  const key = `thread:${t.id}`;
  const on = isSubscribed(key);
  const author = memberById(t.author);
  const posts = [...t.posts, ...postsFor(t.id)];

  const postHTML = posts.map((p) => {
    const who = memberById(p.by);
    const paras = p.body.split('\n\n').map((x) => `<p>${esc(x)}</p>`).join('');
    return `
      <article class="post">
        ${avatar(who)}
        <div>
          <div class="post-who">
            <strong>${esc(who.name)}</strong>
            <span class="caption">${esc(roleLabel(who.id))}</span>
            <span class="spacer"></span>
            <span class="caption mono">${p.at === 0 ? 'just now' : relDays(p.at)}</span>
          </div>
          <div class="post-body">${paras}</div>
        </div>
      </article>`;
  }).join('');

  const watchers = members.slice(0, Math.min(6, t.watchers));
  const project = projectForThread(t.id);

  const html = `
    <div class="topbar">
      <div style="width:100%">
        <div class="crumb">
          <a href="#/forum">Forum</a> ${icons.chevron}
          <span>${esc(categoryName(t.category) || t.categoryName || 'General')}</span>
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
              <textarea id="reply" placeholder="${t.watchers > 1
                ? `Reply to ${esc(author.name.split(' ')[0])} and the ${t.watchers - 1} other members watching.`
                : `Reply to ${esc(author.name.split(' ')[0])}.`}"></textarea>
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
                ${avatar(author)}
                <div>
                  <div style="font-size:13.5px;font-weight:600">${esc(author.name)}</div>
                  <div class="caption">Opened ${relDays(t.created)}</div>
                </div>
              </div>
              <div class="row" style="justify-content:space-between;margin-top:var(--s5);padding-top:var(--s4);border-top:1px solid var(--comb-shade)">
                <span style="font-size:13px">Replies</span>
                <span class="mono" style="font-size:13px">${posts.length - 1}</span>
              </div>
              <div class="row" style="justify-content:space-between;margin-top:var(--s2)">
                <span style="font-size:13px">Watching</span>
                <span class="mono" style="font-size:13px">${t.watchers}</span>
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

          <div class="panel">
            <div class="panel-head"><h2>Members watching</h2></div>
            <div class="panel-body">
              <div class="row row-wrap" style="gap:var(--s2)">
                ${watchers.map((m) => `<span title="${esc(m.name)}">${avatar(m)}</span>`).join('')}
                ${t.watchers > watchers.length ? `<span class="caption mono">+${t.watchers - watchers.length}</span>` : ''}
              </div>
              <p class="caption" style="margin-top:var(--s4)">
                Everyone here is emailed when a new reply is posted.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  setTimeout(() => {
    const btn = document.getElementById('post-reply');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const box = document.getElementById('reply');
      const text = box.value.trim();
      if (!text) { toast('Write something before posting.'); return; }
      addPost(t.id, text);
      if (!isSubscribed(key)) state.subs.push(key);
      const others = Math.max(0, t.watchers - 1);
      toast(others
        ? `Reply posted. ${others} watching ${others === 1 ? 'member' : 'members'} notified.`
        : 'Reply posted.');
      window.__aqbba_render();
    });
  }, 0);

  return html;
}
