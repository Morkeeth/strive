// Synthetic native records only, actual disposable SQL migrations. No hosted calls.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {bootDisposable,seedJourneyActors,CASEY} from './disposable-supabase.mjs';
const payload=JSON.parse(execFileSync('python3',['-c',`
import sys,json
sys.path.insert(0,'templates/grokbot/post-agent-run/scripts')
from test_native import NativeContract
from upload import upload_payload
case=NativeContract();case.setUp();case.measure()
print(json.dumps(upload_payload(case.path,format='native',bounds=case.bounds)))
case.tmp.cleanup()
`],{encoding:'utf8'}));
const {db,as}=await bootDisposable();
try {
 await seedJourneyActors(db);await as(CASEY);
 const access=(await db.query("select strava.agent_token_create('synthetic native admission') value")).rows[0].value;
 const act=async()=> (await db.query("select strava.grinder_agent_action($1,'publish',$2,gen_random_uuid()) value",[access.token,JSON.stringify(payload)])).rows[0].value;
 const result=await act(),repeat=await act();assert.equal(repeat.id,result.id);assert.equal(repeat.existing,true);
 const row=(await db.query('select prompts,started_at,duration_s,tool_calls,ridge,trace_basis,visibility,worker_bins,commit_bins from strava.runs where id=$1',[result.id])).rows[0];
 assert.equal(row.prompts,null);assert.equal(row.started_at,null);assert.equal(row.duration_s,null);assert.equal(row.tool_calls,1);
 assert.equal(row.trace_basis,'timestamps unavailable');assert.equal(row.visibility,'private');
 assert.equal(row.ridge.reduce((a,b)=>a+b,0),1);assert.equal(row.worker_bins,null);assert.equal(row.commit_bins,null);
 await db.exec("reset role");
 const check=async(p)=>db.query('select strava.grinder_check_agent_payload($1)',[JSON.stringify(p)]);
 for(const workers of [[],[0],Array(50).fill(-1),'unknown',Array(50).fill(false)])
  await assert.rejects(check({...payload,worker_bins:workers}),/worker_bins/);
 await check({...payload,worker_bins:null});await check({...payload,worker_bins:Array(50).fill(0)});
 await assert.rejects(check({...payload,private_transcript:'never'}),/Unsupported public field/);
 await assert.rejects(check({...payload,ridge:[1]}),/40 to 60/);
 await assert.rejects(check({...payload,commit_bins:[50]}),/ridge bin indexes/);
 await assert.rejects(check({...payload,tool_calls:-1}),/non-negative/);
 await assert.rejects(check({...payload,code_route:{v:1,secret:'/Users/private'}}),/code_route/);
 await as(CASEY);
 await assert.rejects(db.query("select strava.grinder_agent_action($1,'publish',$2,gen_random_uuid())",[access.token,JSON.stringify({...payload,visibility:'public',measurement_revision:'9'.repeat(64)})]),/outside the granted scope/);
 console.log('Native Grok payload admitted through actual017/Connect; unknowns remain NULL; repeat deduplicates. Synthetic only.');
} catch(error) {console.error(error.message);process.exitCode=1;} finally {await db.close();}
