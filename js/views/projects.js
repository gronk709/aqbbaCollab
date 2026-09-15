/* ==========================================================================
   Projects. Coordinated research initiatives, distinct from apiaries: an
   apiary is a place, a project is a question with a method attached, and
   several can be running at one site — or across none yet — at once.

   Phase 6 of the backend migration: real Supabase rows now (js/store.js's
   loadProjects/loadProject). Only a Web Admin creates or deletes a
   project; its narrative content — background, aims, questions, timeline,
   participation — is what a Project Manager (add/edit/delete) or
   Contributor (add/edit only) can touch, per member they've been
   individually assigned to a given project, same shape as an apiary's own
   manager grant.
   ========================================================================== */

import { projectStatusLabels } from '../data.js';
import {
  addProject, deleteProject, addProjectSection, updateProjectSection, deleteProjectSection,
  joinProject, leaveProject, setProjectTeamMember, removeProjectTeamMember, loadRealMembers,
  allApiaryById, currentUser, isWebAdmin,
} from '../store.js';
import { esc, icons, avatar, modal, closeModal, toast } from '../ui.js';

let activeStatus = 'All';

const statusVariant = { recruiting: 'tag-amber', active: 'tag-green', concluding: 'tag-blue' };

function sitesLine(p) {
  const named = (p.sites || []).map((id) => allApiaryById(id)).filter(Boolean);
  if (!named.length) return 'No site confirmed yet — recruiting a host apiary.';
  const names = named.map((a) => a.code).join(', ');
  return p.open_sites ? `Running at ${names}, open to other member apiaries.` : `Running at ${names}.`;
}

function projectCard(p) {
  return `
    <a class="panel" href="#/projects/${p.id}" style="display:block">
      <div class="panel-head">
        <div style="min-width:0">
          <div class="eyebrow">${p.code}</div>
          <h3 style="margin-top:2px;font-family:var(--display);font-size:1.0625rem;line-height:1.35">${esc(p.title)}</h3>
        </div>
        <span class="spacer"></span>
        <span class="tag ${statusVariant[p.status]}">${projectStatusLabels[p.status]}</span>
      </div>
      <div class="panel-body">
        <p style="font-size:13px;color:var(--propolis-60);line-height:1.55">${esc(p.summary)}</p>
        <div class="row" style="margin-top:var(--s4);gap:var(--s2)">
          <span class="caption mono">${p.participantCount} ${p.participantCount === 1 ? 'participant' : 'participants'}</span>
        </div>
        <p class="caption" style="margin-top:var(--s3);padding-top:var(--s3);border-top:1px solid var(--comb-shade)">
          ${esc(sitesLine(p))}
        </p>
      </div>
    </a>`;
}

export function renderProjects(all) {
  const admin = isWebAdmin(currentUser().id);
  const statuses = ['All', 'recruiting', 'active', 'concluding'];
  const shown = activeStatus === 'All' ? all : all.filter((p) => p.status === activeStatus);

  const html = `
    <div class="topbar">
      <div style="width:100%">
        <div class="eyebrow">Coordinated research initiatives</div>
        <h1>Projects</h1>
      </div>
      ${admin ? `
        <div class="topbar-actions">
          <button class="btn btn-primary btn-sm" id="new-project">${icons.plus} Add project</button>
        </div>` : ''}
    </div>

    <div class="wrap view">
      <p class="lede" style="max-width:66ch;margin-bottom:var(--s5)">
        A project is a question with a method attached, not a place — it can run at one research
        apiary, span all three, or wait for a member to volunteer a site. A Web Admin creates a
        project; the Project Managers and Contributors assigned to it build out its content from
        there. Join one with what you can contribute.
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
          <p>${admin ? 'Add a project to get one started.' : 'Nothing here yet — check back once a Web Admin adds one.'}</p>
          ${admin ? '<button class="btn btn-primary" id="empty-project">Add project</button>' : ''}
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
  const open = () => openNewProjectForm();
  const b1 = document.getElementById('new-project');
  const b2 = document.getElementById('empty-project');
  if (b1) b1.addEventListener('click', open);
  if (b2) b2.addEventListener('click', open);
}

function openNewProjectForm() {
  const body = `
    <p class="caption" style="margin-bottom:var(--s5)">
      You'll be given Project Manager access automatically. Background, aims, questions and the
      rest of the content get added from the project's own page once it exists.
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
    </form>`;

  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-primary" id="pub-project">Add project</button>`;

  const scrim = modal({ title: 'Add a project', body, actions });
  const btn = scrim.querySelector('#pub-project');

  btn.addEventListener('click', async () => {
    const title = scrim.querySelector('#p-title').value.trim();
    const summary = scrim.querySelector('#p-summary').value.trim();
    if (!title || !summary) { toast('Add a title and summary first.'); return; }

    btn.disabled = true;
    btn.textContent = 'Adding…';
    let p;
    try {
      p = await addProject({ title, summary });
    } catch (err) {
      toast(`Couldn't add the project: ${err.message}`);
      btn.disabled = false;
      btn.textContent = 'Add project';
      return;
    }
    closeModal();
    toast(`${p.code} added.`);
    window.__aqbba_invalidateData();
    location.hash = `#/projects/${p.id}`;
  });
}

/* --- section content (background/aims/questions/timeline/participation) --
   One row per bullet or paragraph (js/store.js's project_sections). List
   sections (background/aims/questions/participation methods) can hold
   several rows; the rest conventionally hold at most one. Add/edit is
   open to a Contributor or better; delete needs Manager or better —
   that's the actual mechanism behind "Contributor can't delete content." */

function sectionsOf(sections, type) {
  return sections.filter((s) => s.section === type).sort((a, b) => a.sort_order - b.sort_order);
}

function sectionRow(s, canContribute, canManage) {
  return `
    <div class="sub" data-section-row="${s.id}">
      <div class="sub-title"><span style="text-transform:none;letter-spacing:0;font-size:13.5px;color:var(--propolis-60);line-height:1.6">${esc(s.body)}</span></div>
      <div class="row" style="gap:4px;flex:none">
        ${canContribute ? `<button type="button" class="attach-remove" data-edit-section="${s.id}" aria-label="Edit">${icons.pen}</button>` : ''}
        ${canManage ? `<button type="button" class="attach-remove" data-delete-section="${s.id}" aria-label="Delete">${icons.x}</button>` : ''}
      </div>
    </div>`;
}

function listSectionHTML(sections, type, canContribute, canManage, addLabel) {
  const items = sectionsOf(sections, type);
  return `
    ${items.length ? `<div style="border:1px solid var(--comb-shade);border-radius:4px;margin-bottom:${canContribute ? 'var(--s3)' : '0'}">${items.map((s) => sectionRow(s, canContribute, canManage)).join('')}</div>` : ''}
    ${canContribute ? `<button type="button" class="btn btn-ghost btn-sm" data-add-section="${type}">${icons.plus} ${addLabel}</button>` : (items.length ? '' : '<p class="caption">Nothing added yet.</p>')}`;
}

function singleSectionHTML(sections, type, canContribute, addLabel) {
  const s = sectionsOf(sections, type)[0];
  if (!s) {
    return canContribute
      ? `<button type="button" class="btn btn-ghost btn-sm" data-add-section-single="${type}">${icons.plus} ${addLabel}</button>`
      : '<p class="caption">Not added yet.</p>';
  }
  return `
    <p style="font-size:13.5px;color:var(--propolis-60);line-height:1.6">
      ${esc(s.body)}
      ${canContribute ? `<button type="button" class="attach-remove" data-edit-section="${s.id}" aria-label="Edit" style="display:inline-grid;vertical-align:middle;margin-left:8px">${icons.pen}</button>` : ''}
    </p>`;
}

function openSectionModal({ title, initialBody = '', onSave }) {
  const body = `
    <div class="field">
      <label for="section-body">Text</label>
      <textarea id="section-body" placeholder="…">${esc(initialBody)}</textarea>
    </div>`;
  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-primary" id="save-section">Save</button>`;
  const scrim = modal({ title, body, actions });

  scrim.querySelector('#save-section').addEventListener('click', async (e) => {
    const text = scrim.querySelector('#section-body').value.trim();
    if (!text) { toast('Add some text first.'); return; }
    e.target.disabled = true;
    e.target.textContent = 'Saving…';
    try {
      await onSave(text);
    } catch (err) {
      toast(`Couldn't save: ${err.message}`);
      e.target.disabled = false;
      e.target.textContent = 'Save';
      return;
    }
    closeModal();
    window.__aqbba_invalidateData();
    window.__aqbba_render();
  });
}

const SECTION_LABELS = {
  background: 'Add background',
  aims: 'Add an aim',
  questions: 'Add a question',
  timeline: 'Add a timeline',
  participation_summary: 'Add a participation summary',
  participation_method: 'Add a participation method',
  participation_addons: 'Add a note',
};

function bindSectionEditing(projectId, sections) {
  document.querySelectorAll('[data-add-section]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.addSection;
      openSectionModal({
        title: SECTION_LABELS[type] || 'Add',
        onSave: (text) => addProjectSection(projectId, type, text),
      });
    });
  });
  document.querySelectorAll('[data-add-section-single]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.addSectionSingle;
      openSectionModal({
        title: SECTION_LABELS[type] || 'Add',
        onSave: (text) => addProjectSection(projectId, type, text),
      });
    });
  });
  document.querySelectorAll('[data-edit-section]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.editSection;
      const s = sections.find((x) => x.id === id);
      openSectionModal({
        title: 'Edit text',
        initialBody: s.body,
        onSave: (text) => updateProjectSection(id, text),
      });
    });
  });
  document.querySelectorAll('[data-delete-section]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await deleteProjectSection(btn.dataset.deleteSection);
      } catch (err) {
        toast(`Couldn't delete: ${err.message}`);
        btn.disabled = false;
        return;
      }
      window.__aqbba_invalidateData();
      window.__aqbba_render();
    });
  });
}

/* --- team (Project Manager / Contributor assignment) --------------------
   Holding the role tag is just a label — this table is the actual grant,
   one project at a time, Web-Admin-only to change, same shape as an
   apiary's own manager grant. */

function teamPanelHTML(data) {
  return `
    <div class="panel">
      <div class="panel-head">
        <h2>Project team</h2>
        <span class="spacer"></span>
        ${data.isAdmin ? `<button type="button" class="btn btn-ghost btn-sm" id="manage-team">${icons.pen} Manage</button>` : ''}
      </div>
      <div class="panel-body panel-body-flush">
        ${data.team.length ? data.team.map((t) => `
          <div class="breeder">
            ${avatar(t.member)}
            <div style="flex:1;min-width:0">
              <strong style="font-size:13.5px;font-weight:600;display:block">${esc(t.member.name)}</strong>
              <span class="caption">${t.access_level === 'manage' ? 'Project Manager' : 'Contributor'}</span>
            </div>
          </div>`).join('') : `
          <div class="empty" style="padding:var(--s5)"><p class="caption">No one assigned yet — a Web Admin assigns Project Managers and Contributors here.</p></div>`}
      </div>
    </div>`;
}

async function openManageTeamModal(projectId, data) {
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
            <span class="caption">${t.access_level === 'manage' ? 'Project Manager' : 'Contributor'}</span>
          </div>
          <button type="button" class="attach-remove" data-remove-team="${t.member_id}" aria-label="Remove">${icons.x}</button>
        </div>`).join('') : `<div class="empty" style="padding:var(--s4)"><p class="caption">No one assigned yet.</p></div>`}
    </div>
    ${eligible.length ? `
      <div class="field">
        <label for="team-member">Add a member</label>
        <select id="team-member">
          ${eligible.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="team-level">As</label>
        <select id="team-level">
          <option value="manage">Project Manager — add, edit, delete content</option>
          <option value="contribute">Contributor — add, edit content, no delete</option>
        </select>
      </div>` : '<p class="caption">Every member is already on this project\'s team.</p>'}`;

  const actions = eligible.length ? `
    <button class="btn btn-ghost" data-close>Close</button>
    <button class="btn btn-primary" id="add-team-member">Add to team</button>` : `
    <button class="btn btn-ghost" data-close>Close</button>`;

  const scrim = modal({ title: 'Manage project team', body, actions });

  scrim.querySelectorAll('[data-remove-team]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await removeProjectTeamMember(projectId, btn.dataset.removeTeam);
      } catch (err) {
        toast(`Couldn't remove: ${err.message}`);
        btn.disabled = false;
        return;
      }
      closeModal();
      window.__aqbba_invalidateData();
      window.__aqbba_render();
    });
  });

  const addBtn = scrim.querySelector('#add-team-member');
  if (addBtn) addBtn.addEventListener('click', async () => {
    const memberId = scrim.querySelector('#team-member').value;
    const level = scrim.querySelector('#team-level').value;
    addBtn.disabled = true;
    try {
      await setProjectTeamMember(projectId, memberId, level);
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

/* --- detail --------------------------------------------------------------- */

export function renderProject(data, id) {
  const { project: p, sections, participants, canManage, canContribute, isAdmin, isParticipant } = data;
  if (!p) return '';

  const html = `
    <div class="topbar">
      <div style="width:100%">
        <div class="crumb"><a href="#/projects">Projects</a> ${icons.chevron} <span>${p.code}</span></div>
        <div class="eyebrow">${p.code}</div>
        <h1 style="font-size:clamp(1.375rem,2.4vw,1.75rem);max-width:36ch">${esc(p.title)}</h1>
      </div>
      <div class="topbar-actions" style="gap:var(--s3)">
        <span class="tag ${statusVariant[p.status]}">${projectStatusLabels[p.status]}</span>
        ${isAdmin ? `<button class="btn btn-ghost btn-sm" id="delete-project">${icons.x} Delete project</button>` : ''}
      </div>
    </div>

    <div class="wrap view">
      <div class="grid grid-dash">
        <div class="stack">
          <div class="panel">
            <div class="panel-head"><h2>About this project</h2></div>
            <div class="panel-body">
              <p style="font-size:13.5px;color:var(--propolis-60);line-height:1.6;margin-bottom:var(--s4)">${esc(p.summary)}</p>
              ${listSectionHTML(sections, 'background', canContribute, canManage, 'Add background')}
            </div>
          </div>

          <div class="panel">
            <div class="panel-head"><h2>Aims</h2></div>
            <div class="panel-body">${listSectionHTML(sections, 'aims', canContribute, canManage, 'Add an aim')}</div>
          </div>

          <div class="panel">
            <div class="panel-head"><h2>Research questions</h2></div>
            <div class="panel-body">${listSectionHTML(sections, 'questions', canContribute, canManage, 'Add a question')}</div>
          </div>

          ${p.topics && p.topics.length ? `
            <div class="panel">
              <div class="panel-head">
                <h2>Topic areas</h2>
                <span class="spacer"></span>
                <span class="caption mono">${p.topics.length}</span>
              </div>
              <div class="panel-body panel-body-flush">
                ${p.topics.map((t) => `
                  <a class="sub" href="${t.href}">
                    <div class="sub-title">
                      <strong>${esc(t.name)}</strong>
                      <span>${esc(t.desc)}</span>
                    </div>
                    ${icons.chevron}
                  </a>`).join('')}
              </div>
            </div>` : ''}

          <div class="panel">
            <div class="panel-head"><h2>Participation</h2></div>
            <div class="panel-body">
              <div style="margin-bottom:var(--s4)">${singleSectionHTML(sections, 'participation_summary', canContribute, 'Add a participation summary')}</div>
              ${listSectionHTML(sections, 'participation_method', canContribute, canManage, 'Add a participation method')}
              <div style="margin-top:var(--s4);padding-top:var(--s4);border-top:1px solid var(--comb-shade)">
                ${singleSectionHTML(sections, 'participation_addons', canContribute, 'Add a note')}
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-head"><h2>Timeline</h2></div>
            <div class="panel-body">${singleSectionHTML(sections, 'timeline', canContribute, 'Add a timeline')}</div>
          </div>
        </div>

        <div class="stack">
          <div class="panel">
            <div class="panel-body">
              ${isParticipant ? `
                <div class="row" style="gap:8px">
                  ${icons.check}
                  <span style="font-size:13.5px;font-weight:600">You're part of this project</span>
                </div>
                <button class="btn btn-ghost btn-sm" id="leave-project" style="margin-top:var(--s3)">Leave project</button>
              ` : `
                <button class="btn btn-primary btn-block" id="join-project">${icons.plus} Join this project</button>
                <p class="caption" style="margin-top:var(--s3)">
                  ${p.status === 'recruiting' ? 'Actively looking for participants.' : 'Still open to new participants.'}
                </p>
              `}
            </div>
          </div>

          ${teamPanelHTML(data)}

          <div class="panel">
            <div class="panel-head"><h2>Sites</h2></div>
            <div class="panel-body">
              ${(p.sites || []).length ? `
                <div class="row row-wrap" style="gap:6px;margin-bottom:var(--s3)">
                  ${p.sites.map((id2) => {
                    const a = allApiaryById(id2);
                    return a ? `<a class="tag tag-outline" href="#/apiaries/${a.id}">${a.code} · ${esc(a.name)}</a>` : '';
                  }).join('')}
                </div>` : ''}
              <p class="caption">${esc(sitesLine(p))}</p>
            </div>
          </div>

          <div class="panel">
            <div class="panel-head">
              <h2>Participants</h2>
              <span class="spacer"></span>
              <span class="caption mono">${participants.length}</span>
            </div>
            <div class="panel-body panel-body-flush">
              ${participants.length ? participants.map((x) => `
                <div class="breeder">
                  ${avatar(x.member)}
                  <div style="flex:1;min-width:0">
                    <strong style="font-size:13.5px;font-weight:600;display:block">${esc(x.member.name)}</strong>
                    <span class="caption">${esc(x.contribution || '')}</span>
                  </div>
                </div>`).join('') : `<div class="empty" style="padding:var(--s5)"><p class="caption">No participants yet.</p></div>`}
            </div>
          </div>
        </div>
      </div>
    </div>`;

  setTimeout(() => {
    bindSectionEditing(p.id, sections);

    const joinBtn = document.getElementById('join-project');
    if (joinBtn) joinBtn.addEventListener('click', () => openJoinForm(p));

    const leaveBtn = document.getElementById('leave-project');
    if (leaveBtn) leaveBtn.addEventListener('click', async () => {
      leaveBtn.disabled = true;
      try {
        await leaveProject(p.id, currentUser().id);
      } catch (err) {
        toast(`Couldn't leave: ${err.message}`);
        leaveBtn.disabled = false;
        return;
      }
      toast(`You left ${p.title}.`);
      window.__aqbba_invalidateData();
      window.__aqbba_render();
    });

    const teamBtn = document.getElementById('manage-team');
    if (teamBtn) teamBtn.addEventListener('click', () => openManageTeamModal(p.id, data));

    const deleteBtn = document.getElementById('delete-project');
    if (deleteBtn) deleteBtn.addEventListener('click', () => openDeleteProjectModal(p));
  }, 0);

  return html;
}

function openJoinForm(p) {
  const body = `
    <div class="field">
      <label for="j-contrib">How will you contribute?</label>
      <textarea id="j-contrib" placeholder="e.g. I can run this protocol at my apiary in Central West NSW."></textarea>
    </div>`;

  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-primary" id="confirm-join">Join project</button>`;

  const scrim = modal({ title: `Join ${p.title}`, body, actions });

  scrim.querySelector('#confirm-join').addEventListener('click', async (e) => {
    const text = scrim.querySelector('#j-contrib').value.trim();
    if (!text) { toast('Add a line on how you\'ll contribute before joining.'); return; }
    e.target.disabled = true;
    try {
      await joinProject(p.id, text);
    } catch (err) {
      toast(`Couldn't join: ${err.message}`);
      e.target.disabled = false;
      return;
    }
    closeModal();
    toast(`You joined ${p.title}.`);
    window.__aqbba_invalidateData();
    window.__aqbba_render();
  });
}

function openDeleteProjectModal(p) {
  const body = `<p>Delete ${esc(p.code)} — "${esc(p.title)}"? This removes all of its content, participants and team assignments. This can't be undone.</p>`;
  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-danger" id="confirm-delete-project">Delete project</button>`;
  const scrim = modal({ title: 'Delete project', body, actions });

  scrim.querySelector('#confirm-delete-project').addEventListener('click', async (e) => {
    e.target.disabled = true;
    e.target.textContent = 'Deleting…';
    try {
      await deleteProject(p.id);
    } catch (err) {
      toast(`Couldn't delete: ${err.message}`);
      e.target.disabled = false;
      e.target.textContent = 'Delete project';
      return;
    }
    closeModal();
    toast(`${p.code} deleted.`);
    window.__aqbba_invalidateData();
    location.hash = '#/projects';
  });
}
