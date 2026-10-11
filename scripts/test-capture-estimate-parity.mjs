import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),D=require('../site/dropin-parse.js'),E=require('../site/capture-estimates.js'),F=require('../site/run-estimates.js');
assert.deepEqual(require('../site/capture-prices.js'),JSON.parse(readFileSync('agentgrinder/data/estimate-prices.json')),'browser and plugin use identical frozen price inputs');
const native=readFileSync('samples/dropin/codex-desktop.jsonl','utf8').trim().split('\n').map(JSON.parse);
const token=(n,input,output,cache=0)=>({timestamp:'2026-10-11T10:01:00Z',type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{input_tokens:n,output_tokens:n},last_token_usage:{input_tokens:input,output_tokens:output,cached_input_tokens:cache}}}});
const cases=[['codex',[...native,{timestamp:'2026-10-11T10:00:00Z',type:'turn_context',payload:{model:'gpt-6-sol'}},token(1,100,10,80),token(1,100,10,80),token(2,50,5,20)]],['codex',[...native,{timestamp:'2026-10-11T10:00:00Z',type:'turn_context',payload:{model:'unknown-model'}},token(1,100,10)]],['claude',[{type:'user',promptSource:'typed',timestamp:'2026-10-11T10:00:00Z',message:{content:'PRIVATE PROMPT'}},...[3,9].map(output=>({timestamp:'2026-10-11T10:01:00Z',type:'assistant',message:{id:'a',model:'claude-opus-5-5',usage:{input_tokens:10,output_tokens:output,cache_read_input_tokens:50,cache_creation_input_tokens:20,cache_creation:{ephemeral_5m_input_tokens:20}},content:[{type:'tool_use',id:'tool',name:'Read',input:{file_path:'PRIVATE PATH'}}]}}))]]];
if(process.argv[2])cases.push(['codex',readFileSync(process.argv[2],'utf8').trim().split('\n').map(JSON.parse)]);
for(const [harness,rows] of cases){const raw=rows.map(JSON.stringify).join('\n'),run=D.parseText(raw),js=E.bind(run,createHash('sha256').update(raw).digest('hex'));
 const py=JSON.parse(execFileSync('python3',['-c',`import sys,json
from agentgrinder.capture_metadata import recorded
from agentgrinder.estimate_capture import estimate_inputs
raw=sys.stdin.buffer.read(); rows=[json.loads(x) for x in raw.splitlines()]; m=recorded(rows,sys.argv[1]); e=estimate_inputs(rows,sys.argv[1],raw,m)
if e:m['estimates']=e
print(json.dumps(m))`,harness],{input:raw,encoding:'utf8',maxBuffer:2e6}));
 const normalize=m=>JSON.parse(JSON.stringify(m).replace(/\.000000Z/g,'Z').replace(/(\.\d{3})000Z/g,'$1Z'));
 assert.deepEqual(normalize(js),normalize(py));assert.ok(!JSON.stringify(js).includes('PRIVATE'));if(js.estimates)F.validate(js.estimates,js);
}
console.log(`PASS browser/plugin estimate parity: ${cases.length} native cases; frozen price snapshot, source hash, cache usage, streaming dedupe, unknown model price, occupied minutes; no prompt/path.`);
