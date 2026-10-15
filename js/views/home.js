/* ==========================================================================
   Signed-in landing page ('#/') — the first page on the Tailwind look,
   laid out after iNaturalist's home page: photo-style hero, a "what you can
   do here" row, story cards, one featured record told as who/what/where/
   when, headline numbers, and a numbered how-it-works band.

   Everything shown is real data (projects, the latest inspection, live
   counts). Project cards and their photos come from js/projectArt.js, shared
   with the projects pages.
   ========================================================================== */

import { statusLabels, relDays } from '../data.js';
import { currentUser } from '../store.js';
import { esc } from '../ui.js';
import { band, button, featureItem, statBlock, stepItem } from '../components.js';
import { hexPoints, projectStoryCard } from '../projectArt.js';

/* ---- "With AQBBA, you can" illustrations: two-tone, honey + propolis --- */

const ICONS = {
  assess: `<svg viewBox="0 0 80 80" class="tw:size-full" aria-hidden="true">
    <path d="M31 13l17 9.8v19.6L31 52.2 14 42.4V22.8z" style="fill:var(--amber)"/>
    <path d="M31 22.5l8.6 5v10L31 42.5l-8.6-5v-10z" style="fill:var(--amber-wash)"/>
    <circle cx="44" cy="38" r="16" fill="none" style="stroke:var(--propolis)" stroke-width="5"/>
    <path d="M56 50l12 12" style="stroke:var(--propolis)" stroke-width="7" stroke-linecap="round"/>
  </svg>`,
  record: `<svg viewBox="0 0 80 80" class="tw:size-full" aria-hidden="true">
    <rect x="17" y="13" width="46" height="58" rx="6" style="fill:var(--propolis)"/>
    <rect x="23" y="22" width="34" height="43" rx="2" fill="#fff"/>
    <rect x="30" y="8" width="20" height="11" rx="3" style="fill:var(--amber)"/>
    <path d="M28 33l3.5 3.5 6-7M28 46l3.5 3.5 6-7" fill="none" style="stroke:var(--amber)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M42 33h10M42 46h10M28 58h24" style="stroke:var(--propolis-40)" stroke-width="3" stroke-linecap="round"/>
  </svg>`,
  contribute: `<svg viewBox="0 0 80 80" class="tw:size-full" aria-hidden="true">
    <path d="M40 30l19 11v22L40 74 21 63V41z" style="fill:var(--propolis)"/>
    <path d="M40 41l9.5 5.5v11L40 63l-9.5-5.5v-11z" style="fill:var(--amber)"/>
    <path d="M22 26l5-17 8 9 5-11 5 11 8-9 5 17z" style="fill:var(--amber)"/>
    <circle cx="27" cy="9" r="3" style="fill:var(--amber)"/><circle cx="40" cy="6" r="3" style="fill:var(--amber)"/><circle cx="53" cy="9" r="3" style="fill:var(--amber)"/>
  </svg>`,
  learn: `<svg viewBox="0 0 80 80" class="tw:size-full" aria-hidden="true">
    <path d="M8 20c11-4 22-2 32 5v44c-10-7-21-9-32-5z" style="fill:var(--propolis)"/>
    <path d="M72 20c-11-4-22-2-32 5v44c10-7 21-9 32-5z" style="fill:var(--amber)"/>
    <path d="M15 32c6-1.5 12-1 17 2M15 42c6-1.5 12-1 17 2M15 52c6-1.5 12-1 17 2" fill="none" style="stroke:var(--propolis-40)" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M56 33l7 4v8l-7 4-7-4v-8z" style="fill:var(--amber-wash)"/>
  </svg>`,
  connect: `<svg viewBox="0 0 80 80" class="tw:size-full" aria-hidden="true">
    <path d="M12 10h32a7 7 0 017 7v17a7 7 0 01-7 7H26l-11 9v-9h-3a7 7 0 01-7-7V17a7 7 0 017-7z" fill="#fff" style="stroke:var(--propolis)" stroke-width="4" stroke-linejoin="round"/>
    <path d="M28 18.5l7 4v8l-7 4-7-4v-8z" style="fill:var(--amber)"/>
    <path d="M68 34H40a7 7 0 00-7 7v15a7 7 0 007 7h15l11 9v-9h2a7 7 0 007-7V41a7 7 0 00-7-7z" style="fill:var(--amber);stroke:var(--amber-deep)" stroke-width="4" stroke-linejoin="round"/>
    <path d="M53 41.5l7 4v8l-7 4-7-4v-8z" fill="#fff"/>
  </svg>`,
};

/* Small inline glyphs beside the numbered steps. */
const STEP_ICONS = {
  assess: `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>`,
  record: `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M8.5 11l2 2 4-4.5M9 17h6"/></svg>`,
  select: `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M4 18l1.5-10 4 4L12 6l2.5 6 4-4L20 18z"/><path d="M4 21h16"/></svg>`,
};

/* ---- Sections ----------------------------------------------------------- */

function hero(me) {
  const firstName = (me.name || '').split(/\s+/)[0];
  return `
    <section class="tw:relative tw:isolate tw:flex tw:min-h-[32rem] tw:items-center tw:overflow-hidden tw:bg-propolis tw:px-6 tw:py-24 tw:text-white tw:md:min-h-[36rem]">
      <img src="assets/photos/contact_us_banner.jpg"
           srcset="assets/photos/contact_us_banner-1000.jpg 1000w, assets/photos/contact_us_banner.jpg 2000w"
           sizes="100vw" alt="" fetchpriority="high"
           class="tw:absolute tw:inset-0 tw:-z-20 tw:size-full tw:object-cover">
      <div class="tw:absolute tw:inset-0 tw:-z-10 tw:bg-propolis/60"></div>
      <div class="tw:absolute tw:inset-0 tw:-z-10 tw:bg-[radial-gradient(75%_65%_at_50%_45%,rgb(43_31_14/0.45),transparent_75%)]"></div>
      <div class="tw:mx-auto tw:max-w-4xl tw:text-center tw:[text-shadow:0_1px_14px_rgb(0_0_0/0.45)]">
        ${firstName ? `<p class="tw:font-mono tw:text-xs tw:font-medium tw:uppercase tw:tracking-[0.18em] tw:text-amber-bright">Welcome back, ${esc(firstName)}</p>` : ''}
        <h1 class="tw:mt-5 tw:font-display tw:text-4xl tw:font-semibold tw:leading-[1.08] tw:tracking-tight tw:text-balance tw:sm:text-5xl tw:md:text-6xl">
          At the Heart of Every Thriving Colony Is a Great Queen Bee.
        </h1>
        <p class="tw:mx-auto tw:mt-6 tw:max-w-2xl tw:text-lg tw:leading-relaxed tw:text-white/90 tw:text-pretty tw:md:text-xl">
          Queen bee breeding initiatives and projects that promote the skills, knowledge and quality of outcomes for our industry.
        </p>
        <div class="tw:mt-9 tw:[text-shadow:none]">${button({ href: '#/apiaries', label: 'Explore the apiaries', variant: 'light' })}</div>
        <p class="tw:mt-8 tw:font-mono tw:text-sm tw:text-white/80">Science-driven and industry-focused.</p>
      </div>
    </section>`;
}

function features() {
  const items = [
    { href: '#/repository/rs-assess', icon: ICONS.assess, title: 'Assess', sub: 'colonies for varroa sensitive hygiene' },
    { href: '#/apiaries', icon: ICONS.record, title: 'Record', sub: 'inspections across the research apiaries' },
    { href: '#/projects/p0/dashboard', icon: ICONS.contribute, title: 'Contribute', sub: 'queen lines to the breeding program' },
    { href: '#/repository', icon: ICONS.learn, title: 'Learn', sub: "from the association's repository" },
    { href: '#/forum', icon: ICONS.connect, title: 'Connect', sub: 'with breeders in the forum' },
  ];
  return band({
    tone: 'tint',
    title: 'With AQBBA, you can:',
    body: `<div class="tw:grid tw:grid-cols-2 tw:gap-x-4 tw:gap-y-8 tw:sm:grid-cols-3 tw:lg:grid-cols-5">${items.map(featureItem).join('')}</div>`,
  });
}

function projectStories(projects) {
  if (!projects.length) return '';
  const cards = projects.slice(0, 3).map(projectStoryCard).join('');
  return band({
    tone: 'white',
    title: 'Research in progress',
    body: `
      <div class="tw:mx-auto tw:grid tw:max-w-5xl tw:gap-8 tw:md:grid-cols-3">${cards}</div>
      <div class="tw:mt-12 tw:text-center">${button({ href: '#/projects', label: 'See all projects' })}</div>`,
  });
}

/* The featured hive's place among every hive at its apiary — this page's
   answer to iNaturalist's observation map. */
function miniComb(hives, highlightId) {
  const perRow = 10;
  const w = 28;
  const r = w / Math.sqrt(3);
  const pitchY = r * 1.5;
  const padTop = 34;
  const sorted = [...hives].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  const rows = Math.ceil(sorted.length / perRow);
  let cells = '';
  let pin = '';
  sorted.forEach((h, i) => {
    const row = Math.floor(i / perRow);
    const cx = (i % perRow) * w + w / 2 + (row % 2 ? w / 2 : 0) + 2;
    const cy = padTop + r + row * pitchY;
    const on = h.id === highlightId;
    cells += `<polygon points="${hexPoints(cx, cy, w * 0.9)}"
      style="fill:${on ? 'var(--amber)' : `var(--st-${h.status})`};fill-opacity:${on ? 1 : 0.42};stroke:${on ? 'var(--propolis)' : 'none'};stroke-width:2"><title>${esc(h.id)}</title></polygon>`;
    if (on) {
      pin = `<path d="M${cx} ${cy - 4}c0 0-11-10-11-17.5a11 11 0 0122 0C${cx + 11} ${cy - 14} ${cx} ${cy - 4} ${cx} ${cy - 4}z" style="fill:var(--amber-deep);stroke:#fff" stroke-width="2"/>
             <circle cx="${cx}" cy="${cy - 21.5}" r="4" fill="#fff"/>`;
    }
  });
  const width = perRow * w + w / 2 + 4;
  const height = padTop + rows * pitchY + r * 0.5 + 4;
  return `<svg viewBox="0 0 ${width.toFixed(0)} ${height.toFixed(0)}" class="tw:block tw:h-auto tw:w-full"
               role="img" aria-label="Hive ${esc(highlightId)} among the ${sorted.length} hives at this apiary">${cells}${pin}</svg>`;
}

/* Latest inspection date wins; among same-day records, prefer the one with
   the most to say (a note and a mite count) so the story isn't empty. */
function pickFeatured(inspections) {
  if (!inspections.length) return null;
  const latest = inspections.reduce((a, b) => (b.date > a.date ? b : a));
  const sameDay = inspections.filter((i) => i.date.getTime() === latest.date.getTime());
  return sameDay.find((i) => i.note && i.miteCount != null) || sameDay.find((i) => i.note) || sameDay[0];
}

const storyLabel = (text) => `<h3 class="tw:w-24 tw:shrink-0 tw:font-display tw:text-2xl tw:font-medium tw:text-propolis">${text}</h3>`;
const storyRule = '<hr class="tw:my-6 tw:border-0 tw:border-t tw:border-comb-shade">';

function chip(text) {
  return `<span class="tw:rounded-full tw:bg-comb tw:px-2.5 tw:py-1 tw:font-mono tw:text-xs tw:text-propolis-60">${esc(text)}</span>`;
}

function inspectionStory(apiaries, inspections) {
  const insp = pickFeatured(inspections);
  if (!insp) return '';
  const ap = apiaries.find((a) => a.id === insp.apiary);
  if (!ap) return '';
  const hive = ap.hiveRecords.find((h) => h.id === insp.hiveId);

  const who = insp.by ? insp.by : { name: 'Unknown', initials: '?' };
  const measures = [
    insp.miteCount != null ? `Mite count ${insp.miteCount}` : null,
    insp.temperament != null ? `Temperament ${insp.temperament}/5` : null,
    insp.productivity != null ? `Productivity ${insp.productivity}/5` : null,
    insp.vigour != null ? `Vigour ${insp.vigour}/5` : null,
    insp.broodPattern != null ? `Brood pattern ${insp.broodPattern}/5` : null,
  ].filter(Boolean);
  const dateLabel = insp.date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  const ago = relDays(Math.round((insp.date - new Date()) / 86400000));

  const line = hive && hive.lineInfo;
  const queen = hive && hive.queenColour
    ? `<span class="tw:inline-block tw:size-3 tw:rounded-full tw:ring-1 tw:ring-propolis/25" style="background:var(--mark-${hive.queenColour})"></span>
       <span class="tw:text-xs tw:italic tw:text-propolis-60">Queen marked ${esc(hive.queenColour)}${hive.queenYear ? ` · ${hive.queenYear}` : ''}</span>`
    : '';

  const what = `
    <div class="tw:min-w-0 tw:flex-1">
      <a href="#/apiaries/${esc(ap.id)}" class="tw:group tw:block tw:rounded-xl tw:border tw:border-comb-shade tw:bg-white tw:p-5 tw:shadow-sm tw:transition tw:hover:-translate-y-0.5 tw:hover:shadow-md">
        <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-3">
          <span class="tw:font-mono tw:text-3xl tw:font-semibold tw:text-propolis">${esc(insp.hiveId)}</span>
          ${insp.status ? `<span class="tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-full tw:border tw:border-comb-shade tw:px-2.5 tw:py-1 tw:text-xs tw:font-medium tw:text-propolis">
            <span class="tw:size-2 tw:rounded-full" style="background:var(--st-${insp.status})"></span>${esc(statusLabels[insp.status] || insp.status)}</span>` : ''}
          <span class="tw:ml-auto tw:font-mono tw:text-xs tw:text-propolis-40">${esc(insp.kind)}</span>
        </div>
        ${measures.length ? `<div class="tw:mt-4 tw:flex tw:flex-wrap tw:gap-2">${measures.map(chip).join('')}</div>` : ''}
        ${insp.note ? `<p class="tw:mt-4 tw:line-clamp-3 tw:text-sm tw:leading-relaxed tw:text-propolis-60">${esc(insp.note)}</p>` : ''}
        <span class="tw:mt-4 tw:inline-block tw:text-sm tw:font-medium tw:text-amber-deep tw:group-hover:underline">Open ${esc(ap.name)} →</span>
      </a>
      ${line || queen ? `
      <div class="tw:mt-3 tw:flex tw:flex-wrap tw:items-center tw:gap-x-3 tw:gap-y-1">
        ${line ? `<span class="tw:text-[15px] tw:text-propolis">${esc(line.name)}</span>` : ''}
        ${queen}
      </div>` : ''}
    </div>`;

  const left = `
    <div class="tw:flex tw:items-center tw:gap-4">
      ${storyLabel('Who')}
      <span class="tw:grid tw:size-9 tw:place-items-center tw:rounded-full tw:bg-amber-wash tw:font-mono tw:text-xs tw:font-semibold tw:text-amber-deep">${esc(who.initials || '?')}</span>
      <span class="tw:text-lg tw:text-propolis">${esc(who.name)}</span>
    </div>
    ${storyRule}
    <div class="tw:flex tw:items-start tw:gap-4">${storyLabel('What')}${what}</div>`;

  const right = `
    <hr class="tw:mb-6 tw:border-0 tw:border-t tw:border-comb-shade tw:lg:hidden">
    <div class="tw:flex tw:items-start tw:gap-4">
      ${storyLabel('Where')}
      <div class="tw:min-w-0 tw:flex-1">
        <div class="tw:rounded-xl tw:border tw:border-comb-shade tw:bg-white tw:p-4 tw:shadow-sm">${miniComb(ap.hiveRecords, insp.hiveId)}</div>
        <p class="tw:mt-3 tw:flex tw:items-center tw:gap-1.5 tw:text-[15px] tw:text-propolis">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>
          ${esc(ap.name)}${ap.region ? ` · ${esc(ap.region)}` : ''}
        </p>
      </div>
    </div>
    ${storyRule}
    <div class="tw:flex tw:items-center tw:gap-4">
      ${storyLabel('When')}
      <p class="tw:flex tw:items-center tw:gap-1.5 tw:text-[15px] tw:text-propolis">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
        ${esc(dateLabel)} <span class="tw:text-propolis-40">· ${esc(ago)}</span>
      </p>
    </div>`;

  return band({
    tone: 'tint',
    title: 'Every inspection tells a story',
    body: `<div class="tw:mx-auto tw:grid tw:max-w-5xl tw:gap-6 tw:lg:grid-cols-2 tw:lg:gap-16"><div>${left}</div><div>${right}</div></div>`,
  });
}

function stats(apiaries, inspections, queenLines, publicStats) {
  const n = (v) => (v == null ? '—' : v.toLocaleString('en-AU'));
  const hives = apiaries.reduce((sum, a) => sum + a.hiveRecords.length, 0);
  const blocks = [
    { value: n(hives), label: 'hives registered across the research apiaries' },
    { value: n(inspections.length), label: 'inspections logged by members' },
    { value: n(queenLines.length), label: 'queen lines contributed to the program' },
    { value: n(publicStats ? publicStats.memberCount : null), label: 'contributing members' },
  ];
  return band({
    tone: 'white',
    body: `<div class="tw:mx-auto tw:grid tw:max-w-3xl tw:gap-x-12 tw:gap-y-14 tw:sm:grid-cols-2">${blocks.map(statBlock).join('')}</div>`,
  });
}

function steps() {
  const items = [
    { n: 1, title: 'Assess', icon: STEP_ICONS.assess, body: 'Colonies at the research apiaries are assessed against a common protocol: mite counts, UBeeO and hygiene scores.' },
    { n: 2, title: 'Record', icon: STEP_ICONS.record, body: "Every inspection is logged here, so each member's results sit alongside everyone else's, measured the same way." },
    { n: 3, title: 'Select', icon: STEP_ICONS.select, body: 'The strongest colonies become the queen lines the program breeds from next.' },
  ];
  return band({
    tone: 'tint',
    body: `<div class="tw:mx-auto tw:grid tw:max-w-5xl tw:gap-12 tw:lg:grid-cols-3 tw:lg:gap-10">${items.map(stepItem).join('')}</div>`,
  });
}

function closing() {
  const statement = (title, text) => `
    <div>
      <h2 class="tw:font-display tw:text-3xl tw:font-medium tw:tracking-tight tw:text-propolis">${esc(title)}</h2>
      <p class="tw:mx-auto tw:mt-3 tw:max-w-xl tw:text-lg tw:leading-relaxed tw:text-propolis-60 tw:text-pretty">${esc(text)}</p>
    </div>`;
  return band({
    tone: 'white',
    body: `<div class="tw:mx-auto tw:max-w-2xl tw:space-y-12 tw:text-center">
      ${statement('Built by breeders, for breeders', 'A collaboration space for the Australian Queen Bee Breeders Association and its partners, working on queen bee breeding initiatives and projects across the country.')}
      ${statement('Every inspection counts', 'Each assessment logged here joins a shared record the whole program draws on when choosing which lines to breed from.')}
    </div>`,
  });
}

export function renderHome(data) {
  const { apiaries, inspections, projects, queenLines, stats: publicStats } = data;
  return `
    <div class="view">
      ${hero(currentUser())}
      ${features()}
      ${projectStories(projects)}
      ${inspectionStory(apiaries, inspections)}
      ${stats(apiaries, inspections, queenLines, publicStats)}
      ${steps()}
      ${closing()}
    </div>`;
}
