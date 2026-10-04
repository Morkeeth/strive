/* Public context uses author words and bounded capture metadata, never transcript text. */
(function(root){
const esc=s=>String(s??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
const count=v=>Number.isSafeInteger(v)&&v>=0;
function validate(m){
 if(m==null)return null;
 if(typeof m!=='object'||Array.isArray(m)||Object.keys(m).some(k=>!['models','basis','input_tokens','output_tokens','cached_input_tokens','reasoning_tokens'].includes(k)))throw Error('Unsupported capture metadata');
 if(!['codex-records','claude-message-usage','cursor-model-info'].includes(m.basis))throw Error('Unknown metadata source');
 if(!Array.isArray(m.models)||m.models.length>32||m.models.some(v=>typeof v!=='string'||!v.length||v.length>120||!/^[a-zA-Z0-9][a-zA-Z0-9 ._:/+-]*$/.test(v)))throw Error('Invalid recorded model');
 for(const k of ['input_tokens','output_tokens','cached_input_tokens','reasoning_tokens'])if(m[k]!=null&&!count(m[k]))throw Error('Invalid recorded token count');
 if(m.cached_input_tokens!=null&&(!count(m.input_tokens)||m.cached_input_tokens>m.input_tokens))throw Error('Cached input must be a subset of input');
 if(m.reasoning_tokens!=null&&(!count(m.output_tokens)||m.reasoning_tokens>m.output_tokens))throw Error('Reasoning must be a subset of output');
 if(count(m.input_tokens)&&count(m.output_tokens)&&!count(m.input_tokens+m.output_tokens))throw Error('Token count too large');
 return m;
}
function context(r){const goal=String(r.caption||r.note||'').trim(),result=String(r.story_result||'').trim();return `<section class="run-context" aria-label="About this run"><h3>Goal / context</h3><p>${goal?esc(goal):'The author has not described the goal yet.'}</p><h3>What changed</h3><p>${result?esc(result):'The author has not described the result yet.'}</p><p class="meta">${goal||result?'In the author’s words.':'Activity alone cannot tell us what was achieved.'}</p></section>`;}
function setup(r){let m=null;try{m=validate(r.capture_metadata)}catch{}
 const models=m?.models?.length?[...new Set(m.models)].join(', '):'Unknown — not recorded';
 const total=m&&count(m.input_tokens)&&count(m.output_tokens)?(m.input_tokens+m.output_tokens).toLocaleString('en-US'):'Unknown — not recorded';
 return `<section class="run-setup" aria-label="Models and usage"><h3>Models and usage</h3><dl class="run-evidence-facts"><div><dt>Platform / harness</dt><dd>${esc(r.harness||'Unknown — not recorded')}</dd></div><div><dt>Recorded models</dt><dd>${esc(models)}</dd></div><div><dt>Recorded tokens</dt><dd>${esc(total)}</dd></div>${r.model?`<div><dt>Author’s model label</dt><dd>${esc(r.model)}</dd></div>`:''}</dl><details><summary>Where these numbers come from</summary><p>Model names and usage come from the imported capture. STRIVE has not verified them with the provider.${m?' Source: '+esc(m.basis)+'.':''}</p>${total.startsWith('Unknown')?'<p>This capture does not include complete input and output token counts.</p>':`<p>${m.input_tokens.toLocaleString('en-US')} input + ${m.output_tokens.toLocaleString('en-US')} output tokens. Cached input and reasoning tokens are already included, and are not added again. Only calls with recorded usage are included; missing usage remains unknown. This is not a bill or a measure of wasted work.</p>`}</details></section>`;
}
function metrics(r){const rows=[['Human messages',r.prompts??r.turns_typed,'Messages typed or queued by a person; excludes tool results and injected context.'],['Tool requests',r.tool_calls??r.ridge_tool_calls,'Requests the agent made to tools. A request does not prove a successful action.'],['Files present after writes',r.artifacts_produced,'Files the capture says were written and existed when checked. This does not prove they work.']].filter(x=>count(x[1]));
 if(count(r.claims_verified)&&count(r.claims))rows.push(['Claims with matching evidence',`${r.claims_verified} of ${r.claims}`,'An automatic rule found evidence in the same turn as a claim. It does not establish successful work or independently verify the claim.']);
 return rows.length?`<section class="run-measurements"><h3>Recorded activity</h3>${rows.map(([label,value,why])=>`<details><summary>${esc(label)}: <strong>${esc(value)}</strong></summary><p>${esc(why)}</p></details>`).join('')}</section>`:'';
}
const api={context,setup,metrics,validate};root.StriveContext=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
