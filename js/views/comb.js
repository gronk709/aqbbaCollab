/* ==========================================================================
   The comb: every hive in an apiary as one interlocking honeycomb field.
   Each cell is a real hive record. Colour is colony status. Click for detail.

   The honeycomb itself (hexagon clip-path, row offsets, the fill animation,
   status colours, narrow-screen sizes) lives in
   tools/tailwind/components-apiaries.css under .comb-field / .comb-row /
   .cell / .cell-<status> / .is-picked; the legend and the hive readout are
   plain Tailwind utilities.
   ========================================================================== */

import { statusLabels, statusNote, relDays, queenMarkFill } from '../data.js';
import { esc, icons, formatKg } from '../ui.js';
import { button } from '../components.js';

const PER_ROW = 14;

/* Complete class strings per status (the Tailwind compiler reads source text,
   so none of these can be assembled from fragments). Status colours are the
   --st-* custom properties from css/main.css. */
const PIP_TONES = {
  new: 'tw:bg-[var(--st-new)] tw:ring-1 tw:ring-[#AEAAA0]',
  thriving: 'tw:bg-[var(--st-thriving)]',
  good: 'tw:bg-[var(--st-good)]',
  average: 'tw:bg-[var(--st-average)]',
  poor: 'tw:bg-[var(--st-poor)]',
  critical: 'tw:bg-[var(--st-critical)]',
  treating: 'tw:bg-[var(--st-treating)]',
  retired: 'tw:bg-[var(--st-retired)]',
};

const STATUS_TAG_TONES = {
  new: 'tw:bg-[#A09C92]/20 tw:text-[#5E5A51]',
  thriving: 'tw:bg-mark-green/15 tw:text-[#375B3A]',
  good: 'tw:bg-mark-green/15 tw:text-[#375B3A]',
  average: 'tw:bg-amber-wash tw:text-amber-deep',
  poor: 'tw:bg-mark-red/15 tw:text-[#8C2B21]',
  critical: 'tw:bg-[#7A1B14]/15 tw:text-[#6A1710]',
  treating: 'tw:bg-mark-blue/15 tw:text-[#274865]',
  retired: 'tw:bg-[#78746A]/15 tw:text-[#57534B]',
};

const LABEL = 'tw:font-mono tw:text-[10.5px] tw:font-medium tw:uppercase tw:tracking-[0.12em] tw:text-propolis-40';

/* The small status dot (legend, status tag, the retired-hives note). */
export const statusPip = (status) =>
  `<span class="tw:inline-block tw:size-2 tw:shrink-0 tw:rounded-full ${PIP_TONES[status] || 'tw:bg-propolis-40'}"></span>`;

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
      <div class="tw:flex tw:items-center tw:gap-1.5 tw:text-[11.5px] tw:text-propolis-60">
        ${statusPip(k)}
        <span>${statusLabels[k]}</span>
        <span class="tw:font-mono tw:text-[11px] tw:text-propolis-40">${counts[k]}</span>
      </div>`).join('');

  return `
    <div class="comb-field" id="${id}" role="group" aria-label="Hive status grid">${rows}</div>
    <div class="tw:mt-4 tw:flex tw:flex-wrap tw:gap-x-5 tw:gap-y-3">${legend}</div>`;
}

const metric = (label, value) => `
  <div class="tw:min-w-0">
    <dt class="tw:font-mono tw:text-[9.5px] tw:uppercase tw:tracking-[0.12em] tw:text-propolis-40">${label}</dt>
    <dd class="tw:mt-1 tw:ml-0 tw:font-mono tw:text-[13px] tw:text-propolis">${value}</dd>
  </div>`;

const small = (text) => `<small class="tw:text-[10px] tw:text-propolis-40">${text}</small>`;

const detail = (label, value) => `
  <div>
    <div class="${LABEL}">${label}</div>
    ${value}
  </div>`;

export function renderReadout(hive, { editable = false } = {}) {
  if (!hive) {
    return `<div class="tw:border-t tw:border-comb-shade/70 tw:px-6 tw:py-5 tw:text-sm tw:text-propolis-40" id="readout">
      Select any cell above to read that hive's record.
    </div>`;
  }

  /* hive.lineInfo is already resolved (queen line + breeder), embedded by
     js/store.js's loadApiaries/loadApiary — real hives can structurally
     carry no queen line at all, unlike every mock hive. */
  const line = hive.lineInfo;
  const tf = hive.status === 'treating'
    ? 'Under treatment'
    : hive.treatmentFree === 0 ? 'Not yet established' : `${hive.treatmentFree} season${hive.treatmentFree > 1 ? 's' : ''}`;

  return `
    <div class="readout-in tw:border-t tw:border-comb-shade/70 tw:px-6 tw:py-6" id="readout">
      <div class="tw:flex tw:flex-wrap tw:items-start tw:gap-x-4 tw:gap-y-3">
        <div class="tw:min-w-0 tw:flex-1 tw:basis-48">
          <h3 class="tw:font-mono tw:text-lg tw:tracking-tight tw:text-propolis">${hive.id}</h3>
          <p class="tw:mt-1 tw:text-sm tw:text-propolis-60">${esc(statusNote[hive.status])}</p>
        </div>
        <div class="tw:flex tw:items-center tw:gap-2">
          ${editable ? button({ id: 'edit-hive', label: 'Edit', icon: icons.pen, variant: 'outline', size: 'sm' }) : ''}
          <span class="tw:inline-flex tw:items-center tw:gap-1.5 tw:whitespace-nowrap tw:rounded-full tw:px-2.5 tw:py-1 tw:font-mono tw:text-[10.5px] tw:font-medium tw:uppercase tw:tracking-[0.06em] ${STATUS_TAG_TONES[hive.status] || STATUS_TAG_TONES.new}">${statusPip(hive.status)}${statusLabels[hive.status]}</span>
        </div>
      </div>

      <dl class="tw:mt-6 tw:grid tw:grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] tw:gap-x-4 tw:gap-y-5">
        ${metric('Mite load', `${hive.miteLoad == null ? '—' : hive.miteLoad}${small(' /100')}`)}
        ${metric('Hive Configuration', hive.broodFrames || '—')}
        ${metric('Last inspected', hive.lastInspectedAt
          ? relDays(Math.round((new Date(hive.lastInspectedAt) - new Date()) / 86400000))
          : 'Never')}
        ${metric('Treatment free', tf)}
        ${hive.latestWeight ? metric('Colony weight', `${formatKg(hive.latestWeight.kg)}${small(` · ${hive.latestWeight.date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`)}`) : ''}
      </dl>

      <div class="tw:mt-6 tw:flex tw:flex-wrap tw:gap-x-8 tw:gap-y-4 tw:border-t tw:border-comb-shade/70 tw:pt-5">
        ${detail('Queen Line', `<div class="tw:mt-1 tw:font-mono tw:text-[13px] tw:text-propolis">${line ? `${esc(line.name)} · gen ${line.gen}` : '—'}</div>`)}
        ${detail('Queen ID', `<div class="tw:mt-1 tw:font-mono tw:text-[13px] tw:text-propolis">${hive.queenId ? esc(hive.queenId) : '—'}</div>`)}
        ${detail('Contributed by', `<div class="tw:mt-1 tw:text-[13px] tw:text-propolis">${line ? esc(line.breeder.name) : '—'}</div>`)}
        ${detail('Queen marked', `
          <div class="tw:mt-1 tw:flex tw:items-center tw:gap-1.5 tw:text-[13px] tw:text-propolis">
            <span class="tw:size-2 tw:shrink-0 tw:rounded-full tw:ring-1 tw:ring-comb-shade" style="background:${queenMarkFill(hive.queenColour)}"></span>
            ${hive.queenColour}${hive.queenYear ? ` · ${hive.queenYear}` : ''}
          </div>`)}
      </div>

      ${hive.comment ? `
      <div class="tw:mt-5 tw:border-t tw:border-comb-shade/70 tw:pt-5">
        <div class="${LABEL}">Comments</div>
        <p class="tw:mt-1 tw:text-sm tw:leading-relaxed tw:text-propolis-60">${esc(hive.comment)}</p>
      </div>` : ''}
    </div>`;
}

/* Wire cell selection. Call after the comb is in the DOM. Pass onEditHive to
   show and wire an Edit button on the readout (omit it — e.g. on the
   read-only dashboard preview — and no Edit button renders at all). Pass
   onSelectHive to be told which hive was just picked (js/views/apiaries.js
   uses this to keep a separate "Inspection reports" panel in sync with
   whichever hive's readout is showing). */
export function bindComb(root, hives, { onEditHive, onSelectHive } = {}) {
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
    if (onSelectHive) onSelectHive(hive);
  });
}
