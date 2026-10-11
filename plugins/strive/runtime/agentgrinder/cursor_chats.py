"""Cursor's per session chat store, the place recent agent activity is actually recorded.

Cursor stopped writing agent sessions into the one global `state.vscdb`. It now keeps each session
in its own SQLite file at `~/.cursor/chats/<workspace-hash>/<composer-id>/store.db`, with a small
`meta.json` beside it. Measured on this author's Mac on 16 Sep 2026: of 362 transcript composer
ids, the global store holds 46 and none of the newest 100, while the chat store holds 316 and all
of the newest 100.

WHEN it moved, measured rather than assumed. The 46 ids the global store holds have transcripts
dated 2026-02-24 to 2026-08-16. The 316 the chat store holds have transcripts dated 2026-08-10 to
today. The two sets do not overlap at all. So agent sessions moved around the middle of August
2026, and the oldest chat store folder is 10 Aug. The global store's newest COMPOSER row is 14 Sep,
but no transcript matches it, so that row is not an agent session and the date is not the cutover.
Cursor's own update record says 3.20.17 was confirmed at 2026-09-14T08:08:31Z; any link between
that version and this move is UNVERIFIED and the dates above do not support it.

Shape of one chat store, measured on session cc40feba on 16 Sep 2026. Two tables:

    blobs(id TEXT PRIMARY KEY, data BLOB)
    meta(key TEXT PRIMARY KEY, value TEXT)

`meta` row '0' is hex encoded JSON naming `agentId`, `latestRootBlobId` and `createdAt`. `blobs` is
content addressed. Some blobs are plain JSON chat messages. The rest are protobuf records that
Cursor writes for each step. One of those record shapes is the tool call, and it is the one this
module reads: a single length delimited field 2 whose body carries

    field 57  the tool call id, the same string the JSON tool result blob carries
    field 59  the request time in epoch milliseconds
    field 60  the result time in epoch milliseconds

On that session all 170 tool records carried all three, and the JSON store held exactly 170 tool
results, so the two sides count the same population. The tool kind is the payload field number,
and field 1 is the shell tool, whose request body holds the command string at field 1 of field 1.

The worker relationship is not in those step records. Each worker has its own store, and its
decoded `meta` row carries `subagentInfo.parentAgentId`, `rootParentAgentId` and `typeName`.
Direct workers are the sibling stores whose `parentAgentId` is this session's `agentId`. Their
first and last tool request stamps supply the worker windows, on the same clock as the parent
ridge. A worker with no tool request uses the created and updated clock in its `meta.json`
sidecar, so analysis-only workers do not disappear. No worker id or type leaves this module.

What leaves this module: timestamps, and one boolean per shell call saying whether its command
contained `git commit`. The command string is read in memory and dropped. No message text, no tool
arguments, no file paths and no ids reach the output. `cursor_tree.assert_redacted` is applied to
the ridge before it is returned, so a path shaped string is a refusal, not a card.

What this module cannot show: the tool NAME. The protobuf field numbers name a tool kind, not a
label a reader would recognise, and guessing a label from a field number is not a measurement.
"""
from __future__ import annotations

import json
import os
import shutil
import sqlite3
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

ENV_CHATS = 'AGENTGRINDER_CURSOR_CHATS'
ENV_PROJECTS = 'AGENTGRINDER_CURSOR_PROJECTS'

# A session is offered to the hook only after its transcript has been still for this long. The end
# marker below says a TURN ended, not that the session ended, and a user can type again a second
# later. Waiting is the difference between a card about a finished sitting and a card about turn
# three of ten. Measured on this Mac: nothing writes to a transcript after this gap unless the user
# is still working in it.
QUIET_SECONDS = 120.0

# Protobuf field numbers inside one tool record, measured, not documented by Cursor.
FIELD_TOOL_RECORD = 2
FIELD_CALL_ID = 57
FIELD_REQUESTED_AT = 59
FIELD_RESULT_AT = 60
FIELD_SHELL = 1

# A stamp outside this band is not a session clock. Roughly 2023 to 2030 in epoch milliseconds.
_MIN_MS = 1_700_000_000_000
_MAX_MS = 1_900_000_000_000


def _default_root() -> Path:
    return Path.home() / '.cursor' / 'chats'


def chats_root() -> Path:
    return Path(os.environ.get(ENV_CHATS) or _default_root()).expanduser()


def store_for(composer_id: str, root: Path | None = None) -> Path | None:
    """The chat store for one composer id, or None. The workspace hash folder is unknown, so glob."""
    base = Path(root) if root is not None else chats_root()
    if not base.is_dir():
        return None
    for candidate in base.glob('*/' + composer_id + '/store.db'):
        if candidate.is_file():
            return candidate
    direct = base / composer_id / 'store.db'
    return direct if direct.is_file() else None


def _read_varint(data: bytes, index: int) -> tuple[int, int]:
    result = 0
    shift = 0
    while True:
        byte = data[index]
        index += 1
        result |= (byte & 0x7F) << shift
        if not byte & 0x80:
            return result, index
        shift += 7
        if shift > 70:
            raise ValueError('varint too long')


def _fields(data: bytes) -> list[tuple[int, int, object]] | None:
    """Decode one protobuf message into (field number, wire type, value). None if it is not one."""
    index = 0
    out: list[tuple[int, int, object]] = []
    try:
        while index < len(data):
            key, index = _read_varint(data, index)
            number, wire = key >> 3, key & 7
            if wire == 0:
                value, index = _read_varint(data, index)
                out.append((number, 0, value))
            elif wire == 2:
                length, index = _read_varint(data, index)
                if length < 0 or index + length > len(data):
                    return None
                out.append((number, 2, data[index:index + length]))
                index += length
            elif wire == 5:
                index += 4
                out.append((number, 5, None))
            elif wire == 1:
                index += 8
                out.append((number, 1, None))
            else:
                return None
    except (IndexError, ValueError):
        return None
    return out if out else None


def _iso(milliseconds: int) -> str:
    return datetime.fromtimestamp(
        milliseconds / 1000, tz=timezone.utc).isoformat().replace('+00:00', 'Z')


def _store_meta(conn: sqlite3.Connection) -> dict:
    """Decode the session envelope in meta row 0. It may be hex JSON or plain JSON."""
    row = conn.execute("select value from meta where key='0'").fetchone()
    if not row or not isinstance(row[0], str):
        return {}
    raw = row[0]
    try:
        if raw and len(raw) % 2 == 0 and all(char in '0123456789abcdefABCDEF' for char in raw):
            raw = bytes.fromhex(raw).decode('utf8')
        value = json.loads(raw)
    except (UnicodeDecodeError, ValueError):
        return {}
    return value if isinstance(value, dict) else {}


def _shell_command(body: bytes) -> str | None:
    """The command string of a shell tool record. Read in memory, never returned to a caller."""
    request = _fields(body)
    if not request:
        return None
    for number, wire, value in request:
        if number != 1 or wire != 2 or not isinstance(value, bytes):
            continue
        inner = _fields(value)
        for number2, wire2, value2 in inner or []:
            if number2 == 1 and wire2 == 2 and isinstance(value2, bytes):
                try:
                    return value2.decode('utf8')
                except UnicodeDecodeError:
                    return None
    return None


class CopiedChatDb:
    """Copy the chat store, then open the copy read-only. Cursor may hold the live file open."""

    def __init__(self, source: Path):
        self.source = Path(source)
        self.folder: str | None = None
        self.conn: sqlite3.Connection | None = None

    def __enter__(self) -> sqlite3.Connection:
        if not self.source.is_file():
            raise FileNotFoundError('Cursor chat store not found at ' + str(self.source))
        self.folder = tempfile.mkdtemp(prefix='agentgrinder-cursor-chat-')
        target = Path(self.folder) / 'store.db'
        shutil.copyfile(self.source, target)
        for suffix in ('-wal', '-shm'):
            side = Path(str(self.source) + suffix)
            if side.is_file():
                shutil.copyfile(side, Path(str(target) + suffix))
        self.conn = sqlite3.connect(f'file:{target}?mode=ro', uri=True)
        return self.conn

    def __exit__(self, *exc) -> None:
        if self.conn is not None:
            self.conn.close()
        if self.folder:
            shutil.rmtree(self.folder, ignore_errors=True)


def session_activity(conn: sqlite3.Connection) -> dict:
    """Tool request times, and the request times of the shell calls that ran `git commit`.

    Returns ISO strings and counts only. The command string never leaves this function.
    """
    tool_stamps: list[str] = []
    commit_stamps: list[str] = []
    for (data,) in conn.execute('select data from blobs'):
        if not isinstance(data, (bytes, bytearray)):
            continue
        if data[:1] in (b'{', b'['):
            continue                      # a JSON message blob, not a step record
        outer = _fields(bytes(data))
        if not outer or len(outer) != 1:
            continue
        number, wire, body = outer[0]
        if number != FIELD_TOOL_RECORD or wire != 2 or not isinstance(body, bytes):
            continue
        record = _fields(body)
        if not record:
            continue
        requested = None
        has_call_id = False
        for field_number, field_wire, value in record:
            if field_number == FIELD_REQUESTED_AT and field_wire == 0:
                if isinstance(value, int) and _MIN_MS < value < _MAX_MS:
                    requested = value
            elif field_number == FIELD_CALL_ID and field_wire == 2:
                has_call_id = True
        if requested is None or not has_call_id:
            continue
        stamp = _iso(requested)
        tool_stamps.append(stamp)
        for field_number, field_wire, value in record:
            if field_number != FIELD_SHELL or field_wire != 2 or not isinstance(value, bytes):
                continue
            command = _shell_command(value)
            if command and 'git commit' in command:
                commit_stamps.append(stamp)
            break
    tool_stamps.sort()
    commit_stamps.sort()
    return {'tool_stamps': tool_stamps, 'commit_stamps': commit_stamps}


def _stores(root: Path) -> list[Path]:
    """Every per-session store under a chats root, including the direct fixture layout."""
    found = list(root.glob('*/*/store.db'))
    found.extend(root.glob('*/store.db'))
    return list(dict.fromkeys(path for path in found if path.is_file()))


def _sidecar_window(store: Path) -> tuple[str, str] | None:
    try:
        data = json.loads((store.parent / 'meta.json').read_text())
    except (OSError, ValueError):
        return None
    created, updated = data.get('createdAtMs'), data.get('updatedAtMs')
    if not isinstance(created, int) or not isinstance(updated, int):
        return None
    return _iso(created), _iso(updated)


def worker_windows(composer_id: str, root: Path | None = None) -> list[dict]:
    """Redacted request-time windows for stores that name this composer as their direct parent."""
    base = Path(root) if root is not None else chats_root()
    if not base.is_dir():
        return []
    children: list[Path] = []
    for store in _stores(base):
        try:
            conn = sqlite3.connect(f'file:{store}?mode=ro', uri=True)
            try:
                meta = _store_meta(conn)
            finally:
                conn.close()
        except sqlite3.DatabaseError:
            continue
        info = meta.get('subagentInfo')
        if isinstance(info, dict) and info.get('parentAgentId') == composer_id:
            children.append(store)

    windows: list[dict] = []
    for store in children:
        try:
            with CopiedChatDb(store) as conn:
                stamps = session_activity(conn)['tool_stamps']
        except (OSError, sqlite3.DatabaseError):
            continue
        if stamps:
            windows.append({'started_at': stamps[0], 'ended_at': stamps[-1]})
            continue
        sidecar = _sidecar_window(store)
        if sidecar:
            windows.append({'started_at': sidecar[0], 'ended_at': sidecar[1]})
    return windows


def build_ridge(composer_id: str, root: Path | None = None, bins: int = 50) -> dict | None:
    """The ridge for one composer from the chat store, or None when this store has no such session."""
    from . import cursor_tree
    source = store_for(composer_id, root)
    if source is None:
        return None
    with CopiedChatDb(source) as conn:
        activity = session_activity(conn)
    stamps = activity['tool_stamps']
    if not stamps:
        return None
    result = cursor_tree.ridge_from_calls(
        stamps, stamps, worker_windows(composer_id, root), None, bins,
        commit_stamps=activity['commit_stamps'])
    cursor_tree.assert_redacted(result)
    return result


def projects_root() -> Path:
    return Path(os.environ.get(ENV_PROJECTS) or (Path.home() / '.cursor' / 'projects')).expanduser()


def _transcript_for(composer_id: str) -> Path | None:
    pattern = str(projects_root() / '*' / 'agent-transcripts' / composer_id / '*.jsonl')
    import glob as _glob
    files = [Path(p) for p in _glob.glob(pattern) if Path(p).is_file()]
    return max(files, key=lambda p: p.stat().st_mtime) if files else None


def _last_turn_ended(transcript: Path) -> bool:
    """True when the transcript's last record is Cursor's end of turn marker.

    Measured on this Mac, 16 Sep 2026: every transcript's last line is
    `{"type":"turn_ended","status":"success"}` or the same with status error and a reason. It is
    the only structural record in the file; every other line is a role and a message. It says a
    TURN ended. It does not say the SESSION ended, which is why QUIET_SECONDS exists.

    Only the last 8 KB is read. The hook calls this for every session on every timer tick, and a
    transcript here runs to 155 KB, so reading whole files would put about 50 MB of disk read on a
    30 second timer. The marker line is under 90 bytes.
    """
    try:
        with transcript.open('rb') as handle:
            handle.seek(0, 2)
            size = handle.tell()
            handle.seek(max(0, size - 8192))
            tail = handle.read().decode('utf8', errors='replace')
    except OSError:
        return False
    lines = [line for line in tail.splitlines() if line.strip()]
    if not lines:
        return False
    try:
        record = json.loads(lines[-1])
    except ValueError:
        return False
    return isinstance(record, dict) and record.get('type') == 'turn_ended'


def finished_chat_composers(root: Path | None = None, quiet_seconds: float = QUIET_SECONDS,
                            now: float | None = None) -> list[str]:
    """Composer ids in the chat store whose last turn has ended and whose transcript is still.

    Oldest first, by the `updatedAtMs` Cursor writes beside the store. A session with no transcript
    is skipped rather than captured, because `_capture` needs one and would otherwise churn.
    """
    base = Path(root) if root is not None else chats_root()
    if not base.is_dir():
        return []
    moment = time.time() if now is None else now
    found: list[tuple[int, str]] = []
    for store in base.glob('*/*/store.db'):
        composer_id = store.parent.name
        transcript = _transcript_for(composer_id)
        if transcript is None:
            continue
        try:
            if moment - transcript.stat().st_mtime < quiet_seconds:
                continue
        except OSError:
            continue
        if not _last_turn_ended(transcript):
            continue
        updated = 0
        meta = store.parent / 'meta.json'
        if meta.is_file():
            try:
                value = json.loads(meta.read_text()).get('updatedAtMs')
                updated = value if isinstance(value, int) else 0
            except (OSError, ValueError):
                updated = 0
        found.append((updated, composer_id))
    found.sort()
    return [composer_id for _, composer_id in found]


def session_window(composer_id: str, root: Path | None = None) -> tuple[str, str] | None:
    """The created and last updated stamps Cursor writes beside the store, as ISO strings."""
    source = store_for(composer_id, root)
    if source is None:
        return None
    return _sidecar_window(source)


def main(argv: list[str] | None = None) -> int:
    import argparse
    parser = argparse.ArgumentParser(
        prog='python3 -m agentgrinder.cursor_chats',
        description='Report what the Cursor per session chat store holds for one composer.')
    parser.add_argument('composer_id')
    parser.add_argument('--root', type=Path, default=None)
    args = parser.parse_args(argv)
    source = store_for(args.composer_id, args.root)
    if source is None:
        print(json.dumps({'found': False, 'root': str(chats_root())}, indent=2))
        return 1
    ridge = build_ridge(args.composer_id, args.root)
    window = session_window(args.composer_id, args.root)
    print(json.dumps({'found': True, 'window': window, 'ridge': ridge}, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
