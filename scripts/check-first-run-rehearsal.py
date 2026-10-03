"""Offline rehearsal of actual app UI. Use STRIVE_REHEARSAL_PHOTO for a supplied local image.
No hosted request is allowed. Fixture backend is in-memory; images never leave loopback.
"""
import base64, importlib.util,json,os,threading
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright
spec=importlib.util.spec_from_file_location('fixture',Path(__file__).with_name('check-nav-app-fixtures.py'));f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
root=Path(os.environ.get('STRIVE_REHEARSAL_ROOT',str(f.ROOT)))
out=Path(os.environ.get('STRIVE_REHEARSAL_OUT',str(Path.home()/'.local/state/day-run/2026-10-03/gm-reconcile/strive-first-run-rehearsal')));out.mkdir(parents=True,exist_ok=True)
photo=Path(os.environ['STRIVE_REHEARSAL_PHOTO']);assert photo.is_file()
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(root/'dist'),**kw)
 def log_message(self,*a):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}'
mock=f.build_mock().replace('user: {id: "auth-fixture-owner"','access_token:"fixture-only-token",user: {id: "auth-fixture-owner"').replace('limit(n) {','or(){return q;}, limit(n) {').replace('function from(name) {','if(!sessionStorage.getItem("fixture-onboarded"))tables.profiles=[]; function from(name) {').replace('tables[name] = rows;','tables[name] = rows; if(name==="profiles")sessionStorage.setItem("fixture-onboarded","yes");')
images=[];checks=[];errors=[];saved_photo=None
with sync_playwright() as p:
 b=p.chromium.launch();c=b.new_context(viewport={'width':390,'height':844},record_video_dir=str(out/'video'),record_video_size={'width':390,'height':844});c.add_init_script(mock)
 c.add_init_script('Object.defineProperty(navigator,"clipboard",{value:{writeText:async text=>{window.fixtureCopied=text}}});document.addEventListener("DOMContentLoaded",()=>{const d=document.createElement("div");d.textContent="LOCAL REHEARSAL · fixture account and data";d.style="position:sticky;top:0;z-index:9999;background:#fff3bb;padding:8px;font:12px system-ui";document.body.prepend(d)})')
 def route(r):
  global saved_photo
  u=r.request.url
  if not u.startswith(base):r.fulfill(status=200,body='',content_type='application/javascript');return
  if '/api/run-photos' in u:
   if r.request.method=='POST':saved_photo=base64.b64decode(r.request.post_data_json['image_base64']);r.fulfill(json={'ok':True});return
   if 'id=fixture-photo' in u:r.fulfill(body=saved_photo,content_type='image/jpeg');return
   r.fulfill(json={'photos':[{'url':f'/api/run-photos?id=fixture-photo&run_id={f.RUN_A}'}] if saved_photo else []});return
  if '/api/' in u:r.fulfill(status=200,json={});return
  r.continue_()
 c.route('**/*',route);page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 def snap(name):
  page.wait_for_timeout(250);path=out/(name+'.png');page.screenshot(path=str(path),full_page=True);images.append(str(path))
 page.goto(base+'/?connect');page.locator('#identity-form').wait_for();snap('01-name-and-handle')
 page.locator('[name=display_name]').fill('Rehearsal Builder');page.locator('[name=handle]').fill('rehearsal-builder');snap('02-identity-preview');page.locator('#identity-submit').click();page.locator('.capture-welcome').wait_for();snap('03-connect')
 page.get_by_role('button',name='Copy link for your agent').click();assert '/agents.md' in page.evaluate('window.fixtureCopied');page.wait_for_timeout(1700);assert page.get_by_role('button',name='Copy link for your agent').is_visible();checks.append('Actual onboarding form submits to local fixture profile; copy label resets accessibly')
 page.goto(base+'/?run='+f.RUN_A);page.locator('[data-photo-file]').wait_for();snap('04-private-run-before-photo')
 page.locator('[data-photo-file]').set_input_files(str(photo));page.locator('[data-photo-upload]:enabled').wait_for();page.locator('[data-photo-editor]').scroll_into_view_if_needed();snap('05-supplied-photo-preview')
 page.locator('[data-photo-shape]').select_option('square');snap('06-square-crop');page.locator('[data-photo-upload]').click();page.locator('.run-photo-grid img').wait_for();assert saved_photo;page.locator('.run-photo-grid').scroll_into_view_if_needed();snap('07-photo-visible-local-only');checks.append('Supplied photo selected, square cropped, added through actual UI to intercepted loopback-only fixture and rendered')
 page.locator('#run-title').fill('Rehearsal: a session worth remembering');page.locator('#run-caption').fill('Local interface rehearsal with a supplied photo. This is not a real published run.');page.locator('#run-edit').scroll_into_view_if_needed();snap('08-description-and-private-audience');assert page.locator('#run-audience').input_value()=='private';checks.append('Description editor and private audience inspected; no publish action')
 c.close();b.close()
server.shutdown();(out/'REVIEW.json').write_text(json.dumps({'basis':'Offline UI rehearsal, fixture account and pre-existing fixture run. Not real session acquisition, hosted persistence, public sharing, or Eric acceptance. All external requests blocked. Photo bytes intercepted locally only.','checks':checks,'page_errors':errors,'images':images},indent=2));assert not errors,errors;print(str(out))
