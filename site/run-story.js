/* Author-written context. Never inferred from activity or treated as verification. */
(function(root){
const esc=s=>String(s??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
const fields=[['story_result','What changed',2000],['story_next','Still open',1000],['feedback_question','A question for you',500]];
function detail(r,{conversation=true}={}){const rows=fields.filter(([k])=>typeof r[k]==='string'&&r[k].trim());return rows.length?`<section class="run-story" aria-label="The story"><p class="meta">In the author’s words</p>${rows.map(([k,label])=>`<section><h3>${label}</h3><p>${esc(r[k])}</p></section>`).join('')}${r.feedback_question&&conversation?`<a class="act blue" href="#grind-thread">Join the conversation</a>`:''}</section>`:'';}
// story_next predates project uploads. Preserve its Still open meaning for every
// row until a separately versioned field can distinguish a project problem.
function source(r){return r.trace_basis==='typed-by-author'?'Non-verified · Manual · unmeasured':r.trace_basis==='historical-reconstruction'?'Historical reconstruction · client-reported':'Recorded activity · client-reported';}
function highlights(r,{className='project-highlights',conversation=false}={}){
 const caption=(String(r.caption||'').trim()||String(r.note||'').trim()),changed=String(r.story_result||'').trim(),next=String(r.story_next||'').trim(),ask=String(r.feedback_question||'').trim();
 const rows=[];
 if(caption&&caption!==changed&&!(changed&&changed.startsWith(caption)))rows.push(['Project / context',caption]);
 if(changed)rows.push(['What changed',changed]);
 if(next)rows.push(['Still open',next]);
 if(ask)rows.push(['Feedback wanted',ask]);
 return rows.length?`<section class="${esc(className)}" aria-label="Project highlights">${rows.map(([label,text])=>`<div class="project-highlight${label==='Feedback wanted'?' project-feedback':''}"><h3>${esc(label)}</h3><p>${esc(text)}</p>${label==='Feedback wanted'&&conversation?'<a class="project-conversation" href="#grind-thread">Join the conversation</a>':''}</div>`).join('')}</section>`:'';
}
function editor(r){return `<fieldset class="run-story-editor"><legend>What did you build?</legend><p class="hint">Use plain words: what it does, the key feature, and the feedback you need. An unfinished attempt belongs here too.</p>${fields.map(([k,label,max])=>`<label>${label}<textarea id="${k}" name="${k}" maxlength="${max}" rows="3">${esc(r[k]||'')}</textarea></label>`).join('')}</fieldset>`;}
function read(root){return Object.fromEntries(fields.map(([k,,max])=>{const value=root.querySelector('#'+k).value.trim();if(value.length>max)throw Error('Please shorten your story.');return [k,value||null]}));}
function summary(r){const text=String(r.story_result||r.caption||r.note||'').trim();return text.length>240?text.slice(0,237).trimEnd()+'…':text;}
// Images are served through the run photo API, under the run audience. Working links stay links.
function visual(){return '';}
const api={detail,editor,read,fields,visual,summary,highlights,source};root.StriveStory=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
