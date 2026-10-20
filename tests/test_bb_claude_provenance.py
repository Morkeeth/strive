"""Pin the two reported hypotheses for bb-driven Claude Code sessions."""
import json

import pytest

from agentgrinder.authorship import classify, is_external_sdk_turn, is_human_turn
from agentgrinder.ingest import parse_session
from agentgrinder.session_picker import discover


def sdk_row(entrypoint="sdk-ts"):
    return {
        "type": "user", "sessionId": "1854c446", "uuid": "shared-message",
        "timestamp": "2026-10-20T09:00:00Z", "promptSource": "sdk",
        "userType": "external", "entrypoint": entrypoint, "turnOrigin": "sdk",
        "promptId": "prompt-fixture", "isMeta": False, "isSidechain": False,
        "message": {"role": "user", "content": "synthetic bb prompt"},
    }


@pytest.mark.parametrize("entrypoint", ["sdk-ts", "sdk-cli", "sdk-py"])
def test_sdk_request_is_detected_but_never_relabelled_human(entrypoint):
    row = sdk_row(entrypoint)
    assert is_external_sdk_turn(row) is True
    assert is_human_turn(row) is False
    assert classify(row) == "harness"


@pytest.mark.parametrize("field,value", [
    ("promptId", None), ("userType", "internal"), ("turnOrigin", "user"),
    ("isMeta", True), ("isSidechain", True), ("entrypoint", "cli"),
])
def test_incomplete_or_injected_sdk_shapes_do_not_match(field, value):
    row = sdk_row()
    row[field] = value
    assert is_external_sdk_turn(row) is False


def test_sdk_driven_claude_file_gets_bb_export_instruction(tmp_path):
    source = tmp_path / "1854c446.jsonl"
    source.write_text(json.dumps(sdk_row()) + "\n")
    with pytest.raises(ValueError, match=r"bb thread log --all --json"):
        parse_session(str(source))


def test_resumed_copies_stay_separate_and_earlier_copy_is_only_older(tmp_path):
    older = tmp_path / "73474d0f.jsonl"
    current = tmp_path / "1854c446.jsonl"
    shared = {
        "type": "user", "uuid": "shared-message", "promptSource": "typed",
        "timestamp": "2026-10-20T09:00:00Z", "cwd": str(tmp_path),
        "message": {"role": "user", "content": "shared synthetic prompt"},
    }
    older.write_text(json.dumps({**shared, "sessionId": "73474d0f"}) + "\n")
    current.write_text("\n".join([
        json.dumps({**shared, "sessionId": "1854c446"}),
        json.dumps({**shared, "sessionId": "1854c446", "uuid": "new-message",
                    "timestamp": "2026-10-20T09:05:00Z",
                    "message": {"role": "user", "content": "new synthetic prompt"}}),
    ]) + "\n")

    rows = discover("claude", candidates=[("claude", older), ("claude", current)])
    assert {row["session"] for row in rows} == {"73474d0f", "1854c446"}
    assert parse_session(str(older))["turns_typed"] == 1
    assert parse_session(str(current))["turns_typed"] == 2
