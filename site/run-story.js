/* Author-written context. Never inferred from activity or treated as verification. */
(function(root){
const esc=s=>String(s??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
const fields=[['story_result','What changed',2000],['story_next','Still open',1000],['feedback_question','A question for you',500]];
function detail(r){const rows=fields.filter(([k])=>typeof r[k]==='string'&&r[k].trim());return rows.length?`<section class="run-story" aria-label="The story"><p class="meta">In the author’s words</p>${rows.map(([k,label])=>`<section><h3>${label}</h3><p>${esc(r[k])}</p></section>`).join('')}${r.feedback_question?`<a class="act blue" href="#grind-thread">Join the conversation</a>`:''}</section>`:'';}
function editor(r){return `<fieldset class="run-story-editor"><legend>The story behind the run</legend><p class="hint">Optional. A useful attempt or an open question belongs here too.</p>${fields.map(([k,label,max])=>`<label>${label}<textarea id="${k}" name="${k}" maxlength="${max}" rows="3">${esc(r[k]||'')}</textarea></label>`).join('')}</fieldset>`;}
function read(root){return Object.fromEntries(fields.map(([k,,max])=>{const value=root.querySelector('#'+k).value.trim();if(value.length>max)throw Error('Please shorten your story.');return [k,value||null]}));}
function visual(r){const u=typeof r.output_url==='string'?r.output_url:'';if(!/^https:\/\/[^\s<>"'\\]+\.(png|jpe?g|webp)(?:[?#].*)?$/i.test(u))return '';return `<figure class="run-output-visual"><img src="${esc(u)}" alt="Output image linked by the author" loading="lazy" referrerpolicy="no-referrer"><figcaption>From the work · linked by the author</figcaption></figure>`;}
const api={detail,editor,read,fields,visual};root.StriveStory=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
