/* ==========================================================================
   Apiary index and the per-apiary record — plus the maintenance flows for
   registering a new research apiary, registering a new hive, and logging an
   inspection. These alter the program's own research data rather than
   adding member social content, which is why they live here rather than
   following the forum/marketplace composer pattern exactly.
   ========================================================================== */

import {
  stageLabels, statusLabels, memberById, members, queenLines,
  lineByCode, tally, vshAverage, relDays, fmtDateLong,
  projects, projectStatusLabels, inspectionKinds, queenColours,
} from '../data.js';
import {
  allApiaries, allApiaryById, allInspections, memberProjects, hasContact,
  addApiary, addHive, addInspection, roleLabel, isWebAdmin, canEditApiary,
} from '../store.js';
import { esc, icons, avatar, modal, closeModal, toast } from '../ui.js';
import { renderComb, renderReadout, bindComb } from './comb.js';

/* Member-proposed projects sit alongside the seeded ones, same as everywhere
   else member-authored content is combined with the seed data. */
const projectsForApiary = (apiaryId) =>
  [...memberProjects(), ...projects].filter((p) => p.sites.includes(apiaryId));

const stageVariant = { initialising: 'tag-amber', assessment: 'tag-blue', maintenance: 'tag-green' };

export function renderApiaries() {
  const apiaries = allApiaries();

  const rows = apiaries.map((ap) => {
    const t = tally(ap.hiveRecords);
    const mgr = memberById(ap.manager);
    return `
      <tr>
        <td>
          <a href="#/apiaries/${ap.id}" style="font-weight:600">${esc(ap.name)}</a>
          <div class="caption mono" style="font-size:11px">${ap.code}</div>
        </td>
        <td>${esc(ap.region)}</td>
        <td><span class="tag ${stageVariant[ap.stage]}">${stageLabels[ap.stage]}</span></td>
        <td><a href="#/managers/${mgr.id}">${esc(mgr.name)}</a></td>
        <td class="mono">${ap.hives}</td>
        <td class="mono">${vshAverage(ap.hiveRecords)}%</td>
        <td class="mono">${t.treatment || 0}</td>
        <td class="mono">${t.critical || 0}</td>
        <td>${ap.established}</td>
      </tr>`;
  }).join('');

  const html = `
    <div class="topbar">
      <div style="width:100%">
        <div class="eyebrow">Program sites</div>
        <h1>Research apiaries</h1>
      </div>
      <div class="topbar-actions">
        ${isWebAdmin() ? `<button class="btn btn-primary btn-sm" id="new-apiary">${icons.plus} Add apiary</button>` : ''}
      </div>
    </div>

    <div class="wrap view">
      <div class="panel">
        <div class="tbl-scroll">
          <table class="tbl">
            <thead>
              <tr>
                <th>Apiary</th><th>Region</th><th>Stage</th><th>Manager</th>
                <th>Hives</th><th>Mean VSH</th><th>Treating</th><th>Critical</th><th>Est.</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>

      <div class="grid grid-3" style="margin-top:var(--s6)">
        ${apiaries.map((ap) => `
          <div class="panel">
            <div class="panel-head">
              <h3>${esc(ap.name)}</h3>
              <span class="spacer"></span>
              <span class="tag ${stageVariant[ap.stage]}">${stageLabels[ap.stage]}</span>
            </div>
            <div class="panel-body">
              <p class="lede" style="font-size:14px">${esc(ap.brief)}</p>
              <div style="margin-top:var(--s4)">
                <div class="eyebrow">Dominant flora</div>
                <p style="font-size:13px;margin-top:3px">${esc(ap.flora)}</p>
              </div>
              <a class="btn btn-ghost btn-sm" style="margin-top:var(--s4)" href="#/apiaries/${ap.id}">
                Open record ${icons.chevron}
              </a>
            </div>
          </div>`).join('')}
      </div>
    </div>`;

  setTimeout(() => {
    const btn = document.getElementById('new-apiary');
    if (btn) btn.addEventListener('click', openApiaryForm);
  }, 0);

  return html;
}

function openApiaryForm() {
  const stageOptions = Object.entries(stageLabels)
    .map(([v, label]) => `<option value="${v}" ${v === 'initialising' ? 'selected' : ''}>${label}</option>`).join('');
  const managerOptions = members.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('');

  const body = `
    <form id="apiary-form">
      <div class="field">
        <label for="a-name">Site name</label>
        <input id="a-name" required placeholder="e.g. Ironbark Ridge">
      </div>
      <div class="row" style="gap:var(--s3);align-items:flex-start">
        <div class="field" style="flex:1">
          <label for="a-region">Region</label>
          <input id="a-region" required placeholder="e.g. Southern Highlands, NSW">
        </div>
        <div class="field" style="flex:1">
          <label for="a-established">Year established</label>
          <input id="a-established" type="number" placeholder="${new Date().getFullYear()}" value="${new Date().getFullYear()}">
        </div>
      </div>
      <div class="field">
        <label for="a-coords">Coordinates (optional)</label>
        <input id="a-coords" placeholder="e.g. 34.5° S, 150.6° E">
      </div>
      <div class="row" style="gap:var(--s3);align-items:flex-start">
        <div class="field" style="flex:1">
          <label for="a-stage">Program stage</label>
          <select id="a-stage">${stageOptions}</select>
        </div>
        <div class="field" style="flex:1">
          <label for="a-manager">Manager</label>
          <select id="a-manager">${managerOptions}</select>
        </div>
      </div>
      <div class="field">
        <label for="a-flora">Dominant flora</label>
        <input id="a-flora" placeholder="e.g. Yellow box, red stringybark">
      </div>
      <div class="field">
        <label for="a-brief">Brief</label>
        <textarea id="a-brief" required placeholder="What is this site for? Why was it established?"></textarea>
      </div>
    </form>`;

  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-primary" id="pub-apiary">Add apiary</button>`;

  const scrim = modal({ title: 'Add a research apiary', body, actions });

  scrim.querySelector('#pub-apiary').addEventListener('click', () => {
    const name = scrim.querySelector('#a-name').value.trim();
    const region = scrim.querySelector('#a-region').value.trim();
    const brief = scrim.querySelector('#a-brief').value.trim();
    if (!name || !region || !brief) {
      toast('Add a site name, region and brief before saving.');
      return;
    }

    const ap = addApiary({
      name, region, brief,
      coords: scrim.querySelector('#a-coords').value.trim(),
      flora: scrim.querySelector('#a-flora').value.trim(),
      stage: scrim.querySelector('#a-stage').value,
      manager: scrim.querySelector('#a-manager').value,
      established: Number(scrim.querySelector('#a-established').value) || undefined,
    });
    closeModal();
    toast(`${ap.name} added. It's now visible to all members.`);
    location.hash = `#/apiaries/${ap.id}`;
  });
}

export function renderApiary(id) {
  const ap = allApiaryById(id);
  if (!ap) return '';

  const hives = ap.hiveRecords;
  const t = tally(hives);
  const mgr = memberById(ap.manager);
  const insp = allInspections().filter((i) => i.apiary === ap.id).sort((a, b) => a.date - b.date);
  const siteProjects = projectsForApiary(ap.id);
  const canEdit = canEditApiary(ap.id);
  const projStatusVariant = { recruiting: 'tag-amber', active: 'tag-green', concluding: 'tag-blue' };

  /* Which lines are here, and how each is performing on this site. */
  const lineCodes = [...new Set(hives.map((h) => h.line))];
  const lineRows = lineCodes.map((code) => {
    const line = lineByCode(code);
    const set = hives.filter((h) => h.line === code);
    const scored = set.filter((h) => h.vsh != null);
    const mean = scored.length ? Math.round(scored.reduce((s, h) => s + h.vsh, 0) / scored.length) : 0;
    const delta = mean - line.vshMean;
    const b = memberById(line.breeder);
    return `
      <tr>
        <td class="mono">${line.code}</td>
        <td>${esc(line.name)}</td>
        <td>${esc(b.name)}</td>
        <td class="mono">${set.length}</td>
        <td class="mono">${mean}%</td>
        <td class="mono" style="color:${delta >= 0 ? 'var(--mark-green)' : 'var(--mark-red)'}">
          ${delta >= 0 ? '+' : ''}${delta}
        </td>
      </tr>`;
  }).join('');

  const inspRows = insp.map((i) => {
    const by = memberById(i.by);
    const hiveList = hives.length && hives.every((h) => i.hiveIds.includes(h.id))
      ? 'All Hives'
      : i.hiveIds.join(', ');
    return `
      <li>
        <div class="line" style="cursor:default">
          <div class="line-date">
            <b>${i.date.getDate()}</b>
            ${i.date.toLocaleDateString('en-AU', { month: 'short' })}
          </div>
          <div class="line-body">
            <strong>${esc(i.kind)}</strong>
            <span>${esc(hiveList)} · ${esc(by.name)}${i.status ? ` · → ${statusLabels[i.status]}` : ''}</span>
            <p class="caption" style="margin-top:3px">${esc(i.note)}</p>
          </div>
          <div class="line-meta">
            <div class="caption mono">${relDays(i.offset)}</div>
            <span class="tag ${i.done ? 'tag-green' : 'tag-outline'}" style="margin-top:3px">
              ${i.done ? 'Complete' : 'Scheduled'}
            </span>
          </div>
        </div>
      </li>`;
  }).join('');

  const html = `
    <div class="topbar">
      <div style="width:100%">
        <div class="crumb">
          <a href="#/apiaries">Apiaries</a> ${icons.chevron} <span>${esc(ap.name)}</span>
        </div>
        <div class="eyebrow">${ap.code} · established ${ap.established}</div>
        <h1>${esc(ap.name)}</h1>
      </div>
      <div class="topbar-actions">
        <span class="tag ${stageVariant[ap.stage]}">${stageLabels[ap.stage]}</span>
      </div>
    </div>

    <div class="wrap view">
      <div class="grid grid-dash">
        <div class="stack">
          <div class="panel">
            <div class="panel-head">
              <h2>Hive status — all ${hives.length}</h2>
              <span class="spacer"></span>
              ${canEdit ? `<button class="btn btn-ghost btn-sm" id="new-hive">${icons.plus} Add hive</button>` : ''}
            </div>
            <div class="panel-body">
              ${hives.length ? renderComb(hives, { id: 'ap-comb' }) : `
                <div class="empty" style="padding:var(--s6) 0">
                  <h3>No hives registered yet</h3>
                  ${canEdit ? `
                    <p>Add the first hive at this site once nucs or colonies are in place.</p>
                    <button class="btn btn-primary" id="empty-hive">Add hive</button>
                  ` : `
                    <p>Only ${esc(ap.name)}'s assigned managers, or the research coordinator, can add hives here.</p>
                  `}
                </div>`}
            </div>
            ${hives.length ? renderReadout(null) : ''}
          </div>

          ${hives.length ? `
          <div class="panel">
            <div class="panel-head"><h2>Queen lines on this site</h2></div>
            <div class="tbl-scroll">
              <table class="tbl">
                <thead>
                  <tr><th>Code</th><th>Line</th><th>Breeder</th><th>Hives</th><th>Site VSH</th><th>vs line mean</th></tr>
                </thead>
                <tbody>${lineRows}</tbody>
              </table>
            </div>
          </div>` : ''}

          <div class="panel">
            <div class="panel-head">
              <h2>Inspection schedule</h2>
              <span class="spacer"></span>
              ${canEdit ? `<button class="btn btn-ghost btn-sm" id="new-inspection">${icons.plus} Log inspection</button>` : ''}
            </div>
            ${insp.length ? `<ul class="list">${inspRows}</ul>` : `
              <div class="empty">
                <h3>No inspections logged</h3>
                <p>${canEdit ? 'Log one once an assessment has run at this site.' : `Only ${esc(ap.name)}'s assigned managers, or the research coordinator, can log inspections here.`}</p>
              </div>`}
          </div>
        </div>

        <div class="stack">
          <div class="panel">
            <div class="panel-head"><h2>Site</h2></div>
            <div class="panel-body">
              <p class="lede" style="font-size:14.5px">${esc(ap.brief)}</p>

              <div style="margin-top:var(--s5)">
                <div class="eyebrow">Location</div>
                <p style="font-size:13.5px;margin-top:3px">${esc(ap.region)}</p>
                <p class="mono caption" style="font-size:11.5px">${esc(ap.coords)}</p>
              </div>

              <div style="margin-top:var(--s4)">
                <div class="eyebrow">Dominant flora</div>
                <p style="font-size:13.5px;margin-top:3px">${esc(ap.flora)}</p>
              </div>

              <div style="margin-top:var(--s5);padding-top:var(--s4);border-top:1px solid var(--comb-shade)">
                <div class="eyebrow" style="margin-bottom:var(--s3)">Manager</div>
                <a class="row" style="gap:var(--s3)" href="#/managers/${mgr.id}">
                  ${avatar(mgr)}
                  <div style="flex:1;min-width:0">
                    <div style="font-size:13.5px;font-weight:600">${esc(mgr.name)}</div>
                    <div class="caption">${esc(roleLabel(mgr.id))} · ${mgr.state}</div>
                  </div>
                  ${hasContact(mgr.id) ? '' : `<span class="tag tag-amber" style="flex:none">No contact on file</span>`}
                </a>
              </div>
            </div>
          </div>

          ${siteProjects.length ? `
            <div class="panel">
              <div class="panel-head">
                <h2>Running here</h2>
                <span class="spacer"></span>
                <span class="caption mono">${siteProjects.length}</span>
              </div>
              <div class="panel-body panel-body-flush">
                ${siteProjects.map((p) => `
                  <a class="sub" href="#/projects/${p.id}">
                    <div class="sub-title">
                      <strong>${esc(p.title)}</strong>
                      <span>${p.code}</span>
                    </div>
                    <span class="tag ${projStatusVariant[p.status]}">${projectStatusLabels[p.status]}</span>
                  </a>`).join('')}
              </div>
            </div>` : ''}

          <div class="panel">
            <div class="panel-head"><h2>Counts</h2></div>
            <div class="panel-body">
              ${hives.length ? Object.keys(statusLabels).filter((k) => t[k]).map((k) => `
                <div class="row" style="justify-content:space-between;padding:5px 0">
                  <span class="row" style="gap:var(--s2)">
                    <span class="pip pip-${k}"></span>
                    <span style="font-size:13px">${statusLabels[k]}</span>
                  </span>
                  <span class="mono" style="font-size:13px">${t[k]}</span>
                </div>`).join('') : `<p class="caption">No hives yet.</p>`}
              ${hives.length ? `
              <div class="row" style="justify-content:space-between;padding-top:var(--s3);margin-top:var(--s2);border-top:1px solid var(--comb-shade)">
                <span style="font-size:13px;font-weight:600">Mean VSH</span>
                <span class="mono" style="font-size:13px;font-weight:600">${vshAverage(hives)}%</span>
              </div>` : ''}
            </div>
          </div>
        </div>
      </div>
    </div>`;

  setTimeout(() => {
    const root = document.getElementById('main');
    if (root && hives.length) bindComb(root, hives);

    ['new-hive', 'empty-hive'].forEach((elId) => {
      const btn = document.getElementById(elId);
      if (btn) btn.addEventListener('click', () => openHiveForm(ap));
    });

    const instBtn = document.getElementById('new-inspection');
    if (instBtn) instBtn.addEventListener('click', () => openInspectionForm(ap));
  }, 0);

  return html;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function openHiveForm(ap) {
  const lineOptions = queenLines.map((l) => `<option value="${l.code}">${l.code} · ${esc(l.name)}</option>`).join('');
  const colourOptions = queenColours.map((c) => `<option value="${c}">${c}</option>`).join('');
  const statusOptions = Object.entries(statusLabels).map(([v, label]) =>
    `<option value="${v}" ${v === 'thriving' ? 'selected' : ''}>${label}</option>`).join('');

  const body = `
    <form id="hive-form">
      <div class="row" style="gap:var(--s3);align-items:flex-start">
        <div class="field" style="flex:1">
          <label for="h-id">Hive ID</label>
          <input id="h-id" type="text" placeholder="e.g. ${ap.code}-105">
        </div>
        <div class="field" style="flex:1">
          <label for="h-status">Status</label>
          <select id="h-status">${statusOptions}</select>
        </div>
      </div>
      <div class="row" style="gap:var(--s3);align-items:flex-start">
        <div class="field" style="flex:1">
          <label for="h-line">Queen Line</label>
          <select id="h-line">${lineOptions}</select>
        </div>
        <div class="field" style="flex:1">
          <label for="h-queen-id">Queen ID</label>
          <input id="h-queen-id" type="text" placeholder="optional">
        </div>
      </div>
      <div class="row" style="gap:var(--s3);align-items:flex-start">
        <div class="field" style="flex:1">
          <label for="h-colour">Queen marked</label>
          <select id="h-colour">${colourOptions}</select>
        </div>
        <div class="field" style="flex:1">
          <label for="h-year">Queen year</label>
          <input id="h-year" type="number" value="${new Date().getFullYear()}">
        </div>
      </div>
      <div class="field">
        <label for="h-frames">Hive Configuration</label>
        <input id="h-frames" type="number" min="0" placeholder="optional">
      </div>
      <div class="row" style="gap:var(--s3);align-items:flex-start">
        <div class="field" style="flex:1">
          <label for="h-vsh">UBEEO score, if known</label>
          <input id="h-vsh" type="number" min="0" max="100" placeholder="optional">
        </div>
        <div class="field" style="flex:1">
          <label for="h-mite">Harbo Assay Result, if known</label>
          <input id="h-mite" type="number" min="0" step="0.1" placeholder="optional">
        </div>
      </div>
      <div class="field">
        <label for="h-tf">Treatment-free seasons</label>
        <input id="h-tf" type="number" min="0" value="0">
      </div>
      <div class="field">
        <label for="h-comment">Comments</label>
        <textarea id="h-comment" maxlength="200" placeholder="optional, up to 200 characters"></textarea>
      </div>
    </form>`;

  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-primary" id="pub-hive">Add hive</button>`;

  const scrim = modal({ title: `Add a hive at ${ap.name}`, body, actions });

  scrim.querySelector('#pub-hive').addEventListener('click', () => {
    const hiveId = scrim.querySelector('#h-id').value.trim();
    if (!hiveId) {
      toast('Enter a hive ID.');
      return;
    }
    const taken = new Set(allApiaries().flatMap((a) => a.hiveRecords.map((h) => h.id)));
    if (taken.has(hiveId)) {
      toast(`Hive ID "${hiveId}" is already in use — pick a different one.`);
      return;
    }

    const vshRaw = scrim.querySelector('#h-vsh').value;
    const miteRaw = scrim.querySelector('#h-mite').value;
    const framesRaw = scrim.querySelector('#h-frames').value;

    const record = addHive(ap.id, {
      id: hiveId,
      line: scrim.querySelector('#h-line').value,
      queenId: scrim.querySelector('#h-queen-id').value.trim(),
      status: scrim.querySelector('#h-status').value,
      queenColour: scrim.querySelector('#h-colour').value,
      queenYear: Number(scrim.querySelector('#h-year').value) || new Date().getFullYear(),
      broodFrames: framesRaw ? Number(framesRaw) : 0,
      vsh: vshRaw ? Number(vshRaw) : null,
      miteLoad: miteRaw ? Number(miteRaw) : null,
      treatmentFree: Number(scrim.querySelector('#h-tf').value) || 0,
      comment: scrim.querySelector('#h-comment').value.trim().slice(0, 200),
    });
    closeModal();
    toast(`${record.id} added to ${ap.name}.`);
    window.__aqbba_render();
  });
}

/* Checkbox list of a single apiary's hives, plus an "All hives" toggle that
   checks/unchecks every hive below it — re-rendered whenever the Apiary
   field changes, since which hives are selectable depends on the site. */
function renderHiveChecklist(apiaryId) {
  const hives = allApiaryById(apiaryId)?.hiveRecords || [];
  if (!hives.length) return `<p class="caption">This apiary has no hives registered yet.</p>`;

  const rows = hives.map((h) => `
    <label class="row" style="gap:8px;font-size:13px;font-weight:400;text-transform:none;letter-spacing:0;margin-bottom:4px">
      <input type="checkbox" value="${h.id}" class="i-hive-check">
      <span class="mono">${h.id}</span>
    </label>`).join('');

  return `
    <label class="row" style="gap:8px;font-size:13px;font-weight:400;text-transform:none;letter-spacing:0;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--comb-shade)">
      <input type="checkbox" id="i-hive-all"> All hives (${hives.length})
    </label>
    <div style="max-height:180px;overflow-y:auto">${rows}</div>`;
}

function bindHiveChecklist(scrim) {
  const all = scrim.querySelector('#i-hive-all');
  if (!all) return;
  const checks = () => [...scrim.querySelectorAll('.i-hive-check')];
  all.addEventListener('change', () => checks().forEach((c) => { c.checked = all.checked; }));
  checks().forEach((c) => c.addEventListener('change', () => {
    all.checked = checks().every((x) => x.checked);
  }));
}

function openInspectionForm(ap) {
  const editableApiaries = allApiaries().filter((a) => canEditApiary(a.id));
  const apiaryOptions = editableApiaries.map((a) =>
    `<option value="${a.id}" ${a.id === ap.id ? 'selected' : ''}>${esc(a.name)} (${a.code})</option>`).join('');
  const kindOptions = inspectionKinds.map((k) => `<option>${esc(k)}</option>`).join('');
  const statusOptions = `<option value="">No change</option>` +
    Object.entries(statusLabels).map(([v, label]) => `<option value="${v}">${label}</option>`).join('');
  const memberOptions = members.map((m) =>
    `<option value="${m.id}" ${m.id === ap.manager ? 'selected' : ''}>${esc(m.name)}</option>`).join('');

  const body = `
    <form id="insp-form">
      <div class="row" style="gap:var(--s3);align-items:flex-start">
        <div class="field" style="flex:1">
          <label for="i-apiary">Apiary</label>
          <select id="i-apiary">${apiaryOptions}</select>
        </div>
        <div class="field" style="flex:1">
          <label for="i-kind">Inspection type</label>
          <select id="i-kind">${kindOptions}</select>
        </div>
      </div>
      <div class="row" style="gap:var(--s3);align-items:flex-start">
        <div class="field" style="flex:1">
          <label for="i-status">Status</label>
          <select id="i-status">${statusOptions}</select>
        </div>
        <div class="field" style="flex:1">
          <label for="i-date">Date</label>
          <input id="i-date" type="date" value="${todayStr()}">
        </div>
      </div>
      <div class="field">
        <label>Hives</label>
        <div id="i-hives-wrap">${renderHiveChecklist(ap.id)}</div>
      </div>
      <div class="row" style="gap:var(--s3);align-items:flex-start">
        <div class="field" style="flex:1">
          <label for="i-by">Conducted by</label>
          <select id="i-by">${memberOptions}</select>
        </div>
        <div class="field" style="flex:1">
          <label style="display:block;margin-bottom:8px">Completion</label>
          <label class="row" style="gap:8px;font-size:13px;font-weight:400;text-transform:none;letter-spacing:0">
            <input type="checkbox" id="i-done" checked> Already completed
          </label>
        </div>
      </div>
      <div class="field">
        <label for="i-note">Notes</label>
        <textarea id="i-note" placeholder="What did the inspection find?"></textarea>
      </div>
    </form>`;

  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-primary" id="pub-inspection">Log inspection</button>`;

  const scrim = modal({ title: `Log an inspection`, body, actions });
  bindHiveChecklist(scrim);

  scrim.querySelector('#i-apiary').addEventListener('change', (e) => {
    scrim.querySelector('#i-hives-wrap').innerHTML = renderHiveChecklist(e.target.value);
    bindHiveChecklist(scrim);
  });

  scrim.querySelector('#pub-inspection').addEventListener('click', () => {
    const dateStr = scrim.querySelector('#i-date').value;
    const hiveIds = [...scrim.querySelectorAll('.i-hive-check:checked')].map((c) => c.value);
    if (!dateStr || !hiveIds.length) {
      toast('Add a date and select at least one hive.');
      return;
    }

    addInspection({
      apiary: scrim.querySelector('#i-apiary').value,
      kind: scrim.querySelector('#i-kind').value,
      by: scrim.querySelector('#i-by').value,
      hiveIds,
      status: scrim.querySelector('#i-status').value || null,
      note: scrim.querySelector('#i-note').value.trim(),
      dateStr,
      done: scrim.querySelector('#i-done').checked,
    });
    closeModal();
    toast(`Inspection logged for ${hiveIds.length} hive${hiveIds.length > 1 ? 's' : ''}.`);
    window.__aqbba_render();
  });
}
