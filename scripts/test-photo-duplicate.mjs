import assert from 'node:assert/strict';
import sharp from 'sharp';
import {runPhotos} from '../server/run-photos.mjs';
const owner='11111111-1111-4111-8111-111111111111',run='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';
const photos=[],blobs=new Map();let inserts=0,writes=0;
const json=(x,status=200)=>new Response(JSON.stringify(x),{status});
const fetcher=async(url,options={})=>{
 const u=new URL(url),body=typeof options.body==='string'?JSON.parse(options.body):options.body;
 if(u.pathname.endsWith('grinder_profile_id'))return json(owner);
 if(u.pathname.endsWith('/runs'))return json([{id:run}]);
 if(u.pathname.endsWith('/run_photos')){
  if(options.method==='POST'){
   if(photos.some(p=>p.run_id===body.run_id&&p.content_sha256===body.content_sha256))return json({},409);
   inserts++;photos.push({...body});return json([{...body}],201);
  }
  return json(photos.filter(p=>(!u.searchParams.has('run_id')||p.run_id===u.searchParams.get('run_id').slice(3))&&(!u.searchParams.has('id')||p.id===u.searchParams.get('id').slice(3))));
 }
 if(u.pathname.includes('/storage/v1/object/')){
  const key=u.pathname.split('/storage/v1/object/')[1].replace(/^authenticated\//,'');
  if(options.method==='POST'){writes++;blobs.set(key,body);return json({});}
  return blobs.has(key)?new Response(blobs.get(key)):json({},404);
 }
 throw Error('Unexpected request '+url);
};
const config={SB_URL:'https://local.invalid',SB_KEY:'public',STORAGE_KEY:'server'};
const bytes=await sharp({create:{width:10,height:10,channels:3,background:'#145bee'}}).png().toBuffer();
const call=(run_id=run)=>runPhotos({method:'POST',headers:{authorization:'Bearer local'},body:{run_id,image_base64:bytes.toString('base64')}},config,fetcher);
const first=await call();assert.equal(first.status,201);
const second=await call();assert.equal(second.status,200);assert.equal(second.body.duplicate,true);assert.equal(second.body.photo.id,first.body.photo.id);assert.equal(inserts,1);assert.equal(writes,1);
photos[0].content_sha256=null;assert.equal((await call()).body.duplicate,true,'legacy photo bytes are also compared within this run');
assert.equal((await call(other)).status,201,'same photo on another run is an author choice, not a global duplicate');
const duplicate=photos[1],key=`strive-run-photos/${duplicate.run_id}/${duplicate.id}.jpg`;blobs.delete(key);
assert.equal((await call(other)).status,409,'pending upload cannot be reported as complete');
assert.equal(inserts,2);assert.equal(writes,2);
console.log('PASS exact photo retry: same ID/no second write, legacy match, per-run isolation, pending upload refusal');
const {bootDisposable,seedJourneyActors,CASEY}=await import('./disposable-supabase.mjs');
const {db,as}=await bootDisposable();await seedJourneyActors(db);await as(CASEY);
const addRun=async(rev)=>(await db.query("insert into strava.runs(profile_id,title,harness,schema_version,measurement_revision,trace_basis,rhythm) values($1,'TEST DATA duplicate','codex',1,$2,'elapsed','[1]') returning id",[CASEY,rev.repeat(64)])).rows[0].id;
const one=await addRun('a'),two=await addRun('b');
const addPhoto=id=>db.query("insert into strava.run_photos(run_id,width,height,byte_size,content_sha256) values($1,10,10,100,repeat('c',64))",[id]);
await addPhoto(one);await assert.rejects(addPhoto(one),/duplicate key/);await addPhoto(two);
await db.close();console.log('PASS real SQL exact-content uniqueness within run, separate runs allowed');
