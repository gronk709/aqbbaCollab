/* ==========================================================================
   Mock data store. Deterministic: a seeded generator means hive records are
   identical on every reload, so a hive you inspected is the same hive later.
   Replace this module with API calls when the backend lands.
   ========================================================================== */

/* Mulberry32 — small, fast, seeded. */
function seeded(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const between = (rng, lo, hi) => lo + rng() * (hi - lo);
const intBetween = (rng, lo, hi) => Math.floor(between(rng, lo, hi + 1));

/* --------------------------------------------------------------------------
   Members. The signed-in user is Pete; the rest populate activity.
   -------------------------------------------------------------------------- */

export const members = [
  { id: 'm1',  name: 'Pete Czeti',        initials: 'PC', role: 'Research Coordinator', state: 'NSW', since: 2019, wa: 'WA-40118' },
  { id: 'm2',  name: 'Marguerite Ellery', initials: 'ME', role: 'Breeder — Level 3',    state: 'VIC', since: 2016, wa: 'WA-38402' },
  { id: 'm3',  name: 'Douglas Harnett',   initials: 'DH', role: 'Apiary Manager',       state: 'NSW', since: 2014, wa: 'WA-31877' },
  { id: 'm4',  name: 'Ani Rahmawati',     initials: 'AR', role: 'Breeder — Level 2',    state: 'QLD', since: 2021, wa: 'WA-44903' },
  { id: 'm5',  name: 'Trevor Bowe',       initials: 'TB', role: 'Apiary Manager',       state: 'TAS', since: 2011, wa: 'WA-29014' },
  { id: 'm6',  name: 'Hélène Marchetti',  initials: 'HM', role: 'Instrumental Insem.',  state: 'SA',  since: 2018, wa: 'WA-39550' },
  { id: 'm7',  name: 'Sam Okonkwo',       initials: 'SO', role: 'Breeder — Level 3',    state: 'WA',  since: 2015, wa: 'WA-33260' },
  { id: 'm8',  name: 'Bridget Naylor',    initials: 'BN', role: 'Breeder — Level 1',    state: 'VIC', since: 2023, wa: 'WA-47712' },
  { id: 'm9',  name: 'Kenji Watanabe',    initials: 'KW', role: 'Laboratory — Assays',  state: 'NSW', since: 2020, wa: 'WA-42881' },
  { id: 'm10', name: 'Fiona Delacourt',   initials: 'FD', role: 'Breeder — Level 2',    state: 'QLD', since: 2017, wa: 'WA-36104' },
];

export const currentUser = members[0];
export const memberById = (id) => members.find((m) => m.id === id) || members[0];

/* --------------------------------------------------------------------------
   Queen lines. Each traces to a contributing breeder.
   -------------------------------------------------------------------------- */

export const queenLines = [
  { code: 'BRW-14', name: 'Barrowfield 14',  breeder: 'm2', gen: 7, vshMean: 82, note: 'Highest recapping rate in the program. Slow spring build.' },
  { code: 'KLN-03', name: 'Kellyanne 3',     breeder: 'm7', gen: 5, vshMean: 76, note: 'Broad brood pattern, calm on the frame.' },
  { code: 'TMB-22', name: 'Tambo 22',        breeder: 'm5', gen: 9, vshMean: 88, note: 'Program benchmark for VSH expression.' },
  { code: 'ORA-08', name: 'Oradale 8',       breeder: 'm4', gen: 3, vshMean: 64, note: 'Recent entrant. Strong honey yield, VSH under assessment.' },
  { code: 'WDG-11', name: 'Wandagee 11',     breeder: 'm7', gen: 6, vshMean: 71, note: 'Drought hardy. Sourced from Gascoyne stock.' },
  { code: 'MRN-05', name: 'Merrindale 5',    breeder: 'm10', gen: 4, vshMean: 79, note: 'Low swarming tendency across three seasons.' },
  { code: 'CVE-17', name: 'Coalvale 17',     breeder: 'm6', gen: 8, vshMean: 85, note: 'II-maintained closed population. Narrow genetic base.' },
];

export const lineByCode = (code) => queenLines.find((l) => l.code === code);

/* --------------------------------------------------------------------------
   Research apiaries. Three sites at different program stages.
   -------------------------------------------------------------------------- */

const apiarySeeds = [
  {
    id: 'ap-tambo', name: 'Tambo Crossing', code: 'TMB',
    region: 'East Gippsland, VIC', coords: '37.4382° S, 147.7461° E',
    stage: 'maintenance', manager: 'm5', established: 2019, hives: 104, seed: 4471,
    flora: 'Yellow box, red stringybark, silver wattle',
    brief: 'The program\'s reference site. Nine generations of closed-population selection with no miticide input since the 2021/22 season.',
  },
  {
    id: 'ap-barrow', name: 'Barrowfield', code: 'BRW',
    region: 'Central Tablelands, NSW', coords: '33.6712° S, 149.5803° E',
    stage: 'assessment', manager: 'm3', established: 2021, hives: 98, seed: 8823,
    flora: 'Ironbark, grey box, canola (seasonal)',
    brief: 'Mid-cycle assessment of four lines against the Tambo benchmark. Freeze-killed brood assays run fortnightly through the build-up.',
  },
  {
    id: 'ap-oradale', name: 'Oradale', code: 'ORA',
    region: 'Darling Downs, QLD', coords: '27.9012° S, 151.6144° E',
    stage: 'initialising', manager: 'm4', established: 2026, hives: 96, seed: 1907,
    flora: 'Spotted gum, brigalow, cultivated sunflower',
    brief: 'Site commissioned March 2026. Nucs drawn from Tambo and Kellyanne stock; baseline mite counts still in progress.',
  },
];

export const stageLabels = {
  initialising: 'Initialising',
  assessment:   'Assessment',
  maintenance:  'Maintenance',
};

const statusPool = {
  maintenance:  ['thriving', 'thriving', 'thriving', 'thriving', 'watch', 'thriving', 'thriving', 'dormant', 'watch', 'thriving'],
  assessment:   ['thriving', 'thriving', 'watch', 'treatment', 'thriving', 'watch', 'thriving', 'treatment', 'critical', 'thriving'],
  initialising: ['thriving', 'watch', 'watch', 'treatment', 'thriving', 'dormant', 'watch', 'thriving', 'treatment', 'watch'],
};

export const statusLabels = {
  thriving:  'Thriving',
  watch:     'Under watch',
  treatment: 'In treatment',
  critical:  'Critical',
  dormant:   'Dormant / requeening',
};

export const statusNote = {
  thriving:  'Meeting all assessment thresholds.',
  watch:     'One metric outside threshold. Re-check at next inspection.',
  treatment: 'Under miticide treatment. Excluded from selection data this cycle.',
  critical:  'Mite load above intervention threshold. Manager notified.',
  dormant:   'Queenless or requeening. No data collected this cycle.',
};

const queenColours = ['white', 'yellow', 'red', 'green', 'blue'];
const tempers = ['Calm', 'Calm', 'Steady', 'Steady', 'Runny', 'Defensive'];

/* Each hive carries the five data points the assessment protocol requires:
   VSH score, mite load, brood frames, temperament, and last inspection. */
function buildHives(ap) {
  const rng = seeded(ap.seed);
  const pool = statusPool[ap.stage];
  const lines = ap.stage === 'initialising'
    ? ['TMB-22', 'KLN-03', 'ORA-08']
    : ap.stage === 'assessment'
      ? ['BRW-14', 'TMB-22', 'KLN-03', 'MRN-05', 'ORA-08']
      : ['TMB-22', 'CVE-17', 'BRW-14', 'WDG-11'];

  return Array.from({ length: ap.hives }, (_, i) => {
    const status = pool[Math.floor(rng() * pool.length)];
    const line = pick(rng, lines);
    const treatmentFree = status !== 'treatment' && ap.stage !== 'initialising'
      ? intBetween(rng, 1, 5)
      : status === 'treatment' ? 0 : intBetween(rng, 0, 1);

    const baseVsh = lineByCode(line).vshMean;
    const vsh = status === 'dormant' ? null
      : Math.max(28, Math.min(97, Math.round(baseVsh + between(rng, -14, 12))));

    return {
      id: `${ap.code}-${String(i + 1).padStart(3, '0')}`,
      apiary: ap.id,
      status,
      line,
      queenColour: queenColours[(ap.established + Math.floor(rng() * 2)) % 5],
      queenYear: 2026 - intBetween(rng, 0, 2),
      vsh,
      miteLoad: status === 'dormant' ? null : Number(between(rng, 0.1, status === 'critical' ? 8.4 : 3.6).toFixed(1)),
      broodFrames: status === 'dormant' ? 0 : intBetween(rng, 3, 11),
      temper: pick(rng, tempers),
      lastSeen: intBetween(rng, 1, 34),
      treatmentFree,
    };
  });
}

export const apiaries = apiarySeeds.map((ap) => ({ ...ap, hiveRecords: buildHives(ap) }));
export const apiaryById = (id) => apiaries.find((a) => a.id === id);

export function tally(hives) {
  return hives.reduce((acc, h) => { acc[h.status] = (acc[h.status] || 0) + 1; return acc; }, {});
}

export function vshAverage(hives) {
  const scored = hives.filter((h) => h.vsh != null);
  if (!scored.length) return 0;
  return Math.round(scored.reduce((s, h) => s + h.vsh, 0) / scored.length);
}

/* --------------------------------------------------------------------------
   Inspections. Dates are relative to today so the dashboard never goes stale.
   -------------------------------------------------------------------------- */

const inspectionKinds = [
  'Freeze-killed brood assay',
  'Alcohol wash — mite count',
  'Brood pattern assessment',
  'Recapping count',
  'Queen mating check',
  'Nuc build assessment',
  'Full frame audit',
  'Drone congregation survey',
];

function shiftDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d;
}

const inspectionPlan = [
  { apiary: 'ap-barrow',  offset: -6, kind: 'Freeze-killed brood assay',  by: 'm3', hives: 24, done: true,  note: 'Recapping above 60% in 19 of 24. BRW-14 leading.' },
  { apiary: 'ap-tambo',   offset: -4, kind: 'Alcohol wash — mite count',  by: 'm5', hives: 30, done: true,  note: 'Site mean 1.4 mites/100 bees. No intervention required.' },
  { apiary: 'ap-oradale', offset: -3, kind: 'Nuc build assessment',       by: 'm4', hives: 40, done: true,  note: '6 nucs failed to build. Requeening scheduled.' },
  { apiary: 'ap-barrow',  offset: -1, kind: 'Brood pattern assessment',   by: 'm9', hives: 18, done: true,  note: 'Two hives with spotty pattern flagged for follow-up.' },
  { apiary: 'ap-tambo',   offset: 2,  kind: 'Recapping count',            by: 'm5', hives: 32, done: false, note: 'Ninth-generation cohort. Full cohort measure.' },
  { apiary: 'ap-oradale', offset: 3,  kind: 'Alcohol wash — mite count',  by: 'm4', hives: 48, done: false, note: 'Baseline established for the new site.' },
  { apiary: 'ap-barrow',  offset: 6,  kind: 'Queen mating check',         by: 'm3', hives: 12, done: false, note: 'Second round of II queens from Coalvale semen.' },
  { apiary: 'ap-tambo',   offset: 9,  kind: 'Full frame audit',           by: 'm5', hives: 104, done: false, note: 'Pre-season audit across the whole site.' },
  { apiary: 'ap-oradale', offset: 13, kind: 'Brood pattern assessment',   by: 'm10', hives: 26, done: false, note: 'First assessment on Oradale-mated queens.' },
];

export const inspections = inspectionPlan.map((p, i) => ({
  id: `insp-${i}`,
  ...p,
  date: shiftDays(p.offset),
}));

export const recentInspections   = inspections.filter((i) => i.done).sort((a, b) => b.date - a.date);
export const upcomingInspections = inspections.filter((i) => !i.done).sort((a, b) => a.date - b.date);

/* --------------------------------------------------------------------------
   Forum. Member-created topics with subscribe + notify.
   -------------------------------------------------------------------------- */

export const forumCategories = [
  { id: 'fc-field',  name: 'Field practice' },
  { id: 'fc-assess', name: 'Assessment & assays' },
  { id: 'fc-genet',  name: 'Genetics & lines' },
  { id: 'fc-gear',   name: 'Equipment' },
  { id: 'fc-admin',  name: 'Association' },
];

export const threads = [
  {
    id: 't1', category: 'fc-assess', pinned: true,
    title: 'Standardising the freeze-killed brood protocol across member apiaries',
    author: 'm9', created: -18, replies: 34, watchers: 41, subscribed: true,
    excerpt: 'We are getting a 15-point spread on the same cohort depending on who runs the assay. Proposing we lock down liquid nitrogen exposure time, the recapping count window, and how partial removals are scored.',
    posts: [
      { by: 'm9', at: -18, body: 'Three of us ran a freeze-killed brood assay on the same Tambo cohort within four days of each other and returned 71%, 84%, and 86% removal. That spread is larger than the difference between our best and worst lines, which makes it worthless for selection.\n\nI want to propose we fix three things: exposure time under liquid nitrogen, the window between freezing and the removal count, and whether a partially uncapped cell counts as removed.' },
      { by: 'm5', at: -17, body: 'Agree on all three. At Tambo I use a 10-second pour into a 55mm section and count at 24 hours. Anything uncapped but with pupa still present I score as partial, and I have been counting partials as removed. That alone would explain a chunk of the spread.' },
      { by: 'm2', at: -16, body: 'I count partials separately and report both numbers. It is more work but the two figures tell you different things — full removal is hygiene completed, partial is hygiene initiated. Collapsing them loses the distinction.' },
      { by: 'm6', at: -14, body: 'Worth noting the European protocols mostly specify a 24-hour count. If we standardise on anything other than 24 we lose comparability with published work, which would be a shame given how much of our selection rationale cites it.' },
      { by: 'm9', at: -3, body: 'Draft protocol is up in Queen Breeding → Assessment methods. Ten-second pour, 55mm section, count at 24 hours, partials recorded separately and excluded from the headline figure. Comments welcome before we take it to the committee.' },
    ],
  },
  {
    id: 't2', category: 'fc-genet',
    title: 'How narrow is too narrow? Coalvale is on its eighth generation of closed population',
    author: 'm6', created: -11, replies: 22, watchers: 28, subscribed: true,
    excerpt: 'The VSH numbers keep improving but I am watching brood viability slide and I want a second opinion before I bring outside drones in and undo eight years of work.',
    posts: [
      { by: 'm6', at: -11, body: 'CVE-17 is at generation eight, maintained by instrumental insemination from within the population. VSH expression is the best it has been — 85% mean across the cohort. But brood viability has dropped from about 94% to 87% over three generations and I do not think that is a coincidence.\n\nMy instinct is inbreeding depression. My reluctance is that any outcross dilutes the trait I have spent eight years concentrating.' },
      { by: 'm2', at: -10, body: 'Eighty-seven percent viability is the number I would act on, not the VSH. You can recover trait concentration in three or four generations with good selection. Recovering a population that has crashed is a different problem entirely.' },
      { by: 'm7', at: -9, body: 'Wandagee stock might be a useful outcross for you — unrelated to anything in the eastern program, and VSH is respectable at 71%. Happy to send semen rather than queens if you want to keep control of the maternal side.' },
      { by: 'm6', at: -8, body: 'That is a generous offer and probably the right shape for it. Let me get one more round of viability counts in so I have a proper baseline to measure the outcross against.' },
    ],
  },
  {
    id: 't3', category: 'fc-field',
    title: 'Anyone else seeing late-season supersedure in treatment-free colonies?',
    author: 'm3', created: -7, replies: 17, watchers: 19, subscribed: false,
    excerpt: 'Four colonies at Barrowfield have superseded in the past fortnight, all of them treatment-free for three or more seasons, all with acceptable mite loads.',
    posts: [
      { by: 'm3', at: -7, body: 'Four supersedures in a fortnight, all in colonies that have been treatment-free three seasons or longer. Mite loads were fine, brood pattern was fine, and in every case the colony raised cells without any obvious trigger.\n\nI am wondering whether sustained low-level mite pressure shortens queen productive life in a way that does not show up in the metrics we collect.' },
      { by: 'm5', at: -6, body: 'I see it at Tambo too and I have come to treat it as normal rather than a problem. My working theory is that colonies expressing strong hygienic behaviour are also quicker to replace a queen who is even slightly below par. That is arguably a feature.' },
      { by: 'm10', at: -5, body: 'Are you recording supersedure as an event? If it is not in the data model we cannot test either theory. I would like a field for it before next season so we can look at it properly.' },
      { by: 'm1', at: -4, body: 'Reasonable request and easy to add. I will get a supersedure event onto the inspection form for the coming season so it is captured at the point of observation rather than reconstructed later.' },
    ],
  },
  {
    id: 't4', category: 'fc-gear',
    title: 'Mini-nuc mating boxes: polystyrene versus timber in a Queensland summer',
    author: 'm4', created: -5, replies: 11, watchers: 14, subscribed: false,
    excerpt: 'Losing too many mated queens to heat in poly boxes on the Downs. Considering a switch back to timber despite the extra weight and cost.',
    posts: [
      { by: 'm4', at: -5, body: 'Running about 120 poly mini-nucs at Oradale and losing more mated queens than I can accept once ambient goes past 38°C. The boxes hold heat beautifully in spring, which is exactly the problem in January.' },
      { by: 'm7', at: -4, body: 'Same experience in the Gascoyne. I shade-cloth the whole mating yard at 50% and it made more difference than changing box material ever did. Cheaper than replacing your fleet, too.' },
      { by: 'm5', at: -3, body: 'Timber breathes but it will not save you above 38 either. Shade and orientation do the heavy lifting. Point the entrances east and get them out of the afternoon sun.' },
    ],
  },
  {
    id: 't5', category: 'fc-admin',
    title: 'Proposal: publish the annual line performance table to non-members',
    author: 'm1', created: -3, replies: 9, watchers: 23, subscribed: true,
    excerpt: 'The committee is weighing whether the aggregate line table should sit outside the member wall. Arguments both ways, and members should decide.',
    posts: [
      { by: 'm1', at: -3, body: 'The committee has been asked whether the annual line performance table should be published publicly rather than kept behind the member wall.\n\nThe case for: it demonstrates the program works, which helps with funding and with recruiting breeders. The case against: it is the main tangible benefit of membership, and aggregate numbers get quoted out of context in stock advertising.\n\nI would rather members decided this than the committee.' },
      { by: 'm2', at: -2, body: 'Publish the aggregate, withhold the per-hive data. The headline numbers are already circulating in conversation and at field days. What has actual value to a member is the underlying detail, and that is what should stay in.' },
      { by: 'm8', at: -2, body: 'Speaking as a first-year member, the public table is a large part of why I joined. It was the only evidence I could find that any Australian program was measuring this properly.' },
      { by: 'm7', at: -1, body: 'Agreed on aggregate-only, with one condition: a stated citation format. If people are going to quote it in their stock advertising, I would rather they quote it correctly.' },
    ],
  },
  {
    id: 't6', category: 'fc-assess',
    title: 'Alcohol wash sample size — is 300 bees actually enough?',
    author: 'm8', created: -2, replies: 6, watchers: 11, subscribed: false,
    excerpt: 'Running the numbers on sampling error at low mite loads and I am not convinced our standard sample tells us what we think it does.',
    posts: [
      { by: 'm8', at: -2, body: 'At a true load of 1 mite per 100 bees, a 300-bee sample expects three mites. The confidence interval around that is wide enough that a reading of one and a reading of six are both consistent with the same colony.\n\nGiven we make selection decisions on these numbers, is 300 defensible?' },
      { by: 'm9', at: -1, body: 'It is not, at low loads. It is fine for deciding whether to treat, which is what the sample size was designed for, and poor for ranking colonies against each other, which is what we are using it for. Those are different jobs.' },
      { by: 'm5', at: -1, body: 'This is a good catch and it is why I weight the brood assay more heavily than the wash when I am selecting. The wash tells me whether a colony is in trouble. The assay tells me whether it is worth breeding from.' },
    ],
  },
];

export const threadById = (id) => threads.find((t) => t.id === id);
export const categoryName = (id) => (forumCategories.find((c) => c.id === id) || {}).name || '';

/* --------------------------------------------------------------------------
   Repository. Three tracks — a genuine progression, so ordinals carry meaning.
   -------------------------------------------------------------------------- */

export const repository = [
  {
    id: 'rp-foundation', ord: 'I', name: 'Foundation',
    blurb: 'Queen rearing from first principles, plus the hygiene and nutrition groundwork that determines whether anything else you do will work.',
    subs: [
      { id: 'rs-graft',   name: 'Grafting and cell raising',        items: 14, updated: -2,  subscribed: true,  by: 'm5',
        summary: 'Larval age selection, cell bar setup, and why a starter colony fails.' },
      { id: 'rs-nutri',   name: 'Colony nutrition for queen rearing', items: 9, updated: -6, subscribed: true,  by: 'm2',
        summary: 'Pollen reserves, protein supplements, and the timing that matters.' },
      { id: 'rs-hygiene', name: 'Apiary hygiene and disease basics', items: 11, updated: -9, subscribed: false, by: 'm3',
        summary: 'Equipment sterilisation, AFB awareness, and moving frames safely between colonies.' },
      { id: 'rs-mating',  name: 'Mating nucs and queen introduction', items: 12, updated: -14, subscribed: false, by: 'm4',
        summary: 'Nuc configuration, introduction methods, and acceptance rates.' },
      { id: 'rs-record',  name: 'Record keeping for beginners',      items: 6,  updated: -21, subscribed: false, by: 'm8',
        summary: 'The minimum you must write down for your data to be worth anything later.' },
    ],
  },
  {
    id: 'rp-production', ord: 'II', name: 'Queen Production',
    blurb: 'Scaling from a dozen cells on the kitchen bench to a commercial operation, and the systems that stop quality collapsing as volume rises.',
    subs: [
      { id: 'rs-scale',   name: 'Scaling cell production',           items: 16, updated: -1,  subscribed: true,  by: 'm7',
        summary: 'Cell builder rotation, batch scheduling, and realistic weekly throughput.' },
      { id: 'rs-yard',    name: 'Mating yard design and management', items: 13, updated: -4,  subscribed: false, by: 'm4',
        summary: 'Drone saturation, yard spacing, orientation, and heat management.' },
      { id: 'rs-banking', name: 'Queen banking and shipping',        items: 10, updated: -8,  subscribed: false, by: 'm10',
        summary: 'Bank colony maintenance, cage types, and interstate freight requirements.' },
      { id: 'rs-labour',  name: 'Labour, timing and season planning', items: 8, updated: -16, subscribed: false, by: 'm5',
        summary: 'Building a production calendar backwards from your customers\' delivery dates.' },
      { id: 'rs-qa',      name: 'Quality control at volume',         items: 7,  updated: -23, subscribed: false, by: 'm2',
        summary: 'Sampling regimes, cull criteria, and what to do when a batch is off.' },
    ],
  },
  {
    id: 'rp-breeding', ord: 'III', name: 'Queen Breeding',
    blurb: 'Establishing and maintaining a breeding program: queen lines, assessment and selection, and bringing outside traits in without losing what you have.',
    subs: [
      { id: 'rs-assess',  name: 'Assessment methods',               items: 21, updated: 0,   subscribed: true,  by: 'm9',
        summary: 'Freeze-killed brood, recapping counts, alcohol wash, and what each measure is actually good for.' },
      { id: 'rs-select',  name: 'Selection and breeding value',     items: 18, updated: -2,  subscribed: true,  by: 'm2',
        summary: 'Ranking colonies, weighting traits, and avoiding selection on noise.' },
      { id: 'rs-lines',   name: 'Establishing and maintaining lines', items: 15, updated: -5, subscribed: true,  by: 'm5',
        summary: 'Founding a line, generation records, and monitoring for inbreeding depression.' },
      { id: 'rs-integ',   name: 'Integrating outside stock',        items: 12, updated: -7,  subscribed: false, by: 'm6',
        summary: 'Outcrossing strategy, backcross recovery, and keeping trait gains through the introduction.' },
      { id: 'rs-ii',      name: 'Instrumental insemination',        items: 14, updated: -12, subscribed: false, by: 'm6',
        summary: 'Equipment, technique, semen storage, and when II earns its considerable cost.' },
      { id: 'rs-vsh',     name: 'VSH: the trait and its measurement', items: 19, updated: -3, subscribed: true, by: 'm9',
        summary: 'What varroa sensitive hygiene is, how it is inherited, and how to measure it defensibly.' },
    ],
  },
];

export const allSubs = repository.flatMap((t) => t.subs.map((s) => ({ ...s, track: t.name, trackId: t.id })));
export const subById = (id) => allSubs.find((s) => s.id === id);

/* A representative article, shown when a sub-topic is opened. */
export const sampleArticle = {
  title: 'Scoring partial removals in the freeze-killed brood assay',
  by: 'm9', at: 0, track: 'Queen Breeding', sub: 'Assessment methods',
  body: [
    'A freeze-killed brood assay asks a simple question: given a patch of dead sealed brood, how much of it will the colony remove? The answer is a proxy for the hygienic behaviour that underlies varroa sensitive hygiene, and the appeal of the method is that it needs nothing more exotic than liquid nitrogen and patience.',
    'The complication is that removal is not binary. At the 24-hour count you will find cells fully cleaned, cells untouched, and a third category that causes most of the disagreement between operators: cells that have been uncapped, sometimes chewed at the margin, with the dead pupa still in place.',
    'h3:Why partials are not simply half a removal',
    'It is tempting to score a partial as 0.5 and move on. Resist it. Uncapping and removal are separable behaviours with different thresholds, and a colony that uncaps readily but does not complete removal is telling you something specific — usually that detection is working and the follow-through is not.',
    'For varroa work the distinction matters more than it does for general hygiene screening, because mite reproduction is disrupted by uncapping alone. A colony that uncaps and recaps without removing the pupa may still suppress mite reproduction effectively. Collapsing that behaviour into a single removal percentage hides it.',
    'h3:The recommended scoring',
    'Record three numbers for each assay: cells fully removed, cells uncapped but not removed, and cells untouched. Report the headline figure as full removals over total cells, and carry the partial count alongside it rather than folded into it.',
    'quote:If your protocol produces a single number, you have already thrown away the most interesting part of the result.',
    'This costs nothing at the point of counting and preserves information you cannot reconstruct later. Members running the assay for program submission should use the three-column form in the resources list below.',
    'h3:Sources of variation to control',
    'Beyond scoring, three procedural choices account for most of the between-operator spread:',
    'list:Exposure time under liquid nitrogen — standardise at ten seconds for a 55mm section|The interval between freezing and counting — 24 hours, not "the next day"|Whether the frame is returned to its original position and orientation',
    'Operators who lock these three down and record partials separately report between-operator agreement inside five percentage points, which is tight enough to select on.',
  ],
};

/* --------------------------------------------------------------------------
   Marketplace.
   -------------------------------------------------------------------------- */

export const listings = [
  { id: 'l1', kind: 'Queens', title: 'Tambo 22 mated queens — ninth generation', price: 78, unit: 'each',
    seller: 'm5', state: 'TAS', posted: -1, qty: '40 available, December dispatch',
    detail: 'Open-mated within the Tambo closed population. VSH mean 88% across the parent cohort. Marked and clipped on request.' },
  { id: 'l2', kind: 'Queens', title: 'Barrowfield 14 breeder queens', price: 240, unit: 'each',
    seller: 'm2', state: 'VIC', posted: -2, qty: '6 available',
    detail: 'Instrumentally inseminated, single-drone. Full pedigree and three seasons of assessment data supplied with each queen.' },
  { id: 'l3', kind: 'Queens', title: 'Kellyanne 3 mated queens', price: 65, unit: 'each',
    seller: 'm7', state: 'WA', posted: -4, qty: '120 available, staged weekly',
    detail: 'Calm, broad brood pattern, VSH mean 76%. WA dispatch only — no interstate movement permits held.' },
  { id: 'l4', kind: 'Semen', title: 'Coalvale 17 semen — collected to order', price: 190, unit: 'per dose',
    seller: 'm6', state: 'SA', posted: -5, qty: 'By arrangement',
    detail: 'Eighth-generation closed population, VSH mean 85%. Collected fresh and shipped chilled, or held in liquid nitrogen for scheduled collection.' },
  { id: 'l5', kind: 'Equipment', title: 'Cell bar frames — cedar, 20-cup', price: 34, unit: 'each',
    seller: 'm3', state: 'NSW', posted: -6, qty: '50 in stock',
    detail: 'Western red cedar, three removable bars, sized for Langstroth deep. Cups not included.' },
  { id: 'l6', kind: 'Equipment', title: 'Poly mini-nuc mating boxes — used, good order', price: 18, unit: 'each',
    seller: 'm4', state: 'QLD', posted: -8, qty: '80 available',
    detail: 'Two seasons use. Selling to move to timber for summer heat. Feeders included, frames not.' },
  { id: 'l7', kind: 'Nucs', title: 'Four-frame nucs — Merrindale 5 queens', price: 210, unit: 'each',
    seller: 'm10', state: 'QLD', posted: -9, qty: '25 available from January',
    detail: 'Four frames of brood and stores on a current-season Merrindale queen. Low swarming across three seasons.' },
  { id: 'l8', kind: 'Equipment', title: 'Instrumental insemination station — Schley 2.0', price: 3400, unit: 'complete',
    seller: 'm6', state: 'SA', posted: -12, qty: '1 only',
    detail: 'Full station with CO₂ regulator, stereo microscope, syringes and spare capillaries. Upgrading, not exiting.' },
  { id: 'l9', kind: 'Queens', title: 'Wandagee 11 mated queens — drought hardy', price: 70, unit: 'each',
    seller: 'm7', state: 'WA', posted: -14, qty: '60 available',
    detail: 'Gascoyne-derived stock selected for low water and forage availability. VSH mean 71%.' },
];

export const listingKinds = ['All', 'Queens', 'Nucs', 'Semen', 'Equipment'];

/* --------------------------------------------------------------------------
   Notifications — what the subscription machinery would have delivered.
   -------------------------------------------------------------------------- */

export const notifications = [
  { id: 'n1', kind: 'reply',  at: -0.2, unread: true,  source: 'Standardising the freeze-killed brood protocol', by: 'm9',
    text: 'Kenji Watanabe posted a draft protocol for comment.', to: '#/forum/t1' },
  { id: 'n2', kind: 'repo',   at: -0.4, unread: true,  source: 'Queen Breeding → Assessment methods', by: 'm9',
    text: 'New article: Scoring partial removals in the freeze-killed brood assay.', to: '#/repository/rs-assess' },
  { id: 'n3', kind: 'insp',   at: -1,   unread: true,  source: 'Barrowfield', by: 'm9',
    text: 'Brood pattern assessment completed on 18 hives. Two flagged for follow-up.', to: '#/apiaries/ap-barrow' },
  { id: 'n4', kind: 'thread', at: -3,   unread: false, source: 'Association', by: 'm1',
    text: 'New topic: Proposal to publish the annual line performance table.', to: '#/forum/t5' },
  { id: 'n5', kind: 'repo',   at: -5,   unread: false, source: 'Queen Breeding → Establishing and maintaining lines', by: 'm5',
    text: 'Trevor Bowe added generation records for TMB-22 through generation nine.', to: '#/repository/rs-lines' },
  { id: 'n6', kind: 'market', at: -6,   unread: false, source: 'Marketplace', by: 'm5',
    text: 'Tambo 22 mated queens listed — 40 available for December dispatch.', to: '#/marketplace' },
];

/* --------------------------------------------------------------------------
   Helpers shared across views
   -------------------------------------------------------------------------- */

export function relDays(offset) {
  const n = Math.abs(Math.round(offset));
  if (offset >= 0 && n === 0) return 'today';
  if (offset < 0) {
    if (n === 0) return 'today';
    if (n === 1) return 'yesterday';
    if (n < 7) return `${n} days ago`;
    if (n < 14) return 'last week';
    if (n < 60) return `${Math.round(n / 7)} weeks ago`;
    return `${Math.round(n / 30)} months ago`;
  }
  if (n === 1) return 'tomorrow';
  if (n < 7) return `in ${n} days`;
  return `in ${Math.round(n / 7)} weeks`;
}

export function relHours(offset) {
  const h = Math.abs(offset * 24);
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min ago`;
  if (h < 24) return `${Math.round(h)} h ago`;
  return relDays(offset);
}

export const fmtDate = (d) =>
  d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

export const fmtDateLong = (d) =>
  d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'long' });
