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
  allApiaries, isWebAdmin, managersFor, setManagedApiaries,
  currentUser, loadRealMembers, loadMemberRoles, setMemberRoles, setMemberContact,
  deactivateMember, reactivateMember, inviteCollaborator,
} from '../store.js';
import { esc, icons, avatar, modal, closeModal, toast } from '../ui.js';

/* Members directory — every real member (js/store.js's loadMembersDirectory
   / loadMemberDetail), not the old seed/demo roster this used to fall back
   to. Sign-in status is now tri-state, not just "signed in or not" — a
   member can authenticate two different ways: Wild Apricot OAuth (m.wa —
   members.wa_contact_id — is only ever set by that path) or a direct
   invited account (m.hasSignedIn — members.auth_user_id — set with no
   wa_contact_id). Either still leaves the member row otherwise completely
   ordinary; this column is purely informational, not a permission. */
function signInStatus(m) {
  if (m.wa) return { label: 'Signed in via Wild Apricot', tag: 'tag-green' };
  if (m.hasSignedIn) return { label: 'Signed in directly', tag: 'tag-green' };
  return { label: 'Not yet signed in', tag: 'tag' };
}
export function renderMembers(members) {
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

  const rows = members.map((m) => {
    const sign = signInStatus(m);
    return `
      <tr${m.deactivated ? ' style="opacity:0.6"' : ''}>
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
          ${m.roles.length ? m.roles.map((r) => `<span class="tag tag-outline" style="margin:2px 3px 2px 0">${esc(r)}</span>`).join('') : '<span class="caption">No roles set.</span>'}
        </td>
        <td>
          ${m.deactivated
            ? '<span class="tag tag-red">Deactivated</span>'
            : `<span class="tag ${sign.tag}">${sign.label}</span>`}
        </td>
        <td>
          ${m.phone && m.email ? '<span class="caption">On file</span>' : '<span class="tag tag-amber">Missing</span>'}
        </td>
      </tr>`;
  }).join('');

  const html = `
    <div class="topbar">
      <div style="width:100%">
        <div class="eyebrow">${members.length} people with access</div>
        <h1>Members</h1>
      </div>
      <div class="topbar-actions">
        <button class="btn btn-ghost btn-sm" id="invite-collaborator">${icons.mail} Invite collaborator</button>
        <button class="btn btn-primary btn-sm" id="manage-member-roles">${icons.pen} Manage roles</button>
      </div>
    </div>

    <div class="wrap view">
      <div class="panel">
        <div class="tbl-scroll">
          <table class="tbl">
            <thead>
              <tr><th>Member</th><th>Roles</th><th>Sign-in</th><th>Contact</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
      <p class="caption" style="margin-top:var(--s4)">
        "Not yet signed in" means a Web Admin has added this member's record but they
        haven't actually authenticated yet — the intended cross-check against drift
        between the two systems (a lapsed member who still has a role here, or a current
        member with none). "Signed in directly" is a collaborator who isn't a Wild
        Apricot member at all — invited straight from this site instead, so they don't
        need a Wild Apricot license seat.
      </p>
    </div>`;

  setTimeout(() => {
    const btn = document.getElementById('manage-member-roles');
    if (btn) btn.addEventListener('click', openManageMemberRolesModal);
    const inviteBtn = document.getElementById('invite-collaborator');
    if (inviteBtn) inviteBtn.addEventListener('click', openInviteCollaboratorModal);
  }, 0);

  return html;
}

/* Real role-tag grant/revoke (member_roles — see setMemberRoles' own
   comment in js/store.js for why this exists as its own panel rather than
   fixing the roles checklist already sitting on a member's own page below:
   that one only ever wrote to local prototype state, and the Members
   directory it lives on can't see a real member who isn't the one
   currently signed in anyway. This panel sidesteps both — loadRealMembers
   fetches every real member directly, the same way Repository/Project
   team assignment already do. */
function openManageMemberRolesModal() {
  const body = `
    <div class="field">
      <label for="mr-member">Member</label>
      <select id="mr-member"><option value="">Loading…</option></select>
    </div>
    <div class="field" id="mr-roles-field" hidden>
      <label>Roles</label>
      <div id="mr-roles-checks"></div>
    </div>`;
  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-primary" id="save-member-roles" disabled>Save</button>`;
  const scrim = modal({ title: 'Manage roles', body, actions });

  const memberSelect = scrim.querySelector('#mr-member');
  const rolesField = scrim.querySelector('#mr-roles-field');
  const rolesChecks = scrim.querySelector('#mr-roles-checks');
  const saveBtn = scrim.querySelector('#save-member-roles');
  let currentRoles = [];

  async function loadRolesForSelected() {
    rolesField.hidden = true;
    saveBtn.disabled = true;
    const memberId = memberSelect.value;
    if (!memberId) return;
    try {
      currentRoles = await loadMemberRoles(memberId);
    } catch (err) {
      toast(`Couldn't load roles: ${err.message}`);
      return;
    }
    rolesChecks.innerHTML = roleOptions.map((r) => `
      <label class="row" style="align-items:flex-start;gap:8px;font-size:13px;font-weight:400;text-transform:none;letter-spacing:0;margin-bottom:8px">
        <input type="checkbox" value="${esc(r.name)}" class="mr-role" style="margin-top:3px" ${currentRoles.includes(r.name) ? 'checked' : ''}>
        <span>
          <span style="display:block">${esc(r.name)}</span>
          <span class="caption" style="display:block">${esc(r.description)}</span>
        </span>
      </label>`).join('');
    rolesField.hidden = false;
    saveBtn.disabled = false;
  }

  loadRealMembers()
    .then((members) => {
      memberSelect.innerHTML = `<option value="">Choose a member…</option>${
        members.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}`;
    })
    .catch((err) => {
      memberSelect.innerHTML = '<option value="">Couldn’t load members</option>';
      toast(`Couldn't load members: ${err.message}`);
    });

  memberSelect.addEventListener('change', loadRolesForSelected);

  saveBtn.addEventListener('click', async () => {
    const memberId = memberSelect.value;
    if (!memberId) return;
    const roles = [...scrim.querySelectorAll('.mr-role:checked')].map((c) => c.value);
    const memberName = memberSelect.options[memberSelect.selectedIndex].text;
    saveBtn.disabled = true;
    try {
      await setMemberRoles(memberId, currentRoles, roles);
    } catch (err) {
      toast(`Couldn't save roles: ${err.message}`);
      saveBtn.disabled = false;
      return;
    }
    closeModal();
    toast(`Roles updated for ${memberName}.`);
    window.__aqbba_invalidateData();
    window.__aqbba_render();
  });
}

/* Invites a non–Wild Apricot collaborator — someone who should be able to
   use this site without holding (or paying for) a Wild Apricot membership.
   inviteCollaborator (js/store.js) calls a Web-Admin-only Edge Function
   that provisions the members/member_contact_details/member_roles rows and
   has Supabase email them a "set your password" link; see js/inviteAuth.js
   and js/views/setPassword.js for what happens when they click it. */
function openInviteCollaboratorModal() {
  const body = `
    <div class="field">
      <label for="ic-name">Name</label>
      <input id="ic-name" type="text" required placeholder="Full name">
    </div>
    <div class="field">
      <label for="ic-email">Email</label>
      <input id="ic-email" type="email" required placeholder="name@example.com">
    </div>
    <div class="field">
      <label>Roles</label>
      <div>
        ${roleOptions.map((r) => `
          <label class="row" style="align-items:flex-start;gap:8px;font-size:13px;font-weight:400;text-transform:none;letter-spacing:0;margin-bottom:8px">
            <input type="checkbox" value="${esc(r.name)}" class="ic-role" style="margin-top:3px">
            <span>
              <span style="display:block">${esc(r.name)}</span>
              <span class="caption" style="display:block">${esc(r.description)}</span>
            </span>
          </label>`).join('')}
      </div>
    </div>
    <p class="caption">They'll get an email with a link to set their own password. No Wild
      Apricot account or license seat is needed.</p>`;
  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-primary" id="send-invite">Send invite</button>`;
  const scrim = modal({ title: 'Invite collaborator', body, actions });
  const saveBtn = scrim.querySelector('#send-invite');

  saveBtn.addEventListener('click', async () => {
    const name = scrim.querySelector('#ic-name').value.trim();
    const email = scrim.querySelector('#ic-email').value.trim();
    const roles = [...scrim.querySelectorAll('.ic-role:checked')].map((c) => c.value);

    if (!name || !email) {
      toast('Name and email are required.');
      return;
    }
    if (!roles.length) {
      toast('Pick at least one role.');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Sending…';
    try {
      await inviteCollaborator({ name, email, roles });
    } catch (err) {
      toast(`Couldn't send the invite: ${err.message}`);
      saveBtn.disabled = false;
      saveBtn.textContent = 'Send invite';
      return;
    }
    closeModal();
    toast(`Invite sent to ${email}.`);
    window.__aqbba_invalidateData();
    window.__aqbba_render();
  });
}

export function renderManager(m) {
  if (!m) return '';

  const complete = Boolean(m.phone && m.email);
  const manages = allApiaries().filter((a) => a.managers.includes(m.id));
  const roleLabelText = m.roles.join(' & ') || '—';
  const canManageRoles = isWebAdmin(currentUser().id);
  /* Own record or Web Admin — matches member_contact_details' real RLS
     (member_id = current_member_id() or is_web_admin()), so this button
     never opens a form that would just fail to save. A non-privileged
     viewer looking at someone else's page also simply never receives
     their contact fields at all (the same RLS applies to the read this
     page's loader did), not just here. */
  const canEditContact = (m.id === currentUser().id || canManageRoles) && !m.deactivated;
  const canDeleteMember = canManageRoles && m.id !== currentUser().id;

  const html = `
    <div class="topbar">
      <div style="width:100%">
        <div class="crumb"><a href="#/members">Members</a> ${icons.chevron} <span>Member</span></div>
        <div class="eyebrow">${esc(roleLabelText)} · ${esc(m.state || '—')} ${m.deactivated ? '· <span class="tag tag-red" style="vertical-align:middle">Deactivated</span>' : ''}</div>
        <h1>${esc(m.name)}</h1>
      </div>
      <div class="topbar-actions">
        ${canEditContact ? `<button class="btn btn-primary btn-sm" id="edit-contact">${icons.pen} ${complete ? 'Edit details' : 'Add contact details'}</button>` : ''}
        ${canDeleteMember ? (m.deactivated
          ? `<button class="btn btn-ghost btn-sm" id="reactivate-member">Reactivate member</button>`
          : `<button class="btn btn-ghost btn-sm" id="delete-member">${icons.x} Delete member</button>`) : ''}
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
                    <dd><a href="tel:${esc(m.phone)}" style="font-size:1rem">${esc(m.phone)}</a></dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd><a href="mailto:${esc(m.email)}" style="font-size:1rem;overflow-wrap:anywhere">${esc(m.email)}</a></dd>
                  </div>
                  ${m.address ? `
                  <div>
                    <dt>Address</dt>
                    <dd style="font-size:0.95rem;font-family:var(--ui)">${esc(m.address)}</dd>
                  </div>` : ''}
                </dl>
              ` : `
                <div class="empty" style="padding:var(--s6) 0">
                  <h3>No contact details on file</h3>
                  <p>${canEditContact
                    ? `Phone and email are needed so other members and the coordinator can reach ${esc(m.name.split(' ')[0])} directly about the sites they manage.`
                    : m.deactivated
                      ? 'Contact details were removed when this member was deleted.'
                      : 'Contact details are restricted to the member themselves and Web Admin.'}</p>
                  ${canEditContact ? `<button class="btn btn-primary" id="empty-contact">Add contact details</button>` : ''}
                </div>
              `}
            </div>
          </div>

          <div class="panel">
            <div class="panel-head">
              <h2>Roles &amp; apiary access</h2>
              <span class="spacer"></span>
              ${canManageRoles && !m.deactivated ? `<button class="btn btn-ghost btn-sm" id="edit-roles">${icons.pen} Edit</button>` : ''}
            </div>
            <div class="panel-body">
              <div class="eyebrow" style="margin-bottom:var(--s2)">Roles</div>
              <div class="row row-wrap" style="gap:6px;margin-bottom:var(--s5)">
                ${m.roles.length ? m.roles.map((r) => `<span class="tag tag-outline">${esc(r)}</span>`).join('')
                  : '<span class="caption">No roles set.</span>'}
              </div>
              <div class="eyebrow" style="margin-bottom:var(--s2)">Can add hives / log inspections at</div>
              <div class="row row-wrap" style="gap:6px">
                ${manages.length ? manages.map((a) => `<a class="tag tag-amber" href="#/apiaries/${a.id}">${a.code} · ${esc(a.name)}</a>`).join('')
                  : '<span class="caption">No sites granted.</span>'}
              </div>
              <p class="caption" style="margin-top:var(--s4)">
                ${m.deactivated ? 'This member is deactivated — reactivate them to grant roles or site access again.'
                  : canManageRoles ? 'Site access is a separate, still-prototype-only grant — apiaries aren\'t real data yet.'
                  : 'Only Web Admin can change roles and site access.'}
              </p>
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
                  <div class="caption">${esc(roleLabelText)} · member since ${esc(m.since ?? '—')}</div>
                </div>
              </div>
              <div class="row" style="justify-content:space-between;margin-top:var(--s5);padding-top:var(--s4);border-top:1px solid var(--comb-shade)">
                <span style="font-size:13px">State</span>
                <span class="mono" style="font-size:13px">${esc(m.state || '—')}</span>
              </div>
              <div class="row" style="justify-content:space-between;margin-top:var(--s2)">
                <span style="font-size:13px">Wild Apricot ID</span>
                <span class="mono" style="font-size:13px">${esc(m.wa || '—')}</span>
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
      if (btn) btn.addEventListener('click', () => openContactForm(m));
    });
    const rolesBtn = document.getElementById('edit-roles');
    if (rolesBtn) rolesBtn.addEventListener('click', () => openRolesForm(m));
    const deleteBtn = document.getElementById('delete-member');
    if (deleteBtn) deleteBtn.addEventListener('click', () => openDeleteMemberModal(m));
    const reactivateBtn = document.getElementById('reactivate-member');
    if (reactivateBtn) reactivateBtn.addEventListener('click', () => reactivateMemberClick(m));
  }, 0);

  return html;
}

function openDeleteMemberModal(m) {
  const body = `
    <p>Delete ${esc(m.name)}? This revokes all of their roles and apiary access, and
    deletes their contact details on file.</p>
    <p>Anything they've already posted or written (forum posts, repository articles)
    stays as-is and still shows their name. A Web Admin can reactivate this member
    later, but roles, site access and contact details will need to be re-added.</p>`;
  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-danger" id="confirm-delete-member">Delete member</button>`;
  const scrim = modal({ title: 'Delete member', body, actions });

  scrim.querySelector('#confirm-delete-member').addEventListener('click', async (e) => {
    e.target.disabled = true;
    e.target.textContent = 'Deleting…';
    try {
      await deactivateMember(m.id);
    } catch (err) {
      toast(`Couldn't delete: ${err.message}`);
      e.target.disabled = false;
      e.target.textContent = 'Delete member';
      return;
    }
    closeModal();
    toast(`${m.name} has been deleted.`);
    window.__aqbba_invalidateData();
    window.__aqbba_render();
  });
}

async function reactivateMemberClick(m) {
  try {
    await reactivateMember(m.id);
  } catch (err) {
    toast(`Couldn't reactivate: ${err.message}`);
    return;
  }
  toast(`${m.name} has been reactivated.`);
  window.__aqbba_invalidateData();
  window.__aqbba_render();
}

function openContactForm(m) {
  const body = `
    <form id="contact-form">
      <div class="field">
        <label for="c-phone">Phone <span style="color:var(--amber-deep)">*</span></label>
        <input id="c-phone" type="tel" required value="${esc(m.phone)}" placeholder="04xx xxx xxx">
      </div>
      <div class="field">
        <label for="c-email">Email <span style="color:var(--amber-deep)">*</span></label>
        <input id="c-email" type="email" required value="${esc(m.email)}" placeholder="name@example.com">
      </div>
      <div class="field">
        <label for="c-address">Address (optional)</label>
        <textarea id="c-address" placeholder="Street, suburb, state, postcode">${esc(m.address)}</textarea>
      </div>
    </form>`;

  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-primary" id="save-contact">Save details</button>`;

  const scrim = modal({ title: `Contact details — ${m.name}`, body, actions });
  const saveBtn = scrim.querySelector('#save-contact');

  saveBtn.addEventListener('click', async () => {
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

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      await setMemberContact(m.id, { phone, email, address });
    } catch (err) {
      toast(`Couldn't save contact details: ${err.message}`);
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save details';
      return;
    }
    closeModal();
    toast('Contact details saved.');
    window.__aqbba_invalidateData();
    window.__aqbba_render();
  });
}

function openRolesForm(m) {
  const currentRoles = m.roles;
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
    <p class="caption" style="margin-bottom:var(--s5);color:var(--amber-deep)">
      Site access below is still prototype-only — it doesn't save to a shared record,
      since apiaries aren't real data yet. Roles above save for real.
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
  const saveBtn = scrim.querySelector('#save-roles');

  saveBtn.addEventListener('click', async () => {
    const roles = [...scrim.querySelectorAll('.r-role:checked')].map((c) => c.value);
    const sites = [...scrim.querySelectorAll('.r-site:checked')].map((c) => c.value);

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      await setMemberRoles(m.id, currentRoles, roles);
    } catch (err) {
      toast(`Couldn't save roles: ${err.message}`);
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
      return;
    }
    setManagedApiaries(m.id, sites);
    closeModal();
    toast(`Roles and site access updated for ${m.name}.`);
    window.__aqbba_invalidateData();
    window.__aqbba_render();
  });
}
