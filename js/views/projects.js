/* ==========================================================================
   Projects. Coordinated research initiatives, distinct from apiaries: an
   apiary is a place, a project is a question with a method attached, and
   several can be running at one site — or across none yet — at once.

   Every seeded project traces back to a real forum thread, and the detail
   page links back to it, so the life cycle is visible: a problem surfaces
   in the forum, a member proposes a project to answer it, others join with
   what they can contribute.
   ========================================================================== */

import {
  projects, projectStatusLabels, memberById, threadById, relDays,
} from '../data.js';
import {
  joinProject, memberProjects, sessionParticipantsFor, addProject,
  allApiaries, allApiaryById, roleLabel,
} from '../store.js';
import { currentUser } from '../data.js';
import { esc, icons, avatar, modal, closeModal, toast } from '../ui.js';

let activeStatus = 'All';

const statusVariant = { recruiting: 'tag-amber', active: 'tag-green', concluding: 'tag-blue' };

function allProjects() {
  return [...memberProjects(), ...projects];
}

function allParticipants(p) {
  return [...p.participants, ...sessionParticipantsFor(p.id)];
}

function isMineAlready(p) {
  return p.coordinators.includes(currentUser.id) || allParticipants(p).some((x) => x.member === currentUser.id);
}

function sitesLine(p) {
  const named = p.sites.map((id) => allApiaryById(id)).filter(Boolean);
  if (!named.length) return 'No site confirmed yet — recruiting a host apiary.';
  const names = named.map((a) => a.code).join(', ');
  return p.openSites ? `Running at ${names}, open to other member apiaries.` : `Running at ${names}.`;
}

function projectCard(p) {
  const coords = p.coordinators.map((id) => memberById(id));
  const count = allParticipants(p).length;
  return `
    <a class="panel" href="#/projects/${p.id}" style="display:block">
      <div class="panel-head">
        <div style="min-width:0">
          <div class="eyebrow">${p.code}${p.linkedThread ? ' · from a forum discussion' : ''}</div>
          <h3 style="margin-top:2px;font-family:var(--display);font-size:1.0625rem;line-height:1.35">${esc(p.title)}</h3>
        </div>
        <span class="spacer"></span>
        <span class="tag ${statusVariant[p.status]}">${projectStatusLabels[p.status]}</span>
      </div>
      <div class="panel-body">
        <p style="font-size:13px;color:var(--propolis-60);line-height:1.55">${esc(p.summary)}</p>
        <div class="row" style="margin-top:var(--s4);gap:var(--s2)">
          ${coords.map((m) => avatar(m)).join('')}
          <span class="caption" style="margin-left:2px">${coords.map((m) => m.name.split(' ')[0]).join(' & ')}</span>
          <span class="spacer"></span>
          <span class="caption mono">${count} ${count === 1 ? 'participant' : 'participants'}</span>
        </div>
        <p class="caption" style="margin-top:var(--s3);padding-top:var(--s3);border-top:1px solid var(--comb-shade)">
          ${esc(sitesLine(p))}
        </p>
      </div>
    </a>`;
}

export function renderProjects() {
  const all = allProjects();
  const statuses = ['All', 'recruiting', 'active', 'concluding'];
  const shown = activeStatus === 'All' ? all : all.filter((p) => p.status === activeStatus);

  const html = `
    <div class="topbar">
      <div style="width:100%">
        <div class="eyebrow">Coordinated research initiatives</div>
        <h1>Projects</h1>
      </div>
      <div class="topbar-actions">
        <button class="btn btn-primary btn-sm" id="new-project">${icons.plus} Propose a project</button>
      </div>
    </div>

    <div class="wrap view">
      <p class="lede" style="max-width:66ch;margin-bottom:var(--s5)">
        A project is a question with a method attached, not a place — it can run at one research
        apiary, span all three, or wait for a member to volunteer a site. Most start life as a
        forum discussion. Join one with what you can contribute, or propose a new one.
      </p>

      <div class="filters">
        ${statuses.map((s) => {
          const n = s === 'All' ? all.length : all.filter((p) => p.status === s).length;
          const label = s === 'All' ? 'All' : projectStatusLabels[s];
          return `<button class="chip ${s === activeStatus ? 'is-on' : ''}" data-status="${s}">${label} <span class="mono" style="opacity:.6">${n}</span></button>`;
        }).join('')}
      </div>

      ${shown.length === 0 ? `
        <div class="panel"><div class="empty">
          <h3>Nothing ${activeStatus === 'All' ? '' : projectStatusLabels[activeStatus].toLowerCase()} right now</h3>
          <p>Projects usually start from a problem raised in the forum. If you've got one, propose it.</p>
          <button class="btn btn-primary" id="empty-project">Propose a project</button>
        </div></div>` : `
        <div class="grid grid-3">${shown.map(projectCard).join('')}</div>`}
    </div>`;

  setTimeout(bindProjects, 0);
  return html;
}

function bindProjects() {
  document.querySelectorAll('[data-status]').forEach((chip) => {
    chip.addEventListener('click', () => { activeStatus = chip.dataset.status; window.__aqbba_render(); });
  });
  const open = () => openProposeForm();
  const b1 = document.getElementById('new-project');
  const b2 = document.getElementById('empty-project');
  if (b1) b1.addEventListener('click', open);
  if (b2) b2.addEventListener('click', open);
}

function openProposeForm() {
  const apiaryChecks = allApiaries().map((a) => `
      <label class="row" style="gap:8px;font-size:13px;font-weight:400;text-transform:none;letter-spacing:0;margin-bottom:6px">
        <input type="checkbox" value="${a.id}" class="p-site">
        ${esc(a.name)} <span class="caption">(${a.code})</span>
      </label>`).join('');

  const body = `
    <p class="caption" style="margin-bottom:var(--s5)">
      You'll be listed as coordinator. Leave sites unchecked if you need a member to volunteer one.
    </p>
    <form id="proj-form">
      <div class="field">
        <label for="p-title">Title</label>
        <input id="p-title" required placeholder="What question is this trying to answer?">
      </div>
      <div class="field">
        <label for="p-summary">One-line summary</label>
        <input id="p-summary" required placeholder="Shown on the project card">
      </div>
      <div class="field">
        <label for="p-background">Background</label>
        <textarea id="p-background" required placeholder="What problem or observation prompted this?"></textarea>
      </div>
      <div class="field">
        <label for="p-aims">Aims — one per line</label>
        <textarea id="p-aims" placeholder="What this project should establish"></textarea>
      </div>
      <div class="field">
        <label for="p-methods">Participation — what's needed</label>
        <textarea id="p-methods" required placeholder="What would a member joining actually have to do?"></textarea>
      </div>
      <div class="field">
        <label>Sites (optional)</label>
        ${apiaryChecks}
      </div>
    </form>`;

  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-primary" id="pub-project">Propose project</button>`;

  const scrim = modal({ title: 'Propose a project', body, actions });

  scrim.querySelector('#pub-project').addEventListener('click', () => {
    const title = scrim.querySelector('#p-title').value.trim();
    const summary = scrim.querySelector('#p-summary').value.trim();
    const background = scrim.querySelector('#p-background').value.trim();
    const methods = scrim.querySelector('#p-methods').value.trim();
    const aims = scrim.querySelector('#p-aims').value.split('\n').map((s) => s.trim()).filter(Boolean);
    const sites = [...scrim.querySelectorAll('.p-site:checked')].map((c) => c.value);

    if (!title || !summary || !background || !methods) {
      toast('Add a title, summary, background and participation detail before publishing.');
      return;
    }

    const p = addProject({
      title, summary, background, methods, aims, questions: [], addons: '', sites, openSites: true,
    });
    joinProject(p.id, 'Proposed and is coordinating this project.');
    closeModal();
    toast(`Project proposed. It's now visible to all members under Recruiting.`);
    location.hash = `#/projects/${p.id}`;
  });
}

/* --- detail --------------------------------------------------------------- */

export function renderProject(id) {
  const p = allProjects().find((x) => x.id === id);
  if (!p) return '';

  const coords = p.coordinators.map((m) => memberById(m));
  const participants = allParticipants(p);
  const mine = isMineAlready(p);
  const thread = p.linkedThread ? threadById(p.linkedThread) : null;

  const html = `
    <div class="topbar">
      <div style="width:100%">
        <div class="crumb"><a href="#/projects">Projects</a> ${icons.chevron} <span>${p.code}</span></div>
        <div class="eyebrow">${p.code}</div>
        <h1 style="font-size:clamp(1.375rem,2.4vw,1.75rem);max-width:36ch">${esc(p.title)}</h1>
      </div>
      <div class="topbar-actions">
        <span class="tag ${statusVariant[p.status]}">${projectStatusLabels[p.status]}</span>
      </div>
    </div>

    <div class="wrap view">
      <div class="grid grid-dash">
        <div class="stack">
          <div class="panel">
            <div class="panel-head"><h2>About this project</h2></div>
            <div class="panel-body">
              <div class="prose">
                ${p.background.map((b) => `<p>${esc(b)}</p>`).join('')}
                ${p.aims && p.aims.length ? `
                  <h3>Aims</h3>
                  <ul>${p.aims.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
                ${p.questions && p.questions.length ? `
                  <h3>Research questions</h3>
                  <ul>${p.questions.map((q) => `<li>${esc(q)}</li>`).join('')}</ul>` : ''}
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-head"><h2>Participation</h2></div>
            <div class="panel-body">
              <p style="font-size:13.5px;color:var(--propolis-60);line-height:1.6">${esc(p.participation.summary)}</p>
              ${p.participation.methods && p.participation.methods.length ? `
                <ul style="margin-top:var(--s4);padding-left:var(--s5);list-style:disc">
                  ${p.participation.methods.map((m) => `<li style="margin-bottom:6px;font-size:13.5px;line-height:1.6">${esc(m)}</li>`).join('')}
                </ul>` : ''}
              ${p.participation.addons ? `
                <p class="caption" style="margin-top:var(--s4);padding-top:var(--s4);border-top:1px solid var(--comb-shade)">
                  ${esc(p.participation.addons)}
                </p>` : ''}
            </div>
          </div>

          <div class="panel">
            <div class="panel-head"><h2>Timeline</h2></div>
            <div class="panel-body">
              <p style="font-size:13.5px;color:var(--propolis-60);line-height:1.6">${esc(p.timeline)}</p>
            </div>
          </div>
        </div>

        <div class="stack">
          <div class="panel">
            <div class="panel-body">
              ${mine ? `
                <div class="row" style="gap:8px">
                  ${icons.check}
                  <span style="font-size:13.5px;font-weight:600">You're part of this project</span>
                </div>
                <p class="caption" style="margin-top:var(--s2)">Coordinators can see your contribution on the participants list.</p>
              ` : `
                <button class="btn btn-primary btn-block" id="join-project">${icons.plus} Join this project</button>
                <p class="caption" style="margin-top:var(--s3)">
                  ${p.status === 'recruiting' ? 'Actively looking for participants.' : 'Still open to new participants.'}
                </p>
              `}
            </div>
          </div>

          <div class="panel">
            <div class="panel-head"><h2>Coordinators</h2></div>
            <div class="panel-body panel-body-flush">
              ${coords.map((m) => `
                <div class="breeder">
                  ${avatar(m)}
                  <div>
                    <strong style="font-size:13.5px;font-weight:600;display:block">${esc(m.name)}</strong>
                    <span class="caption">${esc(roleLabel(m.id))} · ${m.state}</span>
                  </div>
                </div>`).join('')}
            </div>
          </div>

          <div class="panel">
            <div class="panel-head"><h2>Sites</h2></div>
            <div class="panel-body">
              ${p.sites.length ? `
                <div class="row row-wrap" style="gap:6px;margin-bottom:var(--s3)">
                  ${p.sites.map((id) => {
                    const a = allApiaryById(id);
                    return a ? `<a class="tag tag-outline" href="#/apiaries/${a.id}">${a.code} · ${esc(a.name)}</a>` : '';
                  }).join('')}
                </div>` : ''}
              <p class="caption">${esc(sitesLine(p))}</p>
            </div>
          </div>

          ${thread ? `
            <div class="panel">
              <div class="panel-head"><h2>Origin</h2></div>
              <div class="panel-body">
                <p class="caption" style="margin-bottom:var(--s3)">This project grew out of a forum discussion.</p>
                <a class="thread" style="border:1px solid var(--comb-shade);border-radius:3px;padding:var(--s3)" href="#/forum/${thread.id}">
                  <h3 style="font-size:13.5px">${esc(thread.title)}</h3>
                  <p class="caption" style="margin-top:4px">${relDays(thread.created)} · view the discussion ${icons.chevron}</p>
                </a>
              </div>
            </div>` : ''}

          <div class="panel">
            <div class="panel-head">
              <h2>Participants</h2>
              <span class="spacer"></span>
              <span class="caption mono">${participants.length}</span>
            </div>
            <div class="panel-body panel-body-flush">
              ${participants.map((x) => {
                const m = memberById(x.member);
                return `
                  <div class="breeder">
                    ${avatar(m)}
                    <div style="flex:1;min-width:0">
                      <strong style="font-size:13.5px;font-weight:600;display:block">${esc(m.name)}</strong>
                      <span class="caption">${esc(x.contribution)}</span>
                    </div>
                  </div>`;
              }).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>`;

  setTimeout(() => {
    const btn = document.getElementById('join-project');
    if (btn) btn.addEventListener('click', () => openJoinForm(p));
  }, 0);

  return html;
}

function openJoinForm(p) {
  const body = `
    <p class="caption" style="margin-bottom:var(--s5)">
      ${esc(p.coordinators.map((id) => memberById(id).name).join(' and '))} will see this.
    </p>
    <div class="field">
      <label for="j-contrib">How will you contribute?</label>
      <textarea id="j-contrib" placeholder="e.g. I can run this protocol at my apiary in Central West NSW."></textarea>
    </div>`;

  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-primary" id="confirm-join">Join project</button>`;

  const scrim = modal({ title: `Join ${p.title}`, body, actions });

  scrim.querySelector('#confirm-join').addEventListener('click', () => {
    const text = scrim.querySelector('#j-contrib').value.trim();
    if (!text) { toast('Add a line on how you\'ll contribute before joining.'); return; }
    joinProject(p.id, text);
    closeModal();
    toast(`You joined ${p.title}. Coordinators notified by email.`);
    window.__aqbba_render();
  });
}
