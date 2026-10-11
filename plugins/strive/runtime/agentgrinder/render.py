"""Render an Activity to a shareable HTML card.

Signature device: THE SESSION ROUTE — the run's rhythm (typed turns per bucket) drawn as an
elevation profile, the way Strava draws a route. It is taken from the work itself, not a component
library: the shape IS the session. Remove it and you lose the argument that this was a real effort.

HEADLINE: THE OUTCOME (outcome.py). One sentence saying what the run shipped, or `No shipped
output recorded` and the reason. Under it, the one count the run can prove. Verified per turn is
still here — it is the metric identity, under More, where a ratio belongs — because it answers a
different question from the one a reader asks first.

WHAT IS NOT MEASURED IS NOT DRAWN. A cell with no value is left out of the row and named in one
sentence of prose that keeps its tooltip. Four em-dashes and an `Unknown` in the measurement rows
made a real 8m19s Cursor session look like a session in which nothing happened (22 Sep 2026), and
the cost of that is not a cosmetic one: it is the reason the author would not share the card.

Every Strava-shaped number (prompts, moving time, effort, cadence) is kept, grouped as COST. Pace is not drawn.
"""
from __future__ import annotations
from .brand import BRAND, CARD_THEME

import re
from html import escape

from .metrics import ARTIFACTS_PER_TURN_TIP, HEADLINE_TIP, Activity, Cell


def _route_svg(rhythm: list[int], w: int = 720, h: int = 150) -> str:
    if not rhythm:
        return f'<svg viewBox="0 0 {w} {h}" class="route" role="img" aria-label="no route"></svg>'
    n = len(rhythm)
    mx = max(rhythm) or 1
    pad = 6
    def x(i): return pad + i * (w - 2 * pad) / max(n - 1, 1)
    def y(v): return h - pad - (v / mx) * (h - 2 * pad)
    pts = [(x(i), y(v)) for i, v in enumerate(rhythm)]
    line = " ".join(f"{px:.1f},{py:.1f}" for px, py in pts)
    area = f"{pad},{h - pad} " + line + f" {w - pad:.1f},{h - pad}"
    # peak marker = the hardest stretch of the session
    pi = rhythm.index(max(rhythm))
    return f'''<svg viewBox="0 0 {w} {h}" class="route" preserveAspectRatio="none" role="img" aria-label="session route">
  <polygon points="{area}" fill="url(#grad)"/>
  <polyline points="{line}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="{x(pi):.1f}" cy="{y(rhythm[pi]):.1f}" r="4.5" fill="var(--accent)" stroke="var(--card)" stroke-width="2"/>
  <defs><linearGradient id="grad" x1="0" x2="0" y1="0" y2="1">
    <stop offset="0" stop-color="var(--accent)" stop-opacity="0.28"/>
    <stop offset="1" stop-color="var(--accent)" stop-opacity="0.02"/>
  </linearGradient></defs>
</svg>'''


def _ridge_svg(a: Activity, w: int = 720, h: int = 150) -> str:
    values = a.ridge
    if not 40 <= len(values) <= 60:
        return ""
    workers = a.worker_bins if len(a.worker_bins) == len(values) else [0] * len(values)
    base, top = h - 18, 16
    maximum = max(values) or 1
    x = lambda i: i * w / max(1, len(values) - 1)
    y = lambda value: base - value / maximum * (base - top)
    line = " ".join(f"{x(i):.1f},{y(value):.1f}" for i, value in enumerate(values))
    backs = []
    for level in range(min(3, max(workers, default=0)), 0, -1):
        points = []
        for index, active_workers in enumerate(workers):
            active = min(active_workers, level) / level
            value = max(values[index], maximum * (0.2 + level * 0.08)) if active else 0
            points.append(f"{x(index):.1f},{y(value):.1f}")
        backs.append(
            f'<polygon class="ridge-worker level-{level}" '
            f'points="0,{base} {" ".join(points)} {w},{base}"/>')
    ticks = "".join(
        f'<line class="ridge-commit" x1="{x(index):.1f}" y1="{base}" '
        f'x2="{x(index):.1f}" y2="{base - 10}"/>'
        for index in a.commit_bins if isinstance(index, int) and 0 <= index < len(values))
    chip = ""
    label = ""
    if a.output_url:
        if "/pull/" in a.output_url and "github.com/" in a.output_url:
            label = "PR"
        elif a.output_url.lower().split("?", 1)[0].endswith((".png", ".jpg", ".jpeg", ".webp")):
            label = "Screenshot"
        else:
            label = "Output"
    elif a.commits not in ("—", "0"):
        label = f'{a.commits} commit{"s" if a.commits != "1" else ""}'
    if label:
        width = min(118, 24 + len(label) * 7)
        chip_y = max(2, y(values[-1]) - 30)
        chip = (f'<g class="ridge-chip" transform="translate({w - width - 2},{chip_y:.1f})">'
                f'<rect width="{width}" height="23" rx="2"/><text x="{width / 2:.1f}" '
                f'y="15">{escape(label)}</text></g>')
    return (f'<svg viewBox="0 0 {w} {h}" class="ridge" preserveAspectRatio="none" role="img" '
            f'aria-label="tool calls across {escape(a.ridge_basis)}">'
            + "".join(backs)
            + f'<polygon class="ridge-fill" points="0,{base} {line} {w},{base}"/>'
            + f'<line class="ridge-base" x1="0" y1="{base}" x2="{w}" y2="{base}"/>{ticks}'
            + f'<polyline class="ridge-line" points="{line}"/>'
            + f'<circle class="ridge-start" cx="0" cy="{y(values[0]):.1f}" r="5"/>'
            + f'<circle class="ridge-end" cx="{w}" cy="{y(values[-1]):.1f}" r="5"/>{chip}</svg>')


# WHAT COUNTS AS A VALUE. A cell or a stat is drawn only when the run measured something for it.
# A row reading "—" is not a measurement, it is furniture: the 22 Sep card carried four of them
# side by side and a fifth reading "Unknown", which is how a real session came to look like a
# session where nothing happened.
_MISSING = {"", "—", "-", "–", "unknown", "none", "n/a"}

# THE ROW FITS THE NUMBER OF CELLS IT HAS. Hiding unmeasured cells means the count is no longer
# five, and a five-column grid holding two cells leaves three empty boxes — the same hole the
# em-dashes filled, with the dashes removed. The count travels as data-n so a phone can still
# override it, which an inline style would not allow.
GRID_CSS = """
  .fiverow,.stats{display:grid;gap:1px;background:var(--line);
    border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
  .fiverow{grid-template-columns:repeat(5,1fr)}
  .fiverow[data-n="1"]{grid-template-columns:1fr}
  .fiverow[data-n="2"]{grid-template-columns:repeat(2,1fr)}
  .fiverow[data-n="3"]{grid-template-columns:repeat(3,1fr)}
  .fiverow[data-n="4"]{grid-template-columns:repeat(4,1fr)}
  .stats{grid-template-columns:repeat(2,1fr)}
  .stats[data-n="1"]{grid-template-columns:1fr}
  .stats[data-n="3"],.stats[data-n="5"]{grid-template-columns:repeat(3,1fr)}
  .stats[data-n="4"]{grid-template-columns:repeat(4,1fr)}
  .stats[data-n="5"] .stat:last-child{grid-column:span 2}
  @media (max-width:520px){
    .fiverow[data-n="4"],.fiverow[data-n="5"],.stats[data-n="3"],.stats[data-n="4"],
    .stats[data-n="5"]{grid-template-columns:repeat(2,1fr)}
    .fiverow[data-n="5"] .five:last-child,.stats[data-n="3"] .stat:last-child,
    .stats[data-n="5"] .stat:last-child{grid-column:span 2}
  }
"""


def _has_value(text: str) -> bool:
    """True when this cell says something a reader can act on."""
    plain = re.sub(r"<[^>]+>", "", str(text or "")).strip()
    if plain.lower() in _MISSING:
        return False
    # "— ÷ —" measures nothing; "4 ÷ —" measures the half it has.
    return any(ch.isalnum() for ch in plain)


def _five_row(cells: list[Cell]) -> str:
    out = []
    for c in cells:
        if not _has_value(c.value):
            continue
        cls = "five cost" if c.cost else "five"
        tag = '<i class="costtag">cost</i>' if c.cost else ""
        dash = ' data-missing="1"' if "—" in c.value else ""
        out.append(f'<div class="{cls}" title="{escape(c.source)}"{dash}>'
                   f'<div class="v">{escape(c.value)}</div>'
                   f'<div class="k">{escape(c.label)}{tag}</div></div>')
    return "".join(out)


def _five_block(cells: list[Cell]) -> str:
    """The five-number row, with every unmeasured cell left out. No cells, no row."""
    row = _five_row(cells)
    if not row:
        return ""
    shown = sum(1 for c in cells if _has_value(c.value))
    return f'<div class="fiverow" data-n="{shown}">{row}</div>'


def _unmeasured_note(cells: list[Cell], *extra) -> str:
    """The cells that were left out, named in a sentence instead of drawn as em-dashes.

    Hiding a dash must not hide the fact that something is unknown, or the card would be quietly
    claiming completeness it does not have. So the missing numbers keep their names and keep the
    sentence that says which fact is absent and whether a reader could supply it today — as one
    line of prose, not as four empty boxes in the row of measurements.
    """
    missing = [c for c in list(cells) + [c for c in extra if c] if not _has_value(c.value)]
    if not missing:
        return ""
    named = ", ".join(f'<span title="{escape(c.source)}">{escape(c.label)}</span>' for c in missing)
    return f'<p class="unmeasured">Not measured in this run: {named}.</p>'


def _stats_block(rows) -> str:
    """A stat grid from (value, label) pairs. A pair with no measured value is not drawn."""
    cells = [f'<div class="stat"><div class="v">{value}</div>'
             f'<div class="k">{escape(label)}</div></div>'
             for value, label in rows if _has_value(value)]
    if not cells:
        return ""
    return f'<div class="stats" data-n="{len(cells)}">{"".join(cells)}</div>'


def _just_the_number(value: str) -> str:
    """"7 files" -> "7". The stat's own label already carries the unit; printing it twice
    ("7 files" under FILES) is how a three-cell row ends up saying two things."""
    text = str(value or "").strip()
    head = text.split(" ", 1)[0]
    return head if head and head[0].isdigit() else text


def _hero_block(a) -> str:
    """The one number this run can prove. A run that can prove none draws nothing here."""
    if not a.hero_value:
        return ""
    return (f'<div class="hero" title="{escape(a.hero_source)}">'
            f'<div class="n">{a.hero_value}</div>'
            f'<div class="lbl">{a.hero_label}</div></div>')


def _outcome_block(a) -> str:
    """The headline: one sentence about what the run shipped, and where that sentence came from."""
    state = "shipped" if a.outcome_shipped else "nothing"
    return (f'<h1 class="outcome {state}">{a.outcome}</h1>'
            f'<p class="outcome-basis">{a.outcome_basis}</p>')


def _insight_block(a) -> str:
    """The one selected insight, at the head of the Code Route group. Absent draws nothing.

    Everything printed here is either the author's own sentence or the receipt it is bound to,
    and the block says which. The private note is on the card because a reader with no account
    can open this file: it must not read as a published run.
    """
    if not a.insight or not a.insight_receipt_url:
        return ""
    from .insight import PRIVATE_NOTE
    return (
        '<section class="insight">'
        '<div class="grp">Selected insight · bound to a receipt</div>'
        f'<p class="insight-line">{a.insight}</p>'
        f'<p class="insight-src">{a.insight_provenance} '
        f'<a href="{a.insight_receipt_url}">{a.insight_receipt_label}</a>. '
        f'{escape(PRIVATE_NOTE)}</p>'
        '</section>')


def _selected_outcome_html(a) -> str:
    """Hero block for one selected, receipt-backed outcome. Absent fields stay absent.

    The declared outcome is also the first rung of the outcome ladder, so on most runs the
    headline at the top of the card IS this sentence. Printing it a second time under its own
    heading does not make it truer; when they are the same line, only the receipts are drawn.
    """
    if not a.selected_outcome and not a.receipts:
        return ""
    repeated = bool(a.selected_outcome) and a.selected_outcome == a.outcome
    if repeated and not a.receipts:
        return ""
    parts = ['<section class="outcome-hero">']
    if a.selected_outcome and not repeated:
        parts.append('<div class="grp">Selected outcome</div>')
        parts.append(f'<p class="outcome-line">{a.selected_outcome}</p>')
    if a.receipts:
        links = []
        for row in a.receipts[:5]:
            if not isinstance(row, dict):
                continue
            label = row.get("label") or ""
            url = row.get("url") or ""
            if not label or not url:
                continue
            links.append(f'<a href="{escape(url)}">{escape(label)}</a>')
        if links:
            parts.append('<div class="grp">Receipts</div>')
            parts.append('<p class="outcome-links">' + " · ".join(links) + "</p>")
    parts.append("</section>")
    return "".join(parts)


def _code_route_html(a) -> str:
    """Compact commit-derived Code Route. Missing route stays absent."""
    route = a.code_route
    if not isinstance(route, dict):
        return ""
    stops = route.get("stops") or []
    measured = [s for s in stops if isinstance(s, dict) and s.get("basis") == "measured"]
    if len(measured) < 1:
        return ""
    projects = route.get("projects") or []
    labels = []
    for stop in measured:
        kind = escape(str(stop.get("kind") or "stop"))
        label = escape(str(stop.get("label") or kind))
        labels.append(f"<li><b>{kind}</b> · {label}</li>")
    proj = ""
    if projects:
        names = ", ".join(escape(str(p.get("label") or p.get("id") or "")) for p in projects if isinstance(p, dict))
        if names:
            proj = f'<p class="outcome-line">{names}</p>'
    return (
        '<section class="code-route-block">'
        '<div class="grp">Code Route · measured</div>'
        f'{proj}<ol class="code-route-stops">{"".join(labels)}</ol>'
        "</section>"
    )


def render_card(a: Activity) -> str:
    """The local card is the feed card (agentgrinder/feedcard.py, a port of site/feed-card.js).

    What the run says beyond the card sits under it, each part only when the run carries it: the
    outcome it shipped, the selected insight and receipts, the Code Route, the coach's verdict.
    What it did not measure is not drawn."""
    from .feedcard import esc, page
    parts = []
    if a.outcome_shipped:
        parts.append('<section class="below outcome"><h2>What shipped</h2>'
                     f'<p class="lead">{esc(a.outcome)}</p><p class="note">{esc(a.outcome_basis)}</p></section>')
    if a.insight and a.insight_receipt_url:
        from .insight import PRIVATE_NOTE
        parts.append('<section class="below insight"><h2>Selected insight · bound to a receipt</h2>'
                     f'<p class="lead">{esc(a.insight)}</p><p>{esc(a.insight_provenance)} '
                     f'<a href="{esc(a.insight_receipt_url)}">{esc(a.insight_receipt_label)}</a>. '
                     f'{esc(PRIVATE_NOTE)}</p></section>')
    repeated = bool(a.selected_outcome) and a.selected_outcome == a.outcome
    if (a.selected_outcome and not repeated) or a.receipts:
        body = []
        if a.selected_outcome and not repeated:
            body.append(f'<p class="lead">{esc(a.selected_outcome)}</p>')
        links = [f'<a href="{esc(r.get("url"))}" rel="noopener noreferrer">{esc(r.get("label"))}</a>'
                 for r in (a.receipts or [])[:5] if isinstance(r, dict) and r.get("url")]
        if links:
            body.append(f'<p class="outcome-links">{" · ".join(links)}</p>')
        parts.append('<section class="below outcome-hero"><h2>Receipts · said by the uploader, not measured</h2>'
                     + "".join(body) + '</section>')
    route = _code_route_html(a)
    if route:
        parts.append(route.replace('<section class="code-route-block">', '<section class="below code-route-block">', 1)
                     .replace('<div class="grp">Code Route · measured</div>', '<h2>Code Route · measured</h2>', 1))
    if a.coach_verdict:
        parts.append('<section class="below coach"><h2>Next session'
                     + (f' · {esc(a.coach_mode)}' if a.coach_mode else '') + '</h2>'
                     f'<p class="lead">{esc(a.coach_verdict)}</p>'
                     + (f'<p style="white-space:pre-wrap">{esc(a.coach_plan)}</p>' if a.coach_plan else '')
                     + '</section>')
    notes = []
    row = a.card_row
    if row.get("duration_s") is None and row.get("wall_time_s") is None and (a.trace_basis or a.ridge_basis):
        notes.append("Time is not shown: this harness trace is turn order, not a measured elapsed clock.")
    if not a.outcome_shipped and a.outcome:
        notes.append(f"{a.outcome}: {a.outcome_basis}.")
    if a.identity_note:
        notes.append(f"{a.athlete} · {a.identity_note}.")
    notes.append(f"Private preview on this computer. Nothing is on {BRAND} until you choose to save it.")
    notes.append("Counts describe activity, not result quality.")
    from .feedcard import title_of
    return page(row, title=f"{title_of(row)} · {BRAND}", below="".join(parts), notes=notes,
                brand=BRAND, meta_extra="bot activity" if a.harness == "Grok Bot" else "")


def render_profile(p: dict) -> str:
    gh = p["gh"]; t = p["totals"]; acts = p["activities"]
    def stat(v): return v if v not in (None, "") else "—"
    cards = "".join(f'''
      <a class="runrow" href="#">
        <div class="rt">{a.title}</div>
        <div class="rm"><span class="hl" title="{escape(ARTIFACTS_PER_TURN_TIP if a.headline_metric_id=='artifacts_per_turn' else HEADLINE_TIP)} · {escape(a.headline_formula)}">{a.headline} {a.headline_label}</span>
          <span class="cost">{a.distance} · cost</span><span>{a.moving_time}</span>
          <span>{a.commits} commits</span>{" <span class='pb'>★ PB</span>" if a.focus_pb else ""}</div>
        <div class="rs">{a.harness}{" · bot activity" if a.harness == "Grok Bot" else ""} · {a.project} · {a.date_str}</div>
      </a>''' for a in acts) or '<div class="empty">No runs yet — <code>agentgrinder run</code> to log one.</div>'
    repos = "".join(f"<li>{r}</li>" for r in gh.get("recent_repos", [])) or "<li>—</li>"
    initial = (gh.get("name") or "?")[0].upper()
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{gh.get("name")} — {BRAND} profile</title>
<style>
  {CARD_THEME}

  *{{box-sizing:border-box}} body{{margin:0;background:var(--bg);color:var(--ink);
    font:15px/1.5 "IBM Plex Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:24px 14px;
    display:flex;justify-content:center}}
  .wrap{{width:100%;max-width:640px}}
  .hero{{display:flex;gap:16px;align-items:center;margin-bottom:18px}}
  .av{{width:64px;height:64px;border-radius:50%;background:var(--accent);color:#fff;font-weight:700;
    font-size:28px;display:grid;place-items:center}}
  .hero h1{{margin:0;font-size:24px}} .hero .bio{{color:var(--muted);font-size:13.5px}}
  .hero .brand{{margin-left:auto;font-weight:800;letter-spacing:.08em;color:var(--muted);font-size:12px}}
  .stats{{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);
    border:1px solid var(--line);border-radius:2px;overflow:hidden;margin-bottom:12px}}
  .s{{background:var(--card);padding:14px}} .s .v{{font-size:22px;font-weight:720}}
  .s .k{{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}}
  .s.hl .v{{color:var(--accent)}} .s.hl{{cursor:help}}
  .cost{{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.06em;margin:0 2px 14px}}
  .rm .hl{{color:var(--accent);font-weight:700;cursor:help}} .rm .cost{{color:var(--muted)}}
  .row2{{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}}
  .panel{{background:var(--card);border:1px solid var(--line);border-radius:2px;padding:14px}}
  .panel h3{{margin:0 0 8px;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}}
  .panel ul{{margin:0;padding-left:16px;font-size:13.5px}} .panel .chip{{font-size:13px}}
  h2.feed{{font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin:6px 0 10px}}
  .runrow{{display:block;text-decoration:none;color:inherit;background:var(--card);border:1px solid var(--line);
    border-radius:12px;padding:13px 15px;margin-bottom:10px}}
  .runrow:hover{{border-color:var(--accent)}}
  .rt{{font-weight:640;margin-bottom:4px}} .rm{{display:flex;gap:14px;flex-wrap:wrap;font-size:13px}}
  .rm span{{color:var(--ink)}} .rm .pb{{color:var(--accent);font-weight:700}}
  .rs{{color:var(--muted);font-size:12.5px;margin-top:4px}} .empty{{color:var(--muted);padding:20px;text-align:center}}
</style></head><body><div class="wrap">
  <div class="hero"><div class="av">{initial}</div>
    <div><h1>{gh.get("name")}</h1><div class="bio">@{gh.get("login")}{" · " + gh.get("bio") if gh.get("bio") else ""}</div></div>
    <div class="brand">{BRAND}</div></div>
  <div class="stats">
    <div class="s hl" title="{escape(HEADLINE_TIP)} · {escape(t["vpt_formula"])}"><div class="v">{t["verified_per_turn"]}</div><div class="k">Verified per turn</div></div>
    <div class="s"><div class="v">{t["runs"]}</div><div class="k">Runs</div></div>
    <div class="s"><div class="v">{t["session_commits"]}</div><div class="k">Run commits</div></div>
    <div class="s"><div class="v">{stat(gh.get("public_repos"))}</div><div class="k">Repos</div></div>
  </div>
  <div class="cost">Cost — {t["prompts"]} prompts typed across {t["runs"]} runs</div>
  <div class="row2">
    <div class="panel"><h3>Setup</h3><div class="chip">{" · ".join(t["harnesses"])}</div></div>
    <div class="panel"><h3>Recently shipped ({stat(gh.get("recent_commits"))} commits)</h3><ul>{repos}</ul></div>
  </div>
  <h2 class="feed">Runs</h2>
  {cards}
</div></body></html>'''
