import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
const photos=[{id:'candid-picked',role:'personal',is_cover:true},{id:'candid-other',role:'personal',is_cover:false},{id:'screenshot',role:'result',is_cover:false}].map(p=>({...p,url:`/api/run-photos?run_id=run&id=${p.id}`}));
async function gallery(owner,rows=photos,denied=false){
 const dom=new JSDOM('<div id="slot"></div>',{url:'https://striverun.app'}),calls=[];
 const ctx={document:dom.window.document,location:dom.window.location,AbortController,URL:Object.assign(class extends URL{},{createObjectURL:()=> 'blob:image',revokeObjectURL(){}}),fetch:async(path,opts)=>{calls.push({path,method:opts.method||'GET'});return path==='/api/run-photos?run_id=run'?{ok:!denied,status:denied?404:200,json:async()=>denied?{error:'Photo not found'}:{photos:rows}}:{ok:true,blob:async()=>({})}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('site/run-photos.js','utf8'),ctx);
 const slot=ctx.document.getElementById('slot');await ctx.StriveRunPhotos.mount({client:null,run:{id:'run'},slot,owner,status(){}});
 return {slot,calls,dispose:()=>ctx.StriveRunPhotos.disposeAll()};
}
const reader=await gallery(false);assert.equal(reader.slot.querySelectorAll('img').length,2);assert.equal(reader.slot.querySelectorAll('img[alt="Personal photo"]').length,1);assert.equal(reader.slot.querySelectorAll('img[alt="Result"]').length,1);assert.ok(!reader.calls.some(c=>c.path.includes('id=candid-other')),'unchosen candid bytes are not fetched');assert.equal(reader.slot.querySelectorAll('button').length,0);reader.dispose();
const owner=await gallery(true);assert.equal(owner.slot.querySelectorAll('img').length,3);assert.equal(owner.slot.querySelector('[data-photo-cover="candid-other"]').disabled,false,'owner can choose another saved photo');assert.equal(owner.slot.querySelector('[data-photo-cover="candid-picked"]').disabled,true);assert.ok(owner.calls.every(c=>c.method==='GET'),'opening owner management never writes');owner.dispose();
const unchosen=await gallery(false,photos.map(p=>({...p,is_cover:false})));assert.equal(unchosen.slot.querySelectorAll('img[alt="Personal photo"]').length,0);assert.equal(unchosen.slot.querySelectorAll('img[alt="Result"]').length,1);unchosen.dispose();
const denied=await gallery(false,photos,true);assert.equal(denied.slot.querySelectorAll('img').length,0);assert.equal(denied.calls.length,1);denied.dispose();
console.log('PASS: one selected candid for readers, screenshots retained, owner reselection preserved, no writes and denied access hides all');
