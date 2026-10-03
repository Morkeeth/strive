import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync('site/run-photos.js','utf8');
const pending=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
for(const phase of ['list','blob']){
 const pause=pending(),entered=pending();let active=true;const appended=[],created=[],revoked=[];
 const grid={append:item=>appended.push(item)};
 const slot={innerHTML:'',isConnected:true,querySelector:()=>grid,querySelectorAll:()=>[]};
 const ctx={location:{origin:'https://example.test'},URL:Object.assign(class extends URL {},{createObjectURL:()=>{created.push('blob:private');return 'blob:private'},revokeObjectURL:u=>revoked.push(u)}),AbortController,
 document:{createElement:()=>({innerHTML:''})},fetch:async path=>{
  if(path.includes('?run_id=')){if(phase==='list'){entered.resolve();await pause.promise}return {ok:true,json:async()=>({photos:[{url:'/api/run-photos?id=p&run_id=r'}]})}}
  return {ok:true,blob:async()=>{entered.resolve();await pause.promise;return {}}};
 }};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 const job=ctx.StriveRunPhotos.mount({client:{auth:{getSession:async()=>({data:{session:{access_token:'A'}}})}},run:{id:'r'},slot,owner:false,status(){},isCurrent:()=>active});
 await entered.promise;active=false;ctx.StriveRunPhotos.disposeAll?.();slot.innerHTML='NEW ACCOUNT';pause.resolve();await job;
 assert.equal(slot.innerHTML,'NEW ACCOUNT',phase+' response must not replace current account');
 assert.equal(appended.length,0,phase+' must not append a private image');assert.equal(created.length,0,phase+' must not create a stale blob URL');
}
console.log('PASS: delayed photo list and image body cannot render after account invalidation');
// A normal owner load still renders a photo; disposal revokes its object URL.
{
 const appended=[],revoked=[];const grid={append:item=>appended.push(item)};
 const slot={innerHTML:'',isConnected:true,querySelector:()=>grid,querySelectorAll:()=>[]};
 const ctx={location:{origin:'https://example.test'},URL:Object.assign(class extends URL {},{createObjectURL:()=> 'blob:owner',revokeObjectURL:u=>revoked.push(u)}),AbortController,
 document:{createElement:()=>({innerHTML:''})},fetch:async path=>path.includes('?run_id=')?{ok:true,json:async()=>({photos:[{url:'/api/run-photos?id=p&run_id=r'}]})}:{ok:true,blob:async()=>({})}};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 await ctx.StriveRunPhotos.mount({client:null,run:{id:'r'},slot,owner:false,status(){}});
 assert.equal(appended.length,1);assert.match(appended[0].innerHTML,/blob:owner/);
 ctx.StriveRunPhotos.disposeAll();assert.deepEqual(revoked,['blob:owner']);assert.equal(slot.innerHTML,'');
}
console.log('PASS: normal photo render remains working and disposal revokes private blob');
// Covers use a separate loader. A late body must also be discarded after disposeAll.
{
 const pause=pending(),entered=pending();let appended=0,created=0;
 const card={dataset:{runId:'r'},isConnected:true,querySelector:()=>({prepend:()=>appended++})};
 const ctx={location:{origin:'https://example.test'},URL:Object.assign(class extends URL {},{createObjectURL:()=>{created++;return 'blob:old'},revokeObjectURL(){}}),AbortController,
 document:{createElement:()=>({})},fetch:async path=>path.includes('?run_id=')?{ok:true,json:async()=>({photos:[{url:'/api/run-photos?id=p&run_id=r'}]})}:{ok:true,blob:async()=>{entered.resolve();await pause.promise;return {}}}};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 const job=ctx.StriveRunPhotos.mountCovers({client:null,root:{querySelectorAll:()=>[card]}});
 await entered.promise;ctx.StriveRunPhotos.disposeAll();pause.resolve();await job;
 assert.equal(appended,0);assert.equal(created,0);
}
console.log('PASS: delayed feed cover is discarded on disposal');
