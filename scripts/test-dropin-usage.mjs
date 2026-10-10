import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
const require=createRequire(import.meta.url),D=require('../site/dropin-parse.js');
const codex=readFileSync('samples/dropin/codex-desktop.jsonl','utf8').trim().split('\n').map(JSON.parse);
const token=(total,input,output,cache=0)=>({type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{input_tokens:total,output_tokens:total},last_token_usage:{input_tokens:input,output_tokens:output,cached_input_tokens:cache}}}});
const cases=[
 ['codex',[...codex,{type:'turn_context',payload:{model:'model-test'}},token(100,100,10,80),token(100,100,10,80),token(200,60,3,50),token(1,5,1),token(2,3,1,8)]],
 ['codex',codex],
 ['claude',[{type:'user',promptSource:'typed',timestamp:'2026-10-08T10:00:00Z',message:{content:[{type:'text',text:'PRIVATE PROMPT'}]}},...[10,20].map(output=>({type:'assistant',timestamp:'2026-10-08T10:01:00Z',message:{id:'same-message',model:'model-test',usage:{input_tokens:10,output_tokens:output,cache_read_input_tokens:100,cache_creation_input_tokens:20},content:[]}}))]],
];
for(const [harness,records] of cases){
 const input=records.map(JSON.stringify).join('\n'),js=D.parseText(input).capture_metadata;
 const py=JSON.parse(execFileSync('python3',['-c','import json,sys; from agentgrinder.capture_metadata import recorded; print(json.dumps(recorded(json.load(sys.stdin),sys.argv[1])))',harness],{input:JSON.stringify(records),encoding:'utf8'}));
 assert.deepEqual(js,py);assert.ok(!JSON.stringify(js).includes('PRIVATE PROMPT'));
}
if(process.argv[2]){
 const file=process.argv[2],js=D.parseText(readFileSync(file,'utf8')).capture_metadata;
 const py=JSON.parse(execFileSync('python3',['-c','import json,sys; from agentgrinder.capture_metadata import recorded; print(json.dumps(recorded((json.loads(x) for x in open(sys.argv[1]) if x.strip()),"codex")))',file],{encoding:'utf8'}));assert.deepEqual(js,py);console.log('PASS unchanged real native file: browser/Python bounded capture usage match',JSON.stringify(js));
}
// The private-first UI must put parsed capture metadata into its allowlisted import envelope.
const ui=readFileSync('site/dropin.js','utf8');assert.match(ui,/capture_metadata:run.capture_metadata/);
const w=new JSDOM('<div id="app"></div>',{runScripts:'outside-only',url:'https://striverun.app/?post'}).window;
w.HTMLElement.prototype.scrollIntoView=function(){};w.eval(readFileSync('site/post-flow.js','utf8'));
w.document.querySelector('#app').innerHTML=w.StrivePostFlow.setupHtml({agentPrompt:'Preview privately',capture:'capture auto',agentCommands:{codex:'capture codex',claude:'capture claude',cursor:'capture cursor'},agentFiles:[['Codex','~/.codex/sessions/','Choose a dated rollout']],dropHtml:'<input id="drop-file" type="file">',syncHtml:''});w.StrivePostFlow.mountSetup(w.document);
for(const source of ['codex','claude']){w.document.querySelector('[data-post-source="'+source+'"]').click();assert.equal(w.document.querySelector('#post-quick-start').hidden,false);assert.equal(w.document.querySelector('#post-quick-copy').dataset.copy,'capture '+source)}
w.document.querySelector('[data-post-source="cursor"]').click();assert.ok(!w.document.querySelector('[data-post-source="cursor"]').dataset.command,'Cursor requires an explicit file, not unsupported automatic selection');
assert.match(w.document.querySelector('.post-file-entry').textContent,/Cmd.*Shift.*G/);assert.match(w.document.querySelector('.post-sample a').href,/599095f1/);
console.log('PASS file import usage parity: repeated snapshots, counter reset, invalid subset, cache accounting, absent usage; per-agent first-run entry and visible file instructions.');
