import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const run={id:'11111111-1111-4111-a111-111111111111',visibility:'public'};
const seed=['one','two','three'].map((id,sort_position)=>({id,role:'photo',is_selected:true,is_private:false,sort_position,url:`/api/run-photos?run_id=${run.id}&id=${id}`}));
async function setup(){
 // Every stylesheet the page loads, in page order, inside the real editor container.
 const page=fs.readFileSync('site/index.html','utf8'),css=[...page.matchAll(/<style>([\s\S]*?)<\/style>|<link rel="stylesheet" href="\/([\w.-]+\.css)">/g)].map(m=>m[1]??fs.readFileSync('site/'+m[2],'utf8')).join('\n');
 const w=new JSDOM('<style>'+css+'</style><div id="run-edit"><div id="photos"></div></div>',{url:'https://striverun.app',runScripts:'outside-only'}).window,writes=[];
 w.URL.createObjectURL=()=> 'blob:TEST';w.URL.revokeObjectURL=()=>{};
 w.fetch=async(path,opts={})=>{if(opts.method&&opts.method!=='GET'){writes.push({path,method:opts.method,body:opts.body?JSON.parse(opts.body):null});return {ok:true,json:async()=>({})}}return path.includes('?run_id=')&&!path.includes('&id=')?{ok:true,json:async()=>({photos:seed.map(p=>({...p}))})}:{ok:true,blob:async()=>new w.Blob(['TEST'])}};
 for(const name of ['photo-grid.js','run-photos.js'])w.eval(fs.readFileSync('site/'+name,'utf8'));
 const editor=await w.StriveRunPhotos.mount({client:null,run,slot:w.document.querySelector('#photos'),owner:true,staged:true,status(){}});
 return {w,editor,writes};
}
const edit=await setup(),d=edit.w.document,tiles=()=>[...d.querySelectorAll('.photo-editor-grid .photo-tile[data-photo-id]')];
const click=async selector=>{await d.querySelector(selector).onclick()};
assert.equal(tiles().length,3);
const thumbnail=edit.w.getComputedStyle(d.querySelector('.photo-tile>img'));
assert.equal(thumbnail.position,'absolute','thumbnail fills its frame independently of intrinsic size');
assert.equal(thumbnail.width,'100%');assert.equal(thumbnail.height,'100%');assert.equal(thumbnail.objectFit,'cover');
assert.equal(d.querySelectorAll('[data-photo-role],[data-photo-cover],[data-photo-delete]').length,0,'no old control jungle');
assert.equal(d.querySelectorAll('[data-photo-private]').length,3);
assert.equal(d.querySelectorAll('[data-photo-remove]').length,3);
assert.equal(d.querySelector('[data-photo-file]').multiple,true);
assert.deepEqual(tiles().map(tile=>tile.querySelector('.photo-audience').textContent),['Public','Public','Public'],'this fixture run is public');
await click('[data-photo-remove="two"]');
assert.equal(tiles().length,2,'removed image leaves grid');
assert.equal(edit.writes.length,0,'edit staged until Save');
await click('[data-photo-undo]');
assert.equal(tiles().length,3,'Undo restores the same image');
await click('[data-photo-private="one"]');
assert.equal(d.querySelector('[data-photo-private="one"]').getAttribute('aria-pressed'),'true');
assert.equal(d.querySelector('[data-photo-private="one"]').textContent,'Hidden');
const dragged=d.querySelector('[data-photo-id="three"]'),target=d.querySelector('[data-photo-id="one"]');
dragged.ondragstart({dataTransfer:{setData(){}}});await target.ondrop({preventDefault(){},stopPropagation(){}});
await new Promise(resolve=>setTimeout(resolve,20));
assert.equal(tiles()[0].dataset.photoId,'three','drop reorders the grid');
assert.equal(tiles()[0].querySelector('.photo-cover-tag').textContent,'Cover','first visible photo is the cover');
await edit.editor.save();
assert.deepEqual(edit.writes.map(w=>w.body),[
 {run_id:run.id,photo_id:'one',is_private:true},
 {run_id:run.id,photo_order:['three','one','two']}
]);
const cancel=await setup();await cancel.w.document.querySelector('[data-photo-remove="two"]').onclick();cancel.editor();assert.equal(cancel.writes.length,0);
console.log('PASS compact editor: one grid, remove/Undo, privacy, drag order, staged Save and Cancel.');
