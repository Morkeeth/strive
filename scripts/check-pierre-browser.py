from playwright.sync_api import sync_playwright
from pathlib import Path
import json,os
base=os.environ['STRIVE_PREVIEW_URL'];assert base.startswith('http://127.0.0.1:')
out=Path(os.environ['STRIVE_PROOF_DIR']);out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch()
 c=b.new_context();c.route('**/*',lambda r:r.continue_() if r.request.url.startswith('http://127.0.0.1:') else r.abort())
 page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 info=page.request.get(base+'/__fixture').json()
 page.goto(base+'/fixture');page.get_by_role('button',name='Open owner fixture').click()
 page.get_by_role('heading',name='Goal / context').wait_for()
 for width in [1280,390]:
  page.set_viewport_size({'width':width,'height':900});page.get_by_text('Explore this run',exact=True).click()
  page.get_by_role('heading',name='Models and usage').wait_for();assert page.get_by_text('15,000',exact=True).count()==1
  assert page.locator('.run-map-axis').count()>0
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.screenshot(path=str(out/f'detail-{width}.png'),full_page=True)
  page.get_by_text('Explore this run',exact=True).click()
 page.get_by_label('Your reply',exact=True).fill('TEST DATA: the goal and chart labels are clear.');page.get_by_role('button',name='Post reply',exact=True).click();page.get_by_text('TEST DATA: the goal and chart labels are clear.',exact=True).wait_for();page.reload();page.get_by_text('TEST DATA: the goal and chart labels are clear.',exact=True).wait_for()
 page.goto(base+'/r/'+info['run']);page.get_by_role('heading',name='Models and usage').wait_for();assert page.get_by_text('15,000',exact=True).count()==1
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=str(out/'public-mobile.png'),full_page=True)
 page.goto(base+'/?run='+info['missing']);page.get_by_text('The author has not described the goal yet.',exact=True).wait_for();page.get_by_text('Explore this run',exact=True).click();assert page.get_by_text('Unknown — not recorded',exact=True).count()>=2
 page.screenshot(path=str(out/'missing-mobile.png'),full_page=True)
 result={'fixture':info,'errors':errors,'desktop_mobile':'passed','public_page':'passed','unknowns':'passed','comment_reload':'passed','outside_acceptance':'not tested'};assert not errors;(out/'browser-results.json').write_text(json.dumps(result,indent=2));print(json.dumps(result));b.close()
