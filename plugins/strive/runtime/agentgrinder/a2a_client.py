"""Read-only A2A client — fetch public grinds for agent-to-agent awareness."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_URL = os.environ.get(
    "AGENTGRINDER_SUPABASE_URL", "http://127.0.0.1:54321"
)
DEFAULT_KEY = os.environ.get(
    "AGENTGRINDER_SUPABASE_ANON_KEY",
    "local-development-only",
)

DEFAULT_SCHEMA = "strava"


def _get(path: str, params: dict | None = None) -> list | dict:
    q = urllib.parse.urlencode(params or {})
    url = f"{DEFAULT_URL.rstrip('/')}/rest/v1/{path}"
    if q:
        url += "?" + q
    req = urllib.request.Request(
        url,
        headers={
            "apikey": DEFAULT_KEY,
            "Authorization": f"Bearer {DEFAULT_KEY}",
            "Accept": "application/json",
            "Accept-Profile": DEFAULT_SCHEMA,
        },
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


def public_feed(limit: int = 20) -> list[dict]:
    rows = _get(
        "runs",
        {
            "select": "id,title,project,harness,prompts,duration_s,tool_calls,commits,"
            "rhythm,created_at,visibility,profiles!runs_profile_id_fkey(github_handle,name)",
            "visibility": "eq.public",
            "order": "created_at.desc",
            "limit": str(limit),
        },
    )
    return rows if isinstance(rows, list) else []


def athlete_feed(handle: str, limit: int = 20) -> list[dict]:
    prof = _get("profiles", {"github_handle": f"eq.{handle}", "select": "id"})
    if not prof:
        return []
    pid = prof[0]["id"] if isinstance(prof, list) else prof["id"]
    rows = _get(
        "runs",
        {
            "select": "id,title,project,harness,prompts,duration_s,tool_calls,commits,"
            "rhythm,created_at",
            "profile_id": f"eq.{pid}",
            "visibility": "eq.public",
            "order": "created_at.desc",
            "limit": str(limit),
        },
    )
    return rows if isinstance(rows, list) else []


def list_acks(run_id: str) -> list[dict]:
    rows = _get(
        "acks",
        {
            "select": "id,reason,created_at,from_profile",
            "run_id": f"eq.{run_id}",
            "order": "created_at.desc",
        },
    )
    if not isinstance(rows, list) or not rows:
        return []
    pids = list({r["from_profile"] for r in rows if r.get("from_profile")})
    profs: dict[str, dict] = {}
    if pids:
        for pid in pids:
            hit = _get("profiles", {"id": f"eq.{pid}", "select": "id,github_handle,name"})
            if isinstance(hit, list) and hit:
                profs[pid] = hit[0]
    for r in rows:
        r["from"] = profs.get(r.get("from_profile"), {})
    return rows


def format_acks(rows: list[dict]) -> str:
    if not rows:
        return "No ACKs on this grind yet."
    from .ack import format_reason
    lines = ["# ACKs (evidence-linked)\n"]
    for r in rows:
        who = (r.get("from") or {}).get("github_handle") or "?"
        lines.append(f"- @{who} · {format_reason(r.get('reason', ''))}")
    return "\n".join(lines)


def format_feed(rows: list[dict]) -> str:
    if not rows:
        return "No public grinds found."
    lines = ["# A2A public feed (metrics only)\n"]
    for r in rows:
        p = r.get("profiles") or {}
        who = "ghost" if r.get("visibility") == "anonymous" else (p.get("github_handle") or "?")
        mins = round((r.get("duration_s") or 0) / 60)
        lines.append(
            f"- @{who} · {r.get('title') or r.get('project') or 'grind'} · "
            f"{r.get('prompts') or '?'} prompts · {mins}m · "
            f"{r.get('commits') or 0} commits · id={r.get('id')}"
        )
    return "\n".join(lines)
