import assert from 'node:assert/strict';
import {bootDisposable,seedJourneyActors,seedCoachRun,CASEY,RILEY} from './disposable-supabase.mjs';
const {db,as,anonymous}=await bootDisposable();await seedJourneyActors(db);const run=await seedCoachRun(db,CASEY,'TEST DATA order consent','9'.repeat(64),'now()');await as(CASEY);await db.query("update strava.runs set visibility='public' where id=$1",[run]);
const add=async role=>(await db.query('insert into strava.run_photos(run_id,width,height,byte_size,role) values($1,100,100,200,$2) returning id',[run,role])).rows[0].id;
const project=await add('result'),personal=await add('personal'),unchosen=await add('personal');
const order=ids=>db.query('select strava.reorder_run_photos($1,$2::uuid[])',[run,ids]);
const consent=(id,value)=>db.query('select strava.set_run_personal_public($1,$2,$3)',[run,id,value]);
await consent(personal,true);
for(const ids of [[personal,project,unchosen],[project,unchosen,personal]]){
 await as(CASEY);await order(ids);
 for(const reader of [null,RILEY,CASEY]){
  if(reader)await as(reader);else await anonymous();
  const actual=(await db.query('select id,is_cover,personal_public_selected from strava.run_photos where run_id=$1 order by sort_position',[run])).rows;
  assert.deepEqual(actual.map(p=>p.id),ids.filter(id=>reader===CASEY||id!==unchosen));
  assert.equal(actual.find(p=>p.id===personal).personal_public_selected,true);
  if(reader!==CASEY){assert.equal((await db.query('select id from strava.run_photos where id=$1',[unchosen])).rows.length,0);await assert.rejects(order([...ids].reverse()));await assert.rejects(consent(unchosen,true));}
 }
}
await as(CASEY);await assert.rejects(db.query('select strava.choose_run_cover($1,$2)',[run,unchosen]),/Only a visible public image/);await anonymous();assert.equal((await db.query('select id from strava.run_photos where id=$1',[unchosen])).rows.length,0,'private personal photo cannot become the cover');
await as(CASEY);await consent(personal,false);await order([personal,project,unchosen]);await anonymous();assert.deepEqual((await db.query('select id from strava.run_photos where run_id=$1',[run])).rows.map(p=>p.id),[project]);
await as(CASEY);await consent(unchosen,true);await consent(personal,true);assert.equal((await db.query('select count(*)::int n from strava.run_photos where run_id=$1 and personal_public_selected',[run])).rows[0].n,1);
await assert.rejects(order([project,project,personal]),/exactly once/);await assert.rejects(order([project]),/exactly once/);await assert.rejects(consent(project,true),/personal image cannot be shared/);
await db.query('select strava.set_run_photo_role($1,$2,$3)',[run,personal,'photo']);assert.equal((await db.query('select personal_public_selected from strava.run_photos where id=$1',[personal])).rows[0].personal_public_selected,false);
await db.close();console.log('PASS photo order and separate consent: actual PostgreSQL policy, owner/other/anon both reorder directions, legacy cover no grant, explicit revoke, one personal, invalid order, role change.');
// The compact editor and current privacy migration have their own focused integration tests.
const {readFile}=await import('node:fs/promises');
const rid=run;

// Upgrade an existing author-selected personal cover: consent survives even where
// the old Result layout already led with project images.
const prior=await bootDisposable({photoOrder:false,photoCap:false});await seedJourneyActors(prior.db);await prior.db.exec(await readFile('tests/fixtures/proposals/capture-estimates.sql','utf8'));await prior.as(CASEY);
const {full}=await import('../tests/fixtures/estimate-capture.mjs');const oldRun=(await prior.db.query("insert into strava.runs(profile_id,title,harness,schema_version,measurement_revision,trace_basis,photo_layout,capture_metadata,visibility,rhythm) values($1,'TEST DATA migration','Codex',1,$2,'elapsed','result',$3,'private','[1,2,1]'::jsonb) returning id",[CASEY,'7'.repeat(64),full])).rows[0].id;
await prior.db.query("update strava.runs set visibility='public' where id=$1",[oldRun]);
const oldAdd=async role=>(await prior.db.query('insert into strava.run_photos(run_id,width,height,byte_size,role) values($1,100,100,200,$2) returning id',[oldRun,role])).rows[0].id;
const oldProject=await oldAdd('result'),oldPersonal=await oldAdd('personal'),oldUnchosen=await oldAdd('personal');await prior.db.query('select strava.choose_run_cover($1,$2)',[oldRun,oldPersonal]);await prior.db.exec('reset role');await prior.db.exec(await readFile('supabase/strava/037_photo_order_consent.sql','utf8'));await prior.anonymous();
const migrated=(await prior.db.query('select id,personal_public_selected from strava.run_photos where run_id=$1 order by sort_position',[oldRun])).rows;assert.deepEqual(migrated.map(p=>p.id),[oldProject,oldPersonal]);assert.equal(migrated[1].personal_public_selected,true);assert.ok(!migrated.some(p=>p.id===oldUnchosen));await prior.as(CASEY);await prior.db.query('select strava.set_run_personal_public($1,$2,false)',[oldRun,oldPersonal]);await prior.db.exec('reset role');await prior.db.exec(await readFile('supabase/strava/037_photo_order_consent.sql','utf8'));await prior.anonymous();assert.equal((await prior.db.query('select id from strava.run_photos where id=$1',[oldPersonal])).rows.length,0,'migration retry never grants withdrawn consent again');await prior.db.close();console.log('PASS actual 036→037 upgrade: only selected personal backfilled, existing Result-first visual order preserved, other personal remains denied.');
const {html:publicPage}=await import('../server/public-run.mjs');const vm=await import('node:vm');const box={};box.globalThis=box;vm.createContext(box);vm.runInContext(await readFile('site/run-photos.js','utf8'),box);
const pid='22222222-2222-4222-a222-222222222222',cid='33333333-3333-4333-a333-333333333333',hid='44444444-4444-4444-a444-444444444444';
const photos=[{id:pid,run_id:rid,role:'result',is_cover:false,sort_position:1},{id:cid,run_id:rid,role:'personal',is_cover:false,personal_public_selected:true,sort_position:0},{id:hid,run_id:rid,role:'personal',is_cover:true,personal_public_selected:false,sort_position:2}];
assert.deepEqual(Array.from(box.StriveRunPhotos.cardPhotos(photos,'result',true),p=>p.id),[cid,pid]);const page=publicPage({id:rid,title:'TEST DATA explicit order',visibility:'public',photo_layout:'result',capture_metadata:full},{photos});assert.ok(page.indexOf('id='+cid)<page.indexOf('id='+pid),'public server respects persisted order even when personal first');assert.ok(!page.includes(hid),'public HTML never exposes an unchosen personal image id');console.log('PASS feed and public server agree on persisted order; cover flag alone cannot reveal personal metadata.');
