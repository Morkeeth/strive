import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {bootDisposable,seedJourneyActors,seedCoachRun,CASEY,RILEY} from './disposable-supabase.mjs';
const {db}=await bootDisposable();
try {
 await seedJourneyActors(db);
 const privateRun=await seedCoachRun(db,CASEY,'Private test','a'.repeat(64),"'2026-10-05T22:10:00Z'");
 const publicRun=await seedCoachRun(db,CASEY,'Public test','b'.repeat(64),"'2026-10-06T12:00:00Z'");
 await db.query("update strava.runs set project='secret-project' where id=$1",[privateRun]);
 await db.query("update strava.runs set project='public-project',visibility='public' where id=$1",[publicRun]);
 const oldPublicRun=await seedCoachRun(db,CASEY,'Old public project','c'.repeat(64),"'2026-09-05T12:00:00Z'");
 await db.query("update strava.runs set project='secret-project',visibility='public' where id=$1",[oldPublicRun]);
 const photo=async run=>(await db.query('insert into strava.run_photos(run_id,width,height,byte_size) values($1,100,100,100) returning id',[run])).rows[0].id;
 const privatePhoto=await photo(privateRun),publicPhoto=await photo(publicRun),key='2026-10-05_2026-10-06';
 const token=name=>createHash('sha256').update(CASEY+'|'+key+'|'+name).digest('hex').slice(0,12),secretToken=token('secret-project'),publicToken=token('public-project');
 const choices={v:2,title:'private headline',photo:{run:privateRun,id:privatePhoto},visual:'photo',hero:true,hidden:[secretToken],order:[secretToken,publicToken],lead:secretToken,projectVisuals:{[secretToken]:{photo:{run:privateRun,id:privatePhoto},visual:'photo'},[publicToken]:{photo:{run:publicRun,id:publicPhoto},visual:'screenshot'}}};
 const role=async(id=null)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+(id?'authenticated':'anon'))};
 await role(CASEY);await db.query('select strava.save_day_card($1,$2)',[key,JSON.stringify(choices)]);
 const read=async()=> (await db.query('select strava.read_day_card($1,$2,$3) as c',[CASEY,key,'Europe/Paris'])).rows[0].c;
 assert.deepEqual(await read(),choices,'owner read preserves all choices');
 for(const id of [null,RILEY]){
  await role(id);const payload=await read(),bytes=JSON.stringify(payload);
  for(const secret of [privateRun,privatePhoto,secretToken,'private headline'])assert.ok(!bytes.includes(secret),'no private choice bytes reach reader');
  assert.equal(payload.projectVisuals[publicToken].photo.id,publicPhoto);
  const profiles=await db.query('select rig from strava.profiles where id=$1',[CASEY]);assert.ok(!JSON.stringify(profiles.rows).includes('day_cards'));
  if(id)assert.equal((await db.query('select * from strava.day_card_choices')).rows.length,0,'another owner cannot read private rows directly');
  else await assert.rejects(db.query('select * from strava.day_card_choices'),/permission denied/);
 }
 await role(CASEY);await assert.rejects(db.query('update strava.profiles set rig=$1 where id=$2',[JSON.stringify({day_cards:{[key]:choices}}),CASEY]),/stored privately/);
 await db.query("update strava.runs set visibility='private' where id=$1",[publicRun]);
 await role();const after=JSON.stringify(await read());assert.ok(!after.includes(publicRun)&&!after.includes(publicPhoto)&&!after.includes(publicToken),'revocation removes photo and project from raw payload');

 // Freeze the same local-day boundaries as day.js; duration crossing midnight does not change membership.
 await db.exec('reset role');
 const boundaryCases=[['before','2026-10-04T21:59:59Z',false],['start','2026-10-04T22:00:00Z',true],['last','2026-10-06T21:59:59Z',true],['after','2026-10-06T22:00:00Z',false]];
 let revision=10;
 for(const [name,start] of boundaryCases){
  const id=(await db.query("insert into strava.runs(profile_id,title,project,visibility,harness,schema_version,measurement_revision,trace_basis,started_at,prompts,tool_calls,rhythm,duration_s) values($1,$2,$2,'private','Codex',1,$3,'elapsed',$4,1,2,'[1,1]',86400) returning id",[CASEY,name,String(revision++).padStart(64,'0'),start])).rows[0].id;
  await db.query("update strava.runs set visibility='public' where id=$1",[id]);
 }
 for(const [name,end,included] of [['history-in','2026-10-06T22:00:00Z',true],['history-out','2026-10-04T22:00:00Z',false]]){
  const evidence={first_observed_at:'2026-10-01T00:00:00Z',last_observed_at:end,history_entries:1,repo_commits:1,repo_revision:'e'.repeat(40),source_ref:createHash('sha256').update(name).digest('hex'),repo_window_start:'2026-10-01T00:00:00Z',repo_window_end:end};
  const id=(await db.query("insert into strava.runs(profile_id,title,project,visibility,schema_version,measurement_revision,trace_basis,history_evidence) values($1,$2,$2,'private',1,$3,'historical-reconstruction',$4) returning id",[CASEY,name,String(revision++).padStart(64,'0'),JSON.stringify(evidence)])).rows[0].id;
  await db.query("update strava.runs set visibility='public' where id=$1",[id]);boundaryCases.push([name,end,included]);
 }
 await role(CASEY);await db.query('select strava.save_day_card($1,$2)',[key,JSON.stringify({v:2,order:boundaryCases.map(([name])=>token(name))})]);
 await role();const boundaryPayload=await read();
 for(const [name,,included] of boundaryCases)assert.equal(boundaryPayload.order.includes(token(name)),included,'exact local-day membership: '+name);
 await role(CASEY);await db.query('select strava.save_day_card($1,$2)',[key,JSON.stringify(choices)]);
 await db.exec('reset role; drop trigger private_day_choices on strava.profiles; drop function strava.reject_public_day_choices(); drop function strava.read_day_card(uuid,text,text); drop function strava.save_day_card(text,jsonb); drop table strava.day_card_choices');
 await db.query('update strava.profiles set rig=$1 where id=$2',[JSON.stringify({day_cards:{[key]:choices},kept:'existing profile settings'}),CASEY]);
 await db.exec(await readFile(new URL('../supabase/strava/034_private_day_card_choices.sql',import.meta.url),'utf8'));
 await role(CASEY);assert.deepEqual(await read(),choices,'migration preserves existing owner choices');
 assert.deepEqual((await db.query('select rig from strava.profiles where id=$1',[CASEY])).rows[0].rig,{kept:'existing profile settings'});
 console.log('PASS: date-window counterexample and Paris boundaries, migration preservation, owner persistence, raw anonymous/peer payload filtering, direct table denial, old-client rejection and live revocation');
} finally {await db.close()}
