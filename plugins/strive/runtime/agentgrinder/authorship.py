"""WHO WROTE THIS RECORD — the one gate every count on every card goes through.

`type: "user"` is not a person. On this machine, in the 30->31 Aug night-run window, 2,334
records carry `type: "user"` and 40 of them were written by a human. The other 2,294 are a
tool's output coming back to the agent that called it, a skill body the harness injected, and
the prompts the ORCHESTRATOR wrote to its own subagents. A counter that trusts the field is
wrong by roughly 60x, and it is wrong in the flattering direction.

This module is the project's Constitution rule 2 made executable. It is a deliberate near-copy
of Transcripto's `is_human_turn` (its `transcripto.py`, which is the measured
authority for this signal: ~95% of `type: user` records at fleet scale are not the operator).
It is COPIED, not imported, because AGENT GRINDER ships as one dependency-free package -- but
it must not DIVERGE, and `classify()` below carries the same keep/drop rules line for line:

    keep:  promptSource in (typed, queued)   -- typed live, or typed while the agent was busy
    drop:  isMeta (skill bodies, pasted-image notices) | toolUseResult (tool output)
           | isSidechain (a spawned agent's prompt) | promptSource system/sdk (peers, judges)

`queued` is kept on purpose. A prompt typed while the agent is mid-turn is still a prompt the
person typed; Transcripto measured it and keeps it, so a card that dropped it would be quietly
under-counting the human to make a prettier fleet story.

Every category below is DISJOINT and they SUM to the raw `type: user` total. That is the point:
the honest paragraph on the card can only be checked if its parts add up to the number it is
correcting, and the previous version's parts did not -- it listed "tool results" and "the 1,357
lane briefs" as separate things when the second was mostly the first.
"""
from __future__ import annotations

# The disjoint universe of `type: "user"` records. Order is the classification order.
CATEGORIES = ("human", "tool_result", "injected", "orchestrator", "harness")

LABELS = {
    "human":        "typed by a person",
    "tool_result":  "tool results (a tool's output returning to the agent that called it)",
    "injected":     "injected context (skill bodies, pasted-image notices)",
    "orchestrator": "prompts the orchestrator wrote to its own subagents",
    "harness":      "harness envelopes (slash-command expansions, task notifications, interrupts)",
}

# The command that reproduces every count in this module, on any machine:
COMMAND = "python3 -m agentgrinder authorship --since <ISO>"


def _blocks(rec: dict):
    msg = rec.get("message")
    content = msg.get("content") if isinstance(msg, dict) else None
    return content if isinstance(content, list) else []


def has_tool_result(rec: dict) -> bool:
    """True when this record is a tool's output, not a message anyone wrote.

    Two shapes carry it and BOTH must be checked: the record may hold a `tool_result` content
    block, and/or a top-level `toolUseResult` key. In the measured window 1,844 subagent records
    had the block with no top-level key and 867 orchestrator records had the key -- gating on
    either one alone misses most of them.
    """
    if rec.get("toolUseResult") is not None:
        return True
    return any(isinstance(b, dict) and b.get("type") == "tool_result" for b in _blocks(rec))


def is_human_turn(rec: dict) -> bool:
    """True iff a person typed this. Transcripto's gate, vendored (see module docstring)."""
    if rec.get("type") != "user":
        return False
    if rec.get("promptSource") not in ("typed", "queued"):
        return False
    if rec.get("isMeta") or rec.get("isSidechain") or has_tool_result(rec):
        return False
    return True


def classify(rec: dict) -> str | None:
    """One `type: "user"` record -> exactly one of CATEGORIES. None if not a user record.

    Order matters and is asserted by `test`: a pasted-image notice inside a subagent is both
    `isMeta` and `isSidechain`, and it is injected context, not something the orchestrator wrote.
    """
    if rec.get("type") != "user":
        return None
    if has_tool_result(rec):
        return "tool_result"
    if rec.get("isMeta"):
        return "injected"
    if is_human_turn(rec):
        return "human"
    if rec.get("isSidechain"):
        # A sidechain record that is neither tool output nor injected is prose the parent session
        # addressed to the lane: its opening brief, or a mid-run steering message. Both were
        # written by the orchestrator. Neither was typed by a person -- which is exactly the
        # claim the card makes, and `human` above has already taken any that were.
        return "orchestrator"
    return "harness"
