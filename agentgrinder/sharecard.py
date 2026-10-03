"""Share card — the postable atom with a claim-your-handle stub.

Fixed 1200×630 canvas (OG / X / LinkedIn). Every number on the card must be passed in;
nothing is invented here.
"""
from __future__ import annotations
from .brand import CARD_THEME

import html
import os
from urllib.parse import quote

# The hosted app, so a stranger's --push opens a page that exists. A contributor running the
# local UI sets AGENTGRINDER_URL=http://localhost:8000.
DEFAULT_URL = os.environ.get("AGENTGRINDER_URL", "https://striverun.app")


def _esc(s) -> str:
    return html.escape(str(s) if s is not None else "", quote=True)


def _dur(s: int | None) -> str:
    if not s:
        return "—"
    h, r = divmod(int(s), 3600)
    m, sec = divmod(r, 60)
    return f"{h}h {m:02d}m" if h else f"{m}m"


def _rhythm_svg(rhythm: list | None, w: int = 420, h: int = 100) -> str:
    r = list(rhythm) if rhythm else [1]
    if not r:
        r = [1]
    p, mx = 6, max(r) or 1
    n = len(r)
    x = lambda i: p + i * (w - 2 * p) / max(n - 1, 1)
    y = lambda v: h - p - (v / mx) * (h - 2 * p)
    pts = " ".join(f"{x(i):.1f},{y(v):.1f}" for i, v in enumerate(r))
    poly = f"{p},{h - p} {pts} {w - p},{h - p}"
    return (
        f'<svg viewBox="0 0 {w} {h}" width="{w}" height="{h}" '
        f'xmlns="http://www.w3.org/2000/svg">'
        f'<polygon points="{poly}" fill="var(--accent)" fill-opacity="0.10"/>'
        f'<polyline points="{pts}" fill="none" stroke="var(--accent)" stroke-width="2.8" '
        f'stroke-linejoin="round"/></svg>'
    )


def _initial(handle: str) -> str:
    h = (handle or "?").lstrip("@")
    return (_esc(h[0].upper()) if h else "?")


def render_share_card(
    *,
    handle: str = "you",
    mode: str = "grind",
    title: str | None = None,
    harness: str | None = None,
    project: str | None = None,
    prompts: int | None = None,
    duration_s: int | None = None,
    commits: int | None = None,
    tool_calls: int | None = None,
    rhythm: list | None = None,
    headline: str | None = None,
    runs: int | None = None,
    hours: float | None = None,
    base_url: str | None = None,
    vibe_label: str | None = None,
    vibe_line: str | None = None,
    roast_lines: list[str] | None = None,
) -> str:
    """Render a fixed-size share HTML page. mode: grind | profile | claim."""
    base = (base_url or DEFAULT_URL).rstrip("/")
    handle = (handle or "you").lstrip("@")
    mode = mode or "grind"

    if mode == "claim":
        stamp = "OPEN"
        lead = "Your handle is still on the table."
        sub = "Post your real agent grinds — metrics only, nothing invented."
        hero_n = "?"
        hero_k = "prompts"
        show_stats = False
    elif mode == "profile":
        stamp = "CLAIMED"
        lead = f"@{_esc(handle)}"
        sub = headline or "Where I post my real runs."
        hero_n = str(runs if runs is not None else "—")
        hero_k = "runs posted"
        show_stats = True
    else:
        stamp = "CLAIMED"
        lead = f"@{_esc(handle)} posted a grind"
        bits = [b for b in (harness, project) if b]
        sub = " · ".join(bits) if bits else (title or "Real session. Real metrics.")
        hero_n = str(prompts if prompts is not None else "—")
        hero_k = "prompts typed"
        show_stats = True

    claim_url = f"{base}/"
    onboard_url = f"{base}/?onboard"

    # stats row for grind/profile
    stat_cells = ""
    if show_stats and mode == "grind":
        stat_cells = f"""
        <div class="stat"><div class="v">{_esc(_dur(duration_s))}</div><div class="k">moving</div></div>
        <div class="stat"><div class="v">{commits if commits is not None else '—'}</div><div class="k">commits</div></div>
        <div class="stat"><div class="v">{tool_calls if tool_calls is not None else '—'}</div><div class="k">tools</div></div>"""
    elif show_stats and mode == "profile":
        stat_cells = f"""
        <div class="stat"><div class="v">{prompts if prompts is not None else '—'}</div><div class="k">prompts</div></div>
        <div class="stat"><div class="v">{hours if hours is not None else '—'}</div><div class="k">hours</div></div>
        <div class="stat"><div class="v">{commits if commits is not None else '—'}</div><div class="k">commits</div></div>
        <div class="stat"><div class="v">{_esc(harness or '—')}</div><div class="k">rig</div></div>"""

    hl = ""
    if headline and mode == "grind":
        hl = f'<p class="headline">{_esc(headline)}</p>'
    vibe_block = ""
    if vibe_label and mode == "grind":
        vibe_block = f'<p class="vibe">{_esc(vibe_label)}</p><p class="vibe-line">{_esc(vibe_line or "")}</p>'
    roast_block = ""
    if roast_lines and mode == "grind":
        items = "".join(f"<li>{_esc(ln)}</li>" for ln in roast_lines[:4])
        roast_block = f'<div class="roast"><b>Roast shape</b><ul style="margin:8px 0 0 18px">{items}</ul></div>'

    curve = _rhythm_svg(rhythm) if rhythm and mode == "grind" else ""

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>@{_esc(handle)} · Agent Grinder</title>
<style>
  {CARD_THEME}

  *{{box-sizing:border-box;margin:0;padding:0}}
  html,body{{height:100%;background:var(--bg)}}
  body{{display:grid;place-items:center;padding:24px;font-family:var(--disp);color:var(--ink)}}
  .frame{{width:1200px;height:630px;background:var(--bg);border-radius:2px;overflow:hidden;
    box-shadow:none;display:flex;flex-direction:column}}
  .main{{flex:1;display:grid;grid-template-columns:1fr 1.05fr;min-height:0}}
  .left{{padding:44px 40px 28px;display:flex;flex-direction:column;justify-content:space-between;
    border-right:1px solid var(--line);background:var(--card)}}
  .brand{{font-weight:800;font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted)}}
  .handle-row{{display:flex;align-items:flex-start;gap:20px;margin-top:28px}}
  .av{{width:72px;height:72px;border-radius:16px;background:var(--accent);color:#fff;
    display:grid;place-items:center;font-weight:800;font-size:32px;flex-shrink:0}}
  .handle{{font-family:var(--mono);font-size:58px;font-weight:700;letter-spacing:-.04em;line-height:1;
    word-break:break-all}}
  .stamp{{margin-top:14px;transform:rotate(-11deg);display:inline-block;
    border:3px solid var(--accent);color:var(--accent);font-weight:800;font-size:15px;
    letter-spacing:.22em;padding:7px 18px;border-radius:5px;background:rgba(28,106,70,.06)}}
  .vibe{{margin-top:16px;font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--accent-ink)}}
  .vibe-line{{margin-top:4px;font-size:14px;color:var(--muted);line-height:1.45;max-width:400px;font-weight:500;text-transform:none;letter-spacing:0}}
  .roast{{margin-top:14px;padding:12px 14px;border-left:3px solid var(--accent);background:var(--accent-soft);
    font-size:13.5px;line-height:1.55;color:var(--muted)}}
  .roast b{{color:var(--ink);font-weight:700}}
  .lead{{margin-top:22px;font-size:20px;font-weight:700;letter-spacing:-.02em}}
  .sub{{margin-top:6px;font-size:15px;color:var(--muted);line-height:1.45;max-width:420px}}
  .right{{padding:36px 40px 28px;display:flex;flex-direction:column;justify-content:center;background:var(--card)}}
  .hero{{display:flex;align-items:baseline;gap:14px;margin-bottom:8px}}
  .hero .n{{font-family:var(--mono);font-size:88px;font-weight:700;letter-spacing:-.05em;color:var(--accent);line-height:1}}
  .hero .k{{font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:var(--muted)}}
  .headline{{font-size:17px;font-weight:600;line-height:1.45;color:var(--ink);margin:12px 0 18px;
    padding-left:14px;border-left:3px solid var(--accent)}}
  .stats{{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:1px;background:var(--line);
    border:1px solid var(--line);border-radius:10px;overflow:hidden;margin-top:auto}}
  .stat{{background:var(--card);padding:14px 16px}}
  .stat .v{{font-family:var(--mono);font-size:22px;font-weight:700;letter-spacing:-.02em}}
  .stat .k{{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-top:4px}}
  .curve-wrap{{margin:10px 0 16px;display:flex;justify-content:flex-end}}
  .stub{{height:118px;background:var(--bg);
    border-top:2px dashed var(--line);display:flex;align-items:center;justify-content:space-between;
    padding:0 44px;position:relative}}
  .stub::before,.stub::after{{content:'';position:absolute;top:-9px;width:18px;height:18px;
    background:var(--bg);border-radius:50%}}
  .stub::before{{left:28px}} .stub::after{{right:28px}}
  .stub .cta{{font-size:26px;font-weight:900;letter-spacing:-.03em;text-transform:uppercase}}
  .stub .cta span{{color:var(--accent)}}
  .stub .url{{font-family:var(--mono);font-size:15px;color:var(--muted);font-weight:700}}
  .hint{{text-align:center;margin-top:16px;font-size:13px;color:var(--muted);font-family:var(--mono)}}
  @media print{{body{{background:#fff;padding:0}} .hint{{display:none}}}}
</style></head><body>
<div class="frame">
  <div class="main">
    <section class="left">
      <div class="brand">Agent Grinder</div>
      <div>
        <div class="handle-row">
          <div class="av">{_initial(handle)}</div>
          <div>
            <div class="handle">@{_esc(handle)}</div>
            <div class="stamp">{stamp}</div>
          </div>
        </div>
        <p class="lead">{lead}</p>
        <p class="sub">{_esc(sub)}</p>
        {vibe_block}
      </div>
    </section>
    <section class="right">
      <div class="hero"><div class="n">{_esc(hero_n)}</div><div class="k">{_esc(hero_k)}</div></div>
      {hl}
      {roast_block}
      {f'<div class="curve-wrap">{curve}</div>' if curve else ''}
      {f'<div class="stats">{stat_cells}</div>' if stat_cells else ''}
    </section>
  </div>
  <div class="stub">
    <div class="cta">Your turn · <span>claim your handle</span></div>
    <div class="url">{_esc(claim_url.replace('https://', ''))}</div>
  </div>
</div>
<p class="hint">screenshot this card · share anywhere · <a href="{_esc(onboard_url)}" style="color:var(--accent)">claim yours</a></p>
</body></html>"""


def from_run_dict(run: dict, handle: str = "you", **kw) -> str:
    """Build share card from a grind dict (solo/ingest shape or DB row)."""
    from .solocard import headline as solo_headline

    hl = kw.pop("headline", None)
    if hl is None and run.get("turns_typed") is not None:
        try:
            h, _ = solo_headline(run)
            import re
            hl = re.sub(r"<[^>]+>", "", h)
        except Exception:
            hl = None
    vibe_kw = {}
    if kw.pop("vibe", False) or kw.get("vibe_label"):
        from .meme import vibe_or_default
        label, line = vibe_or_default(run)
        vibe_kw = {"vibe_label": label, "vibe_line": line}
    roast_kw = {}
    if kw.pop("roast", False):
        from .meme import roast_shape
        roast_kw = {"roast_lines": roast_shape(run)}
    return render_share_card(
        handle=handle,
        mode="grind",
        title=run.get("title"),
        harness=run.get("harness"),
        project=run.get("project"),
        prompts=run.get("prompts") or run.get("turns_typed"),
        duration_s=run.get("duration_s"),
        commits=run.get("commits"),
        tool_calls=run.get("tool_calls"),
        rhythm=run.get("rhythm") or run.get("series"),
        headline=hl,
        **vibe_kw,
        **roast_kw,
        **kw,
    )
