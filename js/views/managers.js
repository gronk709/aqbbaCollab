/* ==========================================================================
   Member details — contact information (phone and email are mandatory once
   saved, address is optional), roles, and which apiaries this member has
   real site access to (apiary_managers — granted from that apiary's own
   page, js/views/apiaries.js's Team panel, not here; this page just shows
   it, in "Apiary access"/"Manages" below).

   Holding the "Apiary Manager" role is a title, not itself a grant — actual
   edit access to a given site comes from apiary_managers, set on the
   apiary's own page. A member can hold several roles at once.
   ========================================================================== */

import { roleOptions } from '../data.js';
import {
  isWebAdmin,
  currentUser, loadRealMembers, loadMemberRoles, setMemberRoles, setMemberContact,
  deactivateMember, reactivateMember, inviteCollaborator,
} from '../store.js';
import { esc, icons, modal, closeModal, toast } from '../ui.js';
import {
  button, pageHeader, pageBody, twoColumn, card, countBadge, table, rowList, tag, personRow, emptyState,
} from '../components.js';

const MONO_LABEL = 'tw:font-mono tw:text-[10.5px] tw:font-medium tw:uppercase tw:tracking-[0.12em] tw:text-propolis-40';
const CAPTION = 'tw:text-[12.5px] tw:text-propolis-40';

/* One role checkbox with its description, shared by the three role pickers
   below (the modals keep the .field wrapper; the label look is reset here
   because .field styles its first label as a small caps heading). */
const roleCheckbox = (r, { cls, checked = false }) => `
  <label class="tw:mb-2 tw:flex tw:items-start tw:gap-2 tw:text-[13px] tw:font-normal tw:normal-case tw:tracking-normal">
    <input type="checkbox" value="${esc(r.name)}" class="${cls} tw:mt-[3px]" ${checked ? 'checked' : ''}>
    <span>
      <span class="tw:block">${esc(r.name)}</span>
      <span class="tw:block ${CAPTION}">${esc(r.description)}</span>
    </span>
  </label>`;

/* A tag that is a link (apiary access chips). */
const amberTagLink = (href, text) => `
  <a href="${href}" class="tw:inline-flex tw:items-center tw:gap-1.5 tw:whitespace-nowrap tw:rounded-full tw:bg-amber-wash tw:px-2.5 tw:py-1 tw:font-mono tw:text-[10.5px] tw:font-medium tw:uppercase tw:tracking-[0.06em] tw:text-amber-deep tw:transition tw:hover:bg-amber/25">${esc(text)}</a>`;

/* Members directory — every real member (js/store.js's loadMembersDirectory
   / loadMemberDetail), not the old seed/demo roster this used to fall back
   to. Sign-in status is now tri-state, not just "signed in or not" — a
   member can authenticate two different ways: Wild Apricot OAuth (m.wa —
   members.wa_contact_id — is only ever set by that path) or a direct
   invited account (m.hasSignedIn — members.auth_user_id — set with no
   wa_contact_id). Either still leaves the member row otherwise completely
   ordinary; this column is purely informational, not a permission. */
function signInStatus(m) {
  if (m.wa) return { label: 'Signed in via Wild Apricot', tone: 'green' };
  if (m.hasSignedIn) return { label: 'Signed in directly', tone: 'green' };
  return { label: 'Not yet signed in', tone: 'neutral' };
}
export function renderMembers(members) {
  const canManage = isWebAdmin(currentUser().id);
  if (!canManage) {
    return `
      <div class="view">
        ${pageHeader({ title: 'Members' })}
        ${pageBody(emptyState({ title: 'Web Admin only', text: 'Only Web Admin can view the members directory.' }))}
      </div>`;
  }

  const rows = members.map((m) => {
    const sign = signInStatus(m);
    return `
      <tr${m.deactivated ? ' class="tw:opacity-60"' : ''}>
        <td>${personRow({ initials: m.initials, name: m.name, sub: m.state || '—', href: `#/managers/${m.id}` })}</td>
        <td>
          ${m.roles.length
            ? `<div class="tw:flex tw:flex-wrap tw:gap-1.5">${m.roles.map((r) => tag(r, 'outline')).join('')}</div>`
            : `<span class="${CAPTION}">No roles set.</span>`}
        </td>
        <td>${m.deactivated ? tag('Deactivated', 'red') : tag(sign.label, sign.tone)}</td>
        <td>${m.phone && m.email ? `<span class="${CAPTION}">On file</span>` : tag('Missing', 'amber')}</td>
      </tr>`;
  }).join('');

  const html = `
    <div class="view">
      ${pageHeader({
        eyebrow: `${members.length} people with access`,
        title: 'Members',
        actions: `
          ${button({ id: 'invite-collaborator', label: 'Invite collaborator', icon: icons.mail, variant: 'outline', size: 'sm' })}
          ${button({ id: 'manage-member-roles', label: 'Manage roles', icon: icons.pen, size: 'sm' })}`,
      })}
      ${pageBody(`
        ${card({ flush: true, body: table({ head: ['Member', 'Roles', 'Sign-in', 'Contact'], body: rows }) })}
        <p class="tw:mt-5 tw:max-w-3xl tw:text-sm tw:leading-relaxed tw:text-propolis-60">
          "Not yet signed in" means a Web Admin has added this member's record but they
          haven't actually authenticated yet — the intended cross-check against drift
          between the two systems (a lapsed member who still has a role here, or a current
          member with none). "Signed in directly" is a collaborator who isn't a Wild
          Apricot member at all — invited straight from this site instead, so they don't
          need a Wild Apricot license seat.
        </p>`)}
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
    rolesChecks.innerHTML = roleOptions.map((r) => roleCheckbox(r, { cls: 'mr-role', checked: currentRoles.includes(r.name) })).join('');
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
   and js/views/setPassword.js for what happens when they click it. No role
   picker here — the Edge Function always grants Guest automatically, the
   same way a real Wild Apricot sign-in always gets Member; a Web Admin
   adds anything further afterward via "Manage roles" or the member's own
   page. */
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
    <p class="${CAPTION}">They'll get the Guest role (same access as Member) and an email with a
      link to set their own password. No Wild Apricot account or license seat is needed.</p>`;
  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-primary" id="send-invite">Send invite</button>`;
  const scrim = modal({ title: 'Invite collaborator', body, actions });
  const saveBtn = scrim.querySelector('#send-invite');

  saveBtn.addEventListener('click', async () => {
    const name = scrim.querySelector('#ic-name').value.trim();
    const email = scrim.querySelector('#ic-email').value.trim();

    if (!name || !email) {
      toast('Name and email are required.');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Sending…';
    try {
      await inviteCollaborator({ name, email });
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
  const manages = m.manages || [];
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

  const contactCard = card({
    title: 'Contact',
    body: complete ? `
      <dl class="tw:grid tw:grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] tw:gap-6">
        <div class="tw:min-w-0">
          <dt class="${MONO_LABEL}">Phone</dt>
          <dd class="tw:ml-0 tw:mt-1.5"><a href="tel:${esc(m.phone)}" class="tw:text-base tw:text-propolis tw:transition tw:hover:text-amber-deep tw:hover:underline">${esc(m.phone)}</a></dd>
        </div>
        <div class="tw:min-w-0">
          <dt class="${MONO_LABEL}">Email</dt>
          <dd class="tw:ml-0 tw:mt-1.5"><a href="mailto:${esc(m.email)}" class="tw:text-base tw:text-propolis tw:transition tw:[overflow-wrap:anywhere] tw:hover:text-amber-deep tw:hover:underline">${esc(m.email)}</a></dd>
        </div>
        ${m.address ? `
        <div class="tw:min-w-0">
          <dt class="${MONO_LABEL}">Address</dt>
          <dd class="tw:ml-0 tw:mt-1.5 tw:text-[15px] tw:text-propolis">${esc(m.address)}</dd>
        </div>` : ''}
      </dl>` : emptyState({
        title: 'No contact details on file',
        text: canEditContact
          ? `Phone and email are needed so other members and the coordinator can reach ${esc(m.name.split(' ')[0])} directly about the sites they manage.`
          : m.deactivated
            ? 'Contact details were removed when this member was deleted.'
            : 'Contact details are restricted to the member themselves and Web Admin.',
        action: canEditContact ? button({ id: 'empty-contact', label: 'Add contact details' }) : '',
        bordered: false,
      }),
  });

  const rolesCard = card({
    title: 'Roles & apiary access',
    right: canManageRoles && !m.deactivated
      ? button({ id: 'edit-roles', label: 'Edit', icon: icons.pen, variant: 'outline', size: 'sm' }) : '',
    body: `
      <div class="${MONO_LABEL} tw:mb-2">Roles</div>
      <div class="tw:mb-5 tw:flex tw:flex-wrap tw:gap-1.5">
        ${m.roles.length ? m.roles.map((r) => tag(r, 'outline')).join('')
          : `<span class="${CAPTION}">No roles set.</span>`}
      </div>
      <div class="${MONO_LABEL} tw:mb-2">Apiary access</div>
      <div class="tw:flex tw:flex-wrap tw:gap-1.5">
        ${manages.length ? manages.map((a) => amberTagLink(`#/apiaries/${a.id}`, `${a.code} · ${a.accessLevel === 'manage' ? 'Manage' : 'Operate'}`)).join('')
          : `<span class="${CAPTION}">No sites granted.</span>`}
      </div>
      <p class="tw:mt-4 tw:text-sm tw:text-propolis-60">
        ${m.deactivated ? 'This member is deactivated — reactivate them to grant roles or site access again.'
          : 'Apiary access is granted per site, from that site\'s own page (Team panel) — not here.'}
      </p>`,
  });

  const memberCard = card({
    title: 'Member',
    body: `
      ${personRow({ initials: m.initials, name: m.name, sub: `${roleLabelText} · member since ${m.since ?? '—'}` })}
      <div class="tw:mt-5 tw:space-y-2 tw:border-t tw:border-comb-shade/70 tw:pt-4 tw:text-sm tw:text-propolis">
        <div class="tw:flex tw:items-baseline tw:justify-between tw:gap-4">
          <span>State</span>
          <span class="tw:font-mono">${esc(m.state || '—')}</span>
        </div>
        <div class="tw:flex tw:items-baseline tw:justify-between tw:gap-4">
          <span>Wild Apricot ID</span>
          <span class="tw:font-mono">${esc(m.wa || '—')}</span>
        </div>
      </div>`,
  });

  const managesCard = manages.length ? card({
    title: 'Manages',
    right: countBadge(manages.length),
    flush: true,
    body: rowList(manages.map((a) => `
      <a class="tw:flex tw:items-center tw:gap-3 tw:px-6 tw:py-3.5 tw:text-propolis-40 tw:transition tw:hover:bg-comb/60" href="#/apiaries/${a.id}">
        <span class="tw:min-w-0 tw:flex-1">
          <strong class="tw:block tw:text-[15px] tw:font-semibold tw:text-propolis">${esc(a.name)}</strong>
          <span class="tw:text-sm tw:text-propolis-60">${a.code} · ${a.accessLevel === 'manage' ? 'Manage' : 'Operate'}</span>
        </span>
        ${icons.chevron}
      </a>`)),
  }) : '';

  const html = `
    <div class="view">
      ${pageHeader({
        crumbs: [{ label: 'Members', href: '#/members' }, { label: 'Member' }],
        eyebrow: `${esc(roleLabelText)} · ${esc(m.state || '—')} ${m.deactivated ? tag('Deactivated', 'red') : ''}`,
        title: m.name,
        actions: `
          ${canEditContact ? button({ id: 'edit-contact', label: complete ? 'Edit details' : 'Add contact details', icon: icons.pen, size: 'sm' }) : ''}
          ${canDeleteMember ? (m.deactivated
            ? button({ id: 'reactivate-member', label: 'Reactivate member', variant: 'outline', size: 'sm' })
            : button({ id: 'delete-member', label: 'Delete member', icon: icons.x, variant: 'outline', size: 'sm' })) : ''}`,
      })}
      ${pageBody(twoColumn({ main: contactCard + rolesCard, side: memberCard + managesCard }))}
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
    <div class="tw:space-y-3 tw:text-[14.5px] tw:leading-relaxed tw:text-propolis-60">
      <p>Delete ${esc(m.name)}? This revokes all of their roles and apiary access, and
      deletes their contact details on file.</p>
      <p>Anything they've already posted or written (forum posts, repository articles)
      stays as-is and still shows their name. A Web Admin can reactivate this member
      later, but roles, site access and contact details will need to be re-added.</p>
    </div>`;
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
        <label for="c-phone">Phone <span class="tw:text-amber-deep">*</span></label>
        <input id="c-phone" type="tel" required value="${esc(m.phone)}" placeholder="04xx xxx xxx">
      </div>
      <div class="field">
        <label for="c-email">Email <span class="tw:text-amber-deep">*</span></label>
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

/* Apiary site access isn't set here any more — same reasoning Phase 6
   already established for project team assignment: it's a real per-entity
   grant now (apiary_managers), assigned from the apiary's own page (Team
   panel, js/views/apiaries.js's openManageApiaryTeamModal), not the
   member's roles page. */
function openRolesForm(m) {
  const currentRoles = m.roles;

  const roleChecks = roleOptions.map((r) => roleCheckbox(r, { cls: 'r-role', checked: currentRoles.includes(r.name) })).join('');

  const body = `
    <div class="field">
      <label>Roles</label>
      ${roleChecks}
    </div>`;

  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-primary" id="save-roles">Save</button>`;

  const scrim = modal({ title: `Roles — ${m.name}`, body, actions });
  const saveBtn = scrim.querySelector('#save-roles');

  saveBtn.addEventListener('click', async () => {
    const roles = [...scrim.querySelectorAll('.r-role:checked')].map((c) => c.value);

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
    closeModal();
    toast(`Roles updated for ${m.name}.`);
    window.__aqbba_invalidateData();
    window.__aqbba_render();
  });
}
