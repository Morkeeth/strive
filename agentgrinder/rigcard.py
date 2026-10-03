"""Rig card — share your stack with friends. Counts always; names only if you opt in."""
from __future__ import annotations
from .brand import CARD_THEME

import html
import os

from .ingest import detect_rig

# The hosted app, so a stranger's --push opens a page that exists. A contributor running the
# local UI sets AGENTGRINDER_URL=http://localhost:8000.
DEFAULT_URL = os.environ.get("AGENTGRINDER_URL", "https://striverun.app")


def _esc(s) -> str:
    return html.escape(str(s) if s is not None else "", quote=True)


def rig_from_local() -> dict:
    """Detect rig on this machine."""
    return detect_rig()


def render_rig_card(
    *,
    handle: str = "you",
    harnesses: list[str] | None = None,
    rig: dict | None = None,
    share_names: bool = False,
    anonymous: bool = False,
    base_url: str | None = None,
) -> str:
    base = (base_url or DEFAULT_URL).rstrip("/")
    rig = rig or {}
    handle = (handle or "you").lstrip("@")
    if anonymous:
        handle = "ghost"
    harnesses = harnesses or []
    mcps = rig.get("mcps") or 0
    skills = rig.get("skills") or 0
    names = rig.get("mcp_names") or [] if share_names else []
    notes = rig.get("notes") or rig.get("stack_notes") or ""
    stamp = "GHOST RIG" if anonymous else "SHOW YOUR RIG"

    name_chips = ""
    if share_names and names:
        name_chips = "".join(
            f'<span class="chip">{_esc(n)}</span>' for n in names[:12]
        )
    elif mcps and not share_names:
        name_chips = f'<span class="chip muted">{mcps} MCPs · names hidden</span>'

    harness_line = " · ".join(harnesses) if harnesses else "run a grind to detect harness"

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rig · @{_esc(handle)} · Agent Grinder</title>
<style>
  {CARD_THEME}

  *{{box-sizing:border-box;margin:0;padding:0}}
  body{{min-height:100vh;background:var(--bg);display:grid;place-items:center;padding:24px;font-family:var(--disp);color:var(--ink)}}
  .frame{{width:1200px;height:630px;background:var(--bg);border-radius:2px;overflow:hidden;
    box-shadow:none;display:flex;flex-direction:column}}
  .main{{flex:1;padding:44px 48px 28px;display:grid;grid-template-columns:1.1fr .9fr;gap:36px}}
  .brand{{font-weight:800;font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted)}}
  .handle{{font-family:var(--mono);font-size:52px;font-weight:700;letter-spacing:-.04em;margin:20px 0 8px}}
  .stamp{{display:inline-block;transform:rotate(-9deg);border:3px solid var(--accent);color:var(--accent);
    font-weight:800;font-size:14px;letter-spacing:.18em;padding:6px 16px;border-radius:5px}}
  .lead{{font-size:22px;font-weight:800;margin-top:22px;letter-spacing:-.02em}}
  .sub{{color:var(--muted);font-size:15px;line-height:1.5;margin-top:8px;max-width:480px}}
  .nums{{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:28px}}
  .num{{background:var(--card);border:1px solid var(--line);border-radius:2px;padding:18px 20px}}
  .num .v{{font-family:var(--mono);font-size:42px;font-weight:700;color:var(--accent);line-height:1}}
  .num .k{{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);margin-top:6px}}
  .stack{{background:var(--card);border:1px solid var(--line);border-radius:2px;padding:22px 24px;height:100%}}
  .stack h2{{font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:var(--muted);margin-bottom:14px}}
  .chips{{display:flex;flex-wrap:wrap;gap:8px}}
  .chip{{font-family:var(--mono);font-size:13px;font-weight:700;padding:8px 12px;border-radius:2px;
    background:var(--accent-soft);color:var(--accent);border:1px solid var(--line)}}
  .chip.muted{{background:var(--bg);color:var(--muted);border-color:var(--line)}}
  .notes{{margin-top:16px;font-size:14px;color:var(--muted);line-height:1.55;border-top:1px solid var(--line);padding-top:14px}}
  .stub{{height:96px;border-top:2px dashed var(--line);background:var(--bg);display:flex;align-items:center;
    justify-content:space-between;padding:0 44px;font-weight:800}}
  .stub span{{color:var(--accent)}}
  .url{{font-family:var(--mono);font-size:14px;color:var(--muted)}}
</style></head><body>
<div class="frame">
  <div class="main">
    <div>
      <div class="brand">Agent Grinder · Rig</div>
      <div class="handle">@{_esc(handle)}</div>
      <div class="stamp">{stamp}</div>
      <p class="lead">The stack behind the grinds</p>
      <p class="sub">Harnesses, MCPs, skills — what friends copy. Metrics from your machine; names only if you share them.</p>
      <div class="nums">
        <div class="num"><div class="v">{mcps}</div><div class="k">MCPs</div></div>
        <div class="num"><div class="v">{skills}</div><div class="k">skills</div></div>
      </div>
    </div>
    <div class="stack">
      <h2>Harness · {_esc(harness_line)}</h2>
      <div class="chips">{name_chips or '<span class="chip muted">sync with agentgrinder rig</span>'}</div>
      {f'<p class="notes">{_esc(notes)}</p>' if notes else ''}
    </div>
  </div>
  <div class="stub"><div>Steal this rig · <span>claim your handle</span></div>
    <div class="url">{_esc(base.replace('https://', '') + '/')}</div></div>
</div>
</body></html>"""


def render_heist_card(
    *,
    victim_handle: str,
    thief_handle: str,
    rig: dict | None = None,
    harness: str | None = None,
    base_url: str | None = None,
) -> str:
    """Someone ACKed your rig — shareable heist card."""
    base = (base_url or DEFAULT_URL).rstrip("/")
    rig = rig or {}
    mcps = rig.get("mcps") or 0
    skills = rig.get("skills") or 0
    names = rig.get("mcp_names") or []
    chips = "".join(f'<span class="chip">{_esc(n)}</span>' for n in names[:8]) if names else ""
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Rig heist · @{_esc(victim_handle)}</title>
<style>
  {CARD_THEME}
  body{{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);font-family:var(--disp)}}
  .card{{width:1200px;height:630px;background:var(--card);border-radius:2px;overflow:hidden;display:flex;flex-direction:column}}
  .top{{flex:1;padding:48px;display:grid;grid-template-columns:1fr 1fr;gap:32px}}
  .stamp{{display:inline-block;transform:rotate(-8deg);border:3px solid var(--accent);color:var(--accent);
    font-weight:900;letter-spacing:.2em;padding:8px 18px;margin-bottom:16px}}
  h1{{font-size:40px;margin:0 0 8px;letter-spacing:-.03em;line-height:1.1}}
  .sub{{color:var(--muted);font-size:17px;line-height:1.5}}
  .nums{{display:flex;gap:16px;margin-top:24px}}
  .n{{background:#fff;border:1px solid #ddd;padding:16px 20px;border-radius:2px}}
  .n b{{font-family:"IBM Plex Sans",monospace;font-size:36px;color:var(--accent);display:block}}
  .chips{{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}}
  .chip{{font-family:"IBM Plex Sans",monospace;font-size:12px;padding:8px 10px;background:var(--accent-soft);border-radius:2px}}
  .stub{{height:100px;background:var(--bg);border-top:2px dashed #bbb;display:flex;align-items:center;
    justify-content:space-between;padding:0 48px;font-weight:900;font-size:22px}}
  .stub span{{color:var(--accent)}}
</style></head><body><div class="card">
  <div class="top">
    <div><div class="stamp">RIG HEIST</div>
      <h1>@{_esc(thief_handle)} wants @{_esc(victim_handle)}'s rig</h1>
      <p class="sub">Evidence-linked ACK · Rig worth copying. Stack envy, receipted.</p>
      <div class="nums">
        <div class="n"><b>{mcps}</b>MCPs</div>
        <div class="n"><b>{skills}</b>skills</div>
      </div></div>
    <div><p class="sub">Harness · {_esc(harness or 'agent')}</p>
      <div class="chips">{chips or '<span class="chip">names private</span>'}</div></div>
  </div>
  <div class="stub"><div>Steal the setup · <span>claim your handle</span></div>
    <div style="font-family:monospace;font-size:14px;color:var(--muted)">{_esc(base.replace('https://',''))}</div></div>
</div></body></html>"""
