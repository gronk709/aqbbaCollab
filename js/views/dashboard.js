/* ==========================================================================
   VSH research dashboard. Answers, in order: where are the apiaries and who
   runs them, what state are the hives in, what has been inspected and what is
   next, and whose lines are in the program.
   ========================================================================== */

import {
  stageLabels, statusLabels, memberById, queenLines, projects,
  tally, vshAverage, relDays, fmtDate, fmtDateLong,
} from '../data.js';
import {
  allApiaries, allApiaryById, allRecentInspections, allUpcomingInspections,
} from '../store.js';
import { esc, icons, avatar, tag } from '../ui.js';
import { renderComb, renderReadout, bindComb } from './comb.js';

/* Recomputed on every call rather than cached at module load, since member-
   added apiaries and hives can change between renders. */
const getAllHives = () => allApiaries().flatMap((a) => a.hiveRecords);

function stageTag(stage) {
  const v = { initialising: 'tag-amber', assessment: 'tag-blue', maintenance: 'tag-green' }[stage];
  return `<span class="tag ${v}">${stageLabels[stage]}</span>`;
}

function apiaryCard(ap) {
  const t = tally(ap.hiveRecords);
  const mgr = memberById(ap.manager);
  const vsh = vshAverage(ap.hiveRecords);
  const inTreatment = t.treatment || 0;
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
            <dt>In treatment</dt><dd style="font-size:1.375rem">${inTreatment}</dd>
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
          <span>${esc(ap.name)} · ${insp.hives} hives · ${esc(by.name)}</span>
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
  const rows = queenLines.map((line) => {
    const b = memberById(line.breeder);
    const inProgram = allHives.filter((h) => h.line === line.code).length;
    return `
      <div class="breeder">
        ${avatar(b)}
        <div style="flex:1;min-width:0">
          <div class="row" style="gap:var(--s2)">
            <strong style="font-size:13.5px">${esc(b.name)}</strong>
            <span class="caption">${b.state}</span>
          </div>
          <div class="mono" style="font-size:12px;color:var(--propolis-60);margin-top:2px">
            ${line.code} · ${esc(line.name)} · generation ${line.gen}
          </div>
          <p class="caption" style="margin-top:4px">${esc(line.note)}</p>
        </div>
        <div style="flex:none;text-align:right">
          <div class="mono" style="font-size:1.0625rem">${line.vshMean}<small style="font-size:10px;color:var(--propolis-40)">%</small></div>
          <div class="caption" style="font-size:11px">${inProgram} hives</div>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="panel">
      <div class="panel-head">
        <h2>Contributing breeders</h2>
        <span class="spacer"></span>
        <span class="caption">${queenLines.length} lines in program</span>
      </div>
      <div class="panel-body panel-body-flush">${rows}</div>
    </div>`;
}

export function renderDashboard() {
  const apiaries = allApiaries();
  const allHives = getAllHives();
  const upcomingInspections = allUpcomingInspections();
  const recentInspections = allRecentInspections();
  const t = tally(allHives);
  const focus = apiaries.find((a) => a.stage === 'assessment') || apiaries[0];
  const attention = allHives.filter((h) => h.status === 'critical').length;
  const next = upcomingInspections[0];

  const html = `
    <div class="topbar">
      <div style="width:100%">
        <div class="eyebrow">Varroa sensitive hygiene program · 2026 season</div>
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
          <dt>In treatment</dt>
          <dd>${t.treatment || 0}</dd>
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
  }, 0);

  return html;
}
