import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {bootDisposable,seedJourneyActors,seedCoachRun,CASEY,RILEY} from './disposable-supabase.mjs';
const {db}=await bootDisposable();
try {
 await seedJourneyActors(db);
 const privateRun=await seedCoachRun(db,CASEY,'Private test','a'.repeat(64),'now()');
 const publicRun=await seedCoachRun(db,CASEY,'Public test','b'.repeat(64),'now()');
 await db.query("update strava.runs set project='secret-project' where id=$1",[privateRun]);
 await db.query("update strava.runs set project='public-project',visibility='public' where id=$1",[publicRun]);
 const photo=async run=>(await db.query('insert into strava.run_photos(run_id,width,height,byte_size) values($1,100,100,100) returning id',[run])).rows[0].id;
 const privatePhoto=await photo(privateRun),publicPhoto=await photo(publicRun),key='2026-10-05_2026-10-06';
 const token=name=>createHash('sha256').update(CASEY+'|'+key+'|'+name).digest('hex').slice(0,12),secretToken=token('secret-project'),publicToken=token('public-project');
 const choices={v:2,title:'private headline',photo:{run:privateRun,id:privatePhoto},visual:'photo',hero:true,hidden:[secretToken],order:[secretToken,publicToken],lead:secretToken,projectVisuals:{[secretToken]:{photo:{run:privateRun,id:privatePhoto},visual:'photo'},[publicToken]:{photo:{run:publicRun,id:publicPhoto},visual:'screenshot'}}};
 const role=async(id=null)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+(id?'authenticated':'anon'))};
 await role(CASEY);await db.query('select strava.save_day_card($1,$2)',[key,JSON.stringify(choices)]);
 const read=async()=> (await db.query('select strava.read_day_card($1,$2) as c',[CASEY,key])).rows[0].c;
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
 await db.exec('reset role; drop trigger private_day_choices on strava.profiles; drop function strava.reject_public_day_choices(); drop function strava.read_day_card(uuid,text); drop function strava.save_day_card(text,jsonb); drop table strava.day_card_choices');
 await db.query('update strava.profiles set rig=$1 where id=$2',[JSON.stringify({day_cards:{[key]:choices},kept:'existing profile settings'}),CASEY]);
 await db.exec(await readFile(new URL('../supabase/strava/034_private_day_card_choices.sql',import.meta.url),'utf8'));
 await role(CASEY);assert.deepEqual(await read(),choices,'migration preserves existing owner choices');
 assert.deepEqual((await db.query('select rig from strava.profiles where id=$1',[CASEY])).rows[0].rig,{kept:'existing profile settings'});
 console.log('PASS: migration preservation, owner persistence, raw anonymous/peer payload filtering, direct table denial, old-client rejection and live revocation');
} finally {await db.close()}
