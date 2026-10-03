import json,threading
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
out=Path(__import__('os').environ.get('STRIVE_NAV_PROOF','/tmp/strive-nav-proof'));out.mkdir(parents=True,exist_ok=True)
server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(root/'site')))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
 for width in [390,1440]:
  ctx=browser.new_context(viewport={'width':width,'height':900})
  ctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith(base+'/') else r.abort())
  page=ctx.new_page();page.goto(base,wait_until='networkidle')
  page.evaluate('''()=>{window.testDB=new Proxy({}, {get:(t,k)=>k==='then'?(resolve)=>setTimeout(()=>resolve({data:[],error:null,count:0}),80):()=>testDB});window.navDeps={client:testDB,me:()=>null,app:()=>$('app'),frame,railHtml,feedTabs,setPrimarySection,status,social:{},renderRuns:async()=>''};window.testPeople=GrinderPeople(navDeps);window.testSocial=GrinderSocial(navDeps);$('account-menu').hidden=false;$('auth').hidden=true;}''')
  explore=(root/'site/index.html').read_text().split('async function viewExplore(){',1)[1].split('\nasync function ',1)[0]
  page.evaluate("window.testExplore=async function(){"+explore.replace('await sb.from(', 'await testDB.from('))
  for route,call in [('landing','viewLanding()'),('feed','testSocial.following({home:true})'),('people','testPeople.discover()'),('discover-loading','void testExplore()'),('discover','testExplore()'),('feed-again','testSocial.following({home:true})')]:
   page.evaluate(call)
   if route!='discover-loading':page.wait_for_timeout(100)
   result=page.evaluate('''()=>({rail:document.querySelectorAll('#rail .rail-main a').length,tabs:document.querySelectorAll('.feed-tabs a').length,appX:$('app').getBoundingClientRect().x,appWidth:$('app').getBoundingClientRect().width,scrollWidth:document.documentElement.scrollWidth,boxes:[...document.querySelectorAll('.bar .right>.icon-button,.bar .right>.account-menu>summary')].map(e=>{let b=e.getBoundingClientRect();return {x:b.x,width:b.width,height:b.height}})})''')
   result.update(width=width,route=route);results.append(result)
   page.screenshot(path=str(out/f'{width}-{route}.png'),full_page=True)
  ctx.close()
 browser.close()
server.shutdown()
(out/'results.json').write_text(json.dumps(results,indent=2))
for width in [390,1440]:
 rows=[r for r in results if r['width']==width]
 assert len({r['appX'] for r in rows})==1,rows
 assert len({r['appWidth'] for r in rows})==1,rows
 for r in rows:
  assert r['rail']==3 and r['tabs']==4,r
  assert r['scrollWidth']==width,r
  assert all(b['width']==44 and b['height']==44 for b in r['boxes']),r
print('Route geometry and navigation remain consistent; header targets each44px. Local mock data, no backend.')
