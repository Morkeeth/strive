import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
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

// This runs after EVERY migration (scripts/prepare-strava-database.py applies 042 and later files
// in number order), so it is the state production has. Each profile column is either granted to
// both readers or named here as private. A later migration that adds a private column adds it here.
const PRIVATE=['auth_uid'];
async function readerGrants(){
 for(const role of ['anon','authenticated']){
  const {rows:[table]}=await db.query(`select has_table_privilege($1,'strava.profiles','select') as whole`,[role]);
  assert.equal(table.whole,false,role+' has SELECT on the whole profiles table; a later migration undid the 042 revoke');
  const {rows}=await db.query(`select attname,has_column_privilege($1,'strava.profiles',attname,'select') as granted from pg_attribute
   where attrelid='strava.profiles'::regclass and attnum>0 and not attisdropped order by attnum`,[role]);
  for(const {attname,granted} of rows)
   assert.equal(granted,!PRIVATE.includes(attname),PRIVATE.includes(attname)?role+' can select the private column '+attname
    :'profiles.'+attname+' has no SELECT grant for '+role+'; grant it in its migration or list it as private in this test');
 }
}
await readerGrants();
// The check must be able to fail. Each change is what a later migration could do; it is rolled back.
for(const [change,message] of [
 [`grant select on strava.profiles to anon, authenticated`,/whole profiles table/],
 [`grant select (auth_uid) on strava.profiles to authenticated`,/private column auth_uid/],
 [`alter table strava.profiles add column zz_later text`,/zz_later has no SELECT grant/],
]){
 await db.exec('begin');
 await db.exec(change);
 await assert.rejects(readerGrants(),message,'the reader check stays green after: '+change);
 await db.exec('rollback');
}
await readerGrants();

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

// A column added after 042 has no grant. It must stay closed on both paths: the direct read and
// the definer lookup, which may only return what the anon grant already allows.
await db.exec('reset role');
await db.exec(`alter table strava.profiles add column zz_private_email text`);
await db.query(`update strava.profiles set zz_private_email='TEST DATA private' where id=$1`,[RILEY]);
for(const [who,enter] of [['anon',anonymous],['another builder',()=>as(CASEY)]]){
 await enter();
 await denied('select zz_private_email from profiles');
 const [later]=(await db.query(`select id,handle,auth_uid,zz_private_email from strava.strava_profile_by_handle('test-riley')`)).rows;
 assert.deepEqual(later,{id:RILEY,handle:'test-riley',auth_uid:null,zz_private_email:null},who+' gets no later private column through the handle lookup');
}
// Once the column is granted to readers, the lookup returns it. The grant is the one rule.
await db.exec('reset role');
await db.exec(`grant select (zz_private_email) on strava.profiles to anon, authenticated`);
await anonymous();
assert.equal((await db.query(`select zz_private_email from strava.strava_profile_by_handle('test-riley')`)).rows[0].zz_private_email,'TEST DATA private','a granted column comes back through the handle lookup');
await db.exec('reset role');
await db.exec(`alter table strava.profiles drop column zz_private_email`);
// identity.sql is re-run on installed schemas, so it must carry the same lookup as 042.
const lookupSql=async file=>(await readFile(new URL('../supabase/strava/'+file,import.meta.url),'utf8')).match(/create or replace function strava\.strava_profile_by_handle[\s\S]*?\n\$\$;/)[0];
assert.equal(await lookupSql('identity.sql'),await lookupSql('042_private_auth_uid.sql'),'identity.sql and 042 define the same handle lookup');
await db.close();
console.log('PASS 042: anon and other builders cannot read auth_uid; profiles, runs, XUDOS and owner edits work; my_profile() is owner-only');
