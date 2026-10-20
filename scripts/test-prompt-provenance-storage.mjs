import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {bootDisposable,seedJourneyActors,CASEY} from './disposable-supabase.mjs';

const {db}=await bootDisposable();
try{
 await seedJourneyActors(db);await db.exec('reset role');
 const valid={v:1,counts:{'human-typed':38,'human-via-tool':3,'agent-to-agent':1,automation:0,unknown:2},human_turns:41,known_autonomous_turns:1,unknown_turns:2,relays:{bb:3}};
 let revision=0;const insert=p=>db.query("insert into strava.runs(profile_id,title,visibility,harness,schema_version,measurement_revision,trace_basis,rhythm,prompt_provenance) values($1,'TEST DATA provenance','private','Codex',1,$2,'elapsed','[1,2]',$3) returning prompt_provenance",[CASEY,(++revision).toString(16).padStart(64,'0'),p]);
 const saved=(await insert(valid)).rows[0];
 assert.deepEqual(saved.prompt_provenance,valid);
 await assert.rejects(db.query("insert into strava.runs(profile_id,title,visibility,harness,prompts,schema_version,measurement_revision,trace_basis,rhythm,prompt_provenance) values($1,'TEST DATA false zero','private','Codex',0,1,$2,'elapsed','[1,2]',$3)",[CASEY,(++revision).toString(16).padStart(64,'0'),valid]),/Unknown prompt origins require an unknown human count/);
 await assert.rejects(insert({...valid,human_turns:44}),/Human provenance total mismatch/);
 await assert.rejects(insert({...valid,relays:{bb:'3'}}),/Invalid relay count/);
 await assert.rejects(insert({...valid,relays:{bb:0}}),/Invalid relay count/);
 await assert.rejects(insert({...valid,relays:{'a\nb':3}}),/Invalid relay count/);
 await assert.rejects(insert({...valid,relays:{['😀'.repeat(21)]:3}}),/Invalid relay count/);
 await assert.rejects(insert({...valid,raw_prompt:'secret'}),/Unsupported prompt provenance field/);
 await assert.rejects(insert({...valid,v:'1'}),/Invalid prompt provenance/);
 const {unknown_turns,...missingTotal}=valid;
 await assert.rejects(insert(missingTotal),/Missing prompt provenance field/);
 const missingKind={...valid,counts:{...valid.counts}};delete missingKind.counts.unknown;
 await assert.rejects(insert(missingKind),/Missing prompt provenance kind/);
 await assert.rejects(db.query("update strava.runs set prompt_provenance=$2 where profile_id=$1",[CASEY,{...valid,counts:{...valid.counts,'human-typed':39},human_turns:42}]),/Prompt provenance cannot be edited/);
 await assert.rejects(db.query("update strava.runs set prompts=0 where profile_id=$1 and prompt_provenance is not null",[CASEY]),/Recorded session facts|Unknown prompt origins/);
 await db.exec('begin');
 await db.query("select set_config('strive.prompt_provenance',$1,true)",[JSON.stringify(valid)]);
 const carried=(await db.query("insert into strava.runs(profile_id,title,visibility,harness,schema_version,measurement_revision,trace_basis,rhythm) values($1,'TEST DATA trigger carry','private','Codex',1,$2,'elapsed','[1]') returning prompt_provenance",[CASEY,(++revision).toString(16).padStart(64,'0')])).rows[0];
 await db.exec('commit');
 assert.deepEqual(carried.prompt_provenance,valid,'the production-style insert path carries provenance through the 051 trigger');
 await db.exec(await readFile(new URL('../supabase/strava/051_prompt_provenance.sql',import.meta.url),'utf8'));
 console.log('PASS: bounded prompt provenance persists, rejects bad totals and hidden fields, and is immutable');
}finally{await db.close();}
