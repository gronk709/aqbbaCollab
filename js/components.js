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
export const button = ({ href, id, label, icon = '', variant = 'primary', size = 'md', block = false }) => {
  const cls = `tw:inline-flex tw:items-center tw:justify-center tw:rounded-lg tw:font-medium tw:transition tw:duration-200 tw:hover:-translate-y-px tw:disabled:pointer-events-none tw:disabled:opacity-60 ${BUTTON_SIZES[size]} ${BUTTON_VARIANTS[variant]} ${block ? 'tw:w-full' : ''}`;
  const idAttr = id ? ` id="${id}"` : '';
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

/* Big-numeral step in a short numbered sequence. `icon` is trusted markup. */
export const stepItem = ({ n, title, icon, body }) => `
  <div class="tw:flex tw:gap-5">
    <span class="tw:font-display tw:text-8xl tw:leading-none tw:font-medium tw:text-amber" aria-hidden="true">${n}</span>
    <div class="tw:pt-2">
      <h3 class="tw:flex tw:items-center tw:gap-2 tw:font-display tw:text-3xl tw:font-medium tw:text-propolis">
        ${esc(title)}<span class="tw:text-amber">${icon}</span>
      </h3>
      <p class="tw:mt-2 tw:text-[17px] tw:leading-snug tw:text-propolis-60">${esc(body)}</p>
    </div>
  </div>`;
