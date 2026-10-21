/* ==========================================================================
   Tailwind-styled building blocks, shared by any page migrated to the new
   look (js/views/home.js first). Every class is written out in full, never
   assembled from fragments, because the Tailwind compiler finds classes by
   scanning source text — see tools/tailwind/input.css. Variants therefore
   pick from complete class strings rather than interpolating parts.
   ========================================================================== */

import { esc } from './ui.js';

const BAND_TONES = {
  white: 'tw:bg-white',
  tint: 'tw:bg-comb-deep/55',
};

/* A full-width section band with a centred, width-capped content column.
   Pages alternate tones the way iNaturalist's home page alternates white
   and tinted bands. */
export function band({ tone = 'white', title = '', body }) {
  return `
    <section class="${BAND_TONES[tone]} tw:px-6 tw:py-16 tw:md:py-20">
      <div class="tw:mx-auto tw:max-w-6xl">
        ${title ? sectionTitle(title) : ''}
        ${body}
      </div>
    </section>`;
}

export const sectionTitle = (text) => `
  <h2 class="tw:mb-10 tw:text-center tw:font-display tw:text-3xl tw:font-medium tw:tracking-tight tw:text-propolis tw:md:mb-12 tw:md:text-4xl">
    ${esc(text)}
  </h2>`;

const BUTTON_VARIANTS = {
  primary: 'tw:bg-amber-deep tw:text-white tw:hover:bg-propolis',
  light: 'tw:bg-white tw:text-propolis tw:shadow-lg tw:shadow-black/25 tw:hover:bg-comb',
  outline: 'tw:border tw:border-comb-shade tw:bg-white tw:text-propolis tw:hover:border-amber tw:hover:bg-comb',
  // For use over photography.
  glass: 'tw:bg-black/25 tw:text-white tw:ring-1 tw:ring-white/40 tw:backdrop-blur-sm tw:hover:bg-black/40',
};

const BUTTON_SIZES = {
  md: 'tw:gap-2 tw:px-6 tw:py-2.5 tw:font-display tw:text-xl',
  sm: 'tw:gap-1.5 tw:px-3.5 tw:py-1.5 tw:text-sm',
};

/* A link when given `href`, otherwise a <button> (pass `id` to bind it).
   `icon` is trusted markup, shown before the label. */
export const button = ({ href, id, label, icon = '', variant = 'primary', size = 'md', block = false, attrs = '' }) => {
  const cls = `tw:inline-flex tw:items-center tw:justify-center tw:rounded-lg tw:font-medium tw:transition tw:duration-200 tw:hover:-translate-y-px tw:disabled:pointer-events-none tw:disabled:opacity-60 ${BUTTON_SIZES[size]} ${BUTTON_VARIANTS[variant]} ${block ? 'tw:w-full' : ''}`;
  const idAttr = `${id ? ` id="${id}"` : ''}${attrs ? ` ${attrs}` : ''}`;
  return href
    ? `<a href="${href}"${idAttr} class="${cls}">${icon}${esc(label)}</a>`
    : `<button type="button"${idAttr} class="${cls}">${icon}${esc(label)}</button>`;
};

/* Icon-over-label item for a "what you can do here" row. */
export const featureItem = ({ href, icon, title, sub }) => `
  <a href="${href}" class="tw:group tw:flex tw:flex-col tw:items-center tw:rounded-2xl tw:px-3 tw:py-4 tw:text-center tw:transition tw:duration-200 tw:hover:bg-white/70">
    <span class="tw:block tw:size-20 tw:transition tw:duration-300 tw:group-hover:-translate-y-1">${icon}</span>
    <span class="tw:mt-5 tw:font-display tw:text-2xl tw:font-medium tw:text-propolis tw:transition tw:group-hover:text-amber-deep">${esc(title)}</span>
    <span class="tw:mt-1 tw:max-w-44 tw:text-[15px] tw:leading-snug tw:text-propolis-60">${esc(sub)}</span>
  </a>`;

/* Image-led card with the title laid over the bottom of the cover.
   `cover` is trusted markup built by the caller (an <img> or a generated
   pattern); title/body/meta are plain text and get escaped here. */
export const storyCard = ({ href, cover, title, body, meta }) => `
  <a href="${href}" class="tw:group tw:flex tw:flex-col tw:overflow-hidden tw:rounded-2xl tw:border-2 tw:border-comb-shade/80 tw:bg-white tw:transition tw:duration-300 tw:hover:-translate-y-1 tw:hover:border-amber/60 tw:hover:shadow-xl tw:hover:shadow-propolis/10">
    <div class="tw:relative tw:aspect-[3/2] tw:overflow-hidden">
      <div class="tw:absolute tw:inset-0 tw:transition tw:duration-500 tw:group-hover:scale-105">${cover}</div>
      <div class="tw:absolute tw:inset-x-0 tw:bottom-0 tw:bg-linear-to-t tw:from-black/75 tw:via-black/35 tw:to-transparent tw:px-5 tw:pt-16 tw:pb-4">
        <h3 class="tw:text-center tw:font-display tw:text-2xl tw:font-semibold tw:leading-tight tw:text-white tw:text-balance tw:[text-shadow:0_1px_8px_rgb(0_0_0/0.45)]">${esc(title)}</h3>
      </div>
    </div>
    <div class="tw:flex tw:flex-1 tw:flex-col tw:gap-2 tw:px-5 tw:py-4">
      <p class="tw:line-clamp-3 tw:text-sm tw:leading-relaxed tw:text-propolis-60">${esc(body)}</p>
      <p class="tw:mt-auto tw:font-mono tw:text-xs tw:text-propolis-40">${esc(meta)}</p>
    </div>
  </a>`;

export const statBlock = ({ value, label }) => `
  <div class="tw:text-center">
    <div class="tw:font-display tw:text-6xl tw:font-semibold tw:tracking-tight tw:text-propolis tw:tabular-nums tw:md:text-7xl">${esc(value)}</div>
    <div class="tw:mx-auto tw:mt-1 tw:h-1 tw:w-10 tw:rounded-full tw:bg-amber"></div>
    <p class="tw:mt-3 tw:text-[15px] tw:text-propolis-60">${esc(label)}</p>
  </div>`;

/* ==========================================================================
   Page building blocks. Every page uses these, so a heading, card, table or
   filter looks the same wherever it appears. They are the Projects pages'
   own pieces, promoted here (js/views/projects.js now imports them).
   ========================================================================== */

/* ---- Page structure ---------------------------------------------------- */

/* The tinted band that opens a page: breadcrumb, eyebrow, title, actions on
   the title's line, an optional lede and optional extra content (filters).
   `crumbs` is [{label, href?}]; `actions` is trusted markup (buttons). */
/* `compact` is for titles that are sentences (a forum topic, an article):
   a size down so two lines don't dominate the page. */
export function pageHeader({ crumbs = [], eyebrow = '', title, badge = '', lede = '', actions = '', below = '', compact = false }) {
  const trail = crumbs.length ? `
    <nav aria-label="Breadcrumb" class="tw:mb-4 tw:flex tw:flex-wrap tw:items-center tw:gap-1 tw:text-sm tw:text-propolis-60">
      ${crumbs.map((c, i) => `${i ? `<span class="tw:text-propolis-40">${CHEVRON}</span>` : ''}${c.href
        ? `<a href="${c.href}" class="tw:transition tw:hover:text-amber-deep tw:hover:underline">${esc(c.label)}</a>`
        : `<span>${esc(c.label)}</span>`}`).join('')}
    </nav>` : '';
  return `
    <header class="tw:bg-comb-deep/55 tw:px-6 tw:pt-10 tw:pb-9 tw:md:pt-14">
      <div class="tw:mx-auto tw:max-w-6xl">
        ${trail}
        <div class="tw:flex tw:flex-wrap tw:items-end tw:gap-x-6 tw:gap-y-4">
          <div class="tw:min-w-0 tw:flex-1 tw:basis-80">
            ${eyebrow ? `<p class="tw:mb-3 tw:font-mono tw:text-xs tw:font-medium tw:uppercase tw:tracking-[0.18em] tw:text-amber-deep">${eyebrow}</p>` : ''}
            <h1 class="tw:flex tw:flex-wrap tw:items-center tw:gap-x-4 tw:gap-y-2 tw:font-display tw:font-semibold tw:tracking-tight tw:text-propolis ${compact ? 'tw:text-3xl tw:md:text-4xl' : 'tw:text-4xl tw:md:text-5xl'}">${esc(title)}${badge}</h1>
          </div>
          ${actions ? `<div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">${actions}</div>` : ''}
        </div>
        ${lede ? `<p class="tw:mt-5 tw:max-w-3xl tw:font-display tw:text-lg tw:leading-relaxed tw:text-propolis-60 tw:text-pretty">${lede}</p>` : ''}
        ${below ? `<div class="tw:mt-7">${below}</div>` : ''}
      </div>
    </header>`;
}

const CHEVRON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>';

/* The white page area under a header: a full-width band with the 72rem column. */
export const pageBody = (inner, { tone = 'white' } = {}) => `
  <div class="${BAND_TONES[tone]} tw:px-6 tw:py-12 tw:md:py-14">
    <div class="tw:mx-auto tw:max-w-6xl">${inner}</div>
  </div>`;

/* Main column plus a fixed-width sidebar (stacks on small screens). */
export const twoColumn = ({ main, side }) => `
  <div class="tw:grid tw:gap-x-12 tw:gap-y-8 tw:lg:grid-cols-[minmax(0,1fr)_21rem]">
    <div class="tw:min-w-0 tw:space-y-8">${main}</div>
    <aside class="tw:min-w-0 tw:space-y-6 tw:self-start">${side}</aside>
  </div>`;

/* ---- Cards -------------------------------------------------------------- */

export const CARD = 'tw:rounded-2xl tw:border tw:border-comb-shade tw:bg-white';

export const countBadge = (n) => `<span class="tw:rounded-full tw:bg-comb tw:px-2 tw:py-0.5 tw:font-mono tw:text-xs tw:text-propolis-60">${esc(n)}</span>`;

/* `flush` drops the body padding, for lists and tables that run edge to edge. */
export function card({ title = '', right = '', body, flush = false, id = '' }) {
  return `
    <section${id ? ` id="${id}"` : ''} class="${CARD} tw:min-w-0 tw:overflow-hidden">
      ${title || right ? `
      <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-x-3 tw:gap-y-2 ${flush ? 'tw:border-b tw:border-comb-shade/70 tw:px-6 tw:py-4' : 'tw:px-6 tw:pt-5'}">
        ${title ? `<h2 class="tw:font-display tw:text-xl tw:font-medium tw:text-propolis">${esc(title)}</h2>` : ''}
        ${right ? `<div class="tw:ml-auto tw:flex tw:items-center tw:gap-2">${right}</div>` : ''}
      </div>` : ''}
      <div class="${flush ? '' : `tw:px-6 tw:pb-6 ${title || right ? 'tw:pt-4' : 'tw:pt-6'}`}">${body}</div>
    </section>`;
}

/* A heading with the amber underline, for article-style sections. */
export const sectionHeading = (title) => `
  <h2 class="tw:font-display tw:text-3xl tw:font-medium tw:tracking-tight tw:text-propolis">${esc(title)}</h2>
  <div class="tw:mt-2 tw:mb-6 tw:h-1 tw:w-10 tw:rounded-full tw:bg-amber"></div>`;

export const emptyState = ({ title, text = '', action = '', bordered = true }) => `
  <div class="tw:mx-auto tw:max-w-xl tw:px-8 tw:py-12 tw:text-center ${bordered ? 'tw:rounded-2xl tw:border-2 tw:border-dashed tw:border-comb-shade' : ''}">
    <span class="tw:mx-auto tw:block tw:size-12 tw:text-amber"><svg viewBox="0 0 24 24" class="tw:size-full" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z"/><path d="M12 8.2l3.3 1.9v3.8L12 15.8l-3.3-1.9v-3.8z"/></svg></span>
    <h2 class="tw:mt-4 tw:font-display tw:text-2xl tw:font-medium tw:text-propolis">${esc(title)}</h2>
    ${text ? `<p class="tw:mt-2 tw:text-propolis-60">${text}</p>` : ''}
    ${action ? `<div class="tw:mt-6">${action}</div>` : ''}
  </div>`;

/* ---- Tables and lists --------------------------------------------------- */

/* A data table. `head` is an array of header labels (strings), `body` the
   <tr> rows as markup. Cell padding, header type and row rules come from this
   wrapper, so rows only need plain <td>s. */
const TABLE_CLS = [
  'tw:w-full tw:border-collapse tw:text-left tw:text-sm',
  'tw:[&_th]:whitespace-nowrap tw:[&_th]:px-5 tw:[&_th]:py-3.5 tw:[&_th]:font-mono tw:[&_th]:text-[10px] tw:[&_th]:font-medium tw:[&_th]:uppercase tw:[&_th]:tracking-[0.12em] tw:[&_th]:text-propolis-40',
  'tw:[&_td]:px-5 tw:[&_td]:py-3.5 tw:[&_td]:align-middle',
  'tw:[&_tbody_tr]:border-t tw:[&_tbody_tr]:border-comb-shade/70 tw:[&_tbody_tr]:transition-colors tw:[&_tbody_tr:hover]:bg-comb/60',
].join(' ');

export const table = ({ head, body, id = '' }) => `
  <div class="tw:overflow-x-auto">
    <table${id ? ` id="${id}"` : ''} class="${TABLE_CLS}">
      <thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;

/* Rows separated by hairlines; children are the <li> contents' wrappers. */
export const rowList = (items, { cls = '' } = {}) => `
  <ul class="tw:divide-y tw:divide-comb-shade/70 ${cls}">${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;

/* ---- Pills, tags and filters ------------------------------------------- */

const TAG_TONES = {
  neutral: 'tw:bg-comb-deep tw:text-propolis-60',
  amber: 'tw:bg-amber-wash tw:text-amber-deep',
  green: 'tw:bg-mark-green/15 tw:text-[#375B3A]',
  blue: 'tw:bg-mark-blue/15 tw:text-[#274865]',
  red: 'tw:bg-mark-red/15 tw:text-[#8C2B21]',
  critical: 'tw:bg-[#7A1B14]/15 tw:text-[#6A1710]',
  grey: 'tw:bg-[#78746A]/15 tw:text-[#57534B]',
  new: 'tw:bg-[#A09C92]/20 tw:text-[#5E5A51]',
  outline: 'tw:border tw:border-comb-shade tw:text-propolis-60',
};

export const tag = (text, tone = 'neutral') => `
  <span class="tw:inline-flex tw:items-center tw:gap-1.5 tw:whitespace-nowrap tw:rounded-full tw:px-2.5 tw:py-1 tw:font-mono tw:text-[10.5px] tw:font-medium tw:uppercase tw:tracking-[0.06em] ${TAG_TONES[tone] || TAG_TONES.neutral}">${esc(text)}</span>`;

/* A filter/segment pill. `attrs` carries the hook (e.g. 'data-status="active"'). */
export const filterPill = ({ label, count = null, on = false, attrs = '' }) => `
  <button type="button" ${attrs} aria-pressed="${on}"
          class="tw:inline-flex tw:items-center tw:gap-2 tw:rounded-full tw:border tw:px-4 tw:py-2 tw:text-sm tw:font-medium tw:transition ${on ? 'tw:border-propolis tw:bg-propolis tw:text-white' : 'tw:border-comb-shade tw:bg-white tw:text-propolis tw:hover:border-amber tw:hover:text-amber-deep'}">
    ${esc(label)}
    ${count == null ? '' : `<span class="tw:rounded-full tw:px-1.5 tw:font-mono tw:text-xs ${on ? 'tw:bg-white/15' : 'tw:bg-comb tw:text-propolis-60'}">${esc(count)}</span>`}
  </button>`;

/* A person: initials disc, name, optional second line. */
export const personRow = ({ initials, name, sub = '', href = '' }) => {
  const inner = `
    <span class="tw:grid tw:size-8 tw:shrink-0 tw:place-items-center tw:rounded-full tw:bg-amber-wash tw:font-mono tw:text-[11.5px] tw:font-semibold tw:text-propolis" aria-hidden="true">${esc(initials)}</span>
    <span class="tw:min-w-0">
      <span class="tw:block tw:truncate tw:text-[15px] tw:font-semibold tw:text-propolis">${esc(name)}</span>
      ${sub ? `<span class="tw:block tw:text-sm tw:leading-snug tw:text-propolis-60">${esc(sub)}</span>` : ''}
    </span>`;
  return href
    ? `<a href="${href}" class="tw:flex tw:items-center tw:gap-3 tw:transition tw:hover:opacity-80">${inner}</a>`
    : `<div class="tw:flex tw:items-center tw:gap-3">${inner}</div>`;
};

/* ---- Small controls ----------------------------------------------------- */

export const ICON_BUTTON = 'tw:grid tw:size-8 tw:shrink-0 tw:place-items-center tw:rounded-lg tw:text-propolis-40 tw:transition tw:hover:bg-comb tw:hover:text-propolis tw:disabled:opacity-50';
export const ICON_BUTTON_DANGER = 'tw:grid tw:size-8 tw:shrink-0 tw:place-items-center tw:rounded-lg tw:text-propolis-40 tw:transition tw:hover:bg-mark-red/10 tw:hover:text-mark-red tw:disabled:opacity-50';

/* The dashed "+ Add ..." pill. `attrs` carries the hook. */
export const addButton = ({ label, attrs = '', icon = '', spaced = false }) => `
  <button type="button" ${attrs}
          class="${spaced ? 'tw:mt-4' : ''} tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-full tw:border tw:border-dashed tw:border-amber/60 tw:px-3.5 tw:py-1.5 tw:text-sm tw:font-medium tw:text-amber-deep tw:transition tw:hover:border-amber tw:hover:bg-amber-wash">
    ${icon} ${esc(label)}
  </button>`;
