import Links from '../site/run-links.js';
import {JSDOM} from 'jsdom';
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const tree=process.cwd();
const html=fs.readFileSync(tree+'/site/index.html','utf8');
const code=html.slice(html.indexOf('async function viewRun(id){'),html.indexOf('\nasync function trendingRepos'));
let release,entered;const paused=new Promise(r=>entered=r),wait=new Promise(r=>release=r);
const runDocument=new JSDOM('<main id="app"></main>').window.document;
const app=runDocument.getElementById('app'),r={id:'run-A',profile_id:'owner-A',visibility:'private',title:'PRIVATE A',profiles:{handle:'A'}};
const context={document:runDocument,StriveLinks:Links,AUTH_GENERATION:0,RUN_VIEW_GENERATION:0,URLSearchParams,ME:{id:'owner-A'},location:{search:'?run=run-A'},$:id=>runDocument.getElementById(id),
 frame(){},railHtml(){},skeletonCard:()=>'',sb:{from:()=>({select(){return this},eq(){return this},single:async()=>({data:r})})},
 GrinderRunAccess:{viewerMayOpenRun:async(run,{me})=>me.id===run.profile_id},noteTraces(){},
 ackData:async()=>{entered();await wait;return {mine:new Set(),counts:{}}},fetchAckList:async()=>[],suggestAckReasons:()=>[],
 ACK_REASONS:{},profileHandle:()=> 'A',esc:s=>s,audienceLabel:s=>s,runCard:run=>'<PRIVATE>'+run.title+'</PRIVATE>',ackListHtml:()=>'',
 window:{StriveRunPhotos:{mount:async()=>{throw new Error('STOP_AFTER_RENDER')}}},status(){}};
context.StriveRunPhotos=context.window.StriveRunPhotos;vm.createContext(context);vm.runInContext(code,context);
const pending=context.viewRun('run-A');await paused;context.ME={id:'owner-B'};release();
await pending.catch(e=>assert.equal(e.message,'STOP_AFTER_RENDER'));
assert.equal(app.querySelector('private'),null,'stale private run must not render');
console.log('PASS: delayed private run cannot render after account change');
// The real auth callback must clear identity and private UI before the queued refresh runs.
const start=html.indexOf('function invalidatePrivateView(){'),end=html.indexOf('\n}',html.indexOf('function handleAuthStateChange'))+2;
let queued=0,disposed=0;const elements={app:{innerHTML:'PRIVATE A'},'notifications-body':{innerHTML:'PRIVATE NOTICE'},me:{innerHTML:'A'},'account-menu':{hidden:false}};
const authDocument=new JSDOM('').window.document;
const authCtx={document:authDocument,AUTH_GENERATION:0,RUN_VIEW_GENERATION:0,ME:{id:'A'},AUTH_USER:{id:'auth-A'},IDENTITY_SETUP:{},
 window:{StriveRunPhotos:{disposeAll:()=>disposed++}},$:id=>elements[id],skeletonCard:()=> 'Loading',setTimeout:()=>queued++};
vm.createContext(authCtx);vm.runInContext(html.slice(start,end),authCtx);
authCtx.handleAuthStateChange('SIGNED_IN',{user:{id:'auth-B'}},()=>{});
assert.equal(authCtx.ME,null);assert.equal(authCtx.AUTH_USER,null);assert.equal(authCtx.AUTH_GENERATION,1);
assert.equal(elements.app.innerHTML,'Loading');assert.equal(elements['notifications-body'].innerHTML,'');assert.equal(disposed,1);assert.equal(queued,1);
console.log('PASS: real auth callback invalidates private UI synchronously before queuing refresh');
context.ME={id:'owner-A'};
await context.viewRun('run-A').catch(e=>assert.equal(e.message,'STOP_AFTER_RENDER'));
assert.equal(app.querySelector('private')?.textContent,'PRIVATE A');
console.log('PASS: same-account private run still renders normally');
const inlineScripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(s=>s.trim());
for(const script of inlineScripts)new vm.Script(script);
console.log('PASS: all inline website scripts parse');
