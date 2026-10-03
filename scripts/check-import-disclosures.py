"""Built-page disclosure geometry and sync opt-in with synthetic auth only."""
import importlib.util,threading,json
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright
spec=importlib.util.spec_from_file_location('fixture',Path(__file__).with_name('check-nav-app-fixtures.py'));f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**k):super().__init__(*a,directory=str(f.ROOT/'dist'),**k)
 def log_message(self,*a):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();origin=f'http://127.0.0.1:{server.server_port}'
mock=f.build_mock().replace('async function rpc(name, payload) {','async function rpc(name, payload) { if(name==="agent_token_create"){window.fixtureTokenCalls=(window.fixtureTokenCalls||0)+1;return {data:{token:"fixture-secret-only"},error:null}}')
out=Path.home()/'.local/state/day-run/2026-10-03/gm-reconcile/strive-import-disclosures';out.mkdir(parents=True,exist_ok=True);checks=[]
with sync_playwright() as p:
 browser=p.chromium.launch();ctx=browser.new_context();ctx.add_init_script(mock);ctx.add_init_script('Object.defineProperty(navigator,"clipboard",{value:{writeText:async text=>window.fixtureCopied=text}})');ctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith(origin) else r.fulfill(status=200,body=''));page=ctx.new_page()
 for width in [390,1280]:
  page.set_viewport_size({'width':width,'height':900});page.goto(origin+'/?post');page.locator('.advanced-connect').wait_for()
  summary=page.locator('.capture-terminal>summary,.capture-sync>summary,.advanced-connect>summary')
  styles=summary.evaluate_all('(nodes)=>nodes.map(n=>({padding:getComputedStyle(n).padding,height:n.getBoundingClientRect().height}))')
  assert len({x['padding'] for x in styles})==1,styles
  assert all(x['height']>=48 for x in styles),styles
  assert 'capture → preview → share' not in page.locator('#app').inner_text()
  assert page.evaluate('window.fixtureTokenCalls||0')==0
  page.locator('.capture-sync>summary').click();assert page.evaluate('window.fixtureTokenCalls||0')==0
  await_text=page.locator('#auto-sync').inner_text();assert await_text.count('7 days')==1 and await_text.count('15 minutes')==1
  page.get_by_role('button',name='Prepare automatic sync',exact=True).click();page.locator('[data-copy-sync]').wait_for();assert page.evaluate('window.fixtureTokenCalls')==1
  assert 'fixture-secret-only' not in page.locator('#auto-sync').inner_text()
  page.locator('[data-copy-sync]').click();assert 'fixture-secret-only' in page.evaluate('window.fixtureCopied')
  page.locator('.sync-command>summary').click();assert 'fixture-secret-only' in page.locator('.sync-command').inner_text();page.locator('.sync-command>summary').click()
  assert 'fixture-secret-only' not in page.locator('#auto-sync').inner_text()
  page.locator('.capture-sync>summary').click()
  gap=page.locator('.site-foot').bounding_box()['y']-(page.locator('.advanced-connect').bounding_box()['y']+page.locator('.advanced-connect').bounding_box()['height']);assert gap<=48,gap
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.evaluate('()=>{const d=document.createElement("div");d.textContent="LOCAL UI FIXTURE · no real token";d.style="background:#fff3bb;padding:8px";document.body.prepend(d)}');page.screenshot(path=str(out/f'collapsed-{width}.png'),full_page=True)
  page.locator('.capture-sync>summary').click();page.screenshot(path=str(out/f'sync-{width}.png'),full_page=True)
  checks.append({'width':width,'summary_styles':styles,'footer_gap':gap,'token_requires_explicit_prepare':True,'command_hidden_until_reveal':True})
 browser.close()
server.shutdown();(out/'RESULT.json').write_text(json.dumps(checks,indent=2));print('Built mobile/desktop disclosures, bounded footer gap, explicit sync creation and hidden credential copy/reveal passed')
