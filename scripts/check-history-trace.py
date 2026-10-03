"""Local synthetic ridge-only history and photo-plus-map rendering."""
import importlib.util,threading
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright
spec=importlib.util.spec_from_file_location('fixture',Path(__file__).with_name('check-nav-app-fixtures.py'));f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**k):super().__init__(*a,directory=str(f.ROOT/'dist'),**k)
 def log_message(self,*a):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();origin=f'http://127.0.0.1:{server.server_port}'
mock=f.build_mock().replace('rhythm: [3, 1, 2, 1],','rhythm: null, ridge: Array.from({length:40},(_,i)=>i%5), ridge_basis:"turn-order",trace_basis:"observed native events; timestamps unavailable",harness:"Grok Bot",prompts:null,artifacts_produced:null,tool_calls:80,')
out=Path.home()/'.local/state/day-run/2026-10-03/gm-reconcile/strive-history-trace';out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch();ctx=browser.new_context();ctx.add_init_script(mock);ctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith(origin) else r.fulfill(status=200,body=''));page=ctx.new_page()
 for width in [390,1280]:
  page.set_viewport_size({'width':width,'height':900});page.goto(origin+'/?mine');first=page.locator('.history-run').first;first.locator('svg').wait_for();assert 'observed message order' in first.inner_text().lower();assert 'minimum' in first.inner_text();assert 'Trace unavailable' not in first.inner_text()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.screenshot(path=str(out/f'history-{width}.png'),full_page=True)
 # Exercise actual photo loader against a rendered card; all responses synthetic local blobs.
 page.evaluate('''async()=>{const r={id:'fixture-public',title:'LOCAL FIXTURE observed activity',ridge:Array.from({length:40},(_,i)=>i%5),trace_basis:'observed native events; timestamps unavailable',harness:'Grok Bot',tool_calls:80};const code={...r,id:'fixture-code',hero_visual:'change_atlas',code_route:{v:1,projects:[{id:'p',label:'Fixture project'}],stops:[{project:'p'},{project:'p'}]}};document.querySelector('#app').innerHTML=GrinderFeed.card(r)+GrinderFeed.card(code);window.fetch=async url=>String(url).includes('&')?new Response(new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="blue"/></svg>'],{type:'image/svg+xml'})):new Response(JSON.stringify({photos:[{url:'/api/run-photos?id=fixture&run_id=fixture-public'}]}));await StriveRunPhotos.mountCovers({root:document.querySelector('#app'),client:null});}''')
 assert page.locator('.run-photo-cover').count()==2
 assert page.locator('.fc-atlas svg').count()==1
 assert page.locator('.fc-spark svg').count()==1
 assert 'lower bound' in page.locator('#app').inner_text()
 page.screenshot(path=str(out/'public-photo-map.png'),full_page=True)
 browser.close()
server.shutdown();print('Local history ridge and photo-plus-map rendering passed at mobile/desktop sizes')
