import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
const require=createRequire(import.meta.url);
const html=fs.readFileSync('site/index.html','utf8');
const dom=new JSDOM('<main id="app"></main>',{url:'https://striverun.app/'});
const w=dom.window;
let pending;
const saved=[];
const ctx={window:w,document:w.document,location:w.location,history:w.history,sessionStorage:w.sessionStorage,localStorage:w.localStorage,URL,atob,
 RUN_VIEW_GENERATION:0,AUTH_GENERATION:0,ME:{id:'owner',rig:{}},
 GrinderContract:require('../site/run-contract.js'),
 GrinderFeed:{card:r=>`<article>${r.title}</article>`},
 $:id=>w.document.getElementById(id),esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
 frame(){},skeletonCard:()=>'<p>Loading</p>',projectForSave:(a,b)=>b||a,safeOutputUrl:()=>null,safeRepoUrl:()=>null,
 status(){},requireCloseFriendsForSave:async()=>true,dropNullSegmentColumns(){},fairConfirmRun(){},viewRun(){},
 audienceLabel:x=>x};
ctx.sb={from:()=>({
 select:()=>({eq(){return this},order(){return this},limit(){return new Promise(resolve=>pending=resolve)}}),
 insert:row=>{saved.push(row);return {select:()=>({single:async()=>({data:{id:'saved'}})})}}
})};
vm.createContext(ctx);
vm.runInContext(html.slice(html.indexOf("const IMPORT_STASH="),html.indexOf('\nasync function viewShareRun')),ctx);
ctx.route=()=>{ctx.RUN_VIEW_GENERATION++;return ctx.importRun()};
vm.runInContext(html.slice(html.indexOf("window.addEventListener('hashchange'"),html.indexOf("document.addEventListener('DOMContentLoaded'")),ctx);
const token=project=>encodeURIComponent(Buffer.from(JSON.stringify({harness:'Codex',project,turns_typed:1,tool_calls:2,measurement_revision:(project==='alpha'?'a':'b').repeat(64),schema_version:1,trace_basis:'timestamped native events',rhythm:[1,1]})).toString('base64'));
async function go(t){const oldURL=w.location.href;w.history.replaceState(null,'','/#import='+t);w.dispatchEvent(new w.HashChangeEvent('hashchange',{oldURL,newURL:w.location.href}));await new Promise(r=>setTimeout(r,0))}
const a=token('alpha'),b=token('beta');
await go(a);assert.equal(ctx.$('i_title').value,'alpha session');
ctx.$('i_title').value='Alpha unsaved story';ctx.$('i_title').dispatchEvent(new w.Event('input'));
ctx.$('i_share_rig').checked=true;ctx.$('i_share_rig').dispatchEvent(new w.Event('change'));
await go(b);assert.equal(ctx.$('i_title').value,'beta session','fresh hash must replace prior preview');
ctx.$('i_title').value='Beta unsaved story';ctx.$('i_title').dispatchEvent(new w.Event('input'));
await go(a);assert.equal(ctx.$('i_title').value,'Alpha unsaved story','drafts stay bound to original source');
assert.equal(ctx.$('i_share_rig').checked,true,'checkbox-only edit survives source switch');
ctx.$('i_pub').click();await new Promise(r=>setTimeout(r,0));assert.ok(pending);
await go(b);pending({data:[],error:null});await new Promise(r=>setTimeout(r,0));
assert.equal(saved.length,0,'old async save cannot insert newer draft against older source');
assert.equal(ctx.$('i_title').value,'Beta unsaved story');
await go('bad');assert.match(ctx.$('app').textContent,/could not be read/);
await go(a);assert.equal(ctx.$('i_title').value,'Alpha unsaved story');
/* Additional actual-renderer asynchronous boundaries. */
const tick=()=>new Promise(r=>setTimeout(r,0));
const decode=ctx.decodeImportPayload;
for(const reject of [false,true]){
 let finish;ctx.decodeImportPayload=t=>t===a?new Promise((ok,no)=>finish=reject?no:ok):decode(t);
 await go(b);await go(a);await go(b);finish(reject?new Error('late invalid source'):await decode(a));await tick();
 assert.equal(ctx.$('i_title').value,'Beta unsaved story','stale decode must not replace current preview');
}
ctx.decodeImportPayload=decode;
for(const stage of ['lookup-auth','insert','audience-ok','audience-error','rig']){
 let finish;const writes=[];
 function delayed(kind,value){if(kind===stage)return new Promise(r=>finish=()=>r(value));return Promise.resolve(value)}
 ctx.sb={from:table=>({
 select:()=>({eq(){return this},order(){return this},limit(){return delayed('lookup-auth',{data:[]})}}),
 insert:row=>{writes.push(row);return {select:()=>({single:()=>delayed('insert',{data:{id:'old-saved'}})})}},
 update:row=>{writes.push({table,...row});return {eq(){return this},then(ok,no){return delayed(table==='profiles'?'rig':stage.startsWith('audience')?stage:'audience',{error:stage==='audience-error'?{message:'denied'}:null}).then(ok,no)}}}
 })};
 await go(b);await go(a);ctx.$('i_vis').value=stage.startsWith('audience')?'link':'private';ctx.$('i_pub').click();await tick();await tick();assert.ok(finish,stage+' boundary reached');
 if(stage==='lookup-auth')ctx.AUTH_GENERATION++;
 await go(b);finish();await tick();await tick();
 assert.equal(ctx.$('i_title').value,'Beta unsaved story',stage+' cannot hijack fresh preview');
 assert.equal(w.location.hash,'#import='+b,stage+' must not navigate away');
 assert.equal(JSON.parse(w.sessionStorage.getItem('ag_import_edits:'+a)).i_title,'Alpha unsaved story',stage+' retains original draft');
 if(['insert','audience-ok','audience-error'].includes(stage))assert.equal(writes.filter(x=>x.table==='profiles').length,0,stage+' cannot write a newer profile');
 assert.ok(writes.filter(x=>x.measurement_revision).every(x=>x.measurement_revision==='a'.repeat(64)&&x.title==='Alpha unsaved story'),'insert stays source and draft bound');
 if(stage==='lookup-auth')assert.equal(writes.length,0);
}
console.log('PASS: real import renderer handles hash replacement, source-specific draft return, stale-save refusal and invalid-link recovery');
