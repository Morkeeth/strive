"""Local return / retained-progress view after a later run.

A returning builder should see, without opening logs: which practice they tried, which
measured change is comparable under the same metric identity, what is unknown, and a place
to choose the next practice. Share/export is an explicit click — never auto-upload.
"""
from __future__ import annotations

import json
from html import escape
from pathlib import Path

from .brand import BRAND, CARD_THEME
from .metrics import headline_of


def _num(v):
    return "—" if v is None else str(v)


def _metric_pair(before: dict, after: dict) -> dict:
    hb, ha = headline_of(before), headline_of(after)
    same_metric = hb.metric_id == ha.metric_id and hb.value is not None and ha.value is not None
    same_harness = bool(before.get("harness")) and before.get("harness") == after.get("harness")
    same_basis = bool(before.get("trace_basis")) and before.get("trace_basis") == after.get("trace_basis")
    same = same_metric and same_harness and same_basis
    delta = round(ha.value - hb.value, 4) if same else None
    return {
        "before_label": hb.label, "after_label": ha.label,
        "before_id": hb.metric_id, "after_id": ha.metric_id,
        "before_value": hb.value, "after_value": ha.value,
        "before_formula": hb.formula, "after_formula": ha.formula,
        "comparable": same,
        "delta": delta,
        "same_harness": same_harness,
        "same_trace_basis": same_basis,
    }


def _fmt_metric(v, places=2):
    if v is None:
        return "—"
    if isinstance(v, float):
        return f"{v:.{places}f}"
    return str(v)


def _field_rows(before: dict, after: dict, comparable_headline: bool) -> list[tuple[str, str, str, str]]:
    """label, earlier, later, note — unknowns stay unknown."""
    rows = []
    pairs = [
        ("typed turns (cost)", "turns_typed", True),
        ("artifacts produced", "artifacts_produced", True),
        ("claims (counted)", "claims", True),
        ("claims verified", "claims_verified", True),
        ("commits", "commits", True),
        ("tool calls", "tool_calls", True),
    ]
    for label, key, allow_delta in pairs:
        a, b = before.get(key), after.get(key)
        if a is None and b is None:
            note = "unknown on both readings"
        elif a is None or b is None:
            note = "unknown on one reading — not compared"
        elif allow_delta:
            note = f"later − earlier = {b - a}"
        else:
            note = "observed only"
        rows.append((label, _num(a), _num(b), note))
    m = _metric_pair(before, after)
    if m["comparable"]:
        sign = "+" if m["delta"] > 0 else ""
        note = f"same metric ({m['before_id']}); Δ {sign}{_fmt_metric(m['delta'])}"
    else:
        note = (f"incomparable: {m['before_id']} vs {m['after_id']} — "
                "do not treat the number change as improvement")
    rows.insert(0, (
        "headline metric",
        f"{_fmt_metric(m['before_value'])} ({m['before_label']})",
        f"{_fmt_metric(m['after_value'])} ({m['after_label']})",
        note,
    ))
    return rows


def build_return_model(practice: dict, before: dict, after: dict, review: dict | None = None) -> dict:
    metric = _metric_pair(before, after)
    unknowns = []
    for key, label in (("claims_verified", "verified claims"), ("corrections", "correction rate"),
                       ("artifacts_promised", "artifacts promised"), ("reach", "reach")):
        if before.get(key) is None or after.get(key) is None:
            unknowns.append(label)
    if not metric["comparable"]:
        unknowns.append("headline comparison (metric identity differs or a value is missing)")
    return {
        "practice": practice,
        "review": review or {},
        "before": before,
        "after": after,
        "metric": metric,
        "rows": _field_rows(before, after, metric["comparable"]),
        "unknowns": unknowns,
        "causation": ("A keep/change/drop review is your observation. It does not establish that "
                      "the practice caused the measured difference."),
    }


def render_return_html(model: dict) -> str:
    p = model["practice"]
    m = model["metric"]
    review = model["review"] or {}
    rows = "".join(
        f"<tr><th>{escape(lab)}</th><td>{escape(a)}</td><td>{escape(b)}</td>"
        f"<td class='note'>{escape(note)}</td></tr>"
        for lab, a, b, note in model["rows"]
    )
    stack = "".join(
        f"<article><strong>{escape(lab)}</strong>"
        f"<div>Earlier: {escape(a)}</div><div>Later: {escape(b)}</div>"
        f"<p class='note'>{escape(note)}</p></article>"
        for lab, a, b, note in model["rows"]
    )
    unk = "".join(f"<li>{escape(u)}</li>" for u in model["unknowns"]) or "<li>None named</li>"
    verdict = escape(str(review.get("outcome") or "not reviewed yet"))
    tried = escape(str(review.get("tried") or "unknown"))
    note = escape(str(review.get("note") or ""))
    comparable = m["comparable"]
    status = ("Comparable under the same measurements"
              if comparable else "Read these as two separate sittings")
    default_title = (model["after"].get("title")
                     or f"{model['after'].get('project') or 'session'} · {model['after'].get('harness') or 'run'}")
    hist_expected = ""
    exp = p.get("expected") or ""
    if "verified-per-turn" in exp.lower() or "verified per turn" in exp.lower():
        hist_expected = ("<p class='meta'><em>Historical expectation text</em> (written before the "
                         "artifacts-per-turn label repair): ")
        hist_expected += escape(exp) + "</p>"
        expected_line = "<p class='meta'>Current rule: headline metric must match what was measured.</p>"
    else:
        expected_line = f"<p class='meta'>Expected: {escape(exp or '—')}</p>"
        hist_expected = ""
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Return · practice review — {BRAND}</title>
<style>
{CARD_THEME}
*{{box-sizing:border-box}} body{{margin:0;background:var(--bg);color:var(--ink);
  font:15px/1.5 "IBM Plex Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  padding:24px 14px;display:flex;justify-content:center}}
.wrap{{width:100%;max-width:720px}}
.brand{{font-weight:800;letter-spacing:.06em;color:var(--muted);font-size:12px;margin-bottom:8px}}
h1{{font-size:22px;margin:0 0 6px}} h2{{font-size:14px;text-transform:uppercase;letter-spacing:.06em;
  color:var(--muted);margin:22px 0 8px}}
.panel{{background:var(--card);border:1px solid var(--line);padding:16px 18px;margin:0 0 12px}}
.meta{{color:var(--muted);font-size:13px}}
.status{{font-weight:700;color:{"var(--accent)" if comparable else "var(--muted)"}}}
table{{width:100%;border-collapse:collapse;font-size:13.5px}}
th,td{{border-top:1px solid var(--line);padding:8px 6px;text-align:left;vertical-align:top}}
th{{width:28%;color:var(--muted);font-weight:600}} .note{{color:var(--muted);font-size:12.5px}}
.cmp-stack{{display:none}}
ul{{margin:0;padding-left:18px}} .actions{{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}}
button,a.btn{{appearance:none;border:1px solid var(--ink);background:var(--ink);color:#fff;
  padding:10px 14px;font:inherit;font-weight:650;cursor:pointer;text-decoration:none}}
button.ghost,a.ghost{{background:transparent;color:var(--ink)}}
button:disabled{{opacity:.4;cursor:not-allowed}}
textarea,input[type=text]{{width:100%;font:inherit;padding:8px;border:1px solid var(--line);
  background:var(--bg);color:var(--ink);margin:6px 0 10px}}
.foot{{margin-top:18px;font-size:12.5px;color:var(--muted)}}
.title-preview{{border:1px dashed var(--line);padding:10px 12px;margin:8px 0 12px;background:var(--bg)}}
@media (max-width:420px){{
  body{{padding:12px 8px}}
  table.cmp{{display:none}}
  .cmp-stack{{display:block}}
  .cmp-stack article{{border-top:1px solid var(--line);padding:10px 0}}
  .cmp-stack strong{{display:block;margin-bottom:4px}}
  .actions{{flex-direction:column}}
}}
</style></head>
<body>
<div class="wrap" id="return-root">
  <div class="brand">{BRAND} · LOCAL RETURN</div>
  <h1>Your later run is in. Here is what is comparable.</h1>
  <p class="meta">Private on this machine. Nothing uploads until you export. Raw transcripts stay local.</p>

  <div class="panel">
    <h2>Practice you tried</h2>
    <p><strong>{escape(p.get("title") or "Untitled practice")}</strong></p>
    <p class="meta">Source measurement <code>{escape(str(p.get("source_revision") or "")[:16])}…</code></p>
    {expected_line}
    {hist_expected}
    <p>Review: tried <strong>{tried}</strong> · decision <strong>{verdict}</strong></p>
    {f"<p class='meta'>{note}</p>" if note else ""}
    <p class="meta">{escape(model["causation"])}</p>
  </div>

  <div class="panel">
    <h2>Measured change</h2>
    <p class="status">{status}</p>
    <p class="meta">Earlier: {escape(str(model["before"].get("title") or "")[:80])} ·
      {escape(str(model["before"].get("started") or ""))}</p>
    <p class="meta">Later: {escape(str(model["after"].get("title") or "")[:80])} ·
      {escape(str(model["after"].get("started") or ""))}</p>
    <table class="cmp"><thead><tr><th>Field</th><th>Earlier</th><th>Later</th><th>Reading</th></tr></thead>
    <tbody>{rows}</tbody></table>
    <div class="cmp-stack" aria-label="Comparison stacked for narrow screens">{stack}</div>
  </div>

  <div class="panel">
    <h2>Share title (what leaves the machine)</h2>
    <p class="meta">Default is project/session metadata — not a raw prompt. Edit before any export.
      Private transcript text never appears here unless you type it.</p>
    <label>Title for a share card
      <input id="share-title" type="text" maxlength="120" value="{escape(str(default_title)[:120])}">
    </label>
    <div class="title-preview" id="title-preview">Preview: <strong>{escape(str(default_title)[:120])}</strong></div>
  </div>

  <div class="panel">
    <h2>Still unknown</h2>
    <ul>{unk}</ul>
  </div>

  <div class="panel" id="next-practice">
    <h2>Choose your next practice</h2>
    <p class="meta">One change for the next session. Saved only if you click Save draft locally.
      This does not prove the last practice caused the delta.</p>
    <label>What will you do differently?
      <input id="next-action" type="text" maxlength="160"
        placeholder="e.g. Freeze transcript before grind; keep metric labels honest">
    </label>
    <label>What change would you look for?
      <textarea id="next-expected" maxlength="2000" rows="3"
        placeholder="e.g. Headline label matches the metric that was actually measured"></textarea>
    </label>
    <div class="actions">
      <button type="button" id="save-next" class="ghost">Save next-practice draft (local file)</button>
      <button type="button" id="export-html">Export this return view (HTML download)</button>
      <button type="button" id="export-png" disabled title="Open this file in a browser with canvas, or use the CLI screenshot">PNG export needs browser screenshot</button>
    </div>
    <p id="export-status" class="meta" role="status"></p>
  </div>

  <p class="foot">Measurement refs · earlier
    <code>{escape(str(model["before"].get("measurement_revision") or model["before"].get("measurement",{}).get("revision_id") or "—")[:24])}</code>
    · later
    <code>{escape(str(model["after"].get("measurement_revision") or model["after"].get("measurement",{}).get("revision_id") or "—")[:24])}</code>
  </p>
</div>
<script>
(function(){{
  const status = t => document.getElementById('export-status').textContent = t;
  const titleInput = document.getElementById('share-title');
  const preview = document.getElementById('title-preview');
  if (titleInput && preview) {{
    titleInput.addEventListener('input', () => {{
      preview.innerHTML = 'Preview: <strong>' + titleInput.value.replace(/[&<>]/g, c => ({{'&':'&amp;','<':'&lt;','>':'&gt;'}}[c])) + '</strong>';
    }});
  }}
  document.getElementById('export-html').onclick = () => {{
    const html = '<!doctype html>\\n' + document.documentElement.outerHTML;
    const blob = new Blob([html], {{type:'text/html'}});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'grinder-return-view.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    status('Downloaded return HTML. Nothing was uploaded.');
  }};
  document.getElementById('save-next').onclick = () => {{
    const action = document.getElementById('next-action').value.trim();
    const expected = document.getElementById('next-expected').value.trim();
    if (!action || !expected) {{ status('Fill both fields before saving a draft.'); return; }}
    const draft = {{
      title: action, expected, created_at: new Date().toISOString(),
      note: 'Local draft only — run agentgrinder practice accept to record it in the series DB.'
    }};
    const blob = new Blob([JSON.stringify(draft, null, 2)], {{type:'application/json'}});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'next-practice-draft.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    status('Saved next-practice draft JSON locally. Not uploaded.');
  }};
}})();
</script>
</body></html>'''


def write_return_view(practice_path: str, before_path: str, after_path: str,
                      out_path: str, review_path: str | None = None) -> dict:
    practice = json.loads(Path(practice_path).read_text())
    before = json.loads(Path(before_path).read_text())
    after = json.loads(Path(after_path).read_text())
    review = json.loads(Path(review_path).read_text()) if review_path else None
    model = build_return_model(practice, before, after, review)
    Path(out_path).write_text(render_return_html(model), encoding="utf-8")
    return model
