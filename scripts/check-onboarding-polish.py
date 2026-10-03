"""Local browser UI fixtures. No hosted data or external requests."""
import importlib.util, json, threading
from pathlib import Path
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright
spec=importlib.util.spec_from_file_location('fixture',Path(__file__).with_name('check-nav-app-fixtures.py'))
f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
out=Path.home()/'.local/state/day-run/2026-10-03/gm-reconcile/strive-ui-polish';out.mkdir(parents=True,exist_ok=True)
class Handler(f.Handler):
 def __init__(self,*args,**kwargs):
  from http.server import SimpleHTTPRequestHandler
  SimpleHTTPRequestHandler.__init__(self,*args,directory=str(f.ROOT/'dist'),**kwargs)
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}'
mock=f.build_mock().replace('user: {id: "auth-fixture-owner"','access_token: "fixture-only-token", user: {id: "auth-fixture-owner"')
mock=mock.replace('limit(n) {', 'or(){return q;}, limit(n) {')
mock=mock.replace('let rows = tables[name] || [];','let rows = tables[name] || []; if(name === "alpha_feedback" && verb === "insert"){window.fixtureInserts=(window.fixtureInserts||0)+1;if(window.fixtureFail)return Promise.resolve({error:{message:"fixture failure"}}).then(resolve,reject);}')
errors=[];checks=[];wakes=[]
with sync_playwright() as p:
 b=p.chromium.launch();c=b.new_context();c.add_init_script(mock);c.add_init_script('Object.defineProperty(navigator,"clipboard",{value:{writeText:async text=>{window.fixtureCopied=text}}})')
 def route(r):
  if r.request.url.startswith(base):
   if '/api/feedback-notifications' in r.request.url:wakes.append(r.request.method);r.fulfill(status=503,body='fixture notification unavailable')
   else:r.continue_()
  else:r.fulfill(status=200,body='',content_type='application/javascript')
 c.route('**/*',route);page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 for width in (390,1280):
  page.set_viewport_size({'width':width,'height':900})
  for name in ('connect','boards','feedback'):
   page.goto(base+'/?'+name);page.wait_for_timeout(300)
   page.evaluate('''()=>{const e=document.createElement('div');e.textContent='UI TEST FIXTURE · local controlled account and data';e.style='padding:8px;background:#fff3bb';document.body.prepend(e)}''')
   assert page.locator('#app').inner_text().strip(),name
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(name,width,'overflow')
   if name=='connect':
    page.get_by_role('button',name='Copy link for your agent').click();assert '/agents.md' in page.evaluate('window.fixtureCopied');assert page.get_by_text('Copied ✓',exact=True).count()
    assert page.locator('.capture-welcome').is_visible()
   if name=='boards':assert page.get_by_role('heading',name='Leaderboard',exact=True).is_visible();assert 'Honest failure' not in page.locator('#app').inner_text()
   if name=='feedback':
    page.locator('#feedback-message').fill('UI fixture feedback');page.locator('#feedback-send').click();page.wait_for_timeout(100);assert page.locator('#feedback-state').inner_text()=='Feedback saved. Thank you.';assert page.locator('#feedback-message').input_value()==''
    page.evaluate('window.fixtureFail=true');page.locator('#feedback-message').fill('Keep this fixture draft');before=len(wakes);page.locator('#feedback-send').click();page.wait_for_timeout(100);assert page.locator('#feedback-message').input_value()=='Keep this fixture draft';assert 'still here' in page.locator('#feedback-state').inner_text();assert len(wakes)==before
   page.screenshot(path=str(out/f'{name}-{width}.png'),full_page=True);checks.append(f'{name} {width}: rendered without overflow and route actions passed')
 page.emulate_media(reduced_motion='reduce');page.goto(base+'/?connect');page.wait_for_timeout(100);assert page.locator('.capture-welcome').evaluate('(e)=>getComputedStyle(e).animationName')=='none';checks.append('reduced motion disables welcome animation')
 assert not errors,errors
 b.close()
server.shutdown();(out/'RESULT.json').write_text(json.dumps({'checks':checks,'page_errors':errors,'notification_wakes':wakes,'basis':'Local complete-profile fixtures, no hosted users or uploads'},indent=2));print(json.dumps(checks))
