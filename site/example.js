/* Bundled public-safe example: coach → one experiment → freeze → return → share → second builder.
   Local fixture state only. Not live users, not live Bedrock, not autonomous reasoning. */
(function (root) {
  "use strict";
  const KEY = "ag_example_journey";
  const esc = (x) =>
    String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (id) => document.getElementById(id);
  function loadState() {
    try {
      return JSON.parse(sessionStorage.getItem(KEY) || "null") || {};
    } catch (_) {
      return {};
    }
  }
  function saveState(s) {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(s));
    } catch (_) {}
  }
  function modeBanner(data) {
    return `<p class="mode-banner demo" role="status"><strong>Deterministic demo</strong> · ${esc(data.mode)}. ${esc(data.not)} Fixture: ${esc(data.label)}.</p>`;
  }
  function counts(run) {
    return `<div class="run-key-facts"><div><span>Typed turns · cost</span><strong>${run.turns_typed ?? run.prompts ?? "Unknown"}</strong></div><div><span>Verified claims</span><strong>${run.claims_verified ?? "Unknown"}</strong></div><div><span>Artifacts</span><strong>${run.artifacts_produced ?? "Unknown"}</strong></div><div><span>Commits</span><strong>${run.commits ?? "Unknown"}</strong></div></div>`;
  }
  function comparison(before, after, observed) {
    const rows = [
      ["Typed turns · cost", before.turns_typed ?? before.prompts, after.turns_typed ?? after.prompts],
      ["Claims with evidence", before.claims_verified, after.claims_verified],
      ["Artifacts produced", before.artifacts_produced, after.artifacts_produced],
      ["Commits", before.commits, after.commits],
    ];
    return `<div class="comparison-status"><h2>Same fixture task, two labelled sittings</h2><p>Original measurements are kept. A different task or a missing field would be incomparable, not a personal best. ${esc(observed || "One useful observation is named below.")}</p></div>
      <div class="progress-pair"><article><small>Frozen baseline</small><h2>${esc(before.title)}</h2>${typeof GrinderContract === "object" ? GrinderContract.trace(before) : ""}<small>${esc(before.trace_basis || "")}</small></article>
      <article><small>Later sitting</small><h2>${esc(after.title)}</h2>${typeof GrinderContract === "object" ? GrinderContract.trace(after) : ""}<small>${esc(after.trace_basis || "")}</small></article></div>
      <div class="progress-metrics">${rows.map(([label, a, b]) => `<div class="progress-metric"><strong>${esc(label)}</strong><span>${a == null ? "Unknown" : esc(a)} → ${b == null ? "Unknown" : esc(b)}</span><small>${a == null || b == null ? "Not compared" : "later minus earlier = " + esc(b - a)}</small></div>`).join("")}</div>`;
  }
  async function fetchExample() {
    const res = await fetch("/bundled-example.json", { cache: "no-store" });
    if (!res.ok) throw Error("The bundled example could not load.");
    return res.json();
  }
  async function view() {
    const app = $("app");
    if (typeof frame === "function") frame(null, null);
    if (typeof setPrimarySection === "function") setPrimarySection("feed");
    app.innerHTML = '<p class="hint">Loading the bundled example…</p>';
    let data;
    try {
      data = await fetchExample();
    } catch (e) {
      app.innerHTML = `<div class="card"><h2>Bundled example unavailable</h2><p>${esc(e.message)}</p><p>Bring your own run stays private: <a href="/?onboard">local import</a>.</p></div>`;
      return;
    }
    const state = loadState();
    const run = data.run;
    const exp = state.experiment || run.coach_experiment;
    const step = state.step || "coach";
    const tools = (data.tools || [])
      .map(
        (t, i) =>
          `<div class="step${step !== "coach" || state.played ? " done" : ""}" data-s="${i}"><span class="i"></span><span class="n">${esc(t.name)}</span><span class="o">${esc(
            t.name === "check_claim"
              ? t.result.verified
                ? "evidence in the same turn"
                : "no matching evidence in that turn"
              : t.name === "verify_artifact"
                ? t.result.exists
                  ? t.result.label + " exists"
                  : t.result.label + " missing"
                : t.name === "git_evidence"
                  ? t.result.asked
                    ? "git asked"
                    : t.result.reason || "git not asked"
                  : t.result.turns_typed != null
                    ? t.result.turns_typed + " typed turns, " + (t.result.claims || []).length + " claims"
                    : "recorded",
          )}</span></div>`,
      )
      .join("");
    const freezeForm =
      step === "experiment" || (step === "coach" && state.played)
        ? `<form id="ex-accept" class="panel reply-form"><h2>One experiment for the next sitting</h2>
        <p class="hint">Accept or edit. Freezing keeps the original measurements on this fixture. Nothing is uploaded.</p>
        <label>What will you do?<input name="title" required maxlength="160" value="${esc(exp.title)}"></label>
        <label>How, exactly?<textarea name="instruction" required maxlength="4000">${esc(exp.instruction)}</textarea></label>
        <label>What would change your mind?<textarea name="expected" required maxlength="2000">${esc(exp.expected)}</textarea></label>
        <button type="submit">Freeze this fixture as my baseline</button></form>`
        : "";
    const frozen =
      step === "frozen" || step === "return" || step === "moment" || step === "adopt" || step === "second-return"
        ? `<section class="return-brief panel"><p class="meta">BASELINE FROZEN · BUNDLED FIXTURE</p><h3>Your experiment is saved on this fixture sitting</h3><p><strong>${esc(state.experiment?.title || exp.title)}</strong></p><p>${esc(state.experiment?.instruction || exp.instruction)}</p><p>Expected: ${esc(state.experiment?.expected || exp.expected)}</p>${step === "frozen" ? '<button id="ex-later" type="button">Return with the later labelled sitting</button>' : ""}</section>`
        : "";
    const returned =
      step === "return" || step === "moment" || step === "adopt" || step === "second-return"
        ? `<section class="panel">${comparison(run, data.later, data.later.observed)}
        ${
          state.review
            ? `<p><strong>Your decision: ${esc(state.review.decision)}</strong> · ${esc(state.review.note)}</p>`
            : `<form id="ex-review" class="reply-form"><h2>Keep, change, drop, or incomparable</h2>
          <label>Did you try it?<select name="tried"><option value="true">Yes, on this later fixture</option><option value="false">No</option></select></label>
          <label>Decision<select name="decision"><option value="keep">Keep</option><option value="change">Change</option><option value="drop">Drop</option><option value="incomparable">Incomparable / missing evidence</option></select></label>
          <label>One useful observed outcome<textarea name="note" required maxlength="4000" placeholder="Name what you saw. A score change alone is not the payoff."></textarea></label>
          <p>This does not establish that the experiment caused the difference. Different task difficulty would make this incomparable.</p>
          <button>Save this review</button></form>`
        }</section>`
        : "";
    const moment =
      state.review && (step === "return" || step === "moment" || step === "adopt" || step === "second-return")
        ? `<section class="panel reply-form"><p class="meta">SHARE A MOMENT</p><h2>Show the bit another builder can try</h2>
        ${
          state.moment
            ? `<article><h3>${esc(state.moment.title)}</h3><p>${esc(state.moment.claim)}</p><p><strong>Limit:</strong> ${esc(state.moment.limitation)}</p><p><strong>Next:</strong> ${esc(state.moment.next)}</p><p class="hint">Reviewed for sharing. Excerpt only; no transcript. Fixture audience is public-safe.</p>${step === "moment" ? '<button id="ex-as-reader" type="button">Open as another builder (fixture role)</button>' : ""}</article>`
            : `<form id="ex-moment"><label>Moment title<input name="title" required maxlength="100" value="Named test in the same turn"></label>
          <label>What happened?<textarea name="claim" required maxlength="1000">${esc(state.review.note)}</textarea></label>
          <label>Exact excerpt<textarea name="excerpt" required maxlength="3000">check_claim on test_draft_renders: verified in the later sitting. Commits still 0.</textarea></label>
          <label>What this does NOT establish<textarea name="limitation" required maxlength="1000">One labelled fixture pair, not adoption, not productivity, not a live model.</textarea></label>
          <label>One change for their next grind<input name="next" required maxlength="160" value="${esc(state.experiment?.title || exp.title)}"></label>
          <label><input name="consent" type="checkbox" required> I reviewed these fields. The excerpt is what will be shared.</label>
          <button>Save moment on this fixture</button></form>`
        }</section>`
        : "";
    const adopt =
      step === "adopt" || step === "second-return"
        ? `<section class="panel reply-form"><p class="meta">SECOND BUILDER · FIXTURE ROLE</p><h2>Keep the technique on your own baseline</h2>
        <p>The author's counts are not shown beside yours. Your frozen grind is the reader fixture, not theirs.</p>
        ${
          state.adopted
            ? `<p>Practice kept on <strong>${esc(data.reader.title)}</strong>. Nothing was written to the author's grind.</p>${step === "adopt" ? '<button id="ex-reader-later" type="button">Return with your own later fixture</button>' : ""}`
            : `<form id="ex-adopt"><label>One change<input name="action" required maxlength="160" value="${esc(state.moment?.next || exp.title)}"></label>
          <label>What would you look for?<textarea name="expected" required maxlength="2000">${esc(exp.expected)}</textarea></label>
          <p>Baseline: ${esc(data.reader.title)} · ${esc(data.reader.measurement_revision.slice(0, 12))}…</p>
          <label><input name="consent" type="checkbox" required> Keep this practice on my fixture account. Nothing is sent to the author.</label>
          <button>Keep this practice</button></form>`
        }</section>`
        : "";
    const second =
      step === "second-return"
        ? `<section class="panel">${comparison(data.reader, data.readerLater, data.readerLater.observed)}
        ${
          state.secondReview
            ? `<p><strong>Second builder decision: ${esc(state.secondReview.decision)}</strong> · ${esc(state.secondReview.note)}</p>
            <p class="hint">Audience revocation on the source would hide the author's excerpt here and keep this person's own baseline, review and outcome. This demo does not leak revoked source text.</p>
            <div class="cta"><a class="act" href="/?example=share">Share my outcome</a><a href="/?onboard">Bring my own run</a></div>`
            : `<form id="ex-second"><label>Decision<select name="decision"><option value="keep">Keep</option><option value="change">Change</option><option value="drop">Drop</option><option value="incomparable">Incomparable</option></select></label>
          <label>Your observed outcome<textarea name="note" required maxlength="4000"></textarea></label>
          <button>Save my outcome</button></form>`
        }</section>`
        : "";
    const live = `<details class="panel"><summary class="pad">Live Amazon Bedrock (not this demo)</summary>
      <p>${esc(data.live.note)}</p><ul>${data.live.needs.map((n) => `<li><code>${esc(n.id)}</code> — ${esc(n.need)}</li>`).join("")}</ul>
      <p>Check this machine without starting a live run:</p>
      <div class="cmd"><span class="c">${esc(data.live.command)}</span></div>
      <p class="hint">If anything is missing, that command prints the exact item. It will not invent a live review.</p></details>`;
    const byo = `<section class="panel"><div class="pad"><h2>Bring your own sitting</h2><p>Supported Claude Code, Cursor or Codex transcripts stay on your machine. Import starts <strong>private</strong>. You review counts and coach notes before anything is public.</p>
      <div class="cmd"><span class="c">${typeof INSTALL_CMD === "string" ? INSTALL_CMD : "python3 -m agentgrinder grind"}</span></div>
      <p class="hint">Then <code>python3 -m agentgrinder grind --push</code> opens a preview. Default audience is only you.</p>
      <a href="/?onboard">Local import instructions</a></section>`;

    app.innerHTML = `<section class="landing-intro"><p class="meta">I TRIED THIS. SHOW ME WHAT CHANGED.</p>
      <h1>One sitting. One experiment.</h1>
      <p>A stranger can finish this labelled fixture without an account. Your own run stays private until you say otherwise.</p></section>
      ${modeBanner(data)}
      <div class="card"><div class="runtop"><div class="who"><span>${esc(run.title)}</span><small>${esc(data.label)} · ${esc(globalThis.StriveAgents?.agentName(run.harness)||run.harness)} · private fixture</small></div>
        <span class="state" title="${esc(data.not)}">Demo coach</span></div>
        ${counts(run)}
        <p class="para">${esc(run.coach_verdict)}</p>
        <div class="check" id="check"><div class="check-top"><span class="t">Coach tools on this fixture</span><span class="s" id="st">${step === "coach" && !state.played ? "reading" : "recorded"}</span></div>${tools}</div>
        <article class="experiment-card"><p class="meta">SUPPORTED FRICTION</p><h2>${esc(exp.friction)}</h2>
          <p>${esc(exp.consequence)}</p>
          <p><small>Source: ${esc(exp.evidence)}</small></p>
          <p class="rule-line"><strong>Experiment:</strong> ${esc(exp.instruction)}</p>
          <p><strong>Look for:</strong> ${esc(exp.expected)}</p></article>
      </div>
      ${freezeForm}${frozen}${returned}${moment}${adopt}${second}${live}${byo}
      <p class="hint"><a href="/">Back</a> · <button class="ghost" id="ex-reset" type="button">Reset this fixture</button></p>`;

    if (step === "coach" && !state.played) {
      const steps = [...app.querySelectorAll("#check .step")];
      steps.forEach((el, i) =>
        setTimeout(() => {
          el.classList.add("done");
          const st = $("st");
          if (st) st.textContent = i === steps.length - 1 ? "verdict written from tool results" : el.querySelector(".n").textContent;
          if (i === steps.length - 1) {
            state.played = true;
            saveState(state);
            view();
          }
        }, 280 + i * 420),
      );
    }
    const accept = $("ex-accept");
    if (accept)
      accept.onsubmit = (e) => {
        e.preventDefault();
        const f = accept.elements;
        saveState({
          ...state,
          step: "frozen",
          experiment: { ...exp, title: f.title.value, instruction: f.instruction.value, expected: f.expected.value },
        });
        view();
      };
    const later = $("ex-later");
    if (later)
      later.onclick = () => {
        saveState({ ...state, step: "return" });
        view();
      };
    const review = $("ex-review");
    if (review)
      review.onsubmit = (e) => {
        e.preventDefault();
        const f = review.elements;
        saveState({
          ...state,
          step: "return",
          review: { tried: f.tried.value, decision: f.decision.value, note: f.note.value },
        });
        view();
      };
    const momentForm = $("ex-moment");
    if (momentForm)
      momentForm.onsubmit = (e) => {
        e.preventDefault();
        if (!momentForm.reportValidity()) return;
        const f = momentForm.elements;
        saveState({
          ...state,
          step: "moment",
          moment: { title: f.title.value, claim: f.claim.value, excerpt: f.excerpt.value, limitation: f.limitation.value, next: f.next.value },
        });
        view();
      };
    const asReader = $("ex-as-reader");
    if (asReader)
      asReader.onclick = () => {
        saveState({ ...state, step: "adopt" });
        view();
      };
    const adoptForm = $("ex-adopt");
    if (adoptForm)
      adoptForm.onsubmit = (e) => {
        e.preventDefault();
        if (!adoptForm.reportValidity()) return;
        saveState({ ...state, step: "adopt", adopted: true });
        view();
      };
    const readerLater = $("ex-reader-later");
    if (readerLater)
      readerLater.onclick = () => {
        saveState({ ...state, step: "second-return" });
        view();
      };
    const secondForm = $("ex-second");
    if (secondForm)
      secondForm.onsubmit = (e) => {
        e.preventDefault();
        const f = secondForm.elements;
        saveState({ ...state, step: "second-return", secondReview: { decision: f.decision.value, note: f.note.value } });
        view();
      };
    const reset = $("ex-reset");
    if (reset)
      reset.onclick = () => {
        try {
          sessionStorage.removeItem(KEY);
        } catch (_) {}
        view();
      };
  }
  async function viewShare() {
    const app = $("app");
    if (typeof frame === "function") frame(null, null);
    const state = loadState();
    if (!state.secondReview && !state.review) {
      app.innerHTML = '<p>Finish the bundled example review first. <a href="/?example">Open the example</a>.</p>';
      return;
    }
    const data = await fetchExample();
    const outcome = state.secondReview || state.review;
    if (typeof GrinderSharing === "object") {
      GrinderSharing.mount({
        run: {
          id: "example-outcome",
          title: "My fixture return",
          visibility: "private",
          harness: data.later.harness,
          turns_typed: (state.secondReview ? data.readerLater : data.later).turns_typed,
          artifacts_produced: (state.secondReview ? data.readerLater : data.later).artifacts_produced,
          rhythm: (state.secondReview ? data.readerLater : data.later).rhythm,
          trace_basis: data.later.trace_basis,
        },
        slot: app,
        status: typeof status === "function" ? status : () => {},
        review: { decision: outcome.decision, tried: true },
      });
      const hint = document.createElement("p");
      hint.className = "hint";
      hint.textContent = "BUNDLED EXAMPLE · outcome export. Write the result you choose. Source author identity is not copied.";
      app.prepend(hint);
    }
  }
  /* /?example=tree: the orchestration tree sample, rendered through the same runCard as a real
     run. It is a preview: no ACK, no Discuss, no Share, and nothing can be saved from it. */
  async function viewTree() {
    const app = $("app");
    if (typeof frame === "function") frame(null, null);
    if (typeof setPrimarySection === "function") setPrimarySection("feed");
    app.innerHTML = '<p class="hint">Loading the tree sample…</p>';
    let data;
    try {
      const res = await fetch("/tree-sample.json", { cache: "no-store" });
      if (!res.ok) throw Error("The tree sample could not load.");
      data = await res.json();
    } catch (e) {
      app.innerHTML = `<div class="card"><h2>Tree sample unavailable</h2><p>${esc(e.message)}</p></div>`;
      return;
    }
    const run = Object.assign({ id: "tree-sample", profile_id: "sample", created_at: data.generated_on || new Date().toISOString(),
      profiles: { github_handle: "sample", handle: "sample", display_name: "Sample" } }, data.run || {}, { tree: data.tree || null });
    const tree = data.tree || {};
    const workers = Array.isArray(tree.children) ? tree.children : [];
    app.innerHTML = `<div class="head"><h2>Orchestration tree sample</h2><span class="meta">example data · redacted · not your activity</span></div>
      <p role="note">${esc(data.label || "Sample.")}</p>
      <div class="up"><div class="up-top"><span class="t">Read your own Cursor tree</span><span class="meta">local only</span></div>
        <div class="cmd"><span class="c">python3 -m agentgrinder.cursor_tree --list</span></div>
        <div class="up-foot">Lists every Cursor session that delegated to workers. Nothing leaves your machine. ${esc(data.cannot_show || "")}</div></div>
      ${typeof runCard === "function" ? runCard(run, false, 0, { preview: true }) : ""}
      <p class="hint">${workers.length} workers · source: ${esc(data.source || "unknown")}</p>`;
  }
  root.GrinderExample = { view, viewShare, viewTree, KEY };
})(window);
