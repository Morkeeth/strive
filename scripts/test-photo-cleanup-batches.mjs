import assert from 'node:assert/strict';
import {cleanupPhotos} from './cleanup-run-photos.mjs';
const config={SB_URL:'http://unused.local',STORAGE_KEY:'local-test'};
const names=Array.from({length:100},(_,i)=>`11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-${String(i).padStart(12,'0')}.jpg`);
let active=0,peak=0;const calls=[];
const request=async(url,opts)=>{calls.push({url,method:opts.method,body:opts.body});active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,2));active--;return {ok:true,json:async()=>names.map(object_name=>({object_name}))};};
const out=await cleanupPhotos(config,request);
assert.deepEqual(out,{removed:100,remaining_unknown:true});
assert.equal(calls.length,11,'one queue read and five storage/delete-ack batches');
assert.ok(peak<=5);assert.ok(peak>1);
const stored=calls.filter(c=>c.url.includes('/storage/')).flatMap(c=>JSON.parse(c.body).prefixes);assert.deepEqual(stored.sort(),names.toSorted());
const ack=calls.filter(c=>c.method==='DELETE'&&c.url.includes('/rest/'));assert.equal(ack.length,5);assert.ok(ack.every(c=>c.url.length<2500));
let writes=0;await assert.rejects(cleanupPhotos(config,async(url,opts)=>{if(opts.method)writes++;return {ok:true,json:async()=>[{object_name:'invalid'}]};}));assert.equal(writes,0);
let acknowledgements=0;await assert.rejects(cleanupPhotos(config,async(url,opts)=>{
 if(!opts.method)return {ok:true,json:async()=>[{object_name:names[0]}]};
 if(url.includes('/storage/'))return {ok:false};
 acknowledgements++;return {ok:true};
}));assert.equal(acknowledgements,0);
console.log('100 queued photos use11 bounded requests, up to5 concurrent; malformed queues and failed storage never acknowledge.');
let erased=0,acks=0;
await assert.rejects(cleanupPhotos(config,async(url,opts)=>{
 if(!opts.method)return {ok:true,json:async()=>[{object_name:names[0]}]};
 if(url.includes('/storage/')){erased++;return {ok:true};}
 acks++;return {ok:false};
}),/acknowledgement failed/);
assert.equal(erased,1);assert.equal(acks,1);
let emptyWrites=0;assert.deepEqual(await cleanupPhotos(config,async(url,opts)=>{if(opts.method)emptyWrites++;return {ok:true,json:async()=>[]};}),{removed:0,remaining_unknown:false});assert.equal(emptyWrites,0);
const {readFileSync}=await import('node:fs');assert.equal(JSON.parse(readFileSync('vercel.json','utf8')).functions['api/photo-cleanup.js'].maxDuration,60);
