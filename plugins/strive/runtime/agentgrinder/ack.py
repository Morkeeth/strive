"""ACK — evidence-linked recognition. Not a like."""
from __future__ import annotations

REASONS: dict[str, dict[str, str]] = {
    "shipped": {
        "label": "Shipped",
        "evidence": "this grind landed commits",
    },
    "focus": {
        "label": "Deep focus",
        "evidence": "sustained prompt cadence on one objective",
    },
    "pace": {
        "label": "Strong pace",
        "evidence": "high prompts-per-hour for the moving time",
    },
    "rig": {
        "label": "Rig worth copying",
        "evidence": "harness + tool setup worth studying",
    },
    "comeback": {
        "label": "Comeback",
        "evidence": "recovery after a stalled stretch",
    },
    "handoff": {
        "label": "Trust the handoff",
        "evidence": "let the agent run a long verified stretch",
    },
}


def suggest_reasons(run: dict) -> list[str]:
    """Rank ACK reasons from published metrics only."""
    out: list[str] = []
    commits = run.get("commits") or 0
    prompts = run.get("prompts") or run.get("turns_typed") or 0
    dur = run.get("duration_s") or 0
    if commits > 0 or run.get("is_ship"):
        out.append("shipped")
    if prompts >= 25:
        out.append("focus")
    if dur and prompts:
        pph = prompts / (dur / 3600)
        if pph >= 18:
            out.append("pace")
    rig = run.get("rig") or {}
    if (rig.get("mcps") or 0) > 0 or (rig.get("skills") or 0) > 0:
        out.append("rig")
    if not out:
        out.append("focus")
    seen: set[str] = set()
    ranked: list[str] = []
    for r in out:
        if r not in seen:
            seen.add(r)
            ranked.append(r)
    return ranked[:4]


def format_reason(reason: str) -> str:
    r = REASONS.get(reason, {})
    return r.get("label", reason)


def ack_url(run_id: str, reason: str = "shipped", base: str | None = None) -> str:
    from .push import DEFAULT_URL
    base = (base or DEFAULT_URL).rstrip("/")
    return f"{base}/?run={run_id}&ack=1&reason={reason}"
