/* ==========================================================================
   Sign-in gate. The only surface outside the member wall.
   Authentication is delegated to Wild Apricot; this simulates the handoff.
   ========================================================================== */

import { apiaries, queenLines, members } from '../data.js';
import { signIn, signInWithPassword, loadSignedInMember, requestPasswordReset } from '../store.js';
import { brandMark, icons, toast, modal, closeModal } from '../ui.js';
import { isConfigured, startWildApricotLogin } from '../waAuth.js';

/* A field of hexes drawn behind the headline. Pointy-top cells tile at
   three-quarter vertical pitch with alternate rows shifted half a cell,
   which is how comb actually interlocks. */
function combBackdrop() {
  const cols = 12, rows = 10, w = 40, h = 46;
  let out = '';
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * w + (r % 2 ? w / 2 : 0);
      const y = r * h * 0.75;
      const pts = [
        [x + w / 2, y], [x + w, y + h * 0.25], [x + w, y + h * 0.75],
        [x + w / 2, y + h], [x, y + h * 0.75], [x, y + h * 0.25],
      ].map((p) => p.map((v) => v.toFixed(1)).join(' ')).join(', ');
      out += `<polygon points="${pts}" style="animation-delay:${(n * 8)}ms"/>`;
      n++;
    }
  }
  return `<svg class="gate-comb" viewBox="0 0 480 350" preserveAspectRatio="xMidYMid slice">${out}</svg>`;
}

export function renderGate() {
  const hiveCount = apiaries.reduce((s, a) => s + a.hives, 0);

  return `
    <div class="gate">
      <section class="gate-stage">
        ${combBackdrop()}

        <a class="gate-mark" href="#/">
          ${brandMark(44)}
          <span>AQBBA</span>
        </a>

        <div class="gate-headline">
          <h1 class="display">Science-driven <em>and</em> industry-focused.</h1>
          <p>
            The Australian Queen Bee Breeders Association runs a shared varroa sensitive
            hygiene program across three research apiaries. Members contribute queen lines,
            record assessments against a common protocol, and see every other member's
            results alongside their own.
          </p>
        </div>

        <dl class="gate-ticker">
          <div><dt>Research apiaries</dt><dd>${apiaries.length}</dd></div>
          <div><dt>Hives under assessment</dt><dd>${hiveCount}</dd></div>
          <div><dt>Queen lines</dt><dd>${queenLines.length}</dd></div>
          <div><dt>Contributing members</dt><dd>${members.length}</dd></div>
        </dl>
      </section>

      <section class="gate-form">
        <div class="gate-form-inner">
          <h2>Member sign in</h2>
          <p class="caption">
            Membership, renewals and billing are managed in Wild Apricot. Sign in with the
            same details you use there.
          </p>

          <button class="gate-sso" id="sso">
            <span class="gate-sso-badge">WA</span>
            <span>
              <strong>Continue with Wild Apricot</strong>
              <span>You'll return here once authorised</span>
            </span>
          </button>

          <div class="rule-or">or</div>

          <form id="creds" novalidate>
            <div class="field">
              <label for="email">Email</label>
              <input type="email" id="email" name="email" autocomplete="username"
                     placeholder="you@example.com">
            </div>
            <div class="field">
              <label for="pw">Password</label>
              <input type="password" id="pw" name="pw" autocomplete="current-password"
                     placeholder="••••••••">
            </div>
            <button type="button" id="forgot-password" class="caption"
                    style="display:block;margin:calc(var(--s3) * -1) 0 var(--s5);background:none;border:none;padding:0;text-decoration:underline;cursor:pointer">
              Forgot password?
            </button>
            <button type="submit" class="btn btn-primary btn-block" id="creds-submit">Sign in</button>
          </form>

          <div class="gate-hint">
            <strong>Beta.</strong> ${isConfigured() ? `
              "Continue with Wild Apricot" is fully wired to real sign-in. Every real
              member provisions with the plain Member role — roles are deliberately not
              derived from Wild Apricot Membership Level or Groups, since neither maps
              cleanly onto this site's roles. An admin assigns real roles afterward via
              the roles editor. The form above is for a direct (non–Wild Apricot) account
              — a Web Admin invites those from the Members page.
            ` : `
              Wild Apricot is not connected yet. Fill in a direct account's real
              email/password if one has been set up.
            `}
            Notification emails are sent for real.
          </div>
        </div>
      </section>
    </div>`;
}

/* "Forgot password?" — collects an email, then routing on what comes back
   from requestPasswordReset (js/store.js) is the whole point of this
   two-step modal: a Wild-Apricot-linked member never gets a reset email at
   all (see the forgot-password Edge Function's own header comment for why),
   they just get told to use Wild Apricot's own password reset instead. A
   direct/collaborator account — or an email that doesn't match anything —
   both just get the same "check your email" toast, so this can't be used to
   probe which emails have an account. */
function openForgotPasswordModal() {
  const body = `
    <p class="caption" style="margin-bottom:var(--s5)">
      Enter the email on your member record. If it's a direct sign-in account (not
      Wild Apricot), we'll email you a link to reset your password.
    </p>
    <div class="field">
      <label for="fp-email">Email</label>
      <input id="fp-email" type="email" required placeholder="you@example.com">
    </div>`;
  const actions = `
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-primary" id="fp-submit">Send reset link</button>`;
  const scrim = modal({ title: 'Reset your password', body, actions });
  const emailInput = scrim.querySelector('#fp-email');
  const submitBtn = scrim.querySelector('#fp-submit');

  submitBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast('Enter a valid email address.');
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';
    let result;
    try {
      result = await requestPasswordReset(email);
    } catch (err) {
      toast(`Couldn't process that: ${err.message}`);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send reset link';
      return;
    }
    closeModal();
    if (result.method === 'wildapricot') {
      openWildApricotPasswordModal();
    } else {
      toast('If that email has a direct sign-in account, a reset link has been sent to it.');
    }
  });
}

function openWildApricotPasswordModal() {
  const body = `
    <p>This account signs in through Wild Apricot, so its password can't be reset
    here. Use Wild Apricot's own "Forgot password" link to change it there, then
    come back and sign in the same way you always do — "Continue with Wild
    Apricot" above.</p>`;
  const actions = `<button class="btn btn-primary" data-close>Got it</button>`;
  modal({ title: 'Managed through Wild Apricot', body, actions });
}

/* Wire the gate after each render. Called from the shell's bindGlobal via DOM events. */
document.addEventListener('click', (e) => {
  if (e.target.closest('#forgot-password')) {
    openForgotPasswordModal();
    return;
  }

  if (e.target.closest('#sso')) {
    const btn = e.target.closest('#sso');

    if (isConfigured()) {
      /* A real client ID is set — actually leave the app and go to Wild
         Apricot's login page. This will redirect back with ?code=, which
         app.js's boot check picks up; there's just nothing yet that can
         finish the exchange (see waAuth.js). */
      startWildApricotLogin();
      return;
    }

    /* No client ID configured: keep the existing simulated handoff so the
       prototype demos the same as it always has. */
    btn.innerHTML = `
      <span class="gate-sso-badge">${icons.check}</span>
      <span><strong>Authorised</strong><span>Loading your member profile…</span></span>`;
    setTimeout(() => { signIn(); location.hash = '#/'; window.__aqbba_render(); }, 620);
  }
});

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'creds') return;
  e.preventDefault();

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('pw').value;

  if (!email || !password) {
    toast('Enter your email and password.');
    return;
  }

  const btn = document.getElementById('creds-submit');
  btn.disabled = true;
  btn.textContent = 'Signing in…';
  try {
    await signInWithPassword(email, password);
    await loadSignedInMember();
  } catch (err) {
    toast(`Sign-in failed: ${err.message}`);
    btn.disabled = false;
    btn.textContent = 'Sign in';
    return;
  }
  location.hash = '#/';
  window.__aqbba_render();
});
