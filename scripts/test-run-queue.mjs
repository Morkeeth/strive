import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), Q=require('../site/run-queue.js');
const run={id:'run',profile_id:'owner',source_actor_id:'agent',visibility:'private',created_at:'2026-10-14T12:00:00Z'};
assert.equal(Q.pending(run,'owner'),true);
for(const changed of [{visibility:'public'},{visibility:'link'},{profile_id:'other'}])assert.equal(Q.pending({...run,...changed},'owner'),false);
assert.equal(Q.pending(run,null),false);
assert.equal(Q.pending({...run,source_actor_id:null},'owner'),true,'existing manual private imports must be reviewable');
let writes=[];
const client={from(table){assert.equal(table,'runs');const q={delete(){writes.push('delete');return q},eq(k,v){writes.push([k,v]);return q},select(){return Promise.resolve({data:[{id:'run'}],error:null})}};return q}};
await assert.rejects(()=>Q.discard(client,run,'other'),/Only the owner/);
assert.equal(writes.length,0);
await Q.discard(client,run,'owner');
assert.deepEqual(writes,['delete',['id','run'],['profile_id','owner'],['visibility','private']]);
await assert.rejects(()=>Q.discard({from(){return {delete(){return this},eq(){return this},select(){return Promise.resolve({data:[],error:null})}}}},run,'owner'),/changed/);
console.log('PASS pending is owner-only; public runs excluded; manual private imports included; discard only deletes matching private row; stale rows refuse');
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<main></main>');globalThis.document=dom.window.document;
dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true};
dom.window.HTMLDialogElement.prototype.close=function(){this.open=false};
const slot=document.querySelector('main');let reads=[];
function reader(result){return {from(table){reads.push(table);const q={select(){return q},eq(k,v){reads.push([k,v]);return q},not(k,op,v){reads.push([k,op,v]);return q},gte(k,v){reads.push([k,'gte',v]);return q},order(){return result}};return q}}}
let resolve;const deferred=new Promise(r=>resolve=r);let current=true;
const loading=Q.mount({client:reader(deferred),owner:'owner',slot,esc:s=>s,current:()=>current,open:true});
current=false;resolve({data:[run],error:null});await loading;assert.equal(slot.children.length,0,'logout or navigation must cancel the pending mount');
reads=[];await Q.read(reader(Promise.resolve({data:[run,{...run,profile_id:'other'}],error:null})),'owner');
assert.deepEqual(reads,['runs',['profile_id','owner'],['visibility','private'],['created_at','gte','2026-10-13T16:00:00Z']]);
await Q.mount({client:reader(Promise.resolve({data:null,error:new Error('TEST DATA read failure')})),owner:'owner',slot,esc:s=>s,current:()=>true,open:false});
assert.match(slot.textContent,/could not load/);assert.doesNotMatch(slot.textContent,/No agent runs/);
console.log('PASS query is scoped to owner and private rows; logout/navigation cancels mounting; failure is not an empty queue');

slot.innerHTML='';
await Q.mount({client:reader(Promise.resolve({data:[{...run,source_actor_id:null,title:'TEST DATA manual'}],error:null})),owner:'owner',slot,esc:s=>s,current:()=>true,open:false});
assert.match(slot.textContent,/Only me. Not public/);
assert.equal(slot.querySelector('a').getAttribute('href'),'/?run=run&review=1');
console.log('PASS existing private manual import has review entry and explicit private marker');

const F=require('../site/feed-card.js');
assert.match(F.privateMarker(run),/Only you can see this/);
assert.equal(F.privateMarker({...run,visibility:'public'}),'');
assert.equal(F.privateMarker({...run,visibility:'link'}),'');

assert.equal(Q.waiting({...run,created_at:'2026-10-13T12:00:00Z'},'owner'),false);
assert.equal(Q.waiting({...run,id:'night-parent',created_at:'2026-10-14T05:00:00Z'},'owner'),true);
assert.equal(Q.waiting(run,'other'),false);

assert.equal(Q.waiting({...run,created_at:'2026-10-13T15:59:59Z'},'owner'),false);
assert.equal(Q.waiting({...run,created_at:'2026-10-13T16:00:00Z'},'owner'),true);
assert.equal(Q.waiting({...run,created_at:'2026-10-13T18:00:00Z'},'owner'),true);
