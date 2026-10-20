import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import Provenance from '../site/provenance.js';
const require=createRequire(import.meta.url),Feed=require('../site/feed-card.js'),Context=require('../site/run-context.js');

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
