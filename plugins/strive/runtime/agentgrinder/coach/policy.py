"""The coach policy: from the tool calls made so far to the next tool call.

Strands-free on purpose. `local_model.ScriptedLocalModel` replays this through the real Strands
event loop; `agent.run_deterministic_coach` calls the same policy against the plain functions
when no agent can run. One policy, two drivers, so the fallback cannot drift from the agent.

It is deterministic and it does not reason: read the run, check every claim, verify every
artifact, ask git about each, then write the verdict from the numbers the tools returned. The
paragraph and plan are templates filled with those numbers.
"""
from __future__ import annotations

import json
from typing import Any, Callable, Dict, List, Optional, Tuple

Step = Tuple[str, Dict[str, Any]]
History = List[Tuple[str, Dict[str, Any], Optional[Dict[str, Any]]]]   # (tool, input, parsed result)
Policy = Callable[[History], Optional[Step]]

FINAL_TEXT = ("Verdict written. Every number in it came back from a tool in this run: read_run "
              "for the counts, check_claim per claim, verify_artifact and git_evidence per file. "
              "I did not invent a number.")
REFUSED_TEXT = "write_verdict refused the numbers I offered; the refusal reasons are in its result."


def history_of(messages: Messages) -> History:
    """(name, input, result) for every tool call the loop has completed, in order.

    Pairs `toolUse` blocks in assistant messages with `toolResult` blocks by toolUseId, so the
    policy reads what the SDK actually dispatched and what the tools actually returned, not
    what the plan intended.
    """
    uses: dict[str, tuple[str, dict]] = {}
    order: list[str] = []
    results: dict[str, dict | None] = {}
    for m in messages:
        for b in m.get("content", []):
            if "toolUse" in b:
                tu = b["toolUse"]
                uses[tu["toolUseId"]] = (tu["name"], tu.get("input") or {})
                order.append(tu["toolUseId"])
            elif "toolResult" in b:
                tr = b["toolResult"]
                text = "".join(c.get("text", "") for c in tr.get("content", []) if isinstance(c, dict))
                try:
                    results[tr["toolUseId"]] = json.loads(text) if text else None
                except json.JSONDecodeError:
                    results[tr["toolUseId"]] = {"text": text}
    return [(uses[i][0], uses[i][1], results.get(i)) for i in order if i in results]


# ---- the coach policy -------------------------------------------------------------------------

def _first(history: History, name: str) -> dict | None:
    return next((r for n, _, r in history if n == name and r is not None), None)


def coach_policy(history: History) -> Step | None:
    """Read, then check every claim, verify every artifact, ask git, then write the verdict."""
    rr = _first(history, "read_run")
    if rr is None:
        return ("read_run", {})
    claims = rr.get("claims") or []
    artifacts = rr.get("artifacts") or []

    done = {(n, json.dumps(i, sort_keys=True)) for n, i, _ in history}
    for c in claims:
        if ("check_claim", json.dumps({"claim_id": c["id"]})) not in done:
            return ("check_claim", {"claim_id": c["id"]})
    for a in artifacts:
        if ("verify_artifact", json.dumps({"artifact_id": a["id"]})) not in done:
            return ("verify_artifact", {"artifact_id": a["id"]})
    if rr.get("in_git"):
        for a in artifacts:
            if ("git_evidence", json.dumps({"artifact_id": a["id"]})) not in done:
                return ("git_evidence", {"artifact_id": a["id"]})
    if any(n == "write_verdict" for n, _, _ in history):
        return None      # accepted or refused, the loop ends; the report shows which

    # the numbers, read back from the tool results and nowhere else
    checks = [r for n, _, r in history if n == "check_claim" and r]
    exists = [r for n, _, r in history if n == "verify_artifact" and r]
    gits = [r for n, _, r in history if n == "git_evidence" and r]
    verified = [r for r in checks if r.get("verified")]
    unverified = [r["claim_id"] for r in checks if not r.get("verified")]
    on_disk = [r for r in exists if r.get("exists")]
    missing = [r["label"] for r in exists if not r.get("exists")]
    landed = [g for g in gits if g.get("asked") and (g.get("in_window") or g.get("committed_later"))]
    uncommitted = [g["label"] for g in gits if g.get("asked") and not g.get("ignored")
                   and not g.get("in_window") and not g.get("committed_later")
                   and any(e.get("exists") and e["artifact_id"] == g["artifact_id"] for e in exists)]

    n_turns, n_commits = rr["turns_typed"], rr["commits"]
    paragraph = (f"{len(verified)} of {len(claims)} claims had evidence in their own turn. "
                 f"{len(on_disk)} of {len(artifacts)} files the run wrote exist on disk"
                 + (f", {len(landed)} of them in a commit" if rr.get("in_git") else
                    ", git was not asked (not a work tree)")
                 + f". {n_commits} commit{'' if n_commits == 1 else 's'} during the sitting, "
                 f"over {n_turns} typed turn{'' if n_turns == 1 else 's'}.")
    from .experiment import from_history
    experiment = from_history(history, rr)
    # Keep the unused locals so a future reader can see the full checklist still happened.
    _ = (unverified, missing, uncommitted)
    return ("write_verdict", dict(
        turns_typed=n_turns, claims=len(claims), claims_verified=len(verified),
        artifacts_produced=len(on_disk), commits=n_commits, paragraph=paragraph,
        plan=experiment["plan"]))
