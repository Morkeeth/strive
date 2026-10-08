"""Explicit future-only Git checkpoints bound to an appended native-session window.

Private journal: repository paths and content fingerprints. Public route: bounded labels,
source digest, record/order and observation time. No file contents or transcript text stored.
"""
from __future__ import annotations
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import uuid

MARKER = 'Collector: git-checkpoints-v1; consent: explicit'
MAX_SOURCE = 512 * 1024 * 1024
MAX_DELTA = 32 * 1024 * 1024
MAX_FILES = 10000
MAX_FILE_BYTES = 256 * 1024 * 1024


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()


def now():
    return datetime.now(timezone.utc).isoformat(timespec='microseconds').replace('+00:00', 'Z')


def sha(value):
    return hashlib.sha256(value).hexdigest()


def git(root, *args):
    try:
        result = subprocess.run(['git', '-C', str(root), *args], capture_output=True,
                                timeout=20, env={**os.environ, 'GIT_OPTIONAL_LOCKS': '0'})
    except subprocess.TimeoutExpired:
        raise ValueError('Git checkpoint timed out; no observation was recorded.') from None
    if result.returncode:
        raise ValueError('Git checkpoint failed; select a readable repository with an existing commit.')
    return result.stdout


def snapshot(root):
    root = Path(root).resolve(strict=True)
    if Path(os.fsdecode(git(root, 'rev-parse', '--show-toplevel')).strip()).resolve() != root:
        raise ValueError('Select the repository root, not a parent or subdirectory.')
    head = git(root, 'rev-parse', 'HEAD').decode().strip()
    names = sorted(set(git(root, 'ls-files', '-z').split(b'\0')) - {b''})
    if len(names) > MAX_FILES:
        raise ValueError('This repository exceeds the checkpoint limit of 10000 tracked files.')
    files, total = {}, 0
    for name in names:
        relative = os.fsdecode(name)
        path = root / relative
        # A symlinked parent must never lead the collector outside the selected repository.
        if root not in path.parent.resolve().parents and path.parent.resolve() != root:
            raise ValueError('A tracked path leaves the selected repository.')
        try:
            before = path.lstat()
        except FileNotFoundError:
            files[relative] = None
            continue
        if stat.S_ISLNK(before.st_mode):
            data = os.fsencode(os.readlink(path))
        elif stat.S_ISREG(before.st_mode):
            total += before.st_size
            if total > MAX_FILE_BYTES:
                raise ValueError('Tracked content exceeds the bounded checkpoint read limit.')
            data = path.read_bytes()
        else:
            raise ValueError('A tracked path is not a regular file or symlink.')
        after = path.lstat()
        if (before.st_size, before.st_mtime_ns, before.st_ino) != (after.st_size, after.st_mtime_ns, after.st_ino):
            raise ValueError('A tracked file changed during the checkpoint. Retry after the write finishes.')
        files[relative] = sha(str(stat.S_IMODE(before.st_mode)).encode() + b'\0' + data)
    if head != git(root, 'rev-parse', 'HEAD').decode().strip():
        raise ValueError('Git HEAD changed during the checkpoint. Retry.')
    return {'head': head, 'files': files, 'observed_at': now()}


def prefix(path, size):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        remaining = size
        while remaining:
            block = stream.read(min(1024*1024, remaining))
            if not block:
                raise ValueError('The consented source was truncated or replaced.')
            digest.update(block)
            remaining -= len(block)
    return digest.hexdigest()


def anchor(source, harness):
    path = Path(source).expanduser().resolve(strict=True)
    size = path.stat().st_size
    if not path.is_file() or not size or size > MAX_SOURCE:
        raise ValueError('Select a readable native transcript under 512 MiB.')
    with path.open('rb') as stream:
        first = json.loads(stream.readline())
        stream.seek(size-1)
        if stream.read(1) != b'\n':
            raise ValueError('The native source is still writing a record. Retry when it is complete.')
    if harness == 'codex' and first.get('type') != 'session_meta':
        raise ValueError('A Codex route source must begin with its native session metadata.')
    return {'path': str(path), 'harness': harness, 'offset': size,
            'prefix_sha256': prefix(path, size), 'identity': first.get('payload', {}).get('id') if harness == 'codex' else None}


@contextmanager
def session_file(root, capture):
    try:
        if str(uuid.UUID(capture)) != capture:
            raise ValueError()
    except (ValueError, TypeError, AttributeError):
        raise ValueError('Choose a route capture ID returned by route-start.') from None
    folder = Path(root)/'routes'/capture
    if not folder.is_dir():
        raise ValueError('Unknown route capture.')
    with (folder/'lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        yield folder


def write(folder, state):
    raw = encoded(state)
    if len(raw) > 32*1024*1024:
        raise ValueError('This local journal is full. Finish this capture and start a new one.')
    with tempfile.NamedTemporaryFile(dir=folder, delete=False) as stream:
        os.chmod(stream.name, 0o600)
        stream.write(raw)
        name = stream.name
    os.replace(name, folder/'journal.json')


def _start(root, projects, source, harness, consent=False):
    if consent is not True:
        raise ValueError('Starting a route requires --consent for future observations in the selected projects and source.')
    if not 1 <= len(projects) <= 12:
        raise ValueError('Select 1 to 12 named projects.')
    from .code_route import _label
    bound = []
    for index, project in enumerate(projects):
        label = _label(project['name'], 'project label')
        path = Path(project['root']).expanduser().resolve(strict=True)
        bound.append({'id': 'p'+str(index+1), 'name': label, 'root': str(path)})
    if len({p['root'] for p in bound}) != len(bound):
        raise ValueError('Select each repository once.')
    source = anchor(source, harness)
    for old_path in (Path(root)/'routes').glob('*/journal.json'):
        old=json.loads(old_path.read_text())
        same_source=(old['source']['path']==source['path'] or (source['identity'] and old['source'].get('identity')==source['identity']))
        if not old['closed'] and (same_source or set(p['root'] for p in old['projects']) & set(p['root'] for p in bound)):
            raise ValueError('An active capture already covers this source or repository. Checkpoint or review it before starting another.')
    state = {'v': 1, 'consent': {'explicit': True, 'at': now(), 'scope': 'future Git checkpoints and appended native records'},
             'id': str(uuid.uuid4()), 'source': source, 'projects': bound, 'records': [], 'closed': False}
    for project in bound:
        state['records'].append({'record': len(state['records'])+1, 'project': project['id'], 'kind': 'baseline', 'snapshot': snapshot(project['root'])})
    folder = Path(root)/'routes'/state['id']
    folder.mkdir(mode=0o700, parents=True)
    write(folder, state)
    return {'capture': state['id'], 'consented_at': state['consent']['at'], 'journal': str(folder/'journal.json'), 'native_offset': source['offset'], 'uploaded': 0}



def start(root, projects, source, harness, consent=False):
    if consent is not True:
        raise ValueError('Starting a route requires --consent for future observations in the selected projects and source.')
    root=Path(root);root.mkdir(mode=0o700,parents=True,exist_ok=True)
    descriptor=os.open(root/'route-start.lock',os.O_CREAT|os.O_RDWR,0o600)
    with os.fdopen(descriptor,'a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        return _start(root,projects,source,harness,consent)

def checkpoint(root, capture):
    with session_file(root, capture) as folder:
        state = json.loads((folder/'journal.json').read_text())
        if state['closed']:
            raise ValueError('This capture is closed. Start a new consented capture for later work.')
        for project in state['projects']:
            previous = next(r['snapshot'] for r in reversed(state['records']) if r['project'] == project['id'])
            current = snapshot(project['root'])
            # Newly tracked paths have no previous content witness: establish their baseline, not an inferred edit.
            added_scope = sorted(set(current['files']) - set(previous['files']))
            changed = sorted(p for p in previous['files'] if previous['files'].get(p) != current['files'].get(p))
            commits = []
            if previous['head'] != current['head']:
                git(project['root'], 'merge-base', '--is-ancestor', previous['head'], current['head'])
                commits = git(project['root'], 'rev-list', '--reverse', '--topo-order', previous['head']+'..'+current['head']).decode().splitlines()
            state['records'].append({'record': len(state['records'])+1, 'project': project['id'], 'kind': 'checkpoint',
                                     'snapshot': current, 'changed': changed, 'scope_added': added_scope, 'commits': commits})
        if len(state['records']) > 200:
            raise ValueError('The capture has reached 200 observations. Start a new capture.')
        write(folder, state)
        return {'capture': capture, 'records': len(state['records']), 'observed_checkpoints': sum(bool(r.get('changed') or r.get('commits')) for r in state['records']), 'uploaded': 0}


def native_window(state, end=None):
    """Count actual appended tool records; do not manufacture a human turn for a child agent."""
    source = state['source']
    path = Path(source['path'])
    if prefix(path, source['offset']) != source['prefix_sha256']:
        raise ValueError('The consented source prefix changed. Start a new capture; do not reuse this anchor.')
    end = path.stat().st_size if end is None else end
    if end <= source['offset'] or end-source['offset'] > MAX_DELTA:
        raise ValueError('The consented source needs new records, with at most 32 MiB appended per capture.')
    with path.open('rb') as stream:
        header = json.loads(stream.readline())
        stream.seek(source['offset'])
        raw = stream.read(end-source['offset'])
    if not raw.endswith(b'\n'):
        raise ValueError('The native source is still writing a record. Retry when it is complete.')
    try:
        rows = [json.loads(line) for line in raw.splitlines() if line.strip()]
        if any(not isinstance(row, dict) for row in rows):
            raise ValueError()
    except (ValueError, UnicodeDecodeError):
        raise ValueError('The appended source contains an unreadable record.') from None
    consent = datetime.fromisoformat(state['consent']['at'].replace('Z', '+00:00'))
    filtered = []
    for row in rows:
        try:
            stamp = datetime.fromisoformat(row.get('timestamp', '').replace('Z', '+00:00'))
            if stamp.tzinfo and stamp < consent:
                continue
        except (ValueError, TypeError):
            pass
        filtered.append(row)
    events, ids = [], set()
    for number, row in enumerate(filtered):
        stamp = None
        try:
            stamp = datetime.fromisoformat(row.get('timestamp', '').replace('Z', '+00:00'))
            if stamp.tzinfo is None:
                stamp = None
            elif stamp < consent:
                continue  # a delayed flush of a pre-consent record is not new work
        except (ValueError, TypeError):
            pass
        if source['harness'] == 'codex':
            payload = row.get('payload') or {}
            blocks = [payload] if isinstance(payload, dict) and payload.get('type') in ('function_call', 'custom_tool_call') else []
        else:
            message = row.get('message') or {}
            content = message.get('content') if isinstance(message, dict) else None
            blocks = [block for block in content if isinstance(block, dict) and block.get('type') == 'tool_use'] if isinstance(content, list) else []
        for index, block in enumerate(blocks):
            identity = block.get('call_id') or block.get('id') or (number, index)
            if identity in ids:
                continue
            ids.add(identity)
            events.append(stamp)
    if not events:
        raise ValueError('No new native tool-call records were observed after consent. No run was fabricated.')
    timed = all(stamp is not None for stamp in events)
    rhythm = [0] * min(24, len(events))
    if timed:
        low, high = min(events), max(events)
        span = (high-low).total_seconds()
        for stamp in events:
            rhythm[min(len(rhythm)-1, int((stamp-low).total_seconds()/max(1, span)*len(rhythm)))] += 1
        started, duration = low.isoformat().replace('+00:00', 'Z'), span
    else:
        for index in range(len(events)):
            rhythm[index*len(rhythm)//len(events)] += 1
        started, duration = None, None
    from .capture_metadata import recorded
    typed = None
    if source['harness'] == 'codex':
        from .native_trace import codex_activity
        # Authorship logic is shared with the native parser; no injected human turn.
        typed = codex_activity(str(path), records=[header]+filtered)['typed']
    metadata = recorded(filtered, source['harness'])
    # Appended usage snapshots may repeat a call begun before consent. Without a
    # boundary-matched usage witness, token totals for this selected window stay unknown.
    metadata = {k:v for k,v in metadata.items() if k in ('models','basis')}
    metrics = {'harness': {'codex':'Codex','cursor':'Cursor','claude':'Claude Code'}[source['harness']],
               'tool_calls': len(events), 'turns_typed': typed, 'rhythm': rhythm,
               'trace_basis': 'timestamped native events' if timed else 'observed native events; timestamps unavailable',
               'started': started, 'duration_s': duration, 'capture_metadata': metadata}
    witness = {'offset': source['offset'], 'end': end, 'appended_sha256': sha(raw), 'records': len(rows),
               'counted_tool_calls': len(events), 'basis': metrics['trace_basis']}
    return metrics, witness


def route_from_journal(state, source_hash):
    from .code_route import validate_code_route
    stops, seen_files, seen_commits, used_projects = [], set(), set(), set()
    for record in state['records']:
        changed, commits = record.get('changed') or [], record.get('commits') or []
        if not changed and not commits:
            continue
        seen_files.update((record['project'], path) for path in changed)
        seen_commits.update((record['project'], commit) for commit in commits)
        used_projects.add(record['project'])
        kind = 'commit' if commits else 'edit'
        label = (f'{len(commits)} commits and {len(changed)} file changes observed' if commits and changed else
                 f'{len(commits)} commit'+('s' if len(commits)!=1 else '')+' recorded' if commits else f'{len(changed)} tracked file change'+('s' if len(changed)!=1 else '')+' observed')
        order = len(stops)+1
        stops.append({'id': 's'+str(order), 'project': record['project'], 'kind': kind, 'label': label, 'basis': 'measured',
                      'evidence': [MARKER, 'Source SHA256: '+source_hash,
                                   f"Record: {record['record']}; order: {order}; basis: checkpoint order",
                                   'Observed at: '+record['snapshot']['observed_at'],
                                   'Git commit: '+commits[-1] if commits else f'Content fingerprints changed: {len(changed)} file'+('s' if len(changed)!=1 else '')]})
    if not stops:
        raise ValueError('No post-consent content change or new commit was observed. No Code Route was fabricated.')
    if len(stops) > 40:
        raise ValueError('This capture exceeds 40 route checkpoints. Start a smaller capture; no checkpoints were silently dropped.')
    return validate_code_route({'v':1,
        'projects':[{'id':p['id'],'label':p['name'],'basis':'declared'} for p in state['projects'] if p['id'] in used_projects],
        'stops':stops, 'connectors':[{'from':a['id'],'to':b['id'],'kind':'continue','label':'Next observation'} for a,b in zip(stops,stops[1:])],
        'finish':{'stop':stops[-1]['id'],'kind':'unfinished','label':'Last observed checkpoint'},
        'stats':{'projects_touched':len(used_projects),'commits':len(seen_commits),'files_changed':len(seen_files),
                 'verified_checkpoints':len(stops)}})


def freeze(root, capture):
    """Freeze both source window and review. Repeating this never samples later activity."""
    from .push import export_run, import_url
    with session_file(root, capture) as folder:
        state = json.loads((folder/'journal.json').read_text())
        if state.get('closed'):
            cached = folder/'review-v2.json'
            if cached.exists():
                return json.loads(cached.read_text())
            original = json.loads((folder/'review.json').read_text())
            if sha(Path(original['source']).read_bytes()) != original['source_sha256']:
                raise ValueError('The frozen source witness changed. Refusing a revised projection.')
            metrics, witness = native_window(state, end=state['native_window']['end'])
            if witness['appended_sha256'] != state['native_window']['appended_sha256']:
                raise ValueError('The selected native records changed. Refusing a revised projection.')
            route = route_from_journal(state, original['source_sha256'])
            metrics.update(schema_version=1, project=state['projects'][0]['name'] if len(state['projects'])==1 else None,
                           files_touched=route['stats']['files_changed'], commits=route['stats']['commits'], code_route=route,
                           measurement_revision=sha(b'strive-route-projection-v2\0'+original['source_sha256'].encode()))
            payload = export_run(metrics)
            run_file = folder/'run-v2.json'
            run_file.write_bytes(encoded(payload)); os.chmod(run_file,0o600)
            revised = {**original,'projection_version':2,'supersedes_review':str(folder/'review.json'),'payload':payload,
                       'run_file':str(run_file),'preview_url':import_url(payload)}
            cached.write_bytes(encoded(revised)); os.chmod(cached,0o600)
            return revised
        metrics, witness = native_window(state)
        state['native_window'] = witness
        state['closed'] = True
        state['frozen_at'] = now()
        raw = encoded(state)
        source_hash = sha(raw)
        route = route_from_journal(state, source_hash)
        metrics.update(schema_version=1, project=state['projects'][0]['name'] if len(state['projects'])==1 else None,
                       files_touched=route['stats']['files_changed'], commits=route['stats']['commits'], code_route=route,
                       measurement_revision=sha(b'strive-route-projection-v2\0'+source_hash.encode()))
        payload = export_run(metrics)
        source_file = folder/('source-'+source_hash+'.json')
        source_file.write_bytes(raw)
        os.chmod(source_file, 0o600)
        run_file = folder/'run.json'
        run_file.write_bytes(encoded(payload))
        os.chmod(run_file, 0o600)
        review = {'capture':capture,'projection_version':2,'source':str(source_file),'source_sha256':source_hash,'run_file':str(run_file),
                  'payload':payload,'preview_url':import_url(payload),'uploaded':0}
        (folder/'review.json').write_bytes(encoded(review))
        os.chmod(folder/'review.json',0o600)
        (folder/'review-v2.json').write_bytes(encoded(review)); os.chmod(folder/'review-v2.json',0o600)
        write(folder,state)
        return review


def status(root):
    result = []
    for path in sorted((Path(root)/'routes').glob('*/journal.json')):
        state = json.loads(path.read_text())
        result.append({'capture':state['id'],'projects':[p['name'] for p in state['projects']],
                       'consented_at':state['consent']['at'],'closed':state['closed'],'observations':len(state['records'])})
    return result


def add_parser(sub):
    parser = sub.add_parser('code-route', help='Consent to new local checkpoints, observe changes, then freeze a private preview')
    parser.add_argument('--state')
    commands = parser.add_subparsers(dest='route_command', required=True)
    begin = commands.add_parser('start')
    begin.add_argument('--project', action='append', required=True, help='Registered STRIVE project name; repeat for multiple projects')
    begin.add_argument('--source', required=True)
    begin.add_argument('--harness', choices=['codex','cursor','claude'], required=True)
    begin.add_argument('--consent', action='store_true')
    for name in ['checkpoint','review']:
        commands.add_parser(name).add_argument('capture')
    commands.add_parser('status')


def run_cli(args):
    from .plugin import main
    command = {'start':'route-start','checkpoint':'route-checkpoint','review':'route-review','status':'route-status'}[args.route_command]
    argv = ['--state',args.state] if args.state else []
    argv.append(command)
    if command == 'route-start':
        for project in args.project:
            argv.extend(['--project',project])
        argv.extend(['--source',args.source,'--harness',args.harness])
        if args.consent:
            argv.append('--consent')
    elif hasattr(args,'capture'):
        argv.append(args.capture)
    return main(argv)
