import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const A=createRequire(import.meta.url)('../site/agent-names.js');

for(const [raw,name,maker] of [
 ['Claude Code','Claude Code','anthropic'],['claude-agent','Claude Code','anthropic'],['claude-cli','Claude Code','anthropic'],['claude','Claude Code','anthropic'],
 ['Cursor','Cursor','cursor'],['cursor-agent','Cursor','cursor'],['Codex','Codex','openai'],['codex-cli','Codex','openai'],
 ['Grok Bot','Grok Bot','x'],['grok-bot','Grok Bot','x'],['Astra','Astra',null]
])assert.deepEqual(A.agent(raw),{name,maker},raw);
assert.equal(A.agent(''),null);assert.equal(A.agent(null),null);assert.equal(A.agentName(undefined),'');

for(const [raw,name,maker] of [
 ['claude-opus-4-5-20251101','Claude Opus 4.5','anthropic'],
 ['claude-sonnet-4-5-20250929','Claude Sonnet 4.5','anthropic'],
 ['claude-sonnet-4-20250514','Claude Sonnet 4','anthropic'],
 ['claude-opus-5-5','Claude Opus 5.5','anthropic'],
 ['claude-fable-5-1','Claude Fable 5.1','anthropic'],
 ['claude-haiku-4-5','Claude Haiku 4.5','anthropic'],
 ['claude-3-5-sonnet-20241022','Claude 3.5 Sonnet','anthropic'],
 ['claude-3-7-sonnet-latest','Claude 3.7 Sonnet','anthropic'],
 ['claude-4.5-sonnet-thinking','Claude Sonnet 4.5 Thinking','anthropic'],
 ['us.anthropic.claude-sonnet-4-5-20250929-v1:0','Claude Sonnet 4.5','anthropic'],
 ['anthropic/claude-opus-4.1','Claude Opus 4.1','anthropic'],
 ['claude-sonnet-4-5@20250929','Claude Sonnet 4.5','anthropic'],
 ['gpt-5','GPT-5','openai'],['gpt-5-codex','GPT-5 Codex','openai'],['gpt-5.1-codex-max','GPT-5.1 Codex Max','openai'],
 ['gpt-4o-mini','GPT-4o mini','openai'],['gpt-4.1-nano','GPT-4.1 nano','openai'],['gpt-4o-2024-08-06','GPT-4o','openai'],
 ['gpt-6-sol','GPT-6 Sol','openai'],['o3','o3','openai'],['o4-mini','o4-mini','openai'],['o3-mini-high','o3-mini (high)','openai'],
 ['codex-mini-latest','Codex mini','openai'],
 ['gemini-2.5-pro','Gemini 2.5 Pro','google'],['gemini-2.5-flash-lite','Gemini 2.5 Flash Lite','google'],['gemini-3-pro-preview','Gemini 3 Pro Preview','google'],
 ['grok-4','Grok 4','xai'],['grok-code-fast-1','Grok Code Fast 1','xai'],['grok-3-mini','Grok 3 Mini','xai'],
 ['composer-1','Composer 1','cursor'],['cursor-small','Cursor Small','cursor'],
 ['devstral-small-2505','Devstral Small 2505','mistral'],['llama-3.1-70b-instruct','Llama 3.1 70B Instruct','meta'],
 ['deepseek-r1','DeepSeek R1',null],['deepseek-v3.1','DeepSeek V3.1',null],['kimi-k2','Kimi K2',null],['qwen3-coder','Qwen3 Coder',null]
])assert.deepEqual(A.model(raw),{id:raw,name,maker},raw);

// Unrecognised identifiers are shown exactly as recorded; nothing is guessed.
for(const raw of ['test-model','gpt-oss-120b','my-local-model','o1-preview'])assert.deepEqual(A.model(raw),{id:raw,name:raw,maker:null},raw);
assert.equal(A.model('  '),null);assert.equal(A.modelName(null),'');

assert.deepEqual(A.recordedModels({capture_metadata:{models:['claude-opus-4-5-20251101','claude-opus-4-5','gpt-5',7]}}).map(m=>m.name),['Claude Opus 4.5','GPT-5']);
assert.deepEqual(A.recordedModels({model:'claude-opus-4-5'}),[],'an author label is not a recorded model');
assert.deepEqual(A.recordedModels(null),[]);

// Each mark is the same path as the logo file the site serves.
for(const [maker,file] of [['anthropic','claude'],['openai','openai'],['cursor','cursor'],['x','x'],['google','gemini'],['mistral','mistral'],['meta','meta']]){
 const svg=readFileSync(new URL(`../site/media/${file}-mark.svg`,import.meta.url),'utf8');
 assert.equal(A.MARKS[maker].d,svg.match(/ d="([^"]+)"/)[1],maker);
 assert.match(A.markSvg(maker,{size:20}),new RegExp(`^<svg class="agent-logo" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="${A.MARKS[maker].color}" d="`));
}
assert.equal(A.markSvg(null),'');assert.equal(A.markSvg('xai'),'');
const node=A.markNode((type,props,...children)=>({type,props:{...props,children}}),'anthropic',30);
assert.equal(node.type,'svg');assert.equal(node.props.width,30);assert.equal(node.props.children[0].props.fill,'#D97757');
assert.equal(A.markNode(()=>null,'deepseek',30),null);
console.log('PASS agent and model names read like people say them, unknown identifiers stay as recorded, and marks match the served logo files');
