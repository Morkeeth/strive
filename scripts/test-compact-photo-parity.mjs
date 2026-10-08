import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
const require=createRequire(import.meta.url),Card=require('../site/day-card.js'),Day=require('../site/day.js');
const runId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',photoId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const photo=(id=photoId,role='photo',is_cover=false)=>({id,role,is_cover,url:`/api/run-photos?id=${id}&run_id=${runId}`});
async function check(photos,{expect=null,deny=false,choices=null,hidden=false,actualRunId=runId}={}){
 const run={id:actualRunId,project:'TEST DATA',started_at:'2026-10-08T12:00:00Z',duration_s:60,tool_calls:2};
 const day=Day.localDay(new Date(run.started_at)),key=await Card.token('owner',day+'_'+day,run.project);
 const deck=Card.slides(Day.compute([run],day,v=>v),new Map([[run.project,key]]),choices);
 const html=Card.render(deck,{esc:s=>String(s),author:'TEST DATA'});
 const dom=new JSDOM(html,{url:'https://striverun.app'});if(hidden)dom.window.document.querySelector('.dc-slide').hidden=true;
 const calls=[];const ctx={document:dom.window.document,location:dom.window.location,AbortController,URL:Object.assign(class extends URL{},{createObjectURL:()=> 'blob:test',revokeObjectURL(){}}),fetch:async path=>{calls.push(path);return path.includes('?run_id=')?{ok:!deny,status:deny?404:200,json:async()=>({photos})}:{ok:true,headers:{get:()=>null},blob:async()=>({})}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('site/run-photos.js','utf8'),ctx);
 await ctx.StriveRunPhotos.mountVisuals({client:null,root:ctx.document});
 const rendered=ctx.document.querySelector('.dc-picture img');assert.equal(!!rendered,!!expect);
 if(expect)assert.ok(calls.some(x=>x.includes('id='+expect)),`selected expected image ${expect}`);
 if(!expect)assert.ok(!calls.some(x=>x.includes('?id=')),'no guessed image request');
 if(hidden||choices)assert.equal(calls.length,0,'explicit Data or hidden slide makes no photo request');
 ctx.StriveRunPhotos.disposeAll();
}
await check([photo()],{expect:photoId});
await check([photo(),photo('cccccccc-cccc-4ccc-8ccc-cccccccccccc')]);
await check([photo(photoId,'personal')]);
await check([photo(photoId,'personal',true)],{expect:photoId});
await check([photo(),photo('cccccccc-cccc-4ccc-8ccc-cccccccccccc','photo',true)],{expect:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'});
await check([photo()],{deny:true});
await check([photo()],{hidden:true});
await check([photo()],{choices:{v:2,photo:{run:runId,id:photoId},visual:'data'}});
if(process.argv.includes('--live-public')){
 for(const id of ['13a3f7ca-6a87-4f1b-912e-a8d37f4b0e6b','ecd92674-6f5d-4fd8-ac60-13a1d8cd3c9e','18718a50-3ced-409c-a787-8d8b797ecc4f']){
  const response=await fetch('https://striverun.app/api/run-photos?run_id='+id);assert.equal(response.status,200);
  const {photos}=await response.json();assert.equal(photos.length,1);assert.equal(photos[0].is_cover,false);
  // The same real metadata shape must render through the compact component. API run IDs remain bound in URL.
  await check(photos,{expect:photos[0].id,actualRunId:id});
 }
 console.log('PASS: all three prior public photos render through compact fallback (anonymous read-only API)');
}
console.log('PASS: sole eligible photo parity, explicit cover precedence, multiple/personal exclusion, access denial, hidden slide and explicit Data');
