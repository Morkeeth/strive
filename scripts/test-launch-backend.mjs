import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {bootDisposable,seedJourneyActors,CASEY,RILEY} from './disposable-supabase.mjs';
import sharp from 'sharp';
import {sanitizePhoto,runPhotos} from '../server/run-photos.mjs';
import {cleanupPhotos} from './cleanup-run-photos.mjs';

const {db,as,anonymous}=await bootDisposable();
await seedJourneyActors(db);
const captured=process.env.STRIVE_CAPTURE_SOURCE?JSON.parse(execFileSync('python3',['-c',`
import json,sys
from agentgrinder.solo import parse_solo
from agentgrinder.contract import capture_digest
from agentgrinder.engine.series import record_and_attach
from agentgrinder.push import export_run
path=sys.argv[1]
digest=capture_digest(path)
run=parse_solo(path,pick=int(sys.argv[2]))
assert capture_digest(path)==digest, 'Source changed while measuring; retry.'
run['input_digest']=digest
record_and_attach(run,path=':memory:')
print(json.dumps(export_run(run)))
`,process.env.STRIVE_CAPTURE_SOURCE,process.env.STRIVE_CAPTURE_SITTING||'3'],{encoding:'utf8'})):null;
const source=captured||(process.env.STRIVE_CAPTURE_SAMPLE?JSON.parse(readFileSync(process.env.STRIVE_CAPTURE_SAMPLE,'utf8')):
 {measurement_revision:'1'.repeat(64),schema_version:1,harness:'codex',trace_basis:'elapsed',rhythm:[1,0,2],tool_calls:3});
const RUN='91000000-0000-0000-0000-000000000001', PHOTO='92000000-0000-0000-0000-000000000001';
assert.ok(Array.isArray(source.rhythm),'The public capture must carry its measured rhythm; never substitute a made-up trace.');
await as(CASEY);
await assert.rejects(db.query("insert into strava.runs(profile_id,title) values($1,'Made up')",[CASEY]),/Import a recorded session/);
await assert.rejects(db.query("insert into strava.runs(profile_id,title,trace_basis) values($1,'Made up','typed-by-author')",[CASEY]),/Import a recorded session/);
const insert=`insert into strava.runs(id,profile_id,title,schema_version,measurement_revision,harness,trace_basis,rhythm,tool_calls,visibility)
 values($1,$2,'Recorded source',$3,$4,$5,$6,$7,$8,$9)`;
const args=[RUN,CASEY,source.schema_version,source.measurement_revision,source.harness,source.trace_basis,JSON.stringify(source.rhythm),source.tool_calls??null];
await assert.rejects(db.query(insert,[...args,'public']),/New sessions start private/);
await db.query(insert,[...args,'private']);
await assert.rejects(db.query(insert.replace('visibility)','visibility,crew_shared)').replace('$9)','$9,true)'),[RUN.replace(/1$/,'3'),CASEY,1,'3'.repeat(64),'Codex','elapsed','[1]',1,'private']),/New sessions start private/);
await assert.rejects(db.query(insert,[RUN.replace(/1$/,'4'),CASEY,1,'4'.repeat(64),'Codex','elapsed','[]',0,'private']),/activity trace/);
await assert.rejects(db.query(insert,[RUN.replace(/1$/,'4'),CASEY,1,'4'.repeat(64),'Codex','elapsed','[0,0]',0,'private']),/contain activity/);
await assert.rejects(db.query(insert,[RUN.replace(/1$/,'2'),...args.slice(1),'private']),/duplicate key/);
for(const change of ['tool_calls=999','measurement_revision=repeat(\'a\',64)',"harness='madeup'","rhythm='[999]'::jsonb","started_at=now()","model='fake'"])
 await assert.rejects(db.query('update strava.runs set '+change+' where id=$1',[RUN]),/Recorded session facts cannot be edited/);
await db.query("update strava.runs set title='What I built',caption='A real description' where id=$1",[RUN]);
await db.query('insert into strava.run_photos(id,run_id,width,height,byte_size) values($1,$2,640,480,1000)',[PHOTO,RUN]);
const readable=async()=>Number((await db.query('select count(*) n from strava.run_photos where id=$1',[PHOTO])).rows[0].n);
await as(RILEY);assert.equal(await readable(),0);
await assert.rejects(db.query('insert into strava.run_photos(run_id,width,height,byte_size) values($1,640,480,1000)',[RUN]),/row-level security/);
await db.query('delete from strava.run_photos where id=$1',[PHOTO]);
await as(CASEY);assert.equal(await readable(),1);
await db.query('insert into strava.close_friends(owner_profile_id,friend_profile_id) values($1,$2)',[CASEY,RILEY]);
await db.query("update strava.runs set visibility='close_friends' where id=$1",[RUN]);
await as(RILEY);assert.equal(await readable(),1);
await as(CASEY);await db.query('delete from strava.close_friends where owner_profile_id=$1 and friend_profile_id=$2',[CASEY,RILEY]);
await as(RILEY);assert.equal(await readable(),0);
await as(CASEY);await db.query("update strava.runs set visibility='public' where id=$1",[RUN]);
await anonymous();assert.equal(await readable(),1);
await as(CASEY);await db.query("update strava.runs set visibility='private' where id=$1",[RUN]);
await anonymous();assert.equal(await readable(),0);
await as(CASEY);await db.query('delete from strava.run_photos where id=$1',[PHOTO]);assert.equal(await readable(),0);

// Definer agent action still hits the same table guard. Valid Connect payload accepted once;
// fake manual payload rejected, fresh request id still returns same measurement.
await as(CASEY);
const access=(await db.query("select strava.agent_token_create('launch guard test') value")).rows[0].value;
const act=async(payload)=>(await db.query('select strava.grinder_agent_action($1,\'publish\',$2,gen_random_uuid()) value',[access.token,JSON.stringify(payload)])).rows[0].value;
await assert.rejects(act({title:'fake',visibility:'private'}),/Import a recorded session/);
const payload={title:'Capture through Connect',visibility:'private',harness:source.harness,schema_version:1,
 measurement_revision:'7'.repeat(64),trace_basis:source.trace_basis,rhythm:source.rhythm,tool_calls:source.tool_calls??null};
const one=await act(payload),two=await act(payload);
assert.equal(one.existing,false);assert.equal(two.existing,true);assert.equal(one.id,two.id);
await db.query('insert into strava.close_friends(owner_profile_id,friend_profile_id) values($1,$2)',[CASEY,RILEY]);
await db.query("update strava.runs set visibility='close_friends' where id=$1",[one.id]);
await db.query("update strava.runs set visibility='public' where id=$1",[one.id]);
const draft=await act({...payload,measurement_revision:'8'.repeat(64),visibility:'public'});
assert.equal(draft.visibility,'private');assert.equal(draft.review_required,true);
assert.ok(draft.preview_url.includes('#import='),'agent returns owner review instead of publishing');
await as(RILEY);assert.equal((await db.query('select count(*) n from strava.runs where id=$1',[draft.id])).rows[0].n,0,'other person cannot read unconfirmed agent draft');
await as(CASEY);
await db.query('insert into strava.run_photos(id,run_id,width,height,byte_size) values($1,$2,10,10,100)',[PHOTO,RUN]);
await db.query('delete from strava.runs where id=$1',[RUN]);
await assert.rejects(db.query('select * from strava.photo_deletion_queue'),/permission denied/);
await db.exec('reset role');
assert.equal((await db.query('select count(*) n from strava.photo_deletion_queue')).rows[0].n,1,'Run cascade retains object-erasure obligation');

// Apply Storage policy against an independent Storage-shaped table with deliberately broad
// permissive access. A restrictive policy must still deny raw upload/read/sign-url eligibility.
await db.exec(`reset role;create schema storage;grant usage on schema storage to anon,authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;grant all on storage.objects to anon,authenticated;
 create policy broad_existing_policy on storage.objects for all using(true) with check(true);`);
await db.exec(readFileSync(new URL('../supabase/storage/strive_run_photos.sql',import.meta.url),'utf8'));
await db.exec("insert into storage.objects(bucket_id,name) values('strive-run-photos','secret.jpg'),('another-app','unchanged.jpg')");
await as(CASEY);
assert.equal((await db.query("select * from storage.objects where bucket_id='strive-run-photos'")).rows.length,0);
assert.equal((await db.query("select * from storage.objects where bucket_id='another-app'")).rows.length,1);
await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('strive-run-photos','raw.jpg')"),/row-level security/);
await db.exec("delete from storage.objects where bucket_id='strive-run-photos'");
await db.exec('reset role');assert.equal((await db.query("select * from storage.objects where bucket_id='strive-run-photos'")).rows.length,1);
await db.close();

const input=await sharp({create:{width:48,height:24,channels:3,background:'#123456'}}).jpeg().withMetadata({exif:{IFD0:{Artist:'PRIVATE AUTHOR'}}}).toBuffer();
assert.ok((await sharp(input).metadata()).exif);
const image=await sanitizePhoto(input.toString('base64'));
assert.equal((await sharp(image.data).metadata()).exif,undefined);
assert.equal((await sharp(image.data).metadata()).format,'jpeg');
await assert.rejects(sanitizePhoto(Buffer.from('<svg/>').toString('base64')));
await assert.rejects(sanitizePhoto('!invalid'));
const config={SB_URL:'https://database.example',SB_KEY:'anon-test',STORAGE_KEY:'server-test'};
let storageCalls=0;
const deniedFetch=async(url,opts)=>{if(url.includes('/storage/'))storageCalls++;return new Response('[]',{status:200});};
const denied=await runPhotos({method:'GET',query:{id:PHOTO,run_id:RUN}},config,deniedFetch);
assert.equal(denied.status,404);assert.equal(storageCalls,0);
assert.match(denied.headers['Cache-Control'],/no-store/);
let uploadedBytes;
const fakeFetch=async(url,opts)=>{
 if(url.includes('/rest/v1/')) {
  assert.equal(opts.headers.Authorization,'Bearer user-test');
  if(url.endsWith('/rpc/grinder_profile_id')) return new Response(JSON.stringify(CASEY),{status:200});
  if(url.includes('/runs?')) return new Response(JSON.stringify([{id:RUN}]),{status:200});
  if(opts.method!=='POST') return new Response(JSON.stringify([{id:PHOTO}]),{status:200});
  const p=JSON.parse(opts.body);return new Response(JSON.stringify([p]),{status:201});
 }
 assert.equal(opts.headers.Authorization,'Bearer server-test');
 assert.ok(url.includes('/strive-run-photos/'));
 uploadedBytes=opts.body;return new Response('{}',{status:200});
};
const added=await runPhotos({method:'POST',headers:{authorization:'Bearer user-test'},body:{run_id:RUN,image_base64:input.toString('base64')}},config,fakeFetch);
assert.equal(added.status,201);assert.equal((await sharp(uploadedBytes).metadata()).exif,undefined);
assert.ok(!JSON.stringify(added).includes('server-test'));
const expired=await runPhotos({method:'GET',query:{id:PHOTO,run_id:RUN}},config,async()=>new Response('{}',{status:401}));
assert.equal(expired.status,401);
let cleanupCalls=[];
const cleaned=await cleanupPhotos(config,async(url,opts)=>{
 cleanupCalls.push(url);
 if(opts.method!=='DELETE') return new Response(JSON.stringify([{object_name:RUN+'/'+PHOTO+'.jpg'}]));
 return new Response('{}');
});
assert.equal(cleaned.removed,1);assert.equal(cleanupCalls.length,3);
let cleanupAcknowledged=false;
await assert.rejects(cleanupPhotos(config,async(url,opts)=>{
 if(opts.method!=='DELETE') return new Response(JSON.stringify([{object_name:RUN+'/'+PHOTO+'.jpg'}]));
 if(url.includes('/storage/')) return new Response('{}',{status:500});
 cleanupAcknowledged=true;return new Response('{}');
}));
assert.equal(cleanupAcknowledged,false,'Failed storage erase retains queue entry');
let raceQueued=false,raceDeleted=false;
const raced=await runPhotos({method:'POST',headers:{authorization:'Bearer user-test'},body:{run_id:RUN,image_base64:input.toString('base64')}},config,async(url,opts)=>{
 if(url.endsWith('/rpc/grinder_profile_id')) return new Response(JSON.stringify(CASEY));
 if(url.includes('/runs?')) return new Response(JSON.stringify([{id:RUN}]));
 if(url.includes('/run_photos?')&&opts.method==='POST') return new Response(JSON.stringify([JSON.parse(opts.body)]),{status:201});
 if(url.includes('/run_photos?')) return new Response('[]'); // concurrent deletion
 if(url.includes('/storage/')&&opts.method==='DELETE') {raceDeleted=true;return new Response('{}',{status:503});}
 if(url.includes('/photo_deletion_queue')) {raceQueued=true;assert.equal(opts.headers.Authorization,'Bearer server-test');return new Response('{}',{status:201});}
 return new Response('{}');
});
assert.equal(raced.status,409);assert.equal(raceDeleted,true);assert.equal(raceQueued,true);
console.log('Launch backend: capture required, facts immutable, private default, duplicate refused, photo owner/friend/public/revoke/delete RLS, raw Storage denied, metadata stripped, API capabilities separated. '+(captured?'Actual selected session parsed, measured and normalized via public export accepted.':process.env.STRIVE_CAPTURE_SAMPLE?'Capture export sample accepted.':'Synthetic source used; actual capture check separate.'));
