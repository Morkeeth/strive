import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';

// When the embedded Following join fails, People reads the followed profiles directly. After
// 042_private_auth_uid.sql no reader may select profiles.auth_uid, so a `*` read is refused there.
const reads=[];
function from(table){
 const q={table,columns:null,filters:[]};
 const chain={
  select(columns){q.columns=columns;return chain},
  eq(key,value){q.filters.push(['eq',key,value]);return chain},
  in(key,values){q.filters.push(['in',key,values]);return chain},
  order(){return chain},
  limit(){return chain},
  then(ok,fail){reads.push(q);return Promise.resolve(answer(q)).then(ok,fail)},
 };
 return chain;
}
function answer(q){
 if(q.table==='grinder_follows'&&/profiles!/.test(q.columns))return {data:null,error:{message:'Could not find a relationship between grinder_follows and profiles'}};
 if(q.table==='grinder_follows')return {data:[{followed_id:'fixture-2'}],error:null};
 if(q.table==='profiles'){
  const columns=q.columns.split(',').map(c=>c.trim());
  if(columns.includes('*')||columns.includes('auth_uid'))return {data:null,error:{code:'42501',message:'permission denied for table profiles'}};
  return {data:[{id:'fixture-2',handle:'fixture-2',display_name:'Test fixture 2'}],error:null};
 }
 return {data:[],error:null};
}
const dom=new JSDOM('<main id="app"></main>',{url:'https://striverun.app/?people'});
const ctx={window:{},document:dom.window.document,location:dom.window.location,history:dom.window.history,URLSearchParams,Math};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('site/run-links.js','utf8'),ctx);vm.runInContext(fs.readFileSync('site/people.js','utf8'),ctx);
const errors=[];
const ui=ctx.window.GrinderPeople({client:{from,rpc:async()=>({data:[],error:null})},me:()=>({id:'fixture-1',handle:'fixture-1'}),app:()=>ctx.document.getElementById('app'),frame(){},status(message,isError){if(isError)errors.push(message)}});
await ui.discover('');
const profileRead=reads.find(q=>q.table==='profiles');
assert.ok(profileRead,'the fallback reads the followed profiles');
assert.deepEqual(profileRead.filters,[['in','id',['fixture-2']]]);
assert.deepEqual(errors,[],'no error is shown');
assert.match(ctx.document.querySelector('.people-section h2')?.textContent||'',/People you follow/);
assert.ok(ctx.document.querySelector('.people-section [data-profile-id="fixture-2"]'),'the followed builder is listed');
console.log('PASS Following fallback reads named profile columns, without auth_uid, and still lists the followed builder');
