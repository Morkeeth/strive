"""Exercise the shipped owner queue on disposable local rows. Nothing hosted."""
import json,os,subprocess,sys,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0,str(Path(__file__).parent))
from importlib import import_module
helper=import_module('check-photo-editor')
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
proc=subprocess.Popen(['node','scripts/photo-editor-local-stack.mjs'],stdout=subprocess.PIPE,stderr=open(out/'stack.log','w'),text=True,env={**os.environ,'STRIVE_TEST_RUN_QUEUE':'1'})
try:
 stack=json.loads(proc.stdout.readline())
 target='a2000000-0000-0000-0000-000000000002'
 assert helper.rest(stack,'runs?select=id&id=eq.'+target,helper.mint(stack['riley'],'test-riley'))==[]
 request=urllib.request.Request(stack['supabase']+'/rest/v1/runs?id=eq.'+target+'&profile_id=eq.'+stack['casey']+'&visibility=eq.private&select=id',method='DELETE',headers={'apikey':'local-development-only','Accept-Profile':'strava','Content-Profile':'strava','Authorization':'Bearer '+helper.mint(stack['riley'],'test-riley'),'Prefer':'return=representation'})
 with urllib.request.urlopen(request) as response:assert json.load(response)==[]
 assert len(helper.rest(stack,'runs?select=id&id=eq.'+target,helper.mint(stack['casey'],'test-casey')))==1

 with sync_playwright() as pw:
  browser=pw.chromium.launch()
  for width in [390,1440]:
   context=browser.new_context(viewport={'width':width,'height':900});page=context.new_page();page.add_init_script(helper.session_script(stack['casey'],'test-casey'))
   if width==390:
    page.goto(stack['site']+'/');page.locator('[data-review-count]:not([hidden])').wait_for();assert page.get_by_role('dialog',name='Runs waiting for your review').count()==0;assert page.locator('[data-review-count]').inner_text()=='4';page.screenshot(path=str(out/'header-phone.png'),full_page=True)
   page.goto(stack['site']+'/?queue');page.get_by_role('heading',name='Ready for your review').wait_for()
   assert page.get_by_role('link',name='Review TEST DATA manual',exact=True).count()==1
   assert page.get_by_role('link',name='Review TEST DATA other owner').count()==0
   if width==390:
    page.get_by_role('link',name='Review TEST DATA manual',exact=True).click();page.get_by_role('heading',name='Review this private run').wait_for();assert page.locator('[aria-label="Private run"]').is_visible();assert page.get_by_role('button',name='Approve and post',exact=True).is_enabled();assert helper.rest(stack,'runs?select=visibility&id=eq.a2000000-0000-0000-0000-000000000004',helper.mint(stack['casey'],'test-casey'))[0]['visibility']=='private';assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.goto(stack['site']+'/?queue');page.get_by_role('heading',name='Ready for your review').wait_for()
    page.get_by_role('link',name='Review TEST DATA private agent',exact=True).click();page.get_by_role('link',name='Connect',exact=True).wait_for();assert not page.get_by_role('button',name='Approve and post',exact=True).is_enabled();page.goto(stack['site']+'/?queue');page.get_by_role('heading',name='Ready for your review').wait_for()
    page.screenshot(path=str(out/'queue-phone.png'),full_page=True)
    page.get_by_role('link',name='Review TEST DATA approve',exact=True).click()
    page.get_by_role('button',name='Approve and post',exact=True).click()
    assert page.locator('#run-audience').input_value()=='public'
    page.screenshot(path=str(out/'approval-phone.png'),full_page=True)
    row=helper.rest(stack,'runs?select=visibility&id=eq.a2000000-0000-0000-0000-000000000001',helper.mint(stack['casey'],'test-casey'))
    assert row[0]['visibility']=='private','Preview must not publish'
    page.locator('#run-save').click();page.get_by_text('Saved to Public feed and profile',exact=True).wait_for()
    assert helper.rest(stack,'runs?select=visibility&id=eq.a2000000-0000-0000-0000-000000000001')[0]['visibility']=='public'
   page.goto(stack['site']+'/?queue');page.get_by_role('link',name='Review TEST DATA discard',exact=True).wait_for()
   page.screenshot(path=str(out/f'queue-{width}.png'),full_page=True)
   if width==1440:
    page.get_by_role('link',name='Review TEST DATA discard',exact=True).click();page.once('dialog',lambda d:d.accept());page.get_by_role('button',name='Discard',exact=True).click()
    page.wait_for_url('**/?queue');assert helper.rest(stack,'runs?select=id&id=eq.a2000000-0000-0000-0000-000000000002',helper.mint(stack['casey'],'test-casey'))==[]
    assert helper.rest(stack,'runs?select=id&id=eq.a2000000-0000-0000-0000-000000000002')==[]
   context.close()
  anonymous=browser.new_context();page=anonymous.new_page();page.goto(stack['site']+'/?queue');page.get_by_role('button',name='Continue with GitHub',exact=True).wait_for();assert page.get_by_text('TEST DATA discard',exact=False).count()==0;anonymous.close();browser.close()
 (out/'browser-result.json').write_text(json.dumps({'pass':True,'viewports':[390,1440],'preview_stays_private':True,'explicit_approval_public':True,'discard_deleted':True,'other_owner_excluded':True,'manual_private_included':True,'anonymous_excluded':True,'private_agent_requires_owner_profile_choice':True,'other_owner_delete_refused':True},indent=2)+'\n')
finally:
 proc.terminate();proc.wait(timeout=10)
