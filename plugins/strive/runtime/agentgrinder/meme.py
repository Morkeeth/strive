"""Meme layer — fun labels from real numbers. No streaks. No vibes without receipts."""
from __future__ import annotations

from typing import Callable

from .ack import REASONS

# (label, one-liner, predicate on run dict)
VIBES: list[tuple[str, str, Callable[[dict], bool]]] = [
    (
        "MAIN CHARACTER",
        "One prompt. The agent did the rest. You were the plot twist.",
        lambda r: (r.get("turns_typed") or 0) <= 3 and (r.get("tool_calls") or 0) >= 40,
    ),
    (
        "FERAL",
        "High tool-to-prompt ratio. The harness is doing parkour.",
        lambda r: (r.get("turns_typed") or 0) >= 1
        and (r.get("tool_calls") or 0) / r["turns_typed"] >= 22,
    ),
    (
        "TOUCH GRASS",
        "You typed a lot. The agent barely moved. Operator mode.",
        lambda r: (r.get("turns_typed") or 0) >= 20
        and (r.get("tool_calls") or 0) / max(r["turns_typed"], 1) < 6,
    ),
    (
        "SURGICAL",
        "Few prompts, multiple commits. Scalpel, not sledgehammer.",
        lambda r: (r.get("commits") or 0) >= 2
        and (r.get("turns_typed") or 0) <= 12,
    ),
    (
        "LEFT THE ROOM",
        "Long stretch with no typing. The agent had the wheel.",
        lambda r: _stretch_active(r) >= 480 and (r.get("tool_calls") or 0) >= 12,
    ),
    (
        "GRAVEYARD",
        "Files touched that git still hasn't seen. RIP.",
        lambda r: len(r.get("deadends") or []) >= 3,
    ),
    (
        "REGION HOPPER",
        "Bounced across the codebase like it owes you money.",
        lambda r: len(set(r.get("route") or [])) >= 6,
    ),
    (
        "PROMPT MARATHON",
        "Volume session. Your keyboard carried the team.",
        lambda r: (r.get("turns_typed") or 0) >= 45,
    ),
    (
        "ZERO SHIP",
        "Lots of motion, no commit. The honest roast.",
        lambda r: (r.get("tool_calls") or 0) >= 30 and (r.get("commits") or 0) == 0,
    ),
    (
        "ACTUALLY SHIPPED",
        "Commits on the board. Proof > narrative.",
        lambda r: (r.get("commits") or 0) >= 1 and (r.get("turns_typed") or 0) >= 5,
    ),
]


def _stretch_active(run: dict) -> int:
    st = run.get("stretch") or {}
    return int(st.get("active_s") or 0)


def vibe(run: dict) -> tuple[str, str] | None:
    """Best matching vibe (first match wins — ordered by meme priority)."""
    for label, line, pred in VIBES:
        try:
            if pred(run):
                return label, line
        except (TypeError, ZeroDivisionError, KeyError):
            continue
    return None


def vibe_or_default(run: dict) -> tuple[str, str]:
    v = vibe(run)
    if v:
        return v
    tp = run.get("turns_typed") or run.get("prompts") or 0
    if tp:
        return "ORDINARY GRIND", f"{tp} real prompts. No inflation. Still postable."
    return "LOCAL ONLY", "No human turns counted. The card stays honest."


def ack_bingo(received: list[dict]) -> dict[str, bool]:
    """Which ACK reasons you've collected (from rows with a reason field)."""
    got = {rid: False for rid in REASONS}
    for row in received:
        reason = row.get("reason")
        if reason in got:
            got[reason] = True
    return got


def ack_bingo_line(bingo: dict[str, bool]) -> str:
    n = sum(1 for v in bingo.values() if v)
    if n == 0:
        return "ACK bingo: empty card — post a grind someone can recognize."
    if n == len(bingo):
        return "ACK bingo: BLACKOUT — every flavor collected."
    missing = [REASONS[k]["label"] for k, v in bingo.items() if not v]
    return f"ACK bingo: {n}/{len(bingo)} — still hunting: {', '.join(missing[:3])}"


def ghost_ratio(local_grinds: int, public_runs: int) -> tuple[str, str]:
    """Anti-humblebrag: how much stayed local."""
    if local_grinds <= 0:
        return "NO LOCAL LOG", "Run agentgrinder once. Then decide what to post."
    if public_runs <= 0:
        return "FULL GHOST", f"{local_grinds} grinds local · 0 posted. Respect the lurk."
    ratio = public_runs / local_grinds
    if ratio < 0.05:
        return "DEEP LURKER", f"{local_grinds} local · {public_runs} public. Posting is a craft, not a streak."
    if ratio > 0.5:
        return "LOUD OPERATOR", f"{public_runs} posted of {local_grinds} local. The feed knows your name."
    return "SELECTIVE", f"{public_runs} posted · {local_grinds} local. Cherry-picked, not chained."


def format_vibe(run: dict) -> str:
    label, line = vibe_or_default(run)
    return f"\n  {label}\n  {line}\n"


def roast_shape(run: dict) -> list[str]:
    """Multi-line roast from session shape. Every line cites a real number."""
    lines: list[str] = []
    tp = run.get("turns_typed") or run.get("prompts") or 0
    tc = run.get("tool_calls") or 0
    commits = run.get("commits") or 0
    files = run.get("files_touched") or 0
    edited = run.get("files_edited") or 0
    dead = len(run.get("deadends") or [])
    regions = len(set(run.get("route") or []))
    dur = run.get("duration_s") or 0
    mins = max(int(dur // 60), 1) if dur else 0

    if tc >= 40 and commits == 0:
        lines.append(f"{tc} tool calls, 0 commits. The repo is unchanged. The trace is not.")
    if tp and tc and tc / tp >= 25:
        lines.append(f"{round(tc / tp, 1)} tools per prompt. You are a manager. The agent is tired.")
    if tp >= 35 and commits <= 1:
        lines.append(f"{tp} prompts, {commits} commit{'s' if commits != 1 else ''}. Typing is not shipping.")
    if dead >= 3:
        lines.append(f"{dead} dead ends. Files visited, never committed. A cemetery with good lighting.")
    if regions >= 6 and tp and regions > tp / 3:
        lines.append(f"{regions} regions, {tp} prompts. Pick a lane. The map is bullying you.")
    if mins >= 120 and tp <= 8:
        lines.append(f"{mins} minutes, {tp} prompts. Long sit, short keyboard. Chair did more work.")
    if _stretch_active(run) >= 600 and tp <= 5:
        lines.append("Left the room. Agent kept going. You owe it lunch.")
    if tp <= 2 and tc >= 50:
        lines.append(f"{tp} prompt{'s' if tp != 1 else ''}, {tc} tools. Main character energy. Unearned.")
    if commits >= 3 and tp <= 10:
        lines.append(f"{commits} commits on {tp} prompts. Actually surgical. Rare.")
    if files >= 20 and edited < files // 2:
        lines.append(f"Touched {files} files, seriously edited {edited}. Window-shopping.")

    label, _ = vibe_or_default(run)
    if not lines:
        lines.append(f"Shape: {label}. Nothing cruel to say — the numbers are mid.")
    return lines[:4]


def format_roast(run: dict) -> str:
    lines = roast_shape(run)
    label, tag = vibe_or_default(run)
    out = [f"\n  ROAST SHAPE · {label}", f"  {tag}", ""]
    out.extend(f"  · {ln}" for ln in lines)
    out.append("")
    return "\n".join(out)
