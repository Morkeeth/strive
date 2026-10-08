"""Real browser/importer exercise; synthetic auth and photo service, no hosted writes."""
import base64, hashlib, importlib.util, json, shutil, tempfile, threading
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=Path.home()/'.local/state/strive-eric-20261008';OUT.mkdir(parents=True,exist_ok=True)
HOOK="""if(await StrivePhotoDraft.saveIfDraft({token:m[1],profileId:ME.id,client:sb,audience,isCurrent:current,button:publishButton,recover:$('i_recover'),status,buildRow:()=>StriveImportRow.build(run,{profileId:ME.id,title:$('i_title').value,project:editedProject(),caption,output,repo:safeRepoUrl(($('i_repo')?.value||'').trim())}),onSaved:async({runId,visibility})=>{try{localStorage.setItem('ag_onboard_done','1');sessionStorage.removeItem('ag_import');sessionStorage.removeItem(draftKey)}catch(_){}history.replaceState(null,'','/?run='+runId);fairConfirmRun(runId);status(visibility==='private'?'Run and images saved for Only me.':'Run and images saved for '+audienceLabel(visibility)+'.');await viewRun(runId)}}))return;"""

def main():
 with tempfile.TemporaryDirectory(prefix='strive-photo-draft-test-') as temp:
  site=Path(temp)/'site';shutil.copytree(ROOT/'site',site)
  html=(site/'index.html').read_text()
  if 'src="/post-flow.js"' not in html:html=html.replace('<script src="/dropin.js"></script>','<script src="/dropin.js"></script><script src="/post-flow.js"></script>')
  if 'src="/photo-draft.js"' not in html:html=html.replace('<script src="/post-flow.js"></script>','<script src="/photo-draft.js"></script><script src="/post-flow.js"></script>')
  options="window.StrivePostFlow?.mountImport(app,{token:m[1],profileId:ME?.id||null,eligible:!!run.measurement_revision&&!sample&&run.trace_basis!=='typed-by-author',isCurrent:current});"
  if 'mountImport(app)' in html:html=html.replace('window.StrivePostFlow?.mountImport(app);',options)
  elif 'mountImport(app,' not in html:html=html.replace("  paintImportPreview();\n  $('i_pub').addEventListener","  paintImportPreview();\n  "+options+"\n  $('i_pub').addEventListener")
  if 'StrivePhotoDraft.saveIfDraft' not in html:html=html.replace('    const saveLabel=publishButton.textContent;','    '+HOOK+'\n    const saveLabel=publishButton.textContent;',1)
  (site/'index.html').write_text(html.replace('__BRAND__','STRIVE').replace('__TAGLINE__','Build in good company').replace('__ORIGIN__','http://localhost'))
  spec=importlib.util.spec_from_file_location('fixture',ROOT/'scripts/check-nav-app-fixtures.py');f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
  mock=f.build_mock().replace('const tables = {','const tables = window.fixtureTables = {')
  mock=mock.replace('    function matchJoin(row, select) {',"    tables.runs=JSON.parse(localStorage.getItem('fixtureRuns')||'null')||tables.runs; window.fixtureEvents=[];\n    function matchJoin(row, select) {")
  mock=mock.replace('session: {','session: { access_token:window.fixtureExpired?null:"fixture-token",')
  mock=mock.replace('id: "auth-fixture-owner", user_metadata:', 'id: window.fixtureAuthId||"auth-fixture-owner", user_metadata:')
  mock=mock.replace('            tables[name] = rows;',"""            tables[name] = rows;
            if(name==='runs'){localStorage.setItem('fixtureRuns',JSON.stringify(rows));window.fixtureEvents.push({verb,visibility:payload.visibility||null});if((verb==='insert'&&window.fixtureFault==='insert-response')||(verb==='update'&&payload.visibility&&window.fixtureFault==='audience-response')){window.fixtureFault='';return Promise.reject(new Error('Failed to fetch')).then(resolve,reject)}}""")
  class Handler(SimpleHTTPRequestHandler):
   def __init__(self,*a,**k):super().__init__(*a,directory=str(site),**k)
   def log_message(self,*a):pass
  server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();origin=f'http://127.0.0.1:{server.server_port}'
  results=[]
  with sync_playwright() as p:
   browser=p.chromium.launch()
   for case in ['no-photo','normal','insert-response','photo-response','role-failure','audience-response','account-change','existing-session','auth-expiry']:
    ctx=browser.new_context(viewport={'width':390,'height':900});ctx.add_init_script(mock)
    if case=='auth-expiry':ctx.add_init_script("const originalFetch=window.fetch;window.fetch=async(...args)=>{const response=await originalFetch(...args);if(String(args[0]).includes('/api/run-photos')&&args[1]?.method==='POST'&&!localStorage.getItem('auth-expiry-fired')){localStorage.setItem('auth-expiry-fired','1');window.fixtureExpired=true}return response}")
    photos={};calls=[];fault={'name':case};errors=[]
    def route(r):
     if r.request.url.startswith(origin+'/api/run-photos'):
      method=r.request.method;body=r.request.post_data_json if method in ['POST','PATCH'] else {};calls.append({'method':method,'role':body.get('role'),'run_id':body.get('run_id')})
      if method=='POST':
       digest=hashlib.sha256(base64.b64decode(body['image_base64'])).hexdigest();photo=next((i for i in photos.values() if i['digest']==digest and i['run_id']==body['run_id']),None);duplicate=photo is not None
       if not photo:photo={'id':'30000000-0000-0000-0000-'+str(len(photos)+1).zfill(12),'run_id':body['run_id'],'role':'photo','is_cover':False,'digest':digest,'width':60,'height':40};photos[photo['id']]=photo
       if fault['name']=='photo-response':fault['name']='';r.abort('failed');return
       r.fulfill(status=200,content_type='application/json',body=json.dumps({'photo':photo,'duplicate':duplicate}));return
      if method=='PATCH':
       if fault['name']=='role-failure' and body.get('role'):fault['name']='';r.fulfill(status=503,content_type='application/json',body=json.dumps({'error':'Injected role failure'}));return
       photo=photos[body['photo_id']]
       if body.get('role'):photo['role']=body['role']
       else:
        for image in photos.values():image['is_cover']=image['id']==photo['id']
       r.fulfill(status=200,content_type='application/json',body='{}');return
      r.fulfill(status=200,content_type='application/json',body=json.dumps({'photos':list(photos.values())}));return
     if r.request.url.startswith(origin):r.continue_()
     else:r.fulfill(status=200,body='')
    ctx.route('**/*',route);page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    revision=hashlib.sha256(case.encode()).hexdigest();payload={'schema_version':1,'harness':'Cursor','project':'TEST DATA','turns_typed':3,'tool_calls':4,'measurement_revision':revision,'started':'2026-10-08T19:00:00Z'};token=base64.b64encode(json.dumps(payload).encode()).decode();url=origin+'/#import='+token
    page.goto(url);page.locator('.post-composer').wait_for();page.get_by_role('button',name='Add your story',exact=True).click();page.locator('#i_caption').fill('Local image draft test')
    def png(color):
     return base64.b64decode(page.evaluate("color=>{const c=document.createElement('canvas');c.width=60;c.height=40;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,60,40);return c.toDataURL('image/png').split(',')[1]}",color))
    if case!='no-photo':
     page.locator('[data-draft-personal]').set_input_files({'name':'personal.png','mimeType':'image/png','buffer':png('#b66138')});page.locator('.post-photo-grid figure').wait_for();assert page.locator('[data-draft-personal]').is_disabled();assert not page.locator('[data-draft-cover]').is_checked()
     page.locator('[data-draft-cover]').check();page.wait_for_function("document.querySelector('[data-draft-cover]').checked")
     page.locator('[data-draft-support]').set_input_files({'name':'result.png','mimeType':'image/png','buffer':png('#2367ce')});page.wait_for_function("document.querySelectorAll('.post-photo-grid figure').length===2")
     assert len(page.evaluate('fixtureTables.runs'))==3 and not calls
     page.reload();page.locator('.post-photo-grid figure').first.wait_for();assert page.locator('.post-photo-grid figure').count()==2;assert page.locator('[data-draft-cover]').first.is_checked()
     if case=='normal':page.screenshot(path=str(OUT/'post-photo-story-390.png'),full_page=True)
    page.get_by_role('button',name='Choose audience',exact=True).click();assert page.locator('#i_vis').input_value()=='private'
    if case!='no-photo':page.locator('#i_vis').select_option('public')
    if case=='existing-session':page.evaluate("revision=>{fixtureTables.runs.push({id:'20000000-0000-0000-0000-000000000098',profile_id:'10000000-0000-0000-0000-000000000001',visibility:'private',measurement_revision:revision});localStorage.setItem('fixtureRuns',JSON.stringify(fixtureTables.runs))}",revision)
    if case=='account-change':
     message=page.evaluate("async token=>{try{await StrivePhotoDraft.save({token,profileId:'another-profile',client:null,buildRow:()=>({}),isCurrent:()=>true});return 'wrong'}catch(e){return e.message}}",token);assert 'different signed-in account' in message;assert len(page.evaluate('fixtureTables.runs'))==3 and not calls;results.append({'case':case,'passed':True,'network_mutations':0});ctx.close();continue
    if case in ['insert-response','audience-response']:page.evaluate('fault=>window.fixtureFault=fault',case)
    page.locator('#i_pub').click()
    if case in ['insert-response','photo-response','role-failure','audience-response','existing-session','auth-expiry']:
     page.locator('[data-photo-retry]').wait_for();runs=page.evaluate('fixtureTables.runs');assert len(runs)==4,runs
     expected='public' if case=='audience-response' else 'private';assert runs[-1]['visibility']==expected
     if case=='existing-session':assert not calls;results.append({'case':case,'passed':True,'attached_to_existing':False});ctx.close();continue
     before_id=runs[-1]['id'];writes_before=sum(c['method']!='GET' for c in calls);page.reload();page.locator('#i_pub').wait_for();assert sum(c['method']!='GET' for c in calls)==writes_before;assert page.evaluate('fixtureTables.runs.at(-1).visibility')==expected;page.locator('#i_pub').click();page.wait_for_url('**/?run=*');assert len(page.evaluate('fixtureTables.runs'))==4;assert page.evaluate('fixtureTables.runs.at(-1).id')==before_id
    else:page.wait_for_url('**/?run=*')
    saved=page.evaluate('fixtureTables.runs.at(-1)');assert saved['visibility']==('private' if case=='no-photo' else 'public')
    assert len(photos)==(0 if case=='no-photo' else 2),photos
    if photos:
     assert sum(i['role']=='personal' for i in photos.values())==1;assert sum(i['is_cover'] for i in photos.values())==1;assert next(i for i in photos.values() if i['is_cover'])['role']=='personal'
    assert not errors,errors
    results.append({'case':case,'passed':True,'saved_runs':1,'saved_images':len(photos),'api_calls':len(calls),'final_visibility':saved['visibility']});ctx.close()
   browser.close()
  server.shutdown();(OUT/'post-photo-draft-tests.json').write_text(json.dumps(results,indent=2));print(json.dumps(results,indent=2))
if __name__=='__main__':main()
