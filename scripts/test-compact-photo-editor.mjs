import assert from 'node:assert/strict';import fs from 'node:fs';import {JSDOM} from 'jsdom';
const run={id:'11111111-1111-4111-a111-111111111111',visibility:'public'};
const photo=(id,role,cover=false)=>({id,role,is_cover:cover,url:`/api/run-photos?run_id=${run.id}&id=${id}`});
const seed=[photo('one','personal',true),photo('two','result'),photo('three','personal')];
async function setup(){const w=new JSDOM('<div id="photos"></div>',{url:'https://striverun.app',runScripts:'outside-only'}).window,writes=[];w.URL.createObjectURL=()=> 'blob:TEST';w.URL.revokeObjectURL=()=>{};w.fetch=async(path,opts={})=>{if(opts.method&&opts.method!=='GET'){writes.push({path,...opts,body:opts.body?JSON.parse(opts.body):null});return {ok:true,json:async()=>({})}}return path.includes('?run_id=')&&!path.includes('&id=')?{ok:true,json:async()=>({photos:seed.map(p=>({...p}))})}:{ok:true,blob:async()=>new w.Blob(['TEST'])}};w.eval(fs.readFileSync('site/run-photos.js','utf8'));const editor=await w.StriveRunPhotos.mount({client:null,run,slot:w.document.querySelector('#photos'),owner:true,staged:true,status(){}});return {w,editor,writes};}
const {w,editor,writes}=await setup();assert.equal(w.document.querySelectorAll('select[data-photo-role]').length,0);
await w.document.querySelector('[data-photo-role="two"][data-role="before"]').onclick();await w.document.querySelector('[data-photo-cover="two"]').onclick();
assert.equal(writes.length,0,'role and cover stay local until the form Save');assert.equal(w.document.querySelector('[data-photo-role="two"][data-role="before"]').getAttribute('aria-pressed'),'true');
await editor.save();assert.deepEqual(writes.map(x=>x.body),[{run_id:run.id,photo_id:'two',role:'before'},{run_id:run.id,photo_id:'two'}]);
const cancel=await setup();await cancel.w.document.querySelector('[data-photo-role="two"][data-role="after"]').onclick();cancel.editor();assert.equal(cancel.writes.length,0,'Cancel/disposal never saves a staged image choice');
const removal=await setup();await removal.w.document.querySelector('[data-photo-delete$="id=three"]').onclick();assert.equal(removal.writes.length,0);await removal.editor.save();assert.equal(removal.writes[0].method,'DELETE');assert.match(removal.writes[0].path,/id=three/);
console.log('PASS real photo editor: direct role controls; role, cover, removal staged; one Save invokes existing owner API; Cancel makes no writes.');
