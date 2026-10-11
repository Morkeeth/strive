"""Pick ONE supported friction and ONE next-session experiment from tool results.

The coach still checks every claim and file. The payoff for the builder is not that
checklist: it is a specific unsupported moment, what it costs, and one change to try
next. Counts alone are not the experiment.

This module is Strands-free. The local scripted policy and the deterministic fallback
share it so the plan cannot drift. A live Bedrock model is asked for the same shape in
the system prompt; this function still records the tool-backed candidate the card can
accept as a practice.
"""
from __future__ import annotations

import re
from typing import Any

TEST_NAME = re.compile(r"\btest_\w+")
BASENAME = re.compile(
    r"\b[\w.-]+\.(?:py|ts|js|tsx|jsx|md|json|html|toml|sh)\b"
)


def looks_like_path(token: str) -> bool:
    """Directory, home, or drive-shaped. A bare basename is not a path leak."""
    t = (token or "").strip(".,;:()[]{}'\"`")
    if not t:
        return False
    if t.startswith("~") or t.startswith("/") or t.startswith("\\"):
        return True
    if "\\" in t or t.count("/") >= 1:
        return True
    if re.match(r"^[A-Za-z]:", t):
        return True
    return False


def named_targets(line: str) -> list[str]:
    """Public-safe names only: test_ identifiers and slash-free file basenames.

    Claim text can carry a home directory. Those tokens are dropped, not shortened.
    A test_ name that appears as its own word is the useful local coaching target.
    """
    seen: list[str] = []
    for raw in (line or "").split():
        tok = raw.strip(".,;:()[]{}'\"`")
        if not tok or looks_like_path(tok):
            continue
        for m in [*TEST_NAME.findall(tok), *BASENAME.findall(tok)]:
            if m not in seen and not looks_like_path(m):
                seen.append(m)
    return seen


def public_text(value: str | None) -> str | None:
    """Replace path-shaped tokens. Metrics, test names and basenames stay. Newlines stay."""
    if value is None:
        return None
    lines = []
    for line in str(value).splitlines():
        parts = []
        for raw in line.split():
            tok = raw.strip(".,;:()[]{}'\"`")
            parts.append("[file]" if looks_like_path(tok) else raw)
        lines.append(" ".join(parts))
    return "\n".join(lines)


def public_experiment(exp: dict[str, Any] | None) -> dict[str, Any] | None:
    """Coach experiment safe to export. Local callers may keep the unsanitised dict."""
    if not exp:
        return exp
    out: dict[str, Any] = {}
    for k, v in exp.items():
        if k == "plan" and isinstance(v, list):
            out[k] = [public_text(x) for x in v]
        elif isinstance(v, str):
            out[k] = public_text(v)
        else:
            out[k] = v
    return out


LOCAL_RUN_KEYS = ("coach_experiment_local", "private_coach_plan")


def public_run_view(run: dict[str, Any]) -> dict[str, Any]:
    """JSON that may leave the process: drop local-only keys and strip path-shaped tokens."""
    out = {k: v for k, v in run.items() if k not in LOCAL_RUN_KEYS}
    if "coach_verdict" in out:
        out["coach_verdict"] = public_text(out.get("coach_verdict"))
    if "coach_plan" in out:
        out["coach_plan"] = public_text(out.get("coach_plan"))
    if "coach_experiment" in out:
        out["coach_experiment"] = public_experiment(out.get("coach_experiment"))
    return out


def select_experiment(
    *,
    claims: list[dict],
    checks: list[dict],
    artifacts: list[dict],
    exists: list[dict],
    gits: list[dict],
    turns_typed: int,
    commits: int,
) -> dict[str, Any]:
    """Return one experiment dict. Never invents a friction the tools did not return."""
    check_by = {r.get("claim_id"): r for r in checks if r and "claim_id" in r}
    exist_by = {r.get("artifact_id"): r for r in exists if r and "artifact_id" in r}
    git_by = {r.get("artifact_id"): r for r in gits if r and "artifact_id" in r}

    named_unverified = []
    generic_unverified = []
    for c in claims:
        chk = check_by.get(c["id"]) or {}
        if chk.get("verified"):
            continue
        targets = named_targets(c.get("line") or "")
        row = dict(c, check=chk, targets=targets)
        (named_unverified if targets else generic_unverified).append(row)

    missing = [r for r in exists if r and r.get("exists") is False]
    uncommitted = [
        g for g in gits
        if g and g.get("asked") and not g.get("ignored")
        and not g.get("in_window") and not g.get("committed_later")
        and (exist_by.get(g.get("artifact_id")) or {}).get("exists")
    ]

    if named_unverified:
        c = named_unverified[0]
        targets = ", ".join(c["targets"][:3])
        n_results = c["check"].get("results_in_turn")
        evidence = (
            f"check_claim on claim {c['id']} (turn {c.get('turn')}): verified=false"
            + (f", {n_results} tool result(s) in that turn" if n_results is not None else "")
            + ", no matching evidence snippet."
        )
        target = c["targets"][0]
        action = f"run {target}" if target.startswith("test_") else f"check that {target} exists and inspect its contents"
        return _pack(
            kind="unverified-named-claim",
            claim_id=c["id"],
            friction=(
                f"Claim {c['id']} named {targets} as done, but check_claim found no matching "
                f"evidence in that claim's own turn."
            ),
            consequence=(
                "The card cannot treat that claim as verified. A later sitting that looks "
                "shorter or busier is not proof the named check ran."
            ),
            title=f"{action[0].upper() + action[1:]} in the same turn as the claim",
            instruction=(
                f"In the same human turn as the completion claim, {action} and "
                "keep its result in that turn before saying it passed. Do not claim a deploy "
                "or extra file in the same sentence unless that turn also holds its evidence."
            ),
            expected=(
                f"check_claim on the named target returns verified, with {c['targets'][0]} "
                "in the evidence snippet. Missing evidence stays unknown, not zero."
            ),
            evidence=evidence,
        )

    if missing:
        a = missing[0]
        label = a.get("label") or f"artifact {a.get('artifact_id')}"
        return _pack(
            kind="missing-artifact",
            artifact_id=a.get("artifact_id"),
            friction=f"{label} was written in the sitting, but verify_artifact reports it is not on disk.",
            consequence=(
                "A later count of artifacts cannot be read as progress while a promised file "
                "is still missing."
            ),
            title=f"Recreate or drop {label} before the next sitting",
            instruction=(
                f"Either recreate {label} in the next sitting and confirm it exists on disk, "
                "or stop claiming it. Do not treat a missing path as zero produced."
            ),
            expected="verify_artifact for that file returns exists=true, or the claim is dropped.",
            evidence=f"verify_artifact artifact_id={a.get('artifact_id')} exists=false label={label}",
        )

    if uncommitted:
        g = uncommitted[0]
        label = g.get("label") or f"artifact {g.get('artifact_id')}"
        return _pack(
            kind="uncommitted-file",
            artifact_id=g.get("artifact_id"),
            friction=f"{label} exists on disk, but git_evidence found no commit containing it.",
            consequence="Tool activity without a recorded commit is not shipping.",
            title=f"Commit or discard {label} before the next sitting",
            instruction=(
                f"Commit {label} inside the sitting window, or discard it. Do not read extra "
                "tool calls as delivery."
            ),
            expected="git_evidence for that file returns a commit inside the sitting, or the file is gone.",
            evidence=f"git_evidence artifact_id={g.get('artifact_id')} asked=true in_window empty",
        )

    if generic_unverified:
        c = generic_unverified[0]
        n_results = c["check"].get("results_in_turn")
        return _pack(
            kind="unverified-claim",
            claim_id=c["id"],
            friction=(
                f"Claim {c['id']} had no evidence in its own turn"
                + (f" ({n_results} tool result(s) present)" if n_results is not None else "")
                + "."
            ),
            consequence=(
                "An unverified completion claim inflates confidence. The next sitting should "
                "put the check in the same turn as the sentence."
            ),
            title="Run the check in the same turn as the completion claim",
            instruction=(
                "In the same human turn as the completion claim, run the check and keep its "
                "result in that turn. Name the test or file in the sentence."
            ),
            expected="check_claim on that claim returns verified, with a matching snippet. Unknown stays unknown.",
            evidence=f"check_claim claim_id={c['id']} verified=false",
        )

    return _pack(
        kind="keep-shape",
        friction="Every checked claim had evidence in its own turn, and every written file exists.",
        consequence="There is no supported friction in this sitting to repair. Keep the shape; do not invent a score.",
        title="Keep this shape; change only one constraint next time",
        instruction=(
            "Keep same-turn evidence. Change one constraint (task, harness, or check) and "
            "record what you expect before the sitting starts."
        ),
        expected="The next sitting still has same-turn evidence. A different task is incomparable, not a personal best.",
        evidence=f"turns_typed={turns_typed} commits={commits} claims={len(claims)} artifacts={len(artifacts)}",
    )


def _pack(**fields: Any) -> dict[str, Any]:
    plan = [
        f"Friction: {fields['friction']}",
        f"Consequence: {fields['consequence']}",
        f"Experiment: {fields['instruction']}",
        f"Look for: {fields['expected']}",
    ]
    return dict(fields, plan=plan)


def from_history(history: list, read_run_result: dict) -> dict[str, Any]:
    claims = read_run_result.get("claims") or []
    checks = [r for n, _, r in history if n == "check_claim" and r]
    exists = [r for n, _, r in history if n == "verify_artifact" and r]
    gits = [r for n, _, r in history if n == "git_evidence" and r]
    return select_experiment(
        claims=claims, checks=checks, artifacts=read_run_result.get("artifacts") or [],
        exists=exists, gits=gits,
        turns_typed=read_run_result.get("turns_typed") or 0,
        commits=read_run_result.get("commits") or 0,
    )


def from_context(ctx: Any) -> dict[str, Any]:
    claims = [dict(id=c["id"], turn=c["turn"], line=c["line"]) for c in ctx.claims]
    checks = []
    for c in ctx.claims:
        verified = ctx.checked.get(c["id"])
        if verified is None:
            continue
        row = dict(claim_id=c["id"], turn=c["turn"], verified=verified)
        if not verified:
            row["results_in_turn"] = len(ctx.results.get(c["turn"], []))
        checks.append(row)
    exists = []
    for a in ctx.artifacts:
        if a["id"] not in ctx.exists:
            continue
        exists.append(dict(artifact_id=a["id"], label=a["label"], exists=ctx.exists[a["id"]]))
    gits = list(ctx.git.values())
    return select_experiment(
        claims=claims, checks=checks, artifacts=ctx.artifacts,
        exists=exists, gits=gits,
        turns_typed=ctx.run.get("turns_typed") or 0,
        commits=ctx.run.get("commits") or 0,
    )


def activity_experiment(run: dict) -> dict[str, Any]:
    """Capability-limited adapters: one honest next action, never a fake success rate."""
    tools = run.get("tool_calls")
    commits = run.get("commits")
    turns = run.get("turns_typed")
    if commits == 0 and isinstance(tools, int) and tools >= 10:
        return _pack(
            kind="activity-no-commit",
            friction=(
                f"This adapter recorded {tools} tool calls and 0 commits. Claim verification "
                "is unavailable, so a success rate is not inferred."
            ),
            consequence="More tool calls are not shipping. A later sitting with a different task is incomparable.",
            title="Record one commit or an explicit decision not to ship",
            instruction=(
                "In the next sitting, either land one commit that contains the files you meant "
                "to ship, or write that you chose not to ship. Keep claim evidence unknown."
            ),
            expected="commits is 1 or more, or the note says you chose not to ship. Claims stay unknown.",
            evidence=f"read_activity tool_calls={tools} commits=0 claims_verified=null",
        )
    return _pack(
        kind="activity-named-check",
        friction=(
            f"Claim evidence is not supported on this adapter. The transcript recorded "
            f"{turns if turns is not None else 'an unknown number of'} human turns; no "
            "verified-per-turn rate is available."
        ),
        consequence=(
            "Do not read artifacts or tool calls as proof a named check passed. Put the "
            "check you care about in the same turn as the completion sentence, then capture again."
        ),
        title="Name one check and run it in the same turn as the claim",
        instruction=(
            "Before the next sitting, name one test or file you will check. Run it in the "
            "same human turn as the completion claim and keep the result in that turn."
        ),
        expected="The next capture still leaves claims unknown unless a supported harness is used. Record the named check yourself.",
        evidence="read_activity limits: claim evidence unavailable for this adapter",
    )
