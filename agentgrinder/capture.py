"""Opt-in local transcript scanning. Scanning never starts a network client."""
from __future__ import annotations
import glob
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import time
from .contract import capture_digest


def connect(root=None):
    root = Path(root or Path.home() / '.agentgrinder' / 'capture')
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    db = sqlite3.connect(root / 'capture.db')
    db.row_factory = sqlite3.Row
    db.executescript('''
      create table if not exists settings(key text primary key,value text not null);
      create table if not exists ignored(path text primary key);
      create table if not exists ignored_projects(project text primary key);
      create table if not exists drafts(id text primary key,source text not null,harness text not null,
       started text not null,digest text not null,payload text not null,updated_at text not null default CURRENT_TIMESTAMP,
       unique(source,harness,started));
    ''')
    os.chmod(root / 'capture.db', 0o600)
    return db


def sources():
    from .ingest import CLAUDE_GLOB, CURSOR_GLOB, GROKBOT_GLOB, CODEX_GLOBS
    found = []
    for harness, patterns in [
        ('claude', [CLAUDE_GLOB]),
        ('cursor', [CURSOR_GLOB]),
        ('codex', CODEX_GLOBS),
        ('grokbot', [GROKBOT_GLOB]),
    ]:
        for pattern in patterns:
            found.extend((harness, Path(p)) for p in glob.glob(os.path.expanduser(pattern), recursive=True) if Path(p).is_file())
    return sorted(set(found), key=lambda item: (item[0], str(item[1])))


def read_run(harness, path, pick=-1, records=None):
    from .ingest import parse_codex_session, parse_cursor_session, parse_grokbot_session
    from .solo import parse_solo
    if harness == 'claude':
        return parse_solo(str(path), pick=pick)
    return {
        'codex': parse_codex_session,
        'cursor': parse_cursor_session,
        'grokbot': parse_grokbot_session,
    }[harness](str(path), records=records)


def scan(db, selected=None):
    state = db.execute("select value from settings where key='paused'").fetchone()
    report = {'paused': bool(state and state[0] == 'true'), 'created': 0, 'updated': 0, 'unchanged': 0, 'ignored': 0, 'retry': 0, 'unreadable': 0, 'no_typed_turns': 0, 'skipped': []}
    if report['paused']:
        return report
    ignored = [Path(r[0]) for r in db.execute('select path from ignored')]
    ignored_projects = {r[0] for r in db.execute('select project from ignored_projects')}
    for harness, source in selected if selected is not None else sources():
        path = Path(source).resolve()
        if any(path == folder or folder in path.parents for folder in ignored):
            report['ignored'] += 1
            continue
        try:
            digest = capture_digest(path)
            prior = db.execute('select digest from drafts where source=? and harness=? order by updated_at desc limit 1', (str(path), harness)).fetchone()
            if prior and prior[0] == digest:
                report['unchanged'] += 1
                continue
            if harness == 'claude':
                from .solo import human_sittings
                runs = [read_run(harness, path, pick=i+1) for i in range(len(human_sittings(str(path))))]
            else:
                from .native_sittings import sittings
                runs = [read_run(harness,path,records=group) for group in sittings(path,harness)]
            if capture_digest(path) != digest:
                report['retry'] += 1
                continue
            if not runs:
                # A readable session with no sitting used to leave every counter at zero, so an
                # unattended run of many hours looked the same as a session that was never there.
                report['no_typed_turns'] += 1
                report['skipped'].append({'session': path.stem, 'harness': harness,
                                          'reason': 'no typed turns; an unattended run is measured with: agentgrinder agent capture'})
                continue
            for run in runs:
                if run.get('project') in ignored_projects:
                    report['ignored'] += 1
                    continue
                run['input_digest'] = digest
                started = run.get('started') or 'unknown'
                identity = hashlib.sha256(json.dumps([str(path), harness, started]).encode()).hexdigest()
                existed = db.execute('select 1 from drafts where id=?', (identity,)).fetchone()
                # Parsed card text remains private. Export uses the separate public allowlist.
                with db:
                    db.execute("""insert into drafts(id,source,harness,started,digest,payload) values(?,?,?,?,?,?)
                    on conflict(id) do update set digest=excluded.digest,payload=excluded.payload,updated_at=CURRENT_TIMESTAMP""",
                               (identity, str(path), harness, started, digest, json.dumps(run)))
                report['updated' if existed else 'created'] += 1
        except (OSError, ValueError, TypeError):
            report['unreadable'] += 1
    return report


def day_drafts(db, day):
    """Drafts whose session started on this LOCAL calendar day, oldest first, and how many did not."""
    from datetime import datetime
    chosen, other = [], 0
    for row in db.execute('select id,source,harness,started,payload from drafts order by started'):
        try:
            started = datetime.fromisoformat(row['started'].replace('Z', '+00:00'))
        except ValueError:
            other += 1
            continue
        if started.tzinfo is not None:
            started = started.astimezone()
        if started.strftime('%Y-%m-%d') == day:
            chosen.append((row, started))
        else:
            other += 1
    return chosen, other


def write_day(db, day=None, out=None, project=None, push_url=None):
    """One local HTML page: every draft of the day, exactly what each would send, and its private
    preview link. Nothing is uploaded here and nothing is saved until the owner presses Save run."""
    import html
    from datetime import datetime
    from .push import export_run, import_url
    day = day or datetime.now().strftime('%Y-%m-%d')
    datetime.strptime(day, '%Y-%m-%d')
    if project is not None and not (0 < len(project.strip()) <= 120):
        raise ValueError('A project label is 1 to 120 characters.')
    chosen, other = day_drafts(db, day)
    e = html.escape
    rows = []
    for row, started in chosen:
        run = json.loads(row['payload'])
        if project:
            run['project'] = project.strip()
        sent = export_run(run)
        meta = sent.get('capture_metadata') or {}
        seconds = sent.get('duration_s')
        facts = [sent.get('harness') or row['harness'], started.strftime('%H:%M'),
                 f"{round(seconds / 60)} min" if isinstance(seconds, (int, float)) else 'duration unknown',
                 f"{sent.get('turns_typed')} typed turns" if sent.get('turns_typed') is not None else 'typed turns unknown',
                 f"{sent.get('tool_calls')} tool calls" if sent.get('tool_calls') is not None else 'tool calls unknown',
                 f"{sent.get('commits')} commits" if sent.get('commits') is not None else 'commits unknown',
                 ', '.join(meta.get('models') or []) or 'model unknown']
        rows.append(f"""<article><h2>{e(str(sent.get('project') or 'No project named'))}</h2>
<p class="facts">{e(' · '.join(str(f) for f in facts))}</p>
<p><a class="open" href="{e(import_url(run, push_url))}" target="_blank" rel="noopener">Open private preview</a>
<span class="src">source session {e(Path(row['source']).stem[:8])}, kept on this machine</span></p>
<details><summary>Exactly what this preview carries ({len(sent)} fields)</summary><pre>{e(json.dumps(sent, indent=1, sort_keys=True))}</pre></details></article>""")
    page = f"""<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>STRIVE day review {e(day)}</title>
<style>body{{font:16px/1.5 "IBM Plex Sans",Arial,sans-serif;background:#f7f7f5;color:#0a0a0a;margin:0}}main{{max-width:820px;margin:0 auto;padding:24px 16px 80px}}
h1{{font-size:34px;line-height:1.1;margin:0 0 8px}}article{{background:#fff;border:1px solid #e3e3df;padding:14px 16px;margin:10px 0}}h2{{font-size:17px;margin:0}}
.facts,.src,.note{{font-size:13px;color:#6f6f6b}}.open{{display:inline-block;background:#0047ff;color:#fff;padding:8px 14px;text-decoration:none;margin-right:10px}}
pre{{font-size:12px;overflow:auto;background:#f7f7f5;padding:10px}}summary{{cursor:pointer;font-size:13px;color:#0047ff}}</style>
<main><h1>{len(chosen)} private drafts for {e(day)}</h1>
<p class="note">This file is on your machine only. Nothing has been uploaded. A preview is saved only when you press Save run, and it starts as Only me.
{f'Every draft below carries the project label you declared: {e(project.strip())}.' if project else 'Add --project to put one label on all of them.'}
{other} drafts from other days are not shown. A session with no typed turns makes no draft: run capture scan to see which were skipped.</p>
{''.join(rows) or '<article><h2>No drafts on this day</h2><p class="facts">Run capture scan first.</p></article>'}</main>"""
    target = Path(out or f'strive-day-{day}.html')
    target.write_text(page)
    os.chmod(target, 0o600)
    return {'day': day, 'drafts': len(chosen), 'other_days': other, 'project': project.strip() if project else None,
            'written': str(target), 'uploaded': 0}


def add_parser(sub):
    parser = sub.add_parser('capture', help='scan local sessions into private drafts; never upload')
    parser.add_argument('--directory', help='private capture database directory')
    commands = parser.add_subparsers(dest='capture_command', required=True)
    for name in ('scan', 'watch'):
        p = commands.add_parser(name)
        p.add_argument('--session', help='one transcript; omit to backfill discovered transcripts')
        p.add_argument('--harness', choices=['claude', 'cursor', 'codex', 'grokbot'], default='claude')
        if name == 'watch':
            p.add_argument('--interval', type=int, default=60)
    for name in ('pause', 'resume', 'list'):
        commands.add_parser(name)
    for name in ('ignore', 'unignore'):
        commands.add_parser(name).add_argument('path', help='transcript or directory to exclude')
    for name in ('ignore-project', 'unignore-project'):
        commands.add_parser(name).add_argument('project', help='exact local project label to exclude')
    p = commands.add_parser('day', help='one private local review page for one day of drafts; never uploads')
    p.add_argument('--date', help='local calendar day, YYYY-MM-DD (default today)')
    p.add_argument('--project', help='one project label to put on every draft of the day, declared by you')
    p.add_argument('--push-url', help='where the private previews open (default https://striverun.app)')
    p.add_argument('--out', help='file to write (default ./strive-day-<date>.html)')
    p = commands.add_parser('show'); p.add_argument('id'); p.add_argument('--measure',action='store_true',help='record the captured counts as an immutable local measurement'); p.add_argument('--export', action='store_true', help='print the public allowlist instead of the private draft')
    p = commands.add_parser('delete'); p.add_argument('id')


def run_cli(args):
    db = connect(args.directory)
    try:
        name = args.capture_command
        if name in ('pause', 'resume'):
            with db:
                db.execute("insert into settings values('paused',?) on conflict(key) do update set value=excluded.value", ('true' if name == 'pause' else 'false',))
            output = {'paused': name == 'pause'}
        elif name in ('ignore', 'unignore'):
            path = str(Path(args.path).expanduser().resolve())
            with db:
                if name == 'ignore': db.execute('insert or ignore into ignored values(?)', (path,))
                else: db.execute('delete from ignored where path=?', (path,))
            output = {'ignored': [r[0] for r in db.execute('select path from ignored')]}
        elif name in ('ignore-project', 'unignore-project'):
            with db:
                if name == 'ignore-project': db.execute('insert or ignore into ignored_projects values(?)', (args.project,))
                else: db.execute('delete from ignored_projects where project=?', (args.project,))
            output = {'ignored_projects': [r[0] for r in db.execute('select project from ignored_projects')]}
        elif name == 'list':
            output = [dict(row) for row in db.execute('select id,harness,started,updated_at from drafts order by updated_at desc')]
        elif name == 'day':
            output = write_day(db, args.date, args.out, args.project, args.push_url)
        elif name in ('show', 'delete'):
            row = db.execute('select payload from drafts where id=?', (args.id,)).fetchone()
            if not row: raise ValueError('Draft not found. Use capture list.')
            output = json.loads(row[0])
            if name == 'delete':
                with db: db.execute('delete from drafts where id=?', (args.id,))
                output = {'deleted': args.id, 'note': 'Ignore its source before scanning again to keep it excluded.'}
            else:
                if args.measure:
                    if not output.get('started'):raise ValueError('This draft has no session timestamp; a comparison cannot be recorded.')
                    from .engine.series import record_and_attach
                    record_and_attach(output,command='agentgrinder capture show --measure')
                if args.export:
                    from .push import export_run
                    output = export_run(output)
        else:
            if name == 'watch' and args.interval < 5: raise ValueError('Scan interval must be at least five seconds.')
            selected = [(args.harness, args.session)] if args.session else None
            while True:
                output = scan(db, selected)
                if name != 'watch': break
                print(json.dumps(output), flush=True)
                time.sleep(args.interval)
        print(json.dumps(output, indent=2))
        return 0
    except (ValueError, OSError) as error:
        print(str(error)); return 1
    except KeyboardInterrupt:
        return 0
    finally:
        db.close()
