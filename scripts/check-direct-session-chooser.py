"""Real Chromium filechooser and import route with local auth fixtures only."""
import importlib.util,json,threading,base64,hashlib
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright
spec=importlib.util.spec_from_file_location('fixture',Path(__file__).with_name('check-nav-app-fixtures.py'));f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(f.ROOT/'site'),**kw)
 def log_message(self,*a):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();origin=f'http://127.0.0.1:{server.server_port}'
source='\n'.join(json.dumps(r) for r in [{'role':'user','message':{'content':'<timestamp>2026-10-03T08:00:00Z</timestamp><user_query>Local fixture only</user_query>'}},{'role':'assistant','message':{'content':[{'type':'tool_use','name':'Shell','input':{'command':'echo fixture'}}]}}]).encode()
with sync_playwright() as p:
 browser=p.chromium.launch();context=browser.new_context(viewport={'width':390,'height':844});context.add_init_script(f.build_mock());context.route('**/*',lambda r:r.continue_() if r.request.url.startswith(origin) else r.fulfill(status=200,body=''));page=context.new_page()
 for route in ['post','connect']:
  page.goto(origin+'/?'+route);page.get_by_text('Choose a session file',exact=True).wait_for()
  with page.expect_file_chooser(timeout=2000) as chosen:page.get_by_text('Choose a session file',exact=True).click()
  chosen.value.set_files({'name':'photo.jpg','mimeType':'image/jpeg','buffer':b'not a run'})
  assert 'Add photos after saving' in page.locator('#drop-error').inner_text();assert page.locator('#drop-error').is_visible()
  for name,content in [('empty.jsonl',b''),('broken.jsonl',b'not a session')]:
   with page.expect_file_chooser(timeout=2000) as chosen:page.get_by_text('Choose a session file',exact=True).click()
   chosen.value.set_files({'name':name,'mimeType':'application/json','buffer':content});page.wait_for_timeout(80);assert page.locator('#drop-error').is_visible();assert '#import=' not in page.url
  with page.expect_file_chooser(timeout=2000) as chosen:page.get_by_text('Choose a session file',exact=True).click()
  chosen.value.set_files({'name':'session.jsonl','mimeType':'application/json','buffer':source});page.locator('#i_pub').wait_for();assert page.locator('#i_vis').input_value()=='private';assert 'Add photos' in page.locator('#app').inner_text()
  token=page.url.split('#import=')[1];from urllib.parse import unquote
  metrics=json.loads(base64.b64decode(unquote(token)));assert metrics['schema_version']==1;assert metrics['tool_calls']==1;assert metrics['turns_typed']==1;assert metrics['trace_basis']=='position';assert metrics['measurement_revision']==hashlib.sha256(b'strive-browser-file-v1\0'+source).hexdigest();assert metrics.get('commits') is None;assert metrics.get('duration_s') is None
  Path('/tmp/strive-browser-file-payload.json').write_text(json.dumps(metrics))
 context.route('**/api/run-photos**',lambda r:r.fulfill(json={'photos':[]}))
 out=Path.home()/'.local/state/day-run/2026-10-03/gm-reconcile/strive-chooser-edit-rehearsal';out.mkdir(parents=True,exist_ok=True)
 for width in [390,1280]:
  page.set_viewport_size({'width':width,'height':900});page.goto(origin+'/?run='+f.RUN_A);page.locator('#run-edit').wait_for()
  assert page.locator('#run-editor-photos #run-photos').count()==1
  panel=page.locator('#run-edit').bounding_box();field=page.locator('#run-title').bounding_box();assert field['x']-panel['x']>=18
  assert page.locator('#run-audience').input_value()=='private'
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.locator('#run-edit').screenshot(path=str(out/f'editor-{width}.png'))
 browser.close()
server.shutdown();print('Direct chooser on Add and Connect; image/empty/malformed denied; parsed source becomes private measured preview')
