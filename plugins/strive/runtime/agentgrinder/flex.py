"""Flex — compare your real runs across supported agents on this machine."""
from __future__ import annotations

import glob
import os

from . import history
from .ingest import (
    CURSOR_GLOB,
    codex_session_files,
    grokbot_session_files,
    latest_cursor_session,
    latest_codex_session,
    latest_grokbot_session,
    latest_session,
    parse_cursor_session,
    parse_codex_session,
    parse_grokbot_session,
)

HARNESS_ORDER = ("Claude Code", "Cursor", "Fleet", "Codex", "Grok Bot")


def _claude_stats() -> dict:
    hist = history.load()
    if not hist:
        return dict(harness="Claude Code", grinds=0, prompts=0, moving_s=0, commits=0)
    return dict(
        harness="Claude Code",
        grinds=len(hist),
        prompts=sum(h["typed"] for h in hist),
        moving_s=sum(h["moving_s"] for h in hist),
        tools=sum(h["tools"] for h in hist),
        edits=sum(h["edits"] for h in hist),
    )


def _native_stats(files, harness):
    from .native_sittings import sittings
    parser = {
        'cursor': parse_cursor_session,
        'codex': parse_codex_session,
        'grokbot': parse_grokbot_session,
    }[harness]
    runs = []
    for path in files:
        try:
            runs.extend(parser(path, records=group) for group in sittings(path, harness))
        except (OSError, ValueError):
            continue
    durations = [r.get('duration_s') for r in runs]
    return dict(harness={'cursor':'Cursor','codex':'Codex','grokbot':'Grok Bot'}[harness],
        grinds=len(runs), prompts=sum(r.get('turns_typed') or 0 for r in runs),
        moving_s=sum(durations) if all(d is not None for d in durations) else None,
        tools=sum(r.get('tool_calls') or 0 for r in runs),
        time_basis='elapsed session time', source=f'{len(files)} recent transcript files')


def _cursor_stats(scan: int = 80) -> dict:
    files = sorted(glob.glob(os.path.expanduser(CURSOR_GLOB)), key=os.path.getmtime, reverse=True)[:scan]
    return _native_stats(files, 'cursor')


def _codex_stats(scan: int = 80) -> dict:
    return _native_stats(codex_session_files()[:scan], 'codex')


def _grokbot_stats(scan: int = 80) -> dict:
    return _native_stats(grokbot_session_files()[:scan], 'grokbot')


def local_flex() -> list[dict]:
    """Per-harness totals on this machine."""
    rows = [_claude_stats(), _cursor_stats(), _codex_stats(), _grokbot_stats()]
    return [r for r in rows if r["grinds"] > 0]


def latest_any() -> tuple[str, str] | None:
    """(harness_id, session_path) for the freshest grind across agents."""
    c = latest_session()
    cu = latest_cursor_session()
    cx = latest_codex_session()
    gb = latest_grokbot_session()
    candidates: list[tuple[str, str, float]] = []
    if c:
        candidates.append(("claude", c, os.path.getmtime(c)))
    if cu:
        candidates.append(("cursor", cu, os.path.getmtime(cu)))
    if cx:
        candidates.append(("codex", cx, os.path.getmtime(cx)))
    if gb:
        candidates.append(("grokbot", gb, os.path.getmtime(gb)))
    if not candidates:
        return None
    harness, path, _ = max(candidates, key=lambda x: x[2])
    return harness, path


def format_flex(rows: list[dict] | None = None) -> str:
    rows = rows if rows is not None else local_flex()
    if not rows:
        return "No grinds found — run agentgrinder grind after a Claude, Cursor, Codex or Grok Bot session."
    lines = ["\n  flex · your real runs across agents\n"]
    for r in rows:
        h = r["harness"]
        g = r["grinds"]
        p = r["prompts"]
        mins = f"{r['moving_s'] // 60}m" if r.get('moving_s') is not None else 'unknown'
        basis = r.get('time_basis', 'moving time')
        lines.append(f"  {h:<14}  {g:>4} runs  {p:>6} prompts  {mins} {basis}")
        lines.append(f"    source: {r.get('source', 'saved local history')}")
    lines.append("\n  post any grind:  agentgrinder grind --push\n")
    lines.append("  Sources and time definitions differ. These totals do not rank agent quality.")
    return "\n".join(lines)


def flex_from_runs(runs: list[dict]) -> list[dict]:
    """Group published runs (web/DB) by harness string."""
    by: dict[str, dict] = {}
    for r in runs:
        raw = (r.get("harness") or "unknown").strip()
        key = raw if raw else "unknown"
        if key not in by:
            by[key] = dict(harness=key, grinds=0, prompts=0, moving_s=0, commits=0)
        b = by[key]
        b["grinds"] += 1
        b["prompts"] += r.get("prompts") or r.get("turns_typed") or 0
        b["moving_s"] += r.get("duration_s") or 0
        b["commits"] += r.get("commits") or 0
    return sorted(by.values(), key=lambda x: -x["grinds"])
