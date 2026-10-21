/* ==========================================================================
   VSH research dashboard. Answers, in order: where are the apiaries and who
   runs them, what state are the hives in, and whose lines are in the
   program.

   Phases 4 and 5 of the backend migration: apiaries/hives/inspections and
   queen lines/breeders are all real Supabase rows now, loaded by the
   router (js/store.js's loadApiaries/loadQueenLines) and passed in as
   `data`, same as every other migrated view.
   ========================================================================== */

import {
  stageLabels, statusLabels,
  tally,
} from '../data.js';
import {
  isWebAdmin,
  addQueenLine, updateQueenLine, loadBreederMembers,
} from '../store.js';
import { esc, icons, avatar, modal, closeModal, toast } from '../ui.js';
import { renderComb, renderReadout, bindComb } from './comb.js';
import {
  button, pageHeader, pageBody, twoColumn, card, CARD, tag, emptyState,
} from '../components.js';

const STAGE_TONES = { establishing: 'amber', assessment: 'blue', maintenance: 'green', requeening: 'red' };

const stageTag = (stage) => tag(stageLabels[stage], STAGE_TONES[stage]);

const MONO_LABEL = 'tw:font-mono tw:text-[10.5px] tw:font-medium tw:uppercase tw:tracking-[0.12em] tw:text-propolis-40';

/* The title row of a card: small mono eyebrow over a serif title (or just a
   title), anything for the right-hand end. Same rule-under-header look as
   the shared card(); it lives inside a flush card so the figures below can
   run edge to edge. */
const cardHead = ({ eyebrow = '', title, right = '', level = 2 }) => `
  <div class="tw:flex tw:items-center tw:gap-3 tw:border-b tw:border-comb-shade/70 tw:px-6 tw:py-4">
    <div class="tw:min-w-0">
      ${eyebrow ? `<div class="${MONO_LABEL}">${eyebrow}</div>` : ''}
      <h${level} class="${eyebrow ? 'tw:mt-0.5 ' : ''}tw:font-display tw:text-xl tw:font-medium tw:text-propolis">${title}</h${level}>
    </div>
    ${right ? `<div class="tw:ml-auto tw:flex tw:shrink-0 tw:items-center tw:gap-3">${right}</div>` : ''}
  </div>`;

/* A row of figures sharing one rounded frame, divided by hairlines. */
const figureRow = (items) => `
  <dl class="tw:grid tw:grid-cols-3 tw:divide-x tw:divide-comb-shade tw:overflow-hidden tw:rounded-xl tw:border tw:border-comb-shade">
    ${items.map(({ label, value }) => `
      <div class="tw:min-w-0 tw:px-3.5 tw:py-3">
        <dt class="${MONO_LABEL} tw:text-[9.5px] tw:leading-snug">${label}</dt>
        <dd class="tw:ml-0 tw:mt-1 tw:font-display tw:text-2xl tw:font-semibold tw:leading-none tw:tracking-tight tw:text-propolis tw:tabular-nums">${value}</dd>
      </div>`).join('')}
  </dl>`;

/* The three headline figures across the top of the page. */
const headlineTiles = (items) => `
  <dl class="tw:grid tw:divide-y tw:divide-comb-shade tw:overflow-hidden tw:rounded-2xl tw:border tw:border-comb-shade tw:bg-white tw:sm:grid-cols-3 tw:sm:divide-x tw:sm:divide-y-0">
    ${items.map(({ label, value, note }) => `
      <div class="tw:px-6 tw:py-5">
        <dt class="${MONO_LABEL} tw:text-[10px]">${label}</dt>
        <dd class="tw:ml-0 tw:mt-2 tw:font-display tw:text-4xl tw:font-semibold tw:leading-none tw:tracking-tight tw:text-propolis tw:tabular-nums">${value}</dd>
        <div class="tw:mt-2 tw:text-xs tw:text-propolis-60">${note}</div>
      </div>`).join('')}
  </dl>`;

function apiaryCard(ap) {
  const t = tally(ap.hiveRecords);
  const inTreatment = t.treating || 0;
  const tf = ap.hiveRecords.filter((h) => h.treatmentFree >= 3).length;

  return `
    <a class="${CARD} tw:block tw:min-w-0 tw:overflow-hidden tw:transition tw:duration-200 tw:hover:-translate-y-0.5 tw:hover:border-amber/60 tw:hover:shadow-lg tw:hover:shadow-propolis/10" href="#/apiaries/${ap.id}">
      ${cardHead({ eyebrow: ap.code, title: esc(ap.name), level: 3, right: stageTag(ap.stage) })}
      <div class="tw:px-6 tw:py-5">
        <p class="tw:text-sm tw:text-propolis-60">${esc(ap.region)}</p>
        ${ap.address ? `<p class="tw:mt-0.5 tw:font-mono tw:text-[11px] tw:text-propolis-40">${esc(ap.address)}</p>` : ''}
        <div class="tw:mt-4">
          ${figureRow([
            { label: 'Hives', value: ap.hives },
            { label: 'Treating', value: inTreatment },
            { label: 'TF 3+ seasons', value: tf },
          ])}
        </div>
      </div>
    </a>`;
}

function colonyStatusPanel(allHives) {
  const t = tally(allHives);
  const total = allHives.length;
  const treatmentFree = allHives.filter((h) => h.treatmentFree > 0).length;
  const tf3 = allHives.filter((h) => h.treatmentFree >= 3).length;

  const bars = Object.keys(statusLabels).map((k) => {
    const n = t[k] || 0;
    if (!n) return '';
    const pct = ((n / total) * 100).toFixed(1);
    return `
      <div>
        <div class="tw:flex tw:items-center tw:gap-2 tw:text-sm">
          <span class="tw:size-2.5 tw:shrink-0 tw:rounded-full tw:ring-1 tw:ring-inset tw:ring-black/10" style="background:var(--st-${k})"></span>
          <span class="tw:text-propolis">${statusLabels[k]}</span>
          <span class="tw:ml-auto tw:font-mono tw:text-[13px] tw:tabular-nums tw:text-propolis">${n}</span>
          <span class="tw:w-12 tw:text-right tw:font-mono tw:text-[11px] tw:tabular-nums tw:text-propolis-40">${pct}%</span>
        </div>
        <div class="tw:mt-1.5 tw:h-1.5 tw:overflow-hidden tw:rounded-full tw:bg-comb-deep">
          <i class="tw:block tw:h-full tw:rounded-full tw:transition-[width] tw:duration-500" style="width:${pct}%;background:var(--st-${k})"></i>
        </div>
      </div>`;
  }).join('');

  return card({
    title: 'Colony status',
    right: `<span class="tw:font-mono tw:text-xs tw:text-propolis-40">${total} hives</span>`,
    body: `
      ${total ? `<div class="tw:space-y-3.5">${bars}</div>` : '<p class="tw:text-sm tw:text-propolis-60">No hives registered yet.</p>'}
      <div class="tw:mt-6 tw:space-y-2 tw:border-t tw:border-comb-shade/70 tw:pt-5 tw:text-sm tw:text-propolis">
        <div class="tw:flex tw:items-baseline tw:justify-between tw:gap-4">
          <span>Treatment free, any duration</span>
          <span class="tw:font-mono tw:tabular-nums">${treatmentFree}</span>
        </div>
        <div class="tw:flex tw:items-baseline tw:justify-between tw:gap-4">
          <span>Treatment free, three seasons or more</span>
          <span class="tw:font-mono tw:tabular-nums">${tf3}</span>
        </div>
        <p class="tw:pt-1 tw:text-[13px] tw:text-propolis-60">
          Colonies under treatment are excluded from selection data for the current cycle.
        </p>
      </div>`,
  });
}

function breedersPanel(lines, allHives) {
  const canManage = isWebAdmin();
  const rows = lines.map((line) => {
    const b = line.breeder;
    const inProgram = allHives.filter((h) => h.line === line.code).length;
    return `
      <div class="tw:flex tw:flex-wrap tw:gap-x-4 tw:gap-y-2 tw:border-b tw:border-comb-shade/70 tw:px-6 tw:py-4 tw:last:border-b-0 tw:sm:flex-nowrap">
        ${avatar(b)}
        <div class="tw:min-w-0 tw:flex-1 tw:basis-48">
          <div class="tw:flex tw:flex-wrap tw:items-baseline tw:gap-x-2">
            <strong class="tw:text-[15px] tw:font-semibold tw:text-propolis">${esc(b.name)}</strong>
            <span class="tw:text-sm tw:text-propolis-40">${esc(b.state || '')}</span>
          </div>
          <div class="tw:mt-0.5 tw:font-mono tw:text-xs tw:text-propolis-60">
            ${esc(line.name)} · generation ${line.gen}
          </div>
          <p class="tw:mt-1 tw:text-sm tw:text-propolis-60">${esc(line.note)}</p>
        </div>
        <div class="tw:shrink-0 tw:text-right">
          <div class="tw:font-mono tw:text-lg tw:text-propolis">${line.vshMean}<small class="tw:text-[10px] tw:text-propolis-40">%</small></div>
          <div class="tw:text-xs tw:text-propolis-40">${inProgram} hives</div>
          ${canManage ? `<button class="btn btn-ghost btn-sm tw:mt-1.5" data-edit-line="${line.code}">${icons.pen} Edit</button>` : ''}
        </div>
      </div>`;
  }).join('');

  return card({
    title: 'Contributing breeders',
    flush: true,
    right: `<span class="tw:text-sm tw:text-propolis-40 tw:max-sm:hidden">${lines.length} lines in program</span>
      ${canManage ? `<button class="btn btn-primary btn-sm" id="new-line">${icons.plus} Add queen line</button>` : ''}`,
    body: `<div id="breeders-list">${rows}</div>`,
  });
}

/* Only members holding the "Breeder" role (js/store.js's
   loadBreederMembers) are selectable — enforced again server-side by
   queen_lines_breeder_role_check, this is just what the picker offers.
   There's no "add a breeder who isn't a member" option any more: crediting
   someone who isn't yet in the directory means adding them as a member
   and giving them the Breeder role first (js/views/managers.js's role
   editor), not typing a free-text name here. */
function breederMemberOptions(breederMembers, selectedId) {
  return breederMembers.map((m) =>
    `<option value="${m.id}" ${m.id === selectedId ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
}

/* Queen lines have an internal code (hives reference a line by it — see
   hive.line), but members only ever see and edit the name; the code itself
   is generated in addQueenLine (js/store.js) and never shown here. Fetches
   the breeder-eligible member picker on open rather than requiring the
   dashboard route to preload it — same "fetch on modal open" pattern
   js/views/apiaries.js's openInspectionForm already uses. */
async function openQueenLineForm(line) {
  let breederMembers;
  try {
    breederMembers = await loadBreederMembers();
  } catch (err) {
    toast(`Couldn't load breeders: ${err.message}`);
    return;
  }
  if (!breederMembers.length) {
    toast('No member currently holds the Breeder role — assign it from a member\'s profile first.');
    return;
  }
  const selectedId = line ? line.breeder.id : null;

  const body = `
    <form id="line-form">
      <div class="field">
        <label for="ql-name">Line name</label>
        <input id="ql-name" required value="${esc(line ? line.name : '')}" placeholder="e.g. Barrowfield 15">
      </div>
      <div class="tw:flex tw:items-start tw:gap-3">
        <div class="field tw:min-w-0 tw:flex-1">
          <label for="ql-breeder">Breeder</label>
          <select id="ql-breeder">${breederMemberOptions(breederMembers, selectedId)}</select>
        </div>
        <div class="field tw:min-w-0 tw:flex-1">
          <label for="ql-gen">Generation</label>
          <input id="ql-gen" type="number" min="1" value="${line ? line.gen : 1}">
        </div>
      </div>
      <div class="field">
        <label for="ql-vsh">Mean VSH (%)</label>
        <input id="ql-vsh" type="number" min="0" max="100" value="${line ? line.vshMean ?? '' : ''}" placeholder="optional">
      </div>
      <div class="field">
        <label for="ql-note">Note</label>
        <textarea id="ql-note" placeholder="What's notable about this line?">${esc(line ? line.note || '' : '')}</textarea>
      </div>
    </form>`;

  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-primary" id="save-line">${line ? 'Save changes' : 'Add queen line'}</button>`;

  const scrim = modal({ title: line ? `Edit queen line — ${line.name}` : 'Add a queen line', body, actions });
  const saveBtn = scrim.querySelector('#save-line');

  saveBtn.addEventListener('click', async () => {
    const name = scrim.querySelector('#ql-name').value.trim();
    const vshRaw = scrim.querySelector('#ql-vsh').value;
    const breederMemberId = scrim.querySelector('#ql-breeder').value;
    if (!name) {
      toast('Enter a line name.');
      return;
    }
    if (!breederMemberId) {
      toast('Choose a breeder.');
      return;
    }

    const patch = {
      name,
      breederMemberId,
      generation: Number(scrim.querySelector('#ql-gen').value) || 1,
      vshMean: vshRaw ? Number(vshRaw) : null,
      note: scrim.querySelector('#ql-note').value.trim(),
    };

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      if (line) await updateQueenLine(line.code, patch);
      else await addQueenLine(patch);
    } catch (err) {
      toast(`Couldn't save: ${err.message}`);
      saveBtn.disabled = false;
      saveBtn.textContent = line ? 'Save changes' : 'Add queen line';
      return;
    }
    closeModal();
    toast(`${name} ${line ? 'updated' : 'added to the program'}.`);
    window.__aqbba_invalidateData();
    window.__aqbba_render();
  });
}

export function renderDashboard(data) {
  const { apiaries, queenLines } = data;
  const allHives = apiaries.flatMap((a) => a.hiveRecords);
  const t = tally(allHives);
  const focus = apiaries.find((a) => a.stage === 'assessment') || apiaries[0];
  const attention = allHives.filter((h) => h.status === 'poor' || h.status === 'critical').length;

  const focusCard = focus ? card({
    flush: true,
    body: `
      ${cardHead({
        eyebrow: `${focus.code} · ${esc(focus.region)}`,
        title: `${esc(focus.name)} — every hive`,
        right: stageTag(focus.stage),
      })}
      <div class="tw:px-6 tw:py-5">
        <p class="tw:mb-4 tw:text-sm tw:text-propolis-60">
          ${focus.hiveRecords.length} hives. One cell per hive, coloured by colony status.
        </p>
        ${focus.hiveRecords.length ? renderComb(focus.hiveRecords, { id: 'dash-comb' }) : '<p class="tw:text-sm tw:text-propolis-60">No hives registered yet.</p>'}
      </div>
      ${focus.hiveRecords.length ? renderReadout(null) : ''}`,
  }) : '';

  const html = `
    <div class="view">
      ${pageHeader({
        crumbs: [
          { label: 'Projects', href: '#/projects' },
          { label: 'Varroa Sensitive Hygiene Breeding Program', href: '#/projects/p0' },
          { label: 'Dashboard' },
        ],
        eyebrow: 'PRJ-00',
        title: 'Research dashboard',
        actions: button({ href: '#/apiaries', label: 'All apiaries', variant: 'outline', size: 'sm' }),
      })}
      ${pageBody(`
        <div class="tw:space-y-8">
          ${headlineTiles([
            { label: 'Hives under management', value: allHives.length, note: `across ${apiaries.length} research apiaries` },
            { label: 'Treating', value: t.treating || 0, note: 'excluded from selection this cycle' },
            { label: 'Needs attention', value: attention, note: attention ? 'above intervention threshold' : 'nothing above threshold' },
          ])}

          <div class="tw:grid tw:gap-6 tw:sm:grid-cols-2 tw:lg:grid-cols-3">
            ${apiaries.map(apiaryCard).join('')}
          </div>

          ${focus
            ? twoColumn({ main: focusCard, side: colonyStatusPanel(allHives) })
            : emptyState({ title: 'No research apiaries yet' })}

          ${breedersPanel(queenLines, allHives)}
        </div>`)}
    </div>`;

  /* Bind after paint. */
  setTimeout(() => {
    const root = document.getElementById('main');
    if (root && focus && focus.hiveRecords.length) bindComb(root, focus.hiveRecords);

    const newLineBtn = document.getElementById('new-line');
    if (newLineBtn) newLineBtn.addEventListener('click', () => openQueenLineForm());

    const list = document.getElementById('breeders-list');
    if (list) list.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-edit-line]');
      if (!btn) return;
      const line = queenLines.find((l) => l.code === btn.dataset.editLine);
      if (line) openQueenLineForm(line);
    });
  }, 0);

  return html;
}
