/* ==========================================================================
   The comb: every hive in an apiary as one interlocking honeycomb field.
   Each cell is a real hive record. Colour is colony status. Click for detail.
   ========================================================================== */

import { statusLabels, statusNote, lineByCode, memberById, relDays } from '../data.js';
import { esc, icons } from '../ui.js';

const PER_ROW = 14;

export function renderComb(hives, { id = 'comb' } = {}) {
  let rows = '';
  for (let i = 0; i < hives.length; i += PER_ROW) {
    const slice = hives.slice(i, i + PER_ROW);
    rows += `<div class="comb-row">${slice.map((h, j) => `
      <button class="cell cell-${h.status}"
              data-hive="${h.id}"
              style="animation-delay:${((i / PER_ROW) * 26 + j * 9)}ms"
              title="${h.id} — ${statusLabels[h.status]}"
              aria-label="Hive ${h.id}, ${statusLabels[h.status]}"></button>`).join('')}</div>`;
  }

  const counts = hives.reduce((a, h) => { a[h.status] = (a[h.status] || 0) + 1; return a; }, {});
  const legend = Object.keys(statusLabels)
    .filter((k) => counts[k])
    .map((k) => `
      <div>
        <span class="pip pip-${k}"></span>
        <span>${statusLabels[k]}</span>
        <span class="mono">${counts[k]}</span>
      </div>`).join('');

  return `
    <div class="comb-field" id="${id}" role="group" aria-label="Hive status grid">${rows}</div>
    <div class="comb-legend">${legend}</div>`;
}

export function renderReadout(hive, { editable = false } = {}) {
  if (!hive) {
    return `<div class="readout-empty" id="readout">
      Select any cell above to read that hive's record.
    </div>`;
  }

  const line = lineByCode(hive.line);
  const breeder = memberById(line.breeder);
  const tf = hive.status === 'treating'
    ? 'Under treatment'
    : hive.treatmentFree === 0 ? 'Not yet established' : `${hive.treatmentFree} season${hive.treatmentFree > 1 ? 's' : ''}`;

  const statusVariant = { thriving: 'tag-green', good: 'tag-green', average: 'tag-amber', poor: 'tag-red', treating: 'tag-blue' }[hive.status];

  return `
    <div class="readout" id="readout">
      <div class="readout-head">
        <div>
          <h3 class="mono">${hive.id}</h3>
          <p class="caption" style="margin-top:4px">${esc(statusNote[hive.status])}</p>
        </div>
        <span class="spacer"></span>
        ${editable ? `<button class="btn btn-ghost btn-sm" id="edit-hive">${icons.pen} Edit</button>` : ''}
        <span class="tag ${statusVariant}"><span class="pip pip-${hive.status}"></span>${statusLabels[hive.status]}</span>
      </div>

      <dl class="readout-metrics">
        <div>
          <dt>VSH score</dt>
          <dd>${hive.vsh == null ? '—' : `${hive.vsh}%`}</dd>
          ${hive.vsh == null ? '' : `<div class="meter"><i style="width:${hive.vsh}%"></i></div>`}
        </div>
        <div>
          <dt>Mite load</dt>
          <dd>${hive.miteLoad == null ? '—' : hive.miteLoad}<small style="font-size:10px;color:var(--propolis-40)"> /100</small></dd>
        </div>
        <div><dt>Hive Configuration</dt><dd>${hive.broodFrames || '—'}</dd></div>
        <div><dt>Last inspected</dt><dd style="font-size:13px">${relDays(-hive.lastSeen)}</dd></div>
        <div><dt>Treatment free</dt><dd style="font-size:13px">${tf}</dd></div>
      </dl>

      <div class="row row-wrap" style="margin-top:var(--s5);padding-top:var(--s4);border-top:1px solid var(--comb-shade);gap:var(--s5)">
        <div>
          <div class="eyebrow">Queen Line</div>
          <div class="mono" style="font-size:13px;margin-top:3px">${line.code} · ${esc(line.name)} · gen ${line.gen}</div>
        </div>
        <div>
          <div class="eyebrow">Queen ID</div>
          <div class="mono" style="font-size:13px;margin-top:3px">${hive.queenId ? esc(hive.queenId) : '—'}</div>
        </div>
        <div>
          <div class="eyebrow">Contributed by</div>
          <div style="font-size:13px;margin-top:3px">${esc(breeder.name)}</div>
        </div>
        <div>
          <div class="eyebrow">Queen marked</div>
          <div style="font-size:13px;margin-top:3px;display:flex;align-items:center;gap:6px">
            <span class="pip" style="background:var(--mark-${hive.queenColour});box-shadow:0 0 0 1px var(--comb-shade)"></span>
            ${hive.queenColour} · ${hive.queenYear}
          </div>
        </div>
      </div>

      ${hive.comment ? `
      <div style="margin-top:var(--s4);padding-top:var(--s4);border-top:1px solid var(--comb-shade)">
        <div class="eyebrow">Comments</div>
        <p style="font-size:13px;margin-top:3px">${esc(hive.comment)}</p>
      </div>` : ''}
    </div>`;
}

/* Wire cell selection. Call after the comb is in the DOM. Pass onEditHive to
   show and wire an Edit button on the readout (omit it — e.g. on the
   read-only dashboard preview — and no Edit button renders at all). */
export function bindComb(root, hives, { onEditHive } = {}) {
  const field = root.querySelector('.comb-field');
  if (!field) return;

  const wireEditBtn = () => {
    if (!onEditHive) return;
    const btn = root.querySelector('#edit-hive');
    const picked = field.querySelector('.cell.is-picked');
    const hive = picked && hives.find((h) => h.id === picked.dataset.hive);
    if (btn && hive) btn.addEventListener('click', () => onEditHive(hive));
  };

  field.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-hive]');
    if (!btn) return;
    const hive = hives.find((h) => h.id === btn.dataset.hive);

    field.querySelectorAll('.cell.is-picked').forEach((c) => c.classList.remove('is-picked'));
    btn.classList.add('is-picked');

    const old = root.querySelector('#readout');
    if (old) old.outerHTML = renderReadout(hive, { editable: !!onEditHive });
    wireEditBtn();
  });
}
