import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {bootDisposable,seedJourneyActors,RILEY} from './disposable-supabase.mjs';

// The 042 rollback is a file that runs. Apply every migration, run the rollback, and compare the
// policies, grants and functions with the catalog as it was on main before 042 (frozen in
// tests/fixtures/pre-042-catalog.json, read from the disposable database at 210c182).
export async function catalog(db){
 const one=async sql=>(await db.query(sql)).rows;
 return {
  policies:await one(`select tablename,policyname,permissive,roles::text as roles,cmd,qual,with_check from pg_policies
   where schemaname='strava' and policyname in ('runs_read','runs_owner_write','acks_write') order by tablename,policyname`),
  table_privileges:await one(`select r.role,p.privilege,has_table_privilege(r.role,'strava.profiles',p.privilege) as granted
   from (values('anon'),('authenticated')) r(role),(values('select'),('insert'),('update'),('delete')) p(privilege) order by 1,2`),
  columns_with_own_grant:(await one(`select attname from pg_attribute where attrelid='strava.profiles'::regclass
   and attnum>0 and not attisdropped and coalesce(array_length(attacl,1),0)>0 order by attnum`)).map(r=>r.attname),
  auth_uid_readable:await one(`select r.role,has_column_privilege(r.role,'strava.profiles','auth_uid','select') as granted
   from (values('anon'),('authenticated')) r(role) order by 1`),
  functions:await one(`select proname,prosecdef,provolatile,proconfig::text as proconfig,pg_get_function_result(oid) as returns,prosrc,
   has_function_privilege('anon',oid,'execute') as anon_can,has_function_privilege('authenticated',oid,'execute') as authenticated_can,
   has_function_privilege('public',oid,'execute') as public_can
   from pg_proc where pronamespace='strava'::regnamespace and proname in ('my_profile','strava_profile_by_handle') order by proname`),
 };
}
if(process.argv[2]==='--print'){
 // Regenerate the frozen catalog. Run this from a checkout of main before 042, never from this branch.
 const {db}=await bootDisposable();
 console.log(JSON.stringify(await catalog(db),null,1));
 await db.close();
 process.exit(0);
}

const before=JSON.parse(await readFile(new URL('../tests/fixtures/pre-042-catalog.json',import.meta.url),'utf8'));
const rollback=await readFile(new URL('../docs/review/private-auth-uid/rollback-042-private-auth-uid.sql',import.meta.url),'utf8');
const {db,anonymous}=await bootDisposable();
await seedJourneyActors(db);
await db.exec('reset role');
const applied=await catalog(db);
assert.notDeepEqual(applied,before,'042 is applied before the rollback runs');
assert.equal(applied.functions.length,2,'042 installed my_profile() and the definer lookup');

await db.exec(rollback);
await db.exec('set search_path=strava,pg_temp');
assert.deepEqual(await catalog(db),before,'after the rollback the policies, grants and functions equal the state before 042');
// The same thing as behaviour: readers are back where they were before 042.
await anonymous();
assert.equal((await db.query('select auth_uid from profiles where id=$1',[RILEY])).rows[0].auth_uid,RILEY);
assert.equal((await db.query(`select auth_uid from strava.strava_profile_by_handle('test-riley')`)).rows[0].auth_uid,RILEY);
await assert.rejects(db.query('select * from strava.my_profile()'),{code:'42883'});
// Running it twice is safe.
await db.exec('reset role');
await db.exec(rollback);
await db.exec('set search_path=strava,pg_temp');
assert.deepEqual(await catalog(db),before,'the rollback can run twice');
await db.close();
console.log('PASS 042 rollback: policies, grants and functions equal the frozen pre-042 catalog; safe to run twice');
