/* Account control for STRIVE: the /?account panel.
 *
 * What a signed-in person can do here, and only here:
 *   edit the chosen handle and display name (profile id never changes),
 *   see which sign-in methods are linked to the shared Auth user, link a supported one, unlink
 *   any but the last, sign out of this browser only, and delete the STRIVE profile with a
 *   typed confirmation that says what goes and what stays.
 * What it recovers from: a provider round trip that was cancelled, failed or expired, and a
 * sign-in that was started and never finished. The draft a person was posting stays put.
 *
 * Presentation only. Every write goes through site/auth.js, every rule is enforced by the
 * strava schema and Supabase Auth. Origin repository availability is shown separately from sign-in methods.
 */
window.GrinderAccount = function ({
  auth,
  me,
  authGeneration,
  app,
  frame,
  status,
  providersEnabled,
  origin,
  onProfileChange,
  signIn,
  onDeleted,
}) {
  const esc = (x) =>
    String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const byId = (id) => document.getElementById(id);
  const enabled = () => (Array.isArray(providersEnabled) ? providersEnabled : ["github", "email"]);
  const label = (provider) => (window.GrinderAuth?.providers || []).find((p) => p.id === (provider === "twitter" ? "x" : provider))?.label || provider;
  const present = (p) => (window.GrinderAuth ? window.GrinderAuth.present(p) : null);
  const mount = () => (typeof app === "function" ? app() : app) || byId("app");
  const say = (m, bad) => { if (typeof status === "function") status(m, bad); };
  const DRAFT_KEY = "ag_import";
  const hasDraft = () => { try { return !!sessionStorage.getItem(DRAFT_KEY); } catch (_) { return false; } };
  // A provider always sends the browser back to the site root. The shell reports the outcome
  // there; the panel repeats it once with a retry, so opening Account after a failure explains it.
  const RECOVERED_KEY = "ag_auth_recovered";
  // It stays until dismissed, contradicted by a later sign-in or link, or the person moves on
  // to another page, so the shell's second route pass on load does not swallow it.
  const keepRecovered = (r) => { try { sessionStorage.setItem(RECOVERED_KEY, JSON.stringify(r)); } catch (_) {} };
  const peekRecovered = () => { try { const v = sessionStorage.getItem(RECOVERED_KEY); return v ? JSON.parse(v) : null; } catch (_) { return null; } };
  const dropRecovered = () => { try { sessionStorage.removeItem(RECOVERED_KEY); } catch (_) {} };
  const settled = (r, user, ids) => !!r && (r.action === "link" ? (ids || []).some((i) => i.provider === r.provider) : !!user);
  // Deleting signs the browser out, and the shell re-routes on SIGNED_OUT. The confirmation
  // survives that re-render through a one-shot marker instead of racing it.
  const DELETED_KEY = "ag_account_deleted";
  const takeDeleted = () => { try { const v = sessionStorage.getItem(DELETED_KEY); sessionStorage.removeItem(DELETED_KEY); return !!v; } catch (_) { return false; } };

  function recoveryHtml(recovered, pend, user) {
    const draft = hasDraft() ? " The run you were about to post is still in this browser." : "";
    if (recovered) {
      const what = recovered.action === "link" ? "Linking " + label(recovered.provider) : "Sign-in" + (recovered.provider ? " with " + label(recovered.provider) : "");
      return `<section class="account-notice" role="status" aria-live="polite"><p><strong>${esc(what)} did not finish.</strong> ${esc(recovered.message)}${esc(draft)}</p><div class="account-actions">${
        recovered.retry && !user ? `<button type="button" id="account-retry" class="act blue">Try signing in again</button>` : ""
      }<button type="button" id="account-dismiss" class="act">Dismiss</button></div></section>`;
    }
    if (pend && !user) {
      const what = pend.action === "link" ? "Linking " + label(pend.provider) : "Sign-in with " + label(pend.provider);
      const how = pend.provider === "email" ? " The link in that email signs you in when opened in this browser." : " Nothing changed.";
      return `<section class="account-notice" role="status" aria-live="polite"><p><strong>${esc(what)} was started and has not finished.</strong>${esc(how)}${esc(draft)}</p><div class="account-actions"><button type="button" id="account-retry" class="act blue">Try again</button><button type="button" id="account-dismiss" class="act">Dismiss</button></div></section>`;
    }
    return "";
  }

  function deletedHtml() {
    return `<section class="account-notice" role="status" aria-live="polite"><p><strong>Your __BRAND__ profile was deleted.</strong> Your sign-in account and any Agent Grinder profile were left as they were. You are signed out of this browser.</p></section>`;
  }
  function signedOutHtml(recovered, pend, deleted) {
    return `<section class="account card pad" id="account-body"><h1>Settings</h1>${deleted ? deletedHtml() : recoveryHtml(recovered, pend, null)}
      <p>Sign in to edit your handle, manage the sign-in methods on your account, or delete your __BRAND__ profile.</p>
      <div class="account-actions"><button type="button" id="account-signin">Sign in</button><a class="act" href="/?example">Try the bundled example first</a></div>
      <p class="account-hint">Signing in never posts a run. Your email stays off your public profile.</p></section>`;
  }

  function identitiesHtml(ids) {
    const only = ids.length < 2;
    const rows = ids.map((i) => {
      const who = i.provider === "email" ? i.email || "email link" : i.handle ? "@" + i.handle : i.name || "connected";
      const unlink = only
        ? `<span class="account-hint">Your only way to sign in. Link another before removing it.</span>`
        : `<button type="button" class="act" data-unlink="${esc(i.id)}" aria-label="Unlink ${esc(label(i.provider))}">Unlink</button>`;
      return `<li class="account-identity"><div><strong>${esc(label(i.provider))}</strong> <span class="account-hint">${esc(who)}</span></div>${unlink}</li>`;
    });
    const linked = new Set(ids.map((i) => i.provider === "twitter" ? "x" : i.provider));
    const offers = (window.GrinderAuth?.providers || [])
      .filter((p) => p.kind === "oauth" && !linked.has(p.id))
      .map((p) => {
        const provider = p.id === "x" && !enabled().includes("x") && enabled().includes("twitter") ? "twitter" : p.id;
        return enabled().includes(provider)
          ? `<button type="button" class="act" data-link="${esc(provider)}">Link ${esc(p.label)}</button>`
          : `<span class="account-hint">${esc(p.label)} sign-in is not available on this service yet. <a href="/?feedback">Ask for this connection</a>.</span>`;
      });
    return `<ul class="account-identities">${rows.join("") || '<li class="account-hint">No sign-in methods were returned. Reload to try again.</li>'}</ul>${
      offers.length ? `<div class="account-actions">${offers.join("")}</div>` : ""
    }<p class="account-hint">Linking adds another way into the same profile. It never merges two profiles. Origin repository access is separate from sign-in and is shown below.</p>`;
  }

  function panelHtml(profile, ids, recovered, pend, user) {
    const p = present(profile);
    return `<div class="account" id="account-body">${recoveryHtml(recovered, pend, user)}
      <section class="card pad account-section"><h1>Settings</h1>
        <p class="account-lead">Your STRIVE username is <a id="account-lead-handle" href="${esc(p.url)}">@${esc(p.handle)}</a>. Manage GitHub and X below as linked accounts; they do not change your STRIVE username.</p>
        <form id="account-profile" class="account-form" novalidate>
          <label for="account-name">Name</label>
          <input id="account-name" name="display_name" autocomplete="nickname" maxlength="60" value="${esc(profile.display_name || profile.name || "")}">
          <p class="account-hint">Shown beside your runs. It does not need to be unique.</p>
          <label for="account-handle">STRIVE username</label>
          <input id="account-handle" name="handle" autocomplete="username" maxlength="40" spellcheck="false" value="${esc(profile.handle || "")}" aria-describedby="account-handle-help">
          <p id="account-handle-help" class="account-hint">Unique on STRIVE. Letters, numbers, - or _. Your profile link uses this username.</p>
          <p id="account-profile-state" class="account-state" role="status" aria-live="polite"></p>
          <div class="account-actions"><button type="submit" id="account-save">Save</button></div>
        </form></section>
      <section class="card pad account-section" aria-labelledby="account-methods-title"><h2 id="account-methods-title">Linked accounts</h2>
        <div id="account-identities">${identitiesHtml(ids)}</div>
        <p id="account-identities-state" class="account-state" role="status" aria-live="polite"></p></section>
      ${origin ? origin.html({ signedIn: true }) : ""}
      <section class="card pad account-section" aria-labelledby="account-connect-title"><h2 id="account-connect-title">Connect an agent</h2>
        <p>One private upload credential for automatic runs. Advanced scopes stay on Agents.</p>
        <div class="account-actions"><a class="act blue" href="/?connect=auto">Open Connect</a><a class="act" href="/?agents">Advanced Agents</a></div></section>
      <section class="card pad account-section" aria-labelledby="account-signout-title"><h2 id="account-signout-title">Sign out on this device</h2>
        <p>Signs you out of __BRAND__ in this browser only. Other devices, and Agent Grinder if you use it with the same sign-in, stay signed in.</p>
        <div class="account-actions"><button type="button" class="act" id="account-signout">Sign out here</button></div></section>
      <section class="card pad account-section account-danger" id="danger" aria-labelledby="account-delete-title"><h2 id="account-delete-title">Delete your __BRAND__ profile</h2>
        <p><strong>Goes:</strong> this __BRAND__ profile, your posted runs, and the thanks and replies you gave or received here. Deleted work cannot be restored.</p>
        <p><strong>Stays:</strong> your sign-in account, your Agent Grinder profile and runs if you have one, and anything on your own computer.</p>
        <form id="account-delete" class="account-form" novalidate>
          <label for="account-confirm">Type your handle <strong id="account-confirm-handle">${esc(p.handle)}</strong> to confirm</label>
          <input id="account-confirm" autocomplete="off" spellcheck="false" aria-describedby="account-delete-state">
          <p id="account-delete-state" class="account-state" role="status" aria-live="polite"></p>
          <div class="account-actions"><button type="submit" id="account-delete-go" class="danger" disabled>Delete my __BRAND__ profile</button></div>
        </form></section></div>`;
  }

  function onboardingHtml(recovered, pend, user) {
    return `<section class="account card pad" id="account-body">${recoveryHtml(recovered, pend, user)}<h1>Settings</h1><p>You are signed in but have no __BRAND__ profile yet. Create one to post runs and follow friends.</p><div class="account-actions"><a class="act blue" href="/">Create your profile</a><button type="button" class="act" id="account-signout">Sign out here</button></div></section>`;
  }

  async function view() {
    const root = mount();
    if (!root) return;
    const profileId=typeof me==='function'?me()?.id:null;
    const generation=typeof authGeneration==='function'?authGeneration():null;
    const isCurrent=()=>profileId===(typeof me==='function'?me()?.id:null)
      && generation===(typeof authGeneration==='function'?authGeneration():null);
    if (typeof frame === "function") frame(null, null);
    if (!auth) {
      root.innerHTML = '<section class="account card pad"><h1>Settings</h1><p>Settings are unavailable. Reload the page.</p></section>';
      return;
    }
    const fromUrl = auth.recoverFromUrl();
    if (fromUrl) keepRecovered(fromUrl);
    let recovered = fromUrl || peekRecovered();
    const pend = auth.pending();
    const deleted = takeDeleted();
    let current;
    try { current = await auth.current(); }
    catch (e) { if(!isCurrent())return;root.innerHTML = signedOutHtml(recovered, pend, deleted); say(e.detail?.message || "Sign-in could not be restored. Try again.", true); wireSignedOut(); return; }
    if(!isCurrent())return;
    if (!current.user) { root.innerHTML = signedOutHtml(recovered, pend, deleted); wireSignedOut(); return; }
    // The stored session is a snapshot; the linked-method list is read from Auth each time.
    let ids = current.identities || [];
    try { ids = await auth.identities(); } catch (_) {}
    if(!isCurrent())return;
    // A later successful sign-in or link makes an old failure notice wrong. Drop it.
    if (settled(recovered, current.user, ids)) { dropRecovered(); recovered = null; }
    if (!current.profile) { root.innerHTML = onboardingHtml(recovered, pend, current.user); wireCommon(); return; }
    let profile = current.profile;
    // A GitHub or X identity on the Auth user fills the matching profile column once, if empty.
    const wantsSync = ids.some((i) => (i.provider === "github" && !profile.github_handle) || ((i.provider === "x" || i.provider === "twitter") && !profile.x_handle));
    if (wantsSync) {
      try { profile = (await (auth.syncProviderHandles || auth.syncGithubHandle)()) || profile; if(!isCurrent())return;if (typeof onProfileChange === "function") onProfileChange(profile); } catch (_) {}
    }
    if(!isCurrent())return;
    root.innerHTML = panelHtml(profile, ids, recovered, pend, current.user);
    wireCommon();
    wirePanel(profile);
    origin?.mount?.(root, { signedIn: true });
    if (location.hash === "#danger") byId("danger")?.scrollIntoView();
  }

  function wireSignedOut() {
    byId("account-signin")?.addEventListener("click", () => start());
    byId("account-retry")?.addEventListener("click", () => start());
    byId("account-dismiss")?.addEventListener("click", () => { auth.clearPending(); dropRecovered(); view(); });
  }
  function wireCommon() {
    byId("account-retry")?.addEventListener("click", () => start());
    byId("account-dismiss")?.addEventListener("click", () => { auth.clearPending(); dropRecovered(); view(); });
    byId("account-signout")?.addEventListener("click", signOut);
  }
  function start() {
    if (typeof signIn === "function") return signIn();
    say("Sign-in is unavailable. Reload the page.", true);
  }
  async function signOut() {
    const b = byId("account-signout"); if (b) b.disabled = true;
    try { await auth.signOutLocal(); location.assign("/"); }
    catch (e) { say(e.detail?.message || "Sign-out failed. Try again.", true); if (b) b.disabled = false; }
  }

  // Duplicate handles are refused by the database. Offer a free variant instead of a dead end.
  async function freeVariant(handle) {
    for (let n = 2; n <= 6; n++) {
      const candidate = (handle.slice(0, 40 - String(n).length - 1) + "-" + n).replace(/-+/g, "-");
      try { if (!(await auth.byHandle(candidate))) return candidate; } catch (_) { return null; }
    }
    return null;
  }
  function setInvalid(input, stateEl, message, ok) {
    if (input) { input.setAttribute("aria-invalid", ok ? "false" : "true"); if (!ok) input.focus(); }
    if (stateEl) { stateEl.textContent = message || ""; stateEl.classList.toggle("err", !ok && !!message); }
  }

  function wirePanel(profile) {
    const form = byId("account-profile"), handleIn = byId("account-handle"), nameIn = byId("account-name"), state = byId("account-profile-state"), save = byId("account-save");
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = window.GrinderAuth.validateHandle(handleIn.value);
      if (!v.ok) return setInvalid(handleIn, state, v.message, false);
      const nameValue = String(nameIn.value || "").trim();
      if (!nameValue || nameValue.length > 60) return setInvalid(nameIn, state, "Display name must be 1 to 60 characters.", false);
      const patch = {};
      if (v.handle !== String(profile.handle || "")) patch.handle = v.handle;
      if (nameValue !== String(profile.display_name || profile.name || "")) patch.display_name = nameValue;
      if (!Object.keys(patch).length) return setInvalid(null, state, "Nothing to save.", true);
      save.disabled = true;
      try {
        const next = await auth.updateProfile(patch);
        profile = next;
        setInvalid(handleIn, state, "Saved. Your profile is at " + present(next).url, true);
        nameIn.setAttribute("aria-invalid", "false");
        const confirmLabel = byId("account-confirm-handle"); if (confirmLabel) confirmLabel.textContent = present(next).handle;
        byId("account-lead-handle")?.replaceChildren(document.createTextNode("@" + present(next).handle));
        if (typeof onProfileChange === "function") onProfileChange(next);
      } catch (err) {
        const d = err.detail || {};
        if (d.code === "handle_taken") {
          const alt = await freeVariant(v.handle);
          setInvalid(handleIn, state, alt ? "That handle is taken. " : d.message, false);
          if (alt) {
            const b = document.createElement("button"); b.type = "button"; b.className = "act"; b.id = "account-use-alt"; b.textContent = "Use " + alt;
            b.addEventListener("click", () => { handleIn.value = alt; setInvalid(handleIn, state, "", true); handleIn.focus(); });
            state.append(b);
          }
        } else if (d.code === "display_name_invalid") setInvalid(nameIn, state, d.message, false);
        else setInvalid(handleIn, state, d.message || "Your profile could not be saved. Try again.", false);
      } finally { save.disabled = false; }
    });

    const idState = byId("account-identities-state");
    byId("account-identities")?.addEventListener("click", async (e) => {
      const t = e.target.closest("button"); if (!t) return;
      if (t.dataset.link) {
        t.disabled = true; idState.textContent = "Opening " + label(t.dataset.link) + "…"; idState.classList.remove("err");
        try { sessionStorage.setItem("ag_social_return", "?account"); } catch (_) {} // the shell brings a signed-in person back here
        try { await auth.link(t.dataset.link, { returnTo: "?account" }); }
        catch (err) { idState.textContent = err.detail?.message || "Linking could not start. Try again."; idState.classList.add("err"); t.disabled = false; }
        return;
      }
      if (t.dataset.unlink) {
        t.disabled = true; idState.textContent = ""; idState.classList.remove("err");
        try {
          await auth.unlink(t.dataset.unlink);
          const ids = await auth.identities();
          byId("account-identities").innerHTML = identitiesHtml(ids);
          idState.textContent = "Unlinked. You can still sign in with what is left.";
        } catch (err) { idState.textContent = err.detail?.message || "That sign-in method could not be removed."; idState.classList.add("err"); t.disabled = false; }
      }
    });

    const confirmIn = byId("account-confirm"), go = byId("account-delete-go"), delState = byId("account-delete-state");
    const expected = () => present(profile).handle.toLowerCase();
    const check = () => { go.disabled = String(confirmIn.value || "").trim().toLowerCase().replace(/^@/, "") !== expected(); };
    confirmIn?.addEventListener("input", check); check();
    byId("account-delete")?.addEventListener("submit", async (e) => {
      e.preventDefault(); check(); if (go.disabled) { setInvalid(confirmIn, delState, "Type your handle exactly to confirm.", false); return; }
      go.disabled = true; delState.textContent = "Deleting…"; delState.classList.remove("err");
      try {
        try { sessionStorage.setItem(DELETED_KEY, "1"); } catch (_) {}
        const r = await auth.deleteProfile();
        if (typeof onProfileChange === "function") onProfileChange(null);
        if (typeof onDeleted === "function") return onDeleted(r);
        root_after_delete();
      } catch (err) {
        try { sessionStorage.removeItem(DELETED_KEY); } catch (_) {} setInvalid(confirmIn, delState, err.detail?.message || "Your profile could not be deleted. Try again.", false); go.disabled = false; }
    });
  }

  function root_after_delete() {
    const root = mount(); if (!root) return;
    root.innerHTML = '<section class="account card pad" id="account-body"><h1>Settings</h1>' + deletedHtml() + '<div class="account-actions"><a class="act blue" href="/">Back to the feed</a></div></section>';
    try { sessionStorage.setItem(DELETED_KEY, "1"); } catch (_) {} // the shell's SIGNED_OUT re-route reads it once
  }

  // For the page shell: report a failed or cancelled round trip on any route and keep the draft.
  function recover() {
    if (!auth) return null;
    if (new URLSearchParams(location.search).has("account")) return null; // the panel reports it inline
    const r = auth.recoverFromUrl();
    if (!r) { dropRecovered(); return null; } // moved on without opening Account: the notice has been seen
    keepRecovered(r);
    let backToAccount = false;
    try { backToAccount = sessionStorage.getItem("ag_social_return") === "?account"; } catch (_) {}
    // Signed in, the shell reopens Account next and the panel shows the notice; signed out it
    // stays on the landing page, so the status line is the only place the outcome is said.
    if (backToAccount && typeof me === "function" && me()) return r;
    const draft = hasDraft() ? " Your draft is still here: open Post a run to continue." : "";
    say(r.message + draft, true);
    return r;
  }

  return { view, recover, identitiesHtml, panelHtml };
};
