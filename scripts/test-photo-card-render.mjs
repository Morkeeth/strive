import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
// Take the real run-card template, not a made-up .fc fixture.
const html=fs.readFileSync('site/index.html','utf8');
const template=html.slice(html.indexOf('return `<div class="card" id="card-'));
assert.ok(template.startsWith('return `<div class="card"'));
const opening=template.slice(8,template.indexOf('>')+1).replace(/\$\{[^}]+\}/g,'run-test');
const dom=new JSDOM(opening+'<div class="run-title-row">A run</div><div class="run-signature">Map stays visible</div></div>',{url:'https://striverun.app'});
const calls=[];
const ctx={document:dom.window.document,location:dom.window.location,AbortController,URL:Object.assign(class extends URL {},{createObjectURL:()=> 'blob:photo',revokeObjectURL(){}}),fetch:async path=>{calls.push(path);return path.includes('?run_id=')?{ok:true,json:async()=>({photos:[{url:'/api/run-photos?id=photo-test&run_id=run-test'}]})}:{ok:true,blob:async()=>({})}}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('site/run-photos.js','utf8'),ctx);
await ctx.StriveRunPhotos.mountCovers({client:null,root:ctx.document});
assert.equal(ctx.document.querySelectorAll('.card .run-photo-cover').length,1,'real profile card must show its saved photo');
assert.equal(ctx.document.querySelector('.run-signature').textContent,'Map stays visible');
await ctx.StriveRunPhotos.mountCovers({client:null,root:ctx.document});
assert.equal(calls.length,2,'rewiring must not fetch duplicate covers');
ctx.StriveRunPhotos.disposeAll();assert.equal(ctx.document.querySelectorAll('.run-photo-cover').length,0);
console.log('PASS: actual profile/run-card markup renders a saved photo with its map, once, and disposes it');
// Remount while the shared list is in flight: the abandoned chooser must not cancel its successor.
const chooser=ctx.document.createElement('div');ctx.document.body.append(chooser);
let releaseList,releaseBlob;const readOpts=[],made=[];
ctx.URL.createObjectURL=blob=>{made.push(blob);return 'blob:chosen'};
ctx.fetch=async(path,opts)=>{
 readOpts.push(opts);
 if(path.includes('?run_id='))return await new Promise(resolve=>{releaseList=()=>resolve({ok:true,json:async()=>({photos:[{id:'p',url:'/api/run-photos?id=p&run_id=r',width:100,height:100,role:'result'}]})})});
 return {ok:true,headers:{get:()=>null},blob:async()=>await new Promise(resolve=>{releaseBlob=()=>resolve({picture:true})})};
};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
ctx.StriveRunPhotos.mountChooser({slot:chooser,runs:[{id:'r',label:'First'}],onPick(){}});await tick();
ctx.StriveRunPhotos.mountChooser({slot:chooser,runs:[{id:'r',label:'Second'}],onPick(){}});await tick();
assert.equal(readOpts.length,1,'two subscribers share the same list');
assert.equal(readOpts[0].signal,undefined,'subscriber abort does not own shared network request');
releaseList();await tick();releaseBlob();await tick();
assert.equal(chooser.querySelectorAll('img').length,1);assert.match(chooser.textContent,/Second/);assert.ok(!chooser.textContent.includes('First'));assert.equal(made.length,1,'abandoned chooser creates no blob URL');
ctx.StriveRunPhotos.disposeAll();
console.log('PASS: delayed shared photo request survives chooser replacement without stale render or leaked URL');
