/* ==========================================================================
   Apiary index and the per-apiary record — plus the maintenance flows for
   registering a new research apiary, registering a new hive, and logging an
   inspection. These alter the program's own research data rather than
   adding member social content, which is why they live here rather than
   following the forum/marketplace composer pattern exactly.

   Phase 5 of the backend migration: apiaries/hives/inspections are real
   Supabase tables now (js/store.js's loadApiaries/loadApiary), loaded by
   the router before this module ever runs — every render function below
   takes that loaded data as a parameter instead of reading js/data.js or
   local session state directly. Site access is a real per-apiary grant
   now too (apiary_managers, manage/operate tiers) rather than a single
   .manager field — see the "Team" panel in renderApiary.
   ========================================================================== */

import {
  stageLabels, statusLabels,
  tally, vshAverage, relDays,
  projectStatusLabels, inspectionKinds, queenColours,
} from '../data.js';
import {
  isWebAdmin, isSubscribed, currentUser,
  addApiary, updateApiary, addHive, updateHive, addInspection,
  checkExistingHiveIds, addHivesBulk, addInspectionsBulk,
  setApiaryTeamMember, removeApiaryTeamMember, loadRealMembers, loadQueenLines,
} from '../store.js';
import { esc, icons, avatar, subButton, modal, closeModal, toast } from '../ui.js';
import { renderComb, renderReadout, bindComb } from './comb.js';
import { parseCsv, buildCsvText, downloadCsvFile } from '../csv.js';

/* Projects are real Supabase rows now (Phase 6) — `sites` is a plain
   jsonb array of apiary ids, no different from the old mock shape here. */
const projectsForApiary = (projects, apiaryId) =>
  projects.filter((p) => (p.sites || []).includes(apiaryId));

const stageVariant = { establishing: 'tag-amber', assessment: 'tag-blue', maintenance: 'tag-green', requeening: 'tag-red' };

export function renderApiaries(data) {
  const { apiaries } = data;

  const rows = apiaries.map((ap) => {
    const t = tally(ap.hiveRecords);
    return `
      <tr>
        <td>
          <a href="#/apiaries/${ap.id}" style="font-weight:600">${esc(ap.name)}</a>
          <div class="caption mono" style="font-size:11px">${ap.code}</div>
        </td>
        <td>${esc(ap.region)}</td>
        <td><span class="tag ${stageVariant[ap.stage]}">${stageLabels[ap.stage]}</span></td>
        <td class="mono">${ap.hives}</td>
        <td class="mono">${vshAverage(ap.hiveRecords)}%</td>
        <td class="mono">${t.treating || 0}</td>
        <td class="mono">${t.poor || 0}</td>
        <td>${ap.dateEstablished ? new Date(ap.dateEstablished).getFullYear() : '—'}</td>
      </tr>`;
  }).join('');

  const html = `
    <div class="topbar">
      <div style="width:100%">
        <div class="eyebrow">Program sites</div>
        <h1>Research apiaries</h1>
      </div>
      <div class="topbar-actions">
        ${subButton('apiary:new', isSubscribed('apiary:new'), 'Notify me of new sites', 'new research apiaries')}
        ${isWebAdmin() ? `<button class="btn btn-primary btn-sm" id="new-apiary">${icons.plus} Add apiary</button>` : ''}
      </div>
    </div>

    <div class="wrap view">
      <div class="panel">
        <div class="tbl-scroll">
          <table class="tbl">
            <thead>
              <tr>
                <th>Apiary</th><th>Region</th><th>Stage</th>
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
    .map(([v, label]) => `<option value="${v}" ${v === 'establishing' ? 'selected' : ''}>${label}</option>`).join('');

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
          <label for="a-established">Date established</label>
          <input id="a-established" type="date" value="${new Date().toISOString().slice(0, 10)}">
        </div>
      </div>
      <div class="field">
        <label for="a-address">Address (optional)</label>
        <input id="a-address" placeholder="e.g. 214 Ironbark Rd, Braidwood NSW">
      </div>
      <div class="field">
        <label for="a-stage">Program stage</label>
        <select id="a-stage">${stageOptions}</select>
      </div>
      <div class="field">
        <label for="a-flora">Dominant flora</label>
        <input id="a-flora" placeholder="e.g. Yellow box, red stringybark">
      </div>
      <div class="field">
        <label for="a-brief">Brief</label>
        <textarea id="a-brief" required placeholder="What is this site for? Why was it established?"></textarea>
      </div>
      <p class="caption">A Web Admin assigns who can manage or operate at this site afterward, from its own page.</p>
    </form>`;

  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-primary" id="pub-apiary">Add apiary</button>`;

  const scrim = modal({ title: 'Add a research apiary', body, actions });
  const saveBtn = scrim.querySelector('#pub-apiary');

  saveBtn.addEventListener('click', async () => {
    const name = scrim.querySelector('#a-name').value.trim();
    const region = scrim.querySelector('#a-region').value.trim();
    const brief = scrim.querySelector('#a-brief').value.trim();
    if (!name || !region || !brief) {
      toast('Add a site name, region and brief before saving.');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    let ap;
    try {
      ap = await addApiary({
        name, region, brief,
        address: scrim.querySelector('#a-address').value.trim(),
        flora: scrim.querySelector('#a-flora').value.trim(),
        stage: scrim.querySelector('#a-stage').value,
        dateEstablished: scrim.querySelector('#a-established').value || undefined,
      });
    } catch (err) {
      toast(`Couldn't add the apiary: ${err.message}`);
      saveBtn.disabled = false;
      saveBtn.textContent = 'Add apiary';
      return;
    }
    closeModal();
    toast(`${ap.name} added. It's now visible to all members.`);
    window.__aqbba_invalidateData();
    location.hash = `#/apiaries/${ap.id}`;
  });
}

export function renderApiary(data, id) {
  const { apiary: ap, hives, inspections, team, isAdmin, canManage, canOperate, projects } = data;
  if (!ap) return '';

  const t = tally(hives);
  const insp = inspections.slice().sort((a, b) => a.date - b.date);
  const siteProjects = projectsForApiary(projects, ap.id);
  const projStatusVariant = { recruiting: 'tag-amber', active: 'tag-green', concluding: 'tag-blue' };

  /* Which lines are here, and how each is performing on this site. Each
     hive already carries its queen line + breeder resolved (hive.lineInfo
     — js/store.js's loadApiary), so this just groups by code, no separate
     lookup needed. Real hives can (structurally) carry no queen line,
     unlike every mock hive — filter those out before grouping. */
  const lineCodes = [...new Set(hives.map((h) => h.lineInfo?.code).filter(Boolean))];
  const lineRows = lineCodes.map((code) => {
    const set = hives.filter((h) => h.lineInfo?.code === code);
    const line = set[0].lineInfo;
    const scored = set.filter((h) => h.vsh != null);
    const mean = scored.length ? Math.round(scored.reduce((s, h) => s + h.vsh, 0) / scored.length) : 0;
    const delta = mean - (line.vshMean ?? 0);
    return `
      <tr>
        <td>${esc(line.name)}</td>
        <td>${esc(line.breeder.name)}</td>
        <td class="mono">${set.length}</td>
        <td class="mono">${mean}%</td>
        <td class="mono" style="color:${delta >= 0 ? 'var(--mark-green)' : 'var(--mark-red)'}">
          ${delta >= 0 ? '+' : ''}${delta}
        </td>
      </tr>`;
  }).join('');

  const inspRows = insp.map((i) => {
    const byName = i.by ? esc(i.by.name) : 'Unknown';
    return `
      <li>
        <div class="line" style="cursor:default">
          <div class="line-date">
            <b>${i.date.getDate()}</b>
            ${i.date.toLocaleDateString('en-AU', { month: 'short' })}
          </div>
          <div class="line-body">
            <strong>${esc(i.kind)}</strong>
            <span><span class="mono">${esc(i.hiveId)}</span> · ${byName}${i.status ? ` · → ${statusLabels[i.status]}` : ''}</span>
            ${i.note ? `<p class="caption" style="margin-top:3px">${esc(i.note)}</p>` : ''}
          </div>
          <div class="line-meta">
            <div class="caption mono">${relDays(Math.round((i.date - new Date()) / 86400000))}</div>
            <span class="tag ${i.done ? 'tag-green' : 'tag-outline'}" style="margin-top:3px">
              ${i.done ? 'Complete' : 'Scheduled'}
            </span>
          </div>
        </div>
      </li>`;
  }).join('');

  const teamRows = team.map((t2) => `
    <a class="row" style="gap:var(--s3)" href="#/managers/${t2.member.id}">
      ${avatar(t2.member)}
      <div style="flex:1;min-width:0">
        <div style="font-size:13.5px;font-weight:600">${esc(t2.member.name)}</div>
        <div class="caption">${t2.access_level === 'manage' ? 'Manage' : 'Operate'}</div>
      </div>
    </a>`).join('');

  const html = `
    <div class="topbar">
      <div style="width:100%">
        <div class="crumb">
          <a href="#/apiaries">Apiaries</a> ${icons.chevron} <span>${esc(ap.name)}</span>
        </div>
        <div class="eyebrow">${ap.code}${ap.dateEstablished ? ` · established ${new Date(ap.dateEstablished).getFullYear()}` : ''}</div>
        <h1>${esc(ap.name)}</h1>
      </div>
      <div class="topbar-actions">
        <span class="tag ${stageVariant[ap.stage]}">${stageLabels[ap.stage]}</span>
        ${canManage ? `<button class="btn btn-ghost btn-sm" id="edit-apiary">${icons.pen} Edit apiary</button>` : ''}
      </div>
    </div>

    <div class="wrap view">
      <div class="grid grid-dash">
        <div class="stack">
          <div class="panel">
            <div class="panel-head">
              <h2>Hive status — all ${hives.length}</h2>
              <span class="spacer"></span>
              ${canManage ? `
                <button class="btn btn-ghost btn-sm" id="bulk-hives">Bulk upload (.csv)</button>
                <button class="btn btn-ghost btn-sm" id="new-hive">${icons.plus} Add hive</button>
              ` : ''}
            </div>
            <div class="panel-body">
              ${hives.length ? renderComb(hives, { id: 'ap-comb' }) : `
                <div class="empty" style="padding:var(--s6) 0">
                  <h3>No hives registered yet</h3>
                  ${canManage ? `
                    <p>Add the first hive at this site once nucs or colonies are in place.</p>
                    <button class="btn btn-primary" id="empty-hive">Add hive</button>
                  ` : `
                    <p>Only ${esc(ap.name)}'s assigned managers, or Web Admin, can add hives here.</p>
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
                  <tr><th>Line</th><th>Breeder</th><th>Hives</th><th>Site VSH</th><th>vs line mean</th></tr>
                </thead>
                <tbody>${lineRows}</tbody>
              </table>
            </div>
          </div>` : ''}

          <div class="panel">
            <div class="panel-head">
              <h2>Inspection schedule</h2>
              <span class="spacer"></span>
              ${canOperate ? `
                <button class="btn btn-ghost btn-sm" id="bulk-inspections">Bulk upload (.csv)</button>
                <button class="btn btn-ghost btn-sm" id="new-inspection">${icons.plus} Log inspection</button>
              ` : ''}
            </div>
            ${insp.length ? `<ul class="list">${inspRows}</ul>` : `
              <div class="empty">
                <h3>No inspections logged</h3>
                <p>${canOperate ? 'Log one once an assessment has run at this site.' : `Only ${esc(ap.name)}'s assigned managers/operators, or Web Admin, can log inspections here.`}</p>
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
                ${ap.address ? `<p class="caption" style="font-size:11.5px">${esc(ap.address)}</p>` : ''}
              </div>

              <div style="margin-top:var(--s4)">
                <div class="eyebrow">Dominant flora</div>
                <p style="font-size:13.5px;margin-top:3px">${esc(ap.flora)}</p>
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-head">
              <h2>Team</h2>
              <span class="spacer"></span>
              ${isAdmin ? `<button class="btn btn-ghost btn-sm" id="manage-team">${icons.pen} Manage</button>` : ''}
            </div>
            <div class="panel-body panel-body-flush">
              ${team.length ? teamRows : `
                <div class="empty" style="padding:var(--s5)"><p class="caption">No one assigned yet — a Web Admin assigns managers and operators here.</p></div>`}
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
    if (root && hives.length) bindComb(root, hives, canOperate ? { onEditHive: openHiveEditForm } : {});

    ['new-hive', 'empty-hive'].forEach((elId) => {
      const btn = document.getElementById(elId);
      if (btn) btn.addEventListener('click', () => openHiveForm(ap));
    });

    const bulkHivesBtn = document.getElementById('bulk-hives');
    if (bulkHivesBtn) bulkHivesBtn.addEventListener('click', () => openHiveBulkUploadForm(ap));

    const instBtn = document.getElementById('new-inspection');
    if (instBtn) instBtn.addEventListener('click', () => openInspectionForm(ap, hives));

    const bulkInspBtn = document.getElementById('bulk-inspections');
    if (bulkInspBtn) bulkInspBtn.addEventListener('click', () => openInspectionBulkUploadForm(ap, hives));

    const apEditBtn = document.getElementById('edit-apiary');
    if (apEditBtn) apEditBtn.addEventListener('click', () => openApiaryEditForm(ap));

    const teamBtn = document.getElementById('manage-team');
    if (teamBtn) teamBtn.addEventListener('click', () => openManageApiaryTeamModal(ap.id, team));
  }, 0);

  return html;
}

async function openManageApiaryTeamModal(apiaryId, team) {
  let realMembers;
  try {
    realMembers = await loadRealMembers();
  } catch (err) {
    toast(`Couldn't load members: ${err.message}`);
    return;
  }
  const already = new Set(team.map((t) => t.member_id));
  const eligible = realMembers.filter((m) => !already.has(m.id));

  const body = `
    <div style="border:1px solid var(--comb-shade);border-radius:4px;margin-bottom:var(--s5)">
      ${team.length ? team.map((t) => `
        <div class="breeder">
          ${avatar(t.member)}
          <div style="flex:1;min-width:0">
            <strong style="font-size:13.5px;font-weight:600;display:block">${esc(t.member.name)}</strong>
            <span class="caption">${t.access_level === 'manage' ? 'Manage' : 'Operate'}</span>
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
          <option value="manage">Manage — create/edit/delete hives, edit the apiary, log inspections</option>
          <option value="operate">Operate — update hives, log inspections; can't create/delete hives or edit the apiary</option>
        </select>
      </div>` : '<p class="caption">Every member is already on this site\'s team.</p>'}`;

  const actions = eligible.length ? `
    <button class="btn btn-ghost" data-close>Close</button>
    <button class="btn btn-primary" id="add-team-member">Add to team</button>` : `
    <button class="btn btn-ghost" data-close>Close</button>`;

  const scrim = modal({ title: 'Manage apiary team', body, actions });

  scrim.querySelectorAll('[data-remove-team]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await removeApiaryTeamMember(apiaryId, btn.dataset.removeTeam);
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
      await setApiaryTeamMember(apiaryId, memberId, level);
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

function openApiaryEditForm(ap) {
  const stageOptions = Object.entries(stageLabels)
    .map(([v, label]) => `<option value="${v}" ${v === ap.stage ? 'selected' : ''}>${label}</option>`).join('');

  const body = `
    <form id="apiary-edit-form">
      <div class="field">
        <label for="ae-name">Site name</label>
        <input id="ae-name" required value="${esc(ap.name)}">
      </div>
      <div class="row" style="gap:var(--s3);align-items:flex-start">
        <div class="field" style="flex:1">
          <label for="ae-region">Region</label>
          <input id="ae-region" required value="${esc(ap.region)}">
        </div>
        <div class="field" style="flex:1">
          <label for="ae-established">Date established</label>
          <input id="ae-established" type="date" value="${esc(ap.dateEstablished || '')}">
        </div>
      </div>
      <div class="field">
        <label for="ae-address">Address (optional)</label>
        <input id="ae-address" value="${esc(ap.address || '')}">
      </div>
      <div class="field">
        <label for="ae-stage">Status</label>
        <select id="ae-stage">${stageOptions}</select>
      </div>
      <div class="field">
        <label for="ae-flora">Dominant flora</label>
        <input id="ae-flora" value="${esc(ap.flora || '')}">
      </div>
      <div class="field">
        <label for="ae-brief">Brief</label>
        <textarea id="ae-brief" required>${esc(ap.brief)}</textarea>
      </div>
    </form>`;

  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-primary" id="save-apiary">Save changes</button>`;

  const scrim = modal({ title: `Edit apiary — ${ap.name}`, body, actions });
  const saveBtn = scrim.querySelector('#save-apiary');

  saveBtn.addEventListener('click', async () => {
    const name = scrim.querySelector('#ae-name').value.trim();
    const region = scrim.querySelector('#ae-region').value.trim();
    const brief = scrim.querySelector('#ae-brief').value.trim();
    if (!name || !region || !brief) {
      toast('Site name, region and brief are all required.');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      await updateApiary(ap.id, {
        name, region, brief,
        address: scrim.querySelector('#ae-address').value.trim(),
        flora: scrim.querySelector('#ae-flora').value.trim(),
        stage: scrim.querySelector('#ae-stage').value,
        dateEstablished: scrim.querySelector('#ae-established').value || undefined,
      });
    } catch (err) {
      toast(`Couldn't save changes: ${err.message}`);
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save changes';
      return;
    }
    closeModal();
    toast(`${name} updated.`);
    window.__aqbba_invalidateData();
    window.__aqbba_render();
  });
}

async function openHiveEditForm(hive) {
  let queenLines;
  try {
    queenLines = await loadQueenLines();
  } catch (err) {
    toast(`Couldn't load queen lines: ${err.message}`);
    return;
  }
  const lineOptions = `<option value="">No queen line</option>` + queenLines.map((l) =>
    `<option value="${l.code}" ${l.code === hive.line ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
  const colourOptions = queenColours.map((c) =>
    `<option value="${c}" ${c === hive.queenColour ? 'selected' : ''}>${c}</option>`).join('');
  const statusOptions = Object.entries(statusLabels).map(([v, label]) =>
    `<option value="${v}" ${v === hive.status ? 'selected' : ''}>${label}</option>`).join('');

  const body = `
    <p class="caption" style="margin-bottom:var(--s5)">
      Hive ID <strong class="mono">${esc(hive.id)}</strong> is fixed once registered.
    </p>
    <form id="hive-edit-form">
      <div class="row" style="gap:var(--s3);align-items:flex-start">
        <div class="field" style="flex:1">
          <label for="he-status">Status</label>
          <select id="he-status">${statusOptions}</select>
        </div>
        <div class="field" style="flex:1">
          <label for="he-line">Queen Line</label>
          <select id="he-line">${lineOptions}</select>
        </div>
      </div>
      <div class="row" style="gap:var(--s3);align-items:flex-start">
        <div class="field" style="flex:1">
          <label for="he-queen-id">Queen ID</label>
          <input id="he-queen-id" type="text" placeholder="optional" value="${esc(hive.queenId || '')}">
        </div>
        <div class="field" style="flex:1">
          <label for="he-colour">Queen marked</label>
          <select id="he-colour">${colourOptions}</select>
        </div>
      </div>
      <div class="row" style="gap:var(--s3);align-items:flex-start">
        <div class="field" style="flex:1">
          <label for="he-year">Queen year</label>
          <input id="he-year" type="number" value="${hive.queenYear}">
        </div>
        <div class="field" style="flex:1">
          <label for="he-frames">Hive Configuration</label>
          <input id="he-frames" type="text" placeholder="optional" value="${esc(hive.broodFrames || '')}">
        </div>
      </div>
      <div class="row" style="gap:var(--s3);align-items:flex-start">
        <div class="field" style="flex:1">
          <label for="he-vsh">UBEEO score, if known</label>
          <input id="he-vsh" type="number" min="0" max="100" placeholder="optional" value="${hive.vsh ?? ''}">
        </div>
        <div class="field" style="flex:1">
          <label for="he-mite">Harbo Assay Result, if known</label>
          <input id="he-mite" type="number" min="0" step="0.1" placeholder="optional" value="${hive.miteLoad ?? ''}">
        </div>
      </div>
      <div class="field">
        <label for="he-tf">Treatment-free seasons</label>
        <input id="he-tf" type="number" min="0" value="${hive.treatmentFree || 0}">
      </div>
      <div class="field">
        <label for="he-comment">Comments</label>
        <textarea id="he-comment" maxlength="200" placeholder="optional, up to 200 characters">${esc(hive.comment || '')}</textarea>
      </div>
    </form>`;

  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-primary" id="save-hive">Save changes</button>`;

  const scrim = modal({ title: `Edit hive — ${hive.id}`, body, actions });
  const saveBtn = scrim.querySelector('#save-hive');

  saveBtn.addEventListener('click', async () => {
    const vshRaw = scrim.querySelector('#he-vsh').value;
    const miteRaw = scrim.querySelector('#he-mite').value;

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      await updateHive(hive.id, {
        status: scrim.querySelector('#he-status').value,
        line: scrim.querySelector('#he-line').value,
        queenId: scrim.querySelector('#he-queen-id').value.trim(),
        queenColour: scrim.querySelector('#he-colour').value,
        queenYear: Number(scrim.querySelector('#he-year').value) || hive.queenYear,
        broodFrames: scrim.querySelector('#he-frames').value.trim(),
        vsh: vshRaw ? Number(vshRaw) : null,
        miteLoad: miteRaw ? Number(miteRaw) : null,
        treatmentFree: Number(scrim.querySelector('#he-tf').value) || 0,
        comment: scrim.querySelector('#he-comment').value.trim().slice(0, 200),
      });
    } catch (err) {
      toast(`Couldn't save changes: ${err.message}`);
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save changes';
      return;
    }
    closeModal();
    toast(`${hive.id} updated.`);
    window.__aqbba_invalidateData();
    window.__aqbba_render();
  });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/* Shared shell for both CSV bulk-upload flows (hives, inspections) —
   template download, file pick, per-row validation with a visible
   pass/fail preview before anything is written, then one bulk insert of
   just the rows that passed. "Insert the valid rows, report the rest":
   a typo in row 9 never blocks rows 1-8 from going in.

   templateHeaders/templateSample build the downloadable .csv (buildCsvText,
   js/csv.js). validateRow(row, line) gets one parsed CSV row (a plain
   object keyed by lowercased header — see parseCsv) plus its 1-based
   source line number (counting the header as line 1, so the first data
   row is line 2 — matches what a spreadsheet app would show), and must
   return either {ok:true, data} with `data` shaped for submitRows, or
   {ok:false, error} with a short human-readable reason. submitRows takes
   the array of every valid row's `data` and performs the one bulk insert. */
async function openBulkUploadForm({ title, templateFilename, templateHeaders, templateSample, requiredNote, prepareContext, validateRow, submitRows, successLabel }) {
  const body = `
    <form id="bulk-form">
      <div class="field">
        <p class="caption">${requiredNote}</p>
        <button type="button" class="btn btn-ghost btn-sm" id="bulk-template">Download CSV template</button>
      </div>
      <div class="field">
        <label for="bulk-file">CSV file</label>
        <input type="file" id="bulk-file" accept=".csv,text/csv">
      </div>
      <div id="bulk-preview"></div>
    </form>`;

  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-primary" id="bulk-submit" disabled>Choose a file</button>`;

  const scrim = modal({ title, body, actions });
  const submitBtn = scrim.querySelector('#bulk-submit');
  const preview = scrim.querySelector('#bulk-preview');
  let validRows = [];

  scrim.querySelector('#bulk-template').addEventListener('click', () => {
    downloadCsvFile(templateFilename, buildCsvText(templateHeaders, templateSample));
  });

  scrim.querySelector('#bulk-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    validRows = [];
    submitBtn.disabled = true;
    submitBtn.textContent = 'Choose a file';
    if (!file) { preview.innerHTML = ''; return; }

    let text;
    try {
      text = await file.text();
    } catch (err) {
      preview.innerHTML = `<p class="caption" style="color:var(--mark-red)">Couldn't read that file: ${esc(err.message)}</p>`;
      return;
    }
    const rows = parseCsv(text);
    if (!rows.length) {
      preview.innerHTML = `<p class="caption">No data rows found in that file.</p>`;
      return;
    }

    preview.innerHTML = `<p class="caption">Checking ${rows.length} row${rows.length > 1 ? 's' : ''}…</p>`;
    let context;
    try {
      context = prepareContext ? await prepareContext(rows) : undefined;
    } catch (err) {
      preview.innerHTML = `<p class="caption" style="color:var(--mark-red)">Couldn't validate that file: ${esc(err.message)}</p>`;
      return;
    }

    const errors = [];
    rows.forEach((row, i) => {
      const line = i + 2; // header is line 1, so the first data row is line 2
      const result = validateRow(row, line, context);
      if (result.ok) validRows.push(result.data);
      else errors.push({ line, message: result.error });
    });

    const errorList = errors.length
      ? `<ul class="list" style="max-height:180px;overflow-y:auto;margin-top:var(--s3)">
          ${errors.map((e2) => `<li><span class="caption" style="color:var(--mark-red)">Row ${e2.line}: ${esc(e2.message)}</span></li>`).join('')}
        </ul>`
      : '';
    preview.innerHTML = `
      <p class="caption" style="margin-top:var(--s3)">
        ${rows.length} row${rows.length > 1 ? 's' : ''} found — <strong>${validRows.length} ready to upload</strong>${errors.length ? `, ${errors.length} with problems` : ''}.
      </p>
      ${errorList}`;

    submitBtn.disabled = !validRows.length;
    submitBtn.textContent = validRows.length ? `Upload ${validRows.length} row${validRows.length > 1 ? 's' : ''}` : 'No valid rows';
  });

  submitBtn.addEventListener('click', async () => {
    if (!validRows.length) return;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading…';
    let inserted;
    try {
      inserted = await submitRows(validRows);
    } catch (err) {
      toast(`Couldn't upload: ${err.message}`);
      submitBtn.disabled = false;
      submitBtn.textContent = `Upload ${validRows.length} row${validRows.length > 1 ? 's' : ''}`;
      return;
    }
    closeModal();
    toast(successLabel(inserted.length));
    window.__aqbba_invalidateData();
    window.__aqbba_render();
  });
}

async function openHiveForm(ap) {
  let queenLines;
  try {
    queenLines = await loadQueenLines();
  } catch (err) {
    toast(`Couldn't load queen lines: ${err.message}`);
    return;
  }
  const lineOptions = `<option value="">No queen line</option>` + queenLines.map((l) => `<option value="${l.code}">${esc(l.name)}</option>`).join('');
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
        <input id="h-frames" type="text" placeholder="optional">
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
  const saveBtn = scrim.querySelector('#pub-hive');

  saveBtn.addEventListener('click', async () => {
    const hiveId = scrim.querySelector('#h-id').value.trim();
    if (!hiveId) {
      toast('Enter a hive ID.');
      return;
    }

    const framesRaw = scrim.querySelector('#h-frames').value;

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    let record;
    try {
      record = await addHive(ap.id, {
        id: hiveId,
        line: scrim.querySelector('#h-line').value,
        queenId: scrim.querySelector('#h-queen-id').value.trim(),
        status: scrim.querySelector('#h-status').value,
        queenColour: scrim.querySelector('#h-colour').value,
        queenYear: Number(scrim.querySelector('#h-year').value) || new Date().getFullYear(),
        broodFrames: framesRaw.trim(),
        treatmentFree: Number(scrim.querySelector('#h-tf').value) || 0,
        comment: scrim.querySelector('#h-comment').value.trim().slice(0, 200),
      });
    } catch (err) {
      toast(`Couldn't add ${hiveId}: ${err.message}`);
      saveBtn.disabled = false;
      saveBtn.textContent = 'Add hive';
      return;
    }
    closeModal();
    toast(`${record.id} added to ${ap.name}.`);
    window.__aqbba_invalidateData();
    window.__aqbba_render();
  });
}

async function openHiveBulkUploadForm(ap) {
  let queenLines;
  try {
    queenLines = await loadQueenLines();
  } catch (err) {
    toast(`Couldn't load queen lines: ${err.message}`);
    return;
  }

  const year = new Date().getFullYear();
  await openBulkUploadForm({
    title: `Bulk upload hives — ${ap.name}`,
    templateFilename: 'aqbba-hives-template.csv',
    templateHeaders: ['Hive ID', 'Status', 'Queen Line', 'Queen ID', 'Queen Colour', 'Queen Year', 'Hive Configuration', 'Treatment-Free Seasons', 'Comment'],
    templateSample: [[`${ap.code}-105`, 'thriving', '', '', 'yellow', String(year), '8 frame', '0', 'Strong buildup this spring']],
    requiredNote: `Only Hive ID is required. Status defaults to Thriving if left blank (valid values: ${Object.keys(statusLabels).join(', ')}). Queen Colour, if given, must be one of: ${queenColours.join(', ')}. Queen Line, if given, must match an existing line's name exactly.`,

    /* Hive ids are a global PK (not scoped per apiary), so "does this hive
       already exist" has to be checked across every hive, not just this
       site's — one query up front for every id the file mentions, rather
       than one query per row. */
    prepareContext: async (rows) => {
      const ids = [...new Set(rows.map((r) => r['hive id']?.trim()).filter(Boolean))];
      const existingIds = await checkExistingHiveIds(ids);
      return { existingIds, seenInFile: new Set() };
    },

    validateRow: (row, line, context) => {
      const id = row['hive id'];
      if (!id) return { ok: false, error: 'Hive ID is required.' };
      if (context.seenInFile.has(id)) return { ok: false, error: `Duplicate Hive ID "${id}" earlier in this file.` };
      context.seenInFile.add(id);
      if (context.existingIds.has(id)) return { ok: false, error: `Hive ID "${id}" already exists.` };

      let status = 'thriving';
      if (row['status']) {
        const key = Object.keys(statusLabels).find((k) => k.toLowerCase() === row['status'].toLowerCase());
        if (!key) return { ok: false, error: `Status "${row['status']}" must be one of: ${Object.keys(statusLabels).join(', ')}.` };
        status = key;
      }

      let line_ = '';
      if (row['queen line']) {
        const match = queenLines.find((l) => l.name.toLowerCase() === row['queen line'].toLowerCase());
        if (!match) return { ok: false, error: `Queen line "${row['queen line']}" not found.` };
        line_ = match.code;
      }

      let queenColour = '';
      if (row['queen colour']) {
        const match = queenColours.find((c) => c.toLowerCase() === row['queen colour'].toLowerCase());
        if (!match) return { ok: false, error: `Queen colour "${row['queen colour']}" must be one of: ${queenColours.join(', ')}.` };
        queenColour = match;
      }

      let queenYear = year;
      if (row['queen year']) {
        const n = Number(row['queen year']);
        if (!Number.isInteger(n)) return { ok: false, error: `Queen year "${row['queen year']}" must be a whole number.` };
        queenYear = n;
      }

      let treatmentFree = 0;
      if (row['treatment-free seasons']) {
        const n = Number(row['treatment-free seasons']);
        if (!Number.isInteger(n) || n < 0) return { ok: false, error: `Treatment-Free Seasons "${row['treatment-free seasons']}" must be a non-negative whole number.` };
        treatmentFree = n;
      }

      return {
        ok: true,
        data: {
          id, status, line: line_, queenId: row['queen id'] || '',
          queenColour, queenYear, broodFrames: row['hive configuration'] || '',
          treatmentFree, comment: (row['comment'] || '').slice(0, 200),
        },
      };
    },

    submitRows: (rows) => addHivesBulk(ap.id, rows),
    successLabel: (n) => `${n} hive${n > 1 ? 's' : ''} added to ${ap.name}.`,
  });
}

async function openInspectionForm(ap, hives) {
  const kindOptions = inspectionKinds.map((k) => `<option>${esc(k)}</option>`).join('');
  const statusOptions = `<option value="">No change</option>` +
    Object.entries(statusLabels).map(([v, label]) => `<option value="${v}">${label}</option>`).join('');
  const scoreOptions = (label, fieldId, max = 5) => `
    <div class="field" style="flex:1">
      <label for="${fieldId}">${label} <span class="caption">(1-${max}, optional)</span></label>
      <select id="${fieldId}">
        <option value="">—</option>
        ${Array.from({ length: max }, (_, i) => i + 1).map((n) => `<option value="${n}">${n}</option>`).join('')}
      </select>
    </div>`;
  const numberField = (label, fieldId, { max, step } = {}) => `
    <div class="field" style="flex:1">
      <label for="${fieldId}">${label} <span class="caption">(optional)</span></label>
      <input id="${fieldId}" type="number" min="0" ${max ? `max="${max}"` : ''} ${step ? `step="${step}"` : ''} placeholder="optional">
    </div>`;
  const yesNoOptions = (label, fieldId) => `
    <div class="field" style="flex:1">
      <label for="${fieldId}">${label}</label>
      <select id="${fieldId}">
        <option value="">Not assessed</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </div>`;

  if (!hives.length) {
    toast('This apiary has no hives registered yet — add one before logging an inspection.');
    return;
  }

  let realMembers;
  try {
    realMembers = await loadRealMembers();
  } catch (err) {
    toast(`Couldn't load members: ${err.message}`);
    return;
  }
  const me = currentUser();
  const memberOptions = realMembers.map((m) =>
    `<option value="${m.id}" ${m.id === me.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
  const hiveOptions = hives.map((h) => `<option value="${h.id}">${h.id}</option>`).join('');

  const body = `
    <form id="insp-form">
      <div class="row" style="gap:var(--s3);align-items:flex-start">
        <div class="field" style="flex:1">
          <label for="i-hive">Hive</label>
          <select id="i-hive">${hiveOptions}</select>
        </div>
        <div class="field" style="flex:1">
          <label for="i-kind">Inspection type</label>
          <select id="i-kind">${kindOptions}</select>
        </div>
        <div class="field" style="flex:1">
          <label for="i-date">Date</label>
          <input id="i-date" type="date" value="${todayStr()}">
        </div>
      </div>
      <div class="field">
        <label for="i-status">Resulting status (optional)</label>
        <select id="i-status">${statusOptions}</select>
      </div>
      <div class="row" style="gap:var(--s3);align-items:flex-start">
        ${scoreOptions('Productivity', 'i-productivity')}
        ${scoreOptions('Temperament', 'i-temperament')}
      </div>
      <div class="row" style="gap:var(--s3);align-items:flex-start">
        ${scoreOptions('Vigour', 'i-vigour')}
        ${scoreOptions('Brood Pattern', 'i-brood-pattern')}
      </div>
      <div class="row" style="gap:var(--s3);align-items:flex-start">
        ${numberField('Mite Count', 'i-mite-count')}
        ${numberField('UBeeO Score', 'i-ubeeo-pct', { max: 100 })}
        ${numberField('PKD Score', 'i-pkd-pct', { max: 100 })}
      </div>
      <div class="row" style="gap:var(--s3);align-items:flex-start">
        ${scoreOptions('Chalkbrood', 'i-chalkbrood')}
        ${scoreOptions('Sacbrood', 'i-sacbrood')}
      </div>
      <div class="row" style="gap:var(--s3);align-items:flex-start">
        ${scoreOptions('European Foulbrood (EFB)', 'i-efb')}
        ${scoreOptions('Small Hive Beetle (SHB)', 'i-shb')}
      </div>
      <div class="row" style="gap:var(--s3);align-items:flex-start">
        ${scoreOptions('Harbo Assay', 'i-harbo-assay', 4)}
      </div>
      <div class="row" style="gap:var(--s3);align-items:flex-start">
        ${yesNoOptions('Nosema present', 'i-nosema')}
        ${yesNoOptions('Wax moth present', 'i-wax-moth')}
      </div>
      <div class="field">
        <label for="i-viruses">Viruses</label>
        <input id="i-viruses" type="text" placeholder="e.g. DWV, CBPV (optional)">
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

  const scrim = modal({ title: `Log an inspection — ${ap.name}`, body, actions });
  const saveBtn = scrim.querySelector('#pub-inspection');

  saveBtn.addEventListener('click', async () => {
    const dateStr = scrim.querySelector('#i-date').value;
    const hiveId = scrim.querySelector('#i-hive').value;
    if (!dateStr || !hiveId) {
      toast('Add a date and choose a hive.');
      return;
    }

    const scoreOf = (fieldId) => {
      const raw = scrim.querySelector(fieldId).value;
      return raw ? Number(raw) : null;
    };
    const yesNoOf = (fieldId) => {
      const raw = scrim.querySelector(fieldId).value;
      return raw ? raw === 'yes' : null;
    };

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      await addInspection({
        hiveId,
        kind: scrim.querySelector('#i-kind').value,
        by: scrim.querySelector('#i-by').value,
        status: scrim.querySelector('#i-status').value || null,
        productivity: scoreOf('#i-productivity'),
        temperament: scoreOf('#i-temperament'),
        vigour: scoreOf('#i-vigour'),
        broodPattern: scoreOf('#i-brood-pattern'),
        miteCount: scoreOf('#i-mite-count'),
        ubeeoPct: scoreOf('#i-ubeeo-pct'),
        pkdPct: scoreOf('#i-pkd-pct'),
        chalkbrood: scoreOf('#i-chalkbrood'),
        sacbrood: scoreOf('#i-sacbrood'),
        efb: scoreOf('#i-efb'),
        shb: scoreOf('#i-shb'),
        harboAssay: scoreOf('#i-harbo-assay'),
        nosemaPresent: yesNoOf('#i-nosema'),
        waxMothPresent: yesNoOf('#i-wax-moth'),
        viruses: scrim.querySelector('#i-viruses').value.trim() || null,
        note: scrim.querySelector('#i-note').value.trim(),
        dateStr,
        done: scrim.querySelector('#i-done').checked,
      });
    } catch (err) {
      toast(`Couldn't log the inspection: ${err.message}`);
      saveBtn.disabled = false;
      saveBtn.textContent = 'Log inspection';
      return;
    }
    closeModal();
    toast(`Inspection logged for ${hiveId}.`);
    window.__aqbba_invalidateData();
    window.__aqbba_render();
  });
}

/* Parses an optional integer field within [min, max]; blank is valid (and
   distinct from a parse failure) — every score/count column on this form
   is optional. */
function parseOptionalInt(raw, min, max, label) {
  if (!raw) return { ok: true, value: null };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    return { ok: false, error: `${label} "${raw}" must be a whole number from ${min} to ${max}.` };
  }
  return { ok: true, value: n };
}

/* Blank -> null (not assessed); Y/Yes/N/No (any case) -> true/false;
   anything else is a row error. Shared by Nosema/Wax moth present. */
function parseOptionalYesNo(raw, label) {
  if (!raw) return { ok: true, value: null };
  const v = raw.toLowerCase();
  if (v === 'y' || v === 'yes') return { ok: true, value: true };
  if (v === 'n' || v === 'no') return { ok: true, value: false };
  return { ok: false, error: `${label} "${raw}" must be Y, N, Yes, or No.` };
}

async function openInspectionBulkUploadForm(ap, hives) {
  if (!hives.length) {
    toast('This apiary has no hives registered yet — add one before logging inspections.');
    return;
  }
  const hiveIds = new Set(hives.map((h) => h.id));
  const me = currentUser();
  const defaultKind = inspectionKinds[0];

  await openBulkUploadForm({
    title: `Bulk upload inspections — ${ap.name}`,
    templateFilename: 'aqbba-inspections-template.csv',
    templateHeaders: [
      'Hive ID', 'Date', 'Inspection Type', 'Resulting Status',
      'Productivity', 'Temperament', 'Vigour', 'Brood Pattern',
      'Mite Count', 'UBeeO Score', 'PKD Score',
      'Chalkbrood', 'Sacbrood', 'EFB', 'SHB', 'Harbo Assay',
      'Nosema Present', 'Wax Moth Present', 'Viruses', 'Notes', 'Completed',
    ],
    templateSample: [[
      hives[0].id, todayStr(), defaultKind, 'good',
      '4', '5', '4', '3',
      '2', '85', '90',
      '1', '1', '1', '1', '3',
      'N', 'N', '', 'Strong hygienic response', 'Y',
    ]],
    requiredNote: `Only Hive ID and Date are required (Date as YYYY-MM-DD). Hive ID must already exist at ${ap.name} — every inspection is logged under your own account as "Conducted by". Inspection Type defaults to "${defaultKind}" (valid values: ${inspectionKinds.join(', ')}); Resulting Status, if given, must be one of: ${Object.keys(statusLabels).join(', ')}. The 1-5 score columns (Productivity, Temperament, Vigour, Brood Pattern, Chalkbrood, Sacbrood, EFB, SHB) and Harbo Assay (1-4) are all optional.`,

    validateRow: (row, line) => {
      const hiveId = row['hive id'];
      if (!hiveId) return { ok: false, error: 'Hive ID is required.' };
      if (!hiveIds.has(hiveId)) return { ok: false, error: `Hive "${hiveId}" does not exist at ${ap.name}.` };

      const dateStr = row['date'];
      if (!dateStr) return { ok: false, error: 'Date is required.' };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || Number.isNaN(new Date(`${dateStr}T00:00:00`).getTime())) {
        return { ok: false, error: `Date "${dateStr}" must be in YYYY-MM-DD format.` };
      }

      let kind = defaultKind;
      if (row['inspection type']) {
        const match = inspectionKinds.find((k) => k.toLowerCase() === row['inspection type'].toLowerCase());
        if (!match) return { ok: false, error: `Inspection Type "${row['inspection type']}" must be one of: ${inspectionKinds.join(', ')}.` };
        kind = match;
      }

      let status = null;
      if (row['resulting status']) {
        const key = Object.keys(statusLabels).find((k) => k.toLowerCase() === row['resulting status'].toLowerCase());
        if (!key) return { ok: false, error: `Resulting Status "${row['resulting status']}" must be one of: ${Object.keys(statusLabels).join(', ')}.` };
        status = key;
      }

      const scoreFields = [
        ['productivity', 'Productivity', 1, 5], ['temperament', 'Temperament', 1, 5],
        ['vigour', 'Vigour', 1, 5], ['brood pattern', 'Brood Pattern', 1, 5],
        ['mite count', 'Mite Count', 0, 100000], ['ubeeo score', 'UBeeO Score', 0, 100],
        ['pkd score', 'PKD Score', 0, 100], ['chalkbrood', 'Chalkbrood', 1, 5],
        ['sacbrood', 'Sacbrood', 1, 5], ['efb', 'EFB', 1, 5], ['shb', 'SHB', 1, 5],
        ['harbo assay', 'Harbo Assay', 1, 4],
      ];
      const scores = {};
      for (const [key, label, min, max] of scoreFields) {
        const result = parseOptionalInt(row[key], min, max, label);
        if (!result.ok) return result;
        scores[key] = result.value;
      }

      const nosema = parseOptionalYesNo(row['nosema present'], 'Nosema Present');
      if (!nosema.ok) return nosema;
      const waxMoth = parseOptionalYesNo(row['wax moth present'], 'Wax Moth Present');
      if (!waxMoth.ok) return waxMoth;

      let done = true;
      if (row['completed']) {
        const v = row['completed'].toLowerCase();
        if (['y', 'yes', 'true'].includes(v)) done = true;
        else if (['n', 'no', 'false'].includes(v)) done = false;
        else return { ok: false, error: `Completed "${row['completed']}" must be Y, N, Yes, No, True, or False.` };
      }

      return {
        ok: true,
        data: {
          hiveId, dateStr, kind, by: me.id, status,
          productivity: scores['productivity'], temperament: scores['temperament'],
          vigour: scores['vigour'], broodPattern: scores['brood pattern'],
          miteCount: scores['mite count'], ubeeoPct: scores['ubeeo score'], pkdPct: scores['pkd score'],
          chalkbrood: scores['chalkbrood'], sacbrood: scores['sacbrood'], efb: scores['efb'], shb: scores['shb'],
          harboAssay: scores['harbo assay'],
          nosemaPresent: nosema.value, waxMothPresent: waxMoth.value,
          viruses: row['viruses'] || null, note: row['notes'] || '', done,
        },
      };
    },

    submitRows: (rows) => addInspectionsBulk(rows),
    successLabel: (n) => `${n} inspection${n > 1 ? 's' : ''} logged at ${ap.name}.`,
  });
}
