"""Explicit local session selection. Prompts stay in the loopback picker, never uploads."""
from __future__ import annotations
import base64, gzip, html, json, secrets, threading, webbrowser
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


def text(value):
    if isinstance(value, str): return value
    if isinstance(value, list): return ' '.join(text(v.get('text','')) for v in value if isinstance(v,dict))
    return ''


def discover(harness, limit=30, candidates=None):
    from .capture import sources
    from .plugin import source_identity, MAX_SOURCE
    paths=[p for h,p in (sources() if candidates is None else candidates) if h==harness]
    found=[]
    for path in sorted(paths,key=lambda p:p.stat().st_mtime,reverse=True)[:200]:
        try:
            if path.stat().st_size>MAX_SOURCE: continue
            with path.open('rb') as f: head=f.read(256*1024)
            rows=[]
            for line in head.splitlines():
                try: row=json.loads(line)
                except (ValueError,UnicodeDecodeError): continue
                if isinstance(row,dict): rows.append(row)
            sid=source_identity(rows,harness,path)
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
                    first=' '.join(content.split())[:180]
            project=Path(cwd).name if isinstance(cwd,str) and cwd else ''
            found.append(dict(source=str(path),session=sid,project=project,started=at or datetime.fromtimestamp(path.stat().st_mtime,timezone.utc).isoformat(),time_basis='recorded' if at else 'file modified',prompt=first or 'First prompt not available in the session header'))
            if len(found)>=limit: break
        except (OSError,ValueError,TypeError): continue
    return found


STYLE='''body{font:16px system-ui;color:#17202d;background:#f5f7fa;margin:0}main{max-width:820px;margin:40px auto;padding:24px}h1{font-size:30px}a{color:#0047ff}.brand{color:#0047ff;font-weight:800}.steps{display:flex;gap:20px;padding:0;list-style:none;color:#667}article,label.pick{display:block;border:1px solid #d8deea;background:white;border-radius:10px;padding:16px;margin:12px 0}label.pick:has(input:checked){border:2px solid #0047ff}small{display:block;color:#667;margin:5px 0}p{line-height:1.5}input[type=text],select{box-sizing:border-box;font:inherit;width:100%;padding:12px;border:1px solid #b9c4d7;border-radius:6px;margin:8px 0}button,.primary{display:inline-block;background:#0047ff;color:white;border:0;border-radius:8px;padding:14px 20px;font:600 16px system-ui;text-decoration:none}.actions{position:sticky;bottom:0;background:#f5f7fa;padding:12px 0}code{overflow-wrap:anywhere}@media(max-width:600px){main{margin:0;padding:18px}.steps{font-size:13px;gap:10px}h1{font-size:26px}}'''

def page(body):
    return '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="same-origin"><title>STRIVE · Pick a session</title><style>'+STYLE+'</style><main><div class="brand">STRIVE</div><ol class="steps"><li>1 Choose your agent</li><li>2 Pick a session</li><li>3 Private preview</li></ol>'+body+'</main>'


def make_server(harness, root, site, candidates=None):
    from . import plugin
    site=plugin.origin(site);root=plugin.root_path(root)
    rows=discover(harness,candidates=candidates);nonce=secrets.token_urlsafe(24)
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args): pass
        def respond(self,body,status=200):
            self.send_response(status);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Referrer-Policy','same-origin');self.send_header('X-Frame-Options','DENY');self.send_header('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");self.end_headers();self.wfile.write(page(body).encode())
        def valid_host(self):return self.headers.get('Host')==f'127.0.0.1:{self.server.server_port}'
        def do_GET(self):
            if not self.valid_host() or self.path!='/'+nonce:self.respond('This local picker link has expired.',404);return
            e=html.escape
            cards=''.join(f'<label class="pick"><input type="radio" name="session" value="{i}" required> <strong>{e(r["project"] or "Project not recorded")}</strong><small>{e(r["started"])} · {e(r["time_basis"])} · {e(harness)}</small><p>{e(r["prompt"])}</p></label>' for i,r in enumerate(rows))
            self.respond('<h1>Which session did you work on?</h1><p>These recent sessions are on this computer. Prompts stay here and are never included in the preview upload.</p>'+(f'<form method="post"><input type="hidden" name="token" value="{nonce}">{cards}<label>Project name for this run<input type="text" name="project" maxlength="80" placeholder="Your project" required></label><label>Capture<select name="sitting"><option value="-1">Latest sitting in the selected session</option></select></label><p><small>A sitting is a continuous part of the session. The preview names its captured time window. Nothing is saved online.</small></p><div class="actions"><button>Prepare private preview</button></div></form>' if rows else '<article>No supported sessions found. Open your agent on this computer and work on a project, or use the session-file fallback on Add run.</article>'))
        def do_POST(self):
            expected=f'http://127.0.0.1:{self.server.server_port}'
            if not self.valid_host() or self.path!='/'+nonce or self.headers.get('Origin')!=expected:self.respond('Use the local picker to select a session.',403);return
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=4096:raise ValueError('Invalid selection')
                form=parse_qs(self.rfile.read(size).decode());index=int(form['session'][0])
                if form['token'][0]!=nonce or not 0<=index<len(rows):raise ValueError('Invalid selection')
                name=plugin.label(form['project'][0]);selected=rows[index]
                # Registration is local only. Exact source validation remains in capture().
                with plugin.connect(root) as db:
                    with db: db.execute('insert or ignore into projects values(?,?,0)',(name,str(Path(selected['source']).parent)))
                    captured=plugin.capture(db,root,name,harness,selected['source'])
                    plugin.review(db,root,[captured['draft']],site)
                # Use the single-run preview route: it renders before sign-in and keeps the
                # canonical measured payload intact (including source reference and estimates).
                packed=base64.urlsafe_b64encode(gzip.compress(plugin.encoded(captured['payload']).encode(),mtime=0)).decode().rstrip('=')
                preview_url=site+'/#import=gz.'+packed
                self.respond('<h1>Your private preview is ready</h1><p>Only the measured facts from the selected sitting travel to STRIVE. Your first prompt and source file stay on this computer.</p><a class="primary" href="'+html.escape(preview_url,quote=True)+'">Open private preview</a><p>Review your run, add your story, then save with Only me. Sharing is a separate choice.</p>')
            except (ValueError,KeyError,IndexError,OSError) as exc:
                self.respond('<h1>Could not prepare this session</h1><p>'+html.escape(str(exc))+'</p><a href="/'+nonce+'">Back to sessions</a>',400)
    server=HTTPServer(('127.0.0.1',0),Handler)
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
