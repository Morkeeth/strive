import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
async function preview(rows){
 const dom=new JSDOM('<main id="app"></main>',{url:'https://striverun.app/?people'}),calls=[];
 const ctx={window:{},document:dom.window.document,location:dom.window.location,history:dom.window.history,URLSearchParams,Math};vm.createContext(ctx);vm.runInContext(fs.readFileSync('site/people.js','utf8'),ctx);
 const ui=ctx.window.GrinderPeople({client:{rpc:async(name)=>{calls.push(name);return {data:rows}}},me:()=>null,app:()=>ctx.document.getElementById('app'),frame(){},status(){}});await ui.discover('');return {document:ctx.document,calls};
}
// Explicit test fixtures, never stored or shown in the product preview.
const rows=[1,2,3].map(n=>({id:'fixture-'+n,handle:'fixture-'+n,display_name:'Test fixture '+n,public_runs:n}));
const one=await preview(rows.slice(0,1));assert.equal(one.document.querySelector('#people-roll'),null);assert.equal(one.document.querySelectorAll('.people-card').length,1);
const many=await preview(rows),slot=many.document.querySelector('#people-spotlight');let previous=slot.querySelector('.people-card').dataset.profileId;
for(let i=0;i<12;i++){
 many.document.querySelector('#people-roll').click();const selected=slot.querySelector('.people-card').dataset.profileId;
 assert.notEqual(selected,previous,'roll avoids immediately repeating the current builder');assert.ok(rows.some(row=>row.id===selected),'roll stays inside the returned public pool');previous=selected;
}
assert.deepEqual(many.calls,['grinder_recent_builders'],'rolling does not write follows or make another remote call');
console.log('PASS public builder spotlight, single-person state, nonrepeating roll, no writes');
