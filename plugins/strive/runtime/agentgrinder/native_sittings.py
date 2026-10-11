"""Split Codex at observed idle gaps and Cursor at dated human-turn gaps.

Cursor assistant records often have no clock: a human-turn gap is not evidence
that its agent was idle. The positional trace does not imply elapsed tool time.
"""
import json
import re
from datetime import datetime, timezone, timedelta


def records(path):
    with open(path, encoding="utf-8") as stream:
        for line in stream:
            try:
                row = json.loads(line)
                if isinstance(row, dict): yield row
            except ValueError:
                continue


def cursor_time(text):
    match = re.search(r"<timestamp>(.*?)</timestamp>", text, re.S)
    if not match: return None
    value = match.group(1).strip()
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.astimezone(timezone.utc) if parsed.tzinfo else None
    except ValueError:
        pass
    offset = re.search(r"\(UTC(?:([+-]\d{1,2})(?::(\d{2}))?)?\)", value)
    if not offset: return None
    hours = int(offset.group(1) or 0)
    minutes = int(offset.group(2) or 0) * (-1 if (offset.group(1) or '').startswith('-') else 1)
    if abs(hours)>23 or abs(minutes)>59: return None
    zone = timezone(timedelta(hours=hours, minutes=minutes))
    value = value[:offset.start()].strip()
    for fmt in ("%A, %b %d, %Y, %I:%M %p", "%A, %B %d, %Y, %I:%M %p"):
        try: return datetime.strptime(value, fmt).replace(tzinfo=zone).astimezone(timezone.utc)
        except ValueError: pass
    return None


def sittings(path, harness, gap=1800):
    if gap <= 0: raise ValueError("Choose an idle gap greater than zero")
    source = list(records(path))
    # Codex CLI used event_msg/user_message. The desktop app now writes the same human
    # turn as response_item/message. Prefer the event form when both exist so one turn is
    # never counted twice, matching native_trace.codex_activity.
    codex_has_events = harness == "codex" and any(
        row.get("type") == "event_msg"
        and isinstance(row.get("payload"), dict)
        and row["payload"].get("type") == "user_message"
        for row in source
    )
    groups, current, metadata = [], [], []
    last = None
    idle = False
    delegated = False
    for row in source:
        payload = row.get("payload") or {}
        if not isinstance(payload, dict): payload = {}
        if harness == "codex" and row.get("type") == "session_meta":
            metadata.append({k:v for k,v in row.items() if k != "timestamp"})
            delegated = isinstance(payload.get("source"),dict) and "subagent" in payload["source"]
            continue
        if harness == "codex":
            text = None
            if row.get("type") == "event_msg" and payload.get("type") == "user_message":
                text = str(payload.get("message") or "")
            elif (not codex_has_events and row.get("type") == "response_item"
                  and payload.get("type") == "message" and payload.get("role") == "user"):
                content = payload.get("content")
                text = "".join(
                    part.get("text") or "" for part in content if isinstance(part, dict)
                ) if isinstance(content, list) else str(content or "")
            human = text is not None and not delegated and not text.lstrip().startswith(
                ("<recommended_plugins>", "<environment_context>", "<turn_aborted>", "# Files mentioned by the user:")
            )
            try:
                stamp = datetime.fromisoformat(row.get("timestamp", "").replace("Z", "+00:00"))
                stamp = stamp.astimezone(timezone.utc) if stamp.tzinfo else None
            except (ValueError, TypeError): stamp = None
        else:
            from .ingest import _cursor_text
            text = _cursor_text(row.get("message") or {})
            human = (
                row.get("role") == "user"
                and "<user_query>" in text
                and (harness != "grokbot" or "<timestamp>" in text)
            )
            stamp = cursor_time(text)
        # Idle is any gap over `gap` between two dated rows, not only the gap just before the typed
        # turn: Codex writes turn_context, token_count and task_started at the moment of sending, so
        # the row before a typed turn is always under two seconds old (measured 2 Oct over 346 turns).
        if stamp and last and (stamp-last).total_seconds()>gap:
            idle = True
        if human and current and idle:
            groups.append(metadata+current); current=[]
        if human: idle=False   # idle before the first typed turn opens nothing
        if stamp: last=stamp
        if human or current:
            current.append(row)
    if current: groups.append(metadata+current)
    return groups


def choose(groups, pick=-1):
    index = len(groups)-1 if pick in (None,-1) else pick-1
    if index < 0 or index >= len(groups): raise ValueError("Choose a sitting between 1 and %d (or -1 for latest)" % len(groups))
    return groups[index]


def read_sitting(path, harness, athlete='you', pick=-1, gap=1800):
    """One shared session boundary for CLI, MCP and comparisons."""
    if harness == 'claude':
        from .solo import parse_solo
        return parse_solo(path, athlete=athlete, pick=pick, gap=gap)
    from .ingest import parse_codex_session, parse_cursor_session, parse_grokbot_session
    parser = {
        'codex': parse_codex_session,
        'cursor': parse_cursor_session,
        'grokbot': parse_grokbot_session,
    }[harness]
    return parser(path, athlete=athlete, records=choose(sittings(path, harness, gap), pick))
