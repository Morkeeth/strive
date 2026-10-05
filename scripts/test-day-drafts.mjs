// Rules of the day review screen that can be checked without a browser (site/day-drafts.js).
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
require('../site/import-row.js');
const D=require('../site/day-drafts.js');
const run={harness:'Codex',started:'2026-10-05T10:00:00.000Z',duration_s:600,turns_typed:2,tool_calls:5,project:'raw-label',schema_version:1,trace_basis:'elapsed',repo_url:'https://example.test/r'};
assert.deepEqual(D.parse({schema:'strive-day-drafts-v1',day:'2026-10-05',project:null,runs:[run]}),{day:'2026-10-05',project:null,runs:[run]});
for(const bad of [null,{},{schema:'other',day:'2026-10-05',runs:[run]},{schema:'strive-day-drafts-v1',day:'5 Oct',runs:[run]},{schema:'strive-day-drafts-v1',day:'2026-10-05',runs:[]},{schema:'strive-day-drafts-v1',day:'2026-10-05',runs:Array(101).fill(run)}])
  assert.throws(()=>D.parse(bad),/not a day review link/);
const saved=[{id:'a',started_at:'2026-10-05T10:00:00+00:00',harness:'Codex',measurement_revision:null},{id:'b',started_at:'2026-10-05T10:00:00+00:00',harness:'Claude Code',measurement_revision:'r'.repeat(64)}];
assert.equal(D.match(run,saved).id,'a','the same instant and harness is the same session, whatever the timestamp spelling');
assert.equal(D.match({...run,harness:'Cursor'},saved),null,'another harness at the same instant is another session');
assert.equal(D.match({...run,started:'2026-10-05T10:00:01.000Z'},saved),null);
assert.equal(D.match({...run,harness:'Cursor',measurement_revision:'r'.repeat(64)},saved).id,'b','a measurement reference wins over time');
assert.equal(D.match({...run,started:null},saved),null,'a draft with no start time is never guessed to be saved');
const deps={profileId:'p',projectLabel:v=>(typeof v==='string'&&v.trim())||'',rejectPaths:v=>/[\\/]/.test(v)?'':v,safeRepoUrl:v=>/^https:/.test(v||'')?v:null};
const own=D.rowFor(run,{...deps,project:''});
assert.equal(own.project,'raw-label');assert.equal(own.title,'raw-label session');assert.equal(own.visibility,'private','a day save is always Only me');
assert.equal(own.caption,null);assert.equal(own.profile_id,'p');assert.equal(own.repo_url,'https://example.test/r');
const labelled=D.rowFor(run,{...deps,project:'  Monday 5 Oct '});assert.equal(labelled.project,'Monday 5 Oct');assert.equal(labelled.title,'Monday 5 Oct session');
assert.equal(D.rowFor(run,{...deps,project:'/Users/someone/secret'}).project,'raw-label','a typed path is refused and the draft keeps its own project');
assert.equal(D.rowFor({...run,project:null},{...deps,project:''}).title,'Codex session');
console.log('PASS: review link shape, already-saved matching, private-only rows, declared project label');
