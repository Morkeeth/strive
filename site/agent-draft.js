/* An agent can hand a person a project-update draft by link. The draft travels in the URL
   fragment (#project-draft=...), which the browser does not send to the server. It only fills
   the form: nothing is saved, published or sent until the person chooses to. */
(function(root){
'use strict';
const KEY='project-draft',VERSION='strive-project-update-draft-v1';
const LIMITS={project:120,title:120,problem:280,changed:2000,feedback:500,link:2048,agent:80};
function fromBase64Url(text){
 const s=String(text||'').replace(/-/g,'+').replace(/_/g,'/'),pad=s.length%4?'='.repeat(4-s.length%4):'';
 const bin=(typeof atob==='function'?atob:(b=>Buffer.from(b,'base64').toString('binary')))(s+pad);
 return decodeURIComponent(Array.from(bin,c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0')).join(''));
}
function toBase64Url(obj){
 const utf8=encodeURIComponent(JSON.stringify(obj)).replace(/%([0-9A-F]{2})/g,(_,h)=>String.fromCharCode(parseInt(h,16)));
 return (typeof btoa==='function'?btoa:(b=>Buffer.from(b,'binary').toString('base64')))(utf8).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
/* Returns {fields, agent, evidence} or throws. Only the six form fields and two labels are read;
   anything else in the draft is ignored, so a draft cannot set visibility, audience or metrics. */
function parse(hash){
 const m=/(?:^#|&)project-draft=([A-Za-z0-9_-]{1,12000})(?:&|$)/.exec(String(hash||''));
 if(!m)return null;
 let raw;try{raw=JSON.parse(fromBase64Url(m[1]));}catch(_){throw Error('This draft link could not be read.');}
 if(!raw||typeof raw!=='object'||raw.format!==VERSION)throw Error('This draft link uses an unknown format.');
 const fields={};
 for(const key of ['project','title','problem','changed','feedback','link']){
  const v=raw[key];if(v==null)continue;
  if(typeof v!=='string')throw Error('Draft field '+key+' must be text.');
  const t=v.trim();if(t.length>LIMITS[key])throw Error('Draft field '+key+' is too long.');
  if(t)fields[key]=t;
 }
 const agent=typeof raw.agent==='string'&&raw.agent.trim()?raw.agent.trim().slice(0,LIMITS.agent):'your agent';
 const evidence=Array.isArray(raw.evidence)?raw.evidence.slice(0,5).filter(e=>e&&typeof e.label==='string'&&typeof e.url==='string').map(e=>({label:e.label.trim().slice(0,120),url:e.url.trim().slice(0,2048)})):[];
 return {fields,agent,evidence};
}
const FORM={project:'f_project',title:'f_title',problem:'f_problem',changed:'f_caption',feedback:'f_feedback',link:'f_output_url'};
const api={KEY,VERSION,LIMITS,FORM,parse,toBase64Url,fromBase64Url};
root.StriveAgentDraft=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
