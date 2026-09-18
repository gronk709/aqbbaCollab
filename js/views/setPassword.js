/* ==========================================================================
   "Set your password" — shown once, right after a collaborator accepts an
   email invite (js/inviteAuth.js) or follows a "forgot password" recovery
   link, before they see anything else. Gated in js/app.js's render() on
   state.awaitingPasswordSetup / state.awaitingPasswordReset, the same way
   js/views/gate.js is gated on !state.signedIn — mode picks which of those
   two put the member here, purely for the page copy below; the form and
   the completeCollaboratorPasswordSetup() call it submits to are identical
   either way.
   ========================================================================== */

import { brandMark, toast } from '../ui.js';
import { completeCollaboratorPasswordSetup } from '../store.js';

export function renderSetPassword(mode = 'invite') {
  const isRecovery = mode === 'recovery';
  return `
    <div class="gate gate--single">
      <section class="gate-form">
        <div class="gate-form-inner">
          <a class="gate-mark" href="#/" style="pointer-events:none">
            ${brandMark(44)}
            <span>AQBBA</span>
          </a>
          <h2>${isRecovery ? 'Reset your password' : 'Set your password'}</h2>
          <p class="caption">
            ${isRecovery
              ? 'Choose a new password for your account.'
              : 'You\'ve been invited to collaborate on this site. Choose a password to finish setting up sign-in — you\'ll use it (with your email) to sign in next time.'}
          </p>

          <form id="set-password" novalidate>
            <div class="field">
              <label for="sp-pw">Password</label>
              <input type="password" id="sp-pw" name="pw" autocomplete="new-password"
                     placeholder="At least 8 characters" minlength="8" required>
            </div>
            <div class="field">
              <label for="sp-pw2">Confirm password</label>
              <input type="password" id="sp-pw2" name="pw2" autocomplete="new-password"
                     placeholder="••••••••" minlength="8" required>
            </div>
            <button type="submit" class="btn btn-primary btn-block" id="sp-submit">${isRecovery ? 'Reset password' : 'Continue'}</button>
          </form>
        </div>
      </section>
    </div>`;
}

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'set-password') return;
  e.preventDefault();

  const pw = document.getElementById('sp-pw').value;
  const pw2 = document.getElementById('sp-pw2').value;
  if (pw.length < 8) return toast('Password must be at least 8 characters.');
  if (pw !== pw2) return toast('Passwords don\'t match.');

  const btn = document.getElementById('sp-submit');
  const idleLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    await completeCollaboratorPasswordSetup(pw);
  } catch (err) {
    toast(`Couldn't set your password: ${err.message}`);
    btn.disabled = false;
    btn.textContent = idleLabel;
    return;
  }
  location.hash = '#/';
  window.__aqbba_render();
});
