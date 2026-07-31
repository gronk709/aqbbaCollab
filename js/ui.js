/* ==========================================================================
   Render helpers, icons, toasts, modals.
   ========================================================================== */

/* Escape anything that came from a member. */
export function esc(s = '') {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export const html = (strings, ...vals) =>
  strings.reduce((out, s, i) => out + s + (vals[i] == null ? '' : vals[i]), '');

export const initials = (name) =>
  name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/* --- icons: 16px stroke set --------------------------------------------- */

const svg = (paths, w = 16) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="${w}" height="${w}">${paths}</svg>`;

export const icons = {
  comb:     svg('<path d="M12 3l7 4v10l-7 4-7-4V7z"/><path d="M12 8l3.5 2v4L12 16l-3.5-2v-4z"/>'),
  apiary:   svg('<rect x="4" y="4" width="16" height="4" rx="1"/><rect x="4" y="10" width="16" height="4" rx="1"/><rect x="4" y="16" width="16" height="4" rx="1"/>'),
  forum:    svg('<path d="M20 14a2 2 0 01-2 2H8l-4 4V6a2 2 0 012-2h12a2 2 0 012 2z"/>'),
  book:     svg('<path d="M4 5a2 2 0 012-2h13v18H6a2 2 0 01-2-2z"/><path d="M9 3v18"/>'),
  tag:      svg('<path d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0l-7-7A2 2 0 013 12.2V5a2 2 0 012-2h7.2a2 2 0 011.4.6l7 7a2 2 0 010 2.8z"/><circle cx="8" cy="8" r="1.3"/>'),
  bell:     svg('<path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M13.7 20a2 2 0 01-3.4 0"/>'),
  bellOn:   `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="16" height="16"><path d="M12 2a6 6 0 00-6 6c0 6.5-3 7.6-3 7.6a1 1 0 00.7 1.7h16.6a1 1 0 00.7-1.7S18 14.5 18 8a6 6 0 00-6-6z"/><path d="M10.3 20a2 2 0 003.4 0z"/></svg>`,
  chart:    svg('<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>'),
  x:        svg('<path d="M18 6L6 18M6 6l12 12"/>'),
  plus:     svg('<path d="M12 5v14M5 12h14"/>'),
  chevron:  svg('<path d="M9 18l6-6-6-6"/>'),
  back:     svg('<path d="M15 18l-6-6 6-6"/>'),
  menu:     svg('<path d="M4 6h16M4 12h16M4 18h16"/>', 20),
  pin:      svg('<path d="M12 17v5"/><path d="M9 10.8V4h6v6.8l2 3.2H7z"/>'),
  clock:    svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  check:    svg('<path d="M20 6L9 17l-5-5"/>'),
  user:     svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>'),
  mail:     svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
  pen:      svg('<path d="M17 3l4 4L8 20H4v-4z"/>'),
  search:   svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  beaker:   svg('<path d="M9 3h6M10 3v6.2l-5.2 9A1.8 1.8 0 006.4 21h11.2a1.8 1.8 0 001.6-2.8l-5.2-9V3"/><path d="M7.5 15h9"/>'),
  flag:     svg('<path d="M5 3v18"/><path d="M5 4h11l-2.5 4L16 12H5"/>'),
};

/* The association mark: a hex with a queen cell inside it. */
export const brandMark = (w = 26) => `
<svg viewBox="0 0 44 50" width="${w}" height="${w * 50 / 44}" aria-hidden="true">
  <polygon points="22 1.5, 41.5 12.8, 41.5 37.2, 22 48.5, 2.5 37.2, 2.5 12.8"
           fill="none" stroke="var(--amber)" stroke-width="2.6"/>
  <path d="M22 14c4.4 0 7.4 3.2 7.4 7.6 0 5.6-3.4 9.2-7.4 13.4-4-4.2-7.4-7.8-7.4-13.4C14.6 17.2 17.6 14 22 14z"
        fill="var(--amber)" opacity="0.9"/>
</svg>`;

/* --- toasts -------------------------------------------------------------- */

let toastHost;

export function toast(message) {
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.className = 'toasts';
    toastHost.setAttribute('role', 'status');
    toastHost.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastHost);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="pip"></span><span>${esc(message)}</span>`;
  toastHost.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 0.3s, transform 0.3s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 320);
  }, 4200);
}

/* --- modal --------------------------------------------------------------- */

let openModal = null;

export function modal({ title, body, actions }) {
  closeModal();
  const scrim = document.createElement('div');
  scrim.className = 'modal-scrim';
  scrim.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head">
        <h2>${esc(title)}</h2>
        <button class="modal-x" data-close aria-label="Close">${icons.x}</button>
      </div>
      <div class="modal-body">${body}</div>
      <div class="modal-foot">${actions}</div>
    </div>`;
  document.body.appendChild(scrim);
  openModal = scrim;

  scrim.addEventListener('click', (e) => { if (e.target === scrim) closeModal(); });
  scrim.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
  document.addEventListener('keydown', escClose);

  const first = scrim.querySelector('input, textarea, select');
  if (first) setTimeout(() => first.focus(), 60);
  return scrim;
}

function escClose(e) { if (e.key === 'Escape') closeModal(); }

export function closeModal() {
  if (openModal) { openModal.remove(); openModal = null; }
  document.removeEventListener('keydown', escClose);
}

/* --- small pieces -------------------------------------------------------- */

export const avatar = (member, cls = '') =>
  `<span class="avatar ${cls}" aria-hidden="true">${member.initials}</span>`;

export const tag = (text, variant = '') =>
  `<span class="tag ${variant}">${esc(text)}</span>`;

export const subButton = (key, on, label = 'Subscribe') => `
  <button class="sub-btn ${on ? 'is-on' : ''}" data-sub="${key}"
          aria-pressed="${on}">
    ${on ? icons.bellOn : icons.bell}
    <span>${on ? 'Subscribed' : label}</span>
  </button>`;
