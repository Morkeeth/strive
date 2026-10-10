import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {full} from '../tests/fixtures/estimate-capture.mjs';
const source=fs.readFileSync('site/index.html','utf8');
const card=source.slice(source.indexOf('function runCard(r,acked,count,opts={}){'),source.indexOf('\n\nfunction wireKudos(){'));
const view=source.slice(source.indexOf('async function viewRun(id){'),source.indexOf('\nasync function trendingRepos'));
const dom=new JSDOM('<div id="app"></div>',{url:'https://striverun.app/?run=11111111-1111-4111-a111-111111111111'});let row;
const ctx={URL,URLSearchParams,TextEncoder,document:dom.window.document,location:dom.window.location,ME:null,AUTH_GENERATION:0,RUN_VIEW_GENERATION:0,
 $:id=>dom.window.document.getElementById(id),esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 frame(){},railHtml(){},skeletonCard:()=>'',sb:{from:()=>({select(){return this},eq(){return this},single:async()=>({data:row})})},
 GrinderRunAccess:{viewerMayOpenRun:async r=>r.visibility==='public'},noteTraces(){},ackData:async()=>({mine:new Set(),counts:{}}),fetchAckList:async()=>[],suggestAckReasons:()=>[],ACK_REASONS:{},profileHandle:()=> 'builder',audienceLabel:s=>s,ackListHtml:()=>'',status(){},
 runAttribution:()=>({handle:'builder',name:'Builder'}),safeOutputUrl:()=>null,projectLinkHtml:()=>'',runUploadIdentity:()=>'',fiveRow:()=>'',coachBlock:()=>'',typedOnlyRun:()=>false,chosenRunHero:()=>null,
 StriveHistory:{historical:()=>false},StriveEvidence:{detail:()=>'',summary:()=>''},
};ctx.window=ctx;ctx.StriveRunPhotos={disposeAll(){},mount:async()=>{throw Error('STOP_AFTER_REAL_VIEW_RENDER')}};vm.createContext(ctx);
for(const name of ['run-contract.js','run-placeholders.js','run-estimates.js','run-context.js','run-story.js','feed-card.js','day.js','day-card.js','activity-order.js','activity-post.js'])vm.runInContext(fs.readFileSync('site/'+name,'utf8'),ctx);
vm.runInContext(card+'\n'+view,ctx);
const base={id:'11111111-1111-4111-a111-111111111111',profile_id:'someone-else',title:'TEST DATA captured work',visibility:'public',profiles:{handle:'builder'},commits:6,files_touched:21,duration_s:6992,rhythm:[1,2,1],capture_metadata:full};
async function render(r){row=r;await assert.rejects(ctx.viewRun(r.id),/STOP_AFTER_REAL_VIEW_RENDER/);return dom.window.document.querySelector('#card-'+r.id);}
let actual=await render(base);const expected=JSON.parse(JSON.stringify(ctx.StriveContext.headlineFacts(base)));
assert.deepEqual([...actual.querySelectorAll('.run-metrics dt')].map(e=>e.textContent),['Recorded tokens','Est. dollars*','Tool-active time · proxy']);
assert.deepEqual([...actual.querySelectorAll('.run-metrics dd')].map(e=>e.textContent),expected.map(x=>x[1]));
assert.ok(actual.querySelector('.post-measurement-note'));assert.match(actual.querySelector('.post-measurement-note').textContent,/not continuous tool runtime or measured human active time/);
const absent=structuredClone(base);delete absent.capture_metadata.estimates;actual=await render(absent);
assert.deepEqual([...actual.querySelectorAll('.run-metrics dt')].map(e=>e.textContent),JSON.parse(JSON.stringify(ctx.GrinderContract.heroStats(absent))).map(x=>x[0]),'existing non-estimate detail facts remain unchanged');
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
