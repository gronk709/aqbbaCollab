/* ==========================================================================
   Marketplace. Members advertise queens, nucs, semen and equipment.
   ========================================================================== */

import { listingKinds, relDays } from '../data.js';
import { addListing, loadListings } from '../store.js';
import { esc, icons, avatar, modal, closeModal, toast } from '../ui.js';
import { button, pageHeader, pageBody, card, emptyState, filterPill } from '../components.js';

let activeKind = 'All';

/* Each listing gets a small drawn mark rather than a stock photo: a comb
   fragment whose density varies with the listing kind. */
function listingArt(kind, seed) {
  const tone = { Queens: 'var(--amber)', Nucs: 'var(--mark-green)', Semen: 'var(--mark-blue)', Equipment: 'var(--propolis-40)' }[kind] || 'var(--amber)';
  let cells = '';
  const cols = 8, rows = 4, w = 30, h = 34;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * w + (r % 2 ? w / 2 : 0);
      const y = r * h * 0.75;
      /* A sparse, deterministic scatter of filled cells per listing. */
      const on = ((r * cols + c + seed) * 7919) % 7 < 2;
      const pts = [
        [x + w / 2, y], [x + w, y + h * 0.25], [x + w, y + h * 0.75],
        [x + w / 2, y + h], [x, y + h * 0.75], [x, y + h * 0.25],
      ].map((p) => p.map((v) => v.toFixed(1)).join(' ')).join(', ');
      cells += `<polygon points="${pts}" fill="${on ? tone : 'none'}" fill-opacity="${on ? 0.22 : 0}"
                 stroke="${tone}" stroke-width="0.6" stroke-opacity="0.28"/>`;
    }
  }
  return `<svg class="tw:absolute tw:inset-0 tw:size-full" viewBox="0 0 250 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${cells}</svg>`;
}

/* created_at comes back from Postgres as an ISO timestamp, not the
   day-offset-from-today number relDays expects (a holdover from the old
   seed data's shape) — converted here rather than changing relDays, which
   other still-unmigrated views still call with real offsets. */
function daysAgo(isoTimestamp) {
  const then = new Date(isoTimestamp);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  then.setHours(0, 0, 0, 0);
  return Math.round((then - today) / 86400000);
}

function listingCard(l, i) {
  const seller = l.seller;
  return `
    <article class="tw:flex tw:flex-col tw:overflow-hidden tw:rounded-2xl tw:border-2 tw:border-comb-shade/80 tw:bg-white tw:transition tw:duration-300 tw:hover:-translate-y-1 tw:hover:border-amber/60 tw:hover:shadow-xl tw:hover:shadow-propolis/10">
      <div class="tw:relative tw:h-32 tw:overflow-hidden tw:bg-amber-wash">
        <span class="tw:absolute tw:top-3 tw:left-3 tw:z-10 tw:rounded-full tw:bg-propolis/85 tw:px-2.5 tw:py-1 tw:font-mono tw:text-[10px] tw:uppercase tw:tracking-[0.1em] tw:text-comb">${esc(l.kind)}</span>
        ${listingArt(l.kind, i + 3)}
      </div>
      <div class="tw:flex tw:flex-1 tw:flex-col tw:gap-2 tw:p-5">
        <h3 class="tw:font-display tw:text-xl tw:font-medium tw:leading-snug tw:text-propolis">${esc(l.title)}</h3>
        <div class="tw:font-mono tw:text-lg tw:text-propolis">$${Number(l.price).toLocaleString('en-AU')} <small class="tw:text-[11px] tw:text-propolis-40">${esc(l.unit)}</small></div>
        <p class="tw:text-sm tw:leading-relaxed tw:text-propolis-60">${esc(l.detail)}</p>
        <p class="tw:font-mono tw:text-xs tw:text-propolis-40">${esc(l.qty)}</p>
        <div class="tw:mt-auto tw:flex tw:items-center tw:gap-3 tw:border-t tw:border-comb-shade/70 tw:pt-4">
          ${avatar(seller)}
          <div class="tw:min-w-0 tw:flex-1">
            <div class="tw:truncate tw:text-[13px] tw:font-semibold tw:text-propolis">${esc(seller.name)}</div>
            <div class="tw:text-xs tw:text-propolis-40">${esc(l.state || '')} · listed ${relDays(daysAgo(l.created_at))}</div>
          </div>
          ${button({ label: 'Enquire', variant: 'outline', size: 'sm', attrs: `data-enquire="${l.id}"` })}
        </div>
      </div>
    </article>`;
}

export function renderMarketplace(listings) {
  const all = listings || [];
  const shown = activeKind === 'All' ? all : all.filter((l) => l.kind === activeKind);

  const html = `
    <div class="view">
      ${pageHeader({
        eyebrow: 'Member to member · queens, stock and equipment',
        title: 'Marketplace',
        actions: button({ id: 'new-listing', label: 'List an item', icon: icons.plus }),
        lede: `Listings are visible to members only. AQBBA does not broker sales or hold funds —
          arrange payment and freight directly with the seller.`,
        below: `<div class="tw:flex tw:flex-wrap tw:gap-2" role="group" aria-label="Filter listings by kind">
          ${listingKinds.map((k) => filterPill({
            label: k,
            count: k !== 'All' ? all.filter((l) => l.kind === k).length : null,
            on: k === activeKind,
            attrs: `data-kind="${k}"`,
          })).join('')}
        </div>`,
      })}
      ${pageBody(`
        <div class="tw:space-y-10">
          ${shown.length === 0
            ? emptyState({
              title: `No ${activeKind.toLowerCase()} listed right now`,
              text: `Members list stock as it becomes available. If you have ${activeKind.toLowerCase()} to sell, add a listing.`,
              action: button({ id: 'empty-list', label: 'List an item' }),
            })
            : `<div class="tw:grid tw:gap-8 tw:sm:grid-cols-2 tw:lg:grid-cols-3">${shown.map(listingCard).join('')}</div>`}

          ${card({
            title: 'Movement and permits',
            body: `
              <p class="tw:max-w-3xl tw:leading-relaxed tw:text-propolis-60">
                Interstate movement of bees and used equipment is regulated differently in each
                state, and Western Australia does not permit entry of bees from the eastern
                states. Confirm the current requirements with the destination state's
                department before you arrange freight.
              </p>`,
          })}
        </div>`)}
    </div>`;

  setTimeout(() => bindMarket(all), 0);
  return html;
}

function bindMarket(all) {
  document.querySelectorAll('[data-kind]').forEach((chip) => {
    chip.addEventListener('click', () => {
      activeKind = chip.dataset.kind;
      window.__aqbba_render();
    });
  });

  const open = () => openListingForm();
  const b1 = document.getElementById('new-listing');
  const b2 = document.getElementById('empty-list');
  if (b1) b1.addEventListener('click', open);
  if (b2) b2.addEventListener('click', open);

  document.querySelectorAll('[data-enquire]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const l = all.find((x) => x.id === btn.dataset.enquire);
      openEnquiry(l, l.seller);
    });
  });
}

function openListingForm() {
  const body = `
    <form id="listing-form">
      <div class="field">
        <label for="l-kind">Category</label>
        <select id="l-kind">
          ${listingKinds.filter((k) => k !== 'All').map((k) => `<option>${k}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="l-title">Title</label>
        <input id="l-title" required placeholder="e.g. Tambo 22 mated queens">
      </div>
      <div class="tw:flex tw:items-start tw:gap-3">
        <div class="field tw:min-w-0 tw:flex-1">
          <label for="l-price">Price (AUD)</label>
          <input id="l-price" type="number" min="0" required placeholder="78">
        </div>
        <div class="field tw:min-w-0 tw:flex-1">
          <label for="l-unit">Per</label>
          <input id="l-unit" placeholder="each" value="each">
        </div>
      </div>
      <div class="field">
        <label for="l-qty">Availability</label>
        <input id="l-qty" placeholder="40 available, December dispatch">
      </div>
      <div class="field">
        <label for="l-detail">Detail</label>
        <textarea id="l-detail" placeholder="Line, generation, assessment data, marking, dispatch arrangements."></textarea>
      </div>`;

  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-primary" id="pub-listing">Publish listing</button>`;

  const scrim = modal({ title: 'List an item', body: body + '</form>', actions });

  const publishBtn = scrim.querySelector('#pub-listing');
  publishBtn.addEventListener('click', async () => {
    const title = scrim.querySelector('#l-title').value.trim();
    const price = Number(scrim.querySelector('#l-price').value);
    if (!title || !price) { toast('Add a title and a price before publishing.'); return; }

    publishBtn.disabled = true;
    publishBtn.textContent = 'Publishing…';
    try {
      await addListing({
        kind: scrim.querySelector('#l-kind').value,
        title, price,
        unit: scrim.querySelector('#l-unit').value.trim() || 'each',
        qty: scrim.querySelector('#l-qty').value.trim() || 'Enquire for availability',
        detail: scrim.querySelector('#l-detail').value.trim() || 'Contact the seller for detail.',
      });
    } catch (err) {
      toast(`Couldn't publish the listing: ${err.message}`);
      publishBtn.disabled = false;
      publishBtn.textContent = 'Publish listing';
      return;
    }

    closeModal();
    activeKind = 'All';
    toast('Listing published. It is now visible to all members.');
    window.__aqbba_invalidateData();
    window.__aqbba_render();
  });
}

function openEnquiry(l, seller) {
  const body = `
    <p class="tw:mb-5 tw:text-sm tw:leading-relaxed tw:text-propolis-60">
      Your enquiry goes to <strong class="tw:font-semibold tw:text-propolis">${esc(seller.name)}</strong> with your name and the email
      on your Wild Apricot record.
    </p>
    <div class="tw:mb-5 tw:rounded-xl tw:border tw:border-comb-shade tw:bg-comb/60 tw:p-4">
      <div class="tw:text-sm tw:font-semibold tw:text-propolis">${esc(l.title)}</div>
      <div class="tw:mt-0.5 tw:font-mono tw:text-sm tw:text-propolis">$${l.price.toLocaleString('en-AU')} ${esc(l.unit)}</div>
      <div class="tw:mt-1 tw:text-[13px] tw:text-propolis-40">${esc(l.qty)}</div>
    </div>
    <div class="field">
      <label for="e-body">Message</label>
      <textarea id="e-body" placeholder="How many, and when do you need them?"></textarea>
    </div>`;

  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-primary" id="send-enq">Send enquiry</button>`;

  const scrim = modal({ title: 'Enquire about this listing', body, actions });

  scrim.querySelector('#send-enq').addEventListener('click', () => {
    const text = scrim.querySelector('#e-body').value.trim();
    if (!text) { toast('Add a message before sending.'); return; }
    closeModal();
    toast(`Enquiry sent to ${seller.name}. A copy is in your sent items.`);
  });
}
