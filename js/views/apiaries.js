/* ==========================================================================
   Apiary index and the per-apiary record.
   ========================================================================== */

import {
  apiaries, apiaryById, stageLabels, statusLabels, memberById,
  lineByCode, inspections, tally, vshAverage, relDays, fmtDateLong,
  projects, projectStatusLabels,
} from '../data.js';
import { memberProjects } from '../store.js';
import { esc, icons, avatar } from '../ui.js';
import { renderComb, renderReadout, bindComb } from './comb.js';

/* Member-proposed projects sit alongside the seeded ones, same as everywhere
   else member-authored content is combined with the seed data. */
const projectsForApiary = (apiaryId) =>
  [...memberProjects(), ...projects].filter((p) => p.sites.includes(apiaryId));

const stageVariant = { initialising: 'tag-amber', assessment: 'tag-blue', maintenance: 'tag-green' };

export function renderApiaries() {
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
        <td>${esc(mgr.name)}</td>
        <td class="mono">${ap.hives}</td>
        <td class="mono">${vshAverage(ap.hiveRecords)}%</td>
        <td class="mono">${t.treatment || 0}</td>
        <td class="mono">${t.critical || 0}</td>
        <td>${ap.established}</td>
      </tr>`;
  }).join('');

  return `
    <div class="topbar">
      <div style="width:100%">
        <div class="eyebrow">Program sites</div>
        <h1>Research apiaries</h1>
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
}

export function renderApiary(id) {
  const ap = apiaryById(id);
  if (!ap) return '';

  const hives = ap.hiveRecords;
  const t = tally(hives);
  const mgr = memberById(ap.manager);
  const insp = inspections.filter((i) => i.apiary === ap.id).sort((a, b) => a.date - b.date);
  const siteProjects = projectsForApiary(ap.id);
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
    return `
      <li>
        <div class="line" style="cursor:default">
          <div class="line-date">
            <b>${i.date.getDate()}</b>
            ${i.date.toLocaleDateString('en-AU', { month: 'short' })}
          </div>
          <div class="line-body">
            <strong>${esc(i.kind)}</strong>
            <span>${i.hives} hives · ${esc(by.name)}</span>
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
              <span class="caption">Click any cell</span>
            </div>
            <div class="panel-body">${renderComb(hives, { id: 'ap-comb' })}</div>
            ${renderReadout(null)}
          </div>

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
          </div>

          <div class="panel">
            <div class="panel-head">
              <h2>Inspection schedule</h2>
              <span class="spacer"></span>
              <span class="caption mono">${insp.length}</span>
            </div>
            <ul class="list">${inspRows}</ul>
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
                <p class="mono caption" style="font-size:11.5px">${ap.coords}</p>
              </div>

              <div style="margin-top:var(--s4)">
                <div class="eyebrow">Dominant flora</div>
                <p style="font-size:13.5px;margin-top:3px">${esc(ap.flora)}</p>
              </div>

              <div style="margin-top:var(--s5);padding-top:var(--s4);border-top:1px solid var(--comb-shade)">
                <div class="eyebrow" style="margin-bottom:var(--s3)">Manager</div>
                <div class="row" style="gap:var(--s3)">
                  ${avatar(mgr)}
                  <div>
                    <div style="font-size:13.5px;font-weight:600">${esc(mgr.name)}</div>
                    <div class="caption">${esc(mgr.role)} · ${mgr.state}</div>
                  </div>
                </div>
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
              ${Object.keys(statusLabels).filter((k) => t[k]).map((k) => `
                <div class="row" style="justify-content:space-between;padding:5px 0">
                  <span class="row" style="gap:var(--s2)">
                    <span class="pip pip-${k}"></span>
                    <span style="font-size:13px">${statusLabels[k]}</span>
                  </span>
                  <span class="mono" style="font-size:13px">${t[k]}</span>
                </div>`).join('')}
              <div class="row" style="justify-content:space-between;padding-top:var(--s3);margin-top:var(--s2);border-top:1px solid var(--comb-shade)">
                <span style="font-size:13px;font-weight:600">Mean VSH</span>
                <span class="mono" style="font-size:13px;font-weight:600">${vshAverage(hives)}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  setTimeout(() => {
    const root = document.getElementById('main');
    if (root) bindComb(root, hives);
  }, 0);

  return html;
}
