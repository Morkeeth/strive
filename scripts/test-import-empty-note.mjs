// The import preview labels the note optional, and runs_caption_length refuses an empty string.
// An untouched note must therefore reach the database as null, as the edit form already sends it.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {bootDisposable,seedJourneyActors,CASEY} from './disposable-supabase.mjs';
import {createRequire} from 'node:module';
const Row=createRequire(import.meta.url)('../site/import-row.js');
const html=await readFile(new URL('../site/index.html',import.meta.url),'utf8');
assert.match(html,/const row=StriveImportRow\.build\(run,\{profileId:ME\.id,title:\$\('i_title'\)\.value,project:editedProject\(\),caption,output,/,'the import save builds its row with the shared builder');
const run={harness:'Cursor',turns_typed:1,tool_calls:2,started:'2026-10-05T08:00:00Z',schema_version:1,trace_basis:'elapsed',measurement_revision:'a'.repeat(64),capture_metadata:{models:['m']}};
const empty=Row.build(run,{profileId:'p',title:'',project:null,caption:'',output:'',repo:null});
assert.equal(empty.caption,null,'an untouched note is saved as null');assert.equal(empty.output_url,null);assert.equal(empty.visibility,'private','an import always starts private');
assert.equal(empty.title,'Untitled run');assert.ok(!('model' in empty)&&!('repo_url' in empty),'absent optional columns are left out');
assert.equal(Row.build(run,{profileId:'p',title:'t',project:'x',caption:'note',output:null,repo:'https://example.test/r'}).caption,'note');
assert.deepEqual(Object.keys(empty).sort(),['artifacts_produced','caption','capture_metadata','claims','claims_verified','coach_mode','coach_plan','coach_tool_calls','coach_verdict','commits','duration_s','files_touched','harness','measurement_revision','output_url','profile_id','progress_delta','progress_verdict','project','prompts','reach','rhythm','route','schema_version','shell_calls','started_at','title','tool_calls','trace_basis','visibility'],'the saved columns are exactly the ones the inline save used to send');
const {db}=await bootDisposable();await seedJourneyActors(db);
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[CASEY]);await db.exec('set role authenticated');
const insert=caption=>db.query("insert into strava.runs(profile_id,title,visibility,harness,schema_version,measurement_revision,trace_basis,rhythm,caption) values($1,'TEST DATA empty note','private','Cursor',1,$2,'elapsed','[1,2]',$3) returning id",[CASEY,(caption===null?'a':'b').repeat(64),caption]);
await assert.rejects(insert(''),/runs_caption_length/,'the database refuses an empty-string note');
assert.equal((await insert(null)).rows.length,1,'the database accepts a missing note');
await db.close();
console.log('PASS: an untouched optional note is saved as null; an empty string would be refused by runs_caption_length');
process.exit(0);
