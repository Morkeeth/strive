import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const box={window:{}};
vm.createContext(box);
for(const file of ['run-contract.js','feed-card.js']) vm.runInContext(readFileSync('site/'+file,'utf8'),box);
const run={id:'date-test',harness:'Grok Bot',tool_calls:76,trace_basis:'observed native events; timestamps unavailable',created_at:new Date().toISOString(),profiles:{handle:'test'}};
const render=(r,preview)=>box.window.GrinderFeed.card(r,{preview});
assert.match(render(run,true),/Grok Bot · Session date unknown/);
assert.doesNotMatch(render(run,true),/Grok Bot · Today/);
assert.match(render(run,true),/<h3 class="fc-title">Grok Bot session<\/h3>/);
assert.match(render(run,false),/Grok Bot · Posted today/);
assert.match(render({...run,created_at:null},false),/Session date unknown/);
assert.match(render({...run,started_at:new Date().toISOString()},true),/Grok Bot · Today/);
for(const basis of ['timestamps unavailable','complete']) {
 assert.match(render({...run,trace_basis:basis},true),/Grok Bot · Session date unknown/);
 assert.match(render({...run,trace_basis:basis},false),/Grok Bot · Today/);
}
console.log('Actual feed-card render distinguishes unknown observed-session date from posting time; other capture formats unchanged.');

assert.doesNotMatch(render({...run,harness:"Codex",started_at:"2026-01-02T18:28:10.832+00:00"},true),/Codex · Today/);
