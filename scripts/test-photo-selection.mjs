import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import {bootDisposable,seedJourneyActors,seedCoachRun,startDisposableServer,mintJwt,CASEY,RILEY} from './disposable-supabase.mjs';
import {runPhotos} from '../server/run-photos.mjs';
import {readPublicPhotos,html} from '../server/public-run.mjs';
const {db,as,anonymous}=await bootDisposable();await seedJourneyActors(db);
const run=await seedCoachRun(db,CASEY,'TEST DATA selection','a'.repeat(64),'now()');await as(CASEY);
await db.query("update strava.runs set visibility='public' where id=$1",[run]);
const add=async role=>(await db.query('insert into strava.run_photos(run_id,width,height,byte_size,role) values($1,100,100,200,$2) returning *',[run,role])).rows[0];
const project=await add('result'),personal=await add('personal'),unchosen=await add('personal');
assert.equal(project.is_selected,true,'existing/default selection stays on');
await db.query('select strava.choose_run_cover($1,$2)',[run,personal.id]);
const set=(who,value)=>db.query('select strava.set_run_photo_selected($1,$2,$3)',[run,who,value]);
await set(project.id,false);await anonymous();
assert.deepEqual((await db.query('select id from strava.run_photos where run_id=$1',[run])).rows.map(p=>p.id),[personal.id],'RLS hides project and unchosen personal metadata from anonymous readers');
await assert.rejects(set(project.id,true),/permission denied/);
await as(RILEY);assert.equal((await db.query('select id from strava.run_photos where id=$1',[project.id])).rows.length,0);await assert.rejects(set(project.id,true),/Run not found/);
await as(CASEY);assert.equal((await db.query('select id from strava.run_photos where run_id=$1',[run])).rows.length,3);await set(project.id,true);await set(personal.id,false);
await anonymous();assert.deepEqual((await db.query('select id from strava.run_photos where run_id=$1',[run])).rows.map(p=>p.id),[project.id]);
await as(CASEY);await set(personal.id,true);await assert.rejects(set(project.id,null),/whether to show/);
await db.exec('reset role');await db.exec(await readFile('supabase/strava/036_photo_selection.sql','utf8'));
assert.equal((await db.query('select count(*)::int n from strava.run_photos where run_id=$1',[run])).rows[0].n,3,'migration retry and selection never delete rows');// Owner Hide → Save → reload → Show → Save exercises the real editor, API and SQL RPC.
const shim=await startDisposableServer(db),ownerToken=mintJwt(CASEY,'test@example.test');
const liveConfig={SB_URL:shim.url,SB_KEY:'test',STORAGE_KEY:'test'};
const storedBytes=Buffer.from('UNCHANGED TEST IMAGE');
const transport=(url,options)=>url.includes('/storage/')?Promise.resolve(new Response(storedBytes)):fetch(url,options);
const wire=(method,query={},body,owner=false)=>runPhotos({method,query,body,headers:owner?{authorization:'Bearer '+ownerToken}:{}},liveConfig,transport);
async function openEditor(){
 const w=new JSDOM('<div id="photos"></div>',{url:'https://strive.test',runScripts:'outside-only'}).window;w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
 w.fetch=async(path,options={})=>{const u=new URL(path,'https://strive.test');const r=await wire(options.method||'GET',Object.fromEntries(u.searchParams),options.body?JSON.parse(options.body):undefined,true);return new Response(Buffer.isBuffer(r.body)?r.body:JSON.stringify(r.body),{status:r.status,headers:r.headers});};
 w.eval(await readFile('site/run-photos.js','utf8'));
 const editor=await w.StriveRunPhotos.mount({client:{auth:{getSession:async()=>({data:{session:{access_token:ownerToken}}})}},run:{id:run,visibility:'public'},slot:w.document.querySelector('#photos'),owner:true,staged:true,status(){}});
 return {w,editor,button:()=>w.document.querySelector('[data-photo-selected="'+project.id+'"]')};
}
let editor=await openEditor();await editor.button().onclick();assert.equal((await wire('GET',{run_id:run,id:project.id})).status,200,'staging Hide does not change reader access');await editor.editor.save();editor.editor();
assert.equal((await wire('GET',{run_id:run,id:project.id})).status,404,'saved Hide removes known-id reader access');
editor=await openEditor();assert.equal(editor.button().getAttribute('aria-pressed'),'false','reload shows saved hidden state to owner');await editor.button().onclick();await editor.editor.save();editor.editor();
const restored=await wire('GET',{run_id:run,id:project.id});assert.equal(restored.status,200);assert.deepEqual(restored.body,storedBytes,'Show restores the same stored image bytes');
await new Promise(resolve=>shim.server.close(resolve));await db.close();

// Exercise API defenses even if a metadata adapter returns an owner-only row.
const hidden={...project,is_selected:false},config={SB_URL:'https://db.test',SB_KEY:'test',STORAGE_KEY:'test'},calls=[];
const fetcher=async (url,opts={})=>{calls.push({url,...opts});if(url.includes('rpc/grinder_profile_id'))return Response.json(opts.headers.Authorization==='Bearer owner'?CASEY:RILEY);if(url.includes('runs?'))return Response.json(!url.includes('profile_id=')||url.includes(CASEY)?[{id:run}]:[]);if(url.includes('run_photos?'))return Response.json([hidden]);if(url.includes('rpc/set_run_photo_selected'))return Response.json(project.id);if(url.includes('/storage/'))return new Response('TEST IMAGE');throw Error(url)};
for(const who of [null,'other']){
 const headers=who?{authorization:'Bearer '+who}:{};
 const list=await runPhotos({method:'GET',headers,query:{run_id:run}},config,fetcher);assert.deepEqual(list.body.photos,[]);
 for(const w of [undefined,'64','960']){const start=calls.length;const res=await runPhotos({method:'GET',headers:{...headers,'if-none-match':`"${project.id}.${w||'full'}"`},query:{run_id:run,id:project.id,w}},config,fetcher);assert.equal(res.status,404);assert.ok(!calls.slice(start).some(c=>c.url.includes('/storage/')),'hidden image denied before bytes and before 304');}
}
assert.equal((await runPhotos({method:'GET',headers:{authorization:'Bearer owner'},query:{run_id:run,id:project.id}},config,fetcher)).status,200);
for(const selected of [false,true]){const res=await runPhotos({method:'PATCH',headers:{authorization:'Bearer owner'},body:{run_id:run,photo_id:project.id,is_selected:selected}},config,fetcher);assert.equal(res.status,200);assert.equal(JSON.parse(calls.at(-1).body).selected,selected);}
assert.equal((await runPhotos({method:'PATCH',headers:{authorization:'Bearer owner'},body:{run_id:run,photo_id:project.id,is_selected:'false'}},config,fetcher)).status,400);
assert.equal((await runPhotos({method:'PATCH',headers:{authorization:'Bearer other'},body:{run_id:run,photo_id:project.id,is_selected:false}},config,fetcher)).status,404);
const publicRun={id:run,title:'TEST DATA selection',visibility:'public'};
assert.deepEqual(await readPublicPhotos(publicRun,async()=>Response.json([hidden])),[]);
assert.ok(!html(publicRun,{photos:[hidden]}).includes(project.id),'public page never emits hidden image id');
console.log('PASS photo selection: RLS, defaults, owner restore, no deletion, RPC grants, list/direct bytes/304/width variants, public server read/render and strict API writes.');
