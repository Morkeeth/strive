import assert from 'node:assert/strict';
import E from '../site/run-evidence.js';
const now=Date.parse('2026-10-03T20:00:00Z');
const run={id:'a',profile_id:'owner',visibility:'public',measurement_revision:'a'.repeat(64),harness:'codex',started_at:'2026-10-03T10:00:00Z',created_at:'2026-10-03T12:00:00Z',duration_s:3600,tool_calls:20,rhythm:[5,15],trace_basis:'elapsed'};
const rank=rows=>E.ranking(rows,{since:Date.parse('2026-09-28'),now});
assert.equal(rank([run]).eligible.length,1);
assert.equal(rank([run,{...run,id:'b',tool_calls:999999}]).eligible.length,1,'same revision with altered counters cannot add ranking row');
assert.equal(rank([run,{...run,id:'b',measurement_revision:'b'.repeat(64),title:'renamed'}]).eligible.length,2,'matching metrics do not establish duplicate source identity');
assert.equal(rank([run,{...run,id:'b',measurement_revision:'b'.repeat(64),tool_calls:999999}]).eligible.length,2,'same window does not prove duplicate identity or authenticate counters');
assert.equal(rank([run,{...run,id:'b',measurement_revision:'b'.repeat(64),started_at:'2026-10-03T10:30:00Z',harness:'cursor'}]).eligible.length,2);
assert.equal(rank([run,{...run,id:'b',measurement_revision:'b'.repeat(64),started_at:'2026-10-03T11:00:00Z'}]).eligible.length,2,'touching windows do not overlap');
assert.equal(rank([{...run,started_at:null}]).eligible.length,0,'upload date cannot become session date');
assert.equal(rank([{...run,duration_s:null}]).toolsEligible.length,1);
assert.equal(rank([{...run,duration_s:null}]).durationEligible.length,0);
assert.equal(rank([{...run,visibility:'private'}]).eligible.length,0);
assert.equal(rank([{...run,trace_basis:'observed native events; timestamps unavailable'}]).eligible.length,0);
assert.equal(rank([run,{...run,id:'b',profile_id:'another'}]).eligible.length,2,'different owners do not suppress each other');
assert.equal(E.basis({...run,verified:true,provider_attested:true}).label,E.basis(run).label,'client flags never upgrade evidence');
assert.match(E.detail({...run,measurement_revision:'<script>'}),/hash is not proof/);
assert.doesNotMatch(E.detail(run),/independently verified scores/);
console.log('PASS evidence: replay, changed counters/revision, overlap, missing clocks, privacy, and no client attestation upgrade');

const distinct={...run,id:'other',measurement_revision:'b'.repeat(64)};
assert.equal(rank([run,{...distinct,project:'different project'}]).durationEligible.length,2);
for(const bad of [{...distinct,duration_s:86400},{...distinct,trace_basis:'observed native events; timestamps unavailable'}]){
 assert.deepEqual(rank([run,bad]).eligible.map(r=>r.id),['a'],'ineligible row cannot suppress valid session');
}
for(const basis of ['timestamps unavailable','typed-turn order; spacing is not elapsed time','unknown','']){
 assert.equal(rank([{...run,trace_basis:basis}]).durationEligible.length,0,'non-clock trace cannot rank as elapsed time');
}
assert.equal(rank([{...run,tool_calls:0,ridge_tool_calls:8,duration_s:null}]).toolsEligible.length,1);
assert.equal(rank([{...run,duration_s:null,started_at:null}]).toolsEligible.length,0);
assert.deepEqual(rank([{...run,id:'bad',duration_s:86400},run]).eligible.map(r=>r.id),['a'],'invalid same-revision row does not reserve identity');
assert.match(E.basis({...run,trace_basis:'observed native events; timestamps unavailable'}).label,/Imported · client-reported/);
assert.match(E.detail({...run,trace_basis:'observed native events; timestamps unavailable'}),/not independently verified/);
console.log('PASS parallel sessions, equal metrics, ineligible conflicts, duration/count cohorts and imported observed origin');
