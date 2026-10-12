import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {full} from '../tests/fixtures/estimate-capture.mjs';
const source=fs.readFileSync('site/index.html','utf8');
const card=source.slice(source.indexOf('function runCard(r,acked,count,opts={}){'),source.indexOf('\n\nfunction wireKudos(){'));
const view=source.slice(source.indexOf('async function viewRun(id){'),source.indexOf('\nasync function trendingRepos'));
const dom=new JSDOM('<div id="app"></div>',{url:'https://striverun.app/?run=11111111-1111-4111-a111-111111111111'});let row;
const ctx={URL,URLSearchParams,TextEncoder,document:dom.window.document,location:dom.window.location,history:dom.window.history,ME:{id:'owner'},AUTH_GENERATION:0,RUN_VIEW_GENERATION:0,
 $:id=>dom.window.document.getElementById(id),esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 frame(){},railHtml(){},skeletonCard:()=>'',sb:{from:()=>({select(){return this},eq(){return this},single:async()=>({data:row})})},
 GrinderRunAccess:{viewerMayOpenRun:async r=>r.visibility==='public'},noteTraces(){},ackData:async()=>({mine:new Set(),counts:{}}),fetchAckList:async()=>[],suggestAckReasons:()=>[],ACK_REASONS:{},profileHandle:()=> 'builder',audienceLabel:s=>s,ackListHtml:()=>'',status(){},
 runAttribution:()=>({handle:'builder',name:'Builder'}),safeOutputUrl:()=>null,projectLinkHtml:()=>'',runUploadIdentity:()=>'',fiveRow:()=>'',coachBlock:()=>'',typedOnlyRun:()=>false,chosenRunHero:()=>null,
 StriveHistory:{historical:()=>false},StriveEvidence:{detail:()=>'',summary:()=>''},
};ctx.window=ctx;ctx.StriveRunPhotos={disposeAll(){},mount:async()=>{throw Error('STOP_AFTER_REAL_VIEW_RENDER')}};vm.createContext(ctx);
for(const name of ['run-contract.js','run-placeholders.js','run-estimates.js','run-context.js','run-story.js','run-links.js','feed-card.js','day.js','day-card.js','activity-order.js','activity-post.js','sharing.js'])vm.runInContext(fs.readFileSync('site/'+name,'utf8'),ctx);
vm.runInContext(card+'\n'+view,ctx);
const results=[];
for(const visibility of ['public','private','link','close_friends']){
 const run={id:'11111111-1111-4111-a111-111111111111',profile_id:'owner',visibility,title:'TEST DATA saved run',profiles:{handle:'morkeeth'},started_at:'2026-10-12T13:00:00Z',tool_calls:2};
 dom.window.document.getElementById('app').innerHTML=ctx.runCard(run,false,0,{detail:true,mine:true});
 const share=dom.window.document.querySelector('.run-actions a[aria-label="Share"]');
 results.push({visibility,href:share.getAttribute('href'),publicMarker:share.hasAttribute('data-share-public')});
}

for(const result of results)assert.equal(result.href,'/?share=1&run=11111111-1111-4111-a111-111111111111','saved '+result.visibility+' routes to sharing, not back to itself');
const handler=source.slice(source.indexOf("    const publicShare=e.target.closest('a[data-share-public]');"),source.indexOf('    // Public hrefs stay canonical'));
ctx.location={origin:'https://striverun.app',href:'https://striverun.app/?run=test'};
ctx.matchMedia=()=>({matches:false});ctx.navigator={clipboard:{writeText:async text=>{ctx.copied=text}}};
dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true};
dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new dom.window.Event('close'))};
vm.runInContext(`document.addEventListener('click',e=>{${handler}})`,ctx);
for(const visibility of ['public','private','link','close_friends']){
 row={id:'11111111-1111-4111-a111-111111111111',profile_id:'owner',visibility,title:'TEST DATA saved run',profiles:{handle:'morkeeth'},started_at:'2026-10-12T13:00:00Z',tool_calls:2};
 dom.window.document.getElementById('app').innerHTML=ctx.runCard(row,false,0,{detail:true,mine:true});
 const share=dom.window.document.querySelector('.run-actions a[aria-label="Share"]');
 const click=new dom.window.MouseEvent('click',{bubbles:true,cancelable:true});share.dispatchEvent(click);await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(click.defaultPrevented,true);
 if(visibility==='public'){
  const dialog=dom.window.document.querySelector('dialog');assert.ok(dialog?.open);assert.equal(dialog.querySelector('h2').textContent,'Share this run');
  await dialog.querySelector('.share-copy-link').onclick();assert.equal(ctx.copied,'https://striverun.app'+ctx.StriveLinks.runPath(row));dialog.close();
 }else{assert.equal(dom.window.document.querySelector('dialog'),null);assert.equal(ctx.location.href,'/?share=1&run='+row.id);assert.equal(row.visibility,visibility);}
}
assert.equal(dom.window.document.querySelector('.run-actions a[aria-label="Comment"]').getAttribute('href'),'#grind-thread');
console.log('PASS actual saved-run renderer and shared click handler: public dialog/copied canonical link; nonpublic sharing route, no audience write; Comment retained');
