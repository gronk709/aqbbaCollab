/* ==========================================================================
   Account settings — reachable by clicking your own name in the rail
   (js/app.js's shellHTML), next to the "Sign out" button. Phone/email here
   write to the same member_contact_details row every other contact form
   (js/views/managers.js's openContactForm) reads and writes — this is just
   a dedicated, self-only surface for it, with one addition that page
   doesn't need: for a direct (non–Wild Apricot) account, changing the email
   here also updates the Supabase Auth identity email (changeOwnEmail,
   js/store.js) so the address you sign in with doesn't quietly drift from
   the one shown as "your email". openContactForm is deliberately left
   alone rather than taught this — it's also used by a Web Admin editing
   someone else's page, where "the currently signed-in session's own auth
   email" would be the wrong account entirely.

   Password change only applies to that same direct account: a Wild-
   Apricot-linked member's auth.users row has no password at all (see
   supabase/functions/forgot-password's header comment) — they sign in
   exclusively through Wild Apricot's own OAuth handoff, so there's nothing
   here for them to change. Shown a note pointing at Wild Apricot instead,
   same framing as the forgot-password flow's own dialog.
   ========================================================================== */

import { currentUser, setMemberContact, changeOwnEmail, changeOwnPassword, loadSignedInMember } from '../store.js';
import { esc, toast } from '../ui.js';
import { pageHeader, pageBody, card } from '../components.js';

export function renderSettings() {
  const me = currentUser();
  const isWA = !!me.wa;

  const NOTE = 'tw:text-sm tw:text-propolis-60';

  const html = `
    <div class="view">
      ${pageHeader({ title: 'Account settings' })}
      ${pageBody(`
        <div class="tw:max-w-xl tw:space-y-6">
          ${card({
            title: 'Contact details',
            body: `
              <form id="settings-contact" novalidate>
                <div class="field">
                  <label for="s-phone">Phone</label>
                  <input id="s-phone" type="tel" value="${esc(me.phone)}" placeholder="04xx xxx xxx">
                </div>
                <div class="field">
                  <label for="s-email">Email</label>
                  <input id="s-email" type="email" required value="${esc(me.email)}" placeholder="name@example.com">
                </div>
                <p class="${NOTE} tw:mb-5">
                  ${isWA
                    ? 'This is just your contact address for notifications — your Wild Apricot sign-in is unaffected either way.'
                    : 'Changing your email also updates how you sign in — you\'ll need to confirm it from a link sent to the new address before the change takes effect.'}
                </p>
                <button type="submit" class="btn btn-primary" id="save-contact-btn">Save contact details</button>
              </form>`,
          })}

          ${card({
            title: 'Password',
            body: isWA ? `
              <p class="${NOTE}">This account signs in through Wild Apricot, so its password is managed
              there — use Wild Apricot's own "Forgot password" link to change it.</p>
            ` : `
              <form id="settings-password" novalidate>
                <div class="field">
                  <label for="s-pw">New password</label>
                  <input id="s-pw" type="password" autocomplete="new-password"
                         placeholder="At least 8 characters" minlength="8">
                </div>
                <div class="field">
                  <label for="s-pw2">Confirm new password</label>
                  <input id="s-pw2" type="password" autocomplete="new-password"
                         placeholder="••••••••" minlength="8">
                </div>
                <button type="submit" class="btn btn-primary" id="save-password-btn">Update password</button>
              </form>
            `,
          })}
        </div>`)}
    </div>`;

  setTimeout(() => {
    const contactForm = document.getElementById('settings-contact');
    if (contactForm) contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const phone = document.getElementById('s-phone').value.trim();
      const email = document.getElementById('s-email').value.trim();
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      const emailChanged = email !== me.email;

      if (!emailOk) {
        toast('That email address doesn\'t look right — check it and try again.');
        return;
      }

      const btn = document.getElementById('save-contact-btn');
      btn.disabled = true;
      btn.textContent = 'Saving…';
      try {
        await setMemberContact(me.id, { phone, email, address: me.address });
        if (!isWA && emailChanged) await changeOwnEmail(email);
      } catch (err) {
        toast(`Couldn't save: ${err.message}`);
        btn.disabled = false;
        btn.textContent = 'Save contact details';
        return;
      }
      await loadSignedInMember();
      window.__aqbba_invalidateData();
      toast(!isWA && emailChanged
        ? 'Contact details saved. Check your new email to confirm the sign-in change.'
        : 'Contact details saved.');
      window.__aqbba_render();
    });

    const pwForm = document.getElementById('settings-password');
    if (pwForm) pwForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pw = document.getElementById('s-pw').value;
      const pw2 = document.getElementById('s-pw2').value;
      if (pw.length < 8) { toast('Password must be at least 8 characters.'); return; }
      if (pw !== pw2) { toast('Passwords don\'t match.'); return; }

      const btn = document.getElementById('save-password-btn');
      btn.disabled = true;
      btn.textContent = 'Updating…';
      try {
        await changeOwnPassword(pw);
      } catch (err) {
        toast(`Couldn't update password: ${err.message}`);
        btn.disabled = false;
        btn.textContent = 'Update password';
        return;
      }
      pwForm.reset();
      btn.disabled = false;
      btn.textContent = 'Update password';
      toast('Password updated.');
    });
  }, 0);

  return html;
}
