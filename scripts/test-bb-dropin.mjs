import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Dropin from '../site/dropin-parse.js';

const source=readFileSync(new URL('../samples/dropin/bb-thread-log.json',import.meta.url),'utf8');
const run=Dropin.parseText(source);
assert.equal(run.harness,'bb');
assert.equal(run.turns_typed,2);
assert.equal(run.prompt_provenance.counts['human-via-tool'],2);
assert.equal(run.prompt_provenance.relays.bb,2);
assert.equal(run.tool_calls,2,'started/completed command pair counts once; file change is one work item');
assert.equal(run.files_touched,1);
assert.deepEqual(run.route,[0]);
assert.equal(run.started,'2026-10-20T10:00:00.000Z');
assert.equal(run.capture_metadata.basis,'cursor-model-info');

// bb's own initiator field is the human/agent/system boundary. Claude Code
// userType or entrypoint hints must not be needed for an official bb export.
const provenance=JSON.parse(source);
provenance[0].data.userType='automated';
provenance[0].data.entrypoint='bb';
const provenanceRun=Dropin.parseText(JSON.stringify(provenance));
assert.equal(provenanceRun.turns_typed,2);

// Exports may contain both turn/requested and userMessage lifecycle rows. The
// compatibility rows must not add unknown prompts or double the rhythm count.
const withCompatibility=JSON.parse(source);
withCompatibility.push({type:'item/started',createdAt:1760954400500,data:{item:{id:'u1',type:'userMessage'}}});
withCompatibility.push({type:'item/completed',createdAt:1760954400600,data:{item:{id:'u1',type:'userMessage'}}});
const compatibilityRun=Dropin.parseText(JSON.stringify(withCompatibility));
assert.equal(compatibilityRun.turns_typed,2);
assert.equal(compatibilityRun.prompt_provenance.counts['human-via-tool'],2);
assert.equal(compatibilityRun.prompt_provenance.counts.unknown,0);

const agentOnly=Dropin.parseText(JSON.stringify([
 {type:'client/turn/requested',threadId:'t',seq:1,createdAt:1760954400000,data:{requestId:'a1',initiator:'agent'}},
 {type:'item/started',threadId:'t',seq:2,createdAt:1760954400100,data:{item:{id:'u1',type:'userMessage'}}},
 {type:'item/completed',threadId:'t',seq:3,createdAt:1760954400200,data:{item:{id:'u1',type:'userMessage'}}},
]));
assert.equal(agentOnly.turns_typed,0,'agent-started bb requests never fall back to userMessage lifecycle rows');
assert.equal(agentOnly.prompt_provenance.counts['agent-to-agent'],1);

const legacyOnly=Dropin.parseText(JSON.stringify([
 {type:'item/started',threadId:'t',seq:1,createdAt:1760954400000,data:{item:{id:'u1',type:'userMessage'}}},
]));
assert.equal(legacyOnly.turns_typed,null,'legacy lifecycle-only bb exports do not claim zero human turns');

const blob=new Blob([source]);
const streamed=await Dropin.parseFile(blob);
assert.deepEqual(streamed,run,'pretty JSON array follows the same browser File path');

const generic=Dropin.parseText([
  JSON.stringify({role:'user',content:'Synthetic question',timestamp:'2026-10-20T09:40:00Z'}),
  JSON.stringify({role:'assistant',content:[{type:'tool_call',name:'read'}],timestamp:'2026-10-20T09:40:02Z'})
].join('\n'));
assert.equal(generic.harness,'Other agent');
assert.equal(generic.turns_typed,null);
assert.equal(generic.prompt_provenance.counts.unknown,1);
assert.equal(generic.tool_calls,1);
assert.equal(generic.files_touched,null);
assert.equal(generic.commits,null);

assert.throws(()=>Dropin.parseText('{"not":"a session"}'),error=>error.code==='unknown');
console.log('PASS: bb thread-log JSON and conservative unknown-agent JSONL import');
