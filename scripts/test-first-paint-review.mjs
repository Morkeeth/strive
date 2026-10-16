import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{JSDOM}=require('jsdom');
const source=fs.readFileSync('site/index.html','utf8');
// A real photo metadata stall must never hold back recorded card text.
const fn=source.slice(source.indexOf('async function feedCards('),source.indexOf('// A stranger lands'));
const context={window:{StriveRunPhotos:{prepareCards:()=>new Promise(()=>{})}},StriveActivity:{sort:r=>r,time:()=>null,label:()=>''},StrivePost:{render:r=>'<article>'+r.title+'</article>'},StriveDay:{},StriveDayCard:{},GrinderContract:{projectLabel:()=>''},sb:{},Intl,setTimeout:()=>{},document:{getElementById:()=>null}};
vm.createContext(context);vm.runInContext(fn+';this.render=feedCards',context);
if(!process.argv.includes('--queue'))assert.match(await Promise.race([context.render([{id:'one',title:'Recorded work'}],{}),new Promise(r=>setTimeout(()=>r('BLOCKED'),80))]),/Recorded work/,'photo metadata may not block first card text');
if(!process.argv.includes('--queue'))assert.match(source,/<main[^>]*id="app"[^>]*>\s*<[^>]+data-first-paint/,'HTML response must contain useful first-paint content before scripts');
// One slow later author's choices must not hold the first selected run.
let delivered=[];const slow=new Promise(()=>{});context.StriveActivity.time=r=>r.at;context.StriveDay.localDay=d=>String(d.getTime());context.StriveDayCard.token=async()=>'';context.sb.rpc=(_,args)=>args.owner_id==='slow'?slow:Promise.resolve({data:null});
void context.render([{id:'fast',profile_id:'fast',at:1,title:'First recorded run'},{id:'slow',profile_id:'slow',at:2,title:'Slow later run'}],{},{onCard:html=>delivered.push(html)});
await new Promise(r=>setTimeout(r,5));assert.equal(delivered.length,1);assert.match(delivered[0],/First recorded run/);
let choiceReads=0;context.sb.rpc=()=>({then:resolve=>{choiceReads++;resolve({data:null})}});
await context.render([{id:'a',profile_id:'same',at:1},{id:'b',profile_id:'same',at:1}],{});
assert.equal(choiceReads,1,'same owner/day choice read is started once and shared');
delivered=[];await context.render([{id:'stale',profile_id:'same',at:1}],{},{current:()=>false,onCard:html=>delivered.push(html)});assert.equal(delivered.length,0,'navigation/auth change cancels streamed text');
assert.ok(source.indexOf('/first-paint.js')<source.indexOf('<script src="https://cdn.jsdelivr.net/npm/@supabase'));
const Q=require('../site/run-queue.js'),dom=new JSDOM('<main></main>');globalThis.document=dom.window.document;
const run={id:'test',profile_id:'owner',visibility:'private',created_at:'2026-10-16T07:00:00Z',started_at:'2026-10-15T22:00:00Z',title:'TEST DATA: repair sharing',project:'STRIVE',repo_url:'https://github.com/Morkeeth/strive',story_result:'Private review now shows the selected card.\nChecks passed; no deployment.',caption:'A separate author note.'};
function client(rows){const q={select(){return q},eq(){return q},gte(){return q},order(){return q},then(resolve){resolve({data:rows,error:null})}};return {from:()=>q}}
const slot=document.querySelector('main');let render;
await Q.mount({client:client([run,{...run,id:'empty',created_at:'2026-10-15T07:00:00Z',title:'Unlabelled work',project:null,repo_url:null,story_result:null,caption:null}]),owner:'owner',slot,esc:s=>String(s).replaceAll('<','&lt;'),current:()=>true,renderCard:()=>new Promise(r=>render=r)});
const first=slot.querySelector('.queue-preview');
assert.match(first.querySelector('summary').textContent,/STRIVE/);
assert.match(first.textContent,/Morkeeth\/strive/,'repository must be visible alongside the project');
assert.match(first.querySelector('.queue-result').textContent,/Private review now shows/,'authored results must appear without waiting for the card/photo');
assert.match(first.querySelector('.queue-result').textContent,/no deployment/,'result caveats must remain');
assert.match(first.querySelector('summary').textContent,/2026/);
assert.match(slot.textContent,/Result not recorded/);assert.match(slot.textContent,/Project not recorded/);
assert.equal(first.querySelector('[data-approve-id]').disabled,true,'results are not approval; wait for actual share card');
console.log('PASS photo stall does not block text; static useful first paint; queue identity/project/repo/results and honest missing fields');
