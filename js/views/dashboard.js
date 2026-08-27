/* ==========================================================================
   VSH research dashboard. Answers, in order: where are the apiaries and who
   runs them, what state are the hives in, what has been inspected and what is
   next, and whose lines are in the program.
   ========================================================================== */

import {
  stageLabels, statusLabels, projects,
  tally, vshAverage, relDays, fmtDate, fmtDateLong,
} from '../data.js';
import {
  allApiaries, allApiaryById, allRecentInspections, allUpcomingInspections, isWebAdmin,
  allQueenLines, lineByCode, addQueenLine, updateQueenLine,
  allBreeders, breederById, addBreeder, updateBreeder, memberById, allMembers,
} from '../store.js';
import { esc, icons, avatar, tag, modal, closeModal, toast } from '../ui.js';
import { renderComb, renderReadout, bindComb } from './comb.js';

/* Recomputed on every call rather than cached at module load, since member-
   added apiaries and hives can change between renders. */
const getAllHives = () => allApiaries().flatMap((a) => a.hiveRecords);

function stageTag(stage) {
  const v = { establishing: 'tag-amber', assessment: 'tag-blue', maintenance: 'tag-green', requeening: 'tag-red' }[stage];
  return `<span class="tag ${v}">${stageLabels[stage]}</span>`;
}

function apiaryCard(ap) {
  const t = tally(ap.hiveRecords);
  const mgr = memberById(ap.manager);
  const vsh = vshAverage(ap.hiveRecords);
  const inTreatment = t.treating || 0;
  const tf = ap.hiveRecords.filter((h) => h.treatmentFree >= 3).length;

  return `
    <a class="panel" href="#/apiaries/${ap.id}" style="display:block;transition:box-shadow .2s var(--ease),transform .2s var(--ease)">
      <div class="panel-head">
        <div style="min-width:0">
          <div class="eyebrow">${ap.code}</div>
          <h3 style="margin-top:2px">${esc(ap.name)}</h3>
        </div>
        <span class="spacer"></span>
        ${stageTag(ap.stage)}
      </div>
      <div class="panel-body">
        <p class="caption">${esc(ap.region)}</p>
        <p class="mono caption" style="font-size:11px;margin-top:2px">${ap.coords}</p>

        <div class="row" style="margin-top:var(--s4);gap:var(--s2)">
          ${avatar(mgr)}
          <div>
            <div style="font-size:13px;font-weight:600">${esc(mgr.name)}</div>
            <div class="caption">Manager · member since ${mgr.since}</div>
          </div>
        </div>

        <dl class="tiles tiles-quad" style="margin-top:var(--s5);border-radius:3px">
          <div class="tile" style="padding:var(--s3) var(--s4)">
            <dt>Hives</dt><dd style="font-size:1.375rem">${ap.hives}</dd>
          </div>
          <div class="tile" style="padding:var(--s3) var(--s4)">
            <dt>Mean VSH</dt><dd style="font-size:1.375rem">${vsh}<small>%</small></dd>
          </div>
          <div class="tile" style="padding:var(--s3) var(--s4)">
            <dt>Treating</dt><dd style="font-size:1.375rem">${inTreatment}</dd>
          </div>
          <div class="tile" style="padding:var(--s3) var(--s4)">
            <dt>TF 3+ seasons</dt><dd style="font-size:1.375rem">${tf}</dd>
          </div>
        </dl>
      </div>
    </a>`;
}

function inspectionLine(insp, { showDate = 'day' } = {}) {
  const ap = allApiaryById(insp.apiary);
  const by = memberById(insp.by);
  const d = insp.date;
  return `
    <li>
      <a class="line" href="#/apiaries/${ap.id}">
        <div class="line-date">
          <b>${d.getDate()}</b>
          ${d.toLocaleDateString('en-AU', { month: 'short' })}
        </div>
        <div class="line-body">
          <strong>${esc(insp.kind)}</strong>
          <span>${esc(ap.name)} · ${insp.hiveIds.length} hive${insp.hiveIds.length > 1 ? 's' : ''} · ${esc(by.name)}</span>
        </div>
        <div class="line-meta">
          <div class="caption mono">${relDays(insp.offset)}</div>
          ${insp.done ? `<span class="tag tag-green" style="margin-top:3px">Complete</span>` : ''}
        </div>
      </a>
    </li>`;
}

function colonyStatusPanel() {
  const allHives = getAllHives();
  const t = tally(allHives);
  const total = allHives.length;
  const treatmentFree = allHives.filter((h) => h.treatmentFree > 0).length;
  const tf3 = allHives.filter((h) => h.treatmentFree >= 3).length;

  const bars = Object.keys(statusLabels).map((k) => {
    const n = t[k] || 0;
    if (!n) return '';
    const pct = ((n / total) * 100).toFixed(1);
    return `
      <div style="margin-bottom:var(--s3)">
        <div class="row" style="gap:var(--s2);margin-bottom:4px">
          <span class="pip pip-${k}"></span>
          <span style="font-size:13px">${statusLabels[k]}</span>
          <span class="spacer"></span>
          <span class="mono" style="font-size:12.5px">${n}</span>
          <span class="mono caption" style="font-size:11px;width:44px;text-align:right">${pct}%</span>
        </div>
        <div class="meter">
          <i style="width:${pct}%;background:var(--st-${k})"></i>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="panel">
      <div class="panel-head">
        <h2>Colony status</h2>
        <span class="spacer"></span>
        <span class="caption mono">${total} hives</span>
      </div>
      <div class="panel-body">
        ${bars}
        <div style="margin-top:var(--s5);padding-top:var(--s4);border-top:1px solid var(--comb-shade)">
          <div class="row" style="justify-content:space-between">
            <span style="font-size:13px">Treatment free, any duration</span>
            <span class="mono" style="font-size:13px">${treatmentFree}</span>
          </div>
          <div class="row" style="justify-content:space-between;margin-top:var(--s2)">
            <span style="font-size:13px">Treatment free, three seasons or more</span>
            <span class="mono" style="font-size:13px">${tf3}</span>
          </div>
          <p class="caption" style="margin-top:var(--s3)">
            Colonies under treatment are excluded from selection data for the current cycle.
          </p>
        </div>
      </div>
    </div>`;
}

function breedersPanel() {
  const allHives = getAllHives();
  const lines = allQueenLines();
  const canManage = isWebAdmin();
  const rows = lines.map((line) => {
    const b = breederById(line.breeder);
    const inProgram = allHives.filter((h) => h.line === line.code).length;
    return `
      <div class="breeder">
        ${avatar(b)}
        <div style="flex:1;min-width:0">
          <div class="row" style="gap:var(--s2)">
            <strong style="font-size:13.5px">${esc(b.name)}</strong>
            <span class="caption">${esc(b.state || '')}</span>
          </div>
          <div class="mono" style="font-size:12px;color:var(--propolis-60);margin-top:2px">
            ${esc(line.name)} · generation ${line.gen}
          </div>
          <p class="caption" style="margin-top:4px">${esc(line.note)}</p>
        </div>
        <div style="flex:none;text-align:right">
          <div class="mono" style="font-size:1.0625rem">${line.vshMean}<small style="font-size:10px;color:var(--propolis-40)">%</small></div>
          <div class="caption" style="font-size:11px">${inProgram} hives</div>
          ${canManage ? `<button class="btn btn-ghost btn-sm" style="margin-top:6px" data-edit-line="${line.code}">${icons.pen} Edit</button>` : ''}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="panel">
      <div class="panel-head">
        <h2>Contributing breeders</h2>
        <span class="spacer"></span>
        <span class="caption" style="margin-right:var(--s3)">${lines.length} lines in program</span>
        ${canManage ? `
          <button class="btn btn-ghost btn-sm" id="new-breeder">${icons.plus} Add breeder</button>
          <button class="btn btn-primary btn-sm" id="new-line">${icons.plus} Add queen line</button>
        ` : ''}
      </div>
      <div class="panel-body panel-body-flush" id="breeders-list">${rows}</div>
    </div>`;
}

function breederOptions(selectedId) {
  const memberOpts = allMembers().map((m) =>
    `<option value="${m.id}" ${m.id === selectedId ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
  const standalone = allBreeders();
  const standaloneOpts = standalone.map((b) =>
    `<option value="${b.id}" ${b.id === selectedId ? 'selected' : ''}>${esc(b.name)} (not a member)</option>`).join('');

  return `
    <optgroup label="Members">${memberOpts}</optgroup>
    ${standalone.length ? `<optgroup label="Breeders (not a platform member)">${standaloneOpts}</optgroup>` : ''}`;
}

/* Breeders are a lightweight record independent of Members — just enough to
   credit a queen line to someone who isn't a registered platform member.
   No login, no roles; see breederById in js/store.js for how a queen
   line's breeder field resolves either kind uniformly. */
function openBreederForm(breeder) {
  const body = `
    <form id="breeder-form">
      <div class="field">
        <label for="br-name">Name</label>
        <input id="br-name" required value="${esc(breeder ? breeder.name : '')}">
      </div>
      <div class="field">
        <label for="br-state">State (optional)</label>
        <input id="br-state" placeholder="e.g. NSW" value="${esc(breeder ? breeder.state || '' : '')}">
      </div>
      <div class="field">
        <label for="br-note">Note (optional)</label>
        <textarea id="br-note" placeholder="Anything worth knowing about this breeder">${esc(breeder ? breeder.note || '' : '')}</textarea>
      </div>
    </form>`;

  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-primary" id="save-breeder">${breeder ? 'Save changes' : 'Add breeder'}</button>`;

  const scrim = modal({ title: breeder ? `Edit breeder — ${breeder.name}` : 'Add a breeder', body, actions });

  scrim.querySelector('#save-breeder').addEventListener('click', () => {
    const name = scrim.querySelector('#br-name').value.trim();
    if (!name) {
      toast('Enter a name.');
      return;
    }

    const patch = {
      name,
      state: scrim.querySelector('#br-state').value.trim(),
      note: scrim.querySelector('#br-note').value.trim(),
    };

    if (breeder) updateBreeder(breeder.id, patch);
    else addBreeder(patch);

    closeModal();
    toast(breeder ? `${name} updated.` : `${name} added as a breeder.`);
    window.__aqbba_render();
  });
}

/* Queen lines have an internal code (hives reference a line by it — see
   hive.line), but members only ever see and edit the name; the code itself
   is generated in addQueenLine (js/store.js) and never shown here. */
function openQueenLineForm(line) {
  const body = `
    <form id="line-form">
      <div class="field">
        <label for="ql-name">Line name</label>
        <input id="ql-name" required value="${esc(line ? line.name : '')}" placeholder="e.g. Barrowfield 15">
      </div>
      <div class="row" style="gap:var(--s3);align-items:flex-start">
        <div class="field" style="flex:1">
          <label for="ql-breeder">Breeder</label>
          <select id="ql-breeder">${breederOptions(line ? line.breeder : null)}</select>
        </div>
        <div class="field" style="flex:1">
          <label for="ql-gen">Generation</label>
          <input id="ql-gen" type="number" min="1" value="${line ? line.gen : 1}">
        </div>
      </div>
      <div class="field">
        <label for="ql-vsh">Mean VSH (%)</label>
        <input id="ql-vsh" type="number" min="0" max="100" value="${line ? line.vshMean : ''}" placeholder="optional">
      </div>
      <div class="field">
        <label for="ql-note">Note</label>
        <textarea id="ql-note" placeholder="What's notable about this line?">${esc(line ? line.note : '')}</textarea>
      </div>
    </form>`;

  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-primary" id="save-line">${line ? 'Save changes' : 'Add queen line'}</button>`;

  const scrim = modal({ title: line ? `Edit queen line — ${line.name}` : 'Add a queen line', body, actions });

  scrim.querySelector('#save-line').addEventListener('click', () => {
    const name = scrim.querySelector('#ql-name').value.trim();
    const vshRaw = scrim.querySelector('#ql-vsh').value;
    if (!name) {
      toast('Enter a line name.');
      return;
    }

    const patch = {
      name,
      breeder: scrim.querySelector('#ql-breeder').value,
      gen: Number(scrim.querySelector('#ql-gen').value) || 1,
      vshMean: vshRaw ? Number(vshRaw) : 0,
      note: scrim.querySelector('#ql-note').value.trim(),
    };

    if (line) updateQueenLine(line.code, patch);
    else addQueenLine(patch);

    closeModal();
    toast(`${name} ${line ? 'updated' : 'added to the program'}.`);
    window.__aqbba_render();
  });
}

export function renderDashboard() {
  const apiaries = allApiaries();
  const allHives = getAllHives();
  const upcomingInspections = allUpcomingInspections();
  const recentInspections = allRecentInspections();
  const t = tally(allHives);
  const focus = apiaries.find((a) => a.stage === 'assessment') || apiaries[0];
  const attention = allHives.filter((h) => h.status === 'poor').length;
  const next = upcomingInspections[0];

  const html = `
    <div class="topbar">
      <div style="width:100%">
        <div class="crumb">
          <a href="#/projects">Projects</a> ${icons.chevron}
          <a href="#/projects/p0">Varroa Sensitive Hygiene Breeding Program</a> ${icons.chevron}
          <span>Dashboard</span>
        </div>
        <div class="eyebrow">PRJ-00 · 2026 season</div>
        <h1>Research dashboard</h1>
      </div>
      <div class="topbar-actions">
        <a class="btn btn-ghost btn-sm" href="#/apiaries">All apiaries ${icons.chevron}</a>
      </div>
    </div>

    <div class="wrap view">
      <dl class="tiles">
        <div class="tile">
          <dt>Hives under management</dt>
          <dd>${allHives.length}</dd>
          <div class="tile-trend">across ${apiaries.length} research apiaries</div>
        </div>
        <div class="tile">
          <dt>Program mean VSH</dt>
          <dd>${vshAverage(allHives)}<small>%</small></dd>
          <div class="tile-trend"><b>+4</b> on last season</div>
        </div>
        <div class="tile">
          <dt>Treating</dt>
          <dd>${t.treating || 0}</dd>
          <div class="tile-trend">excluded from selection this cycle</div>
        </div>
        <div class="tile">
          <dt>Needs attention</dt>
          <dd>${attention}</dd>
          <div class="tile-trend">${attention ? 'above intervention threshold' : 'nothing above threshold'}</div>
        </div>
        <div class="tile">
          <dt>Next inspection</dt>
          <dd style="font-size:1.125rem;letter-spacing:0">${fmtDate(next.date)}</dd>
          <div class="tile-trend">${esc(allApiaryById(next.apiary).name)} · ${esc(next.kind)}</div>
        </div>
        <div class="tile">
          <dt>Research projects</dt>
          <dd>${projects.length}</dd>
          <div class="tile-trend">${projects.filter((p) => p.status === 'recruiting').length} recruiting — <a href="#/projects" style="color:var(--amber-deep);font-weight:600">view all</a></div>
        </div>
      </dl>

      <div class="grid grid-3" style="margin-top:var(--s6)">
        ${apiaries.map(apiaryCard).join('')}
      </div>

      <div class="grid grid-dash" style="margin-top:var(--s6)">
        <div class="stack">
          <div class="panel">
            <div class="panel-head">
              <div style="min-width:0">
                <div class="eyebrow">${focus.code} · ${esc(focus.region)}</div>
                <h2 style="margin-top:2px">${esc(focus.name)} — every hive</h2>
              </div>
              <span class="spacer"></span>
              ${stageTag(focus.stage)}
            </div>
            <div class="panel-body">
              <p class="caption" style="margin-bottom:var(--s4)">
                ${focus.hiveRecords.length} hives. One cell per hive, coloured by colony status.
              </p>
              ${renderComb(focus.hiveRecords, { id: 'dash-comb' })}
            </div>
            ${renderReadout(null)}
          </div>

          <div class="panel">
            <div class="panel-head">
              <h2>Recently completed</h2>
              <span class="spacer"></span>
              <span class="caption mono">${recentInspections.length}</span>
            </div>
            <ul class="list">${recentInspections.map((i) => inspectionLine(i)).join('')}</ul>
          </div>
        </div>

        <div class="stack">
          ${colonyStatusPanel()}

          <div class="panel">
            <div class="panel-head">
              <h2>Upcoming inspections</h2>
              <span class="spacer"></span>
              <span class="caption mono">${upcomingInspections.length}</span>
            </div>
            <ul class="list">${upcomingInspections.map((i) => inspectionLine(i)).join('')}</ul>
          </div>
        </div>
      </div>

      <div style="margin-top:var(--s6)">
        ${breedersPanel()}
      </div>
    </div>`;

  /* Bind after paint. */
  setTimeout(() => {
    const root = document.getElementById('main');
    if (root) bindComb(root, focus.hiveRecords);

    const newBreederBtn = document.getElementById('new-breeder');
    if (newBreederBtn) newBreederBtn.addEventListener('click', () => openBreederForm());

    const newLineBtn = document.getElementById('new-line');
    if (newLineBtn) newLineBtn.addEventListener('click', () => openQueenLineForm());

    const list = document.getElementById('breeders-list');
    if (list) list.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-edit-line]');
      if (!btn) return;
      const line = lineByCode(btn.dataset.editLine);
      if (line) openQueenLineForm(line);
    });
  }, 0);

  return html;
}
