// Actual SQL/RLS, two applications, synthetic actors only.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const db = new PGlite();
const a='10000000-0000-0000-0000-000000000001', b='10000000-0000-0000-0000-000000000002';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const build=p=>execFileSync('python3',[fileURLToPath(new URL('./'+p,import.meta.url))],{encoding:'utf8'});
await db.exec(`create role anon; create role authenticated;
alter default privileges grant all on tables to anon,authenticated;
alter default privileges grant execute on functions to anon,authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to anon,authenticated;`);
await db.exec(read('tests/fixtures/hosted-base.sql'));
await db.exec(build('prepare-migration.py'));
await db.exec(`insert into public.profiles(id,auth_uid,name) values ('${a}','${a}','Grinder sentinel');
insert into public.runs(id,profile_id,title,caption,visibility) values ('${a}','${a}','Grinder sentinel','TEST DATA','private');
create table public.follows(id integer); grant all on public.follows to anon,authenticated;`);
async function snapshot(){return (await db.query(`select jsonb_build_object(
 'tables',(select jsonb_agg(row_to_json(c) order by c.oid) from pg_class c where relnamespace='public'::regnamespace),
 'functions',(select jsonb_agg(row_to_json(p) order by p.oid) from pg_proc p where pronamespace='public'::regnamespace),
 'constraints',(select jsonb_agg(row_to_json(c) order by c.oid) from pg_constraint c where connamespace='public'::regnamespace),
 'policies',(select jsonb_agg(row_to_json(p) order by p.oid) from pg_policy p join pg_class c on c.oid=p.polrelid where c.relnamespace='public'::regnamespace),
 'columns',(select jsonb_agg(row_to_json(a) order by attrelid,attnum) from pg_attribute a join pg_class c on c.oid=a.attrelid where c.relnamespace='public'::regnamespace),
 'runs',(select jsonb_agg(row_to_json(r)) from public.runs r),
 'profiles',(select jsonb_agg(row_to_json(p)) from public.profiles p)) as value`)).rows[0].value;}
const before=await snapshot();
const sql=build('prepare-strava-database.py');
await db.exec(sql);
assert.deepEqual(await snapshot(),before,'Strava bootstrap must not change Grinder');
await assert.rejects(db.exec(sql),/already exists/);
await db.exec('rollback; set search_path=strava,pg_temp');
// Same auth identity has no STRIVE profile until explicit onboarding.
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
assert.equal((await db.query('select strava.grinder_profile_id() id')).rows[0].id,null);
await db.exec(`set role authenticated;
insert into profiles(id,auth_uid,name) values('${a}','${a}','Strava A');
insert into runs(id,profile_id,title,caption,visibility,harness,schema_version,measurement_revision,trace_basis,rhythm)
values('${a}','${a}','Strava private','TEST DATA','private','Codex',1,repeat('a',64),'elapsed','[1,2]');`);
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[b]);
await db.exec(`insert into profiles(id,auth_uid,name) values('${b}','${b}','Strava B')`);
assert.equal((await db.query('select * from runs')).rows.length,0);
assert.equal((await db.query("update runs set title='not mine' returning id")).rows.length,0);
// Valid TEST DATA capture, wrong owner: ensure RLS itself rejects the request.
await assert.rejects(db.exec(`insert into runs(profile_id,title,visibility,harness,schema_version,measurement_revision,trace_basis,rhythm)
values('${a}','TEST DATA not mine','private','Codex',1,repeat('b',64),'elapsed','[1,2]')`),/row-level security/);
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
await db.exec("update runs set visibility='public'");
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[b]);
assert.equal((await db.query('select title from runs')).rows[0].title,'Strava private');
await db.exec(`insert into grinder_follows(follower_id,followed_id) values('${b}','${a}');
insert into grinder_replies(run_id,author_id,body) values('${a}','${b}','TEST DATA reply');`);
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
assert((await db.query('select * from grinder_notifications')).rows.length>=1);
// Link is relationship-gated in the strava schema (migration 010). Bearer alone is not enough.
const linkId='20000000-0000-0000-0000-000000000010';
const publicGateId='20000000-0000-0000-0000-000000000011';
const stranger='10000000-0000-0000-0000-000000000003';
await db.exec(`set role authenticated;
insert into runs(id,profile_id,title,caption,visibility,harness,schema_version,measurement_revision,trace_basis,rhythm)
values('${linkId}','${a}','Strava link','TEST DATA','private','Codex',1,repeat('c',64),'elapsed','[1,2]');
insert into runs(id,profile_id,title,caption,visibility,harness,schema_version,measurement_revision,trace_basis,rhythm)
values('${publicGateId}','${a}','Strava public gate','TEST DATA','private','Codex',1,repeat('d',64),'elapsed','[1,2]');
update runs set visibility='link' where id='${linkId}';
update runs set visibility='public' where id='${publicGateId}';`);
await db.exec('reset role');
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[stranger]);
await db.exec(`set role authenticated;
insert into profiles(id,auth_uid,name) values('${stranger}','${stranger}','Strava stranger');`);
await db.exec('reset role; set role anon');
await db.query("select set_config('request.jwt.claim.sub','',false)");
await db.query("select set_config('request.headers','{}',false)");
assert.equal((await db.query('select title from runs where id=$1',[publicGateId])).rows[0].title,'Strava public gate','anon can still read public runs');
await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-grinder-run-id':linkId})]);
assert.equal((await db.query('select id from runs where id=$1',[linkId])).rows.length,0,'anon bearer cannot open Link');
assert.equal((await db.query('select strava.grinder_can_read_run($1) yes',[linkId])).rows[0].yes,false);
await db.query("select set_config('request.headers','{}',false)");
await db.exec('reset role');
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[stranger]);
await db.exec('set role authenticated');
await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-grinder-run-id':linkId})]);
assert.equal((await db.query('select id from runs where id=$1',[linkId])).rows.length,0,'signed-in stranger with bearer stays gated');
await db.query("select set_config('request.headers','{}',false)");
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[b]);
await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-grinder-run-id':linkId})]);
assert.equal((await db.query('select id from runs where id=$1',[linkId])).rows.length,1,'follower with bearer can read Link');
assert.equal((await db.query('select strava.grinder_can_read_run($1) yes',[linkId])).rows[0].yes,true);
await db.query("select set_config('request.headers','{}',false)");
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
assert.equal((await db.query('select id from runs where id=$1',[linkId])).rows.length,1,'owner reads Link without bearer');
await db.exec("update runs set visibility='private' where id='"+a+"'");
await db.exec('reset role; set role anon');
await db.query("select set_config('request.jwt.claim.sub','',false)");
assert.equal((await db.query('select * from runs where id=$1',[a])).rows.length,0);
assert.equal((await db.query('select * from grinder_replies')).rows.length,0);
await assert.rejects(db.exec(`insert into profiles(auth_uid) values('${b}')`),/permission denied|row-level security/);
await db.exec('reset role');
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
await db.exec('set role authenticated');
await db.query('delete from strava.profiles where id=$1',[a]);
await db.exec('reset role');
assert.equal((await db.query('select * from strava.runs')).rows.length,0);
assert.equal((await db.query('select * from public.profiles')).rows.length,1);
assert.deepEqual(await snapshot(),before,'Strava actions and profile deletion must not change Grinder');
const functions=(await db.query("select proname,proconfig,prosrc from pg_proc where pronamespace='strava'::regnamespace")).rows;
for(const f of functions){
 assert(!/\bpublic\./.test(f.prosrc),f.proname+' references Grinder');
 if(f.proconfig) assert(f.proconfig.every(c=>!c.includes('=public')),f.proname+' unsafe path');
}
const tables=(await db.query("select relname,relrowsecurity from pg_class where relnamespace='strava'::regnamespace and relkind='r'")).rows;
assert(tables.length>3);assert(tables.every(t=>t.relrowsecurity),'Every exposed table needs RLS');
console.log('PASS: shared-schema bootstrap, retry refusal, independent onboarding, owner isolation, follow/reply/return, link relationship gate, withdrawal/deletion, Grinder definitions/grants/data unchanged');
await db.close();
