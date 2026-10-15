/* ==========================================================================
   Project imagery and the project story card, shared by the home page and
   the projects pages so a project looks the same wherever it appears.
   Photos live in assets/photos/, pre-cropped to the cards' 3:2; a project
   without one gets generated honeycomb artwork in a tone fixed by its code.
   ========================================================================== */

import { projectStatusLabels } from './data.js';
import { esc } from './ui.js';
import { storyCard } from './components.js';

/* Pointy-top hex outline centred on (cx, cy): w across the flats. */
export function hexPoints(cx, cy, w) {
  const r = w / Math.sqrt(3);
  return [
    [cx, cy - r], [cx + w / 2, cy - r / 2], [cx + w / 2, cy + r / 2],
    [cx, cy + r], [cx - w / 2, cy + r / 2], [cx - w / 2, cy - r / 2],
  ].map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ');
}

/* Decorative interlocking comb, stroked only. */
export function honeycomb({ cols, rows, w, cls }) {
  const pitchY = (w / Math.sqrt(3)) * 1.5;
  let cells = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = c * w + (r % 2 ? w / 2 : 0);
      cells += `<polygon points="${hexPoints(cx, r * pitchY, w * 0.94)}"/>`;
    }
  }
  return `<svg class="${cls}" viewBox="0 0 ${cols * w} ${rows * pitchY}" preserveAspectRatio="xMidYMid slice"
              fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">${cells}</svg>`;
}

/* Cover photos by project code (codes are fixed at creation — nothing in
   the app edits them). */
export const PROJECT_PHOTOS = {
  'PRJ-00': { src: 'assets/photos/cordovan-1.jpg', alt: 'A cordovan queen among her workers on brood comb' },
  'PRJ-02': { src: 'assets/photos/entrance_bees_cropped.jpg', alt: 'Foragers flying in to a hive entrance' },
  'PRJ-03': { src: 'assets/photos/ubeeo-application.jpg', alt: 'A beekeeper applying the UBeeO assay to a brood frame' },
};

/* Full class strings — see js/components.js for why they can't be built. */
const COVER_TONES = [
  'tw:bg-linear-to-br tw:from-propolis tw:via-[#5c3f16] tw:to-amber-deep',
  'tw:bg-linear-to-br tw:from-amber-deep tw:via-amber tw:to-amber-bright',
  'tw:bg-linear-to-br tw:from-[#3b2a12] tw:via-propolis-60 tw:to-amber',
];

const toneFor = (p) => COVER_TONES[(Number(String(p.code).replace(/\D/g, '')) || 0) % COVER_TONES.length];

/* The project's photo (or comb artwork) filling its positioned parent.
   `eager` for above-the-fold use, e.g. a page banner. */
export function projectCoverArt(p, { eager = false } = {}) {
  const photo = PROJECT_PHOTOS[p.code];
  const art = photo
    ? `<img src="${photo.src}" alt="${esc(photo.alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} width="1200" height="800" class="tw:absolute tw:inset-0 tw:size-full tw:object-cover">`
    : honeycomb({ cols: 9, rows: 6, w: 52, cls: 'tw:absolute tw:inset-0 tw:size-full tw:text-white/20' });
  return `<div class="tw:absolute tw:inset-0 ${toneFor(p)}">${art}</div>`;
}

export function projectMeta(p) {
  const n = (p.sites || []).length;
  const reach = n
    ? `${n} research ${n === 1 ? 'apiary' : 'apiaries'}`
    : `${p.participantCount} ${p.participantCount === 1 ? 'participant' : 'participants'}`;
  return `${projectStatusLabels[p.status] || p.status} · ${reach}`;
}

export function projectStoryCard(p) {
  return storyCard({
    href: `#/projects/${p.id}`,
    cover: `
      ${projectCoverArt(p)}
      <span class="tw:absolute tw:top-3 tw:left-3 tw:rounded-full tw:bg-black/35 tw:px-2.5 tw:py-1 tw:font-mono tw:text-[11px] tw:font-medium tw:tracking-wider tw:text-white tw:backdrop-blur-sm">${esc(p.code)}</span>`,
    title: p.title,
    body: p.summary || '',
    meta: projectMeta(p),
  });
}
