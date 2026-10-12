"""Explicit local session selection. Prompts stay in the loopback picker, never uploads."""
from __future__ import annotations
import base64, gzip, html, json, re, secrets, threading, webbrowser
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


def text(value):
    if isinstance(value, str): return value
    if isinstance(value, list): return ' '.join(text(v.get('text','')) for v in value if isinstance(v,dict))
    return ''


def clean_prompt(value, harness):
    if harness == 'cursor':
        match=re.search(r'<user_query>(.*?)</user_query>',value,re.S)
        if match:value=match.group(1)
        else:value=re.sub(r'<timestamp>.*?</timestamp>', '', value, flags=re.S)
    return ' '.join(value.split())[:180]


def local_time(value):
    try:
        parsed=datetime.fromisoformat(value.replace('Z','+00:00'))
        if parsed.tzinfo is None:return value+' · timezone not recorded'
        return parsed.astimezone().strftime('%d %b %Y, %H:%M %Z (UTC%z)')
    except (ValueError,AttributeError):return 'Time not recorded'


def relative_time(value,now=None):
    try:
        parsed=datetime.fromisoformat(value.replace('Z','+00:00'))
        if parsed.tzinfo is None:return 'Time not recorded'
        seconds=int(((now or datetime.now(timezone.utc))-parsed).total_seconds())
        if abs(seconds)<60:return 'just now'
        amount,unit=(abs(seconds)//86400,'day') if abs(seconds)>=86400 else (abs(seconds)//3600,'hour') if abs(seconds)>=3600 else (abs(seconds)//60,'minute')
        label=str(amount)+' '+unit+('s' if amount!=1 else '')
        return label+' ago' if seconds>=0 else 'in '+label
    except (ValueError,AttributeError):return 'Time not recorded'


def cursor_folder(path):
    from .ingest import project_label
    # Preserve the flattened project label; dashes cannot safely be decoded as path separators.
    for parent in path.parents:
        if parent.name=='agent-transcripts':return project_label(parent.parent.name)
    return ''

def discover(harness, limit=30, candidates=None):
    from .capture import sources
    from .plugin import source_identity
    from .stream_capture import MAX_SOURCE
    source_pairs=list(sources() if candidates is None else candidates)
    by_path={str(p):h for h,p in source_pairs}
    paths=[p for h,p in source_pairs if harness in (None, 'all') and h in ('claude','codex','cursor') or h==harness]
    found=[]
    for path in sorted(paths,key=lambda p:p.stat().st_mtime,reverse=True)[:200]:
        try:
            kind=by_path[str(path)]
            if path.stat().st_size>MAX_SOURCE: continue
            with path.open('rb') as f: head=f.read(256*1024)
            rows=[]
            for line in head.splitlines():
                try: row=json.loads(line)
                except (ValueError,UnicodeDecodeError): continue
                if isinstance(row,dict): rows.append(row)
            sid=source_identity(rows,kind,path)
            cwd=None;first='';at=None
            for row in rows:
                p=row.get('payload') if isinstance(row.get('payload'),dict) else {}
                cwd=cwd or row.get('cwd') or p.get('cwd')
                at=at or row.get('timestamp') or p.get('timestamp')
                msg=row.get('message') if isinstance(row.get('message'),dict) else {}
                content=''
                if row.get('type')=='user': content=text(msg.get('content'))
                elif p.get('type')=='user_message': content=text(p.get('message'))
                elif p.get('role')=='user': content=text(p.get('content'))
                elif row.get('role')=='user': content=text(row.get('content') or msg.get('content'))
                if content and not first:
                    # Setup scaffolding is not the person's first prompt.
                    if content.lstrip().startswith(('# AGENTS.md','<environment_context>','<INSTRUCTIONS>')): continue
                    first=clean_prompt(content,kind)
                    if kind=='cursor':
                        from .native_sittings import cursor_time
                        recorded=cursor_time(content)
                        if not at and recorded:at=recorded.isoformat()
            project=Path(cwd).name if isinstance(cwd,str) and cwd else cursor_folder(path) if kind=='cursor' else ''
            found.append(dict(harness=kind,source=str(path),session=sid,project=project,started=at or datetime.fromtimestamp(path.stat().st_mtime,timezone.utc).isoformat(),time_basis='recorded' if at else 'file modified',prompt=first or 'First prompt not available in the session header'))
            if len(found)>=limit: break
        except (OSError,ValueError,TypeError): continue
    return found


STYLE='''body{font:16px system-ui;color:#17202d;background:#f5f7fa;margin:0}main{max-width:820px;margin:40px auto;padding:24px}h1{font-size:30px}a{color:#0047ff}.brand{color:#0047ff;font-weight:800}.steps{display:flex;gap:20px;padding:0;list-style:none;color:#667}article,label.pick{display:block;border:1px solid #d8deea;background:white;border-radius:10px;padding:16px;margin:12px 0}label.pick:has(input:checked){border:2px solid #0047ff}small{display:block;color:#667;margin:5px 0}p{line-height:1.5}input[type=text],select{box-sizing:border-box;font:inherit;width:100%;padding:12px;border:1px solid #b9c4d7;border-radius:6px;margin:8px 0}button,.primary{display:inline-block;background:#0047ff;color:white;border:0;border-radius:8px;padding:14px 20px;font:600 16px system-ui;text-decoration:none}.back{display:inline-block;margin-top:12px}.actions{position:sticky;bottom:0;background:#f5f7fa;padding:12px 0}code{overflow-wrap:anywhere}@media(max-width:600px){main{margin:0;padding:18px}.steps{font-size:13px;gap:10px}h1{font-size:26px}}'''

def page(body):
    return '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="same-origin"><title>STRIVE · Pick a session</title><style>'+STYLE+".spinner{display:inline-block;width:24px;height:24px;border:3px solid #d9e5ff;border-top-color:#1769ff;border-radius:50%;animation:spin 1s linear infinite}.loader{border:1px solid #ddd;padding:16px;border-radius:12px}.loader li{padding:6px}.loader [aria-current]{font-weight:700}@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.spinner{animation:none}}"+'</style><main><div class="brand">STRIVE</div><ol class="steps"><li>1 Choose your agent</li><li>2 Pick a session</li><li>3 Private preview</li></ol>'+body+'</main>'


def make_server(harness, root, site, candidates=None):
    from . import plugin
    from .stream_capture import inspect_source
    site=plugin.origin(site);root=plugin.root_path(root)
    rows=discover(harness,candidates=candidates);nonce=secrets.token_urlsafe(24);downloads={};jobs={};failed={};jobs_lock=threading.Lock()
    def prepare(index,name,sitting,progress):
        # Runs once per choice; the result is kept so a reload or a second press returns at once.
        try:
            progress('finding')
            selected=rows[index];kind=selected['harness']
            with plugin.connect(root) as db:
                plugin.register_capture_project(db,name,selected['source'])
                captured=plugin.capture(db,root,name,kind,selected['source'],sitting,progress=progress)
            packed=base64.urlsafe_b64encode(gzip.compress(plugin.encoded(captured['payload']).encode(),mtime=0)).decode().rstrip('=')
            preview_url=site+'/#import=gz.'+packed
            if len(preview_url)>65536:
                route='/'+nonce+'/download/'+secrets.token_urlsafe(18);downloads[route]=plugin.encoded(captured['payload']).encode()
                action='<a class="primary" href="'+route+'">Download private preview file</a><p>Open Add run on STRIVE and choose this .strive.json file. The preview is too large for a link; no run was truncated.</p>'
            else:action='<a class="primary" href="'+html.escape(preview_url,quote=True)+'">Open private preview</a>'
            capture_note=('<p role="status">'+html.escape(captured['capture_note'])+'</p>') if captured.get('capture_note') else ''
            selection=captured.get('selection');scope=(f'<p>Selected sitting {selection["selected"]["sitting"]}; skipped {selection["skipped_sittings"]} other sittings. Captured through {html.escape(selection["selected"]["end"] or "the last complete record")}. Later work in a live session is not part of this preview.</p>' if selection else '')
            return '<h1>Your private preview is ready</h1><p>The preview link carries the run fields, including recorded counts and your chosen project name. It does not carry the raw transcript, first prompt or source path. No run is saved online yet.</p>'+capture_note+scope+action+'<p>Review your run, add your story, then save with Only me. Sharing is a separate choice.</p>',200
        except plugin.ProjectNameConflict as exc:
            return '<h1>This folder already has a project name</h1><p>'+'This folder is already registered as '+html.escape(exc.project)+'. Continue with this name for the same session and sitting. Nothing was uploaded.</p><form method="post" action="/'+nonce+'"><input type="hidden" name="token" value="'+nonce+'"><input type="hidden" name="session" value="'+str(index)+'"><input type="hidden" name="sitting" value="'+str(sitting)+'"><input type="hidden" name="project" value="'+html.escape(exc.project,quote=True)+'"><button>Continue as '+html.escape(exc.project)+'</button></form><a class="back" href="/'+nonce+'">Back to sessions</a>',400
        except (ValueError,KeyError,IndexError,OSError) as exc:
            return '<h1>Could not prepare this session</h1><p>'+html.escape(str(exc))+'</p><a href="/'+nonce+'">Back to sessions</a>',400
    def select_sittings(index,name,progress):
        progress('finding')
        selected=rows[index];kind=selected['harness'];e=html.escape
        info=inspect_source(selected['source'],kind,progress=progress);groups=info['sittings']
        if not groups:raise ValueError('No recorded human sitting found in this session.')
        choices=''.join(f'<label class="pick"><input type="radio" name="sitting" value="{g["sitting"]}" required> <strong>Sitting {g["sitting"]}</strong><small>{e(local_time(g["start"]))} → {e(local_time(g["end"]))}</small><small>{g["typed"]} typed turns · {g["records"]} records</small><p>{e(clean_prompt(g["prompt"],kind) or "First prompt not captured")}</p></label>' for g in reversed(groups))
        return f'<h1>Choose the part you worked on</h1><p>A sitting starts with a human turn and splits after a recorded gap of 30 minutes. Times include their UTC offset. Only your choice becomes a preview.</p><form method="post" action="/{nonce}"><input type="hidden" name="token" value="{nonce}"><input type="hidden" name="session" value="{index}"><input type="hidden" name="project" value="{e(name,quote=True)}">{choices}<button>Prepare private preview</button></form>',200
    def start(index,name,sitting,phase='preview'):
        key=(index,name,sitting,phase)
        with jobs_lock:
            job=jobs.get(key)
            if job is None:
                job=jobs[key]={'route':'/'+nonce+'/job/'+secrets.token_urlsafe(18),'done':threading.Event(),'result':None,'began':datetime.now(timezone.utc),'stage':'finding','count':None,'unit':None,'phase':phase}
                def progress(stage,count=None,unit=None):
                    with jobs_lock:job.update(stage=stage,count=count,unit=unit)
                def run():
                    try:job['result']=select_sittings(index,name,progress) if phase=='sittings' else prepare(index,name,sitting,progress)
                    except Exception as exc:job['result']=('<h1>Could not prepare this session</h1><p>'+html.escape(type(exc).__name__+': '+str(exc))+'</p><a href="/'+nonce+'">Back to sessions</a>',500)
                    if job['result'][1]==200:print(('Session parts ready: ' if phase=='sittings' else 'Preview ready: ')+'http://127.0.0.1:'+str(server.server_port)+job['route'],flush=True)
                    else:
                        with jobs_lock:jobs.pop(key,None);failed[job['route']]=job
                    job['done'].set()
                threading.Thread(target=run,daemon=True).start()
        return job
    def waiting(job):
        with jobs_lock:state={k:job[k] for k in ('stage','count','unit','phase')}
        seconds=int((datetime.now(timezone.utc)-job['began']).total_seconds())
        stages=[('finding','Finding the session'),('reading','Reading turns')]
        if state['phase']=='preview':stages += [('counting','Counting tools'),('building','Building the preview')]
        active=[key for key,_ in stages].index(state['stage'])
        items=''.join('<li'+(' aria-current="step"' if i==active else '')+'>'+label+' · '+('Done' if i<active else 'In progress' if i==active else 'Waiting')+'</li>' for i,(_,label) in enumerate(stages))
        count=('<p>'+str(state['count'])+' '+html.escape(state['unit'])+'</p>') if state['count'] is not None else ''
        return '<meta http-equiv="refresh" content="2;url='+job['route']+'"><h1>Preparing your private preview</h1><div class="loader" role="status"><span class="spinner" aria-hidden="true"></span><ol>'+items+'</ol>'+count+'<p>'+str(seconds)+' seconds elapsed</p></div><p>Reading on this computer. Nothing is uploaded. This page updates every two seconds.</p><a href="'+job['route']+'">Check again</a>'
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args): pass
        def respond(self,body,status=200):
            # The browser may have gone (reload, second press, closed tab). The finished job stays cached.
            try:self._respond(body,status)
            except (BrokenPipeError,ConnectionResetError):pass
        def _respond(self,body,status=200):
            self.send_response(status);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Referrer-Policy','no-referrer');self.send_header('X-Frame-Options','DENY');self.send_header('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");self.end_headers();self.wfile.write(page(body).encode())
        def valid_host(self):return self.headers.get('Host')==f'127.0.0.1:{self.server.server_port}'
        def do_GET(self):
            if not self.valid_host():self.respond('This local picker link has expired.',404);return
            if self.path in downloads:
                self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Disposition','attachment; filename="run.strive.json"');self.end_headers();self.wfile.write(downloads[self.path]);return
            with jobs_lock:job=next((j for j in list(jobs.values())+list(failed.values()) if j['route']==self.path),None)
            if job:self.respond(*(job['result'] if job['done'].is_set() else (waiting(job),202)));return
            if self.path!='/'+nonce:self.respond('This local picker link has expired.',404);return
            e=html.escape
            cards=''.join(f'<label class="pick"><input type="radio" name="session" value="{i}" required> <strong>{e(r["project"] or "Project not recorded")}</strong><small>{e(local_time(r["started"]))} · {e(relative_time(r["started"]))} · {e(r["time_basis"])} · {e(r["harness"])}</small><p><small>Local first prompt · not shared</small>{e(r["prompt"])}</p></label>' for i,r in enumerate(rows))
            self.respond('<h1>Which session did you work on?</h1><p>These sessions are on this computer. First prompts stay in this local picker. If a session is still running, the preview captures complete records through a shown time; later work is not included.</p>'+(f'<form method="post"><input type="hidden" name="token" value="{nonce}"><input type="hidden" name="phase" value="sittings">{cards}<label>Project name for this run<input type="text" name="project" maxlength="80" placeholder="Your project" required></label><button>Choose a sitting</button></form>' if rows else '<article>No supported sessions found. Work in Claude Code, Codex or Cursor on this computer, or use the session-file fallback on Add run. Other agents: not yet supported.</article>'))
        def do_POST(self):
            expected=f'http://127.0.0.1:{self.server.server_port}'
            if not self.valid_host() or self.path!='/'+nonce or self.headers.get('Origin')!=expected:self.respond('Use the local picker to select a session.',403);return
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=4096:raise ValueError('Invalid selection')
                form=parse_qs(self.rfile.read(size).decode());index=int(form['session'][0])
                if form['token'][0]!=nonce or not 0<=index<len(rows):raise ValueError('Invalid selection')
                name=plugin.label(form['project'][0]);selected=rows[index];kind=selected['harness']
                phase=form.get('phase',['preview'])[0]
                if phase not in ('sittings','preview'):raise ValueError('Invalid selection phase')
                sitting=-1 if phase=='sittings' else int(form.get('sitting',['-1'])[0])
                job=start(index,name,sitting,phase)
                # Short sessions answer in this request; long ones get a page that waits.
                if job['done'].wait(3):self.respond(*job['result'])
                else:self.respond(waiting(job),202)
            except (ValueError,KeyError,IndexError,OSError) as exc:
                self.respond('<h1>Could not prepare this session</h1><p>'+html.escape(str(exc))+'</p><a href="/'+nonce+'">Back to sessions</a>',400)
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler);server.daemon_threads=True
    return server,f'http://127.0.0.1:{server.server_port}/{nonce}'


def main(harness, root=None, site='https://striverun.app', open_browser=False):
    server,url=make_server(harness,root,site)
    print('Local session picker: '+url+'\nNothing uploaded. Keep this terminal open; Ctrl+C closes the picker.',flush=True)
    if open_browser:webbrowser.open(url)
    # No persistent collector: stop after 30 minutes, or Ctrl+C.
    timer=threading.Timer(1800,server.shutdown);timer.daemon=True;timer.start()
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:timer.cancel();server.server_close()
    return 0
