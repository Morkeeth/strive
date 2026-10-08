#!/usr/bin/env python3
"""Render an actual local collector export. Never saves or changes an audience."""
import argparse, base64, json, os, pathlib, subprocess
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('capture');p.add_argument('--url',default='http://127.0.0.1:8128');p.add_argument('--proof',default=os.path.expanduser('~/.local/state/strive-code-route-20261008'));args=p.parse_args()
run=json.loads(pathlib.Path(args.capture).read_text());out=pathlib.Path(args.proof);out.mkdir(parents=True,exist_ok=True)
row_code="const I=require('./site/import-row.js');const fs=require('fs');const r=JSON.parse(fs.readFileSync(0,'utf8'));console.log(JSON.stringify({...I.build(r,{profileId:'11111111-1111-4111-8111-111111111111',title:r.title||((r.project||'Agent')+' session'),project:r.project,caption:r.caption}),id:'22222222-2222-4222-8222-222222222222',profiles:{display_name:'Local capture preview'}}));"
row=json.loads(subprocess.check_output(['node','-e',row_code],input=json.dumps(run).encode()))
share_code="import {html} from './server/public-run.mjs';let s='';for await(const c of process.stdin)s+=c;console.log(html({...JSON.parse(s),visibility:'public'}));"
share=subprocess.check_output(['node','--input-type=module','-e',share_code],input=json.dumps(row).encode()).decode()
token=base64.b64encode(json.dumps(run).encode()).decode();proof={'capture':str(pathlib.Path(args.capture).resolve()),'mode':'Local rendering only; no save or audience change','cases':[]}
with sync_playwright() as pw:
 browser=pw.chromium.launch()
 for width in [1280,390,320]:
  context=browser.new_context(viewport={'width':width,'height':900});page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('**/local-code-route-share',lambda route:route.fulfill(status=200,content_type='text/html',body=share))
  for surface in ['preview','feed','detail','share']:
   if surface=='share':page.goto(args.url+'/local-code-route-share',wait_until='domcontentloaded')
   else:
    page.goto(args.url+'/');page.goto(args.url+'/#import='+token,wait_until='domcontentloaded');page.locator('#import-card-preview .checkpoint-route').wait_for()
    if surface=='feed':page.evaluate('(r)=>{RUN_VIEW_GENERATION++;history.replaceState(null,"","/?local-render=feed");document.getElementById("app").innerHTML=StrivePost.render(r,{owner:true,dateLabel:StriveActivity.label(r)});}',row)
    if surface=='detail':page.evaluate('(r)=>{RUN_VIEW_GENERATION++;history.replaceState(null,"","/?local-render=detail");document.getElementById("app").innerHTML=runCard(r,false,null,{preview:true});}',row)
   view=page.locator('.checkpoint-route');view.wait_for();assert view.count()==1,(surface,width,'duplicate route')
   assert page.locator('.crv-source-title').count()==len(run['code_route']['stops'])
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(surface,width,'overflow')
   view.scroll_into_view_if_needed();page.screenshot(path=str(out/f'{surface}-{width}.png'))
   summary=view.locator('summary');summary.focus();page.keyboard.press('Enter');assert view.locator('details').get_attribute('open') is not None
   for expected,actual in zip(run['code_route']['stops'],view.locator('[data-source-stop]').evaluate_all('(es)=>es.map(e=>({id:e.dataset.sourceStop,text:e.textContent}))')):
    assert actual['id']==expected['id'];assert expected['label'] in actual['text'];assert expected['evidence'][1].split(': ',1)[1] in actual['text']
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(surface,width,'open-source overflow')
   if width==320:page.screenshot(path=str(out/f'{surface}-sources-{width}.png'))
   proof['cases'].append({'surface':surface,'width':width,'checkpoint_count':len(run['code_route']['stops']),'source_order_exact':True,'keyboard_sources':True,'overflow':False})
  assert not errors,errors;context.close()
 browser.close()
(out/'browser-proof.json').write_text(json.dumps(proof,indent=2));print(json.dumps({'cases':len(proof['cases']),'proof':str(out/'browser-proof.json')}))
