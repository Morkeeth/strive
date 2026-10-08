// Real storage rules in disposable Postgres; optional actual capture JSON stays local.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {bootDisposable,seedJourneyActors,CASEY,RILEY} from './disposable-supabase.mjs';
const require=createRequire(import.meta.url);
const Row=require('../site/import-row.js');
const Contract=require('../site/run-contract.js');
const fixture={schema_version:1,harness:'Codex',trace_basis:'elapsed',measurement_revision:'e'.repeat(64),rhythm:[1,2],code_route:{v:1,projects:[{id:'p1',label:'TEST DATA project',basis:'declared'}],stops:[{id:'s1',project:'p1',kind:'edit',label:'TEST DATA observed edit',basis:'measured',evidence:['TEST DATA source record 1']},{id:'s2',project:'p1',kind:'commit',label:'TEST DATA observed commit',basis:'measured',evidence:['TEST DATA source record 2']}],connectors:[],finish:{stop:'s2',kind:'unfinished',label:'TEST DATA observation ended'}}};
fixture.code_route.stops[1].evidence=['Git commit: '+'a'.repeat(40)];
fixture.code_route.stops[1].source={v:1,consent:'explicit',commits:[{sha:'a'.repeat(40),subject:'Show saved project changes',url:'https://github.com/example/test-data/commit/'+'a'.repeat(40)}],files_changed:1,files:['site/card.js']};
const supplied=process.argv[2]?JSON.parse(await readFile(process.argv[2],'utf8')):null;
const run=supplied?.runs?.[0]||supplied?.run||supplied||fixture;
assert.ok(run.code_route?.stops?.length,'capture must contain checkpoints');
Contract.validate(run);
const unsafe=structuredClone(run);
unsafe.code_route.stops[0].evidence=['/Users/private/source.jsonl'];
assert.throws(()=>Contract.validate(unsafe),/path|private/i,'import refuses a local source path');
// Negative source cases exercise the actual importer, not a copied validator.
for (const mutate of [
 s=>{s.consent='implicit'}, s=>{s.commits[0].url='https://evil.example/commit/'+s.commits[0].sha},
 s=>{s.commits[0].url='https://github.com/example/test-data/commit/'+'b'.repeat(40)},
 s=>{s.commits[0].subject='/Users/oscar/local'}, s=>{s.files=['../outside']},
 s=>{s.files=['folder/secret.env']}, s=>{s.files_changed=0}, s=>{s.extra='hidden'},
 s=>{s.commits[0].subject='Bad\nsubject'}, s=>{s.commits.push({...s.commits[0]})},
 s=>{s.commits[0].subject=null}, s=>{s.commits[0].subject=' Padded subject '},
 s=>{s.commits[0].url=null}, s=>{s.files=null},
 s=>{s.commits[0].sha='b'.repeat(40);s.commits[0].url='https://github.com/example/test-data/commit/'+'b'.repeat(40)}
]) {
 const bad=structuredClone(fixture); mutate(bad.code_route.stops[1].source);
 assert.throws(()=>Contract.validate(bad),'unsafe source must fail the importer');
}
const {db,as,anonymous}=await bootDisposable();
try{
 await seedJourneyActors(db);await as(CASEY);
 const insert=async(row)=>{
  const entries=Object.entries(row).filter(([,v])=>v!==undefined);
  const sql=`insert into strava.runs(${entries.map(([k])=>'"'+k+'"').join(',')}) values(${entries.map((_,i)=>'$'+(i+1)).join(',')}) returning id`;
  return (await db.query(sql,entries.map(([,v])=>v))).rows[0].id;
 };
 const row=Row.build(run,{profileId:CASEY,title:'TEST DATA private capture storage',project:null,caption:null,output:null,repo:null});
 assert.equal(row.visibility,'private');
 const id=await insert(row);
 await as(RILEY);assert.equal((await db.query('select id from strava.runs where id=$1',[id])).rows.length,0);
 await anonymous();assert.equal((await db.query('select id from strava.runs where id=$1',[id])).rows.length,0);
 await as(CASEY);
 const reloaded=(await db.query('select code_route,visibility from strava.runs where id=$1',[id])).rows[0];
 assert.equal(reloaded.visibility,'private');assert.deepEqual(reloaded.code_route,run.code_route,'save/reload preserves every ordered stop and source');
 await assert.rejects(db.query('update strava.runs set code_route=$1 where id=$2',[{...run.code_route,stops:[]},id]),/Recorded session facts cannot be edited/);
 const actor=(await db.query("insert into strava.grinder_agents(owner_id,name) values($1,'TEST DATA route agent') returning id",[CASEY])).rows[0].id;
 const token=(await db.query("select strava.grinder_issue_agent_token($1,array['draft','publish'],array['private'],now()+interval '1 day') value",[actor])).rows[0].value.token;
 const payload={schema_version:1,harness:run.harness,trace_basis:run.trace_basis,measurement_revision:'f'.repeat(64),rhythm:run.rhythm,ridge:run.ridge,code_route:run.code_route,title:'TEST DATA private route RPC',visibility:'private'};
 const act=async(action,body)=> (await db.query('select strava.grinder_agent_action($1,$2,$3,gen_random_uuid()) value',[token,action,body])).rows[0].value;
 const draft=await act('draft',payload);
 assert.deepEqual((await db.query('select payload from strava.grinder_agent_drafts where id=$1',[draft.id])).rows[0].payload.code_route,run.code_route);
 const saved=await act('publish',payload);assert.equal(saved.visibility,'private');
 const retried=await act('publish',payload);
 assert.equal(retried.id,saved.id,'retry resolves the same capture instead of duplicating it');
 assert.equal(retried.existing,true);assert.equal(retried.visibility,'private');
 assert.deepEqual((await db.query('select code_route from strava.runs where id=$1',[saved.id])).rows[0].code_route,run.code_route);
 await assert.rejects(act('publish',{...payload,visibility:'public'}),/outside the granted scope/);
 await assert.rejects(act('publish',{...payload,code_route:unsafe.code_route}),/paths|private/i,'RPC refuses local source paths independently');
 await anonymous();assert.equal((await db.query('select id from strava.runs where id=$1',[saved.id])).rows.length,0);
 console.log('PASS: import and agent private saves preserve ordered checkpoints/source; owner reload succeeds; other user and anonymous denied; route facts immutable; public scope denied. '+(supplied?'Actual supplied capture exercised locally.':'TEST DATA fixture.'));
}finally{await db.close();}
