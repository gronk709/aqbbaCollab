/* ==========================================================================
   Sign-in gate. The only surface outside the member wall.
   Authentication is delegated to Wild Apricot; this simulates the handoff.
   ========================================================================== */

import { signIn, signInWithPassword, loadSignedInMember, requestPasswordReset } from '../store.js';
import { brandMark, icons, toast, modal, closeModal } from '../ui.js';
import { isConfigured, startWildApricotLogin } from '../waAuth.js';

/* Shared by the markup below and the "Authorised" swap in the SSO click handler. */
const SSO_BADGE = 'tw:grid tw:size-8 tw:flex-none tw:place-items-center tw:rounded-md tw:bg-amber-wash tw:font-mono tw:text-xs tw:font-semibold tw:text-amber-deep';
const SSO_TITLE = 'tw:block tw:text-[13.5px] tw:font-semibold tw:text-propolis';
const SSO_SUB = 'tw:text-xs tw:leading-[1.6] tw:text-propolis-40';
const CAPTION = 'tw:text-[12.5px] tw:text-propolis-40';

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
      out += `<polygon class="tw:fill-none tw:stroke-[rgba(224,168,62,0.3)] tw:[stroke-width:0.7] tw:opacity-0 tw:animate-[cell-draw_1.1s_var(--ease-out)_forwards]" points="${pts}" style="animation-delay:${(n * 8)}ms"/>`;
      n++;
    }
  }
  return `<svg class="tw:absolute tw:inset-0 tw:z-1 tw:opacity-50" aria-hidden="true" viewBox="0 0 480 350" preserveAspectRatio="xMidYMid slice">${out}</svg>`;
}

/* stats is loadPublicStats()'s result — { apiaryCount, memberCount }, or
   null if that fetch failed (offline, CDN unreachable). Renders "—" for
   either count rather than a stale/misleading number in that case. */
export function renderGate(stats) {
  return `
    <div class="gate tw:grid tw:min-h-dvh tw:grid-cols-[1.05fr_0.95fr] tw:bg-comb tw:max-[860px]:grid-cols-1">
      <section class="tw:relative tw:flex tw:flex-col tw:justify-between tw:overflow-hidden tw:bg-propolis tw:px-12 tw:py-16 tw:text-comb tw:max-[860px]:min-h-[62vh] tw:max-[860px]:gap-12 tw:max-[860px]:px-6 tw:max-[860px]:py-8">
        <!-- warm light falling across the frame -->
        <div aria-hidden="true" class="tw:pointer-events-none tw:absolute tw:inset-0 tw:bg-[radial-gradient(120%_80%_at_78%_8%,rgba(224,168,62,0.26),transparent_62%)]"></div>
        ${combBackdrop()}

        <a class="tw:relative tw:z-2 tw:flex tw:items-center tw:gap-4" href="#/">
          ${brandMark(132)}
          <span class="tw:max-w-[26ch] tw:font-mono tw:text-[11px] tw:leading-normal tw:font-semibold tw:tracking-[0.04em] tw:uppercase">Australian Queen Bee Breeders Association (AQBBA)</span>
        </a>

        <div class="tw:relative tw:z-2">
          <h1 class="tw:max-w-[17ch] tw:font-display tw:text-[clamp(2.5rem,4.4vw,3.75rem)] tw:leading-[1.12] tw:font-normal tw:tracking-[-0.02em]">At the Heart of Every Thriving Colony Is a Great Queen Bee.</h1>
          <p class="tw:mt-6 tw:max-w-[48ch] tw:text-[14.5px] tw:leading-[1.65] tw:text-comb/60">
            This is a collaboration website for the Australian Queen Bee Breeders Association
            and its partners involved in queen bee breeding initiatives and projects that promote the
            skills, knowledge and quality of outcomes for our industry.
          </p>
        </div>

        <dl class="tw:relative tw:z-2 tw:flex tw:flex-wrap tw:gap-x-12 tw:gap-y-6 tw:font-mono tw:max-[860px]:grid tw:max-[860px]:grid-cols-2 tw:max-[860px]:gap-x-4">
          <div><dt class="tw:text-[10.5px] tw:tracking-[0.12em] tw:uppercase tw:text-comb/40">Research apiaries</dt><dd class="tw:mt-1 tw:ml-0 tw:text-2xl tw:leading-[1.6] tw:text-comb tw:max-[860px]:text-[1.375rem]">${stats ? stats.apiaryCount : '—'}</dd></div>
          <div><dt class="tw:text-[10.5px] tw:tracking-[0.12em] tw:uppercase tw:text-comb/40">Contributing members</dt><dd class="tw:mt-1 tw:ml-0 tw:text-2xl tw:leading-[1.6] tw:text-comb tw:max-[860px]:text-[1.375rem]">${stats ? stats.memberCount : '—'}</dd></div>
        </dl>
      </section>

      <section class="tw:flex tw:flex-col tw:justify-center tw:px-[clamp(1.5rem,6vw,6rem)] tw:py-16 tw:max-[860px]:px-6 tw:max-[860px]:py-12">
        <div class="tw:mx-auto tw:w-full tw:max-w-[360px]">
          <h2 class="tw:mb-2 tw:font-display tw:text-[1.75rem] tw:text-propolis">Member sign in</h2>
          <p class="tw:mb-8 ${CAPTION}">
            Membership, renewals and billing are managed in Wild Apricot. Sign in with the
            same details you use there.
          </p>

          <button class="tw:flex tw:w-full tw:cursor-pointer tw:items-center tw:gap-3 tw:rounded-lg tw:border tw:border-comb-shade tw:bg-white tw:px-4 tw:py-3 tw:text-left tw:transition tw:duration-200 tw:hover:border-amber tw:hover:ring-[3px] tw:hover:ring-amber-wash" id="sso">
            <span class="${SSO_BADGE}">WA</span>
            <span class="tw:text-xs tw:leading-[1.6]">
              <strong class="${SSO_TITLE}">Continue with Wild Apricot</strong>
              <span class="${SSO_SUB}">You'll return here once authorised</span>
            </span>
          </button>

          <div class="tw:my-6 tw:flex tw:items-center tw:gap-3 tw:font-mono tw:text-[10px] tw:tracking-[0.14em] tw:uppercase tw:text-propolis-40 tw:before:h-px tw:before:flex-1 tw:before:bg-comb-shade tw:before:content-[''] tw:after:h-px tw:after:flex-1 tw:after:bg-comb-shade tw:after:content-['']">or</div>

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
            <button type="button" id="forgot-password" class="tw:-mt-3 tw:mb-6 tw:block tw:cursor-pointer tw:border-0 tw:bg-transparent tw:p-0 tw:underline tw:transition tw:hover:text-amber-deep ${CAPTION}">
              Forgot password?
            </button>
            <button type="submit" class="btn btn-primary btn-block" id="creds-submit">Sign in</button>
          </form>
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
    <p class="tw:mb-6 ${CAPTION}">
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
      <span class="${SSO_BADGE}">${icons.check}</span>
      <span class="tw:text-xs tw:leading-[1.6]"><strong class="${SSO_TITLE}">Authorised</strong><span class="${SSO_SUB}">Loading your member profile…</span></span>`;
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
