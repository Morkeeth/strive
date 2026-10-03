from playwright.sync_api import sync_playwright
import json, os
from pathlib import Path
out=Path(os.environ['STRIVE_PROOF_DIR']);out.mkdir(parents=True,exist_ok=True);base=os.environ['STRIVE_PREVIEW_URL'];assert base.startswith('http://127.0.0.1:')
with sync_playwright() as p:
 b=p.chromium.launch(headless=True);c=b.new_context(viewport={'width':390,'height':844});errors=[]
 def network(r):
  if r.request.url.startswith('http://127.0.0.1:'):r.continue_()
  else:r.abort()
 c.route('**/*',network);page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base);page.get_by_text('First stride · 1 saved run',exact=True).wait_for()
 page.get_by_role('button',name='Feedback',exact=True).click();page.get_by_label('Your feedback').fill('TEST DATA: keep the map easy to find.')
 page.get_by_role('button',name='Close feedback').click();page.get_by_role('button',name='Following',exact=True).click();page.get_by_role('button',name='Feedback',exact=True).click();assert page.get_by_label('Your feedback').input_value()=='TEST DATA: keep the map easy to find.'
 def lost(r):
  r.fetch();r.abort();page.unroute('**/rpc/save_feedback',lost)
 page.route('**/rpc/save_feedback',lost);page.get_by_role('button',name='Send feedback',exact=True).click();page.get_by_text('Could not confirm the save. Your text is still here. Try again.',exact=True).wait_for();assert page.get_by_label('Your feedback').input_value()=='TEST DATA: keep the map easy to find.'
 page.screenshot(path=str(out/'mobile-retry.png'));page.get_by_role('button',name='Send feedback',exact=True).click();page.get_by_text('Saved. Thanks for saying it.',exact=True).wait_for();page.screenshot(path=str(out/'mobile-saved.png'))
 before=page.request.get(base+'/proof').json();assert len(before)==1
 page.goto(base);page.reload();page.get_by_text('First stride · 1 saved run',exact=True).wait_for();after=page.request.get(base+'/proof').json();assert after==before
 width=page.evaluate('document.documentElement.scrollWidth');assert width==390;page.screenshot(path=str(out/'mobile-reward.png'));page.set_viewport_size({'width':1280,'height':900});page.get_by_role('button',name='Feedback',exact=True).click();page.screenshot(path=str(out/'desktop-feedback.png'))
 assert not errors;result={'surface':'shipped feedback and reward modules, local wrapper, actual disposable PostgreSQL RPC','lost_response_retry':'same persisted row','persisted_before_reload':before,'persisted_after_reload':after,'route_change_preserved_draft':True,'mobile_scroll_width':width,'page_errors':errors,'hosted_or_full_SPA':False};(out/'browser-results.json').write_text(json.dumps(result,indent=2));print(json.dumps(result));b.close()
