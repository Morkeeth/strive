"""Read one Hermes Agent session from its SQLite store, read-only, counts only.

Hermes Agent (Nous Research) keeps every conversation in one SQLite file,
`~/.hermes/state.db`, not in JSONL. One Hermes session is one sitting here.

WHAT LEAVES SQLITE. Ids, roles, timestamps, flags, tool names, and two session fields:
`cwd` and `git_repo_root`. Those two give the run its project the same way the other readers
do: the basename of the git repository the session worked in, which the person can edit
before saving. No path travels with the run. The queries never select `content`, `reasoning`,
`api_content`, `system_prompt`, `title`, `display_name`, `user_id`, `chat_id` or
`origin_json`. Tool names come out of `tool_calls` through `json_each` inside SQLite, so tool
arguments never reach Python. Text tests (cron mirror, compaction handoff) run as SQL `LIKE`
and return only true or false.

WHO TYPED A TURN. Read from the Hermes source (hermes-agent 38d19b92e8), not guessed:
- Hermes's own rule for a user-originated turn (hermes_state_search.py:788): a user row whose
  `display_kind` is empty or `steer`. Every other kind is bookkeeping: delegation results
  (`async_delegation_complete`, `hidden`), `process_complete`, `model_switch`,
  `auto_continue`, `skill_invocation`, `personality_switch`.
- `display_metadata.model_only`: a row only the model sees. Not a turn.
- `observed = 1`: a group-chat message Hermes saw but was not addressed with. Not a turn.
- `_compressed_summary = 1`, or text starting with a compaction prefix: a summary Hermes wrote
  when it compacted history. Not a turn.
- A user row starting `[Cron delivery: ` is a scheduled job mirrored into a chat
  (cron/scheduler_delivery.py). Hermes drops the mirror flag at the SQLite boundary, so the
  prefix is the only marker left. Not a turn.
- `sessions.source = 'cron'`: a scheduled run. `sessions.model_config.$._delegate_from`: a
  sub-agent the parent spawned. `sessions.source = 'api_server'`: another program may be
  calling, so authorship is unknown. None of these claims a typed turn.

WHICH ROWS. Live rows only (`active = 1 OR compacted = 1`). Compaction copies a protected tail
into each new generation, so one logical message can have several rows with the same
`display_order`; Hermes keeps one per `display_order`, the live one, then the newest
(hermes_state_messages.py `_display_rows_from_conn`). This reader does the same. Order is
insertion order (`id`), never the clock: Hermes timestamps can go backwards. Timestamps are
used only for wall time.

ONE SNAPSHOT. Every query of one read runs inside one read transaction, and the digest hashes
exactly the rows that were counted, so a row that lands mid-read cannot be counted in one and
missed in the other.
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
# agent/context_compressor.py SUMMARY_PREFIX (current) and LEGACY_SUMMARY_PREFIX.
SUMMARY_PREFIXES = ("[CONTEXT COMPACTION", "[CONTEXT SUMMARY]:")
HUMAN_DISPLAY_KINDS = ("", "steer")
NO_TURN_SOURCES = ("cron", "api_server")
SHELL_TOOLS = frozenset({"terminal", "execute_code"})

_NEEDED = {
    "sessions": {"id", "source", "model_config", "started_at", "cwd", "git_repo_root"},
    "messages": {"id", "session_id", "role", "content", "tool_calls", "timestamp", "observed",
                 "_compressed_summary", "active", "compacted", "display_kind",
                 "display_metadata", "display_order"},
}


def default_db() -> str | None:
    path = os.path.expanduser(HERMES_DB)
    return path if os.path.isfile(path) else None


def connect(path: str) -> sqlite3.Connection:
    """Open read-only. `mode=ro` sees rows still in the WAL and never writes the file."""
    uri = "file:" + quote(os.path.abspath(path)) + "?mode=ro"
    conn = sqlite3.connect(uri, uri=True, isolation_level=None)
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
SELECT s.id, s.source, s.cwd, s.git_repo_root,
       CASE WHEN json_valid(s.model_config)
            THEN json_extract(s.model_config, '$._delegate_from') END IS NOT NULL AS delegated
FROM sessions s ORDER BY s.started_at, s.id
"""

# One representative row per logical message, in insertion order of its first row.
_LOGICAL_SQL = """
WITH live AS (
  SELECT m.*, COALESCE('o:' || m.display_order, 'i:' || m.id) AS lkey
  FROM messages m WHERE m.session_id = ? AND (m.active = 1 OR m.compacted = 1)
), ranked AS (
  SELECT live.*,
         ROW_NUMBER() OVER (PARTITION BY lkey ORDER BY active DESC, id DESC) AS rn,
         MIN(id) OVER (PARTITION BY lkey) AS first_id
  FROM live
)
"""

_ROWS_SQL = _LOGICAL_SQL + """
SELECT id, role, timestamp,
       (role = 'user' AND observed = 0 AND _compressed_summary = 0
        AND COALESCE(display_kind, '') IN ({kinds})
        AND COALESCE(CASE WHEN json_valid(display_metadata)
                          THEN json_extract(display_metadata, '$.model_only') END, 0) = 0
        AND {not_text}) AS human
FROM ranked WHERE rn = 1 ORDER BY first_id
"""

_TOOLS_SQL = _LOGICAL_SQL + """
SELECT r.id, json_extract(j.value, '$.function.name')
FROM ranked r,
     json_each(CASE WHEN json_valid(r.tool_calls) THEN r.tool_calls ELSE '[]' END) j
WHERE r.rn = 1 AND r.role = 'assistant'
ORDER BY r.first_id, j.key
"""


def _like_prefix(prefix: str) -> str:
    return prefix.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


_TEXT_MARKERS = (CRON_MIRROR_PREFIX,) + SUMMARY_PREFIXES
_ROWS_QUERY = _ROWS_SQL.format(
    kinds=",".join("?" * len(HUMAN_DISPLAY_KINDS)),
    not_text=" AND ".join(
        ["ltrim(COALESCE(content, '')) NOT LIKE ? ESCAPE '\\'"] * len(_TEXT_MARKERS)
    ),
)


def sessions(path: str) -> list[dict]:
    """Every session with at least one turn a person typed, oldest first, from one snapshot."""
    out = []
    with closing(connect(path)) as conn:
        conn.execute("BEGIN")
        try:
            for sid, source, cwd, repo_root, delegated in conn.execute(_SESSIONS_SQL).fetchall():
                records = _records(conn, sid, source, bool(delegated), cwd, repo_root)
                if any(r["human"] for r in records["rows"]):
                    out.append(records)
        finally:
            conn.execute("ROLLBACK")
    return out


def _records(conn, sid, source, delegated, cwd, repo_root) -> dict:
    no_turns = delegated or source in NO_TURN_SOURCES
    params = (sid,) + HUMAN_DISPLAY_KINDS + tuple(_like_prefix(p) for p in _TEXT_MARKERS)
    rows = [
        {"id": mid, "role": role, "time": _stamp(ts),
         "human": bool(human) and not no_turns, "tools": []}
        for mid, role, ts, human in conn.execute(_ROWS_QUERY, params)
    ]
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


def records_digest(session: dict) -> str:
    """Hash exactly the rows a run was counted from."""
    shape = [session["session_id"], session["source"], session["delegated"]] + [
        [r["id"], r["role"], r["time"].isoformat() if r["time"] else None, r["human"], r["tools"]]
        for r in session["rows"]
    ]
    return hashlib.sha256(json.dumps(shape, sort_keys=True).encode()).hexdigest()


def digest(path: str, pick=-1) -> str:
    """The current store's digest for the session `pick` selects. File bytes miss WAL rows."""
    groups = sessions(path)
    if not groups:
        return hashlib.sha256(b"no-hermes-session").hexdigest()
    return records_digest(choose(groups, pick))


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
