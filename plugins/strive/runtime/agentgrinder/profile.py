"""Slice 3 (local-first): a builder profile + run feed. No backend, no OAuth.

Pulls a GitHub user's PUBLIC data (no auth) and combines it with local AGENT GRINDER runs into
one profile page — the "how you work with AI" record. Real numbers only; missing = dash.
"""
from __future__ import annotations
import json, urllib.request, urllib.error
from pathlib import Path
from .metrics import build_activity


def _gh(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": "agentgrinder", "Accept": "application/vnd.github+json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError):
        return None


def github_public(username: str) -> dict:
    u = _gh(f"https://api.github.com/users/{username}") or {}
    events = _gh(f"https://api.github.com/users/{username}/events/public") or []
    pushes = [e for e in events if e.get("type") == "PushEvent"]
    commits = sum(len(e.get("payload", {}).get("commits", [])) for e in pushes)
    repos_touched = sorted({e.get("repo", {}).get("name", "") for e in pushes if e.get("repo")})
    return {
        "login": u.get("login", username),
        "name": u.get("name") or username,
        "bio": u.get("bio") or "",
        "public_repos": u.get("public_repos"),
        "followers": u.get("followers"),
        "recent_commits": commits,
        "recent_repos": repos_touched[:6],
    }


def load_runs(runs_dir: str) -> list[dict]:
    p = Path(runs_dir)
    return [json.loads(f.read_text()) for f in sorted(p.glob("*.json"))] if p.is_dir() else []


def totals_of(runs: list[dict]) -> dict:
    """The profile's numbers. Pure, so it can be tested without the network.

    THE HEADLINE is verified per turn over the runs that carry all three parts:
    (Σ verified claims + Σ artifacts produced) ÷ Σ typed turns. A run missing any part is left
    out of the ratio and counted in `vpt_runs_missing`, never defaulted to 0 — a zero nobody
    measured would drag the number down and read as a fact. Prompts stay, labelled as cost.
    """
    total_prompts = sum(int(r.get("turns_typed") or 0) for r in runs)
    total_commits = sum(int(r.get("commits") or 0) for r in runs)
    harnesses = sorted({r.get("harness", "") for r in runs if r.get("harness")})
    full = [r for r in runs if r.get("claims_verified") is not None
            and r.get("artifacts_produced") is not None and r.get("turns_typed")]
    num = sum(int(r["claims_verified"]) + int(r["artifacts_produced"]) for r in full)
    den = sum(int(r["turns_typed"]) for r in full)
    vpt = (num / den) if den else None
    return {
        "runs": len(runs),
        "prompts": total_prompts,
        "session_commits": total_commits,
        "harnesses": harnesses or ["—"],
        "verified_per_turn": f"{vpt:.2f}" if vpt is not None else "—",
        "verified_per_turn_val": vpt,
        "vpt_formula": (f"({num} verified + artifacts) ÷ {den} typed turns over {len(full)} of {len(runs)} runs"
                        if vpt is not None else
                        f"needs verified claims + artifacts produced on at least one run ({len(runs)} runs, none carry them)"),
        "vpt_runs_missing": len(runs) - len(full),
    }


def build_profile(username: str, runs_dir: str) -> dict:
    gh = github_public(username)
    runs = load_runs(runs_dir)
    acts = [build_activity(r) for r in runs]
    return {
        "gh": gh,
        "activities": acts,
        "totals": totals_of(runs),
    }
