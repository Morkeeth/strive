"""Read one Hermes Agent session from its SQLite store, read-only, counts only.

Hermes Agent (Nous Research) keeps every conversation in one SQLite file,
`~/.hermes/state.db`, not in JSONL. One Hermes session is one sitting here.

WHAT LEAVES SQLITE. Only ids, roles, timestamps, flags and tool names. The queries never select
`content`, `reasoning`, `api_content`, `system_prompt`, `title`, `display_name`, `user_id`,
`chat_id` or `origin_json`. Tool names come out of `tool_calls` through `json_each` inside
SQLite, so tool arguments never reach Python. One text test, the cron-mirror prefix, runs as
a SQL `LIKE` and returns only true or false.

WHO TYPED A TURN. Read from the Hermes source (hermes-agent 38d19b92e8), not guessed:
- `observed = 1`: a group-chat message Hermes saw but was not addressed with. Not a turn.
- `_compressed_summary = 1`: a summary Hermes wrote when it compacted history. Not a turn.
- `active = 0 AND compacted = 0`: a row Hermes retired. Not counted.
- A user-role row starting `[Cron delivery: ` is a scheduled job mirrored into a chat
  (cron/scheduler_delivery.py). Hermes drops the mirror flag at the SQLite boundary, so the
  prefix is the only marker left. Not a turn.
- `sessions.source = 'cron'`: a scheduled run. Its user rows are the job prompt. No turns.
- `sessions.model_config` with `$._delegate_from`: a sub-agent the parent spawned
  (tools/delegate_tool.py). Its user rows are the parent's brief. No turns.
- `sessions.source = 'api_server'`: another program may be calling. Authorship is unknown,
  so no turns are claimed.
"""
import hashlib
import json
import os
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from urllib.parse import quote

HERMES_DB = "~/.hermes/state.db"
PARSER_VERSION = "hermes-sqlite-2026-11-12"

CRON_MIRROR_PREFIX = "[Cron delivery: "
NO_TURN_SOURCES = ("cron", "api_server")
SHELL_TOOLS = frozenset({"terminal", "execute_code"})

_NEEDED = {
    "sessions": {"id", "source", "model_config", "started_at", "cwd", "git_repo_root"},
    "messages": {"id", "session_id", "role", "tool_calls", "timestamp", "observed",
                 "_compressed_summary", "active", "compacted"},
}


def default_db() -> str | None:
    path = os.path.expanduser(HERMES_DB)
    return path if os.path.isfile(path) else None


def connect(path: str) -> sqlite3.Connection:
    """Open read-only. `mode=ro` sees rows still in the WAL and never writes the file."""
    uri = "file:" + quote(os.path.abspath(path)) + "?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.execute("PRAGMA query_only = ON")
    missing = []
    for table, columns in _NEEDED.items():
        have = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
        missing += [f"{table}.{c}" for c in sorted(columns - have)]
    if missing:
        conn.close()
        raise ValueError(
            "This does not look like a Hermes state.db this reader knows. Missing: "
            + ", ".join(missing)
        )
    return conn


def _stamp(value) -> datetime | None:
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value), tz=timezone.utc)
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
        return parsed.astimezone(timezone.utc) if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    return None


_SESSIONS_SQL = """
SELECT s.id, s.source, s.started_at, s.cwd, s.git_repo_root,
       CASE WHEN json_valid(s.model_config)
            THEN json_extract(s.model_config, '$._delegate_from') END IS NOT NULL AS delegated
FROM sessions s ORDER BY s.started_at, s.id
"""

_ROWS_SQL = """
SELECT m.id, m.role, m.timestamp,
       (m.role = 'user' AND m.observed = 0 AND m._compressed_summary = 0
        AND (m.active = 1 OR m.compacted = 1)
        AND COALESCE(m.content, '') NOT LIKE ? ESCAPE '\\') AS human_candidate,
       (m.active = 1 OR m.compacted = 1) AS live
FROM messages m WHERE m.session_id = ? ORDER BY m.timestamp, m.id
"""

_TOOLS_SQL = """
SELECT m.id, json_extract(j.value, '$.function.name')
FROM messages m,
     json_each(CASE WHEN json_valid(m.tool_calls) THEN m.tool_calls ELSE '[]' END) j
WHERE m.session_id = ? AND m.role = 'assistant' AND (m.active = 1 OR m.compacted = 1)
ORDER BY m.timestamp, m.id
"""


def _like_prefix(prefix: str) -> str:
    return prefix.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def sessions(path: str) -> list[dict]:
    """Every session with at least one turn a person typed, oldest first. Counts only."""
    out = []
    with closing(connect(path)) as conn:
        for sid, source, started, cwd, repo_root, delegated in conn.execute(_SESSIONS_SQL).fetchall():
            records = _records(conn, sid, source, bool(delegated), cwd, repo_root)
            if any(r["human"] for r in records["rows"]):
                out.append(records)
    return out


def _records(conn, sid, source, delegated, cwd, repo_root) -> dict:
    no_turns = delegated or source in NO_TURN_SOURCES
    rows = []
    for mid, role, ts, human_candidate, live in conn.execute(
        _ROWS_SQL, (_like_prefix(CRON_MIRROR_PREFIX), sid)
    ):
        if not live:
            continue
        rows.append({"id": mid, "role": role, "time": _stamp(ts),
                     "human": bool(human_candidate) and not no_turns, "tools": []})
    by_id = {r["id"]: r for r in rows}
    for mid, name in conn.execute(_TOOLS_SQL, (sid,)):
        if mid in by_id:
            by_id[mid]["tools"].append(name if isinstance(name, str) else "")
    return {"session_id": sid, "source": source, "delegated": delegated,
            "cwd": cwd, "git_repo_root": repo_root, "rows": rows}


def choose(groups: list[dict], pick=-1) -> dict:
    index = len(groups) - 1 if pick in (None, -1) else pick - 1
    if index < 0 or index >= len(groups):
        raise ValueError("Choose a Hermes session between 1 and %d (or -1 for latest)" % len(groups))
    return groups[index]


def digest(path: str, pick=-1) -> str:
    """Hash the rows this reader uses, not the file. File bytes miss rows still in the WAL."""
    groups = sessions(path)
    if not groups:
        return hashlib.sha256(b"no-hermes-session").hexdigest()
    session = choose(groups, pick)
    shape = [session["session_id"], session["source"], session["delegated"]] + [
        [r["id"], r["role"], r["time"].isoformat() if r["time"] else None, r["human"], r["tools"]]
        for r in session["rows"]
    ]
    return hashlib.sha256(json.dumps(shape, sort_keys=True).encode()).hexdigest()


def parse_hermes_session(path: str, athlete: str = "you", records=None, pick=-1) -> dict:
    """One Hermes session -> a run dict with the same keys as the other native readers."""
    from . import cursor_tree, gitwork
    from . import reach as reachmod
    from .ingest import project_identity

    if records is None:
        groups = sessions(path)
        if not groups:
            raise ValueError(f"no Hermes session with a typed turn in {path}")
        records = choose(groups, pick)
    rows = records["rows"]

    typed = 0
    tool_calls = 0
    shell_calls = 0
    tools_per_turn: list[int] = []
    current = None
    stamps = [r["time"] for r in rows if r["time"]]
    started = None
    for row in rows:
        if row["human"]:
            if current is not None:
                tools_per_turn.append(current)
            current = 0
            typed += 1
            if started is None and row["time"]:
                started = row["time"]
        elif row["role"] == "assistant" and current is not None:
            current += len(row["tools"])
            tool_calls += len(row["tools"])
            shell_calls += sum(1 for name in row["tools"] if name in SHELL_TOOLS)
    if current is not None:
        tools_per_turn.append(current)
    if not typed:
        raise ValueError(f"no typed Hermes turn in session {records['session_id']}")

    end = max(stamps) if stamps else None
    duration = round((end - started).total_seconds()) if started and end and end >= started else None

    repo_root = None
    for candidate in (records.get("git_repo_root"), records.get("cwd")):
        if isinstance(candidate, str) and candidate:
            found = gitwork.repo_of(candidate)
            if found:
                repo_root = found[1]
                break
    project = os.path.basename(repo_root) if repo_root else None

    ridge = cursor_tree.ridge_from_turn_order(tools_per_turn)
    run = {
        "athlete": athlete,
        "title": "Hermes session",
        "harness": "Hermes",
        "is_sample": False,
        "project": project,
        "project_identity": project_identity(repo_root),
        "parser_version": PARSER_VERSION,
        "started": started.isoformat() if started else None,
        "trace_basis": "typed-turn order; Hermes row timestamps give wall time only",
        "capabilities": {"timed_trace": False, "authorship": True},
        "duration_s": duration,
        "turns_typed": typed,
        "tool_calls": tool_calls,
        "shell_calls": shell_calls,
        # Hermes records tool requests, not file writes or commits it can prove landed.
        "files_touched": None,
        "commits": None,
        "rhythm": [1] * typed,
        "claims": None,
        "claims_verified": None,
        "artifacts_produced": None,
        "artifacts_promised": None,
        "corrections": None,
        "reach": None,
        "reach_reason": reachmod.R_NO_REPO,
        "route": [],
        "route_legend": [],
        # No message text is read, so there is no private first prompt to title from.
        "private_title_prompt": None,
    }
    run.update(ridge)
    run["ridge_source"] = "turn-order"
    run["ridge_tool_calls"] = None
    run["capabilities"]["timed_ridge"] = False
    return run
