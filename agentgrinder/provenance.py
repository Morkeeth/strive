"""Typed prompt provenance for every supported coding-agent transcript.

Adapters classify only prompt-like records. They never retain prompt text. A role named
``user`` is evidence that a model received a user-role message, not evidence that a person
typed it. New tools join the registry with one adapter and fixtures for every claim it makes.
"""
from __future__ import annotations

from collections import Counter
import re
from typing import Callable

KINDS = ("human-typed", "human-via-tool", "agent-to-agent", "automation", "unknown")
CONFIDENCE = ("high", "medium", "low")
RELAY_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 ._:/+\-]{0,39}$")
CODEX_INJECTED = (
    "<recommended_plugins>", "<environment_context>", "<turn_aborted>",
    "# Files mentioned by the user:", "# AGENTS.md instructions", "<permissions instructions>",
    "<collaboration_mode>", "<apps_instructions>", "<plugins_instructions>", "<skills_instructions>",
)


def _blocks(record: dict):
    message = record.get("message")
    content = message.get("content") if isinstance(message, dict) else None
    return content if isinstance(content, list) else []


def _tool_result(record: dict) -> bool:
    return record.get("toolUseResult") is not None or any(
        isinstance(block, dict) and block.get("type") == "tool_result" for block in _blocks(record)
    )


def _result(kind: str, confidence: str, adapter: str, fields: list[str], relayed_by: str | None = None):
    assert kind in KINDS and confidence in CONFIDENCE
    out = {"kind": kind, "confidence": confidence, "adapter": adapter, "fields": fields}
    if relayed_by:
        out["relayed_by"] = relayed_by
    return out


def claude_code(record: dict, _context: dict | None = None):
    if record.get("type") != "user" or _tool_result(record) or record.get("isMeta"):
        return None
    # Claude stores transcript bookkeeping in user-role envelopes too. These rows are
    # visible context, not authored prompts, and must not make a known human count unknown.
    if record.get("isCompactSummary") or record.get("isVisibleInTranscriptOnly"):
        return None
    content = record.get("message", {}).get("content") if isinstance(record.get("message"), dict) else None
    rendered = content if isinstance(content, str) else " ".join(
        str(block.get("text") or "") for block in content or []
        if isinstance(block, dict) and block.get("type") == "text"
    )
    if rendered.lstrip().startswith(("<bash-input>", "<local-command", "<command-name>")):
        return None
    if record.get("promptSource") in ("typed", "queued") and not record.get("isSidechain"):
        return _result("human-typed", "high", "claude-code", ["promptSource", "isMeta", "isSidechain"])
    if record.get("isSidechain"):
        return _result("agent-to-agent", "high", "claude-code", ["isSidechain"])
    entrypoint = record.get("entrypoint")
    if (record.get("promptSource") == "sdk" and record.get("userType") == "external"
            and record.get("turnOrigin") == "sdk" and isinstance(record.get("promptId"), str)
            and record["promptId"].strip() and entrypoint in ("sdk-ts", "sdk-cli", "sdk-py")):
        wrapper = next((record.get(key) for key in ("wrapper", "wrapperName", "clientName", "sourceTool")
                        if isinstance(record.get(key), str) and record.get(key).strip()), None)
        fields = ["promptSource", "userType", "turnOrigin", "promptId", "entrypoint"]
        if wrapper:
            fields.append("wrapper")
        # An SDK entrypoint proves transport, not authorship. The driving tool's own export may
        # carry an explicit human initiator; the Claude envelope alone must stay unknown.
        return _result("unknown", "low", "claude-code", fields)
    if record.get("promptSource") == "system":
        return _result("automation", "high", "claude-code", ["promptSource"])
    return _result("unknown", "low", "claude-code", [key for key in ("promptSource", "entrypoint") if key in record])


def bb(record: dict, _context: dict | None = None):
    data = record.get("data") if isinstance(record.get("data"), dict) else {}
    if record.get("type") == "client/turn/requested":
        initiator = data.get("initiator")
        if initiator == "user":
            return _result("human-via-tool", "high", "bb", ["type", "data.initiator", "data.requestId"], "bb")
        if initiator == "agent":
            return _result("agent-to-agent", "high", "bb", ["type", "data.initiator"])
        if initiator == "system":
            return _result("automation", "high", "bb", ["type", "data.initiator"])
        return _result("unknown", "low", "bb", ["type"])
    item = data.get("item") if isinstance(data.get("item"), dict) else {}
    if record.get("type") in ("item/started", "item/completed") and item.get("type") == "userMessage":
        return _result("unknown", "low", "bb", ["type", "data.item.type"])
    return None


def codex(record: dict, context: dict | None = None):
    payload = record.get("payload") if isinstance(record.get("payload"), dict) else {}
    text = None
    if record.get("type") == "event_msg" and payload.get("type") == "user_message":
        text = payload.get("message") or ""
    elif record.get("type") == "response_item" and payload.get("type") == "message" and payload.get("role") == "user":
        content = payload.get("content")
        text = "".join(
            str(block.get("text") or "") for block in content if isinstance(block, dict)
        ) if isinstance(content, list) else str(content or "")
    if text is None:
        return None
    rendered = str(text)
    if rendered.lstrip().startswith(CODEX_INJECTED):
        return None
    if context and context.get("delegated"):
        return _result("agent-to-agent", "high", "codex", ["session_meta.payload.source.subagent"])
    source = (context or {}).get("source")
    if source in ("cron", "ci", "hook", "automation"):
        return _result("automation", "high", "codex", ["session_meta.payload.source"])
    return _result("human-typed", "medium", "codex", ["payload.type", "payload.role"])


def cursor(record: dict, context: dict | None = None):
    if record.get("role") != "user":
        return None
    message = record.get("message") if isinstance(record.get("message"), dict) else {}
    content = message.get("content")
    text = content if isinstance(content, str) else " ".join(
        str(block.get("text") or "") for block in content or [] if isinstance(block, dict) and block.get("type") == "text"
    )
    if "<user_query>" not in text:
        return _result("unknown", "low", "cursor", ["role"])
    relay = (context or {}).get("wrapper")
    if relay:
        return _result("human-via-tool", "medium", "cursor", ["role", "message.content.<user_query>", "wrapper"], relay)
    return _result("human-typed", "high", "cursor", ["role", "message.content.<user_query>"])


ADAPTERS: dict[str, Callable] = {"bb": bb, "claude-code": claude_code, "codex": codex, "cursor": cursor}


def classify(adapter: str, record: dict, context: dict | None = None):
    try:
        fn = ADAPTERS[adapter]
    except KeyError as error:
        raise ValueError(f"unknown provenance adapter: {adapter}") from error
    return fn(record, context)


def summary(events: list[dict]) -> dict:
    counts = Counter(event["kind"] for event in events)
    relays = Counter(event.get("relayed_by") for event in events if event["kind"] == "human-via-tool" and event.get("relayed_by"))
    return {
        "v": 1,
        "counts": {kind: counts[kind] for kind in KINDS},
        "human_turns": counts["human-typed"] + counts["human-via-tool"],
        "known_autonomous_turns": counts["agent-to-agent"] + counts["automation"],
        "unknown_turns": counts["unknown"],
        "relays": dict(sorted(relays.items())),
    }


def validate(value: dict | None):
    if value is None:
        return None
    if not isinstance(value, dict) or set(value) != {"v", "counts", "human_turns", "known_autonomous_turns", "unknown_turns", "relays"}:
        raise ValueError("invalid prompt provenance")
    # JSON has one number type: browsers and PostgreSQL cannot distinguish 1 from 1.0 after
    # exchange. Accept both spellings, but never Python's bool subclass.
    if type(value["v"]) not in (int, float) or value["v"] != 1 or not isinstance(value["counts"], dict) or set(value["counts"]) != set(KINDS):
        raise ValueError("invalid prompt provenance kinds")
    if any(type(value["counts"][kind]) is not int or not 0 <= value["counts"][kind] <= 1000000 for kind in KINDS):
        raise ValueError("invalid prompt provenance count")
    expected = {
        "human_turns": value["counts"]["human-typed"] + value["counts"]["human-via-tool"],
        "known_autonomous_turns": value["counts"]["agent-to-agent"] + value["counts"]["automation"],
        "unknown_turns": value["counts"]["unknown"],
    }
    if any(type(value[key]) is not int or not 0 <= value[key] <= 1000000 or value[key] != expected[key] for key in expected):
        raise ValueError("prompt provenance totals do not add up")
    relays = value["relays"]
    if not isinstance(relays, dict) or len(relays) > 16 or any(
        not isinstance(key, str) or RELAY_NAME.fullmatch(key) is None or type(count) is not int or not 1 <= count <= 1000000
        for key, count in relays.items()
    ) or sum(relays.values()) != value["counts"]["human-via-tool"]:
        raise ValueError("invalid prompt provenance relays")
    return value
