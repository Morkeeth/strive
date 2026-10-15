window.GrinderPractices = function ({ client: db, me, app, frame, status }) {
  const esc = (x) =>
    String(x ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const $ = (id) => document.getElementById(id);
  async function data(query) {
    const { data, error } = await query;
    if (error) throw Error(error.message);
    return data || [];
  }
  const fail = (e) => status(GrinderContract.message(e), true);
  function start(title) {
    frame(null, null);
    app().innerHTML =
      (typeof myRunsTabs === "function"
        ? myRunsTabs("practices")
        : '<nav class="social-nav"><a href="/?practices">Practices</a><a href="/?mine">My runs</a><a href="/?progress">Progress</a></nav>') +
      '<div class="head"><h2>' +
      esc(title) +
      '</h2></div><div id="practice-body" aria-live="polite">Loading…</div>';
  }
  function bind(id, callback) {
    const form = $(id);
    if (!form) return;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const button = form.querySelector("button");
      button.disabled = true;
      try {
        await callback(form);
      } catch (error) {
        fail(error);
      } finally {
        button.disabled = false;
      }
    };
  }
  const options = (rows, key, label = (r) => r[key] || r.id.slice(0, 8)) =>
    rows
      .map(
        (r) =>
          `<option value="${r.id}">${esc(label(r))}</option>`,
      )
      .join("");
  async function ownRuns() {
    return me()
      ? data(
          db
            .from("runs")
            .select("id,title,started_at,measurement_revision")
            .eq("profile_id", me().id)
            .not("measurement_revision", "is", null)
            .order("created_at", { ascending: false })
            .limit(100),
        )
      : [];
  }
  const runLabel = (r) => {
    const when = r.started_at && Number.isFinite(Date.parse(r.started_at))
      ? ` · ${new Date(r.started_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`
      : " · session time unknown";
    return `${r.title || "Untitled run"}${when}`;
  };
  const runOptions = (rows) => options(rows, "title", runLabel);
  const eligibleOutcomeRuns = (attempt, runs) =>
    GrinderPracticeEligibility.outcomeRuns(attempt, runs);
  async function index() {
    start("A practice worth trying");
    try {
      const rows = await data(
        db
          .from("grinder_practice_versions")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100),
      );
      const crews = me()
        ? await data(
            db
              .from("grinder_memberships")
              .select("crew_id,crew:grinder_crews(id,name)")
              .eq("profile_id", me().id),
          )
        : [];
      $("practice-body").innerHTML =
        '<p>Find a change for the task in front of you. Read the attempts, including changes that did not help.</p><form id="practice-filter" class="reply-form"><label>Find by task, practice or harness<input name="query" type="search" placeholder="Tests, debugging, Cursor…"></label><button>Find practices</button></form><div id="practice-list"></div>' +
        (me()
          ? `<details class="panel"><summary>Share a practice</summary><form id="practice-create" class="reply-form"><label>Name<input name="title" required maxlength="160"></label><label>Task context<textarea name="context" required maxlength="2000"></textarea></label><label>What to try<textarea name="instruction" required maxlength="4000"></textarea></label><label>Expected change<input name="expected" required maxlength="2000"></label><label>Harness<input name="harness" maxlength="100"></label><label>Audience<select name="audience" aria-label="Audience"><option value="private">Only me</option><option value="public">Public</option>${crews.map((x) => (x.crew ? `<option value="${x.crew.id}">Crew: ${esc(x.crew.name)}</option>` : "")).join("")}</select></label><p>Sharing exposes the text you enter. Leave out private project details.</p><button>Save practice version</button></form></details>`
          : "<p>Sign in to create a practice or start an attempt.</p>");
      function show(query = "") {
        const selected = rows.filter((r) =>
          [r.title, r.task_context, r.instruction, r.harness]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase()),
        );
        $("practice-list").innerHTML =
          selected
            .map(
              (r) =>
                `<article class="card"><small>${esc(globalThis.StriveAgents?.agentName(r.harness) || r.harness || "Any harness")} · ${esc(r.visibility)}</small><h3><a href="/?practice=${r.id}">${esc(r.title)}</a></h3><p>${esc(r.task_context)}</p><p>Try: ${esc(r.instruction)}</p></article>`,
            )
            .join("") || "<p>No matching practices yet.</p>";
      }
      show();
      bind("practice-filter", async (f) => show(f.elements.query.value));
      let sourceRun = null;
      const fromReply = new URLSearchParams(location.search).get('from_reply');
      if (me() && /^[0-9a-f-]{36}$/i.test(fromReply || '')) {
        const source = await data(db.from('grinder_replies').select('id,run_id,body').eq('id',fromReply));
        if (source[0]) {
          const create=$('practice-create');create.closest('details').open=true;
          create.elements.instruction.value=source[0].body;
          create.elements.audience.value='private';sourceRun=source[0].run_id;
          const origin=document.createElement('p');origin.innerHTML='<a href="/?run='+sourceRun+'#reply-'+source[0].id+'">Source conversation</a> · Turn this suggestion into one action. Your draft starts private.';
          create.prepend(origin);
        } else status('The source reply is private, deleted or unavailable. You can still write a practice.');
      }
      bind("practice-create", async (f) => {
        const v = f.elements,
          a = v.audience.value;
        const row = {
          owner_id: me().id,
          source_run: sourceRun,
          title: v.title.value,
          task_context: v.context.value,
          instruction: v.instruction.value,
          expected: v.expected.value,
          harness: v.harness.value,
          visibility: ["private", "public"].includes(a) ? a : "crew",
          crew_id: ["private", "public"].includes(a) ? null : a,
        };
        const saved = await data(
          db.from("grinder_practice_versions").insert(row).select("id"),
        );
        location.href = "/?practice=" + saved[0].id;
      });
    } catch (e) {
      $("practice-body").textContent = "Practices could not load.";
      fail(e);
    }
  }
  function comparison(attempt) {
    const before = attempt.baseline || {},
      after = attempt.outcome || {};
    const val = (x) => (x === null || x === undefined ? "Unknown" : esc(x));
    const observed = attempt.note
      ? `<p><strong>Observed outcome:</strong> ${esc(attempt.note)}</p>`
      : "<p>No observed outcome recorded yet. A score alone is not the payoff.</p>";
    const verdict =
      typeof GrinderContract === "object" && GrinderContract.sittingsComparable
        ? GrinderContract.sittingsComparable(attempt.baseline, attempt.outcome, attempt)
        : {
            ok: false,
            why: "Comparison rules could not load. Read these as two separate sittings.",
          };
    const comparable = !!attempt.outcome && verdict.ok;
    return (
      '<div class="comparison-status"><h2>' +
      (comparable ? "Comparable under the same measurements" : "Read these as two separate sittings") +
      "</h2><p>" +
      esc(verdict.why) +
      "</p></div>" +
      observed +
      '<div class="comparison"><div>' +
      GrinderContract.trace(before) +
      "</div><div>" +
      GrinderContract.trace(after) +
      "</div><div><strong>Frozen baseline</strong><small>" +
      esc((before.measurement_revision || "").slice(0, 12)) +
      "</small></div><div><strong>Observed outcome</strong><small>" +
      esc((after.measurement_revision || "").slice(0, 12) || "Not recorded") +
      "</small></div>" +
      ["turns_typed", "claims_verified", "artifacts_produced", "duration_s"]
        .map(
          (k) =>
            `<div><small>${esc(k.replaceAll("_", " "))}</small>${val(before[k])}</div><div><small>${esc(k.replaceAll("_", " "))}</small>${val(after[k])}</div>`,
        )
        .join("") +
      "</div>"
    );
  }
  function returnBrief(attempt, runs) {
    const baseline = attempt.baseline || {};
    const baselineTime = baseline.started_at && Number.isFinite(Date.parse(baseline.started_at))
      ? new Date(baseline.started_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
      : "session time unknown";
    const later = eligibleOutcomeRuns(attempt, runs);
    return `<section class="return-brief panel"><p class="meta">RETURN REVIEW</p><h3>${attempt.reviewed_at ? "This return is recorded" : "Your baseline is saved"}</h3><p>${attempt.reviewed_at ? "This attempt is fixed. Start another attempt for the next cycle." : "Come back after a later run. Choose that session below and record what changed; if the evidence is missing or unlike the baseline, keep the result incomparable."}</p><p><strong>Baseline:</strong> ${esc(baselineTime)} · ${esc(globalThis.StriveAgents?.agentName(baseline.harness) || baseline.harness || "Harness unknown")}</p>${later.length || attempt.reviewed_at ? "" : "<p class=\"hint\">No later measured session is available yet. The outcome can stay unknown until you return.</p>"}</section>`;
  }
  async function detail(id) {
    start("Try, then tell us");
    try {
      const p = (
        await data(
          db.from("grinder_practice_versions").select("*").eq("id", id),
        )
      )[0];
      if (!p) {
        $("practice-body").textContent =
          "This practice is private or unavailable.";
        return;
      }
      const attempts = await data(
        db
          .from("grinder_practice_attempts")
          .select("*")
          .eq("practice_id", id)
          .order("created_at", { ascending: false })
          .limit(100),
      );
      const runs = await ownRuns();
      // Provenance for a practice kept from someone else's grind moment. Readable only by
      // the person who kept it. The source builder's counts are deliberately not rendered:
      // two numbers side by side would assert a relationship nobody verified.
      let kept = null;
      if (me())
        try {
          kept = (
            await data(
              db
                .from("grinder_adopted_moments")
                .select(
                  "moment_id,source_run,source_measurement_revision,source_measurement_stale,moment:grinder_run_moments(id,title)",
                )
                .eq("practice_id", id),
            )
          )[0] || null;
        } catch (e) {
          kept = null;
        }
      const keptHtml = kept
        ? `<section class="panel kept-from"><p class="meta">KEPT FROM ANOTHER BUILDER’S GRIND MOMENT</p>${
            kept.moment
              ? `<p><a href="/?run=${encodeURIComponent(kept.source_run)}&moment=${encodeURIComponent(kept.moment_id)}">${esc(kept.moment.title)}</a> · read their evidence and the limit they wrote.</p>`
              : "<p>That grind is no longer readable to you. Your practice, your frozen baseline and your review stay exactly as they are.</p>"
          }<p><small>Source measurement <code>${esc(String(kept.source_measurement_revision || "").slice(0, 12))}</code>${kept.source_measurement_stale ? " · that grind has been measured again since this moment was written" : ""}</small></p><p>Their counts are not shown here. The comparison below is your own baseline against your own later session, and it does not establish that this practice caused the difference.</p></section>`
        : "";
      $("practice-body").innerHTML =
        `<article class="card"><small>${esc(p.visibility)} · ${esc(globalThis.StriveAgents?.agentName(p.harness) || p.harness || "Any harness")}</small><h2>${esc(p.title)}</h2><p>${esc(p.task_context)}</p><h3>Try this</h3><p>${esc(p.instruction)}</p><p>Expected: ${esc(p.expected)}</p><small>A saved version. An outcome is an observation, not proof that this practice caused it.</small></article>` +
        keptHtml +
        (me()
          ? `<form id="start-attempt" class="panel reply-form"><h3>Start with a baseline</h3><label>Your earlier grind<select name="baseline" required>${options(runs, "title")}</select></label><label><input name="shared" type="checkbox"> Share my baseline counts, outcome counts and reflection with everyone who can read this practice</label><button ${runs.length ? "" : "disabled"}>Start attempt</button>${runs.length ? "" : "<p>Import a grind with a measurement revision first.</p>"}</form>`
          : "") +
        "<h3>Attempts and decisions</h3>" +
        attempts
          .map(
            (a) =>
              `<article class="card" id="attempt-${a.id}"><small>${a.visibility === "private" ? "Only you" : "Shared with practice readers"}</small><h3>${esc(a.decision || "In progress")}</h3>${returnBrief(a, runs)}${comparison(a)}<p>${esc(a.note || "")}</p>${me()?.id === a.owner_id && a.reviewed_at ? `<button type="button" class="ghost" id="share-return-${a.id}">Share my outcome</button><div class="return-export" id="return-export-${a.id}"></div>` : ""}${me()?.id === a.owner_id && !a.reviewed_at ? `<form id="review-${a.id}" class="reply-form"><label>Did you try the practice?<select name="tried"><option value="true">Yes</option><option value="false">No</option></select></label><label>Session after you started this attempt<select name="run"><option value="">No measured outcome (keep unknown)</option>${runOptions(eligibleOutcomeRuns(a, runs))}</select></label><p class="hint">Only measured sessions from this attempt onward and not in the future are offered. Choose no outcome when the change was not measured.</p><label>Your decision<select name="decision"><option value="incomparable">Incomparable / missing evidence</option><option value="keep">Keep</option><option value="change">Change</option><option value="drop">Drop</option></select></label><label>What happened?<textarea name="note" maxlength="4000"></textarea></label><p>This review is fixed once saved. Start another attempt for the next cycle.</p><button>Save review</button></form>` : ""}</article>`,
          )
          .join("") +
        (attempts.length
          ? ""
          : "<p>No shared attempts yet. Unknown and unsuccessful outcomes belong here too.</p>");
      bind("start-attempt", async (f) => {
        await data(
          db.rpc("grinder_start_attempt", {
            practice: id,
            baseline_run: f.elements.baseline.value,
            share: f.elements.shared.checked,
          }),
        );
        await detail(id);
      });
      for (const a of attempts) {
        const share = $("share-return-" + a.id);
        if (share) share.onclick = () => {
          app().querySelectorAll(".return-export").forEach(slot => { slot.innerHTML = ""; });
          GrinderSharing.mountReview({attempt: a, viewerId: me()?.id,
            slot: $("return-export-" + a.id), status});
        };
      }
      for (const a of attempts)
        bind("review-" + a.id, async (f) => {
          const v = f.elements;
          await data(
            db.rpc("grinder_review_attempt", {
              attempt: a.id,
              outcome_run: v.run.value || null,
              was_tried: v.tried.value === "true",
              choice: v.decision.value,
              reflection: v.note.value,
            }),
          );
          await detail(id);
        });
    } catch (e) {
      $("practice-body").textContent = "This practice could not load.";
      fail(e);
    }
  }
  async function experiments(crewId) {
    start("Crew experiments");
    if (!me()) {
      $("practice-body").textContent = "Sign in to open Crew experiments.";
      return;
    }
    try {
      const crew = (
        await data(db.from("grinder_crews").select("*").eq("id", crewId))
      )[0];
      if (!crew) {
        $("practice-body").textContent = "This Crew is private or unavailable.";
        return;
      }
      const rows = await data(
        db
          .from("grinder_experiments")
          .select("*")
          .eq("crew_id", crewId)
          .order("created_at", { ascending: false }),
      );
      const choices = (
        await data(db.from("grinder_practice_versions").select("*"))
      ).filter(
        (p) =>
          p.visibility === "public" ||
          (p.visibility === "crew" && p.crew_id === crewId),
      );
      $("practice-body").innerHTML =
        `<p>${esc(crew.name)} · visible only to current Crew members</p><p>Choose a practice, record a baseline and run another session. Each cycle keeps the observation and your adoption decision.</p>` +
        rows
          .map(
            (r) =>
              `<article class="card"><h3><a href="/?experiment=${r.id}">${esc(r.name)}</a></h3><p>${esc(r.intention)}</p></article>`,
          )
          .join("") +
        `<form id="create-experiment" class="panel reply-form"><h3>Start a shared experiment</h3><label>Name<input name="title" required maxlength="160"></label><label>What do you want to learn?<textarea name="intent" required maxlength="2000"></textarea></label><label>Practice version<select name="practice" required>${options(choices, "title")}</select></label><button ${choices.length ? "" : "disabled"}>Create experiment</button>${choices.length ? "" : "<p>Share a practice with the Crew first.</p>"}</form>`;
      bind("create-experiment", async (f) => {
        const v = f.elements;
        const id = await data(
          db.rpc("grinder_create_experiment", {
            crew: crewId,
            practice: v.practice.value,
            title: v.title.value,
            intent: v.intent.value,
          }),
        );
        location.href = "/?experiment=" + id;
      });
    } catch (e) {
      $("practice-body").textContent = "Experiments could not load.";
      fail(e);
    }
  }
  async function experiment(id) {
    start("Learn across sessions");
    if (!me()) {
      $("practice-body").textContent = "Sign in to open this experiment.";
      return;
    }
    try {
      const experiment = (
        await data(db.from("grinder_experiments").select("*").eq("id", id))
      )[0];
      if (!experiment) {
        $("practice-body").textContent =
          "This experiment is private or unavailable.";
        return;
      }
      const cycles = await data(
        db
          .from("grinder_experiment_cycles")
          .select("*")
          .eq("experiment_id", id)
          .order("created_at", { ascending: false }),
      );
      const runs = await ownRuns();
      $("practice-body").innerHTML =
        `<article class="card"><h2>${esc(experiment.name)}</h2><p>${esc(experiment.intention)}</p>${experiment.practice_id ? `<a href="/?practice=${experiment.practice_id}">Locked practice version</a>` : "<small>Source practice removed; cycle results retained</small>"}<p>Only Crew members can read these cycles. Decisions are participant observations, not independent causal results.</p></article><form id="start-cycle" class="panel reply-form"><h3>Begin the next cycle</h3><label>Your baseline grind<select name="baseline" required>${options(runs, "title")}</select></label><p>Starting shares the baseline counts and your later outcome and reflection with this Crew.</p><button ${runs.length ? "" : "disabled"}>Share baseline and start</button></form>` +
        cycles
          .map(
            (c) =>
              `<article class="card"><h3>${esc(c.decision || "In progress")}</h3>${comparison(c)}<p>${esc(c.reflection || "")}</p>${c.owner_id === me().id && !c.reviewed_at ? `<form class="reply-form" id="cycle-${c.id}"><label>New session<select name="run"><option value="">No measured outcome</option>${options(runs, "title")}</select></label><label>Decision<select name="decision"><option value="incomparable">Incomparable</option><option value="adopt">Adopt this practice</option><option value="revert">Revert</option></select></label><label>What happened?<textarea name="reflection" maxlength="4000"></textarea></label><button>Save cycle decision</button></form>` : ""}</article>`,
          )
          .join("");
      bind("start-cycle", async (f) => {
        await data(
          db.rpc("grinder_start_cycle", {
            experiment: id,
            baseline_run: f.elements.baseline.value,
          }),
        );
        await experimentView(id);
      });
      for (const c of cycles)
        bind("cycle-" + c.id, async (f) => {
          const v = f.elements;
          await data(
            db.rpc("grinder_review_cycle", {
              cycle: c.id,
              outcome_run: v.run.value || null,
              choice: v.decision.value,
              reflection_text: v.reflection.value,
            }),
          );
          await experimentView(id);
        });
    } catch (e) {
      $("practice-body").textContent = "This experiment could not load.";
      fail(e);
    }
  }
  const experimentView = experiment;
  return { index, detail, experiments, experiment };
};
