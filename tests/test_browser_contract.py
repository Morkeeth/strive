"""Run the shipped browser boundary with the same real exported payload as the CLI."""
import json
from pathlib import Path
import subprocess

from agentgrinder.push import export_run


def test_browser_accepts_export_and_rejects_invalid_counts():
    module = Path(__file__).resolve().parents[1] / "site/run-contract.js"
    payload = export_run({"turns_typed": 2, "claims": 3, "claims_verified": 1})
    script = """
const {validate}=require(process.argv[1]);
const run=JSON.parse(process.argv[2]);
validate(run);
for(const bad of [{...run,claims_verified:4},{...run,turns_typed:true},{...run,schema_version:999},{...run,measurement_revision:'bad'}]){
  let rejected=false;
  try {validate(bad)} catch(e) {rejected=true}
  if(!rejected) throw new Error('Invalid run accepted');
}
"""
    subprocess.run(["node", "-e", script, str(module), json.dumps(payload)], check=True)


def test_browser_ridge_keeps_unknown_workers_and_preserves_valid_bins():
    module = Path(__file__).resolve().parents[1] / "site/run-contract.js"
    script = """
const {validate}=require(process.argv[1]);
const base={ridge:Array(50).fill(0),ridge_basis:'wall-time'};
const missing={...base}; validate(missing);
if(Object.hasOwn(missing,'worker_bins'))throw new Error('Unknown workers invented');
for(const worker_bins of [Array(49).fill(1),Array(50).fill(0).map((v,i)=>i===49?-1:v),'corrupt']){
  let rejected=false;try{validate({...base,worker_bins})}catch(e){rejected=/worker_bins/.test(e.message)}
  if(!rejected)throw new Error('Malformed worker counts accepted');
}
const valid=Array.from({length:50},(_,i)=>i%3);
const run={...base,worker_bins:valid};
validate(run);
if(JSON.stringify(run.worker_bins)!==JSON.stringify(valid))
  throw new Error('Valid worker bins were changed');
"""
    subprocess.run(["node", "-e", script, str(module)], check=True)


def test_sittings_comparable_requires_harness_and_trace_basis():
    module = Path(__file__).resolve().parents[1] / "site/run-contract.js"
    script = r"""
const {sittingsComparable,rejectPaths}=require(process.argv[1]);
const claims={turns_typed:6,claims_verified:2,artifacts_produced:12};
const same={...claims,harness:'Cursor',trace_basis:'elapsed'};
const ok=sittingsComparable(same,{...same,claims_verified:3});
if(!ok.ok) throw new Error('same harness/basis should compare: '+ok.why);
const harness=sittingsComparable(
  {...claims,harness:'Claude Code',trace_basis:'elapsed'},
  {...claims,harness:'Cursor',trace_basis:'elapsed',claims_verified:3}
);
if(harness.ok) throw new Error('different harnesses with claims must not be comparable');
if(!/Harness/.test(harness.why)) throw new Error('missing harness reason');
const basis=sittingsComparable(
  {...claims,harness:'Cursor',trace_basis:'typed-turn order'},
  {...claims,harness:'Cursor',trace_basis:'elapsed'}
);
if(basis.ok) throw new Error('different trace_basis must not be comparable');
const missing=sittingsComparable({...claims,claims_verified:2},{...claims,claims_verified:3});
if(missing.ok) throw new Error('unknown harness must not be comparable');
const leaked=rejectPaths('Saved /Users/casey/Documents/notes/secret-plan.md and ~/private/keys.env');
if(/Users\/casey|secret-plan|~\//.test(leaked)) throw new Error('path survived rejectPaths: '+leaked);
if(!leaked.includes('[file]')) throw new Error('expected [file] replacement');
"""
    subprocess.run(["node", "-e", script, str(module)], check=True)


def test_practice_outcome_selector_matches_server_chronology():
    module = Path(__file__).resolve().parents[1] / "site/practice-eligibility.js"
    script = r"""
const {outcomeRuns}=require(process.argv[1]);
const attempt={created_at:'2026-09-02T12:00:00Z',baseline:{measurement_revision:'base'}};
const runs=[
 {id:'valid',started_at:'2026-09-02T12:00:00Z',measurement_revision:'new'},
 {id:'pre-attempt',started_at:'2026-09-02T11:59:59Z',measurement_revision:'older-import'},
 {id:'future',started_at:'2026-09-04T00:00:01Z',measurement_revision:'future'},
 {id:'same-revision',started_at:'2026-09-03T00:00:00Z',measurement_revision:'base'},
 {id:'missing-time',started_at:null,measurement_revision:'missing'}
];
const ids=outcomeRuns(attempt,runs,Date.parse('2026-09-04T00:00:00Z')).map(r=>r.id);
if(JSON.stringify(ids)!=='["valid"]') throw new Error('wrong eligible outcomes: '+JSON.stringify(ids));
if(outcomeRuns({...attempt,created_at:null},runs).length) throw new Error('attempt without server chronology accepted');
"""
    subprocess.run(["node", "-e", script, str(module)], check=True)


def test_comparison_rejects_unknown_metrics_and_honours_review():
    module = Path(__file__).resolve().parents[1] / "site/run-contract.js"
    script = r"""
const {sittingsComparable}=require(process.argv[1]);
const a={harness:'Codex',trace_basis:'elapsed',turns_typed:4,claims_verified:0};
for(const review of [{decision:'incomparable'}, {tried:false}]) {
 if(sittingsComparable(a,a,review).ok) throw Error('review was overridden');
}
for(const b of [
 {...a,claims_verified:null}, {...a,turns_typed:null}, {...a,turns_typed:0},
 {...a,claims_verified:NaN}, {...a,headline_metric_id:'unknown'},
]) if(sittingsComparable(b,b).ok) throw Error('missing/invalid measurements compared');
if(!sittingsComparable(a,a,{decision:'keep',tried:true}).ok) throw Error('measured zero is valid');
const artifacts={...a,claims_verified:null,artifacts_produced:0};
if(!sittingsComparable(artifacts,artifacts).ok) throw Error('artifact fallback is valid');
// Exercise the shipped rendering call, not just the helper: an incomparable review stays so.
const fs=require('fs'), vm=require('vm'), path=require('path');
const context={window:{},GrinderContract:require(process.argv[1])};
vm.createContext(context);
const src=fs.readFileSync(path.join(path.dirname(process.argv[1]),'practices.js'),'utf8');
vm.runInContext(src.replace('async function detail(id) {','window.renderComparison = comparison; async function detail(id) {'),context);
context.window.GrinderPractices({});
const html=context.window.renderComparison({baseline:a,outcome:a,decision:'incomparable',tried:true});
if(html.includes('Comparable under the same measurements')) throw Error('UI overrides decision');
if(!html.includes('participant marked')) throw Error('UI missing decision reason');
"""
    subprocess.run(["node", "-e", script, str(module)], check=True)
