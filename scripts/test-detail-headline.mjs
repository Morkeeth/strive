import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {full} from '../tests/fixtures/estimate-capture.mjs';
const source=fs.readFileSync('site/index.html','utf8');
const card=source.slice(source.indexOf('function runCard(r,acked,count,opts={}){'),source.indexOf('\n\nfunction wireKudos(){'));
const view=source.slice(source.indexOf('async function viewRun(id){'),source.indexOf('\nasync function trendingRepos'));
const dom=new JSDOM('<div id="app"></div>',{url:'https://striverun.app/?run=11111111-1111-4111-a111-111111111111'});let row;
const ctx={URL,URLSearchParams,TextEncoder,document:dom.window.document,location:dom.window.location,history:dom.window.history,ME:null,AUTH_GENERATION:0,RUN_VIEW_GENERATION:0,
 $:id=>dom.window.document.getElementById(id),esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 frame(){},railHtml(){},skeletonCard:()=>'',sb:{from:()=>({select(){return this},eq(){return this},single:async()=>({data:row})})},
 GrinderRunAccess:{viewerMayOpenRun:async r=>r.visibility==='public'},noteTraces(){},ackData:async()=>({mine:new Set(),counts:{}}),fetchAckList:async()=>[],suggestAckReasons:()=>[],ACK_REASONS:{},profileHandle:()=> 'builder',audienceLabel:s=>s,ackListHtml:()=>'',status(){},
 runAttribution:()=>({handle:'builder',name:'Builder'}),safeOutputUrl:()=>null,projectLinkHtml:()=>'',coachModeBanner:()=>'',chosenRunHero:()=>null,
 StriveHistory:{historical:()=>false},
};ctx.window=ctx;ctx.StriveRunPhotos={disposeAll(){},mount:async()=>{throw Error('STOP_AFTER_REAL_VIEW_RENDER')}};vm.createContext(ctx);
for(const name of ['run-evidence.js','fork-run.js','run-contract.js','run-placeholders.js','run-estimates.js','run-context.js','run-story.js','run-links.js','feed-card.js','day.js','day-card.js','activity-order.js','activity-post.js','sharing.js'])vm.runInContext(fs.readFileSync('site/'+name,'utf8'),ctx);
vm.runInContext(source.match(/^const typedOnlyRun=.*$/m)[0]+'\n'+source.slice(source.indexOf('function runContinuation('),source.indexOf('function connectWrapperName('))+'\n'+source.slice(source.indexOf('function connectWrapperName('),source.indexOf('// The project a run is SAVED with.'))+'\n'+source.slice(source.indexOf('function coachBlock(r){'),source.indexOf('function safeOutputUrl('))+'\nfunction fiveRow(r){return StriveContext.metrics(r)}\n'+card+'\n'+view,ctx);
const base={id:'11111111-1111-4111-a111-111111111111',profile_id:'someone-else',title:'TEST DATA captured work',visibility:'public',profiles:{handle:'builder'},commits:6,files_touched:21,duration_s:6992,rhythm:[1,2,1],capture_metadata:full};
async function render(r){row=r;await assert.rejects(ctx.viewRun(r.id),/STOP_AFTER_REAL_VIEW_RENDER/);return dom.window.document.querySelector('#card-'+r.id);}
let actual=await render(base);const expected=JSON.parse(JSON.stringify(ctx.StriveContext.headlineFacts(base)));
assert.equal(actual.querySelector('.run-explore>summary').textContent,'Receipts and measurements');assert.equal(actual.querySelector('.run-explore').open,false);
assert.deepEqual([...actual.querySelectorAll('.run-metrics dt')].map(e=>(e.querySelector('summary')||e).textContent),['Recorded tokens','Est. dollars*','Elapsed']);
assert.deepEqual([...actual.querySelectorAll('.run-metrics dd')].map(e=>(e.querySelector('summary')||e).textContent),expected.map(x=>x[1]));
assert.ok(actual.querySelector('.run-explore #run-journey'),'project bookkeeping stays inside the receipts disclosure');
assert.equal(dom.window.document.querySelectorAll('#run-journey').length,1);
assert.ok(actual.querySelector('.run-agent-identity'),'captured detail retains agent identity');assert.ok(actual.querySelector('.post-measurement-note'));assert.match(actual.querySelector('.post-measurement-note').textContent,/not continuous tool runtime or measured human active time/);
const absent=structuredClone(base);delete absent.capture_metadata.estimates;actual=await render(absent);
assert.deepEqual([...actual.querySelectorAll('.run-metrics dt')].map(e=>(e.querySelector('summary')||e).textContent),['Recorded tokens','Tool calls','Elapsed'],'detail uses the same three-position ladder without estimates');
const unknown=structuredClone(base);unknown.capture_metadata.estimates.cost.components.forEach(c=>c.price=null);actual=await render(unknown);assert.ok(![...actual.querySelectorAll('.run-metrics dt')].some(e=>e.textContent==='Est. dollars*'));assert.match(actual.querySelector('.post-measurement-note').textContent,/No recorded price/);
console.log('PASS actual signed-out viewRun → runCard: shared three estimate facts and basis; absent legacy metrics unchanged; unknown price never becomes dollars.');

// Both routes keep a unique provenance story, but do not repeat an already printed story.
const {html:publicHtml}=await import('../server/public-run.mjs');
for(const capture_metadata of [full,null]){
 const story={...base,capture_metadata,caption:'Short achievement.',story_result:'Unique image provenance: project screenshots dated 10 October; personal photo is from the saved collection.'};
 const publicDoc=new JSDOM(publicHtml(story));
 const text=publicDoc.window.document.body.textContent;
 assert.equal(text.split(story.story_result).length-1,1);assert.ok(!text.includes('In the author’s words.'));
 const detail=await render(story);assert.match(detail.textContent,/Short achievement/);assert.ok(detail.textContent.includes(story.story_result));assert.ok(!detail.textContent.includes('In the author’s words.'));
 const repeated=await render({...story,caption:story.story_result});assert.equal(repeated.textContent.split(story.story_result).length-1,1);
}
console.log('PASS public and app detail: one copy of description, unique provenance retained, no empty author-words line, with and without estimates.');

const pricedNoTime=structuredClone(base);delete pricedNoTime.capture_metadata.estimates.tool_activity;const partial=await render(pricedNoTime);assert.deepEqual([...partial.querySelectorAll('.run-metrics dt')].map(e=>(e.querySelector('summary')||e).textContent),['Recorded tokens','Est. dollars*','Elapsed']);assert.equal(partial.querySelectorAll('.run-metrics dd')[1].textContent,'$1.89');const sharedPartial=new JSDOM(publicHtml(pricedNoTime));assert.match(sharedPartial.window.document.body.textContent,/\$1.89/);

const cursorDetail=await render({...base,harness:"cursor",duration_s:null,turns_typed:3,tool_calls:15,files_touched:2,capture_metadata:{basis:"cursor-model-info",models:["auto"]}});assert.deepEqual([...cursorDetail.querySelectorAll(".run-metrics dd")].map(e=>(e.querySelector('summary')||e).textContent),["3","15","2"]);assert.match(cursorDetail.textContent,/Cursor does not record tokens/);

const manual=await render({...base,title:'Synthetic manual update',trace_basis:'typed-by-author',harness:null,capture_metadata:null,duration_s:null,commits:null,files_touched:null,rhythm:null});
assert.equal(manual.querySelector('.run-explore>summary').textContent,'Update details');assert.equal(manual.querySelector('.run-explore').open,false);
assert.match(manual.querySelector('.run-effort-context').textContent,/Manual · unmeasured/);
assert.ok(!manual.querySelector('.run-effort-context').textContent.includes('Coding agent'),'manual detail never invents an agent context');
assert.equal(manual.querySelectorAll('.run-metrics').length,0,'manual detail has no recorded measurement headline');assert.equal(manual.querySelectorAll('.post-token-note,.run-agent-identity').length,0,'manual detail has no captured-agent setup');
console.log('PASS actual manual detail: unmeasured owner-provided context, no generic agent or recorded headline');

// A pre-017 manual row might carry stale facts. Both public surfaces still treat it as manual.
const oldManual={...base,coach_verdict:'STALE_COACH',coach_tool_calls:6,source_actor_id:'11111111-1111-4111-8111-111111111111',agent_name:'STALE_AGENT',trace_basis:'typed-by-author',harness:'Codex',model:'legacy-model',started_at:'2026-10-28T10:00:00Z',duration_s:5432,prompts:999,tool_calls:888,commits:777,files_touched:666,story_result:'Author update',project:'Synthetic project',output_url:'https://example.com',code_route:{v:1,unavailable:{why:'STALE_ROUTE_PROOF'}},receipts:['https://example.com/STALE_RECEIPT']};
for(const rendered of [await render(oldManual),new JSDOM(publicHtml(oldManual)).window.document.body]){
 assert.match(rendered.textContent,/Manual · unmeasured/);assert.match(rendered.textContent,/browser, not a captured session/);
 for(const lie of ['Session date supplied by the capture','Models and usage','Captured from','Coding agent','Not captured','legacy-model','STALE_ROUTE_PROOF','STALE_RECEIPT','STALE_AGENT','STALE_COACH'])assert.ok(!rendered.textContent.includes(lie),lie);
 assert.equal(rendered.querySelectorAll('.run-metrics,.run-agent-identity,.share-stats,.share-route,.share-chips').length,0);
}
for(const selector of ['meta[property="og:image:alt"]','meta[property="og:description"]'])assert.ok(!new JSDOM(publicHtml(oldManual)).window.document.querySelector(selector).content.includes('777'),'manual metadata excludes stale captured numbers');
console.log('PASS old manual detail and public share: no stale capture metrics/model/route/receipt/date claims; explicit browser-date basis');

const LinkPreview=(await import('../site/link-preview-card.js')).default;
assert.deepEqual(LinkPreview.previewMetrics(oldManual),[]);assert.equal(LinkPreview.traceBins(oldManual),null);
const manualImageTree=JSON.stringify(LinkPreview.linkPreviewCard(oldManual));assert.ok(!manualImageTree.includes('legacy-model')&&!manualImageTree.includes('Codex'),'legacy manual link image suppresses captured tools/models');
const feedMarkup=ctx.GrinderFeed.card(oldManual,{page:true});assert.ok(!feedMarkup.includes('legacy-model'));assert.match(feedMarkup,/Manual · unmeasured/);assert.ok(!feedMarkup.includes('fc-activity-stats'));
console.log('PASS old manual feed and link-image data: no captured metrics/model/harness/trace');

const coached=await render({...base,coach_verdict:'Synthetic captured review',coach_tool_calls:6});
assert.match(coached.querySelector('.run-explore .grp').textContent,/recorded automated review.*6.*recorded tool calls/);
assert.match(coached.querySelector('.run-explore .para').textContent,/Synthetic captured review/);
assert.equal([...coached.querySelectorAll('.grp,.para')].filter(el=>!el.closest('.run-explore')).length,0);
console.log('PASS source-specific disclosures: captured receipts and real coach block retained behind fold; manual update details have no stale coach block');
