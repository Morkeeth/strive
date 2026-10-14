(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GrinderSegments = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );

  function measured(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : Number.POSITIVE_INFINITY;
  }

  function rankRuns(runs) {
    const sorted = [...(runs || [])].sort(
      (a, b) =>
        measured(a.wall_time_s) - measured(b.wall_time_s) ||
        measured(a.tool_calls) - measured(b.tool_calls) ||
        String(a.id || "").localeCompare(String(b.id || "")),
    );
    let previous = null;
    return sorted.map((run, index) => {
      const key = `${measured(run.wall_time_s)}:${measured(run.tool_calls)}`;
      const rank = key === previous?.key ? previous.rank : index + 1;
      previous = { key, rank };
      return { ...run, rank };
    });
  }

  function duration(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "Unknown";
    const whole = Math.round(seconds);
    const minutes = Math.floor(whole / 60);
    const remainder = whole % 60;
    return minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
  }

  function safeLink(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" ? url.href : null;
    } catch (_) {
      return null;
    }
  }

  function trace(run) {
    if (
      typeof window !== "undefined" &&
      window.GrinderContract?.trace
    ) {
      return window.GrinderContract.trace(run);
    }
    return "";
  }

  function render(segment, runs) {
    const task = safeLink(segment.task_url);
    const repo = safeLink(segment.repo_url);
    const ranked = rankRuns(runs);
    const rows = ranked
      .map(
        (run) => `<article class="segment-row card">
          <div class="segment-place num" aria-label="Rank ${run.rank}">${run.rank}</div>
          <div class="segment-run">
            <h2><a href="/?run=${encodeURIComponent(run.id)}">${esc(run.title || "Untitled run")}</a></h2>
            <p class="segment-context"><span>Model</span> ${esc((run.model && globalThis.StriveAgents ? globalThis.StriveAgents.modelName(run.model) : run.model) || "Unknown")} <span>Project</span> ${esc(run.project || "Unknown")}</p>
            <div class="segment-trace" aria-hidden="true">${trace(run)}</div>
          </div>
          <dl class="segment-metrics">
            <div><dt>Wall time</dt><dd class="num">${duration(run.wall_time_s)}</dd></div>
            <div><dt>Tool calls</dt><dd class="num">${run.tool_calls ?? "Unknown"}</dd></div>
          </dl>
        </article>`,
      )
      .join("");
    return `<section class="segment-head">
      <p class="meta">PUBLIC SEGMENT</p>
      <h1>${esc(segment.name)}</h1>
      <p>${esc(segment.description)}</p>
      <div class="cta">${task ? `<a class="act blue" href="${esc(task)}">Open task</a>` : ""}${repo ? `<a class="act" href="${esc(repo)}">Open sample repo</a>` : ""}</div>
      <p class="segment-rule">Runs rank by recorded wall time, then by recorded tool calls; equal measurements share a place.</p>
    </section>
    <div class="head"><h2>Leaderboard</h2><span class="meta">${ranked.length} run${ranked.length === 1 ? "" : "s"}</span></div>
    <div class="segment-board">${rows || '<div class="card empty">No public runs have been posted against this segment yet.</div>'}</div>`;
  }

  async function mount({ client, id, slot, frame, status }) {
    frame(null, null, true);
    slot.innerHTML = '<div class="card empty">Loading segment...</div>';
    try {
      const segmentResult = await client
        .from("segments")
        .select("id,name,description,task_url,repo_url")
        .eq("id", id)
        .maybeSingle();
      if (segmentResult.error) throw segmentResult.error;
      if (!segmentResult.data) {
        slot.innerHTML = '<div class="card empty">This segment does not exist.</div>';
        return;
      }
      const runsResult = await client
        .from("runs")
        .select("id,title,project,model,wall_time_s,tool_calls,rhythm,segment_id,visibility")
        .eq("segment_id", id)
        .eq("visibility", "public");
      if (runsResult.error) throw runsResult.error;
      slot.innerHTML = render(segmentResult.data, runsResult.data || []);
    } catch (error) {
      slot.innerHTML =
        '<div class="card empty">This segment could not load. Please try again.</div>';
      if (status) status(error.message || String(error), true);
    }
  }

  async function loadChoices(client, select, selected) {
    if (!client || !select) return [];
    try {
      const result = await client
        .from("segments")
        .select("id,name")
        .order("id", { ascending: true });
      if (result.error) throw result.error;
      for (const segment of result.data || []) {
        const option = document.createElement("option");
        option.value = segment.id;
        option.textContent = `This run was on segment: ${segment.name}`;
        select.append(option);
      }
      if (selected) select.value = selected;
      return result.data || [];
    } catch (_) {
      return [];
    }
  }

  return { rankRuns, render, mount, loadChoices };
});
