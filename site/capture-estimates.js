/* Incremental source-derived estimate inputs. No prompt, command or path is retained. */
(function(root){
const prices=()=>root.StriveCapturePrices||(typeof require==='function'?require('./capture-prices.js'):{});
const count=n=>Number.isSafeInteger(n)&&n>=0,obj=v=>v&&typeof v==='object'&&!Array.isArray(v);
const stamp=v=>typeof v==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v))?Date.parse(v):null;
const iso=n=>new Date(n).toISOString().replace('.000Z','Z');
function price(model,input,tier){
 let p=prices()[model];if(!p)return null;
 if(model==='gpt-6-sol'&&input>272000)return null;
 if(model!=='gpt-6-sol'&&(input>1000000||!['standard',undefined,null].includes(tier)))return null;
 if(model==='claude-haiku-5-5'&&input>100000)p={...p,context_tier:'input >100K',rates_per_million:{input:.5,output:2.5,cache_read:.05,cache_write_5m:.625,cache_write_1h:1}};
 return {...p,service_tier:model==='gpt-6-sol'||tier==null?'standard-assumed':p.service_tier,table_version:'provider-model-page-2026-10-11',checked_on:'2026-10-11',currency:'USD'};
}
function reader(){
 let first=null,last=null,model=null,prior=null,epoch=0;const calls=new Map(),minutes=new Set();
 const times=row=>{const t=stamp(row.timestamp);if(t!==null){first=first===null?t:Math.min(first,t);last=last===null?t:Math.max(last,t)}return t;};
 function add(row,harness){
  const at=times(row),p=obj(row.payload)?row.payload:{},m=obj(row.message)?row.message:{};
  if(harness==='Codex'){
   if(row.type==='turn_context'&&typeof p.model==='string')model=p.model;
   if(at!==null&&row.type==='response_item'&&['function_call','custom_tool_call'].includes(p.type))minutes.add(Math.floor(at/60000));
   if(row.type!=='event_msg'||p.type!=='token_count')return;
   const info=obj(p.info)?p.info:{},u=obj(info.last_token_usage)?info.last_token_usage:{},total=obj(info.total_token_usage)?info.total_token_usage:{};
   if(!count(total.input_tokens)||!count(total.output_tokens))return;
   const now=[total.input_tokens,total.output_tokens];if(prior&&now.some((n,i)=>n<prior[i]))epoch++;prior=now;
   const cache=u.cached_input_tokens??0;if(!model||![u.input_tokens,u.output_tokens,cache].every(count)||cache>u.input_tokens)return;
   const key=[epoch,...now].join(':');if(!calls.has(key))calls.set(key,{model,input_tokens:u.input_tokens,output_tokens:u.output_tokens,cache_read_tokens:cache,cache_write_5m_tokens:0,cache_write_1h_tokens:0,price:price(model,u.input_tokens)});
  }else if(harness==='Claude Code'){
   if(at!==null&&row.type==='assistant'&&Array.isArray(m.content)&&m.content.some(x=>x?.type==='tool_use'))minutes.add(Math.floor(at/60000));
   if(row.type!=='assistant'||row.isSidechain||typeof m.model!=='string'||typeof m.id!=='string'||!obj(m.usage))return;
   const u=m.usage,read=u.cache_read_input_tokens??0,write=u.cache_creation_input_tokens??0,split=u.cache_creation??{},w5=split.ephemeral_5m_input_tokens??0,w1=split.ephemeral_1h_input_tokens??0;
   if(![u.input_tokens,u.output_tokens,read,write,w5,w1].every(count)||w5+w1!==write||!count(u.input_tokens+read+write))return;
   const current={model:m.model,input_tokens:u.input_tokens+read+write,output_tokens:u.output_tokens,cache_read_tokens:read,cache_write_5m_tokens:w5,cache_write_1h_tokens:w1,price:price(m.model,u.input_tokens+read+write,u.service_tier)};
   const old=calls.get(m.id);if(!old||current.input_tokens>old.input_tokens||(current.input_tokens===old.input_tokens&&current.output_tokens>old.output_tokens))calls.set(m.id,current);
  }
 }
 function finish(metadata){
  if(first===null||last===null||!['codex-records','claude-message-usage'].includes(metadata.basis))return null;
  const origin=Math.floor(first/60000),e={v:1,source:{started_at:iso(first),ended_at:iso(last)}};
  const occupied=[...minutes].filter(n=>n>=origin&&n<=Math.floor(last/60000)).sort((a,b)=>a-b).map(n=>n-origin);
  if(occupied.length&&occupied.length<=2048)e.tool_activity={method:'occupied-tool-minutes-v1',bin_seconds:60,origin_utc:iso(origin*60000),occupied_bins:occupied};
  const groups=new Map(),keys=['input_tokens','output_tokens','cache_read_tokens','cache_write_5m_tokens','cache_write_1h_tokens'];
  for(const c of calls.values()){const key=JSON.stringify([c.model,c.price?.context_tier,c.price?.service_tier]);let group=groups.get(key);if(!group){group={model:c.model,role:'primary',...Object.fromEntries(keys.map(k=>[k,0])),price:c.price};groups.set(key,group)}for(const k of keys)group[k]+=c[k];}
  const components=[...groups.values()],sum=k=>components.reduce((n,c)=>n+c[k],0);
  if(components.length&&components.length<=64&&components.every(c=>metadata.models.includes(c.model)&&keys.every(k=>count(c[k])))&&sum('input_tokens')===metadata.input_tokens&&sum('output_tokens')===metadata.output_tokens&&(metadata.cached_input_tokens==null||sum('cache_read_tokens')===metadata.cached_input_tokens))e.cost={method:'model-price-v1',components};
  return e.cost||e.tool_activity?e:null;
 }
 return {add,finish};
}
function bind(run,sha256){
 if(!run.estimate_inputs)return run.capture_metadata;
 if(!/^[a-f0-9]{64}$/.test(sha256))throw Error('No source hash for estimates');
 const m={...run.capture_metadata,estimates:{...run.estimate_inputs,source:{...run.estimate_inputs.source,sha256}}};
 const api=root.StriveEstimates||(typeof require==='function'?require('./run-estimates.js'):null);try{api.validate(m.estimates,m);return m;}catch{return run.capture_metadata;}
}
const api={reader,bind};root.StriveCaptureEstimates=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
