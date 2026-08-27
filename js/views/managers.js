/* ==========================================================================
   Manager details. Contact information for whoever is listed as an apiary's
   manager — phone and email are mandatory once saved, address is optional —
   plus their roles and which apiaries they're permitted to add hives to and
   log inspections for.

   This is keyed by member id, not by role: the "manager" of an apiary is
   whichever member is assigned to it (see apiaries.js's manager select),
   which in the seed data includes people whose only role is "Breeder". The
   page works the same regardless of role.

   Holding the "Apiary Manager" role is a title, not itself a grant — actual
   edit access to a given site comes from that apiary's own managers list,
   set here independently. A member can hold several roles at once.
   ========================================================================== */

import { roleOptions } from '../data.js';
import {
  allApiaries, contactFor, hasContact, setContact,
  roleLabel, rolesFor, setRoles, isWebAdmin, managersFor, setManagedApiaries,
  memberById, currentUser, allMembers, state,
} from '../store.js';
import { esc, icons, avatar, modal, closeModal, toast } from '../ui.js';

/* Members directory — lets Web Admin see everyone who has access at a
   glance, and cross-check who actually signed in via real Wild Apricot
   sign-in (state.provisionedMembers) against this prototype's seed/demo
   roster, which is otherwise indistinguishable in the rest of the app. */
export function renderMembers() {
  const canManage = isWebAdmin(currentUser().id);
  if (!canManage) {
    return `
      <div class="topbar">
        <div style="width:100%">
          <h1>Members</h1>
        </div>
      </div>
      <div class="wrap view">
        <div class="empty">
          <h3>Web Admin only</h3>
          <p>Only Web Admin can view the members directory.</p>
        </div>
      </div>`;
  }

  const members = allMembers().slice().sort((a, b) => a.name.localeCompare(b.name));
  const provisionedIds = new Set(state.provisionedMembers.map((m) => m.id));

  const rows = members.map((m) => {
    const roles = rolesFor(m.id);
    const viaWA = provisionedIds.has(m.id);
    return `
      <tr>
        <td>
          <a class="row" style="gap:var(--s3)" href="#/managers/${m.id}">
            ${avatar(m)}
            <div>
              <div style="font-size:13.5px;font-weight:600">${esc(m.name)}</div>
              <div class="caption">${esc(m.state || '—')}</div>
            </div>
          </a>
        </td>
        <td>
          ${roles.length ? roles.map((r) => `<span class="tag tag-outline" style="margin:2px 3px 2px 0">${esc(r)}</span>`).join('') : '<span class="caption">No roles set.</span>'}
        </td>
        <td>
          <span class="tag ${viaWA ? 'tag-green' : 'tag'}">${viaWA ? 'Wild Apricot sign-in' : 'Seed / demo data'}</span>
        </td>
        <td>
          ${hasContact(m.id) ? '<span class="caption">On file</span>' : '<span class="tag tag-amber">Missing</span>'}
        </td>
      </tr>`;
  }).join('');

  return `
    <div class="topbar">
      <div style="width:100%">
        <div class="eyebrow">${members.length} people with access</div>
        <h1>Members</h1>
      </div>
    </div>

    <div class="wrap view">
      <div class="panel">
        <div class="tbl-scroll">
          <table class="tbl">
            <thead>
              <tr><th>Member</th><th>Roles</th><th>Source</th><th>Contact</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
      <p class="caption" style="margin-top:var(--s4)">
        "Wild Apricot sign-in" means this person has actually authenticated through Wild
        Apricot at least once — the intended cross-check against drift between the two
        systems (a lapsed member who still has a role here, or a current member with no
        role at all). "Seed / demo data" rows are this prototype's placeholder roster,
        not real Wild Apricot members.
      </p>
    </div>`;
}

export function renderManager(id) {
  const m = memberById(id);
  if (!m) return '';

  const contact = contactFor(id);
  const complete = hasContact(id);
  const manages = allApiaries().filter((a) => a.managers.includes(id));
  const roles = rolesFor(id);
  const canManageRoles = isWebAdmin(currentUser().id);

  const html = `
    <div class="topbar">
      <div style="width:100%">
        <div class="crumb"><a href="#/apiaries">Apiaries</a> ${icons.chevron} <span>Manager</span></div>
        <div class="eyebrow">${esc(roleLabel(id))} · ${m.state}</div>
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

          <div class="panel">
            <div class="panel-head">
              <h2>Roles &amp; apiary access</h2>
              <span class="spacer"></span>
              ${canManageRoles ? `<button class="btn btn-ghost btn-sm" id="edit-roles">${icons.pen} Edit</button>` : ''}
            </div>
            <div class="panel-body">
              <div class="eyebrow" style="margin-bottom:var(--s2)">Roles</div>
              <div class="row row-wrap" style="gap:6px;margin-bottom:var(--s5)">
                ${roles.length ? roles.map((r) => `<span class="tag tag-outline">${esc(r)}</span>`).join('')
                  : '<span class="caption">No roles set.</span>'}
              </div>
              <div class="eyebrow" style="margin-bottom:var(--s2)">Can add hives / log inspections at</div>
              <div class="row row-wrap" style="gap:6px">
                ${manages.length ? manages.map((a) => `<a class="tag tag-amber" href="#/apiaries/${a.id}">${a.code} · ${esc(a.name)}</a>`).join('')
                  : '<span class="caption">No sites granted.</span>'}
              </div>
              ${!canManageRoles ? `<p class="caption" style="margin-top:var(--s4)">Only Web Admin can change roles and site access.</p>` : ''}
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
                  <div class="caption">${esc(roleLabel(id))} · member since ${m.since}</div>
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
    const rolesBtn = document.getElementById('edit-roles');
    if (rolesBtn) rolesBtn.addEventListener('click', () => openRolesForm(m));
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

function openRolesForm(m) {
  const currentRoles = rolesFor(m.id);
  const apiaries = allApiaries();

  const roleChecks = roleOptions.map((r) => `
    <label class="row" style="align-items:flex-start;gap:8px;font-size:13px;font-weight:400;text-transform:none;letter-spacing:0;margin-bottom:8px">
      <input type="checkbox" value="${esc(r.name)}" class="r-role" style="margin-top:3px" ${currentRoles.includes(r.name) ? 'checked' : ''}>
      <span>
        <span style="display:block">${esc(r.name)}</span>
        <span class="caption" style="display:block">${esc(r.description)}</span>
      </span>
    </label>`).join('');

  const siteChecks = apiaries.map((a) => `
    <label class="row" style="gap:8px;font-size:13px;font-weight:400;text-transform:none;letter-spacing:0;margin-bottom:6px">
      <input type="checkbox" value="${a.id}" class="r-site" ${managersFor(a.id).includes(m.id) ? 'checked' : ''}>
      ${esc(a.name)} <span class="caption">(${a.code})</span>
    </label>`).join('');

  const body = `
    <p class="caption" style="margin-bottom:var(--s5)">
      Site access is separate from the role tag — holding "Apiary Manager" doesn't by
      itself grant edit access anywhere. Check the specific sites below.
    </p>
    <div class="field">
      <label>Roles</label>
      ${roleChecks}
    </div>
    <div class="field">
      <label>Can add hives / log inspections at</label>
      ${siteChecks || '<p class="caption">No apiaries exist yet.</p>'}
    </div>`;

  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-primary" id="save-roles">Save</button>`;

  const scrim = modal({ title: `Roles & access — ${m.name}`, body, actions });

  scrim.querySelector('#save-roles').addEventListener('click', () => {
    const roles = [...scrim.querySelectorAll('.r-role:checked')].map((c) => c.value);
    const sites = [...scrim.querySelectorAll('.r-site:checked')].map((c) => c.value);

    setRoles(m.id, roles);
    setManagedApiaries(m.id, sites);
    closeModal();
    toast(`Roles and site access updated for ${m.name}.`);
    window.__aqbba_render();
  });
}
