"""Prepare a private STRIVE Grok run preview with only the Python standard library."""
import argparse
import base64
import hashlib
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import re
from urllib.parse import quote, urlsplit

DEFAULT_URL = "https://striverun.app"
USER_QUERY = re.compile(r"<user_query>(.*?)</user_query>", re.S)


def records(path):
    with path.open(encoding="utf-8") as stream:
        for line in stream:
            try:
                row = json.loads(line)
            except ValueError:
                continue
            if isinstance(row, dict):
                yield row


def message_text(message):
    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return " ".join(
            block.get("text", "")
            for block in content
            if isinstance(block, dict) and block.get("type") == "text"
        )
    return ""


def timestamp(text):
    match = re.search(r"<timestamp>(.*?)</timestamp>", text, re.S)
    if not match:
        return None
    value = match.group(1).strip()
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.astimezone(timezone.utc) if parsed.tzinfo else None
    except ValueError:
        pass
    offset = re.search(r"\(UTC(?:([+-]\d{1,2})(?::(\d{2}))?)?\)", value)
    if not offset:
        return None
    hours = int(offset.group(1) or 0)
    minutes = int(offset.group(2) or 0)
    minutes *= -1 if (offset.group(1) or "").startswith("-") else 1
    if abs(hours) > 23 or abs(minutes) > 59:
        return None
    zone = timezone(timedelta(hours=hours, minutes=minutes))
    value = value[:offset.start()].strip()
    for fmt in ("%A, %b %d, %Y, %I:%M %p", "%A, %B %d, %Y, %I:%M %p"):
        try:
            parsed = datetime.strptime(value, fmt).replace(tzinfo=zone)
            return parsed.astimezone(timezone.utc)
        except ValueError:
            pass
    return None


def latest_sitting(rows, gap_seconds=1800):
    groups = []
    current = []
    last = None
    for row in rows:
        message = row.get("message") if isinstance(row.get("message"), dict) else {}
        text = message_text(message)
        human = (
            row.get("role") == "user"
            and "<timestamp>" in text
            and "<user_query>" in text
        )
        stamp = timestamp(text) if human else None
        if human and current and stamp and last and (stamp - last).total_seconds() > gap_seconds:
            groups.append(current)
            current = []
        if human or current:
            current.append(row)
            if stamp:
                last = stamp
    if current:
        groups.append(current)
    if not groups:
        raise ValueError("no typed <timestamp> and <user_query> turns")
    return groups[-1]


def parse_export(path):
    sitting = latest_sitting(records(path))
    sample = False
    typed = 0
    tool_calls = 0
    tools_per_turn = []
    stamps = []
    for row in sitting:
        sample = sample or row.get("agentgrinder_sample") is True
        message = row.get("message") if isinstance(row.get("message"), dict) else {}
        text = message_text(message)
        if row.get("role") == "user" and "<timestamp>" in text and USER_QUERY.search(text):
            typed += 1
            tools_per_turn.append(0)
            stamp = timestamp(text)
            if stamp:
                stamps.append(stamp)
        elif row.get("role") == "assistant":
            content = message.get("content")
            if isinstance(content, list):
                count = sum(
                    1
                    for block in content
                    if isinstance(block, dict) and block.get("type") == "tool_use"
                )
                tool_calls += count
                if tools_per_turn:
                    tools_per_turn[-1] += count
    # Standalone kit: same turn-order bins as cursor_tree.ridge_from_turn_order.
    # Only typed turns have timestamps; these bins make no wall-time claim.
    ridge = [0] * 50
    for index, count in enumerate(tools_per_turn):
        ridge[min(49, index * 50 // typed)] += count
    # Bind identity to selected source records, not metric totals. Distinct sessions
    # can have identical totals; no private record text leaves this hash.
    identity = {"parser": "strive-grok-standalone-v2", "records": sitting}
    revision = hashlib.sha256(json.dumps(identity, sort_keys=True,
        separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
    return {
        "schema_version": 1,
        "measurement_revision": revision,
        "harness": "Grok Bot",
        "is_sample": True if sample else None,
        "activity_label": "bot activity",
        "project": "session",
        "turns_typed": typed,
        "tool_calls": tool_calls,
        "started": min(stamps).isoformat() if stamps else None,
        "rhythm": [1] * typed,
        "ridge": ridge,
        "ridge_basis": "turn-order",
        "worker_bins": [0] * 50,
        "commit_bins": [],
        "trace_basis": "typed-turn order; Grok Bot export has no top-level event timestamps",
    }


def parse_native(path, bounds):
    """Frozen ReadTranscript positions, not invented timestamps or typed-human turns."""
    if not isinstance(bounds, dict) or set(bounds) != {"session_id", "start_position", "end_position"}:
        raise ValueError("Native capture needs session_id and inclusive start/end positions.")
    start, end = bounds["start_position"], bounds["end_position"]
    if (not isinstance(bounds["session_id"], str) or not bounds["session_id"].strip()
        or type(start) is not int or type(end) is not int or start < 0 or end < start):
        raise ValueError("Invalid native session bounds.")
    selected = {}
    with path.open(encoding="utf-8") as stream:
        for line in stream:
            if not line.strip():
                continue
            row = json.loads(line)  # Invalid/truncated JSON must never be skipped.
            if not isinstance(row, dict) or set(row) != {"position", "record"}:
                raise ValueError("Each native row needs position and exact record.")
            position, record = row["position"], row["record"]
            if type(position) is not int or not start <= position <= end:
                raise ValueError("Native record outside the frozen bounds.")
            if position in selected and selected[position] != record:
                raise ValueError("Conflicting duplicate native position.")
            selected[position] = record
    if len(selected) != end - start + 1:
        raise ValueError("Native capture has missing positions; finish the bounded read.")
    rows = [{"position": pos, "record": selected[pos]} for pos in sorted(selected)]
    users, calls, per_record, sample = 0, 0, [], False
    tool_ids = set()
    for row in rows:
        record = row["record"]
        if not isinstance(record, dict) or record.get("role") not in ("user", "assistant", "tool"):
            raise ValueError("Unsupported native role or record.")
        message = record.get("message")
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, list) or not content:
            raise ValueError("Native message must contain complete content blocks.")
        users += record["role"] == "user"
        sample = sample or record.get("agentgrinder_sample") is True
        count = 0
        for block in content:
            if not isinstance(block, dict):
                raise ValueError("Invalid native content block.")
            kind = block.get("type")
            if kind == "text":
                if not isinstance(block.get("text"), str):
                    raise ValueError("Incomplete native text block.")
            elif kind == "tool_use":
                if (record["role"] != "assistant" or not isinstance(block.get("id"), str)
                    or not block["id"] or not isinstance(block.get("name"), str) or not block["name"]
                    or not isinstance(block.get("input"), dict) or block["id"] in tool_ids):
                    raise ValueError("Incomplete or ambiguous native tool request.")
                tool_ids.add(block["id"])
                count += 1
            elif kind == "tool_result":
                if (record["role"] not in ("user", "tool") or not isinstance(block.get("tool_use_id"), str)
                    or not block["tool_use_id"]
                    or ("content" in block) == ("result" in block)
                    or not isinstance(block.get("result") if "result" in block else block.get("content"), (str, list, dict))):
                    raise ValueError("Incomplete native tool result.")
            else:
                raise ValueError("Unsupported native content block; do not silently discard it.")
        calls += count
        per_record.append(count)
    if not calls:
        raise ValueError("Native capture has no observed tool requests for an activity trace.")
    ridge = [0] * 50
    for index, count in enumerate(per_record):
        ridge[min(49, index * 50 // len(rows))] += count
    identity = {"parser": "strive-grok-native-v1", "bounds": bounds, "records": rows}
    revision = hashlib.sha256(json.dumps(identity, sort_keys=True,
        separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
    metrics = {"schema_version": 1, "measurement_revision": revision,
        "harness": "Grok Bot", "activity_label": "bot activity", "project": "session",
        "tool_calls": calls, "ridge": ridge, "ridge_basis": "turn-order",
        "trace_basis": "timestamps unavailable"}
    if sample:
        metrics["is_sample"] = True
    receipt = {"selected_session": bounds["session_id"], "start_position": start,
        "end_position": end, "recorded_messages": len(rows), "recorded_user_messages": users,
        "count_basis": "recorded user-role messages, not verified human-typed turns; assistant tool_use blocks",
        "unknown": ["start time", "duration", "human-typed turns", "successful commits", "worker activity"],
        "ridge_basis_detail": "tool requests across chronological record positions; spacing is not elapsed time"}
    return metrics, receipt


def public_metrics(path, format="tagged", bounds=None):
    if format == "native":
        return parse_native(path, bounds)[0]
    if format != "tagged" or bounds is not None:
        raise ValueError("Use --format native with --bounds for native records.")
    return {key: value for key, value in parse_export(path).items() if value is not None}


def add_format_arguments(parser):
    parser.add_argument("--format", choices=("tagged", "native"), default="tagged")
    parser.add_argument("--bounds", type=Path, help="native session identity and inclusive frozen positions JSON")


def read_bounds(args):
    if args.format == "native" and args.bounds is None:
        raise ValueError("Native capture requires --bounds.")
    if args.format != "native" and args.bounds is not None:
        raise ValueError("--bounds is only valid with --format native.")
    return json.loads(args.bounds.read_text(encoding="utf-8")) if args.bounds else None


def import_url(metrics, base_url):
    raw = json.dumps(metrics, separators=(",", ":")).encode()
    token = quote(base64.b64encode(raw).decode(), safe="")
    return f"{base_url.rstrip('/')}/#import={token}"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "export",
        type=Path,
        help="explicitly selected JSONL export on this bot computer",
    )
    parser.add_argument(
        "--base-url",
        default=DEFAULT_URL,
        help=f"private preview origin (default: {DEFAULT_URL})",
    )
    parser.add_argument(
        "--handoff",
        type=Path,
        help="write the complete URL to this file instead of printing a long URL",
    )
    add_format_arguments(parser)
    args = parser.parse_args()
    url = urlsplit(args.base_url)
    local = url.hostname in ("localhost", "127.0.0.1", "::1")
    valid_scheme = url.scheme == "https" or (local and url.scheme == "http")
    if (
        not valid_scheme
        or not url.hostname
        or url.username
        or url.password
        or url.query
        or url.fragment
        or url.path not in ("", "/")
    ):
        parser.error("Use an HTTPS product origin, or HTTP localhost.")
    if url.hostname == "agentgrinder.vercel.app":
        parser.error("Use the independent public-product origin, not the hackathon service.")
    try:
        bounds = read_bounds(args)
        native_receipt = None
        if args.format == "native":
            metrics, native_receipt = parse_native(args.export, bounds)
        else:
            metrics = public_metrics(args.export)
        preview_url = import_url(metrics, args.base_url)
        receipt = {
            "status": "private preview; not posted",
            "selected_export": str(args.export.resolve()),
            "selected_sitting": "latest sitting in selected export",
            "metrics": metrics,
        }
        if native_receipt is not None:
            receipt["selected_sitting"] = "explicit frozen native bounds; no timing-based split"
            receipt["native_capture"] = native_receipt
        if args.handoff:
            args.handoff.parent.mkdir(parents=True, exist_ok=True)
            args.handoff.write_text(preview_url + "\n", encoding="utf-8")
            receipt["preview_handoff"] = str(args.handoff.resolve())
        else:
            receipt["preview_url"] = preview_url
        print(json.dumps(receipt, indent=2))
    except (OSError, ValueError) as error:
        parser.exit(1, "Could not read supported Grok Bot capture: " + str(error) + "\n")


if __name__ == "__main__":
    main()
