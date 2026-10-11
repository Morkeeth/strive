"""Explicit Claude SDK/sidechain capture. No automation is relabelled as human input."""
from __future__ import annotations
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from .authorship import is_human_turn, has_tool_result
from .contract import validate_run


def capture(path: str) -> dict:
    raw = Path(path).read_bytes()  # One frozen input for measurements and revision identity.
    rows = []
    for line in raw.splitlines():
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except (ValueError, UnicodeDecodeError):
            raise ValueError('The transcript contains an incomplete or invalid record. Capture after the writer finishes.') from None
        if not isinstance(row, dict):
            raise ValueError('Expected Claude transcript records.')
        rows.append(row)
    if any(is_human_turn(r) for r in rows):
        raise ValueError('This transcript includes human turns. Use the standard run capture.')
    prompts = [r for r in rows if r.get('type') == 'user' and not has_tool_result(r) and not r.get('isMeta')]
    if not prompts or any(r.get('promptSource') != 'sdk' and not r.get('isSidechain') for r in prompts):
        raise ValueError('Agent-only capture needs explicit SDK or sidechain prompt provenance.')
    seen = set()
    events, tools = [], []
    for row in rows:
        if row.get('type') not in ('user', 'assistant'):
            continue
        try:
            stamp = datetime.fromisoformat(str(row.get('timestamp', '')).replace('Z', '+00:00'))
            if stamp.tzinfo is None:
                raise ValueError()
            stamp = stamp.astimezone(timezone.utc)
        except ValueError:
            raise ValueError('Every message needs a dated timezone-aware record for this capture mode.') from None
        events.append(stamp)
        if row.get('type') != 'assistant':
            continue
        message = row.get('message') or {}
        blocks = message.get('content') or []
        if not isinstance(blocks, list):
            continue
        for block in blocks:
            if not isinstance(block, dict) or block.get('type') != 'tool_use':
                continue
            tool_id = block.get('id')
            if not isinstance(tool_id, str) or not tool_id:
                raise ValueError('A tool call has no stable ID; cannot count it reliably.')
            if tool_id not in seen:
                seen.add(tool_id)
                tools.append(stamp)
    if not any(r.get('type') == 'assistant' for r in rows) or not events:
        raise ValueError('No agent response was recorded.')
    start, end = min(events), max(events)
    # A distinct trace basis prevents accidental comparison with human-turn rhythms.
    # Sixty bins are display buckets, not a performance threshold.
    span = (end - start).total_seconds()
    rhythm = [0] * 60
    for stamp in tools:
        rhythm[min(59, int((stamp-start).total_seconds()/max(span, 1)*60))] += 1
    revision = hashlib.sha256(b'grinder-claude-agent-v1\0' + raw).hexdigest()
    result = dict(schema_version=1, harness='claude-agent', turns_typed=0,
                  started=start.isoformat(), duration_s=span, tool_calls=len(tools),
                  rhythm=rhythm, trace_basis='elapsed-agent-tool-calls',
                  measurement_revision=revision)
    # Tool requests do not prove successful edits, commits, artifacts or verified claims.
    validate_run(result)
    return result
