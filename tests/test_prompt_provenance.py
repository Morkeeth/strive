import pytest

from agentgrinder.provenance import ADAPTERS, KINDS, classify, summary, validate


def test_registry_has_the_four_required_adapters():
    assert set(ADAPTERS) == {"bb", "claude-code", "codex", "cursor"}


@pytest.mark.parametrize("kind,adapter,row,context", [
    ("human-typed", "claude-code", {"type": "user", "promptSource": "typed", "message": {}}, {}),
    ("human-via-tool", "bb", {"type": "client/turn/requested", "data": {"initiator": "user", "requestId": "r1"}}, {}),
    ("agent-to-agent", "codex", {"type": "event_msg", "payload": {"type": "user_message", "message": "task"}}, {"delegated": True}),
    ("automation", "claude-code", {"type": "user", "promptSource": "system", "message": {}}, {}),
    ("unknown", "cursor", {"role": "user", "message": {"content": "unmarked request"}}, {}),
])
def test_every_kind_is_explicit(kind, adapter, row, context):
    event = classify(adapter, row, context)
    assert event["kind"] == kind
    assert event["confidence"] in {"high", "medium", "low"}
    assert event["fields"]


def test_sdk_entrypoint_without_authorship_evidence_stays_unknown():
    row = {"type": "user", "promptSource": "sdk", "userType": "external", "turnOrigin": "sdk",
           "promptId": "p1", "entrypoint": "sdk-ts", "wrapper": "bb", "message": {}}
    event = classify("claude-code", row)
    assert event == {"kind": "unknown", "confidence": "low", "adapter": "claude-code",
                     "fields": ["promptSource", "userType", "turnOrigin", "promptId", "entrypoint", "wrapper"]}


def test_summary_counts_human_relay_and_keeps_unknown_visible():
    events = [
        {"kind": "human-typed", "confidence": "high", "adapter": "cursor", "fields": ["role"]},
        {"kind": "human-via-tool", "confidence": "high", "adapter": "bb", "fields": ["data.initiator"], "relayed_by": "bb"},
        {"kind": "agent-to-agent", "confidence": "high", "adapter": "codex", "fields": ["source"]},
        {"kind": "automation", "confidence": "high", "adapter": "claude-code", "fields": ["promptSource"]},
        {"kind": "unknown", "confidence": "low", "adapter": "cursor", "fields": ["role"]},
    ]
    out = summary(events)
    assert tuple(out["counts"]) == KINDS
    assert out["human_turns"] == 2
    assert out["known_autonomous_turns"] == 2
    assert out["unknown_turns"] == 1
    assert out["relays"] == {"bb": 1}


def test_validation_accepts_json_objects_regardless_of_key_order():
    out = summary([])
    out["counts"] = dict(reversed(list(out["counts"].items())))
    assert validate(out) is out


@pytest.mark.parametrize("row", [
    {"type": "user", "isCompactSummary": True, "message": {"content": "continued summary"}},
    {"type": "user", "isVisibleInTranscriptOnly": True, "message": {"content": "local echo"}},
    {"type": "user", "message": {"content": "<bash-input>git status</bash-input>"}},
])
def test_claude_bookkeeping_user_envelopes_are_not_prompt_events(row):
    assert classify("claude-code", row) is None


def test_validation_rejects_boolean_and_out_of_range_derived_totals():
    out = summary([])
    with pytest.raises(ValueError):
        validate({**out, "v": True})
    with pytest.raises(ValueError):
        validate({**out, "human_turns": 1000001})
