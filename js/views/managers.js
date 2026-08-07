/* ==========================================================================
   Manager details. Contact information for whoever is listed as an apiary's
   manager — phone and email are mandatory once saved, address is optional.

   This is keyed by member id, not by role: the "manager" of an apiary is
   whichever member is assigned to it (see apiaries.js's manager select),
   which in the seed data includes people whose member role is "Breeder".
   The page works the same regardless of role.
   ========================================================================== */

import { memberById } from '../data.js';
import { allApiaries, contactFor, hasContact, setContact } from '../store.js';
import { esc, icons, avatar, modal, closeModal, toast } from '../ui.js';

export function renderManager(id) {
  const m = memberById(id);
  if (!m) return '';

  const contact = contactFor(id);
  const complete = hasContact(id);
  const manages = allApiaries().filter((a) => a.manager === id);

  const html = `
    <div class="topbar">
      <div style="width:100%">
        <div class="crumb"><a href="#/apiaries">Apiaries</a> ${icons.chevron} <span>Manager</span></div>
        <div class="eyebrow">${esc(m.role)} · ${m.state}</div>
        <h1>${esc(m.name)}</h1>
      </div>
      <div class="topbar-actions">
        <button class="btn btn-primary btn-sm" id="edit-contact">${icons.pen} ${complete ? 'Edit details' : 'Add contact details'}</button>
      </div>
    </div>

    <div class="wrap view">
      <div class="grid grid-dash">
        <div class="stack">
          <div class="panel">
            <div class="panel-head"><h2>Contact</h2></div>
            <div class="panel-body">
              ${complete ? `
                <dl class="readout-metrics" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
                  <div>
                    <dt>Phone</dt>
                    <dd><a href="tel:${esc(contact.phone)}" style="font-size:1rem">${esc(contact.phone)}</a></dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd><a href="mailto:${esc(contact.email)}" style="font-size:1rem;overflow-wrap:anywhere">${esc(contact.email)}</a></dd>
                  </div>
                  ${contact.address ? `
                  <div>
                    <dt>Address</dt>
                    <dd style="font-size:0.95rem;font-family:var(--ui)">${esc(contact.address)}</dd>
                  </div>` : ''}
                </dl>
              ` : `
                <div class="empty" style="padding:var(--s6) 0">
                  <h3>No contact details on file</h3>
                  <p>Phone and email are needed so other members and the coordinator can reach ${esc(m.name.split(' ')[0])} directly about the sites they manage.</p>
                  <button class="btn btn-primary" id="empty-contact">Add contact details</button>
                </div>
              `}
            </div>
          </div>
        </div>

        <div class="stack">
          <div class="panel">
            <div class="panel-head"><h2>Member</h2></div>
            <div class="panel-body">
              <div class="row" style="gap:var(--s3)">
                ${avatar(m)}
                <div>
                  <div style="font-size:13.5px;font-weight:600">${esc(m.name)}</div>
                  <div class="caption">${esc(m.role)} · member since ${m.since}</div>
                </div>
              </div>
              <div class="row" style="justify-content:space-between;margin-top:var(--s5);padding-top:var(--s4);border-top:1px solid var(--comb-shade)">
                <span style="font-size:13px">State</span>
                <span class="mono" style="font-size:13px">${m.state}</span>
              </div>
              <div class="row" style="justify-content:space-between;margin-top:var(--s2)">
                <span style="font-size:13px">Wild Apricot ID</span>
                <span class="mono" style="font-size:13px">${m.wa}</span>
              </div>
            </div>
          </div>

          ${manages.length ? `
            <div class="panel">
              <div class="panel-head">
                <h2>Manages</h2>
                <span class="spacer"></span>
                <span class="caption mono">${manages.length}</span>
              </div>
              <div class="panel-body panel-body-flush">
                ${manages.map((a) => `
                  <a class="sub" href="#/apiaries/${a.id}">
                    <div class="sub-title">
                      <strong>${esc(a.name)}</strong>
                      <span>${a.code} · ${a.hives} hives</span>
                    </div>
                    ${icons.chevron}
                  </a>`).join('')}
              </div>
            </div>` : ''}
        </div>
      </div>
    </div>`;

  setTimeout(() => {
    ['edit-contact', 'empty-contact'].forEach((elId) => {
      const btn = document.getElementById(elId);
      if (btn) btn.addEventListener('click', () => openContactForm(m, contact));
    });
  }, 0);

  return html;
}

function openContactForm(m, contact) {
  const body = `
    <form id="contact-form">
      <div class="field">
        <label for="c-phone">Phone <span style="color:var(--amber-deep)">*</span></label>
        <input id="c-phone" type="tel" required value="${esc(contact.phone)}" placeholder="04xx xxx xxx">
      </div>
      <div class="field">
        <label for="c-email">Email <span style="color:var(--amber-deep)">*</span></label>
        <input id="c-email" type="email" required value="${esc(contact.email)}" placeholder="name@example.com">
      </div>
      <div class="field">
        <label for="c-address">Address (optional)</label>
        <textarea id="c-address" placeholder="Street, suburb, state, postcode">${esc(contact.address)}</textarea>
      </div>
    </form>`;

  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-primary" id="save-contact">Save details</button>`;

  const scrim = modal({ title: `Contact details — ${m.name}`, body, actions });

  scrim.querySelector('#save-contact').addEventListener('click', () => {
    const phone = scrim.querySelector('#c-phone').value.trim();
    const email = scrim.querySelector('#c-email').value.trim();
    const address = scrim.querySelector('#c-address').value.trim();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (!phone || !email) {
      toast('Phone and email are both required.');
      return;
    }
    if (!emailOk) {
      toast('That email address doesn\'t look right — check it and try again.');
      return;
    }

    setContact(m.id, { phone, email, address });
    closeModal();
    toast('Contact details saved.');
    window.__aqbba_render();
  });
}
