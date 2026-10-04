/* Shared browser boundary: a successful parse is not permission to store arbitrary fields. */
(function (root) {
  "use strict";
  const observedProjection = run => run?.trace_basis === "observed native events; timestamps unavailable";
  const counts = [
    "turns_typed",
    "tool_calls",
    "shell_calls",
    "files_touched",
    "commits",
    "claims",
    "claims_verified",
    "artifacts_produced",
  ];
  // THE PROJECT LABEL A READER SEES. A capture names a project after the workspace directory,
  // and both harnesses flatten the absolute path into that name, so the account name arrives
  // with it: `Users-morkeeth-code-app`, or, for a session opened on the home directory itself,
  // the bare `Users-morkeeth`. Production 7858535 printed that slug as "Project touched" on the
  // public share image, which is the one surface a stranger sees first.
  //
  // Same rule as agentgrinder/ingest.py `project_label` and server/public-run.mjs `projectName`;
  // tests/fixtures/project_label_probe.mjs runs one table of cases through all three.
  const HOME_SLUG = /^-?(?:Users|home)-[^-]+(?:-|$)/;
  // "." is a relative cwd with no name in it (the bundled fixture writes one): not a project.
  const NO_PROJECT = ["session", "unknown", "project unknown", "."];
  function projectLabel(value) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text || NO_PROJECT.includes(text.toLowerCase())) return null;
    const stripped = text.replace(HOME_SLUG, "");
    // Nothing left means the workspace WAS a home directory: an unknown project is a fact, an
    // account name is not.
    return (stripped === text ? text : stripped) || null;
  }

  function validate(run) {
    if (!run || typeof run !== "object" || Array.isArray(run))
      throw new Error("A grind must be a JSON object.");
    if(run.capture_metadata!=null) {
      const ctx=typeof StriveContext!=="undefined"?StriveContext:typeof require==="function"?require("./run-context.js"):null;
      if(!ctx) throw Error("Capture metadata validator unavailable");
      ctx.validate(run.capture_metadata);
    }
    const version = run.schema_version ?? 0;
    if (!Number.isInteger(version) || ![0, 1].includes(version))
      throw new Error(
        "This grind uses an unsupported format. Update Agent Grinder to read it.",
      );
    for (const field of counts) {
      if (
        run[field] != null &&
        (!Number.isSafeInteger(run[field]) || run[field] < 0)
      )
        throw new Error(
          field + " must be a non-negative whole number or unknown.",
        );
    }
    if (
      run.duration_s != null &&
      (typeof run.duration_s !== "number" ||
        !Number.isFinite(run.duration_s) ||
        run.duration_s < 0)
    )
      throw new Error("Invalid grind duration.");
    if (run.claims_verified != null && run.claims == null)
      throw new Error("Verified claims require a counted-claims total.");
    if (
      run.claims != null &&
      run.claims_verified != null &&
      run.claims_verified > run.claims
    )
      throw new Error("Verified claims cannot exceed the claims counted.");
    if (run.ridge != null) {
      if (
        !Array.isArray(run.ridge) ||
        run.ridge.length < 40 ||
        run.ridge.length > 60 ||
        run.ridge.some((v) => !Number.isSafeInteger(v) || v < 0)
      )
        throw new Error(
          "ridge must contain 40 to 60 non-negative whole-number bins.",
        );
      if (
        run.worker_bins != null && (!Array.isArray(run.worker_bins) ||
        run.worker_bins.length !== run.ridge.length ||
        run.worker_bins.some((v) => !Number.isSafeInteger(v) || v < 0))
      )
        throw new Error("worker_bins must match ridge with non-negative whole-number counts, or be unknown.");
      if (
        !Array.isArray(run.commit_bins || []) ||
        (run.commit_bins || []).some(
          (v) =>
            !Number.isSafeInteger(v) || v < 0 || v >= run.ridge.length,
        )
      )
        throw new Error("commit_bins must contain valid ridge indexes.");
      if (!["wall-time", "call-index", "turn-order"].includes(run.ridge_basis))
        throw new Error("ridge_basis must be wall-time, call-index, or turn-order.");
      if (
        run.ridge_wall_seconds != null &&
        (typeof run.ridge_wall_seconds !== "number" ||
          !Number.isFinite(run.ridge_wall_seconds) ||
          run.ridge_wall_seconds < 0)
      )
        throw new Error("Invalid ridge wall time.");
    }
    // Declared outcome receipts. Same rules the database enforces in migration 008. These are the
    // uploader's claims, never measurements, so they are validated for safety and shown apart.
    for (const field of ["repo_url", "artifact_url", "image_url"]) {
      if (run[field] == null) continue;
      if (typeof run[field] !== "string" || !safeUrl(run[field]))
        throw new Error(field + " must be one https link under 300 characters.");
    }
    if (run.repo_url != null && !/^https:\/\/(github\.com|gitlab\.com|codeberg\.org)\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+/i.test(run.repo_url))
      throw new Error("repo_url must be a repository on github.com, gitlab.com or codeberg.org.");
    if (run.image_url != null && !/\.(png|jpe?g|webp)([?#].*)?$/i.test(run.image_url))
      throw new Error("image_url must end in .png, .jpg, .jpeg or .webp.");
    if (run.shipped != null) {
      if (!Array.isArray(run.shipped) || run.shipped.length > 5)
        throw new Error("shipped holds at most 5 lines.");
      if (run.shipped.some((line) => typeof line !== "string" || line.trim().length < 1 || line.trim().length > 120))
        throw new Error("each shipped line is text, 1 to 120 characters.");
    }
    if (run.receipts != null) {
      if (!Array.isArray(run.receipts) || run.receipts.length > 5)
        throw new Error("receipts holds at most 5 links.");
      if (run.receipts.some((r) => !r || typeof r !== "object" || Array.isArray(r)
        || Object.keys(r).some((k) => k !== "label" && k !== "url")
        || typeof r.label !== "string" || r.label.trim().length < 1 || r.label.trim().length > 60
        || typeof r.url !== "string" || !safeUrl(r.url)))
        throw new Error("each receipt is {label, url}: a label of 1 to 60 characters and one https link.");
    }
    if (run.code_route != null) validateCodeRoute(run.code_route);
    for (const field of ["measurement_revision", "baseline_revision"]) {
      if (
        run[field] != null &&
        (typeof run[field] !== "string" || !/^[a-f0-9]{64}$/.test(run[field]))
      )
        throw new Error("Invalid measurement revision reference.");
    }
    return run;
  }
  function safeUrl(value) {
    if (typeof value !== "string" || value.length < 12 || value.length > 300) return false;
    if (/[\s<>"'\\]/.test(value) || /javascript:/i.test(value)) return false;
    try { return new URL(value).protocol === "https:"; } catch (_) { return false; }
  }
  const CODE_ROUTE_STOP = new Set(["edit", "commit", "check", "merge", "deploy", "artifact", "handoff", "finish"]);
  const CODE_ROUTE_BASIS = new Set(["measured", "declared"]);
  const PATHISH = /(^|[\s"'])(\/Users\/|\/home\/|\/private\/|~[/\\]|[A-Za-z]:\\|\\)/;
  const SECRETISH = /(api[_-]?key|secret|password|token|bearer\s+[a-z0-9]|sk-[a-z0-9]{8,}|prompt\s*:)/i;
  const PRIVATE_LANE = /(\bL\d+\b|\bprivate\b|\blane\s+[a-z0-9-]+)/i;
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
  const SAFE_LABEL = /^[A-Za-z0-9][A-Za-z0-9 ._+/@#:-]{0,79}$/;
  const SAFE_HARNESS = /^[a-z][a-z0-9-]{0,31}$/;
  function rejectRouteText(value, field) {
    if (typeof value !== "string" || !value.trim()) throw new Error(field + " must be text.");
    const text = value.trim();
    if (PATHISH.test(text) || text.startsWith("/") || text.includes("\\") || text.startsWith("~"))
      throw new Error(field + " must not contain absolute or home paths.");
    if (SECRETISH.test(text)) throw new Error(field + " must not carry prompts or secrets.");
    if (PRIVATE_LANE.test(text)) throw new Error(field + " must not carry private lane labels.");
    return text;
  }
  function validateCodeRoute(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("code_route must be an object.");
    const keys = Object.keys(value);
    for (const key of keys) {
      if (!["v", "projects", "stops", "connectors", "finish", "stats", "harnesses", "unavailable"].includes(key))
        throw new Error("Unknown code_route key: " + key);
    }
    if (value.v !== 1) throw new Error("code_route.v must be 1.");
    if (value.unavailable != null) {
      if (typeof value.unavailable !== "object" || Array.isArray(value.unavailable))
        throw new Error("unavailable must be an object.");
      rejectRouteText(value.unavailable.why, "unavailable.why");
      if ((value.projects && value.projects.length) || (value.stops && value.stops.length))
        throw new Error("unavailable code_route cannot also carry route terrain.");
      if (value.harnesses != null) validateHarnesses(value.harnesses);
      return value;
    }
    if (!Array.isArray(value.projects) || value.projects.length < 1 || value.projects.length > 12)
      throw new Error("projects holds 1 to 12 lanes.");
    if (!Array.isArray(value.stops) || value.stops.length < 1 || value.stops.length > 40)
      throw new Error("stops holds 1 to 40 checkpoints.");
    const projectIds = [];
    for (const project of value.projects) {
      if (!project || typeof project !== "object") throw new Error("each project is an object.");
      const id = rejectRouteText(project.id, "project.id");
      if (!SAFE_ID.test(id)) throw new Error("project.id must be a short safe id.");
      if (projectIds.includes(id)) throw new Error("project ids must be unique.");
      projectIds.push(id);
      const label = rejectRouteText(project.label, "project.label");
      if (!SAFE_LABEL.test(label)) throw new Error("project.label must be a short safe label.");
      if (project.basis != null && !CODE_ROUTE_BASIS.has(project.basis))
        throw new Error("project.basis must be measured or declared.");
    }
    const stopIds = [];
    for (const stop of value.stops) {
      if (!stop || typeof stop !== "object") throw new Error("each stop is an object.");
      const id = rejectRouteText(stop.id, "stop.id");
      if (!SAFE_ID.test(id) || stopIds.includes(id)) throw new Error("stop.id must be a unique short safe id.");
      stopIds.push(id);
      if (!projectIds.includes(stop.project)) throw new Error("each stop must name a known project.");
      if (!CODE_ROUTE_STOP.has(stop.kind)) throw new Error("stop.kind is unsupported.");
      if (!CODE_ROUTE_BASIS.has(stop.basis)) throw new Error("stop.basis must be measured or declared.");
      const label = rejectRouteText(stop.label, "stop.label");
      if (!SAFE_LABEL.test(label)) throw new Error("stop.label must be a short safe label.");
      if (stop.evidence != null) {
        if (!Array.isArray(stop.evidence) || stop.evidence.length > 5)
          throw new Error("stop.evidence holds at most 5 lines.");
        stop.evidence.forEach((line) => {
          const text = rejectRouteText(line, "stop.evidence");
          if (text.length > 120) throw new Error("stop.evidence lines are too long.");
        });
      }
    }
    const connectors = value.connectors || [];
    if (!Array.isArray(connectors) || connectors.length > 40)
      throw new Error("connectors holds at most 40 links.");
    for (const link of connectors) {
      if (!link || typeof link !== "object") throw new Error("each connector is an object.");
      if (!stopIds.includes(link.from) || !stopIds.includes(link.to))
        throw new Error("connectors must join known stops.");
      rejectRouteText(link.label, "connector.label");
    }
    if (!value.finish || typeof value.finish !== "object") throw new Error("finish is required.");
    if (!stopIds.includes(value.finish.stop)) throw new Error("finish.stop must name a known stop.");
    if (!["artifact", "unfinished"].includes(value.finish.kind))
      throw new Error("finish.kind must be artifact or unfinished.");
    rejectRouteText(value.finish.label, "finish.label");
    if (value.harnesses != null) validateHarnesses(value.harnesses);
    return value;
  }
  function validateHarnesses(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("harnesses must be an object.");
    const observed = value.observed || [];
    const absent = value.absent || [];
    if (!Array.isArray(observed) || !Array.isArray(absent) || observed.length > 12 || absent.length > 12)
      throw new Error("harness lists are bounded.");
    if (!observed.length && !absent.length) throw new Error("harnesses must name populations.");
    if (!["manifest", "collector"].includes(value.basis))
      throw new Error("harnesses.basis must be manifest or collector.");
    const clean = (items) => items.map((item) => {
      const text = rejectRouteText(item, "harness id");
      if (!SAFE_HARNESS.test(text)) throw new Error("harness ids are lowercase public population names.");
      return text;
    });
    const obs = clean(observed);
    const abs = clean(absent);
    if (obs.some((id) => abs.includes(id))) throw new Error("a harness cannot be both observed and absent.");
  }
  function esc(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function outcome(run) {
    // Declared by the uploader. Kept in its own block, with its own heading, so it can never read as
    // a measurement. Every link is re-checked here, because a stored row is still untrusted input.
    if (!run) return "";
    const link = (href, text) => safeUrl(href)
      ? `<a href="${esc(href)}" rel="noopener noreferrer nofollow" target="_blank">${esc(text)}</a>` : "";
    const parts = [];
    const repo = safeUrl(run.repo_url) ? link(run.repo_url, String(run.repo_url).replace(/^https:\/\//, "")) : "";
    if (repo) parts.push(`<p class="run-outcome-repo">${repo}</p>`);
    const shipped = Array.isArray(run.shipped) ? run.shipped.filter((l) => typeof l === "string" && l.trim()).slice(0, 5) : [];
    if (shipped.length) parts.push(`<ul class="run-outcome-shipped">${shipped.map((l) => `<li>${esc(l.trim().slice(0, 120))}</li>`).join("")}</ul>`);
    const receipts = (Array.isArray(run.receipts) ? run.receipts : []).filter((r) => r && safeUrl(r.url) && typeof r.label === "string").slice(0, 5);
    const extra = [];
    receipts.forEach((r) => extra.push(link(r.url, r.label.trim().slice(0, 60))));
    if (safeUrl(run.artifact_url)) extra.push(link(run.artifact_url, "Open the demo"));
    // Prefer the gallery on the card. Keep a text link here for Explore when no raster cover rendered.
    if (safeUrl(run.image_url) && /\.(png|jpe?g|webp)([?#].*)?$/i.test(run.image_url))
      extra.push(link(run.image_url, "Open the cover or scene photo"));
    if (extra.length) parts.push(`<p class="run-outcome-links">${extra.join(" · ")}</p>`);
    if (!parts.length) return "";
    return `<section class="run-outcome"><div class="run-story-label">Said by the uploader, not measured</div>${parts.join("")}</section>`;
  }
  function message(error) {
    const text =
      error?.message || "This action could not be completed. Try again.";
    return /schema cache|could not find the table|relation .*does not exist|column .*does not exist/i.test(
      text,
    )
      ? "This part of Grinder is not available on this deployment yet."
      : text;
  }
  function trace(snapshot) {
    const valid = values => Array.isArray(values) && values.length > 0 && values.length <= 10000 && values.every(v => Number.isFinite(v) && v >= 0);
    const fromRidge = !valid(snapshot?.rhythm) && Array.isArray(snapshot?.ridge) && snapshot.ridge.length >= 40 && snapshot.ridge.length <= 60 && snapshot.ridge.every(v => Number.isSafeInteger(v) && v >= 0);
    const values = fromRidge ? snapshot.ridge : snapshot?.rhythm;
    const label = observedProjection(snapshot) ? "Observed tool requests over observed message order; lower bound" : fromRidge && snapshot.harness === "Grok Bot" && snapshot.trace_basis === "timestamps unavailable" ? "Tool requests over message order" : "Recorded session activity";
    if (
      !Array.isArray(values) ||
      !values.length ||
      values.length > 10000 ||
      values.some((v) => !Number.isFinite(v) || v < 0)
    )
      return "<small>Trace unavailable</small>";
    const max = Math.max(1, ...values),
      points = values
        .map(
          (v, i) =>
            `${4 + (i * 232) / Math.max(1, values.length - 1)},${64 - (v * 54) / max}`,
        )
        .join(" ");
    return (
      '<svg viewBox="0 0 240 72" role="img" aria-label="' + label + '" style="display:block;width:100%;color:var(--blue)"><polyline points="' +
      points +
      '" stroke="currentColor" fill="none" stroke-width="2"/></svg>'
    );
  }
  function ridge(snapshot) {
    const values = snapshot?.ridge;
    const workers = snapshot?.worker_bins;
    if (
      !Array.isArray(values) ||
      values.length < 40 ||
      values.length > 60 ||
      values.some((v) => !Number.isSafeInteger(v) || v < 0) ||
      (workers != null && (!Array.isArray(workers) ||
      workers.length !== values.length ||
      workers.some((v) => !Number.isSafeInteger(v) || v < 0)))
    )
      return "";
    const w = 800, h = 150, base = 132, top = 16;
    const x = (i) => (i * w) / Math.max(1, values.length - 1);
    const max = Math.max(1, ...values);
    const y = (v) => base - (v / max) * (base - top);
    const line = values
      .map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join(" ");
    const area = `0,${base} ${line} ${w},${base}`;
    const workerMax = workers ? Math.max(0, ...workers) : 0;
    let backs = "";
    for (let level = Math.min(3, workerMax); level >= 1; level--) {
      const points = workers
        .map((v, i) => {
          const active = Math.min(v, level) / level;
          const value = active ? Math.max(values[i], max * (0.2 + level * 0.08)) : 0;
          return `${x(i).toFixed(1)},${y(value).toFixed(1)}`;
        })
        .join(" ");
      backs += `<polygon class="ridge-worker ridge-worker-${level}" points="0,${base} ${points} ${w},${base}"/>`;
    }
    const ticks = (snapshot.commit_bins || [])
      .filter((v) => Number.isSafeInteger(v) && v >= 0 && v < values.length)
      .map((v) => `<line class="ridge-commit" x1="${x(v).toFixed(1)}" y1="${base}" x2="${x(v).toFixed(1)}" y2="${base - 10}"/>`)
      .join("");
    // Output chips stay off the plot unless a measured bin places them. output_url alone is not a timed landmark.
    const basisLabel = observedProjection(snapshot) ? "observed message order" :
      snapshot.ridge_basis === "wall-time"
        ? "wall time"
        : snapshot.ridge_basis === "turn-order"
          ? (snapshot.harness === "Grok Bot" && ["timestamps unavailable", "observed native events; timestamps unavailable"].includes(snapshot.trace_basis) ? "message order" : "turn order")
          : "call order";
    const peak = Math.max(0, ...values);
    const peakIndex = peak > 0 ? values.indexOf(peak) : -1;
    const commits = (snapshot.commit_bins || []).filter(
      (v) => Number.isSafeInteger(v) && v >= 0 && v < values.length,
    );
    const hits = values
      .map((v, i) => {
        const x0 = Math.max(0, i === 0 ? 0 : x(i) - w / values.length / 2);
        const x1 = Math.min(w, i === values.length - 1 ? w : x(i) + w / values.length / 2);
        return `<rect class="run-map-hit" data-bin="${i}" x="${x0.toFixed(1)}" y="0" width="${(x1 - x0).toFixed(1)}" height="${h}" fill="transparent"/>`;
      })
      .join("");
    const payload = escText(
      JSON.stringify({
        values,
        workers,
        commits,
        peak,
        peakIndex,
        basis: snapshot.ridge_basis || "",
        basisLabel,
        observedProjection: observedProjection(snapshot),
      }),
    );
    const startBin = peakIndex >= 0 ? peakIndex : 0;
    const help =
      (observedProjection(snapshot) ? "Observed distinct tool requests are a lower bound from a redacted source. Missing records may be omitted; they are not zero activity. " : "") +
      "Each activity slice is one measured step along " +
      basisLabel +
      (workers == null ? ". Worker activity was not recorded" : "") +
      ". Commit marks sit only on measured commit_bins. Linked output is not placed on the map without a timed bin.";
    return `<div class="ridge-wrap run-map" data-ridge-basis="${escText(snapshot.ridge_basis || "")}" data-run-map="${payload}"><div class="run-map-head"><span class="run-story-label">Run map</span><span class="meta">Tool requests per slice</span></div><div class="run-map-plot"><svg class="ridge" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Tool calls across ${escText(basisLabel)}">${backs}<polygon class="ridge-fill" points="${area}"/><line class="ridge-base" x1="0" y1="${base}" x2="${w}" y2="${base}"/>${ticks}<polyline class="ridge-line" points="${line}"/><circle class="ridge-start" cx="0" cy="${y(values[0]).toFixed(1)}" r="5"/><circle class="ridge-end" cx="${w}" cy="${y(values[values.length - 1]).toFixed(1)}" r="5"/><line class="run-map-scrub" x1="${x(startBin).toFixed(1)}" y1="${top}" x2="${x(startBin).toFixed(1)}" y2="${base}" /><circle class="run-map-focus" cx="${x(startBin).toFixed(1)}" cy="${y(values[startBin]).toFixed(1)}" r="6"/>${hits}</svg></div><label class="run-map-slider-label"><span class="visually-hidden">Activity slice</span><input class="run-map-slider" type="range" min="0" max="${values.length - 1}" value="${startBin}" step="1" aria-valuemin="0" aria-valuemax="${values.length - 1}" aria-valuenow="${startBin}" /></label><p class="meta run-map-axis">Horizontal: ${escText(basisLabel)} · vertical: 0–${peak} tool requests per slice${snapshot.ridge_basis === "wall-time" && Number.isFinite(snapshot.ridge_wall_seconds) ? ` · each slice ≈ ${(snapshot.ridge_wall_seconds/values.length).toFixed(1)} seconds` : ""}. Peaks show more requests, not better results.</p><div class="run-map-readout" aria-live="polite"></div><details class="run-map-help"><summary>How to read this map</summary><p>${escText(help)}</p></details></div>`;
  }
  function promoteCodeRouteHero(scope) {
    const cards = scope.querySelectorAll ? scope.querySelectorAll(".card") : [];
    cards.forEach((card) => {
      const cover = card.querySelector(":scope > .run-cover");
      const route = card.querySelector(":scope > .code-route, :scope > .work-path");
      if (!route && !cover) return;
      const note = card.querySelector(":scope > .note");
      const title = card.querySelector(":scope > .title");
      const anchor = note || title;
      const stats = card.querySelector(":scope > dl.run-metrics");
      if (cover && anchor && cover.previousElementSibling !== anchor) {
        anchor.after(cover);
      }
      const routeAnchor = cover || note || title;
      if (route && routeAnchor && route.previousElementSibling !== routeAnchor) {
        if (stats && !cover) stats.before(route);
        else routeAnchor.after(route);
      }
    });
  }
  function mountRunMaps(root) {
    const scope = root && root.querySelectorAll ? root : typeof document !== "undefined" ? document : null;
    if (!scope) return;
    promoteCodeRouteHero(scope);
    scope.querySelectorAll(".run-map[data-run-map]").forEach((wrap) => {
      if (wrap.dataset.wired === "1") return;
      wrap.dataset.wired = "1";
      let data;
      try {
        data = JSON.parse(wrap.getAttribute("data-run-map") || "{}");
      } catch (_) {
        return;
      }
      const values = data.values || [];
      if (!values.length) return;
      const plot = wrap.querySelector(".run-map-plot");
      const svg = wrap.querySelector("svg.ridge");
      const scrub = wrap.querySelector(".run-map-scrub");
      const focus = wrap.querySelector(".run-map-focus");
      const readout = wrap.querySelector(".run-map-readout");
      const slider = wrap.querySelector(".run-map-slider");
      if (!plot || !svg) return;
      const w = 800,
        base = 132,
        top = 16;
      const x = (i) => (i * w) / Math.max(1, values.length - 1);
      const max = Math.max(1, ...values);
      const y = (v) => base - (v / max) * (base - top);
      const describe = (i) => {
        const tools = values[i] || 0;
        const workers = data.workers?.[i] ?? null;
        const isPeak = i === data.peakIndex && data.peak > 0;
        const commitHere = (data.commits || []).includes(i);
        const bits = [];
        bits.push(`Activity slice ${i + 1} of ${values.length}`);
        bits.push(`${data.observedProjection ? "at least " : ""}${tools} tool call${tools === 1 ? "" : "s"} in this slice`);
        if (workers) bits.push(`${workers} worker${workers === 1 ? "" : "s"}`);
        if (isPeak) bits.push(`peak activity ${data.peak}`);
        if (commitHere) bits.push("commit landmark");
        return bits.join(" · ");
      };
      const paint = (i) => {
        const idx = Math.max(0, Math.min(values.length - 1, i | 0));
        if (scrub) {
          scrub.setAttribute("x1", x(idx).toFixed(1));
          scrub.setAttribute("x2", x(idx).toFixed(1));
        }
        if (focus) {
          focus.setAttribute("cx", x(idx).toFixed(1));
          focus.setAttribute("cy", y(values[idx]).toFixed(1));
        }
        if (readout) readout.textContent = describe(idx);
        wrap.dataset.activeBin = String(idx);
        if (slider) {
          slider.value = String(idx);
          slider.setAttribute("aria-valuenow", String(idx));
          slider.setAttribute("aria-valuetext", describe(idx));
        }
      };
      paint(data.peakIndex >= 0 ? data.peakIndex : 0);
      const binFromClientX = (clientX) => {
        if (!svg) return null;
        const rect = svg.getBoundingClientRect();
        if (!Number.isFinite(clientX) || !rect.width) return null;
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        return Math.round(ratio * (values.length - 1));
      };
      const fromPointer = (event) => {
        const hit = event.target.closest && event.target.closest(".run-map-hit");
        if (hit && hit.dataset.bin != null) return Number(hit.dataset.bin);
        const clientX = event.clientX;
        return binFromClientX(clientX);
      };
      plot.addEventListener("pointerdown", (event) => {
        const i = fromPointer(event);
        if (i == null) return;
        paint(i);
      });
      plot.addEventListener("pointermove", (event) => {
        if (event.buttons === 0 && event.pointerType !== "mouse") return;
        if (event.pointerType === "mouse" && event.buttons === 0) {
          const i = fromPointer(event);
          if (i != null) paint(i);
          return;
        }
        if (event.buttons > 0) {
          const i = fromPointer(event);
          if (i != null) paint(i);
        }
      });
      let touchOrigin = null;
      plot.addEventListener(
        "touchstart",
        (event) => {
          const t = event.touches && event.touches[0];
          if (!t) return;
          touchOrigin = { x: t.clientX, y: t.clientY, scrubbing: false };
        },
        { passive: true },
      );
      plot.addEventListener(
        "touchmove",
        (event) => {
          const t = event.touches && event.touches[0];
          if (!t || !touchOrigin) return;
          const dx = t.clientX - touchOrigin.x;
          const dy = t.clientY - touchOrigin.y;
          if (!touchOrigin.scrubbing) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            if (Math.abs(dy) >= Math.abs(dx)) {
              touchOrigin = null;
              return;
            }
            touchOrigin.scrubbing = true;
          }
          if (event.cancelable) event.preventDefault();
          const i = binFromClientX(t.clientX);
          if (i != null) paint(i);
        },
        { passive: false },
      );
      plot.addEventListener(
        "touchend",
        () => {
          touchOrigin = null;
        },
        { passive: true },
      );
      if (slider) {
        slider.addEventListener("input", () => paint(Number(slider.value)));
        slider.addEventListener("keydown", (event) => {
          let next = null;
          if (event.key === "Home") next = 0;
          else if (event.key === "End") next = values.length - 1;
          else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = Number(slider.value) - 1;
          else if (event.key === "ArrowRight" || event.key === "ArrowUp") next = Number(slider.value) + 1;
          else if (event.key === "PageDown") next = Number(slider.value) - 5;
          else if (event.key === "PageUp") next = Number(slider.value) + 5;
          if (next == null) return;
          event.preventDefault();
          paint(next);
        });
      }
    });
  }
  function headlineMetric(snapshot) {
    if (snapshot && snapshot.headline_metric_id) return snapshot.headline_metric_id;
    if (snapshot && snapshot.claims_verified == null && snapshot.artifacts_produced != null)
      return "artifacts_per_turn";
    return "verified_per_turn";
  }
  function sittingsComparable(before, after, review = {}) {
    if (review.decision === "incomparable" || review.tried === false)
      return { ok: false, why: "The participant marked this outcome incomparable or did not try the practice." };
    if (!before || !after)
      return { ok: false, why: "No later measurement is bound yet." };
    if (!before.harness || !after.harness || before.harness !== after.harness)
      return {
        ok: false,
        why:
          "Harness differs or is unknown. Different harnesses are not the same measurement, even when claim counts are present.",
      };
    if (!before.trace_basis || !after.trace_basis || before.trace_basis !== after.trace_basis)
      return {
        ok: false,
        why: "Time basis differs or is unknown. Do not read the traces as one claim.",
      };
    const beforeMetric = headlineMetric(before);
    const afterMetric = headlineMetric(after);
    if (beforeMetric !== afterMetric)
      return {
        ok: false,
        why:
          "Headline metrics differ (" +
          beforeMetric +
          " vs " +
          afterMetric +
          "); do not read a number change as the same claim.",
      };
    if ((before.claims_verified != null) !== (after.claims_verified != null))
      return {
        ok: false,
        why: "Verified-claim evidence is present on only one sitting.",
      };
    const numerator = beforeMetric === "verified_per_turn" ? "claims_verified"
      : beforeMetric === "artifacts_per_turn" ? "artifacts_produced" : null;
    if (!numerator || [before, after].some((s) =>
      !Number.isFinite(s[numerator]) || s[numerator] < 0 ||
      !Number.isFinite(s.turns_typed) || s.turns_typed <= 0))
      return { ok: false, why: "The headline numerator or typed-turn count is missing or invalid. Two missing measurements do not make a comparison." };
    return {
      ok: true,
      why: "Same harness, time basis and metric identity. This is an observation, not proof the practice caused the difference. Different task difficulty is not productivity proof.",
    };
  }
  function rejectPaths(value) {
    if (value == null) return value;
    if (typeof value === "object") {
      if (Array.isArray(value)) return value.map(rejectPaths);
      const out = {};
      for (const k of Object.keys(value)) out[k] = rejectPaths(value[k]);
      return out;
    }
    if (typeof value !== "string") return value;
    return value
      .split(/\n/)
      .map((line) =>
        line
          .split(/\s+/)
          .map((raw) => {
            if (!raw) return raw;
            const tok = raw.replace(/^[,.;:()[\]{}'"`]+|[,.;:()[\]{}'"`]+$/g, "");
            if (
              tok.startsWith("/") ||
              tok.startsWith("~") ||
              tok.includes("\\") ||
              tok.includes("/") ||
              /^[A-Za-z]:/.test(tok)
            )
              return "[file]";
            return raw;
          })
          .join(" "),
      )
      .join("\n");
  }
  /* Orchestration tree: one orchestrator on top, workers as rows. Reads only the fields the
     tree builder allows (ids, model, timestamps, counts). A tree with no children still renders
     the orchestrator line so a reader sees that delegation was recorded but the workers were not. */
  const escText = (s) =>
    String(s ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c]);
  function wall(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "unknown";
    const total = Math.round(seconds), h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    if (h) return h + "h " + String(m).padStart(2, "0") + "m";
    if (m) return m + "m " + String(s).padStart(2, "0") + "s";
    return s + "s";
  }
  function offset(start, base) {
    const a = Date.parse(start), b = Date.parse(base);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < b) return "";
    return "+" + wall((a - b) / 1000);
  }
  function treeNode(node) {
    if (!node || typeof node !== "object" || Array.isArray(node)) return null;
    const num = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
    return {
      model: typeof node.model === "string" ? node.model.slice(0, 60) : null,
      subagent_type: typeof node.subagent_type === "string" ? node.subagent_type.slice(0, 24) : null,
      status: typeof node.status === "string" ? node.status.slice(0, 24) : null,
      started_at: typeof node.started_at === "string" && Number.isFinite(Date.parse(node.started_at)) ? node.started_at : null,
      wall_seconds: Number.isFinite(node.wall_seconds) && node.wall_seconds >= 0 ? node.wall_seconds : null,
      bubbles: num(node.bubbles),
      tool_calls: num(node.tool_calls),
      tool_errors: num(node.tool_errors),
      children: Array.isArray(node.children) ? node.children.map(treeNode).filter(Boolean).slice(0, 200) : [],
    };
  }
  function tree(raw) {
    const root = treeNode(raw);
    if (!root) return "";
    const workers = root.children;
    const longest = Math.max(1, ...workers.map((w) => w.wall_seconds || 0));
    const chip = (m) => '<span class="tree-chip" title="' + escText(m || "model unknown") + '">' + escText(m || "model unknown") + "</span>";
    const counts = (n) =>
      '<span class="tree-counts">' +
      (n.bubbles == null ? "?" : n.bubbles) + " turns · " +
      (n.tool_calls == null ? "?" : n.tool_calls) + " tools" +
      (n.tool_errors ? " · " + n.tool_errors + " err" : "") +
      "</span>";
    const rows = workers
      .map((w, i) => {
        const width = w.wall_seconds == null ? 0 : Math.max(1, Math.round((w.wall_seconds / longest) * 100));
        const label = "worker " + (i + 1) + (w.subagent_type && w.subagent_type !== "generalPurpose" ? " · " + w.subagent_type : "");
        const flag = w.status && w.status !== "completed" ? ' <span class="tree-flag">' + escText(w.status) + "</span>" : "";
        return (
          '<li class="tree-worker"><div class="tree-line"><span class="tree-name">' + escText(label) + flag + "</span>" + chip(w.model) +
          '<span class="tree-wall">' + escText(wall(w.wall_seconds)) + "</span></div>" +
          '<div class="tree-bar" role="img" aria-label="' + escText(wall(w.wall_seconds)) + ' of the longest worker"><span style="width:' + width + '%"></span></div>' +
          '<div class="tree-line small">' + counts(w) + '<span class="tree-start">' + escText(offset(w.started_at, root.started_at)) + "</span></div></li>"
        );
      })
      .join("");
    const sum = workers.reduce((a, w) => a + (w.wall_seconds || 0), 0);
    return (
      '<section class="tree" aria-label="Orchestration tree">' +
      '<div class="tree-root"><div class="tree-line"><span class="tree-name">orchestrator</span>' + chip(root.model) +
      '<span class="tree-wall">' + escText(wall(root.wall_seconds)) + " span</span></div>" +
      '<div class="tree-line small">' + counts(root) + '<span class="tree-start">' + workers.length + " worker" + (workers.length === 1 ? "" : "s") +
      (workers.length ? " · " + escText(wall(sum)) + " worker time" : "") + "</span></div></div>" +
      (workers.length ? '<ol class="tree-workers">' + rows + "</ol>" : '<p class="tree-empty">Delegation recorded, no worker rows found.</p>') +
      '<p class="tree-foot">Bars compare worker wall time to the longest worker. Model names are what Cursor recorded. Tokens are not on disk and are not shown.</p>' +
      "</section>"
    );
  }
  function routeInsight(route) {
    if (!route || typeof route !== "object" || Array.isArray(route) || route.v !== 1 || route.unavailable) return "";
    const projects = Array.isArray(route.projects) ? route.projects : [];
    const stops = Array.isArray(route.stops) ? route.stops : [];
    if (!projects.length || !stops.length) return "";
    const connectors = Array.isArray(route.connectors) ? route.connectors : [];
    const handoffs = connectors.filter((c) => c && c.kind === "handoff");
    const measured = stops.filter((s) => s && s.basis === "measured").length;
    const declared = stops.filter((s) => s && s.basis === "declared").length;
    const counts = Object.create(null);
    for (const stop of stops) {
      if (!stop || !stop.project) continue;
      counts[stop.project] = (counts[stop.project] || 0) + 1;
    }
    let densest = null;
    let densestN = 0;
    let ties = 0;
    for (const project of projects) {
      const n = counts[project.id] || 0;
      if (n > densestN) {
        densest = project;
        densestN = n;
        ties = 1;
      } else if (n === densestN && n > 0) ties += 1;
    }
    const finishStop = route.finish && stops.find((s) => s.id === route.finish.stop);
    const finishProject = finishStop && projects.find((p) => p.id === finishStop.project);
    const parts = [];
    if (densest && ties === 1 && densestN > 0 && densestN < stops.length) {
      parts.push(densest.label + " held the densest stretch (" + densestN + " of " + stops.length + " stops)");
    }
    if (handoffs.length) {
      if (finishProject && densest && finishProject.id !== densest.id) {
        parts.push(
          handoffs.length +
            (handoffs.length === 1 ? " handoff carried the work to " : " handoffs carried the work to ") +
            finishProject.label
        );
      } else {
        parts.push(handoffs.length + (handoffs.length === 1 ? " handoff across the route" : " handoffs across the route"));
      }
    }
    if (measured + declared === stops.length) {
      if (declared === 0 && measured === stops.length) parts.push("every stop is measured");
      else if (declared > 0) parts.push(measured + " measured, " + declared + " declared");
    }
    if (route.finish && route.finish.kind === "artifact" && route.finish.label && parts.length < 2) {
      parts.push("finish " + route.finish.label);
    }
    if (!parts.length) return "";
    return parts[0] + parts.slice(1).map((part) => ". " + part.charAt(0).toUpperCase() + part.slice(1)).join("") + ".";
  }
  function recordedCount(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  }
  // Prefer the transcript count. When it is zero or missing and the stored ridge carried a
  // real call count, print that count so /r/, the SPA strip, Explore and share agree.
  // A recorded zero beside a live ridge with no ridge_tool_calls contradicts the map; omit it.
  function toolCallCount(run) {
    if (!run) return null;
    const recorded = run.tool_calls;
    const fromRidge = run.ridge_tool_calls;
    if ((recorded == null || recorded === 0) && Number.isFinite(fromRidge) && fromRidge > 0)
      return fromRidge;
    const ridge = Array.isArray(run.ridge) ? run.ridge : null;
    const ridgeLive =
      ridge &&
      ridge.length &&
      ridge.every((v) => Number.isFinite(v) && v >= 0) &&
      ridge.some((v) => v > 0);
    if (recorded === 0 && ridgeLive && !(Number.isFinite(fromRidge) && fromRidge > 0)) return null;
    return recorded == null ? null : recorded;
  }
  function sessionLabel(run) {
    if (!run) return null;
    const candidates = [
      run.ridge_basis === "wall-time" ? run.ridge_wall_seconds : null,
      run.wall_time_s,
      run.duration_s,
    ];
    const value = candidates.find((v) => typeof v === "number" && Number.isFinite(v) && v >= 0);
    if (value == null) return null;
    if (value < 60) return Math.round(value) + "s";
    const minutes = Math.round(value / 60);
    return minutes >= 60 ? Math.floor(minutes / 60) + "h " + (minutes % 60) + "m" : minutes + "m";
  }
  // At most three recorded facts from THIS run. Prefer the run row and the route geometry
  // that was drawn, not a generalised aggregate that can disagree with the card.
  function heroStats(run) {
    const cells = [];
    const add = (label, value) => {
      if (cells.length >= 3 || value == null || value === "") return;
      cells.push([label, String(value)]);
    };
    const route = run && run.code_route;
    const routeOk =
      route &&
      typeof route === "object" &&
      !Array.isArray(route) &&
      route.v === 1 &&
      !route.unavailable;
    const projects = routeOk && Array.isArray(route.projects) ? route.projects : [];
    const stops = routeOk && Array.isArray(route.stops) ? route.stops : [];
    if (projects.length > 1) add("Projects", projects.length);
    const commits = recordedCount(run && run.commits);
    if (commits != null) add("Commits", commits);
    const files = recordedCount(run && run.files_touched);
    if (files != null) add("Files", files);
    const measured = stops.filter((s) => s && s.basis === "measured").length;
    if (measured > 0) add("Measured stops", measured);
    add("Session", sessionLabel(run));
    const turns = recordedCount(run && (run.prompts ?? run.turns_typed));
    if (turns != null) add("Turns", turns);
    // Same source as /r/ and the share image: transcript count, else ridge_tool_calls.
    const tools = recordedCount(toolCallCount(run));
    if (tools != null) add(observedProjection(run) ? "Observed calls (minimum)" : "Tool calls", tools);
    // Route.stats only fills gaps the run row left empty.
    if (cells.length < 3 && routeOk && route.stats && typeof route.stats === "object") {
      const stats = route.stats;
      if (commits == null && recordedCount(stats.commits) != null) add("Commits", stats.commits);
      if (files == null && recordedCount(stats.files_changed) != null) add("Files", stats.files_changed);
    }
    return cells;
  }
  function densestProject(route) {
    const projects = Array.isArray(route.projects) ? route.projects : [];
    const stops = Array.isArray(route.stops) ? route.stops : [];
    const counts = Object.create(null);
    for (const stop of stops) {
      if (!stop || !stop.project) continue;
      counts[stop.project] = (counts[stop.project] || 0) + 1;
    }
    let densest = null;
    let densestN = 0;
    let ties = 0;
    for (const project of projects) {
      const n = counts[project.id] || 0;
      if (n > densestN) {
        densest = project;
        densestN = n;
        ties = 1;
      } else if (n === densestN && n > 0) ties += 1;
    }
    return ties === 1 && densestN > 0 ? densest : null;
  }
  function readCodeRoute(run) {
    const route = run && run.code_route;
    if (!route || typeof route !== "object" || Array.isArray(route) || route.v !== 1) return null;
    try { validateCodeRoute(route); } catch (_) { return null; }
    return route;
  }
  function harnessHtml(route) {
    if (!route || !route.harnesses) return "";
    const observed = (route.harnesses.observed || []).map((h) => esc(h));
    const absent = (route.harnesses.absent || []).map((h) => esc(h));
    return (
      `<p class="code-route-harnesses">Harness populations · basis ${esc(route.harnesses.basis)}` +
      ` · observed: ${observed.length ? observed.join(", ") : "none"}` +
      ` · absent: ${absent.length ? absent.join(", ") : "none"}</p>`
    );
  }
    // Author-selected images only. Never invent stock. A lifestyle scene may sit beside a genuine
    // output image; the scene is atmosphere, not proof. No auto-publish from a camera roll.
    function isRasterUrl(href) {
      return safeUrl(href) && /\.(png|jpe?g|webp)([?#].*)?$/i.test(href);
    }
    function coverHtml(run) {
      const scene = run && isRasterUrl(run.image_url) ? run.image_url : null;
      const output =
        run && isRasterUrl(run.output_url) && run.output_url !== scene ? run.output_url : null;
      const slides = [];
      if (scene && output) {
        slides.push({ href: scene, kind: "scene", caption: "Scene" });
        slides.push({ href: output, kind: "output", caption: "Output" });
      } else if (scene) {
        slides.push({
          href: scene,
          kind: "cover",
          caption: "Cover",
        });
      } else if (output) {
        slides.push({ href: output, kind: "output", caption: "Output" });
      }
      if (!slides.length) return "";
      const figures = slides
        .map(
          (slide) =>
            `<figure class="run-cover-slide" data-kind="${esc(slide.kind)}">` +
            `<img src="${esc(slide.href)}" alt="" width="1200" height="630" loading="lazy" decoding="async" referrerpolicy="no-referrer" />` +
            (slides.length > 1 || slide.kind === "scene"
              ? `<figcaption class="meta">${esc(slide.caption)}</figcaption>`
              : "") +
            `</figure>`,
        )
        .join("");
      return `<div class="run-cover${slides.length > 1 ? " run-cover-gallery" : ""}">${figures}</div>`;
    }
    function eventChip(run) {
      // At most one author-chosen external link on the card. No event directory or calendar UI.
      const receipts = Array.isArray(run && run.receipts) ? run.receipts : [];
      for (const row of receipts) {
        if (!row || typeof row.label !== "string" || !safeUrl(row.url)) continue;
        const label = row.label.trim();
        const match = /^event:\s*(.+)$/i.exec(label);
        if (!match) continue;
        const name = match[1].trim().slice(0, 80);
        if (!name) continue;
        return (
          `<p class="run-event-chip meta">` +
          `<a href="${esc(row.url)}" rel="noopener noreferrer nofollow" target="_blank">${esc(name)}</a>` +
          `</p>`
        );
      }
      return "";
    }
    function routeShape(route, run) {
      const projects = Array.isArray(route && route.projects) ? route.projects : [];
      const stops = Array.isArray(route && route.stops) ? route.stops : [];
      if (projects.length >= 2 && stops.length >= 2) return "day";
      const harness = String((run && run.harness) || "").toLowerCase();
      if (/grok|bot/.test(harness)) return "agent";
      // Measured capture routes (edit + commit, one project) use the Code Route map, same
      // wording as /r/. A lonely declared stop stays a short work path.
      const measured = stops.filter((s) => s && s.basis === "measured").length;
      if (projects.length >= 1 && measured >= 2) return "day";
      return "fix";
    }
    function compactWorkPath(route, run) {
      const stops = Array.isArray(route.stops) ? route.stops : [];
      if (!stops.length) return "";
      const shape = routeShape(route, run);
      const titles =
        shape === "agent"
          ? ["Action", "Work", "Output"]
          : ["Before", "Change", "Result"];
      const finishId = route.finish && route.finish.stop;
      const finish = finishId ? stops.find((s) => s.id === finishId) : null;
      const first = stops[0];
      const last = finish || stops[stops.length - 1];
      const mid =
        stops.length >= 3
          ? stops[Math.floor((stops.length - 1) / 2)]
          : stops.length === 2
            ? null
            : first;
      const stages = [
        { title: titles[0], stop: first },
        {
          title: titles[1],
          stop: mid,
          bridge: !mid && stops.length === 2 ? (first.kind || "change") : null,
        },
        { title: titles[2], stop: last },
      ];
      const insight = routeInsight(route);
      const project =
        Array.isArray(route.projects) && route.projects[0]
          ? route.projects[0].label
          : null;
      const cells = stages
        .map((stage) => {
          if (stage.bridge) {
            return (
              `<li class="work-path-stage work-path-bridge">` +
              `<span class="work-path-title">${esc(stage.title)}</span>` +
              `<span class="work-path-label">${esc(stage.bridge)}</span>` +
              `</li>`
            );
          }
          const stop = stage.stop;
          const label = stop
            ? stop.label
            : shape === "agent"
              ? "not recorded"
              : "not recorded";
          const kind = stop ? stop.kind : "";
          return (
            `<li class="work-path-stage">` +
            `<span class="work-path-title">${esc(stage.title)}</span>` +
            (kind ? `<span class="work-path-kind">${esc(kind)}</span>` : "") +
            `<span class="work-path-label">${esc(label)}</span>` +
            `</li>`
          );
        })
        .join("");
      const aria =
        (shape === "agent" ? "Agent lane" : "Quick fix path") +
        (project ? ` on ${project}` : "") +
        (insight ? ` · ${insight}` : "");
      return (
        `<section class="work-path" data-shape="${esc(shape)}" aria-label="${esc(aria)}">` +
        `<div class="run-story-label">${shape === "agent" ? "Agent lane" : "Work path"}</div>` +
        `<ol class="work-path-stages">${cells}</ol>` +
        (project ? `<p class="work-path-project">${esc(project)}</p>` : "") +
        (insight ? `<p class="code-route-insight">${esc(insight)}</p>` : "") +
        `</section>`
      );
    }
    function codeRouteMap(route, run) {
      const projects = Array.isArray(route.projects) ? route.projects : [];
      const stops = Array.isArray(route.stops) ? route.stops : [];
      if (!projects.length || !stops.length) return "";
      const projectIndex = Object.fromEntries(projects.map((p, i) => [p.id, i]));
      const n = Math.max(1, projects.length);
      const left = 28;
      const width = 360;
      const rowH = 28;
      const top = 18;
      const height = top + n * rowH + 12;
      const finishId = route.finish && route.finish.stop;
      const handoffTo = new Set(
        (Array.isArray(route.connectors) ? route.connectors : [])
          .filter((c) => c && c.kind === "handoff" && c.to)
          .map((c) => c.to)
      );
      const dense = densestProject(route);
      const insight = routeInsight(route);
      const points = stops.map((stop, i) => {
        const row = projectIndex[stop.project] ?? 0;
        const x = left + (i * (width - left - 16)) / Math.max(1, stops.length - 1);
        const y = top + row * rowH + rowH / 2;
        return { stop, x, y, finish: stop.id === finishId, handoff: handoffTo.has(stop.id) };
      });
      const line = points
        .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
        .join(" ");
      const dots = points
        .map((p) => {
          const r = p.finish ? 5.5 : p.handoff ? 4.5 : 3.5;
          const cls = p.finish ? "code-route-finish" : p.handoff ? "code-route-handoff" : "code-route-stop";
          return `<circle class="${cls}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}" />`;
        })
        .join("");
      const laneLabels = projects
        .map((p, i) => {
          const y = top + i * rowH + rowH / 2 + 4;
          return `<text class="code-route-lane" x="0" y="${y}">${i + 1}</text>`;
        })
        .join("");
      const projectList = projects
        .map((p, i) =>
          `<li${dense && p.id === dense.id ? ' data-dense="1"' : ""}>` +
          `<span class="code-route-lane-mark" aria-hidden="true">${i + 1}</span>` +
          `<span class="code-route-project-name">${esc(p.label)}</span></li>`
        )
        .join("");
      const projectNames = projects.map((p) => p.label).join(", ");
      const measured = stops.filter((s) => s.basis === "measured").length;
      const declared = stops.filter((s) => s.basis === "declared").length;
      const aria =
        `Code Route across ${projects.length} project${projects.length === 1 ? "" : "s"}: ${projectNames}. ` +
        `${stops.length} ordered checkpoints · ${measured} measured · ${declared} declared` +
        (route.finish ? ` · finish ${route.finish.label}` : "") +
        (insight ? ` · ${insight}` : "");
      return (
        `<section class="code-route" data-shape="day" aria-label="${esc(aria)}">` +
        `<div class="run-story-label">Code Route</div>` +
        `<svg class="code-route-map" viewBox="0 0 ${width} ${height}" role="img" aria-hidden="true">` +
        `<path class="code-route-line" pathLength="1" d="${line}" fill="none" stroke="currentColor" stroke-width="2.5" />` +
        dots +
        laneLabels +
        `</svg>` +
        `<ol class="code-route-projects">${projectList}</ol>` +
        (insight ? `<p class="code-route-insight">${esc(insight)}</p>` : "") +
        `</section>`
      );
    }
    function codeRoute(run) {
      const route = readCodeRoute(run);
      if (!route) return "";
      if (route.unavailable) {
        return (
          `<section class="code-route code-route-unavailable" aria-label="Code Route unavailable">` +
          `<div class="run-story-label">Code Route</div>` +
          `<p class="code-route-why">${esc(route.unavailable.why)}</p>` +
          `</section>`
        );
      }
      const projects = Array.isArray(route.projects) ? route.projects : [];
      const stops = Array.isArray(route.stops) ? route.stops : [];
      if (!projects.length || !stops.length) return "";
      // Day runs earn the multi-lane map. A quick fix or agent lane is a short path, never a lonely dot.
      if (routeShape(route, run) === "day") return codeRouteMap(route, run);
      return compactWorkPath(route, run);
    }
  function codeRouteDetail(run) {
    const route = readCodeRoute(run);
    if (!route) return "";
    if (route.unavailable) return harnessHtml(route);
    const projects = Array.isArray(route.projects) ? route.projects : [];
    const stops = Array.isArray(route.stops) ? route.stops : [];
    if (!projects.length || !stops.length) return harnessHtml(route);
    const projectIndex = Object.fromEntries(projects.map((p, i) => [p.id, i]));
    const finishId = route.finish && route.finish.stop;
    const stopList = stops
      .map((stop) => {
        const project = projects.find((p) => p.id === stop.project);
        const lane = project ? (projectIndex[project.id] ?? 0) + 1 : null;
        const evidence = Array.isArray(stop.evidence) && stop.evidence.length
          ? `<ul>${stop.evidence.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>`
          : "";
        const finishMark = stop.id === finishId ? ' data-finish="1"' : "";
        return (
          `<details class="code-route-point"${finishMark}>` +
          `<summary>` +
          `<span class="code-route-kind">${esc(stop.kind)}</span>` +
          `<span class="code-route-stop-label">${esc(stop.label)}</span>` +
          `<span class="code-route-basis">${esc(stop.basis)}</span>` +
          (project
            ? `<span class="code-route-stop-project">${lane != null ? `${lane} · ` : ""}${esc(project.label)}</span>`
            : "") +
          `</summary>` +
          evidence +
          `</details>`
        );
      })
      .join("");
    return `<div class="code-route-stops">${stopList}</div>` + harnessHtml(route);
  }
  const api = { observedProjection, validate, message, trace, ridge, outcome, coverHtml, eventChip, heroStats, toolCallCount, codeRoute, codeRouteDetail, routeInsight, routeShape, mountRunMaps, sittingsComparable, headlineMetric, rejectPaths, projectLabel, tree };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GrinderContract = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
