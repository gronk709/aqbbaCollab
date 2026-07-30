/* ==========================================================================
   Marketplace. Members advertise queens, nucs, semen and equipment.
   ========================================================================== */

import { listings, listingKinds, memberById, relDays, currentUser } from '../data.js';
import { addListing, state } from '../store.js';
import { esc, icons, avatar, modal, closeModal, toast } from '../ui.js';

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
  return `<svg viewBox="0 0 250 100" preserveAspectRatio="xMidYMid slice">${cells}</svg>`;
}

function listingCard(l, i) {
  const seller = memberById(l.seller);
  return `
    <article class="listing">
      <div class="listing-art">
        <span class="listing-kind">${esc(l.kind)}</span>
        ${listingArt(l.kind, i + 3)}
      </div>
      <div class="listing-body">
        <h3>${esc(l.title)}</h3>
        <div class="listing-price">$${l.price.toLocaleString('en-AU')} <small>${esc(l.unit)}</small></div>
        <p class="caption" style="line-height:1.5">${esc(l.detail)}</p>
        <p class="caption mono" style="font-size:11px">${esc(l.qty)}</p>
        <div class="listing-foot">
          ${avatar(seller)}
          <div style="min-width:0">
            <div style="font-size:12.5px;color:var(--propolis);font-weight:600">${esc(seller.name)}</div>
            <div style="font-size:11px">${l.state} · listed ${relDays(l.posted)}</div>
          </div>
          <span class="spacer"></span>
          <button class="btn btn-ghost btn-sm" data-enquire="${l.id}">Enquire</button>
        </div>
      </div>
    </article>`;
}

export function renderMarketplace() {
  const all = [...state.newListings, ...listings];
  const shown = activeKind === 'All' ? all : all.filter((l) => l.kind === activeKind);

  const html = `
    <div class="topbar">
      <div style="width:100%">
        <div class="eyebrow">Member to member · queens, stock and equipment</div>
        <h1>Marketplace</h1>
      </div>
      <div class="topbar-actions">
        <button class="btn btn-primary btn-sm" id="new-listing">${icons.plus} List an item</button>
      </div>
    </div>

    <div class="wrap view">
      <p class="lede" style="max-width:62ch;margin-bottom:var(--s5)">
        Listings are visible to members only. AQBBA does not broker sales or hold funds —
        arrange payment and freight directly with the seller.
      </p>

      <div class="filters">
        ${listingKinds.map((k) => `
          <button class="chip ${k === activeKind ? 'is-on' : ''}" data-kind="${k}">
            ${k}${k !== 'All' ? ` <span class="mono" style="opacity:.6">${all.filter((l) => l.kind === k).length}</span>` : ''}
          </button>`).join('')}
      </div>

      ${shown.length === 0 ? `
        <div class="panel">
          <div class="empty">
            <h3>No ${activeKind.toLowerCase()} listed right now</h3>
            <p>Members list stock as it becomes available. If you have ${activeKind.toLowerCase()} to sell, add a listing.</p>
            <button class="btn btn-primary" id="empty-list">List an item</button>
          </div>
        </div>` : `
        <div class="grid grid-3">${shown.map(listingCard).join('')}</div>`}

      <div class="panel" style="margin-top:var(--s6)">
        <div class="panel-head"><h2>Movement and permits</h2></div>
        <div class="panel-body">
          <p style="font-size:13.5px;color:var(--propolis-60);max-width:70ch">
            Interstate movement of bees and used equipment is regulated differently in each
            state, and Western Australia does not permit entry of bees from the eastern
            states. Confirm the current requirements with the destination state's
            department before you arrange freight.
          </p>
        </div>
      </div>
    </div>`;

  setTimeout(bindMarket, 0);
  return html;
}

function bindMarket() {
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
      const all = [...state.newListings, ...listings];
      const l = all.find((x) => x.id === btn.dataset.enquire);
      const seller = memberById(l.seller);
      openEnquiry(l, seller);
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
      <div class="row" style="gap:var(--s3);align-items:flex-start">
        <div class="field" style="flex:1">
          <label for="l-price">Price (AUD)</label>
          <input id="l-price" type="number" min="0" required placeholder="78">
        </div>
        <div class="field" style="flex:1">
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

  scrim.querySelector('#pub-listing').addEventListener('click', () => {
    const title = scrim.querySelector('#l-title').value.trim();
    const price = Number(scrim.querySelector('#l-price').value);
    if (!title || !price) { toast('Add a title and a price before publishing.'); return; }

    addListing({
      kind: scrim.querySelector('#l-kind').value,
      title, price,
      unit: scrim.querySelector('#l-unit').value.trim() || 'each',
      qty: scrim.querySelector('#l-qty').value.trim() || 'Enquire for availability',
      detail: scrim.querySelector('#l-detail').value.trim() || 'Contact the seller for detail.',
      state: currentUser.state,
    });

    closeModal();
    activeKind = 'All';
    toast('Listing published. It is now visible to all members.');
    window.__aqbba_render();
  });
}

function openEnquiry(l, seller) {
  const body = `
    <p style="font-size:13.5px;margin-bottom:var(--s5)">
      Your enquiry goes to <strong>${esc(seller.name)}</strong> with your name and the email
      on your Wild Apricot record.
    </p>
    <div class="panel" style="background:var(--comb);margin-bottom:var(--s5)">
      <div class="panel-body" style="padding:var(--s4)">
        <div style="font-size:13.5px;font-weight:600">${esc(l.title)}</div>
        <div class="mono" style="font-size:13px;margin-top:2px">$${l.price.toLocaleString('en-AU')} ${esc(l.unit)}</div>
        <div class="caption" style="margin-top:4px">${esc(l.qty)}</div>
      </div>
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
