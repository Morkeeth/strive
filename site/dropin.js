/* THE DROP-IN. The landing page's first step: drop a session file, see its card, get a link.
   No install and no account until the person chooses to post to the feed.

   1. The file is read here with GrinderDropin.parseFile (site/dropin-parse.js). No request is made
      while it is read or while the card is drawn.
   2. The card is the feed's card (site/feed-card.js), revealed once: the map draws in, then the
      line, the number counts up, the badge settles. The stride line on it gains the address once
      a link exists. This is a first-time moment, so it gets the delight budget,
      about 800 ms in all; with reduced motion it is a 200 ms fade and the final numbers.
   3. Then the post, step by step: Preview, Who sees it, Share. No audience is preselected, and
      nothing is sent before Share. "Anyone with the link" sends GrinderDropin.uploadPayload(run,
      title) and nothing else. Every other audience hands the same counts, and the chosen audience,
      to the existing import preview, which asks for sign-in. */
(function (root) {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]));
  const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
  const EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";
  const reduced = () => root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let run = null;
  let opts = {};

  function row(title) {
    return {
      id: "dropin", title: title || "", harness: run.harness, prompts: run.turns_typed, turns_typed: run.turns_typed,
      tool_calls: run.tool_calls, files_touched: run.files_touched, commits: run.commits, duration_s: run.duration_s,
      rhythm: run.line || run.rhythm, route: run.route || null, started_hour: GrinderDropin.uploadPayload(run, "").started_hour,
      // created_at is when the card is made, as on the shared page, so both say the same thing.
      started_at: run.started, created_at: new Date().toISOString(), visibility: "anonymous",
    };
  }

  let linkUrl = null;
  function cardHtml() {
    return GrinderFeed.card(row(($("drop-title") || {}).value || ""), { preview: true, foot: false, copy: true, url: linkUrl });
  }
  // The stride line follows the title and, once made, the link, without redrawing the card.
  function refreshStride() {
    const r = row(($("drop-title") || {}).value || "");
    const text = GrinderFeed.strideText(r, linkUrl);
    const pre = $("drop-card") && $("drop-card").querySelector(".fc-stride pre");
    // strideHtml escapes every value it prints; the markup is only the bars' monospace run.
    if (pre) pre.innerHTML = GrinderFeed.strideHtml(r, linkUrl);
    $("drop-card") && $("drop-card").querySelectorAll(".fc-copy").forEach((b) => { b.dataset.copy = text; });
  }

  // The reveal. WAAPI, transform/opacity/clip-path only, so it stays smooth while the page works.
  function reveal(host) {
    const card = host.querySelector(".fc");
    if (!card || !card.animate) return;
    if (reduced()) { card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease" }); return; }
    card.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: EASE_OUT });
    // The map first, left to right, then the line under it: the route, then the effort.
    const map = host.querySelector(".fc-map svg");
    if (map) map.animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }], { duration: 600, delay: 60, easing: EASE_IN_OUT, fill: "backwards" });
    const svg = host.querySelector(".fc-spark svg");
    if (svg) svg.animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }], { duration: 700, delay: map ? 240 : 80, easing: EASE_IN_OUT, fill: "backwards" });
    const strideBlock = host.querySelector(".fc-stride");
    if (strideBlock) strideBlock.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 700, easing: EASE_OUT, fill: "backwards" });
    const peak = host.querySelector(".fc-peak");
    if (peak) peak.animate([{ opacity: 0, transform: "scale(.6)" }, { opacity: 1, transform: "none" }], { duration: 220, delay: map ? 800 : 640, easing: EASE_OUT, fill: "backwards" });
    const badge = host.querySelector(".fc-badge");
    if (badge) badge.animate([{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: 260, delay: 520, easing: EASE_OUT, fill: "backwards" });
    const n = host.querySelector(".fc-n");
    const target = n && /^[\d,]+$/.test(n.textContent) ? Number(n.textContent.replace(/,/g, "")) : null;
    if (target) {
      const t0 = performance.now(), dur = 700, final = n.textContent;
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        n.textContent = p < 1 ? Math.round(target * eased).toLocaleString() : final;
        if (p < 1) requestAnimationFrame(tick);
      };
      // Screen readers get the final number, never a frame of the count.
      n.setAttribute("aria-label", final);
      n.textContent = "0";
      requestAnimationFrame(tick);
    }
  }

  function setError(message) {
    const e = $("drop-error");
    if (e) { e.textContent = message || ""; e.hidden = !message; }
  }

  async function read(file) {
    setError("");
    const zone = $("drop-zone"), progress = $("drop-progress");
    if (!file) return;
    if (/^image\//.test(file.type||"") || /\.(jpe?g|png|webp|gif|heic)$/i.test(file.name||"")) { setError("This picker reads a session file. Add photos after saving a run, or open an existing run in My runs."); return; }
    zone.classList.add("reading");
    const started = performance.now();
    try {
      run = await GrinderDropin.parseFile(file, (done, total) => {
        if (progress && total > 2e6) progress.textContent = `Reading ${Math.floor((done / total) * 100)}%`;
      });
    } catch (error) {
      zone.classList.remove("reading");
      if (progress) progress.textContent = "";
      run = null;
      setError(error && error.code ? error.message : "This file could not be read. Pick a .jsonl session file.");
      return;
    }
    zone.classList.remove("reading");
    root.__dropinTimings = { readMs: Math.round(performance.now() - started) };
    if (opts.privateFirst) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const prefix = new TextEncoder().encode("strive-browser-file-v1\0");
        const source = new Uint8Array(prefix.length + bytes.length);source.set(prefix);source.set(bytes,prefix.length);
        const digest = await crypto.subtle.digest("SHA-256",source);
        const measurement_revision = Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,"0")).join("");
        const metrics={schema_version:1,measurement_revision,harness:run.harness,
          turns_typed:run.turns_typed,tool_calls:run.tool_calls,files_touched:run.files_touched,
          started:typeof run.started==='string'?run.started:null,
          rhythm:run.line||run.rhythm,trace_basis:'position'};
        // The browser parser counts command mentions as commits and compresses idle gaps.
        // Neither proves successful commits or elapsed duration. Keep those fields unknown.
        GrinderContract.validate(metrics);
        const token=encodeURIComponent(btoa(JSON.stringify(metrics)));
        if(opts.post)opts.post(token);else location.href='/#import='+token;
      } catch(error) { run=null;setError(error?.message||"This session could not be prepared. Try the agent capture link."); }
      return;
    }
    showResult();
  }

  // THE POST, step by step (Oscar, 25 Sep: "a fun way to post, step by step, with micro animations
  // and loading state"). Capture is the drop. Then Preview, Who sees it, Share. Nothing leaves this
  // page before Share, and Share only runs after a choice: no audience is preselected.
  const STEPS = ["Capture", "Preview", "Who sees it", "Share"];
  const AUDIENCES = [
    { v: "private", t: "Only me", d: "Saved to your runs. Sign in to save." },
    { v: "link", t: "Followers", d: "People who follow you. Sign in to post." },
    { v: "public", t: "Everyone", d: "The feed and your profile. Sign in to post." },
    { v: "unlisted", t: "Anyone with the link", d: "No account. Not in the feed. Expires in 90 days." },
  ];
  let step = 1;

  function stepsHtml() {
    return `<ol class="post-steps" id="post-steps" aria-label="Post steps">${STEPS.map((n, i) =>
      `<li data-step="${i}"><span class="ps-dot" aria-hidden="true"></span><span class="ps-n">${esc(n)}</span></li>`).join("")}</ol>`;
  }
  function paintSteps() {
    document.querySelectorAll("#post-steps li").forEach((li) => {
      const i = Number(li.dataset.step);
      li.classList.toggle("done", i < step);
      li.classList.toggle("on", i === step);
      if (i === step) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
  }
  // One pane in, one pane out. Transform and opacity only; a plain swap with reduced motion.
  function go(next) {
    const back = next < step;
    step = next;
    paintSteps();
    document.querySelectorAll(".post-pane").forEach((pane) => {
      const on = Number(pane.dataset.pane) === step;
      pane.hidden = !on;
      if (on && pane.animate && !reduced())
        pane.animate([{ opacity: 0, transform: `translateX(${back ? -12 : 12}px)` }, { opacity: 1, transform: "none" }], { duration: 240, easing: EASE_OUT });
    });
    const focus = document.querySelector(`.post-pane[data-pane="${step}"] [data-autofocus]`);
    if (focus) focus.focus({ preventScroll: true });
  }
  function busy(button, text) {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.dataset.label = button.textContent;
    button.innerHTML = `<span class="spin" aria-hidden="true"></span>${esc(text)}`;
  }
  function idle(button) {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    if (button.dataset.label) button.textContent = button.dataset.label;
  }
  function chosen() {
    const c = document.querySelector('input[name="drop-aud"]:checked');
    return c ? c.value : null;
  }

  function showResult() {
    const stage = $("drop-stage");
    step = 1;
    stage.innerHTML = `<div class="drop-result">
      ${stepsHtml()}
      <div id="drop-card" tabindex="-1" aria-label="Your run card">${cardHtml()}</div>
      <section class="post-pane" data-pane="1" aria-label="Preview">
        <label class="drop-name">Title<input id="drop-title" data-autofocus maxlength="80" autocomplete="off" placeholder="What did you get done?"></label>
        <div class="drop-actions"><button type="button" class="act primary" id="drop-next">Choose who sees it</button></div>
      </section>
      <section class="post-pane" data-pane="2" aria-label="Who sees it" hidden>
        <fieldset class="aud"><legend tabindex="-1" data-autofocus>Who sees this run?</legend>
          ${AUDIENCES.map((a) => `<label class="aud-opt"><input type="radio" name="drop-aud" value="${a.v}"><span class="aud-check" aria-hidden="true"></span><span class="aud-t">${esc(a.t)}</span><span class="aud-d">${esc(a.d)}</span></label>`).join("")}
        </fieldset>
        <div class="drop-actions"><button type="button" class="act" id="drop-back">Back</button><button type="button" class="act primary" id="drop-continue" disabled>Continue</button></div>
      </section>
      <section class="post-pane" data-pane="3" aria-label="Share" hidden>
        <div id="drop-out" tabindex="-1" data-autofocus></div>
      </section>
      <p class="hint" id="drop-state" role="status">No prompts, code or file paths from the session file leave this device.</p>
      <button type="button" class="drop-again" id="drop-again">Read another file</button>
    </div>`;
    linkUrl = null;
    paintSteps();
    // The file input that had focus is gone. Focus the card, not the title, so a phone keyboard
    // does not cover the reveal; Tab then follows the page order: the card's Copy, then the title.
    $("drop-card").focus({ preventScroll: true });
    reveal($("drop-card"));
    GrinderFeed.wireStride($("drop-card"));
    const title = $("drop-title");
    title.addEventListener("input", () => {
      const t = $("drop-card").querySelector(".fc-title");
      if (t) t.textContent = GrinderFeed.titleOf(row(title.value));
    });
    $("drop-next").onclick = () => go(2);
    $("drop-back").onclick = () => go(1);
    stage.querySelectorAll('input[name="drop-aud"]').forEach((input) => {
      input.onchange = () => {
        $("drop-continue").disabled = !chosen();
        const mark = input.parentNode.querySelector(".aud-check");
        if (mark && mark.animate && !reduced()) mark.animate([{ transform: "scale(.4)" }, { transform: "scale(1)" }], { duration: 180, easing: EASE_OUT });
      };
    });
    $("drop-continue").onclick = share;
    $("drop-again").onclick = () => { run = null; step = 1; linkUrl = null; mount(opts); };
  }

  function titleText() {
    const typed = ($("drop-title").value || "").trim();
    return typed || GrinderFeed.titleOf(row(""));
  }

  // Share runs only with a chosen audience. "Anyone with the link" makes the unlisted card here;
  // every other audience goes to the post form with that audience, where sign-in and Save follow.
  async function share() {
    const audience = chosen();
    if (!audience) return;
    if (audience === "unlisted") return getLink();
    busy($("drop-continue"), "Opening the post form…");
    post(audience);
  }

  async function getLink() {
    const button = $("drop-continue"), state = $("drop-state");
    busy(button, "Making the link…");
    state.textContent = "Making the link…";
    const payload = GrinderDropin.uploadPayload(run, titleText());
    let res, body;
    try {
      res = await fetch("/api/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      body = await res.json().catch(() => ({}));
    } catch (_) {
      idle(button);
      state.textContent = "The link could not be made. Check the connection and try again. Nothing was saved.";
      return;
    }
    if (!res.ok || !body.url) {
      idle(button);
      state.textContent = (body && body.error) || "The link could not be made. Nothing was saved.";
      return;
    }
    $("drop-title").disabled = true;
    linkUrl = body.url;
    // A visitor Free Lunch sent here: confirm the card they just made (site/fair.js).
    if (root.StriveFair && body.id) root.StriveFair.confirm("link", body.id, null, body.fair_ticket);
    refreshStride();
    state.textContent = "Link ready. Anyone with it can see this card, and nothing else.";
    $("drop-out").innerHTML = `<div class="drop-link">
      <div class="drop-row"><a id="drop-url" href="${esc(body.url)}" target="_blank" rel="noopener">${esc(body.url.replace(/^https?:\/\//, ""))}</a><button type="button" class="act" data-copy="${esc(body.url)}">Copy</button></div>
      <p class="hint">Unlisted and not in the feed. It expires in 90 days.</p>
      <p class="drop-del-h"><b>Delete link, shown once.</b> Save it: it is the only way to delete this card.</p>
      <div class="drop-row"><code id="drop-delete">${esc(body.delete_url)}</code><button type="button" class="act" data-copy="${esc(body.delete_url)}">Copy</button></div>
    </div>`;
    wireCopy($("drop-out"));
    go(3);
    if (root.__dropinTimings) root.__dropinTimings.linkReady = performance.now();
  }

  // The existing import preview (index.html importRun) takes a base64 run in the URL fragment and
  // already carries it through sign-in. The typed title and the audience the person chose go with it.
  function post(audience) {
    const token = encodeURIComponent(btoa(JSON.stringify({
      schema_version: 0, harness: run.harness, turns_typed: run.turns_typed, tool_calls: run.tool_calls,
      files_touched: run.files_touched, commits: run.commits, duration_s: run.duration_s, started: run.started, rhythm: run.line || run.rhythm,
    })));
    try { sessionStorage.setItem("ag_import_edits", JSON.stringify({ token, i_title: ($("drop-title").value || "").trim(), i_vis: audience })); } catch (_) {}
    if (opts.post) opts.post(token); else location.href = "/#import=" + token;
  }

  function wireCopy(scope) {
    scope.querySelectorAll("[data-copy]").forEach((b) => {
      b.onclick = async () => {
        const label = b.textContent;
        try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = "Copied"; }
        catch (_) { b.textContent = "Select and copy"; }
        setTimeout(() => (b.textContent = label), 1600);
      };
    });
  }

  // A phone: a coarse pointer, no hover, and no fine pointer anywhere (an iPad with a trackpad
  // has one, and can read a file). The session file is on the computer the agent ran on, so a
  // phone's first step is to send this page there.
  function isPhone() {
    const m = (q) => !!(root.matchMedia && root.matchMedia(q).matches);
    return m("(pointer: coarse)") && m("(hover: none)") && !m("(any-pointer: fine)");
  }

  async function sendToLaptop(button) {
    // The page the person is on, so Connect sends Connect and the landing sends the landing.
    const url = location.href;
    const label = button.textContent;
    if (navigator.share) {
      try { await navigator.share({ title: document.title, url }); return; }
      catch (error) { if (error && error.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(url); button.textContent = "Link copied"; }
    catch (_) { button.textContent = url.replace(/^https?:\/\//, ""); }
    setTimeout(() => (button.textContent = label), 1600);
  }

  function phoneStage(zone) {
    const where = document.querySelector("details.drop-where");
    // Off a phone the fold is a plain label (site/dropin.css): no key should close it either.
    if (!isPhone()) { const s = where && where.querySelector("summary"); if (s) s.tabIndex = -1; return; }
    const choose = zone.querySelector(".cta .act.primary");
    if (choose) choose.classList.remove("primary");
    const send = document.createElement("div");
    send.className = "drop-send";
    send.innerHTML = '<button type="button" class="act primary" id="drop-send">Send this link to your laptop</button>';
    zone.insertAdjacentElement("afterend", send);
    send.querySelector("button").onclick = (e) => sendToLaptop(e.currentTarget);
    if (where) where.open = false;
  }

  function mount(options) {
    opts = options || {};
    const stage = $("drop-stage");
    if (!stage) return;
    if (opts.template) stage.innerHTML = opts.template;
    else if (stage.dataset.template) stage.innerHTML = stage.dataset.template;
    if (!stage.dataset.template) stage.dataset.template = stage.innerHTML;
    const input = $("drop-file"), zone = $("drop-zone");
    if (!input || !zone) return;
    phoneStage(zone);
    input.onchange = () => read(input.files && input.files[0]);
    const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
    zone.addEventListener("dragenter", (e) => { stop(e); zone.classList.add("over"); });
    zone.addEventListener("dragover", (e) => { stop(e); zone.classList.add("over"); });
    zone.addEventListener("dragleave", (e) => { stop(e); if (!zone.contains(e.relatedTarget)) zone.classList.remove("over"); });
    zone.addEventListener("drop", (e) => { stop(e); zone.classList.remove("over"); read(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]); });
    // The landing folds the file locations under .drop-where and their Copy buttons are wired
    // here. Connect draws its own rows and wires them itself, so nothing is bound twice.
    const where = document.querySelector(".drop-where");
    if (where) wireCopy(where);
    // A file dropped beside the zone would make the browser open it and leave the page. On the
    // landing page a drop anywhere is read as a drop on the zone.
    if (!root.__dropinGuard) {
      root.__dropinGuard = true;
      root.addEventListener("dragover", (e) => { if ($("drop-zone")) e.preventDefault(); });
      root.addEventListener("drop", (e) => {
        if (!$("drop-zone")) return;
        e.preventDefault();
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) read(f);
      });
    }
  }

  root.GrinderDropinUI = { mount, read, reveal };
})(typeof window !== "undefined" ? window : globalThis);
