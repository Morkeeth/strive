/* Outcome-first feed. Author story and linked visual lead; captured activity remains supporting evidence on detail. No productivity score or inferred result. */
(function (root) {
  "use strict";
  const context=typeof module!=="undefined"&&module.exports?require("./run-context.js"):root.StriveContext;
  const story=typeof module!=="undefined"&&module.exports?require("./run-story.js"):root.StriveStory;
  const historical=typeof module!=="undefined"&&module.exports?require("./historical-import.js"):root.StriveHistory;
  const evidence=typeof module!=="undefined"&&module.exports?require("./run-evidence.js"):root.StriveEvidence;
  const esc = (s) =>
    String(s ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]));
  const whole = (v) => (Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
  // Thousands with commas whatever the runtime locale, as agentgrinder/feedcard.py _thousands.
  const thousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  function durationLabel(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    const m = Math.round(seconds / 60);
    if (m < 1) return "<1m";
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
  }

  function when(iso) {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "";
    const days = Math.floor((Date.now() - t) / 86400000);
    if (days <= 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    const d = new Date(t);
    return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  }

  // The browser loads run-contract.js as a script; the server share page (server/public-run.mjs)
  // requires this file, so it takes the same contract by require and counts tool calls the same way.
  const contract = () =>
    root.GrinderContract ||
    (typeof module !== "undefined" && module.exports && typeof require === "function" ? require("./run-contract.js") : null);

  // THE TITLE. A folder name or a bare "<harness> sitting" is not a title a stranger can read:
  // "Users-morkeeth · Cursor sitting" printed an account name as the headline. Those, and an
  // empty title, become "<harness> session, 24 Sep", read from the run's own start in the
  // reader's time zone, the same day the meta line under the name gives.
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function dayOf(iso) {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "";
    const d = new Date(t);
    return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  }
  function titleOf(r) {
    const t = String(r.title ?? "").trim();
    const generic =
      !t || /(^|·\s*)-?Users-\S/.test(t) || /(^|·\s*)-?home-[a-z0-9_]+(\s*·|$)/.test(t) ||
      /(^|·\s*)(Cursor|Claude Code|Claude|Codex|Grok Bot|Agent) sitting$/i.test(t) || /^(untitled run|a run|agent run)$/i.test(t);
    if (!generic) return t;
    const day = dayOf(r.started_at || r.started || (observedProjection(r) ? null : r.created_at));
    return `${harnessName(r) || "Agent"} session${day ? `, ${day}` : ""}`;
  }

  // A run captured from a Claude Code subagent arrives with harness "claude-agent". On the card
  // it is Claude Code; the row keeps the raw value.
  function harnessName(r) {
    const h = r.harness ? String(r.harness) : "";
    return h === "claude-agent" ? "Claude Code" : h;
  }

  const observedProjection = r => r?.trace_basis === "observed native events; timestamps unavailable";
  function toolCalls(r) {
    const C = contract();
    return whole(C && C.toolCallCount ? C.toolCallCount(r) : r.tool_calls);
  }

  // The one number, Strava's distance slot: the first measured, non-zero value wins.
  function headline(r) {
    if(historical?.historical(r))return null;
    const commits = whole(r.commits);
    const files = whole(r.files_touched);
    const tools = toolCalls(r);
    const time = durationLabel(r.wall_time_s ?? r.duration_s);
    if (commits) return { n: thousands(commits), unit: commits === 1 ? "commit" : "commits", key: "commits" };
    if (files) return { n: thousands(files), unit: files === 1 ? "file changed" : "files changed", key: "files" };
    if (tools) return { n: thousands(tools), unit: observedProjection(r) ? "observed calls (minimum)" : "tool calls", key: "tools" };
    if (time) return { n: time, unit: "session", key: "time" };
    return null;
  }

  // Up to three small facts beside the headline, never repeating it.
  function stats(r, lead) {
    const out = [];
    const add = (key, label, value) => {
      if (out.length >= 3 || value == null || value === "" || (lead && (lead.key === key || lead.also === key)) || out.some((f) => f[0] === label)) return;
      out.push([label, value]);
    };
    add("time", "Time", durationLabel(r.wall_time_s ?? r.duration_s));
    const turns = whole(r.prompts ?? r.turns_typed);
    const tools = toolCalls(r);
    add("turns", "Turns", turns);
    add("tools", observedProjection(r) ? "Observed calls (minimum)" : "Tool calls", tools ? thousands(tools) : null);
    add("commits", "Commits", whole(r.commits) || null);
    add("files", "Files", whole(r.files_touched) || null);
    return out;
  }

  function recordedFacts(r) {
    return context?.cardFacts?context.cardFacts(r):(contract()?.heroStats(r)||[]);
  }

  function modelName(id){return id==='claude-opus-5-5'?'Claude Opus 5.5':id;}

  function cardSummary(r){return story?.summary(r)||'';}

  // THE BADGE. One small achievement per run, computed from the run's own numbers and nothing
  // else: no history, no other runs, no guess. The first rule that holds wins, and its detail line
  // prints the number that earned it, so a reader can check the badge against the card. A run that
  // earns none carries none. agentgrinder/feedcard.py achievement() is the same list.
  function hourOf(r) {
    return Number.isInteger(r.started_hour) && r.started_hour >= 0 && r.started_hour <= 23 ? r.started_hour : null;
  }

  function achievement(r) {
    if(historical?.historical(r))return null;
    if (r && r.trace_basis === "typed-by-author") return null;
    const secs = whole(r.wall_time_s ?? r.duration_s);
    const turns = whole(r.prompts ?? r.turns_typed);
    const tools = toolCalls(r);
    const commits = whole(r.commits);
    const files = whole(r.files_touched);
    const hour = hourOf(r);
    if (secs >= 10800) return { key: "marathon", label: "Marathon", detail: `${durationLabel(secs)} in one session` };
    if (turns === 1 && tools >= 60) return { key: "one-shot", label: "One-shot", detail: `1 prompt, ${thousands(tools)} tool calls` };
    if (hour != null && (hour >= 23 || hour < 5)) return { key: "night-owl", label: "Night owl", detail: hour >= 23 ? "started after 23:00" : "started before 05:00" };
    if (commits >= 5) return { key: "shipper", label: "Shipper", detail: `${thousands(commits)} commits in one run` };
    if (files >= 25) return { key: "wide-net", label: "Wide net", detail: `${thousands(files)} files changed` };
    if (turns >= 2 && tools && tools / turns >= 30) return { key: "delegator", label: "Delegator", detail: `${thousands(Math.round(tools / turns))} tool calls per prompt` };
    if (secs > 0 && secs < 900 && commits >= 1) return { key: "sprint", label: "Sprint", detail: "a commit in under 15 minutes" };
    if (secs >= 3600) return { key: "deep-focus", label: "Long stretch", detail: "over an hour between session timestamps" };
    if (hour != null && hour >= 5 && hour < 7) return { key: "early-bird", label: "Early bird", detail: "started before 07:00" };
    return null;
  }

  const BADGE_ICON =
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M5 1.5h6l-1.6 4.2M5 1.5l1.6 4.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="8" cy="10" r="4.2" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
  function badge(r) {
    const a = achievement(r);
    if (!a) return "";
    return `<p class="fc-badge" data-badge="${esc(a.key)}">${BADGE_ICON}<b>${esc(a.label)}</b><span>${esc(a.detail)}</span></p>`;
  }

  function profileOf(r) {
    const p = r.profiles || {};
    const A = root.GrinderAuth;
    const shown = A && A.present ? A.present(p) : null;
    const handle = (shown && shown.handle) || p.handle || p.github_handle || "";
    const name = p.display_name || p.name || handle || "Builder";
    // github_handle is guarded against the linked Auth identity by the database. A chosen
    // STRIVE handle and a legacy X label never establish ownership of those accounts.
    const github = /^[a-z0-9-]{1,39}$/i.test(p.github_handle || "") ? p.github_handle : null;
    const saved = /^https:\/\//i.test(p.avatar_url || "") ? p.avatar_url : null;
    return { handle, name, github, avatar: saved || (github ? `https://github.com/${encodeURIComponent(github)}.png?size=160` : (shown && shown.avatar_url) || null) };
  }

  const BRAND_FACE = '<svg viewBox="0 0 64 64" aria-hidden="true"><polyline points="10,44 20,36 28,40 36,20 44,30 54,16" fill="none" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="36" cy="20" r="5" fill="#fc4c02" stroke="white" stroke-width="2"/></svg>';
  // The same STRIVE mark is visible during loading and on an image error.
  function face(r, size) {
    const s = size || 40;
    if (r.visibility === "anonymous")
      return `<span class="fc-face fc-brand" style="--s:${s}px" aria-hidden="true">${BRAND_FACE}</span>`;
    const p = profileOf(r);
    const src = /^https:\/\//i.test(p.avatar || "") ? p.avatar : null;
    if (!src) return `<span class="fc-face fc-brand" style="--s:${s}px" aria-hidden="true">${BRAND_FACE}</span>`;
    return `<span class="fc-face fc-brand" style="--s:${s}px" aria-hidden="true">${BRAND_FACE}<img src="${esc(src)}" alt="" width="${s}" height="${s}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()"></span>`;
  }

  // A short sitting spread over 50 bins is a comb of ones and zeros, and a comb is not a shape
  // (agentgrinder/ingest.py says the same of the ridge). When the series holds fewer than two
  // calls per bin on average, neighbouring bins are added together until it does: the total is
  // kept, and an evenly spread sitting draws as the flat line it was.
  function settle(values) {
    const total = values.reduce((a, v) => a + v, 0);
    if (total >= 2 * values.length) return values;
    const n = Math.max(2, Math.min(values.length, Math.floor(total / 2)));
    if (n >= values.length) return values;
    const out = new Array(n).fill(0);
    values.forEach((v, i) => { out[Math.floor((i * n) / values.length)] += v; });
    return out;
  }

  // The drawing: the run's own activity over its length. The ridge when the run carries one, else
  // the rhythm. The tallest moment gets the one orange mark.
  function spark(r) {
    const raw = Array.isArray(r.ridge) && r.ridge.length > 1 ? r.ridge : Array.isArray(r.rhythm) && r.rhythm.length > 1 ? r.rhythm : null;
    if (!raw || raw.some((v) => !Number.isFinite(v) || v < 0)) return "";
    const src = settle(raw);
    const ridge=Array.isArray(r.ridge)&&r.ridge.length>1;
    const quantity=ridge||r.trace_basis==='elapsed-agent-tool-calls'?'Tool requests':r.trace_basis==='elapsed'||r.trace_basis==='timestamped native events'?'Human messages':'Recorded activity';
    const axis=ridge?(r.ridge_basis==='wall-time'?'elapsed time':r.ridge_basis==='turn-order'?'turn order':'call order'):(r.trace_basis==='position'?'event order':r.trace_basis==='elapsed'||r.trace_basis==='elapsed-agent-tool-calls'||r.trace_basis==='timestamped native events'?'elapsed time':'source order; timing unknown');
    const max = Math.max(...src);
    if (!max) return "";
    const w = 300, h = 56, top = 6;
    const x = (i) => (i * w) / (src.length - 1);
    const y = (v) => h - (v / max) * (h - top);
    const line = src.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const peak = src.indexOf(max);
    const px = ((peak / (src.length - 1)) * 100).toFixed(2);
    const py = ((y(max) / h) * 100).toFixed(2);
    return `<div class="fc-spark" aria-hidden="true"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polygon points="0,${h} ${line} ${w},${h}" class="fc-area"/><polyline points="${line}" class="fc-line"/></svg><span class="fc-peak" style="left:${px}%;top:${py}%"></span></div><p class="fc-source">${esc(quantity)} per slice · ${esc(axis)} · vertical 0–${max}. Activity, not result quality.</p>`;
  }

  // THE RUN MAP. The route the run took through the folders it touched (r.route: station
  // indices in first-visit order, one entry per move; agentgrinder/ingest.py folder_route and
  // site/dropin-parse.js folderRoute). Stations sit on a rail in the order the run first reached
  // them, sized by how often it was there; every move is one arc, forward over the rail and back
  // under it, so a run that kept returning to one folder draws a dense knot and a run that
  // walked the tree once draws a clean sweep. No folder is named: the map is the shape of the
  // work. Blue only; orange is spent on the peak and a sent XUDOS mark. A run that touched
  // two folders draws a short strip (h, rail and the arcs halved): the full box around one arc
  // reads as an empty map.
  const MAP_W = 300, MAP_H = 44, RAIL = 30, MAP_X0 = 12, MAP_X1 = 288;
  const MAP_SMALL = { h: 26, rail: 17, up: 13, down: 6 };
  const MAP_FULL = { h: MAP_H, rail: RAIL, up: 26, down: 12 };
  function routeGeometry(r) {
    const raw = Array.isArray(r.route) ? r.route : null;
    if (!raw || raw.some((v) => !Number.isInteger(v) || v < 0 || v > 15)) return null;
    // A stay is one visit, and stations are numbered by first appearance: rows saved before the
    // readers collapsed repeats, or with a gap in their numbering, draw the same map.
    const order = new Map();
    const seq = [];
    for (const v of raw) {
      if (!order.has(v)) order.set(v, order.size);
      const i = order.get(v);
      if (!seq.length || seq[seq.length - 1] !== i) seq.push(i);
    }
    if (seq.length < 2) return null;
    const n = order.size;
    const box = n <= 2 ? MAP_SMALL : MAP_FULL;
    const visits = new Array(n).fill(0);
    seq.forEach((v) => { visits[v] += 1; });
    const most = Math.max(...visits);
    const x = (i) => (n > 1 ? MAP_X0 + ((MAP_X1 - MAP_X0) * i) / (n - 1) : MAP_W / 2);
    const stations = visits.map((v, i) => [x(i), v ? 2.5 + 4.5 * Math.sqrt(v / most) : 2]);
    const hops = [];
    for (let k = 1; k < seq.length; k += 1) {
      const a = seq[k - 1], b = seq[k];
      if (a === b) continue;
      const xa = x(a), xb = x(b), span = Math.abs(xb - xa) / (MAP_X1 - MAP_X0);
      const cy = b > a ? box.rail - box.up * span : box.rail + box.down * span;
      hops.push(`M${xa.toFixed(1)},${box.rail} Q${((xa + xb) / 2).toFixed(1)},${cy.toFixed(1)} ${xb.toFixed(1)},${box.rail}`);
    }
    const moves = hops.length, returns = seq.length - n;
    const w = (k, one, many) => `${thousands(k)} ${k === 1 ? one : many}`;
    return { n, moves, returns, stations, hops, h: box.h, rail: box.rail, label: `${w(n, "folder", "folders")} · ${w(moves, "move", "moves")} · ${w(returns, "return", "returns")}` };
  }
  function routeMap(r) {
    const g = routeGeometry(r);
    if (!g) return "";
    const rail = `<line class="fc-rail" x1="${MAP_X0}" y1="${g.rail}" x2="${MAP_X1}" y2="${g.rail}"/>`;
    const hops = g.hops.map((d) => `<path class="fc-hop" d="${d}"/>`).join("");
    const stations = g.stations.map(([cx, cr]) => `<circle class="fc-stn" cx="${cx.toFixed(1)}" cy="${g.rail}" r="${cr.toFixed(1)}"/>`).join("");
    return `<div class="fc-map"><svg viewBox="0 0 ${MAP_W} ${g.h}" role="img" aria-label="Route: ${esc(g.label)}">${rail}${hops}${stations}</svg><p class="fc-map-k">${esc(g.label)}</p></div>`;
  }

  // One run, one signature visual. Every choice is offered only when its backing fields exist.
  // A stored preference that no longer has evidence falls back to the strongest supported view.
  function proofRoute(r) {
    if(checkpointView()?.claimed(r))return "";
    const route = r && r.code_route;
    const stops = route && route.v === 1 && !route.unavailable && Array.isArray(route.stops) ? route.stops.filter(Boolean) : [];
    if (stops.length < 2) return "";
    const problem = stops.find((s) => s.kind === "check" || s.kind === "fail") || stops[0];
    const change = stops.find((s) => ["artifact", "merge", "change"].includes(s.kind) && s.id !== problem.id) || stops[1];
    const checked = [...stops].reverse().find((s) => s.basis === "measured" && (s.kind === "check" || (Array.isArray(s.evidence) && s.evidence.length)));
    const result = (route.finish && route.finish.label) || (Array.isArray(r.shipped) && r.shipped[0]) || null;
    if (!problem?.label || !change?.label || !checked?.label || !result) return "";
    return `<dl class="fc-proof" aria-label="Proof Route">${[["Problem", problem.label], ["Change", change.label], ["Check", checked.label], ["Result", result]].map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`;
  }
  function resultVisual(r) {
    const shipped = Array.isArray(r.shipped) ? r.shipped.filter(Boolean) : [];
    const n = shipped.length;
    const label = shipped[0] || "";
    return n && label ? `<div class="fc-result" aria-label="Result"><b class="num">${n}</b><span>${esc(label)}</span></div>` : "";
  }
  function changeAtlas(r) {
    if(checkpointView()?.claimed(r))return "";
    const native = routeMap(r);
    if (native) return native;
    const route = r && r.code_route;
    const projects = route && route.v === 1 && !route.unavailable && Array.isArray(route.projects) ? route.projects.filter(Boolean) : [];
    const stops = route && Array.isArray(route.stops) ? route.stops.filter(Boolean) : [];
    if (!projects.length || !stops.length) return "";
    const byId = new Map(projects.map((p, i) => [p.id, i]));
    const w = 300, row = 18, h = Math.max(44, projects.length * row + 8);
    const points = stops.map((s, i) => ({ x: 10 + i * 280 / Math.max(stops.length - 1, 1), y: 8 + ((byId.get(s.project) || 0) * row) + row / 2 }));
    const line = points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    return `<div class="fc-atlas"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Change Atlas across ${projects.length} projects"><path d="${line}"/><g>${points.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3"/>`).join("")}</g></svg><p>${projects.map((p) => esc(p.label || p.id)).join(" · ")}</p></div>`;
  }
  function photoVisual(r) {
    const url = typeof r.image_url === "string" && /^https:\/\/[^\s<>"'\\]+\.(?:png|jpe?g|webp)(?:[?#].*)?$/i.test(r.image_url) ? r.image_url : "";
    return url ? `<div class="fc-photo"><img src="${esc(url)}" alt="Run photo" loading="lazy" referrerpolicy="no-referrer"></div>` : "";
  }
  function heroChoices(r) {
    if (r && r.trace_basis === "typed-by-author") return [];
    return [
      ["proof_route", proofRoute(r)],
      ["change_atlas", changeAtlas(r)],
      ["result", resultVisual(r)],
    ].filter((entry) => entry[1]);
  }
  function checkpointView(){return root.StriveCodeRoute||(typeof require==="function"?require("./code-route-view.js"):null);}
  function checkpointVisual(r){return checkpointView()?.render(r)||"";}
  function heroVisual(r) {
    const checkpoints=checkpointVisual(r);if(checkpoints)return checkpoints;
    if(historical?.historical(r))return historical.facts(r);
    const choices = heroChoices(r);
    const chosen = choices.find(([key]) => key === r.hero_visual) || choices[0];
    return chosen ? chosen[1] : "";
  }

  // THE STRIDE LINE. Wordle's grid for a run: two lines of plain text a person pastes into a
  // reply, spoiler-free (no prompt, no code, no repo), readable with zero other users. The first
  // line is the card's own figures in the card's own order; the second is the activity line as
  // twelve bars and, when the card has an address, the address.
  const BARS = "▁▂▃▄▅▆▇█";
  function strideBins(r) {
    const raw = Array.isArray(r.ridge) && r.ridge.length > 1 ? r.ridge : Array.isArray(r.rhythm) && r.rhythm.length > 1 ? r.rhythm : null;
    if (!raw || raw.some((v) => !Number.isFinite(v) || v < 0)) return null;
    const src = settle(raw);
    const ridge=Array.isArray(r.ridge)&&r.ridge.length>1;
    const quantity=ridge||r.trace_basis==='elapsed-agent-tool-calls'?'Tool requests':r.trace_basis==='elapsed'||r.trace_basis==='timestamped native events'?'Human messages':'Recorded activity';
    const axis=ridge?(r.ridge_basis==='wall-time'?'elapsed time':r.ridge_basis==='turn-order'?'turn order':'call order'):(r.trace_basis==='position'?'event order':r.trace_basis==='elapsed'||r.trace_basis==='elapsed-agent-tool-calls'||r.trace_basis==='timestamped native events'?'elapsed time':'source order; timing unknown');
    const n = Math.min(12, src.length);
    const bins = new Array(n).fill(0);
    src.forEach((v, i) => { bins[Math.floor((i * n) / src.length)] += v; });
    const max = Math.max(...bins);
    if (!max) return null;
    // Square-root steps: a burst at the start must not flatten the rest of the night to ▁.
    return { bars: bins.map((v) => BARS[Math.round(Math.sqrt(v / max) * 7)]), peak: bins.indexOf(max) };
  }
  function strideBars(r) {
    const b = strideBins(r);
    return b ? b.bars.join("") : "";
  }
  function strideFirst(r) {
    return ['STRIVE',titleOf(r),story.summary(r)].filter(Boolean).join(' · ');
  }
  const where = (url) => (url ? String(url).replace(/^https?:\/\//, "") : "");
  function strideText(r, url) {
    const first = strideFirst(r);
    const second = [strideBars(r), where(url)].filter(Boolean).join("  ");
    return second ? `${first}\n${second}` : first;
  }
  // The same two lines as markup: the bars in a monospace run, the tallest one the card's peak
  // mark. What is copied stays strideText, plain characters.
  function strideHtml(r, url) {
    const b = strideBins(r);
    const bars = b
      ? `<span class="fc-bars">${b.bars.map((c, i) => (i === b.peak ? `<b>${c}</b>` : c)).join("")}</span>`
      : "";
    const at = where(url) ? `<span class="fc-where">${esc(where(url))}</span>` : "";
    const second = [bars, at].filter(Boolean).join("  ");
    const first = esc(strideFirst(r));
    return second ? `${first}\n${second}` : first;
  }
  function stride(r, opts) {
    const text = strideText(r, opts && opts.url);
    const copy = opts && opts.copy ? `<button type="button" class="fc-copy" data-copy="${esc(text)}">Copy</button>` : "";
    return `<div class="fc-stride"><pre>${strideHtml(r, opts && opts.url)}</pre>${copy}</div>`;
  }
  // Copy, and Share where the device offers a share sheet. Per surface: the local card the
  // command line writes carries no script at all, so it draws no button.
  function wireStride(scope) {
    (scope || document).querySelectorAll(".fc-copy:not([data-wired])").forEach((b) => {
      b.dataset.wired = "true";
      // Read at the click, not at wiring: the drop-in rewrites data-copy once the link exists.
      const text = () => b.dataset.copy || "";
      b.addEventListener("click", async () => {
        const label = b.textContent;
        try { await navigator.clipboard.writeText(text()); b.textContent = "Copied"; }
        catch (_) { b.textContent = "Select and copy"; }
        setTimeout(() => (b.textContent = label), 1600);
      });
      if (typeof navigator !== "undefined" && navigator.share) {
        const share = document.createElement("button");
        share.type = "button"; share.className = "fc-copy fc-share"; share.textContent = "Share";
        share.addEventListener("click", () => navigator.share({ text: text() }).catch(() => {}));
        b.after(share);
      }
    });
  }

  const KUDOS_ICON =
    '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M10 17.2 3.3 10.6A4.1 4.1 0 0 1 9.1 4.8l.9.9.9-.9a4.1 4.1 0 0 1 5.8 5.8L10 17.2Z" fill="currentColor"/></svg>';
  const TALK_ICON =
    '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M3.5 4.5h13v9h-8l-3.5 3v-3H3.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const SHARE_ICON =
    '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M10 3v10M6 7l4-4 4 4M4 11v5.5h12V11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // opts.page: the signed-out share page at /r/<id>. It has no script, so the heart is a link into
  // the run (where a signed-in reader can send XUDOS) and the title is the page's one h1.
  // opts.count null means the count could not be read; the heart then carries no number.
  // opts.preview: a run that is not saved anywhere yet (the import preview, and the card the
  // command line writes on this computer, agentgrinder/feedcard.py). Nothing on it links anywhere:
  // there is no saved run to open, react to or share, so the row is drawn but inert.
  // The one action row: XUDOS, Comment, Share. The feed card and the day card both draw it from here,
  // so the three controls look and behave the same wherever a run can be answered.
  // mode: "preview" (nothing saved, inert), "page" (the share page, no script), "mine" (your own run).
  function actions(o) {
    const id = esc(o.id), count = o.count === null || o.count === undefined ? null : whole(o.count) || 0;
    const unavailable=o.count===null;
    const n = count === null ? (unavailable?'<span title="XUDOS count unavailable" aria-label="Count unavailable">—</span>':"") : `<span class="num">${count}</span>`, said = count === null ? (unavailable?", count unavailable":"") : `, ${count} so far`;
    const heart = `${KUDOS_ICON}<span>XUDOS</span>`;
    const xudos = o.mode === "preview"
      ? `<span class="fc-act" aria-label="Send XUDOS">${heart}</span>`
      : o.mode === "page"
      ? `<a class="fc-act" href="/?run=${id}" aria-label="Send XUDOS${said}">${heart}${n}</a>`
      : o.mode === "mine"
      ? `<span class="fc-act fc-kudos-mine" aria-label="XUDOS on your run${said}">${heart}${n}</span>`
      : `<button class="fc-act kudo${o.acked ? " on" : ""}" data-run="${id}" data-to="${esc(o.to)}" aria-label="${o.acked ? "XUDOS sent" : "Send XUDOS"}${said}">${heart}${n}</button>`;
    const talk = o.mode === "preview"
      ? `<span class="fc-act" aria-label="Comment">${TALK_ICON}<span>Comment</span></span><span class="fc-act" aria-label="Share">${SHARE_ICON}<span>Share</span></span>`
      : `<a class="fc-act" href="${o.commentHref ? esc(o.commentHref) : `/?run=${id}#grind-thread`}" aria-label="Comment"${o.commentHref ? " data-comment" : ""}>${TALK_ICON}<span>Comment</span></a><a class="fc-act" href="${o.shareHref ? esc(o.shareHref) : `/?share=1&amp;run=${id}`}" aria-label="Share">${SHARE_ICON}<span>Share</span></a>`;
    return xudos + talk;
  }

  function card(r, opts) {
    opts = opts || {};
    const preview = !!opts.preview;
    const checkpoints=checkpointVisual(r);
    const page = !!opts.page;
    const p = profileOf(r);
    const anon = r.visibility === "anonymous";
    const lead = headline(r);
    const facts = stats(r, lead);
    const id = esc(r.id);
    const count = preview || (opts.count === null && page) ? null : whole(opts.count) || 0;
    const countHtml = count === null ? "" : `<span class="num">${count}</span>`;
    const mine = !!opts.mine;
    const tag = opts.heading || (page ? "h1" : "h3");
    const who = anon
      ? `<span class="fc-name">Anonymous builder</span>`
      : preview
      ? `<span class="fc-name">${esc(p.name)}</span>`
      : `<a class="fc-name" href="/?u=${encodeURIComponent(p.handle)}">${esc(p.name)}</a>`;
    // Partial observations have no measured event date. Creation time is only a posting date.
    const sourceDate = r.started_at || r.started;
    const posted = when(r.created_at);
    const dateLabel = preview ? (when(sourceDate) || "Session date unknown")
      : observedProjection(r)
        ? (posted ? `Posted ${/^(Today|Yesterday)$/.test(posted) ? posted.toLowerCase() : posted}` : "Session date unknown")
        : posted;
    const meta = [esc(harnessName(r)), esc(dateLabel), opts.metaExtra ? esc(opts.metaExtra) : ""].filter(Boolean).join(" · ");
    const shipped = r.output_url && /^https:\/\//i.test(r.output_url) ? `<span class="fc-chip">Work linked</span>` : "";
    const faceHtml = anon || preview ? face(r) : `<a href="/?u=${encodeURIComponent(p.handle)}" tabindex="-1">${face(r)}</a>`;
    const strideHtml = opts.stride === false || !(preview || page || opts.url) ? "" : stride(r, { url: opts.url, copy: !!opts.copy });
    const body = `
    <${tag} class="fc-title">${esc(titleOf(r))}</${tag}>
    ${cardSummary(r) ? `<p class="fc-cap">${esc(cardSummary(r))}</p>` : ""}
    ${page||checkpoints||r.capture_metadata?`<dl class="fc-activity-stats" aria-label="Recorded facts">${recordedFacts(r).map(([label,value,detail,note])=>`<div><dt>${esc(label)}</dt><dd${detail?` title="${esc(detail)}"`:''}>${esc(value)}</dd>${note?`<small class="fc-fact-note">${esc(note)}</small>`:''}</div>`).join('')}</dl>`:''}
    ${Array.isArray(r?.capture_metadata?.models)&&r.capture_metadata.models.length===1?`<p class="fc-model-tag">Model · ${esc(modelName(r.capture_metadata.models[0]))}</p>`:''}
    ${story?story.visual(r):''}
    ${r.feedback_question?`<p class="fc-question"><span>Feedback welcome</span>${esc(r.feedback_question)}</p>`:''}
    ${observedProjection(r) ? '<p class="fc-source">Observed message order. Distinct requests are a lower bound.</p>' : ''}${r.trace_basis === 'typed-by-author' ? '<p class="fc-source">Typed by the author. No capture.</p>' : ''}${evidence?evidence.summary(r):''}
    ${page&&context?context.context(r):''}
    <div class="fc-route-secondary">${checkpoints?"":heroVisual(r)}</div>
    ${checkpoints?'':`<p class="fc-open">${preview?'Preview your story':'Open the story →'}</p>`}
  `;
    return `<article class="card fc"${preview ? "" : ` id="card-${id}" data-run-id="${id}" data-run-visibility="${esc(r.visibility||'')}" data-photo-layout="${esc(r.photo_layout||'cover')}"`}>
  <header class="fc-top">${faceHtml}<div class="fc-who">${who}<small>${meta}</small></div>${shipped}</header>
  ${preview ? `<div class="fc-body">${body}</div>` : `<a class="fc-body" href="/?run=${id}">${body}</a>`}
  ${checkpoints}
  ${!preview&&typeof r.output_url==='string'&&/^https:\/\/[^\s<>"'\\]+$/i.test(r.output_url)?`<p class="fc-output-link"><a href="${esc(r.output_url)}" target="_blank" rel="noopener noreferrer">Open the work ↗</a></p>`:''}
  ${opts.foot === false ? "" : `<footer class="fc-foot">${actions({ id: r.id, to: r.profile_id, count: preview || (opts.count === null && page) ? null : opts.count, acked: opts.acked, mode: preview ? "preview" : page ? "page" : mine ? "mine" : "" })}</footer>`}
</article>`;
  }


  // The empty chair at the end of a short feed. It says what goes here and offers the one action.
  function nextSlot() {
    return `<a class="fc-next" href="/?post"><span class="fc-face fc-mono" style="--s:40px" aria-hidden="true">+</span><span><strong>Your run goes here</strong><small>Post a run</small></span></a>`;
  }

  // A builder row for "who to follow": face, name, their latest run, and a follow slot the social
  // module fills. Built only from profiles that have a public run.
  function builderRow(r) {
    const p = profileOf(r);
    return `<div class="fc-builder">${face(r, 44)}<div class="fc-who"><a class="fc-name" href="/?u=${encodeURIComponent(p.handle)}">${esc(p.name)}</a><small>Recent: <a href="/?run=${esc(r.id)}">${esc(titleOf(r))}</a></small></div><span class="card-follow" data-profile="${esc(r.profile_id)}" data-handle="${esc(p.handle)}" data-label="Follow"></span></div>`;
  }

  const api = { card, cardSummary, actions, face, headline, stats, achievement, harnessName, badge, spark, settle, routeGeometry, routeMap, proofRoute, changeAtlas, resultVisual, photoVisual, heroChoices, heroVisual, strideBars, strideText, strideHtml, stride, wireStride, nextSlot, builderRow, profileOf, durationLabel, when, titleOf };
  root.GrinderFeed = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
