import assert from 'node:assert/strict';
import {bootDisposable,seedJourneyActors,CASEY,RILEY} from './disposable-supabase.mjs';

// Migration 042: no reader can list Auth user ids; profiles, runs, XUDOS and owner writes still work.
const {db,as,anonymous,denied}=await bootDisposable();
await seedJourneyActors(db);
await db.exec('reset role');
const run=async(owner,visibility,title)=>{
 const {rows}=await db.query(`insert into runs(profile_id,title,project,harness,visibility,schema_version,measurement_revision,trace_basis,rhythm,started_at)
  values($1,$2,'p','Cursor','private',1,$3,'elapsed','[1,2]'::jsonb,now()) returning id`,[owner,title,title.length.toString().padStart(64,'e')]);
 if(visibility!=='private')await db.query('update runs set visibility=$2 where id=$1',[rows[0].id,visibility]);
 return rows[0].id;
};
const riley=await run(RILEY,'public','TEST DATA public run'),casey=await run(CASEY,'private','TEST DATA Casey private run');
const columns=(await db.query(`select column_name from information_schema.columns where table_schema='strava' and table_name='profiles' order by ordinal_position`)).rows.map(r=>r.column_name);

for(const [who,enter] of [['anon',anonymous],['another builder',()=>as(CASEY)]]){
 await enter();
 await denied('select auth_uid from profiles');
 await denied('select * from profiles');
 for(const column of columns.filter(c=>c!=='auth_uid'))await db.query(`select ${column} from profiles limit 1`);
 assert.equal((await db.query('select id from profiles')).rows.length,2,who+' still lists public profiles');
 assert.equal((await db.query(`select id from runs where visibility='public'`)).rows.length,1,who+' still reads public runs');
 const [found]=(await db.query(`select id,handle,auth_uid from strava.strava_profile_by_handle('test-riley')`)).rows;
 assert.deepEqual(found,{id:RILEY,handle:'test-riley',auth_uid:null},'the handle lookup keeps its shape without the Auth id');
}
await anonymous();
await denied('select * from strava.my_profile()');
assert.equal((await db.query('select id from runs where id=$1',[casey])).rows.length,0,'private runs stay private');

await as(CASEY);
const [me]=(await db.query('select id,auth_uid,handle from strava.my_profile()')).rows;
assert.deepEqual(me,{id:CASEY,auth_uid:CASEY,handle:'test-casey'},'the owner reads their own Auth id');
assert.equal((await db.query('select id from runs where id=$1',[casey])).rows.length,1,'the owner reads their private run');
assert.deepEqual((await db.query(`update profiles set display_name='TEST DATA Casey renamed' where id=$1 returning id`,[CASEY])).rows,[{id:CASEY}]);
assert.deepEqual((await db.query(`update profiles set display_name='x' where id=$1 returning id`,[RILEY])).rows,[],'nobody edits another profile');
assert.equal((await db.query(`insert into acks(from_profile,to_profile,run_id,reason) values($1,$2,$3,'appreciated') returning id`,[CASEY,RILEY,riley])).rows.length,1,'XUDOS still send');
await denied(`insert into acks(from_profile,to_profile,run_id,reason) values($1,$2,$3,'appreciated')`,[RILEY,RILEY,riley]);
assert.deepEqual((await db.query(`update runs set caption='x' where id=$1 returning id`,[riley])).rows,[],'another builder cannot edit a run');
assert.deepEqual((await db.query(`update runs set caption='TEST DATA owner caption' where id=$1 returning id`,[casey])).rows,[{id:casey}],'the owner edits their run');
await db.close();
console.log('PASS 042: anon and other builders cannot read auth_uid; profiles, runs, XUDOS and owner edits work; my_profile() is owner-only');
