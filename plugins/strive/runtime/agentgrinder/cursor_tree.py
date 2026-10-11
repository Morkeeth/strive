"""Cursor orchestration tree, read from Cursor's own local store.

Cursor keeps every composer (a chat or agent session) in one SQLite file, `state.vscdb`, in the
key-value table `cursorDiskKV`. A parent composer that delegated work carries
`subagentComposerIds`; each id is a worker composer with its own bubbles (turns). This module
reads only the shape of that work: who orchestrated, which workers ran, on which model, for how
long, and how many turns and tool calls each one recorded.

What it never reads: message text, prompt text, code, or any file path below the project folder
name. The output is built from an allowlist of fields, and `assert_redacted` refuses a tree that
carries a path-shaped string.

What it cannot show: tokens. Bubble `tokenCount` is zero on every worker bubble on the machine
this was measured on (LOOP1 refute, 2026-09-15) and `usageData` is empty on every composer. Token
counts live on Cursor's servers, not on disk. Do not add a tokens field here without a source.

The `agent-transcripts/*.jsonl` files the rest of this package reads carry role and message only;
they hold no model, no timestamps and no tree, which is why this module opens the database.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sqlite3
import sys
import tempfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote

def _cursor_user_folder() -> Path:
    if sys.platform == 'darwin':
        return Path.home() / 'Library/Application Support/Cursor/User'
    if os.name == 'nt':
        return Path(os.environ.get('APPDATA') or Path.home() / 'AppData/Roaming') / 'Cursor/User'
    return Path(os.environ.get('XDG_CONFIG_HOME') or Path.home() / '.config') / 'Cursor/User'


DEFAULT_DB = _cursor_user_folder() / 'globalStorage/state.vscdb'
DEFAULT_WORKSPACE_STORAGE = _cursor_user_folder() / 'workspaceStorage'
ENV_DB = 'AGENTGRINDER_CURSOR_DB'
ENV_WORKSPACE_STORAGE = 'AGENTGRINDER_CURSOR_WORKSPACES'

# Cursor's own vocabulary for a worker kind. Anything else is reported as "other", never copied.
SUBAGENT_TYPES = {'generalPurpose', 'explore', 'cursor-guide', 'browser-use'}

ABSENT_MESSAGE = (
    'Cursor local store not found at {path}. Pass --db or set ' + ENV_DB +
    ' if Cursor stores state.vscdb somewhere else.'
)


def db_path() -> Path:
    return Path(os.environ.get(ENV_DB) or DEFAULT_DB).expanduser()


def workspace_storage() -> Path:
    return Path(os.environ.get(ENV_WORKSPACE_STORAGE) or DEFAULT_WORKSPACE_STORAGE).expanduser()


class CopiedDb:
    """Copy the store, then open the copy read-only. Cursor holds a lock on the live file."""

    def __init__(self, source: Path):
        self.source = Path(source)
        self.folder: str | None = None
        self.conn: sqlite3.Connection | None = None

    def __enter__(self) -> sqlite3.Connection:
        if not self.source.is_file():
            raise FileNotFoundError(ABSENT_MESSAGE.format(path=self.source))
        self.folder = tempfile.mkdtemp(prefix='agentgrinder-cursor-')
        target = Path(self.folder) / 'state.vscdb'
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


def _load(conn: sqlite3.Connection, key: str) -> dict | None:
    row = conn.execute('select value from cursorDiskKV where key=?', (key,)).fetchone()
    if not row:
        return None
    try:
        value = json.loads(row[0])
    except (TypeError, ValueError):
        return None
    return value if isinstance(value, dict) else None


def _iso(value) -> str | None:
    """Bubble createdAt is an ISO string; composer createdAt is epoch milliseconds."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc).isoformat().replace('+00:00', 'Z')
    if isinstance(value, str) and value:
        try:
            datetime.fromisoformat(value.replace('Z', '+00:00'))
        except ValueError:
            return None
        return value
    return None


def _seconds_between(start: str | None, end: str | None) -> float | None:
    if not start or not end:
        return None
    a = datetime.fromisoformat(start.replace('Z', '+00:00'))
    b = datetime.fromisoformat(end.replace('Z', '+00:00'))
    return round(max(0.0, (b - a).total_seconds()), 1)


def _bubble_stats(conn: sqlite3.Connection, composer_id: str) -> dict:
    """Counts and timing from the bubble rows of one composer. No text is read out."""
    first = last = None
    bubbles = tool_calls = tool_errors = 0
    models: Counter = Counter()
    for (raw,) in conn.execute('select value from cursorDiskKV where key like ?', (f'bubbleId:{composer_id}:%',)):
        try:
            bubble = json.loads(raw)
        except (TypeError, ValueError):
            continue
        if not isinstance(bubble, dict):
            continue
        bubbles += 1
        stamp = _iso(bubble.get('createdAt'))
        if stamp:
            first = stamp if first is None or stamp < first else first
            last = stamp if last is None or stamp > last else last
        tool = bubble.get('toolFormerData')
        if isinstance(tool, dict) and tool:
            tool_calls += 1
            if tool.get('status') == 'error':
                tool_errors += 1
        info = bubble.get('modelInfo')
        if isinstance(info, dict) and isinstance(info.get('modelName'), str):
            models[info['modelName']] += 1
    return {'bubbles': bubbles, 'tool_calls': tool_calls, 'tool_errors': tool_errors,
            'first': first, 'last': last, 'models': models}


def _is_commit_bubble(tool: dict) -> bool:
    """True when this tool bubble is a shell call whose command ran `git commit`.

    The command string is read here and dropped here. Only the boolean leaves. The name test keeps
    a file READ whose content happens to contain the words from counting as a commit.
    """
    name = tool.get('name')
    if not isinstance(name, str) or ('terminal' not in name and 'command' not in name):
        return False
    for key in ('rawArgs', 'params'):
        value = tool.get(key)
        if isinstance(value, str) and 'git commit' in value:
            return True
    return False


def _bubble_activity(conn: sqlite3.Connection,
                     composer_id: str) -> tuple[list[str | None], list[str], list[str]]:
    """Tool timestamps, all valid timestamps, and the timestamps of `git commit` shell calls.

    No message text, tool argument or path is returned. The third list is the one the commit ticks
    are drawn from, so a tick and the ridge under it come from one clock.
    """
    tools: list[str | None] = []
    stamps: list[str] = []
    commits: list[str] = []
    for (raw,) in conn.execute(
            'select value from cursorDiskKV where key like ?', (f'bubbleId:{composer_id}:%',)):
        try:
            bubble = json.loads(raw)
        except (TypeError, ValueError):
            continue
        if not isinstance(bubble, dict):
            continue
        stamp = _iso(bubble.get('createdAt'))
        if stamp:
            stamps.append(stamp)
        tool = bubble.get('toolFormerData')
        if isinstance(tool, dict) and tool:
            tools.append(stamp)
            if stamp and _is_commit_bubble(tool):
                commits.append(stamp)
    return tools, stamps, sorted(commits)


def _bin_index(value: float, start: float, end: float, bins: int) -> int:
    if end <= start:
        return 0
    return min(bins - 1, max(0, int((value - start) / (end - start) * bins)))


def ridge_from_turn_order(tool_counts_per_turn: list[int], bins: int = 50) -> dict:
    """Bin tool calls by typed-turn order, not by call index and not by wall time.

    Each typed turn owns one bin. The bin height is the tool-call count for that turn.
    With fewer turns than bins, the ridge shows the burst sequence as sparse peaks.
    Spreading the same total evenly across bins (call-index with N under bins) draws a
    flat 1 and 0 comb. That comb is not a measured shape. Turn order keeps the shape.
    Measured on brief-v2-export-a.jsonl on 16 Sep 2026: counts 1, 2, 5, 13, 0, 7.
    """
    if not 40 <= bins <= 60:
        raise ValueError('Ridge bins must be between 40 and 60.')
    if any(type(count) is not int or count < 0 for count in tool_counts_per_turn):
        raise ValueError('tool_counts_per_turn must be non-negative whole numbers.')
    ridge = [0] * bins
    n = len(tool_counts_per_turn)
    if n:
        for index, count in enumerate(tool_counts_per_turn):
            ridge[min(bins - 1, index * bins // n)] += count
    return {
        'ridge': ridge,
        'ridge_basis': 'turn-order',
        'worker_bins': [0] * bins,
        'commit_bins': [],
        'ridge_wall_seconds': None,
        'commit_basis': 'turn-order',
    }


def ridge_from_calls(tool_stamps: list[str | None], all_stamps: list[str] | None = None,
                     workers: list[dict] | None = None, commit_call_indices: list[int] | None = None,
                     bins: int = 50, commit_stamps: list[str] | None = None) -> dict:
    """Bin tool requests without carrying tool names, arguments, message text, or paths.

    Two ways to place a commit tick, and they are not equivalent.

    `commit_stamps` is a wall clock time per commit, read from the same store the ridge window is
    read from. One clock, so a tick sits where the commit happened. This is the rule whenever the
    ridge is timed and stamps were supplied.

    `commit_call_indices` is a position in the TRANSCRIPT's tool call sequence. The timed branch
    used to look that index up in the STORE's tool order, which is a different sequence of a
    different length: 243 transcript calls against 255 store calls on one measured session. The two
    orderings disagree, so a tick could land in the wrong bin or fall off the end. Swept over every
    real session on this author's Mac that draws ticks on 16 Sep 2026, 6 of 48 disagreed, and one
    tick moved 9 bins of 50. The index rule now survives only as the untimed fallback, where there
    is no clock to do better with.
    """
    if not 40 <= bins <= 60:
        raise ValueError('Ridge bins must be between 40 and 60.')
    ridge = [0] * bins
    worker_bins = [0] * bins
    commit_bins: list[int] = []
    valid_tools = [_iso(stamp) for stamp in tool_stamps]
    timed = bool(tool_stamps) and all(valid_tools)
    all_valid = [_iso(stamp) for stamp in (all_stamps or [])]
    timed = timed and all(all_valid)
    start_dt = end_dt = None
    if timed:
        parsed = [datetime.fromisoformat(stamp.replace('Z', '+00:00'))
                  for stamp in (all_valid or valid_tools)]
        start_dt, end_dt = min(parsed), max(parsed)
        ordered = sorted(datetime.fromisoformat(stamp.replace('Z', '+00:00'))
                         for stamp in valid_tools)
        for stamp in ordered:
            ridge[_bin_index(stamp.timestamp(), start_dt.timestamp(), end_dt.timestamp(), bins)] += 1
    else:
        for index in range(len(tool_stamps)):
            ridge[min(bins - 1, index * bins // max(1, len(tool_stamps)))] += 1

    commit_basis = 'call-index'
    if timed and commit_stamps is not None:
        commit_basis = 'wall-time'
        for stamp in commit_stamps:
            valid = _iso(stamp)
            if not valid:
                continue
            moment = datetime.fromisoformat(valid.replace('Z', '+00:00')).timestamp()
            commit_bins.append(
                _bin_index(moment, start_dt.timestamp(), end_dt.timestamp(), bins))
    else:
        for call_index in commit_call_indices or []:
            if not isinstance(call_index, int) or call_index < 0 or call_index >= len(tool_stamps):
                continue
            commit_bins.append(min(bins - 1, call_index * bins // max(1, len(tool_stamps))))

    if timed and start_dt is not None and end_dt is not None:
        span_start, span_end = start_dt.timestamp(), end_dt.timestamp()
        for worker in workers or []:
            try:
                worker_start = datetime.fromisoformat(
                    str(worker.get('started_at')).replace('Z', '+00:00')).timestamp()
                worker_end = datetime.fromisoformat(
                    str(worker.get('ended_at')).replace('Z', '+00:00')).timestamp()
            except (TypeError, ValueError):
                continue
            for index in range(bins):
                left = span_start + (span_end - span_start) * index / bins
                right = span_start + (span_end - span_start) * (index + 1) / bins
                if worker_start <= right and worker_end >= left:
                    worker_bins[index] += 1

    wall_seconds = None
    if timed and start_dt is not None and end_dt is not None:
        wall_seconds = round(max(0.0, (end_dt - start_dt).total_seconds()), 1)
    return {
        'ridge': ridge,
        'ridge_basis': 'wall-time' if timed else 'call-index',
        'worker_bins': worker_bins,
        'commit_bins': sorted(commit_bins),
        'ridge_wall_seconds': wall_seconds,
        'commit_basis': commit_basis,
    }


def build_ridge(conn: sqlite3.Connection, composer_id: str,
                commit_call_indices: list[int] | None = None, bins: int = 50) -> dict:
    """Build the redacted ridge and worker activity for one composer.

    The commit ticks come from the store's own commit timestamps, so the ticks and the ridge under
    them share one clock. The list is passed even when it is empty, because an empty list is a
    measured zero and reopening the transcript index rule there would put a tick at a position
    nothing measured. Swept over the 48 real sessions on this author's Mac that draw ticks, 16 Sep
    2026, no session had transcript commits and zero store commits, so nothing loses a tick to this.
    The transcript indices survive only for an untimed ridge, which has no clock to do better with.
    """
    tools, stamps, commits = _bubble_activity(conn, composer_id)
    tree = build_tree(conn, composer_id)
    result = ridge_from_calls(tools, stamps, tree.get('children'), commit_call_indices, bins,
                              commit_stamps=commits)
    assert_redacted(result)
    return result


def project_name(conn: sqlite3.Connection, composer_id: str, storage: Path | None = None) -> str | None:
    """The workspace folder's last path segment only. Never the path."""
    try:
        row = conn.execute('select workspaceId from composerHeaders where composerId=?', (composer_id,)).fetchone()
    except sqlite3.DatabaseError:
        return None
    workspace_id = row[0] if row else None
    if not workspace_id or workspace_id == 'empty-window':
        return None
    meta = (storage or workspace_storage()) / str(workspace_id) / 'workspace.json'
    if not meta.is_file():
        return None
    try:
        data = json.loads(meta.read_text())
    except (OSError, ValueError):
        return None
    uri = data.get('folder') or data.get('workspace') or ''
    if not isinstance(uri, str) or not uri:
        return None
    name = unquote(uri.rstrip('/').rsplit('/', 1)[-1])
    if name.endswith('.code-workspace'):
        name = name[:-len('.code-workspace')]
    return name or None


def _model(composer: dict, stats: dict) -> tuple[str | None, str | None, str | None]:
    """(model, model_source, model_selected).

    Bubble modelInfo names the model per turn and is present on orchestrator bubbles. Worker
    bubbles carry none, so the worker falls back to its composer modelConfig. On the machine this
    was measured on, modelConfig.modelName and selectedModels[0].modelId disagree on about half of
    the workers; both are reported so a reader can see the disagreement instead of a guess.
    """
    config = composer.get('modelConfig') if isinstance(composer.get('modelConfig'), dict) else {}
    name = config.get('modelName') if isinstance(config.get('modelName'), str) else None
    selected = None
    chosen = config.get('selectedModels')
    if isinstance(chosen, list) and chosen and isinstance(chosen[0], dict):
        selected = chosen[0].get('modelId') if isinstance(chosen[0].get('modelId'), str) else None
    if stats['models']:
        return stats['models'].most_common(1)[0][0], 'bubble-modelInfo', selected if selected != name else None
    if name:
        return name, 'composer-modelConfig', selected if selected != name else None
    return None, None, None


def _node(conn: sqlite3.Connection, composer_id: str, role: str, project: str | None) -> dict | None:
    composer = _load(conn, f'composerData:{composer_id}')
    if composer is None:
        return None
    stats = _bubble_stats(conn, composer_id)
    started = stats['first'] or _iso(composer.get('createdAt'))
    ended = stats['last'] or _iso(composer.get('lastUpdatedAt'))
    basis = 'bubble-createdAt' if stats['first'] and stats['last'] else 'composer-timestamps'
    model, source, selected = _model(composer, stats)
    node = {
        'composer_id': composer_id,
        'role': role,
        'project': project,
        'started_at': started,
        'ended_at': ended,
        'wall_seconds': _seconds_between(started, ended),
        'wall_basis': basis,
        'model': model,
        'model_source': source,
        'status': composer.get('status') if isinstance(composer.get('status'), str) else None,
        'bubbles': stats['bubbles'],
        'tool_calls': stats['tool_calls'],
        'tool_errors': stats['tool_errors'],
        'tokens': None,
        'children': [],
    }
    if selected:
        node['model_selected'] = selected
    info = composer.get('subagentInfo')
    if role == 'worker':
        kind = info.get('subagentTypeName') if isinstance(info, dict) else None
        node['subagent_type'] = kind if kind in SUBAGENT_TYPES else 'other'
    return node


def build_tree(conn: sqlite3.Connection, composer_id: str, storage: Path | None = None) -> dict:
    """Orchestrator on top, workers as children, in the order Cursor recorded them."""
    parent = _load(conn, f'composerData:{composer_id}')
    if parent is None:
        raise KeyError(f'No composer {composer_id} in this store.')
    project = project_name(conn, composer_id, storage)
    root = _node(conn, composer_id, 'orchestrator', project)
    child_ids = parent.get('subagentComposerIds') or []
    missing = 0
    for child_id in child_ids:
        if not isinstance(child_id, str):
            continue
        child = _node(conn, child_id, 'worker', project)
        if child is None:
            missing += 1
            continue
        root['children'].append(child)
    root['workers_missing'] = missing
    root['source'] = 'cursor state.vscdb, structure only'
    assert_redacted(root)
    return root


def list_parents(conn: sqlite3.Connection, storage: Path | None = None) -> list[dict]:
    """Every composer that delegated to workers, newest first."""
    out = []
    for (key, raw) in conn.execute("select key, value from cursorDiskKV where key like 'composerData:%'"):
        try:
            composer = json.loads(raw)
        except (TypeError, ValueError):
            continue
        if not isinstance(composer, dict):
            continue
        children = composer.get('subagentComposerIds') or []
        if not children:
            continue
        composer_id = key.split(':', 1)[1]
        stats = _bubble_stats(conn, composer_id)
        started = stats['first'] or _iso(composer.get('createdAt'))
        ended = stats['last'] or _iso(composer.get('lastUpdatedAt'))
        model, _, _ = _model(composer, stats)
        out.append({'composer_id': composer_id, 'project': project_name(conn, composer_id, storage),
                    'workers': len(children), 'started_at': started, 'ended_at': ended,
                    'wall_seconds': _seconds_between(started, ended), 'model': model,
                    'bubbles': stats['bubbles'], 'tool_calls': stats['tool_calls']})
    out.sort(key=lambda p: p['started_at'] or '', reverse=True)
    return out


def assert_redacted(tree: dict) -> None:
    """Refuse any string that looks like a path, a home marker, or multi-line text."""
    def walk(value, trail):
        if isinstance(value, dict):
            for k, v in value.items():
                walk(v, trail + [k])
        elif isinstance(value, list):
            for i, v in enumerate(value):
                walk(v, trail + [str(i)])
        elif isinstance(value, str):
            if '\n' in value or '/' in value or '\\' in value or value.startswith('~') or len(value) > 120:
                raise ValueError('Redaction rule broken at ' + '.'.join(trail))
    walk(tree, [])


def fmt_seconds(seconds: float | None) -> str:
    if seconds is None:
        return 'unknown'
    total = int(seconds)
    hours, rest = divmod(total, 3600)
    minutes, secs = divmod(rest, 60)
    if hours:
        return f'{hours}h {minutes:02d}m'
    if minutes:
        return f'{minutes}m {secs:02d}s'
    return f'{secs}s'


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog='python3 -m agentgrinder.cursor_tree', description=__doc__.split('\n\n')[0])
    parser.add_argument('--db', type=Path, default=None, help='path to state.vscdb (default: the platform Cursor user-data location)')
    parser.add_argument('--workspace-storage', type=Path, default=None, help='Cursor workspaceStorage folder, used for the project name only')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--list', action='store_true', help='print parent composers with worker counts and wall time')
    group.add_argument('--json', metavar='COMPOSER_ID', help='emit the redacted tree for one parent composer')
    args = parser.parse_args(argv)
    source = args.db or db_path()
    storage = args.workspace_storage or workspace_storage()
    try:
        with CopiedDb(source) as conn:
            if args.list:
                parents = list_parents(conn, storage)
                if not parents:
                    print('No composer with subagentComposerIds in this store.')
                    return 0
                print(f'{"composer":<38}{"workers":>8}  {"wall":<10}{"model":<34}project')
                for p in parents:
                    print(f'{p["composer_id"]:<38}{p["workers"]:>8}  {fmt_seconds(p["wall_seconds"]):<10}'
                          f'{(p["model"] or "unknown"):<34}{p["project"] or "unknown"}')
                return 0
            tree = build_tree(conn, args.json, storage)
    except FileNotFoundError as error:
        print(error, file=sys.stderr)
        return 2
    except KeyError as error:
        print(error.args[0], file=sys.stderr)
        return 1
    json.dump(tree, sys.stdout, indent=2)
    sys.stdout.write('\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
