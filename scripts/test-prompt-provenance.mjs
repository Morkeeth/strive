import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import Provenance from '../site/provenance.js';
const require=createRequire(import.meta.url),Feed=require('../site/feed-card.js'),Context=require('../site/run-context.js'),DropinForProvenance=require('../site/dropin-parse.js'),Contract=require('../site/run-contract.js');

assert.deepEqual(Object.keys(Provenance.ADAPTERS).sort(),['bb','claude','codex','cursor']);
const events=[
 Provenance.classify('claude',{type:'user',promptSource:'typed',message:{}}),
 Provenance.classify('bb',{type:'client/turn/requested',data:{initiator:'user',requestId:'r1'}}),
 Provenance.classify('codex',{type:'event_msg',payload:{type:'user_message',message:'task'}},{delegated:true}),
 Provenance.classify('claude',{type:'user',promptSource:'system',message:{}}),
 Provenance.classify('cursor',{role:'user',message:{content:'unmarked'}}),
];
assert.deepEqual(events.map(e=>e.kind),Provenance.KINDS);
const summary=Provenance.summary(events);
assert.throws(()=>Provenance.validate({...summary,raw_prompt:'secret'}),/Invalid prompt provenance/);
assert.throws(()=>Provenance.validate({...summary,relays:{bb:1000001}}),/Invalid prompt provenance relays/);
assert.throws(()=>Provenance.validate({...summary,relays:{'a\nb':1}}),/Invalid prompt provenance relays/);
assert.throws(()=>Provenance.validate({...summary,relays:{['😀'.repeat(21)]:1}}),/Invalid prompt provenance relays/);
assert.equal(summary.human_turns,2);
assert.equal(summary.known_autonomous_turns,2);
assert.equal(summary.unknown_turns,1);
assert.equal(Provenance.line(summary),'5 prompts: 1 you, 1 relayed by bb, 1 agent-to-agent, 1 automated, 1 origin unknown');
assert.match(Context.measurementDetails({prompt_provenance:summary}),/Prompt origins.*5 prompts/);
assert.doesNotMatch(Feed.card({id:'r1',title:'Run',prompt_provenance:summary,profile:{name:'A'}}),/5 prompts/);
const sdk=Provenance.classify('claude',{type:'user',promptSource:'sdk',userType:'external',turnOrigin:'sdk',promptId:'p1',entrypoint:'sdk-ts',wrapper:'bb',message:{}});
assert.equal(sdk.kind,'unknown','SDK metadata alone does not prove a human initiated the request');
assert.equal(sdk.relayed_by,undefined);
const injected=Provenance.classify('codex',{type:'event_msg',payload:{type:'user_message',message:'# AGENTS.md instructions\n<INSTRUCTIONS>injected</INSTRUCTIONS>'}});
assert.equal(injected,null,'agent context in a user-role envelope is not human input');
const desktopInjected=Provenance.classify('codex',{type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text:'# AGENTS.md instructions\n<INSTRUCTIONS>injected</INSTRUCTIONS>'}]}});
assert.equal(desktopInjected,null,'desktop list-form agent context is not human input');
assert.equal(Provenance.classify('claude',{type:'user',isCompactSummary:true,message:{content:'summary'}}),null);
assert.equal(Provenance.classify('claude',{type:'user',isVisibleInTranscriptOnly:true,message:{content:'echo'}}),null);
assert.equal(Provenance.classify('claude',{type:'user',message:{content:'<bash-input>git status</bash-input>'}}),null);
assert.throws(()=>Provenance.validate({...Provenance.summary([]),human_turns:1000001}),/Invalid prompt provenance total/);
const unknownOnly=Provenance.summary([{kind:'unknown'}]);
assert.throws(()=>Contract.validate({schema_version:1,turns_typed:0,prompt_provenance:unknownOnly}),/must match prompt provenance/);
assert.equal(Contract.validate({schema_version:1,turns_typed:null,prompt_provenance:unknownOnly}).turns_typed,null);
const uploaded=DropinForProvenance.uploadPayload({harness:'Claude Code',turns_typed:summary.human_turns,prompt_provenance:summary,rhythm:[1]},'Run');
assert.deepEqual(uploaded.prompt_provenance,summary,'anonymous-link payload carries validated provenance');
assert.equal(uploaded.turns_typed,null,'an unknown origin cannot leave the device as a false measured human count');

const {readPublic}=await import('../server/public-run.mjs');
const requested=[];
const responses=[
 new Response(JSON.stringify({message:'column prompt_provenance does not exist'}),{status:400}),
 new Response(JSON.stringify({message:'column hero_visual does not exist'}),{status:400}),
 new Response(JSON.stringify([{id:'11111111-1111-1111-1111-111111111111',visibility:'public'}]),{status:200}),
];
const publicRun=await readPublic('11111111-1111-1111-1111-111111111111',async url=>{requested.push(String(url));return responses.shift();});
assert.equal(publicRun.visibility,'public');
assert.ok(requested[0].includes('prompt_provenance')&&requested[0].includes('hero_visual'));
assert.ok(!requested[1].includes('prompt_provenance')&&requested[1].includes('hero_visual'));
assert.ok(!requested[2].includes('prompt_provenance')&&!requested[2].includes('hero_visual'));
console.log('PASS: typed prompt provenance registry and card line');
