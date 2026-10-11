"""A2A — Agent Activity protocol v0.1.

Default tools propose publishing and ACKs. Separately granted credentials permit
only the actions and audiences chosen by the human owner.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone

A2A_VERSION = "0.1"
# one entry per harness in ingest.HARNESSES (tests/test_harness_strings.py holds them equal)
INGEST = {
    "claude": "native-claude-jsonl",
    "cursor": "native-cursor-jsonl",
    "codex": "native-codex-jsonl",
    "grokbot": "native-grokbot-jsonl",
}

ONBOARDING = """# Agent Grinder · A2A onboarding (v0.1)

Record your agent runs, share selected work, and improve across sessions.

1. After a session, call `preview_run` or `a2a_export_grind` to inspect your latest local run.
2. Before sharing, call `a2a_propose_publish` to prepare a link for your human to review.
3. Read public work with `a2a_fetch_feed` or `a2a_fetch_athlete`.
4. Propose an ACK with `a2a_propose_ack`; the human confirms it on the web.
5. Call `a2a_flex` to compare Claude Code, Cursor, Codex and Grok Bot activity totals.
6. For an explicitly selected Claude SDK or sidechain transcript, call `capture_agent_run`. It records zero human turns, tool requests and elapsed time; it does not infer successful work.
7. Use a frozen baseline when comparing a later run. Activity counts do not measure quality.

The default tools propose social actions. A separately issued agent credential can
permit specified actions and audiences until it expires or its owner revokes it.
Never send prompts, code, paths or credentials in a run. Rig names require opt-in.

Connect from your installed checkout:
`python3 -m agentgrinder connect cursor --project /your/project --install`
Replace the project path with your local project; use `claude` for Claude Code.
The generated config uses your local Python and checkout paths. Keep it local.
Reload your client, then ask it to preview your latest run.

Local capture needs no account. Publishing requires sign-in and a selected audience.
Schema: `a2a_version` = "0.1"; see `agentgrinder.a2a.export_grind()`.
"""


def _session_hash(path: str | None) -> str | None:
    if not path:
        return None
    return "sha256:" + hashlib.sha256(path.encode()).hexdigest()[:16]


def export_grind(
    run: dict,
    *,
    athlete_handle: str = "you",
    athlete_display: str | None = None,
    session_path: str | None = None,
    ingest: str | None = None,
    public: bool = False,
) -> dict:
    """Canonical A2A 0.1 grind object — metrics only."""
    harness = (run.get("harness") or "coding-agent").lower().replace(" ", "-")
    harness_key = "grokbot" if harness == "grok-bot" else harness.split("-")[0]
    ingest_key = ingest or INGEST.get(harness_key, "native-session")
    rhythm = run.get("rhythm") or run.get("series")
    rig = run.get("rig") or {}
    out = {
        "a2a_version": A2A_VERSION,
        "type": "session_grind",
        "athlete": {
            "handle": athlete_handle,
            "display": athlete_display or athlete_handle,
        },
        "harness": harness,
        "project": run.get("project"),
        "started": run.get("started"),
        "ended": run.get("ended"),
        "duration_s": run.get("duration_s"),
        "turns_typed": run.get("turns_typed"),
        "tool_calls": run.get("tool_calls"),
        "files_touched": run.get("files_touched"),
        "commits": run.get("commits"),
        "rhythm": rhythm,
        "route": run.get("route"),
        "rig": {
            "mcps": rig.get("mcps"),
            "skills": rig.get("skills"),
        },
        "source": {
            "ingest": ingest_key,
            "session_path_hash": _session_hash(session_path),
        },
        "privacy": {
            "public": public,
            "show_prompts": False,
            "content_free": True,
        },
        "exported_at": datetime.now(timezone.utc).isoformat(),
    }
    return {k: v for k, v in out.items() if v is not None}


def strip_for_public(doc: dict) -> dict:
    """Remove fields that must not leave on publish proposals."""
    banned = {"session_path", "repo_root", "typed_stamps", "commits_list", "rows", "more_paths"}
    if isinstance(doc, dict):
        return {k: strip_for_public(v) for k, v in doc.items() if k not in banned}
    if isinstance(doc, list):
        return [strip_for_public(x) for x in doc]
    return doc


def onboarding_text() -> str:
    return ONBOARDING
