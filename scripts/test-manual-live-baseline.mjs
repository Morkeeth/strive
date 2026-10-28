// Full disposable schema, including production 043 omission and the contract/crew guards.
// No production credentials, network, schema writes or rows are used by this test.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {PGlite} from '@electric-sql/pglite';
import H from '../site/historical-import.js';
const db=new PGlite();
const sql=readFileSync('supabase/strava/058_manual_project_updates.sql','utf8');
const full=execFileSync('python3',['scripts/prepare-strava-database.py'],{encoding:'utf8'});
const cut=full.indexOf('-- strava/058_manual_project_updates.sql');assert(cut>0);
await db.exec(`create role anon;create role authenticated;alter default privileges grant all on tables to anon,authenticated;alter default privileges grant execute on functions to anon,authenticated;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;`);
await db.exec(full.slice(0,cut)+'\ncommit;');
// Live051 differs from source051 only in whitespace. Load the exact captured live
// definition carried by rollback, then independently pin its production digest.
const rollback=readFileSync('supabase/rollback/058_manual_project_updates.sql','utf8');
const liveProvenance=rollback.match(/CREATE OR REPLACE FUNCTION strava\.guard_prompt_provenance\(\)[\s\S]*?\$function\$;/i)?.[0];assert(liveProvenance);await db.exec(liveProvenance);
const owner='10000000-0000-0000-0000-000000000001',other='10000000-0000-0000-0000-000000000002';
async function as(id){await db.exec('reset role;set role '+(id?'authenticated':'anon'));await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);}
async function admin(){await db.exec('reset role');}
async function definition(name){return (await db.query('select pg_get_functiondef($1::regprocedure) as definition',['strava.'+name+'()'])).rows[0].definition;}
const beforePhotoPolicy=(await db.query("select with_check from pg_policies where schemaname='strava' and tablename='run_photos' and policyname='run_photos_add'")).rows[0].with_check;
const before=await definition('run_capture_guard'),beforeProvenance=await definition('guard_prompt_provenance'),beforeMetadata=await definition('guard_capture_metadata');
assert(before.includes('activity_trace_omitted')&&before.includes('redactable'));
assert.equal(createHash('md5').update(before).digest('hex'),'059e8193ede6cf55cf65f5594dac78b7','disposable baseline must equal live pg_get_functiondef snapshot checked 28 October');
assert.equal(createHash('md5').update(beforeMetadata).digest('hex'),'64887aabaae1c5e7411e1da89ffebbb7','metadata redaction guard matches live preflight');
assert.equal(createHash('md5').update(beforeProvenance).digest('hex'),'4fab0816d3d80389ab6d206666df24b5','prompt provenance guard matches live preflight');
assert.equal(createHash('md5').update(await definition('grinder_run_contract_guard')).digest('hex'),'2479a3258fe507e83d7061eecdadf09e','contract guard matches live snapshot');
assert.equal(createHash('md5').update(await definition('grinder_run_crew_guard')).digest('hex'),'5d009ec5ec5b79e4d0335afc4ab830e7','crew guard matches live snapshot');
const triggerNames=(await db.query("select tgname from pg_trigger where tgrelid='strava.runs'::regclass and not tgisinternal")).rows.map(x=>x.tgname);
for(const name of ['run_capture_guard','run_contract_guard','run_crew_guard','runs_capture_metadata_guard','runs_prompt_provenance_guard'])assert(triggerNames.includes(name),'Missing actual combined guard '+name);
await db.exec(sql);
await db.query("insert into strava.profiles(id,auth_uid,name) values($1,$1,'TEST DATA owner'),($2,$2,'TEST DATA other')",[owner,other]);
await as(owner);
let seq=1;
async function insert(values){const entries=Object.entries(values);return (await db.query('insert into strava.runs('+entries.map(([k])=>k).join(',')+') values('+entries.map((_,i)=>'$'+(i+1)).join(',')+') returning *',entries.map(([,v])=>v&&typeof v==='object'?JSON.stringify(v):v))).rows[0];}
const captured=(extra={})=>({profile_id:owner,title:'TEST DATA capture',visibility:'private',schema_version:1,measurement_revision:(seq++).toString(16).padStart(64,'0'),harness:'Codex',trace_basis:'elapsed',rhythm:[1,2],tool_calls:3,model:'test-model',capture_metadata:{basis:'codex-records',models:['test-model'],input_tokens:10,output_tokens:4},...extra});
const manual=(extra={})=>({profile_id:owner,title:'TEST DATA manual app',project:'TEST DATA project',story_result:'TEST DATA what changed',trace_basis:'typed-by-author',visibility:'private',...extra});
try{
 const carried={v:1,counts:{'human-typed':0,'human-via-tool':0,'agent-to-agent':0,automation:0,unknown:1},human_turns:0,known_autonomous_turns:0,unknown_turns:1,relays:{}};
 await db.query("select set_config('strive.prompt_provenance',$1,false)",[JSON.stringify(carried)]);
 const saved=await insert(manual());assert.equal(saved.activity_trace_omitted,false);assert.equal(saved.prompt_provenance,null,'manual row ignores stale agent transaction carry');
 const carriedCapture=await insert(captured());assert.deepEqual(carriedCapture.prompt_provenance,carried,'recorded capture retains existing transaction carry');
 await db.query("select set_config('strive.prompt_provenance','',false)");
 await db.query("update strava.runs set title='TEST DATA edited title',story_result='TEST DATA revised result' where id=$1",[saved.id]);assert.equal((await db.query('select story_result from strava.runs where id=$1',[saved.id])).rows[0].story_result,'TEST DATA revised result');
 const photo=(await db.query('insert into strava.run_photos(run_id,width,height,byte_size) values($1,120,100,1000) returning id',[saved.id])).rows[0].id;
 await assert.rejects(insert(manual({visibility:'public'})),/start private/);
 for(const fields of [{tool_calls:1},{capture_metadata:{basis:'codex-records',models:[]}},{activity_trace_omitted:true},{harness:'Codex'},{history_evidence:{}},{measurement_revision:'a'.repeat(64)}])await assert.rejects(insert(manual(fields)),/unmeasured/);
 await as(other);assert.equal((await db.query('select id from strava.runs where id=$1',[saved.id])).rows.length,0);assert.equal((await db.query('select id from strava.run_photos where id=$1',[photo])).rows.length,0);await assert.rejects(db.query('insert into strava.run_photos(run_id,width,height,byte_size) values($1,120,100,1000)',[saved.id]));
 await as(null);assert.equal((await db.query('select id from strava.run_photos where id=$1',[photo])).rows.length,0);
 await as(owner);await db.query("update strava.runs set visibility='public' where id=$1",[saved.id]);await as(null);assert.equal((await db.query('select id from strava.runs where id=$1',[saved.id])).rows.length,1);assert.equal((await db.query('select id from strava.run_photos where id=$1',[photo])).rows.length,1);
 await as(owner);
 // Real capture facts can be removed, never replaced; the existing privacy mode survives.
 const rich=await insert(captured());await db.query('update strava.runs set rhythm=null,activity_trace_omitted=true,tool_calls=null,model=null,capture_metadata=$1 where id=$2',[{basis:'codex-records',models:[],input_tokens:10,output_tokens:4},rich.id]);
 const redacted=(await db.query('select * from strava.runs where id=$1',[rich.id])).rows[0];assert.equal(redacted.rhythm,null);assert.equal(redacted.tool_calls,null);assert.deepEqual(redacted.capture_metadata.models,[]);
 await assert.rejects(db.query('update strava.runs set tool_calls=4 where id=$1',[rich.id]),/cannot be edited/);
 await assert.rejects(db.query('update strava.runs set capture_metadata=$1 where id=$2',[{basis:'codex-records',models:[],input_tokens:11,output_tokens:4},rich.id]),/cannot be edited/);
 await assert.rejects(db.query('update strava.runs set activity_trace_omitted=false where id=$1',[rich.id]),/cannot be edited/);
 const omitted=await insert(captured({activity_trace_omitted:true,rhythm:null,tool_calls:null}));assert.equal(omitted.rhythm,null);
 await assert.rejects(insert(captured({activity_trace_omitted:true})),/Omitted activity trace/);
 await assert.rejects(insert(captured({activity_trace_omitted:true,rhythm:null,measurement_revision:null})),/Import a recorded/);
 const published=await insert(captured());await db.query("update strava.runs set visibility='public' where id=$1",[published.id]);await assert.rejects(db.query('update strava.runs set tool_calls=null where id=$1',[published.id]),/cannot be edited/);
 // These reach guards omitted from earlier isolated 058 rehearsals, and are watched reject.
 await assert.rejects(insert(captured({claims:1,claims_verified:2})),/non-negative and supported/);
 const crew=await insert(captured());await assert.rejects(db.query('update strava.runs set crew_shared=true where id=$1',[crew.id]),/must belong/);
 const history=await H.prepare({schema:'local-historical-recovery-v1',source:{full_transcript_recovered:false,contains_raw_prompt_text:false,rows:[{timestamp_ms:1700000000000,line_sha256:'a'.repeat(64)}]},observed_history:{unique_timestamped_entries:1},repo_evidence:{window:['2023-11-01T00:00:00Z','2023-12-01T00:00:00Z'],reachable_commits_in_utc_window:[{sha:'b'.repeat(40)}],commit_count:1,frozen_head:'b'.repeat(40)},draft_copy:{title:'TEST DATA recovered build'}});
 const historical=await insert({...history,profile_id:owner,title:'TEST DATA recovered build',visibility:'private'});
 await assert.rejects(db.query('update strava.runs set history_evidence=$1 where id=$2',[{...history.history_evidence,repo_commits:2},historical.id]),/cannot be edited/);
 await assert.rejects(db.query('update strava.runs set activity_trace_omitted=true where id=$1',[historical.id]),/Historical summaries/);
 await assert.rejects(db.query('update strava.runs set prompts=2 where id=$1',[historical.id]),/cannot be edited/);
 await admin();await db.exec(readFileSync('supabase/rollback/058_manual_project_updates.sql','utf8'));
 assert.equal(await definition('run_capture_guard'),before,'rollback restores exact pre-058 production-baseline capture guard');assert.equal(await definition('guard_prompt_provenance'),beforeProvenance);assert.equal(await definition('guard_capture_metadata'),beforeMetadata);
 assert.equal((await db.query("select with_check from pg_policies where schemaname='strava' and tablename='run_photos' and policyname='run_photos_add'")).rows[0].with_check,beforePhotoPolicy,'rollback restores captured-only photo insert policy');
 await as(owner);await assert.rejects(insert(manual()),/Manual runs are not supported/);assert.equal((await db.query('select id from strava.runs where id=$1',[saved.id])).rows.length,1);
 const afterRollback=await insert(captured());await db.query('update strava.runs set tool_calls=null where id=$1',[afterRollback.id]);assert.equal((await db.query('select tool_calls from strava.runs where id=$1',[afterRollback.id])).rows[0].tool_calls,null,'rollback retains private metric omission');
 await assert.rejects(db.query('insert into strava.run_photos(run_id,width,height,byte_size) values($1,120,100,1000)',[saved.id]));
 assert.equal((await db.query('select id from strava.run_photos where id=$1',[photo])).rows.length,1,'rollback retains existing manual image metadata');
 await assert.rejects(db.query('update strava.runs set history_evidence=$1 where id=$2',[{...history.history_evidence,repo_commits:2},historical.id]),/cannot be edited/);
 console.log('PASS actual combined guards: manual private/media/public path and audience isolation; captured private omissions, immutable facts/public metrics; historical immutability; contract+crew guards watched reject; exact function rollback and redaction after rollback.');
}finally{await db.close()}
