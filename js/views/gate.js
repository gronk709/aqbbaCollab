/* ==========================================================================
   Sign-in gate. The only surface outside the member wall.
   Authentication is delegated to Wild Apricot; this simulates the handoff.
   ========================================================================== */

import { apiaries, queenLines, members } from '../data.js';
import { signIn } from '../store.js';
import { brandMark, icons, esc } from '../ui.js';
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
                     placeholder="you@example.com" value="pete@augfront.com">
            </div>
            <div class="field">
              <label for="pw">Password</label>
              <input type="password" id="pw" name="pw" autocomplete="current-password"
                     placeholder="••••••••" value="demo-access">
            </div>
            <button type="submit" class="btn btn-primary btn-block">Sign in</button>
          </form>

          <div class="gate-hint">
            <strong>Prototype.</strong> ${isConfigured() ? `
              "Continue with Wild Apricot" is fully wired to real sign-in. Membership
              level → role mapping is still a placeholder though
              (<code>supabase/functions/wildapricot-auth</code>'s
              <code>MEMBERSHIP_LEVEL_TO_ROLES</code>), so every real member currently
              signs in with just the Member role until AQBBA's actual level names are
              filled in. The form below still signs you in as
              <code>${esc(members[0].name)}</code> for quick testing without a real login.
            ` : `
              Wild Apricot is not connected yet, so any details in the form below sign you
              in as <code>${esc(members[0].name)}</code> — Web Admin, full
              access.
            `}
            Notification emails are shown on screen instead of being sent.
          </div>
        </div>
      </section>
    </div>`;
}

/* Wire the gate after each render. Called from the shell's bindGlobal via DOM events. */
document.addEventListener('click', (e) => {
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

document.addEventListener('submit', (e) => {
  if (e.target.id === 'creds') {
    e.preventDefault();
    signIn();
    location.hash = '#/';
    window.__aqbba_render();
  }
});
