import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import Provenance from '../site/provenance.js';
const require=createRequire(import.meta.url),Feed=require('../site/feed-card.js');

assert.deepEqual(Object.keys(Provenance.ADAPTERS).sort(),['bb','claude','codex','cursor']);
const events=[
 Provenance.classify('claude',{type:'user',promptSource:'typed',message:{}}),
 Provenance.classify('claude',{type:'user',promptSource:'sdk',userType:'external',turnOrigin:'sdk',promptId:'p1',entrypoint:'sdk-ts',wrapper:'bb',message:{}}),
 Provenance.classify('codex',{type:'event_msg',payload:{type:'user_message',message:'task'}},{delegated:true}),
 Provenance.classify('claude',{type:'user',promptSource:'system',message:{}}),
 Provenance.classify('cursor',{role:'user',message:{content:'unmarked'}}),
];
assert.deepEqual(events.map(e=>e.kind),Provenance.KINDS);
const summary=Provenance.summary(events);
assert.equal(summary.human_turns,2);
assert.equal(summary.known_autonomous_turns,2);
assert.equal(summary.unknown_turns,1);
assert.equal(Provenance.line(summary),'5 prompts: 1 you, 1 relayed by bb, 1 agent-to-agent, 1 automated, 1 origin unknown');
assert.equal(Feed.provenanceLine({prompt_provenance:summary}),'<p class="fc-provenance">5 prompts: 1 you, 1 relayed by bb, 1 agent-to-agent, 1 automated, 1 origin unknown</p>');
console.log('PASS: typed prompt provenance registry and card line');
