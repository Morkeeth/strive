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


def public_metrics(path):
    return {key: value for key, value in parse_export(path).items() if value is not None}


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
        metrics = public_metrics(args.export)
        preview_url = import_url(metrics, args.base_url)
        receipt = {
            "status": "private preview; not posted",
            "selected_export": str(args.export.resolve()),
            "selected_sitting": "latest sitting in selected export",
            "metrics": metrics,
        }
        if args.handoff:
            args.handoff.parent.mkdir(parents=True, exist_ok=True)
            args.handoff.write_text(preview_url + "\n", encoding="utf-8")
            receipt["preview_handoff"] = str(args.handoff.resolve())
        else:
            receipt["preview_url"] = preview_url
        print(json.dumps(receipt, indent=2))
    except (OSError, ValueError):
        parser.exit(1, "Could not read a supported Grok Bot sitting. Check the selected export.\n")


if __name__ == "__main__":
    main()
