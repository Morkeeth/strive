"""Pin the two hypotheses reported for bb-driven Claude Code sessions.

bb's Claude Code bridge writes ordinary ``type: user`` transcript rows without
Claude terminal provenance fields.  STRIVE must not silently relabel those rows
as human, because the same shape is also used for injected harness messages.
The bb event export is the authoritative path: it records ``initiator``.
"""
from pathlib import Path

from agentgrinder.authorship import classify, is_human_turn
from agentgrinder.plugin import source_identity


def test_bb_driven_claude_prompt_has_no_terminal_human_provenance():
    row = {
        "type": "user",
        "userType": "human",
        "entrypoint": "bb",
        "message": {"role": "user", "content": "synthetic bb prompt"},
    }

    # userType/entrypoint are deliberately irrelevant: Claude Code's measured
    # human signal is promptSource=typed|queued.  The bb export instead supplies
    # data.initiator=user, which site/dropin-parse.js reads directly.
    assert is_human_turn(row) is False
    assert classify(row) == "harness"
    assert is_human_turn({**row, "promptSource": "typed"}) is True


def test_resumed_or_copied_session_ids_remain_separate_sources():
    ids = ["73474d0f", "6adffa63", "be263046", "15a38bd8", "1854c446"]
    found = [
        source_identity(
            [{"type": "user", "sessionId": session_id}],
            "claude",
            Path(f"/tmp/{session_id}.jsonl"),
        )
        for session_id in ids
    ]

    # STRIVE does not merge or substitute an older copy for the selected one.
    assert found == ids
    assert len(set(found)) == len(ids)
