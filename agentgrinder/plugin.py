"""STRIVE plugin: selected local capture, immutable review, explicitly private save.

No network operation exists except save(). Hooks only queue references for opted-in
projects. Source text is parsed locally and never stored in the plugin database.
"""
from __future__ import annotations
import argparse
import base64
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import tempfile
import urllib.error
import urllib.request
from urllib.parse import urlsplit
import uuid
from datetime import datetime

VERSION = '0.2.0'
MAX_SOURCE = 64 * 1024 * 1024
FIELDS = {'harness', 'capture_metadata', 'project', 'turns_typed', 'duration_s',
          'tool_calls', 'files_touched', 'commits', 'started', 'rhythm', 'ridge',
          'ridge_basis', 'ridge_wall_seconds', 'worker_bins', 'commit_bins',
          'ridge_tool_calls', 'trace_basis', 'schema_version', 'measurement_revision'}


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def digest(value):
    return hashlib.sha256(value if isinstance(value, bytes) else encoded(value).encode()).hexdigest()


def root_path(value=None):
    return Path(value or os.environ.get('STRIVE_STATE_DIR') or Path.home()/'.local/state/strive').expanduser().resolve()


def connect(root):
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    db = sqlite3.connect(root/'plugin.db', timeout=2)
    db.row_factory = sqlite3.Row
    db.executescript('''
      create table if not exists projects(name text primary key, root text unique not null, hooks integer not null default 0);
      create table if not exists drafts(id text primary key, project text not null, harness text not null,
        session text not null, source text not null, source_hash text not null, started text not null,
        payload text not null, unique(harness,session,started));
      create table if not exists queue(id text primary key, project text not null, harness text not null,
        source text not null, error text);
      create table if not exists reviews(id text primary key, payload text not null);
      create table if not exists saves(review text not null, revision text not null, origin text not null,
        account text not null, request text not null, result text, primary key(review,revision,origin,account));
    ''')
    os.chmod(root/'plugin.db', 0o600)
    return db


def label(value):
    value = str(value).strip()
    if not re.fullmatch(r'[\w][\w .+()&-]{0,79}', value) or '@' in value:
        raise ValueError('Use a project name of 1–80 letters, numbers, spaces or .+()&-. No paths or credentials.')
    return value


def project(db, name, path, hooks=False):
    name = label(name)
    path = Path(path).expanduser().resolve(strict=True)
    if not path.is_dir():
        raise ValueError('Project root must be a directory.')
    with db:
        db.execute('insert into projects values(?,?,?) on conflict(name) do update set root=excluded.root,hooks=excluded.hooks',
                   (name, str(path), int(hooks)))
    return {'project': name, 'root': str(path), 'hooks': hooks, 'uploaded': 0}


def read_source(path):
    path = Path(path).expanduser().resolve(strict=True)
    if not path.is_file() or path.stat().st_size > MAX_SOURCE:
        raise ValueError('Select a JSONL transcript under 64 MiB.')
    raw = path.read_bytes()
    if len(raw) > MAX_SOURCE:
        raise ValueError('Transcript exceeds 64 MiB.')
    try:
        rows = [json.loads(line) for line in raw.splitlines() if line.strip()]
    except (ValueError, UnicodeDecodeError):
        raise ValueError('Transcript has an incomplete record. Retry after the writer finishes.') from None
    if not rows or any(not isinstance(r, dict) for r in rows):
        raise ValueError('Expected JSONL transcript objects.')
    return path, raw, rows


def source_identity(rows, harness, path):
    # Child transcripts are not independent sessions. Do not count them beside parents.
    if any(p in ('subagents', 'subagent') for p in path.parts):
        raise ValueError('Child transcript excluded; select its parent session.')
    ids = set()
    for row in rows:
        meta = row.get('payload') if row.get('type') == 'session_meta' else {}
        meta = meta if isinstance(meta, dict) else {}
        src = meta.get('source')
        if (row.get('isSidechain') is True or row.get('parentSessionId') or row.get('parentComposerId')
                or (isinstance(src, dict) and src.get('subagent'))):
            raise ValueError('Child transcript excluded; select its parent session.')
        sid = row.get('sessionId') or row.get('session_id') or meta.get('id')
        if sid: ids.add(str(sid))
    if len(ids) > 1:
        raise ValueError('Transcript contains multiple session identities; select one source.')
    return next(iter(ids)) if ids else path.stem


def capture(db, root, name, harness, source, sitting=-1):
    name = label(name)
    if not db.execute('select 1 from projects where name=?', (name,)).fetchone():
        raise ValueError('Register the named project first.')
    path, raw, rows = read_source(source)
    session = source_identity(rows, harness, path)
    duplicate=db.execute('select id,project,payload from drafts where harness=? and source_hash=? and session<>?',
                         (harness,digest(raw),session)).fetchone()
    if duplicate:
        if duplicate['project']!=name:
            raise ValueError('This source is already selected under another project.')
        # Same bytes under a new filename are the same source. Capture the requested sitting
        # normally under the original identity, so different sittings still remain distinct.
        existing=db.execute('select session from drafts where id=?',(duplicate['id'],)).fetchone()
        session=existing['session']
    from .native_sittings import read_sitting
    from .engine.series import record_and_attach
    from .push import export_run
    # All measurements come from one frozen read; temporary raw bytes are private and removed.
    with tempfile.TemporaryDirectory(prefix='strive-', dir=root) as folder:
        frozen = Path(folder)/path.name
        frozen.write_bytes(raw)
        os.chmod(frozen, 0o600)
        run = read_sitting(str(frozen), harness, pick=sitting)
    run['project'] = name
    run['project_proven'] = True  # explicitly declared, never inferred from a folder name
    run['input_digest'] = digest(raw)
    record_and_attach(run, path=str(root/'series.db'), command='strive selected capture')
    os.chmod(root/'series.db', 0o600)
    payload = {k:v for k,v in export_run(run).items() if k in FIELDS}
    payload.update(title=name + ' run', visibility='private')
    key = digest([harness, session, run['started']])
    prior = db.execute('select payload,project from drafts where id=?', (key,)).fetchone()
    if prior and prior['project'] != name:
        raise ValueError('This session is already selected under another project; remove that draft before relabelling.')
    with db:
        db.execute('insert into drafts values(?,?,?,?,?,?,?,?) on conflict(id) do update set source_hash=excluded.source_hash,payload=excluded.payload',
                   (key, name, harness, session, str(path), digest(raw), run['started'], encoded(payload)))
    return {'draft': key, 'project': name, 'status': 'unchanged' if prior and prior['payload'] == encoded(payload) else 'captured',
            'payload': payload, 'uploaded': 0}


def origin(value):
    u = urlsplit(value)
    if (u.username or u.password or u.query or u.fragment or u.path not in ('', '/')
            or not u.hostname or not (u.scheme == 'https' or (u.scheme == 'http' and u.hostname in ('localhost','127.0.0.1','::1')))):
        raise ValueError('Use an HTTPS product origin or HTTP loopback, without credentials, path, query or fragment.')
    return value.rstrip('/')


def review(db, root, ids, base='https://striverun.app'):
    base = origin(base)
    if not ids or len(ids) > 100 or len(set(ids)) != len(ids):
        raise ValueError('Select 1–100 distinct draft IDs explicitly.')
    drafts = []
    for key in ids:
        row = db.execute('select * from drafts where id=?', (key,)).fetchone()
        if row is None: raise ValueError('Unknown draft: ' + key)
        drafts.append(json.loads(row['payload']))
    # Immutable review is the save input. Recapturing a session cannot change approved bytes.
    bundle = {'schema':'strive-day-drafts-v1', 'runs':drafts, 'history':[], 'project':None,
              'day':datetime.now().strftime('%Y-%m-%d'), 'selection_label':'Selected sessions'}
    token = digest(bundle)
    with db: db.execute('insert or ignore into reviews values(?,?)', (token, encoded(bundle)))
    packed = base64.urlsafe_b64encode(gzip.compress(encoded(bundle).encode(), mtime=0)).decode().rstrip('=')
    url = base + '/#day-drafts=gz.' + packed
    groups = {}
    for run in drafts:
        group = groups.setdefault(run['project'], {'sessions':0,'tool_calls':0,'tool_calls_measured':0,'models':set(),
                                                   'input_tokens':0,'output_tokens':0,'token_sessions':0})
        group['sessions'] += 1
        if run.get('tool_calls') is not None:
            group['tool_calls'] += run['tool_calls']; group['tool_calls_measured'] += 1
        group['models'].update((run.get('capture_metadata') or {}).get('models') or [])
        usage=run.get('capture_metadata') or {}
        if all(type(usage.get(k)) is int for k in ('input_tokens','output_tokens')):
            group['input_tokens']+=usage['input_tokens']; group['output_tokens']+=usage['output_tokens']; group['token_sessions']+=1
    for group in groups.values():
        group['models'] = sorted(group['models'])
        if not group['tool_calls_measured']: group['tool_calls']=None
        if not group['token_sessions']: group['input_tokens']=group['output_tokens']=None
    from .post_session import render
    page = render(drafts, groups, url)
    target = root/('review-'+token[:16]+'.html')
    target.write_text(page); os.chmod(target,0o600)
    return {'review':token,'projects':groups,'sessions':len(drafts),'file':str(target),'preview_url':url,'uploaded':0}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl): return None


def save(db, review_id, approved, base, token=None):
    if approved != review_id: raise ValueError('Approve the exact reviewed payload with --approve <review ID>.')
    base = origin(base)
    token = token or os.environ.get('STRIVE_AGENT_TOKEN','')
    if not re.fullmatch(r'ag_[a-f0-9-]{72}', token):
        raise ValueError('Set STRIVE_AGENT_TOKEN from Connect in the environment; never pass it in a prompt.')
    row = db.execute('select payload from reviews where id=?',(review_id,)).fetchone()
    if row is None: raise ValueError('Review not found.')
    bundle = json.loads(row[0])
    if digest(bundle) != review_id: raise ValueError('Review integrity check failed; make a new review.')
    account = digest(token.encode())
    results = []
    for payload in bundle['runs']:
        if payload.get('visibility') != 'private' or set(payload)-FIELDS-{'title','visibility'}:
            raise ValueError('Only the reviewed private metrics payload may be sent.')
        revision = payload['measurement_revision']
        args = (review_id, revision, base, account)
        request_id = str(uuid.uuid5(uuid.NAMESPACE_URL, encoded([base,account,revision])))
        with db: db.execute('insert or ignore into saves values(?,?,?,?,?,null)',args+(request_id,))
        prior = db.execute('select request,result from saves where review=? and revision=? and origin=? and account=?',args).fetchone()
        if prior['result']:
            results.append(json.loads(prior['result'])); continue
        req = urllib.request.Request(base+'/api/agent/runs',data=encoded(payload).encode(),method='POST',
            headers={'Content-Type':'application/json','Authorization':'Bearer '+token,'Idempotency-Key':prior['request']})
        try:
            with urllib.request.build_opener(NoRedirect).open(req,timeout=20) as response:
                result = json.load(response)
            run_id = str(uuid.UUID(str(result.get('id'))))
            if not isinstance(result.get('existing'),bool) or result.get('visibility') not in ('private','public','link','close_friends','crew','anonymous'):
                raise ValueError()
        except (OSError, ValueError, AttributeError):
            results.append({'status':'unknown; retry this same review','project':payload['project']})
            break
        result = {'id':run_id,'existing':result['existing'],'visibility':result['visibility'],'project':payload['project'],'url':base+'/r/'+run_id}
        with db: db.execute('update saves set result=? where review=? and revision=? and origin=? and account=?',(encoded(result),)+args)
        results.append(result)
    return {'review':review_id,'results':results,'sharing':'No sharing action performed; stored audience is reported for each result.'}


def hook(db, harness, event):
    # Bounded stdin is enforced by main. Never store text, model choice, email, commands or tokens.
    source = event.get('transcript_path')
    if not source or event.get('agent_id') or event.get('parent_conversation_id'):
        return {'queued':False}
    roots = event.get('workspace_roots') or [event.get('cwd')]
    matches = []
    for row in db.execute('select * from projects where hooks=1'):
        project_root = Path(row['root'])
        if any(p and (Path(p).resolve()==project_root or project_root in Path(p).resolve().parents) for p in roots):
            matches.append(row)
    if len(matches)!=1: return {'queued':False}
    path = Path(source).expanduser().resolve()
    key = digest([harness,str(path)])
    with db: db.execute('insert into queue values(?,?,?,?,null) on conflict(id) do update set error=null',
                        (key,matches[0]['name'],harness,str(path)))
    return {'queued':True}


def status(db):
    return {'version':VERSION,'projects':[dict(r) for r in db.execute('select * from projects order by name')],
            'drafts':[{'id':r['id'],'project':r['project'],'harness':r['harness'],'started':r['started']} for r in db.execute('select * from drafts order by started')],
            'queued':db.execute('select count(*) from queue').fetchone()[0],
            'pending_errors':[{'project':r['project'],'error':r['error']} for r in db.execute('select * from queue where error is not null')],
            'uploaded_by_status':0}


def sessions(db, name, limit=30):
    row=db.execute('select root from projects where name=?',(name,)).fetchone()
    if row is None: raise ValueError('Register the named project first.')
    selected=Path(row[0])
    from .capture import sources
    candidates=[]
    scanned=0
    per_harness={}
    encoded_root=str(selected).lstrip('/').replace('/','-').replace('.','-')
    for harness,path in sorted(sources(),key=lambda item:(encoded_root in item[1].parts,item[1].stat().st_mtime),reverse=True):
        if harness not in ('claude','cursor','codex'): continue
        if per_harness.get(harness,0)>=500: continue
        per_harness[harness]=per_harness.get(harness,0)+1
        scanned+=1
        try:
            # Discovery needs source metadata only. Full selected-source validation is capture's job.
            with path.open('rb') as stream: head=stream.read(256*1024)
            rows=[]
            for line in head.splitlines():
                try: value=json.loads(line)
                except ValueError: continue
                if isinstance(value,dict): rows.append(value)
            roots=[]
            for r in rows:
                payload=r.get('payload') or {}
                if not isinstance(payload,dict): payload={}
                value=r.get('cwd') or payload.get('cwd')
                if isinstance(value,str): roots.append(Path(value).resolve())
            matching=any(r==selected or selected in r.parents for r in roots)
            if harness=='cursor' and encoded_root in path.parts: matching=True
            if not matching: continue
            sid=source_identity(rows,harness,path)
            candidates.append({'harness':harness,'source':str(path),'session':sid,'project':name})
            if len(candidates)>=limit: break
        except (OSError,ValueError): continue
    return {'candidates':candidates,'scanned':scanned,'bounded':True,
            'note':'Local metadata candidates only. Confirm the session and sitting before capture; explicit --source works when metadata is unavailable.','uploaded':0}


def list_sittings(harness, source):
    path,raw,rows=read_source(source)
    source_identity(rows,harness,path)
    if harness=='claude':
        from .solo import human_sittings
        groups=human_sittings(str(path))
        return {'sittings':[{'sitting':i+1,'start':str(g['start']),'end':str(g['end'])} for i,g in enumerate(groups)],'uploaded':0}
    from .native_sittings import sittings
    groups=sittings(str(path),harness)
    return {'sittings':[{'sitting':i+1,'records':len(g)} for i,g in enumerate(groups)],'uploaded':0}


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--state',help='private STRIVE data directory')
    sub = p.add_subparsers(dest='command',required=True)
    q = sub.add_parser('project'); q.add_argument('name'); q.add_argument('root'); q.add_argument('--hooks',action='store_true')
    q = sub.add_parser('capture'); q.add_argument('--project',required=True); q.add_argument('--harness',choices=['claude','cursor','codex'],required=True); q.add_argument('--source',required=True); q.add_argument('--sitting',type=int,default=-1)
    q = sub.add_parser('sessions'); q.add_argument('--project',required=True)
    q = sub.add_parser('sittings'); q.add_argument('--harness',choices=['claude','cursor','codex'],required=True); q.add_argument('--source',required=True)
    q = sub.add_parser('review'); q.add_argument('drafts',nargs='+'); q.add_argument('--base-url',default='https://striverun.app')
    q = sub.add_parser('save'); q.add_argument('review'); q.add_argument('--approve',required=True); q.add_argument('--base-url',default='https://striverun.app')
    q = sub.add_parser('hook'); q.add_argument('--harness',choices=['claude','cursor'],required=True)
    sub.add_parser('collect'); sub.add_parser('status'); sub.add_parser('doctor')
    q = sub.add_parser('remove'); q.add_argument('draft')
    args = p.parse_args(argv)
    try:
        root = root_path(args.state)
        with connect(root) as db:
            if args.command=='project': result=project(db,args.name,args.root,args.hooks)
            elif args.command=='capture': result=capture(db,root,args.project,args.harness,args.source,args.sitting)
            elif args.command=='sessions': result=sessions(db,args.project)
            elif args.command=='sittings': result=list_sittings(args.harness,args.source)
            elif args.command=='review': result=review(db,root,args.drafts,args.base_url)
            elif args.command=='save': result=save(db,args.review,args.approve,args.base_url)
            elif args.command=='hook':
                raw=sys.stdin.buffer.read(65537)
                if len(raw)>65536: return 0
                hook(db,args.harness,json.loads(raw)); return 0
            elif args.command=='collect':
                result=[]
                for row in db.execute('select * from queue').fetchall():
                    try:
                        result.append(capture(db,root,row['project'],row['harness'],row['source']))
                        db.execute('delete from queue where id=?',(row['id'],)); db.commit()
                    except (ValueError,OSError):
                        db.execute('update queue set error=? where id=?',('Source not ready or unsupported; explicitly select a readable parent session.',row['id'])); db.commit()
                        result.append({'status':'retry','project':row['project']})
            elif args.command=='remove':
                db.execute('delete from drafts where id=?',(args.draft,)); result={'removed':db.total_changes}
            else:
                result=status(db)
                if args.command=='doctor': result.update(python=sys.version.split()[0],state_writable=os.access(root,os.W_OK),token_available=bool(os.environ.get('STRIVE_AGENT_TOKEN')),network_checked=False)
        print(json.dumps(result,indent=2))
        return 0
    except (ValueError,TypeError,OSError,sqlite3.Error) as error:
        if args.command=='hook': return 0 # completion must never be blocked by capture
        print(json.dumps({'error':str(error),'uploaded':0}),file=sys.stderr)
        return 1


if __name__=='__main__': raise SystemExit(main())
