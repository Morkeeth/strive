"""Bounded native-session indexing. Original bytes are hashed, never rewritten.

Only the selected sitting is materialized for the existing measured adapters.
Limits are explicit: 2 GiB source, 16 MiB record, 64 MiB selected sitting and
250,000 dated records. No network client is used here.
"""
from __future__ import annotations
import hashlib
import json
import os
import tempfile
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

MAX_SOURCE = 2 * 1024**3
MAX_RECORD = 16 * 1024**2
MAX_SELECTED = 64 * 1024**2
MAX_EVENTS = 250000


def records(path):
    with Path(path).open('rb') as stream:
        index = 0
        while True:
            raw = stream.readline(MAX_RECORD + 1)
            if not raw: return
            if len(raw) > MAX_RECORD: raise ValueError('A transcript record exceeds 16 MiB. Select a smaller native export.')
            if not raw.strip(): continue
            try: row = json.loads(raw)
            except (ValueError, UnicodeDecodeError):
                raise ValueError('Transcript has an incomplete record. Retry after the writer finishes.') from None
            if not isinstance(row, dict): raise ValueError('Expected JSONL transcript objects.')
            yield index, row, raw
            index += 1


def signature(path):
    stat = path.stat()
    return stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns


def _copy_prefix(source, destination, size):
    remaining = size
    with source.open('rb') as src, destination.open('xb') as dest:
        os.chmod(destination, 0o600)
        while remaining:
            chunk = src.read(min(1024 * 1024, remaining))
            if not chunk: raise ValueError('The session was shortened while reading. Retry the capture.')
            dest.write(chunk)
            remaining -= len(chunk)


@contextmanager
def frozen_source(source, root=None):
    """Read an append-only native transcript through one complete-record boundary."""
    source = Path(source).expanduser().resolve(strict=True)
    before = signature(source)
    if not source.is_file() or before[2] > MAX_SOURCE:
        raise ValueError('Select a native transcript no larger than 2 GiB.')
    with tempfile.TemporaryDirectory(prefix='strive-selected-', dir=root) as directory:
        snapshot = Path(directory) / 'original.jsonl'
        _copy_prefix(source, snapshot, before[2])
        after = signature(source)
        if after[:2] != before[:2] or after[2] < before[2] or (after[2] == before[2] and after[3] != before[3]):
            raise ValueError('The session was replaced or rewritten while reading. Retry the capture.')
        # A writer may be partway through its next JSONL record. Keep only
        # complete records from the boundary observed when this read began.
        with snapshot.open('rb+') as stream:
            size = snapshot.stat().st_size
            if size and not _ends_with_newline(stream, size):
                start = max(0, size - MAX_RECORD)
                stream.seek(start)
                tail = stream.read()
                newline = tail.rfind(b'\n')
                last = tail[newline + 1:] if newline >= 0 else tail
                try: json.loads(last)
                except (ValueError, UnicodeDecodeError):
                    if newline < 0: raise ValueError('Transcript has no complete record yet.') from None
                    stream.truncate(start + newline + 1)
        digest = hashlib.sha256()
        size = snapshot.stat().st_size
        with snapshot.open('rb') as src, source.open('rb') as original:
            remaining = size
            while remaining:
                amount = min(1024 * 1024, remaining)
                chunk = src.read(amount)
                if chunk != original.read(amount):
                    raise ValueError('The session prefix changed while reading. Retry the capture.')
                digest.update(chunk)
                remaining -= len(chunk)
        yield dict(path=snapshot, source=str(source), sha256=digest.hexdigest(), bytes=size, signature=before)


def _ends_with_newline(stream, size):
    stream.seek(size - 1)
    return stream.read(1) == b'\n'


def stamp(row):
    value = row.get('timestamp')
    if not isinstance(value, str): return None
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return parsed.astimezone(timezone.utc) if parsed.tzinfo else None
    except ValueError: return None


def prompt(row, harness, codex_events=False, codex_source=None):
    from .session_picker import text
    if harness == 'claude':
        from .authorship import is_human_turn
        message=row.get('message');content=message.get('content') if isinstance(message,dict) else None
        return text(content) if is_human_turn(row) else None
    p = row.get('payload') or {}
    if not isinstance(p, dict): p = {}
    if harness == 'codex':
        if codex_source in ('cron', 'ci', 'hook', 'automation'): return None
        value = None
        if row.get('type') == 'event_msg' and p.get('type') == 'user_message': value = str(p.get('message') or '')
        elif not codex_events and row.get('type') == 'response_item' and p.get('type') == 'message' and p.get('role') == 'user': value = text(p.get('content'))
        from .provenance import CODEX_INJECTED
        if value is not None and value.lstrip().startswith(CODEX_INJECTED): return None
        return value
    from .ingest import _cursor_text
    value = _cursor_text(row.get('message') or {})
    return value if row.get('role') == 'user' and '<user_query>' in value else None


def inspect_source(source, harness, gap=1800, _frozen=False, progress=None):
    if harness not in ('claude', 'codex', 'cursor'): raise ValueError('This harness is not supported yet.')
    path = Path(source).expanduser().resolve(strict=True)
    if not _frozen:
        with frozen_source(path) as frozen:
            info = inspect_source(frozen['path'], harness, gap, _frozen=True, progress=progress)
            from .plugin import source_identity
            info.update({k:frozen[k] for k in ('source','sha256','bytes','signature')})
            info['session'] = source_identity((row for _, row, _ in records(frozen['path'])), harness, path)
            info['captured_through'] = info['sittings'][-1]['end'] if info['sittings'] else None
            return info
    before = signature(path)
    if not path.is_file() or before[2] > MAX_SOURCE: raise ValueError('Select a native transcript no larger than 2 GiB.')
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024*1024), b''): digest.update(chunk)
    from .plugin import source_identity
    session = source_identity((row for _, row, _ in records(path)), harness, path)
    codex_rows = list(records(path)) if harness == 'codex' else None
    codex_events = harness == 'codex' and any(row.get('type') == 'event_msg' and isinstance(row.get('payload'), dict) and row['payload'].get('type') == 'user_message' for _, row, _ in codex_rows)
    codex_source = next(((row.get('payload') or {}).get('source') for _, row, _ in (codex_rows or [])
                         if row.get('type') == 'session_meta' and isinstance((row.get('payload') or {}).get('source'), str)), None)
    groups = []
    sdk_requests = 0
    seen = 0
    if progress: progress('reading', 0, 'records read')
    if harness == 'claude':
        from .authorship import is_external_sdk_turn
        events = []
        for _, row, _ in records(path):
            seen += 1
            if progress and seen % 256 == 0: progress('reading', seen, 'records read')
            at = stamp(row)
            if at is None: continue
            sdk_requests += int(is_external_sdk_turn(row))
            human = prompt(row, harness)
            events.append((at, human is not None, ' '.join((human or '').split())[:180]))
            if len(events) > MAX_EVENTS: raise ValueError('More than 250,000 dated records; select a smaller native export.')
        events.sort(key=lambda e:e[0]); current = None; last = None
        for at, human, first in events:
            if last is not None and (at-last).total_seconds() > gap:
                if current: groups.append(current)
                current = None
            if human and current is None: current = dict(start=at.isoformat(),end=at.isoformat(),prompt=first,typed=0,records=0)
            if current:
                current['end'] = at.isoformat(); current['records'] += 1; current['typed'] += int(human)
            last = at
        if current: groups.append(current)
    else:
        from .native_sittings import cursor_time
        from .ingest import _cursor_text
        current = None; last = None; idle = False
        for index, row, _ in (codex_rows if harness == 'codex' else records(path)):
            seen += 1
            if progress and seen % 256 == 0: progress('reading', seen, 'records read')
            if harness == 'codex' and row.get('type') == 'session_meta': continue
            human = prompt(row,harness,codex_events,codex_source)
            at = stamp(row) if harness == 'codex' else cursor_time(_cursor_text(row.get('message') or {}))
            if at and last and (at-last).total_seconds() > gap: idle=True
            if human is not None and current and idle: groups.append(current); current=None
            if human is not None:
                idle=False
                if current is None: current=dict(start=at.isoformat() if at else None,end=None,prompt=' '.join(human.split())[:180],typed=0,records=0,first_record=index,last_record=index)
            if at: last=at
            if current:
                current['last_record']=index; current['records']+=1; current['typed']+=int(human is not None)
                if at: current['end']=at.isoformat()
            if len(groups)>10000: raise ValueError('More than 10,000 sittings; select a smaller native export.')
        if current: groups.append(current)
    if progress: progress('reading', seen, 'records read')
    if signature(path) != before: raise ValueError('The session changed while reading. Retry when its writer is idle.')
    for i, group in enumerate(groups): group['sitting']=i+1
    return dict(source=str(path),session=session,sha256=digest.hexdigest(),bytes=before[2],signature=before,sittings=groups,sdk_requests=sdk_requests)


@contextmanager
def selected_source(source, harness, sitting=-1, root=None, progress=None):
    original=Path(source).expanduser().resolve(strict=True)
    with frozen_source(original,root) as frozen:
        snapshot=frozen['path']; selected=snapshot.parent/original.name
        if selected==snapshot: selected=snapshot.parent/'selected.jsonl'
        info=inspect_source(snapshot,harness,_frozen=True,progress=progress)
        info.update({k:frozen[k] for k in ('source','sha256','bytes','signature')})
        # Validate identity against the real path too, so subagent directories stay excluded.
        from .plugin import source_identity
        info['session']=source_identity((r for _,r,_ in records(snapshot)),harness,original)
        groups=info['sittings']; index=len(groups)+sitting if sitting<0 else sitting-1 if sitting>0 else len(groups)-1
        if not 0<=index<len(groups): raise ValueError('Choose a sitting between 1 and %d (or -1 for latest).'%len(groups))
        group=groups[index]; lo=datetime.fromisoformat(group['start']) if group['start'] else None; hi=datetime.fromisoformat(group['end']) if group['end'] else None
        size=0; count=0
        with selected.open('xb') as dest:
            os.chmod(selected,0o600)
            for n,row,raw in records(snapshot):
                if harness=='claude': at=stamp(row); keep=at is not None and lo<=at<=hi
                else: keep=group['first_record']<=n<=group['last_record'] or (harness=='codex' and row.get('type')=='session_meta')
                if not keep: continue
                size+=len(raw)+int(not raw.endswith(b'\n'));count+=1
                if size>MAX_SELECTED: raise ValueError('This sitting exceeds the 64 MiB preview limit. No run was truncated; choose a smaller sitting.')
                dest.write(raw);dest.write(b'' if raw.endswith(b'\n') else b'\n')
        yield dict(info,source=str(original),path=selected,selected=group,selected_bytes=size,selected_records=count,skipped_sittings=len(groups)-1)
