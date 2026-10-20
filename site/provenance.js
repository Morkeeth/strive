/* One typed prompt-provenance registry for browser import adapters. No prompt text survives. */
(function(root){
"use strict";
const KINDS=['human-typed','human-via-tool','agent-to-agent','automation','unknown'];
const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const blocks=o=>isObj(o.message)&&Array.isArray(o.message.content)?o.message.content:[];
const toolResult=o=>o.toolUseResult!=null||blocks(o).some(b=>isObj(b)&&b.type==='tool_result');
const result=(kind,confidence,adapter,fields,relayed_by)=>({...{kind,confidence,adapter,fields},...(relayed_by?{relayed_by}:{})});
function claude(o){
 if(o.type!=='user'||toolResult(o)||o.isMeta)return null;
 if(['typed','queued'].includes(o.promptSource)&&!o.isSidechain)return result('human-typed','high','claude-code',['promptSource','isMeta','isSidechain']);
 if(o.isSidechain)return result('agent-to-agent','high','claude-code',['isSidechain']);
 if(o.promptSource==='sdk'&&o.userType==='external'&&o.turnOrigin==='sdk'&&typeof o.promptId==='string'&&o.promptId.trim()&&['sdk-ts','sdk-cli','sdk-py'].includes(o.entrypoint)){
  const wrapper=['wrapper','wrapperName','clientName','sourceTool'].map(k=>o[k]).find(v=>typeof v==='string'&&v.trim());
  return result('unknown','low','claude-code',['promptSource','userType','turnOrigin','promptId','entrypoint',...(wrapper?['wrapper']:[])]);
 }
 if(o.promptSource==='system')return result('automation','high','claude-code',['promptSource']);
 return result('unknown','low','claude-code',['promptSource','entrypoint'].filter(k=>k in o));
}
function bb(o){
 const data=isObj(o.data)?o.data:{};
 if(o.type==='client/turn/requested'){
  if(data.initiator==='user')return result('human-via-tool','high','bb',['type','data.initiator','data.requestId'],'bb');
  if(data.initiator==='agent')return result('agent-to-agent','high','bb',['type','data.initiator']);
  if(data.initiator==='system')return result('automation','high','bb',['type','data.initiator']);
  return result('unknown','low','bb',['type']);
 }
 if(['item/started','item/completed'].includes(o.type)&&isObj(data.item)&&data.item.type==='userMessage')return result('unknown','low','bb',['type','data.item.type']);
 return null;
}
const CODEX_INJECTED=['<recommended_plugins>','<environment_context>','<turn_aborted>','# Files mentioned by the user:','# AGENTS.md instructions','<permissions instructions>','<collaboration_mode>','<apps_instructions>','<plugins_instructions>','<skills_instructions>'];
function codex(o,ctx={}){
 const p=isObj(o.payload)?o.payload:{};let text=null;
 if(o.type==='event_msg'&&p.type==='user_message')text=String(p.message||'');
 else if(o.type==='response_item'&&p.type==='message'&&p.role==='user')text=Array.isArray(p.content)?p.content.filter(isObj).map(c=>c.text||'').join(''):String(p.content||'');
 if(text===null||CODEX_INJECTED.some(mark=>text.trimStart().startsWith(mark)))return null;
 if(ctx.delegated)return result('agent-to-agent','high','codex',['session_meta.payload.source.subagent']);
 if(['cron','ci','hook','automation'].includes(ctx.source))return result('automation','high','codex',['session_meta.payload.source']);
 return result('human-typed','medium','codex',['payload.type','payload.role']);
}
function cursor(o,ctx={}){
 if(o.role!=='user')return null;const m=isObj(o.message)?o.message:{};
 const text=typeof m.content==='string'?m.content:Array.isArray(m.content)?m.content.filter(isObj).filter(b=>b.type==='text').map(b=>b.text||'').join(' '):'';
 if(!text.includes('<user_query>'))return result('unknown','low','cursor',['role']);
 return ctx.wrapper?result('human-via-tool','medium','cursor',['role','message.content.<user_query>','wrapper'],ctx.wrapper):result('human-typed','high','cursor',['role','message.content.<user_query>']);
}
const ADAPTERS={bb,claude,codex,cursor};
function classify(adapter,row,context){const fn=ADAPTERS[adapter];if(!fn)throw Error('Unknown provenance adapter: '+adapter);return fn(row,context||{});}
function summary(events){const counts=Object.fromEntries(KINDS.map(k=>[k,0])),relays={};for(const e of events){counts[e.kind]++;if(e.kind==='human-via-tool'&&e.relayed_by)relays[e.relayed_by]=(relays[e.relayed_by]||0)+1;}return {v:1,counts,human_turns:counts['human-typed']+counts['human-via-tool'],known_autonomous_turns:counts['agent-to-agent']+counts.automation,unknown_turns:counts.unknown,relays:Object.fromEntries(Object.entries(relays).sort())};}
function validate(p){if(p==null)return null;const keys=isObj(p&&p.counts)?Object.keys(p.counts):[];if(!isObj(p)||p.v!==1||!isObj(p.counts)||keys.length!==KINDS.length||KINDS.some(k=>!keys.includes(k))||!isObj(p.relays))throw Error('Invalid prompt provenance');for(const k of KINDS)if(!Number.isSafeInteger(p.counts[k])||p.counts[k]<0||p.counts[k]>1000000)throw Error('Invalid prompt provenance count');if(p.human_turns!==p.counts['human-typed']+p.counts['human-via-tool']||p.known_autonomous_turns!==p.counts['agent-to-agent']+p.counts.automation||p.unknown_turns!==p.counts.unknown)throw Error('Prompt provenance totals do not add up');const relays=Object.entries(p.relays);if(relays.length>16||relays.some(([k,n])=>!/^.{1,40}$/.test(k)||!Number.isSafeInteger(n)||n<1)||relays.reduce((n,[,v])=>n+v,0)!==p.counts['human-via-tool'])throw Error('Invalid prompt provenance relays');return p;}
function line(p){if(!p||p.v!==1)return '';const c=p.counts||{},human=(c['human-typed']||0)+(c['human-via-tool']||0),total=KINDS.reduce((n,k)=>n+(c[k]||0),0),parts=[];if(c['human-typed'])parts.push(c['human-typed']+' you');for(const [tool,n] of Object.entries(p.relays||{}))parts.push(n+' relayed by '+tool);if(c['agent-to-agent'])parts.push(c['agent-to-agent']+' agent-to-agent');if(c.automation)parts.push(c.automation+' automated');if(c.unknown)parts.push(c.unknown+' origin unknown');return `${total} ${total===1?'prompt':'prompts'}${parts.length?': '+parts.join(', '):''}${human===0&&total===0?': none recorded':''}`;}
const api={KINDS,ADAPTERS,classify,summary,validate,line};root.StriveProvenance=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
