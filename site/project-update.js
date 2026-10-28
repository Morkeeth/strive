/* Owner-written project context. Links are never authenticated connectors. */
(function(root){
'use strict';
function safeLink(value){
 const text=String(value||'').trim();if(!text||text.length>2048)return null;
 try{const u=new URL(text),h=u.hostname.toLowerCase();
 if(!['https:','http:'].includes(u.protocol)||u.username||u.password||!h.includes('.')||h==='localhost'||h.endsWith('.localhost')||h.endsWith('.local')||h.endsWith('.internal')||h==='[::1]'||/^\d+\.\d+\.\d+\.\d+$/.test(h)||h.includes(':'))return null;
 return u.href;
 }catch(_){return null}
}
function details(raw={}){
 const result={};
 for(const [key,max] of [['bio',500],['focus',280]]){const text=String(raw[key]||'').trim();if(text.length>max)throw Error('Please shorten your '+key+'.');result[key]=text;}
 for(const key of ['website','repository','social']){const text=String(raw[key]||'').trim();const url=safeLink(text);if(text&&!url)throw Error('Use a public http or https link for '+key+'.');result[key]=url;}
 return result;
}
function row(input={}){
 const title=String(input.title||'').trim(),project=String(input.project||'').trim(),changed=String(input.changed||'').trim(),problem=String(input.problem||'').trim(),feedback=String(input.feedback||'').trim();
 if(!project||!title||!changed)throw Error('Add a project, update title and what changed.');
 if(problem.length>280)throw Error('Keep project purpose / context to 280 characters.');
 if(title.length>120||project.length>120||changed.length>2000||feedback.length>500)throw Error('Please shorten the project update.');
 const output=safeLink(input.link);if(String(input.link||'').trim()&&!output)throw Error('Use a public http or https link.');
 if(!output&&!input.hasImage)throw Error('Add a screenshot or a link to your project.');
 return {title,project,caption:problem||null,story_result:changed,story_next:null,feedback_question:feedback||null,output_url:output,trace_basis:'typed-by-author',visibility:'private',harness:null,model:null,prompts:null,duration_s:null,wall_time_s:null,commits:null,started_at:new Date().toISOString()};
}
const api={safeLink,details,row};root.StriveProjectUpdate=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
