// Rules of the day review screen that can be checked without a browser (site/day-drafts.js).
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
require('../site/import-row.js');
const D=require('../site/day-drafts.js');
const run={harness:'Codex',started:'2026-10-05T10:00:00.000Z',duration_s:600,turns_typed:2,tool_calls:5,project:'raw-label',schema_version:1,trace_basis:'elapsed',repo_url:'https://example.test/r'};
assert.deepEqual(D.parse({schema:'strive-day-drafts-v1',day:'2026-10-05',project:null,runs:[run]}),{day:'2026-10-05',project:null,runs:[run],history:[]});
for(const bad of [null,{},{schema:'other',day:'2026-10-05',runs:[run]},{schema:'strive-day-drafts-v1',day:'5 Oct',runs:[run]},{schema:'strive-day-drafts-v1',day:'2026-10-05',runs:[]},{schema:'strive-day-drafts-v1',day:'2026-10-05',runs:Array(101).fill(run)}])
  assert.throws(()=>D.parse(bad),/not a day review link/);
const saved=[{id:'a',started_at:'2026-10-05T10:00:00+00:00',harness:'Codex',measurement_revision:null},{id:'b',started_at:'2026-10-05T10:00:00+00:00',harness:'Claude Code',measurement_revision:'r'.repeat(64)}];
assert.equal(D.match(run,saved).id,'a','the same instant and harness is the same session, whatever the timestamp spelling');
assert.equal(D.match({...run,harness:'Cursor'},saved),null,'another harness at the same instant is another session');
assert.equal(D.match({...run,started:'2026-10-05T10:00:01.000Z'},saved),null);
assert.equal(D.match({...run,harness:'Cursor',measurement_revision:'r'.repeat(64)},saved).id,'b','a measurement reference wins over time');
assert.equal(D.match({...run,started:null},saved),null,'a draft with no start time is never guessed to be saved');
// The real shape from 5 Oct: two Claude Code sessions that started in the same millisecond, in two projects, with two
// measurement references. Saving one must never mark the other as already saved.
const twinA={started:'2026-10-05T22:23:39.711000+02:00',harness:'Claude Code',project:'continuity',duration_s:1480,tool_calls:29,measurement_revision:'e607f4c0de'.padEnd(64,'0')};
const twinB={...twinA,project:'token-planner',duration_s:1542,tool_calls:43,measurement_revision:'ff427f0a31'.padEnd(64,'0')};
const afterA=[{id:'ta',started_at:'2026-10-05T20:23:39.711+00:00',harness:'Claude Code',measurement_revision:twinA.measurement_revision}];
assert.equal(D.match(twinA,afterA).id,'ta');assert.equal(D.match(twinB,afterA),null,'a different measurement reference is a different session, whatever the clock says');
assert.equal(D.match(twinB,[{...afterA[0],measurement_revision:null}]).id,'ta','a saved row with no reference can still only be matched by time');
assert.equal(D.match({...twinB,measurement_revision:null},afterA).id,'ta','a draft with no reference can still only be matched by time');
const deps={profileId:'p',projectLabel:v=>(typeof v==='string'&&v.trim())||'',rejectPaths:v=>/[\\/]/.test(v)?'':v,safeRepoUrl:v=>/^https:/.test(v||'')?v:null};
const own=D.rowFor(run,{...deps,project:''});
assert.equal(own.project,'raw-label');assert.equal(own.title,'raw-label session');assert.equal(own.visibility,'private','a day save is always Only me');
assert.equal(own.caption,null);assert.equal(own.profile_id,'p');assert.equal(own.repo_url,'https://example.test/r');
const labelled=D.rowFor(run,{...deps,project:'  Monday 5 Oct '});assert.equal(labelled.project,'Monday 5 Oct');assert.equal(labelled.title,'Monday 5 Oct session');
assert.equal(D.rowFor(run,{...deps,project:'/Users/someone/secret'}).project,'raw-label','a typed path is refused and the draft keeps its own project');
assert.equal(D.rowFor({...run,project:null},{...deps,project:''}).title,'Codex session');
// Git history in the review link: the Python side must compute exactly what the browser importer computes.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const H=require('../site/historical-import.js');
const dir=mkdtempSync(join(tmpdir(),'strive-history-'));
const sha=n=>n.toString(16).padStart(40,'0'),line=n=>n.toString(16).padStart(64,'0');
const manifest={schema:'local-historical-recovery-v1',visibility:'private',draft_copy:{title:'Work on TEST DATA repo, 2026-10-05'},
 source:{full_transcript_recovered:false,contains_raw_prompt_text:false,rows:[{timestamp_ms:1791014400000,line_sha256:line(2)},{timestamp_ms:1791010800000,line_sha256:line(1)},{timestamp_ms:1791010800000,line_sha256:line(1)}]},
 observed_history:{unique_timestamped_entries:2},
 repo_evidence:{repo:'test-data-repo',frozen_head:sha(99),window:['2026-10-04T22:00:00+00:00','2026-10-05T22:00:00+00:00'],commit_count:4,
  reachable_commits_in_utc_window:[{sha:sha(3),committer_time:'2026-10-05T15:00:10+00:00'},{sha:sha(1),committer_time:'2026-10-05T09:00:00+00:00'},{sha:sha(2),committer_time:'2026-10-05T09:40:00+02:00'},{sha:sha(4),committer_time:'2026-10-05T15:30:00+00:00'}]}};
writeFileSync(join(dir,'history-test-data-repo.json'),JSON.stringify(manifest));writeFileSync(join(dir,'not-a-manifest.json'),'{"schema":"other"}');
const py=JSON.parse(execFileSync('python3',['-c',`import json,sys;sys.path.insert(0,'.');from agentgrinder.capture import history_rows;print(json.dumps(history_rows(${JSON.stringify(dir)},{'test-data-repo':'TEST DATA Product'})))`],{encoding:'utf8'}));
assert.equal(py.length,3,'commits more than an hour apart are separate windows; 09:40+02:00 is 07:40 UTC and stands alone');
assert.deepEqual(py.map(r=>r.history_evidence.repo_commits),[1,1,2]);assert.ok(py.every(r=>r.project==='TEST DATA Product'&&r.title==='Work on TEST DATA repo, 2026-10-05'));
for(const row of py){
 const a=Date.parse(row.history_evidence.repo_window_start),b=Date.parse(row.history_evidence.repo_window_end);
 const same=JSON.parse(JSON.stringify(manifest));same.repo_evidence.window=[row.history_evidence.repo_window_start,row.history_evidence.repo_window_end];
 same.repo_evidence.reachable_commits_in_utc_window=manifest.repo_evidence.reachable_commits_in_utc_window.filter(c=>{const t=Date.parse(c.committer_time);return t>=a&&t<b});same.repo_evidence.commit_count=same.repo_evidence.reachable_commits_in_utc_window.length;
 const js=await H.prepare(same);
 assert.deepEqual(row.history_evidence,js.history_evidence,'the same window gives the same evidence in Python and in the browser importer');
 assert.equal(row.measurement_revision,js.measurement_revision,'and the same reference, so a row saved in bulk and a file recovered by hand are one run');
 const saved=D.historyRow(row,{...deps});
 assert.equal(saved.visibility,'private');assert.equal(saved.trace_basis,'historical-reconstruction');assert.equal(saved.project,'TEST DATA Product');assert.ok(!('harness' in saved)&&!('commits' in saved)&&!('started_at' in saved),'a git-history row claims no session metric');
}
assert.throws(()=>D.historyRow({...py[0],history_evidence:{...py[0].history_evidence,commit_times:[]}},deps),/unexpected shape/);
assert.throws(()=>D.historyRow({...py[0],measurement_revision:'x'},deps),/source reference/);
assert.throws(()=>D.historyRow({...py[0],history_evidence:{...py[0].history_evidence,repo_commits:0}},deps),/counted commits/);
assert.equal(D.parse({schema:'strive-day-drafts-v1',day:'2026-10-05',runs:[],history:py}).history.length,3,'a link may carry git history alone');
assert.throws(()=>D.parse({schema:'strive-day-drafts-v1',day:'2026-10-05',runs:[],history:[]}),/not a day review link/);
console.log('PASS: git history rows match the browser importer; review link shape, already-saved matching, private-only rows, declared project label');

const selected=D.parse({schema:'strive-day-drafts-v1',day:'2026-10-08',selection_label:'Selected sessions',runs:[run,{...run,started:'2026-10-07T10:00:00Z'}]});assert.equal(selected.selection_label,'Selected sessions');assert.equal(selected.runs[0].started,run.started,'a cross-date review retains each original date');assert.equal(D.parse({schema:'strive-day-drafts-v1',day:'2026-10-08',selection_label:'<script>',runs:[run]}).selection_label,undefined,'unrecognised labels are not surfaced');
