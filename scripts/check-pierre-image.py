from playwright.sync_api import sync_playwright
from pathlib import Path
import json,os
base=os.environ['STRIVE_PREVIEW_URL'];assert base.startswith('http://127.0.0.1:');out=Path(os.environ['STRIVE_PROOF_DIR'])
with sync_playwright() as p:
 b=p.chromium.launch();c=b.new_context(viewport={'width':390,'height':844});c.route('**/*',lambda r:r.continue_() if r.request.url.startswith('http://127.0.0.1:') else r.abort());page=c.new_page();info=page.request.get(base+'/__fixture').json()
 page.goto(base+'/r/'+info['run']);page.screenshot(path=str(out/'test-data-component-source.png'))
 page.goto(base+'/fixture');page.get_by_role('button',name='Open owner fixture').click();page.locator('[data-photo-file]').set_input_files(str(out/'test-data-component-source.png'));page.locator('[data-photo-upload]').click();page.locator('[data-photo-role]').wait_for();page.locator('[data-photo-role]').select_option('result');page.wait_for_timeout(300)
 page.reload();page.locator('[data-photo-role]').wait_for();assert page.locator('[data-photo-role]').input_value()=='result';page.locator('.run-photo-cover').wait_for();assert page.locator('.run-photo-cover').evaluate('(i)=>i.complete&&i.naturalWidth>0');assert page.locator('.run-photo-cover').evaluate('(i)=>getComputedStyle(i).objectFit')=='contain'
 page.goto(base+'/r/'+info['run']);img=page.get_by_alt_text('Result',exact=True);img.scroll_into_view_if_needed();img.wait_for();page.wait_for_function("[...document.querySelectorAll('img[alt=Result]')].every(i=>i.complete&&i.naturalWidth>0)");assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=str(out/'public-mobile-result-image.png'),full_page=True)
 result={'source':'Actual browser screenshot of the TEST DATA local component, not a user outcome','upload':'passed','result_role_after_reload':'passed','image_body_loaded':'passed','cover_object_fit':'contain','public_image':'passed','fixture':info};(out/'image-results.json').write_text(json.dumps(result,indent=2));print(json.dumps(result));b.close()
