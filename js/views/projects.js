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

   Both pages are on the Tailwind look (see js/components.js); the pop-up
   forms still use the shared modal styles from css/main.css.
   ========================================================================== */

import { projectStatusLabels } from '../data.js';
import {
  addProject, deleteProject, addProjectSection, updateProjectSection, deleteProjectSection,
  joinProject, leaveProject, setProjectTeamMember, removeProjectTeamMember, loadRealMembers,
  currentUser, isWebAdmin,
} from '../store.js';
import { esc, icons, avatar, modal, closeModal, toast } from '../ui.js';
import { button } from '../components.js';
import { coverIsLight, projectCoverArt, projectStoryCard } from '../projectArt.js';

let activeStatus = 'All';

const STATUS_DOT = { recruiting: 'var(--amber)', active: 'var(--mark-green)', concluding: 'var(--mark-blue)' };

function statusPill(status) {
  return `
    <span class="tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-full tw:bg-white/95 tw:px-3 tw:py-1 tw:text-xs tw:font-semibold tw:text-propolis tw:shadow-sm tw:ring-1 tw:ring-black/5">
      <span class="tw:size-2 tw:rounded-full" style="background:${STATUS_DOT[status] || 'var(--propolis-40)'}"></span>${esc(projectStatusLabels[status] || status)}
    </span>`;
}

/* p.siteDetails is resolved server-side now (loadProjects/loadProject,
   js/store.js) — apiaries are real rows since Phase 5, so p.sites' plain
   id array needs an actual query to resolve, not a synchronous lookup. */
function sitesLine(p) {
  const named = p.siteDetails || [];
  if (!named.length) return 'No site confirmed yet — recruiting a host apiary.';
  const names = named.map((a) => a.code).join(', ');
  return p.open_sites ? `Running at ${names}, open to other member apiaries.` : `Running at ${names}.`;
}

const HEX_ICON = `<svg viewBox="0 0 24 24" class="tw:size-full" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z"/><path d="M12 8.2l3.3 1.9v3.8L12 15.8l-3.3-1.9v-3.8z"/></svg>`;

const FILTER_ON = 'tw:border-propolis tw:bg-propolis tw:text-white';
const FILTER_OFF = 'tw:border-comb-shade tw:bg-white tw:text-propolis tw:hover:border-amber tw:hover:text-amber-deep';

function filterPill(s, n, on) {
  const label = s === 'All' ? 'All' : projectStatusLabels[s];
  return `
    <button type="button" data-status="${s}" aria-pressed="${on}"
            class="tw:inline-flex tw:items-center tw:gap-2 tw:rounded-full tw:border tw:px-4 tw:py-2 tw:text-sm tw:font-medium tw:transition ${on ? FILTER_ON : FILTER_OFF}">
      ${esc(label)}
      <span class="tw:rounded-full tw:px-1.5 tw:font-mono tw:text-xs ${on ? 'tw:bg-white/15' : 'tw:bg-comb tw:text-propolis-60'}">${n}</span>
    </button>`;
}

function emptyState(admin) {
  const heading = activeStatus === 'All'
    ? 'No projects yet'
    : `Nothing ${projectStatusLabels[activeStatus].toLowerCase()} right now`;
  return `
    <div class="tw:mx-auto tw:max-w-xl tw:rounded-2xl tw:border-2 tw:border-dashed tw:border-comb-shade tw:px-8 tw:py-14 tw:text-center">
      <span class="tw:mx-auto tw:block tw:size-14 tw:text-amber">${HEX_ICON}</span>
      <h2 class="tw:mt-5 tw:font-display tw:text-2xl tw:font-medium tw:text-propolis">${esc(heading)}</h2>
      <p class="tw:mt-2 tw:text-propolis-60">${admin ? 'Add a project to get one started.' : 'Nothing here yet — check back once a Web Admin adds one.'}</p>
      ${admin ? `<div class="tw:mt-6">${button({ id: 'empty-project', label: 'Add project', icon: icons.plus })}</div>` : ''}
    </div>`;
}

export function renderProjects(all) {
  const admin = isWebAdmin(currentUser().id);
  const statuses = ['All', 'recruiting', 'active', 'concluding'];
  const shown = activeStatus === 'All' ? all : all.filter((p) => p.status === activeStatus);
  const count = (s) => (s === 'All' ? all.length : all.filter((p) => p.status === s).length);

  const html = `
    <div class="view">
      <section class="tw:bg-comb-deep/55 tw:px-6 tw:pt-14 tw:pb-12 tw:md:pt-20">
        <div class="tw:mx-auto tw:max-w-6xl">
          <div class="tw:flex tw:flex-wrap tw:items-end tw:gap-x-6 tw:gap-y-5">
            <div class="tw:min-w-0 tw:flex-1">
              <p class="tw:font-mono tw:text-xs tw:font-medium tw:uppercase tw:tracking-[0.18em] tw:text-amber-deep">Coordinated research initiatives</p>
              <h1 class="tw:mt-3 tw:font-display tw:text-5xl tw:font-semibold tw:tracking-tight tw:text-propolis tw:md:text-6xl">Projects</h1>
            </div>
            ${admin ? button({ id: 'new-project', label: 'Add project', icon: icons.plus }) : ''}
          </div>
          <p class="tw:mt-6 tw:max-w-3xl tw:text-lg tw:leading-relaxed tw:text-propolis-60 tw:text-pretty">
            A project is a question with a method attached, not a place — it can run at one research
            apiary, span all three, or wait for a member to volunteer a site. A Web Admin creates a
            project; the Project Managers and Contributors assigned to it build out its content from
            there. Join one with what you can contribute.
          </p>
          <div class="tw:mt-8 tw:flex tw:flex-wrap tw:gap-2" role="group" aria-label="Filter projects by status">
            ${statuses.map((s) => filterPill(s, count(s), s === activeStatus)).join('')}
          </div>
        </div>
      </section>

      <section class="tw:bg-white tw:px-6 tw:py-14 tw:md:py-16">
        <div class="tw:mx-auto tw:max-w-6xl">
          ${shown.length === 0
            ? emptyState(admin)
            : `<div class="tw:grid tw:gap-8 tw:sm:grid-cols-2 tw:lg:grid-cols-3">${shown.map((p) => projectStoryCard(p)).join('')}</div>`}
        </div>
      </section>
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

/* Small amber hexagon used as the bullet in list sections. */
const HEX_BULLET = `<svg viewBox="0 0 12 14" width="10" height="12" class="tw:mt-[0.5em] tw:shrink-0 tw:text-amber" aria-hidden="true"><path d="M6 0l6 3.5v7L6 14 0 10.5v-7z" fill="currentColor"/></svg>`;

const BODY_TEXT = 'tw:min-w-0 tw:flex-1 tw:text-[17px] tw:leading-relaxed tw:text-propolis/80';

const ICON_BUTTON = 'tw:grid tw:size-8 tw:shrink-0 tw:place-items-center tw:rounded-lg tw:text-propolis-40 tw:transition tw:hover:bg-comb tw:hover:text-propolis tw:disabled:opacity-50';
const ICON_BUTTON_DANGER = 'tw:grid tw:size-8 tw:shrink-0 tw:place-items-center tw:rounded-lg tw:text-propolis-40 tw:transition tw:hover:bg-mark-red/10 tw:hover:text-mark-red tw:disabled:opacity-50';

const editButton = (s) => `<button type="button" class="${ICON_BUTTON}" data-edit-section="${s.id}" aria-label="Edit" title="Edit">${icons.pen}</button>`;
const deleteButton = (s) => `<button type="button" class="${ICON_BUTTON_DANGER}" data-delete-section="${s.id}" aria-label="Delete" title="Delete">${icons.x}</button>`;

const addButton = (attr, type, label, spaced) => `
  <button type="button" ${attr}="${type}"
          class="${spaced ? 'tw:mt-4' : ''} tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-full tw:border tw:border-dashed tw:border-amber/60 tw:px-3.5 tw:py-1.5 tw:text-sm tw:font-medium tw:text-amber-deep tw:transition tw:hover:border-amber tw:hover:bg-amber-wash">
    ${icons.plus} ${esc(label)}
  </button>`;

const notYet = (text) => `<p class="tw:text-propolis-40 tw:italic">${text}</p>`;

/* marker: 'hex' (bulleted), 'number' (Q1, Q2, ...) or 'none' (plain paragraphs). */
function sectionRow(s, i, canContribute, canManage, marker) {
  const lead = marker === 'hex' ? HEX_BULLET
    : marker === 'number' ? `<span class="tw:w-8 tw:shrink-0 tw:pt-[0.2em] tw:font-mono tw:text-sm tw:font-semibold tw:text-amber-deep">Q${i + 1}</span>`
    : '';
  return `
    <li class="tw:flex tw:items-start tw:gap-3 tw:py-2" data-section-row="${s.id}">
      ${lead}
      <p class="${BODY_TEXT}">${esc(s.body)}</p>
      ${canContribute || canManage ? `<div class="tw:-mt-0.5 tw:flex tw:shrink-0 tw:gap-0.5">
        ${canContribute ? editButton(s) : ''}
        ${canManage ? deleteButton(s) : ''}
      </div>` : ''}
    </li>`;
}

function listSectionHTML(sections, type, canContribute, canManage, addLabel, marker = 'hex') {
  const items = sectionsOf(sections, type);
  const tag = marker === 'number' ? 'ol' : 'ul';
  return `
    ${items.length ? `<${tag} class="tw:-my-2">${items.map((s, i) => sectionRow(s, i, canContribute, canManage, marker)).join('')}</${tag}>` : ''}
    ${canContribute ? addButton('data-add-section', type, addLabel, items.length > 0) : (items.length ? '' : notYet('Nothing added yet.'))}`;
}

function singleSectionHTML(sections, type, canContribute, addLabel, textCls = BODY_TEXT) {
  const s = sectionsOf(sections, type)[0];
  if (!s) return canContribute ? addButton('data-add-section-single', type, addLabel, false) : notYet('Not added yet.');
  return `
    <div class="tw:flex tw:items-start tw:gap-3">
      <p class="${textCls}">${esc(s.body)}</p>
      ${canContribute ? editButton(s) : ''}
    </div>`;
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

const CARD = 'tw:rounded-2xl tw:border tw:border-comb-shade tw:bg-white tw:p-6';

function cardHead(title, right = '') {
  return `
    <div class="tw:mb-4 tw:flex tw:items-center tw:gap-3">
      <h2 class="tw:font-display tw:text-xl tw:font-medium tw:text-propolis">${esc(title)}</h2>
      ${right ? `<div class="tw:ml-auto">${right}</div>` : ''}
    </div>`;
}

const countBadge = (n) => `<span class="tw:rounded-full tw:bg-comb tw:px-2 tw:py-0.5 tw:font-mono tw:text-xs tw:text-propolis-60">${n}</span>`;

function personRow(member, sub) {
  return `
    <li class="tw:flex tw:items-center tw:gap-3">
      ${avatar(member)}
      <div class="tw:min-w-0">
        <p class="tw:truncate tw:text-[15px] tw:font-semibold tw:text-propolis">${esc(member.name)}</p>
        ${sub ? `<p class="tw:text-sm tw:leading-snug tw:text-propolis-60">${esc(sub)}</p>` : ''}
      </div>
    </li>`;
}

function teamPanelHTML(data) {
  const manage = data.isAdmin
    ? `<button type="button" id="manage-team" class="tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-lg tw:px-2.5 tw:py-1 tw:text-sm tw:font-medium tw:text-amber-deep tw:transition tw:hover:bg-amber-wash">${icons.pen} Manage</button>`
    : '';
  return `
    <div class="${CARD}">
      ${cardHead('Project team', manage)}
      ${data.team.length
        ? `<ul class="tw:space-y-3">${data.team.map((t) => personRow(t.member, t.access_level === 'manage' ? 'Project Manager' : 'Contributor')).join('')}</ul>`
        : '<p class="tw:text-sm tw:text-propolis-60">No one assigned yet — a Web Admin assigns Project Managers and Contributors here.</p>'}
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

function article(title, body) {
  return `
    <section>
      <h2 class="tw:font-display tw:text-3xl tw:font-medium tw:tracking-tight tw:text-propolis">${esc(title)}</h2>
      <div class="tw:mt-2 tw:mb-6 tw:h-1 tw:w-10 tw:rounded-full tw:bg-amber"></div>
      ${body}
    </section>`;
}

/* Banners are white text over a darkened photo. A project whose photo is pale
   (PROJECT_PHOTOS' `light`) uses dark text on its plain ground instead, with
   no darkening, and keeps its text column clear of the photo's subject:
   beside it from tablet width up (the subject sits at the right of the wide
   crop), below it on phones. Whole class strings, per the note in
   js/components.js. */
const BANNER_TONES = {
  dark: {
    root: 'tw:bg-propolis tw:text-white',
    imageBox: 'tw:absolute tw:inset-0',
    scrim: 'tw:bg-linear-to-t tw:from-black/85 tw:via-black/55 tw:to-black/25',
    back: 'tw:text-white/85 tw:hover:text-white',
    textTop: 'tw:pt-14',
    textBox: '',
    chip: 'tw:bg-black/35 tw:backdrop-blur-sm',
    textShadow: 'tw:[text-shadow:0_1px_12px_rgb(0_0_0/0.45)]',
    summary: 'tw:text-white/90',
    deleteVariant: 'glass',
  },
  light: {
    root: 'tw:border-b tw:border-comb-shade/70 tw:bg-[#eeedee] tw:text-propolis',
    imageBox: 'tw:absolute tw:inset-x-0 tw:top-0 tw:h-64 tw:[mask-image:linear-gradient(to_bottom,#000_70%,transparent)] tw:md:inset-0 tw:md:h-auto tw:md:[mask-image:none]',
    scrim: '',
    back: 'tw:text-propolis/80 tw:hover:text-propolis',
    textTop: 'tw:pt-60 tw:md:pt-14',
    textBox: 'tw:md:max-w-[58%]',
    chip: 'tw:bg-propolis/10 tw:ring-1 tw:ring-propolis/10',
    textShadow: '',
    summary: 'tw:text-propolis/80',
    deleteVariant: 'outline',
  },
};

function banner(p, isAdmin) {
  const t = BANNER_TONES[coverIsLight(p) ? 'light' : 'dark'];
  return `
    <header class="tw:relative tw:isolate tw:overflow-hidden ${t.root} tw:px-6 tw:pt-7 tw:pb-12 tw:md:pb-16">
      <div class="${t.imageBox} tw:-z-20">${projectCoverArt(p, { banner: true })}</div>
      ${t.scrim ? `<div class="tw:absolute tw:inset-0 tw:-z-10 ${t.scrim}"></div>` : ''}
      <div class="tw:mx-auto tw:flex tw:min-h-[19rem] tw:max-w-6xl tw:flex-col tw:md:min-h-[24rem]">
        <div class="tw:flex tw:items-center tw:gap-4">
          <a href="#/projects" class="tw:group tw:inline-flex tw:items-center tw:gap-1 tw:text-sm ${t.back} tw:transition">
            <span class="tw:rotate-180 tw:transition tw:group-hover:-translate-x-0.5">${icons.chevron}</span>
            <span class="tw:group-hover:underline">All projects</span>
          </a>
          ${isAdmin ? `<div class="tw:ml-auto">${button({ id: 'delete-project', label: 'Delete project', icon: icons.x, variant: t.deleteVariant, size: 'sm' })}</div>` : ''}
        </div>
        <div class="tw:mt-auto ${t.textTop}">
          <div class="${t.textBox}">
            <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
              <span class="tw:rounded-full ${t.chip} tw:px-2.5 tw:py-1 tw:font-mono tw:text-[11px] tw:font-medium tw:tracking-wider">${esc(p.code)}</span>
              ${statusPill(p.status)}
            </div>
            <div class="${t.textShadow}">
              <h1 class="tw:mt-4 tw:max-w-4xl tw:font-display tw:text-4xl tw:font-semibold tw:leading-[1.1] tw:tracking-tight tw:text-balance tw:md:text-5xl">${esc(p.title)}</h1>
              ${p.summary ? `<p class="tw:mt-4 tw:max-w-3xl tw:text-lg tw:leading-relaxed ${t.summary} tw:text-pretty">${esc(p.summary)}</p>` : ''}
            </div>
          </div>
        </div>
      </div>
    </header>`;
}

function joinCard(p, isParticipant) {
  return isParticipant ? `
    <div class="tw:rounded-2xl tw:bg-comb-deep/55 tw:p-6">
      <div class="tw:flex tw:items-center tw:gap-3">
        <span class="tw:grid tw:size-9 tw:shrink-0 tw:place-items-center tw:rounded-full tw:bg-amber tw:text-white">${icons.check}</span>
        <p class="tw:font-display tw:text-xl tw:font-medium tw:text-propolis">You're part of this project</p>
      </div>
      <div class="tw:mt-4">${button({ id: 'leave-project', label: 'Leave project', variant: 'outline', size: 'sm' })}</div>
    </div>` : `
    <div class="tw:rounded-2xl tw:bg-comb-deep/55 tw:p-6">
      <h2 class="tw:font-display tw:text-2xl tw:font-medium tw:text-propolis">Get involved</h2>
      <p class="tw:mt-2 tw:text-[15px] tw:leading-snug tw:text-propolis-60">
        ${p.status === 'recruiting' ? 'Actively looking for participants.' : 'Still open to new participants.'}
      </p>
      <div class="tw:mt-5">${button({ id: 'join-project', label: 'Join this project', icon: icons.plus, block: true })}</div>
    </div>`;
}

function topicCard(t) {
  return `
    <a href="${esc(t.href)}" class="tw:group tw:flex tw:items-start tw:gap-4 tw:rounded-xl tw:border tw:border-comb-shade tw:bg-white tw:p-5 tw:transition tw:duration-200 tw:hover:-translate-y-0.5 tw:hover:border-amber/60 tw:hover:shadow-lg tw:hover:shadow-propolis/5">
      <span class="tw:grid tw:size-10 tw:shrink-0 tw:place-items-center tw:rounded-lg tw:bg-amber-wash tw:text-amber-deep tw:[&>svg]:size-5">${icons.comb}</span>
      <span class="tw:min-w-0 tw:flex-1">
        <span class="tw:block tw:font-display tw:text-xl tw:font-medium tw:leading-snug tw:text-propolis tw:transition tw:group-hover:text-amber-deep">${esc(t.name)}</span>
        ${t.desc ? `<span class="tw:mt-1 tw:block tw:text-sm tw:leading-snug tw:text-propolis-60">${esc(t.desc)}</span>` : ''}
      </span>
      <span class="tw:mt-1 tw:text-propolis-40 tw:transition tw:group-hover:translate-x-0.5 tw:group-hover:text-amber-deep">${icons.chevron}</span>
    </a>`;
}

function sitesCard(p) {
  const sites = p.siteDetails || [];
  return `
    <div class="${CARD}">
      ${cardHead('Sites')}
      ${sites.length ? `
        <div class="tw:mb-3 tw:flex tw:flex-wrap tw:gap-2">
          ${sites.map((a) => `
            <a href="#/apiaries/${esc(a.id)}" class="tw:inline-flex tw:items-center tw:gap-2 tw:rounded-full tw:border tw:border-comb-shade tw:px-3 tw:py-1.5 tw:text-sm tw:text-propolis tw:transition tw:hover:border-amber tw:hover:bg-comb">
              <span class="tw:font-mono tw:text-xs tw:font-semibold tw:text-amber-deep">${esc(a.code)}</span>${esc(a.name)}
            </a>`).join('')}
        </div>` : ''}
      <p class="tw:text-sm tw:leading-snug tw:text-propolis-60">${esc(sitesLine(p))}</p>
    </div>`;
}

function participantsCard(participants) {
  return `
    <div class="${CARD}">
      ${cardHead('Participants', countBadge(participants.length))}
      ${participants.length
        ? `<ul class="tw:space-y-3">${participants.map((x) => personRow(x.member, x.contribution || '')).join('')}</ul>`
        : '<p class="tw:text-sm tw:text-propolis-60">No participants yet.</p>'}
    </div>`;
}

export function renderProject(data, id) {
  const { project: p, sections, participants, canManage, canContribute, isAdmin, isParticipant } = data;
  if (!p) return '';

  const hasAddons = sectionsOf(sections, 'participation_addons').length > 0;

  const main = `
    <div class="tw:min-w-0 tw:space-y-14 tw:lg:col-start-1 tw:lg:row-span-2 tw:lg:row-start-1">
      ${article('About this project', listSectionHTML(sections, 'background', canContribute, canManage, 'Add background', 'none'))}
      ${article('Aims', listSectionHTML(sections, 'aims', canContribute, canManage, 'Add an aim'))}
      ${article('Research questions', listSectionHTML(sections, 'questions', canContribute, canManage, 'Add a question', 'number'))}
      ${p.topics && p.topics.length
        ? article('Topic areas', `<div class="tw:grid tw:gap-4 tw:sm:grid-cols-2">${p.topics.map(topicCard).join('')}</div>`)
        : ''}
      ${article('Participation', `
        <div class="tw:mb-6">${singleSectionHTML(sections, 'participation_summary', canContribute, 'Add a participation summary', 'tw:min-w-0 tw:flex-1 tw:font-display tw:text-xl tw:leading-relaxed tw:text-propolis')}</div>
        ${listSectionHTML(sections, 'participation_method', canContribute, canManage, 'Add a participation method')}
        ${hasAddons || canContribute ? `
          <div class="tw:mt-8 tw:rounded-xl tw:bg-amber-wash/60 tw:p-5">
            ${singleSectionHTML(sections, 'participation_addons', canContribute, 'Add a note', 'tw:min-w-0 tw:flex-1 tw:text-[15px] tw:leading-relaxed tw:text-propolis')}
          </div>` : ''}`)}
      ${article('Timeline', singleSectionHTML(sections, 'timeline', canContribute, 'Add a timeline'))}
    </div>`;

  const html = `
    <div class="view">
      ${banner(p, isAdmin)}
      <div class="tw:bg-white tw:px-6 tw:py-14 tw:md:py-16">
        <div class="tw:mx-auto tw:grid tw:max-w-6xl tw:gap-x-16 tw:gap-y-10 tw:lg:grid-cols-[minmax(0,1fr)_20rem] tw:lg:grid-rows-[auto_1fr]">
          <div class="tw:lg:col-start-2 tw:lg:row-start-1">${joinCard(p, isParticipant)}</div>
          ${main}
          <aside class="tw:space-y-6 tw:self-start tw:lg:col-start-2 tw:lg:row-start-2">
            ${teamPanelHTML(data)}
            ${sitesCard(p)}
            ${participantsCard(participants)}
          </aside>
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
