import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const run={id:'11111111-1111-4111-a111-111111111111',visibility:'public'};
const seed=['one','two','three'].map((id,sort_position)=>({id,role:'photo',is_selected:true,is_private:false,sort_position,url:`/api/run-photos?run_id=${run.id}&id=${id}`}));
async function setup(){
 const w=new JSDOM('<div id="photos"></div>',{url:'https://striverun.app',runScripts:'outside-only'}).window,writes=[];
 w.URL.createObjectURL=()=> 'blob:TEST';w.URL.revokeObjectURL=()=>{};
 w.fetch=async(path,opts={})=>{if(opts.method&&opts.method!=='GET'){writes.push({path,method:opts.method,body:opts.body?JSON.parse(opts.body):null});return {ok:true,json:async()=>({})}}return path.includes('?run_id=')&&!path.includes('&id=')?{ok:true,json:async()=>({photos:seed.map(p=>({...p}))})}:{ok:true,blob:async()=>new w.Blob(['TEST'])}};
 w.eval(fs.readFileSync('site/run-photos.js','utf8'));
 const editor=await w.StriveRunPhotos.mount({client:null,run,slot:w.document.querySelector('#photos'),owner:true,staged:true,status(){}});
 return {w,editor,writes};
}
const edit=await setup(),d=edit.w.document;
assert.equal(d.querySelectorAll('.run-photo-grid figure').length,3);
assert.equal(d.querySelectorAll('[data-photo-role],[data-photo-cover],[data-photo-delete]').length,0,'no old control jungle');
assert.equal(d.querySelectorAll('[data-photo-private]').length,3);
assert.equal(d.querySelectorAll('[data-photo-selected]').length,3);
assert.equal(d.querySelector('[data-photo-file]').multiple,true);
await d.querySelector('[data-photo-selected="two"]').onclick();
assert.equal(d.querySelectorAll('.run-photo-grid figure').length,2,'removed image leaves grid');
assert.equal(edit.writes.length,0,'edit staged until Save');
await d.querySelector('[data-photo-undo]').onclick();
assert.equal(d.querySelectorAll('.run-photo-grid figure').length,3,'Undo restores the same image');
await d.querySelector('[data-photo-private="one"]').onclick();
assert.equal(d.querySelector('[data-photo-private="one"]').getAttribute('aria-pressed'),'true');
const dragged=d.querySelector('[data-photo-id="three"]'),target=d.querySelector('[data-photo-id="one"]');
dragged.ondragstart({dataTransfer:{setData(){}}});await target.ondrop({preventDefault(){}});
assert.equal(d.querySelector('.run-photo-grid figure').dataset.photoId,'three','drop reorders the grid');
await edit.editor.save();
assert.deepEqual(edit.writes.map(w=>w.body),[
 {run_id:run.id,photo_id:'one',is_private:true},
 {run_id:run.id,photo_order:['three','one','two']}
]);
const cancel=await setup();await cancel.w.document.querySelector('[data-photo-selected="two"]').onclick();cancel.editor();assert.equal(cancel.writes.length,0);
console.log('PASS compact editor: one grid, remove/Undo, privacy, drag order, staged Save and Cancel.');
