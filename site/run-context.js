/* Public context uses author words and bounded capture metadata, never transcript text. */
(function(root){
const esc=s=>String(s??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
const estimates=()=>root.StriveEstimates||(typeof require==='function'?require('./run-estimates.js'):null);
const count=v=>Number.isSafeInteger(v)&&v>=0;
function validate(m){
 if(m==null)return null;
 if(typeof m!=='object'||Array.isArray(m)||Object.keys(m).some(k=>!['models','basis','input_tokens','output_tokens','cached_input_tokens','reasoning_tokens','estimates'].includes(k)))throw Error('Unsupported capture metadata');
 if(!['codex-records','claude-message-usage','cursor-model-info'].includes(m.basis))throw Error('Unknown metadata source');
 if(!Array.isArray(m.models)||m.models.length>32||m.models.some(v=>typeof v!=='string'||!v.length||v.length>120||!/^[a-zA-Z0-9][a-zA-Z0-9 ._:/+-]*$/.test(v)))throw Error('Invalid recorded model');
 for(const k of ['input_tokens','output_tokens','cached_input_tokens','reasoning_tokens'])if(m[k]!=null&&!count(m[k]))throw Error('Invalid recorded token count');
 if(m.cached_input_tokens!=null&&(!count(m.input_tokens)||m.cached_input_tokens>m.input_tokens))throw Error('Cached input must be a subset of input');
 if(m.reasoning_tokens!=null&&(!count(m.output_tokens)||m.reasoning_tokens>m.output_tokens))throw Error('Reasoning must be a subset of output');
 if(count(m.input_tokens)&&count(m.output_tokens)&&!count(m.input_tokens+m.output_tokens))throw Error('Token count too large');
 if(m.estimates!==undefined){if(!estimates())throw Error('Estimate validator unavailable');estimates().validate(m.estimates,m);}
 return m;
}
function context(r,{shownText=''}={}){const goal=String(r.caption||r.note||'').trim(),result=String(r.story_result||'').trim();// The run's description is already on the card, above this. It is not said twice: this block adds
// only what the author wrote about the result, and stays out of the way when there is nothing.
if(result&&result===String(shownText).trim())return '';
if(!result)return goal?'':'<p class="meta run-context-none">The author has not described this run. Activity alone cannot tell us what was achieved.</p>';
return `<section class="run-context" aria-label="What changed"><h3>What changed</h3><p>${esc(result)}</p></section>`;}
function setup(r){let m=null;try{m=validate(r.capture_metadata)}catch{}
 const models=m?.models?.length?[...new Set(m.models)].join(', '):'Unknown — not recorded';
 const total=m&&count(m.input_tokens)&&count(m.output_tokens)?(m.input_tokens+m.output_tokens).toLocaleString('en-US'):'Unknown — not recorded';
 return `<section class="run-setup" aria-label="Models and usage"><h3>Models and usage</h3><dl class="run-evidence-facts"><div><dt>Platform / harness</dt><dd>${esc(r.harness||'Unknown — not recorded')}</dd></div><div><dt>Recorded models</dt><dd>${esc(models)}</dd></div><div><dt>Recorded tokens</dt><dd>${esc(total)}</dd></div>${r.model?`<div><dt>Author’s model label</dt><dd>${esc(r.model)}</dd></div>`:''}</dl><details><summary>Where these numbers come from</summary><p>Model names and usage come from the imported capture. STRIVE has not verified them with the provider.${m?' Source: '+esc(m.basis)+'.':''}</p>${total.startsWith('Unknown')?'<p>This capture does not include complete input and output token counts.</p>':`<p>${m.input_tokens.toLocaleString('en-US')} input + ${m.output_tokens.toLocaleString('en-US')} output tokens. Cached input and reasoning tokens are already included, and are not added again. Only calls with recorded usage are included; missing usage remains unknown. This is not a bill or a measure of wasted work.</p>`}</details></section>`;
}
function metrics(r){const rows=[['Human messages',r.prompts??r.turns_typed,'Messages typed or queued by a person; excludes tool results and injected context.'],['Tool requests',r.tool_calls??r.ridge_tool_calls,'Requests the agent made to tools. A request does not prove a successful action.'],['Files present after writes',r.artifacts_produced,'Files the capture says were written and existed when checked. This does not prove they work.']].filter(x=>count(x[1]));
 if(count(r.claims_verified)&&count(r.claims))rows.push(['Claims with matching evidence',`${r.claims_verified} of ${r.claims}`,'An automatic rule found evidence in the same turn as a claim. It does not establish successful work or independently verify the claim.']);
 return rows.length?`<section class="run-measurements"><h3>Recorded activity</h3>${rows.map(([label,value,why])=>`<details><summary>${esc(label)}: <strong>${esc(value)}</strong></summary><p>${esc(why)}</p></details>`).join('')}</section>`:'';
}
// Only stored, validated inputs can supply optional estimate metrics.
function cardFacts(r){
 let m=null,inconsistent=false;try{m=validate(r.capture_metadata)}catch{inconsistent=true}
 const total=m&&count(m.input_tokens)&&count(m.output_tokens)?m.input_tokens+m.output_tokens:null;
 const number=v=>v.toLocaleString('en-US');
 const typed=r.prompts??r.turns_typed;
 const models=m?.models?.length?[...new Set(m.models)].map(v=>v==='claude-opus-5-5'?'Claude Opus 5.5':v).join(', '):null;
 return [
  ['Recorded tokens',total===null?'Not recorded':total>=1000?new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(total):number(total),total===null?(inconsistent?'Captured usage could not be interpreted consistently; no reliable token total is shown.':'Complete input and output counts are absent.'):number(m.input_tokens)+' input + '+number(m.output_tokens)+' output. Cached input is included; only calls with recorded usage are counted.'],
  ...(estimates()?.facts(m).rows||[]),
  ['Model',models||'Not recorded',models?'Model names from the capture.':r.model?'Author’s model label: '+r.model:'No recorded model names.'],
  ['You typed',count(typed)?number(typed):'Not recorded','Recorded human messages, not words or keystrokes.']
 ];
}
// Three headline facts from the same run; elapsed span is never active time.
function headlineFacts(r){
 const facts=cardFacts(r),known=label=>facts.find(row=>row[0]===label&&row[1]!=='Not recorded');
 const tokens=known('Recorded tokens'),cost=known('Est. dollars'),active=known('Tool-active time · proxy');
 if(tokens&&cost&&active)return [tokens,cost,active];
 const rows=tokens?[tokens]:[];
 const seconds=[r.ridge_basis==='wall-time'?r.ridge_wall_seconds:null,r.wall_time_s,r.duration_s].find(v=>Number.isFinite(v)&&v>0);
 if(seconds!==undefined){const minutes=Math.round(seconds/60);rows.push(['Elapsed',seconds<60?Math.round(seconds)+'s':minutes<60?minutes+' min':Math.floor(minutes/60)+'h '+minutes%60+'m','Recorded session span; includes idle time and is not human active time.']);}
 if(count(r.commits))rows.push(['Commits',String(r.commits),'Commits recorded in this capture; not a claim of deployment.']);
 if(count(r.files_touched))rows.push(['Files touched',String(r.files_touched),'Files touched in this capture.']);
 const typed=known('You typed');if(typed)rows.push(typed);
 return rows.slice(0,3);
}
function headlineHtml(r,className='post-facts'){
 const rows=headlineFacts(r);
 if(rows.length===3)return `<dl class="${esc(className)}" aria-label="Recorded activity">${rows.map(([label,value,detail])=>`<div><dt>${factLabel(label)}</dt><dd title="${esc(detail)}">${esc(value)}</dd></div>`).join('')}</dl>`;
 let inconsistent=false;try{validate(r.capture_metadata)}catch{inconsistent=true}
 const placeholders=root.StrivePlaceholders||(typeof require==='function'?require('./run-placeholders.js'):null);
 return placeholders?.render('numbers',{compact:true,inconsistent,facts:rows,story:r.caption||r.title})||'';
}
function factLabel(label){return esc(label)+(label==='Est. dollars'?'<sup aria-label="See measurement basis">*</sup>':'');}
function cardSecondary(r,{commits=false}={}){
 const facts=cardFacts(r),model=facts.find(row=>row[0]==='Model'),typed=facts.find(row=>row[0]==='You typed');
 const bits=[];if(model&&model[1]!=='Not recorded')bits.push(model[1]);if(commits&&count(r.commits))bits.push(r.commits+' '+(r.commits===1?'commit':'commits'));if(typed&&typed[1]!=='Not recorded')bits.push('You typed '+typed[1]);
 return bits.length?`<p class="post-measurement-meta">${bits.map(esc).join(' · ')}</p>`:'';
}
function measurementNotes(r){
 let m=null;try{m=validate(r.capture_metadata)}catch{}
 const missing=estimates()?.facts(m).missing||[['Est. dollars','No stored estimate inputs.'],['Tool-active time · proxy','No stored tool-call bin provenance.']];
 const facts=[...new Map([...cardFacts(r),...headlineFacts(r)].map(row=>[row[0],row])).values()];
 return [...facts.filter(row=>row[2]).map(([label,,detail])=>[label,detail]),...missing];
}
function measurementDetails(r){return `<details class="post-measurement-note"><summary>About these measurements</summary>${measurementNotes(r).map(([label,detail])=>`<p><strong>${esc(label)}.</strong> ${esc(detail)}</p>`).join('')}</details>`;}
function prepareForStorage(m){return estimates()?.prepare(m)||m;}
function profileFacts(runs){
 const rows=[...new Map((runs||[]).map((r,i)=>[r.id||'row-'+i,r])).values()];
 let tokens=0,usageRuns=0,typed=0,typedRuns=0;const models=new Set();
 for(const r of rows){let m=null;try{m=validate(r.capture_metadata)}catch{}
  if(m&&count(m.input_tokens)&&count(m.output_tokens)&&count(tokens+m.input_tokens+m.output_tokens)){tokens+=m.input_tokens+m.output_tokens;usageRuns++}
  for(const model of m?.models||[])models.add(model);
  const n=r.prompts??r.turns_typed;if(count(n)&&count(typed+n)){typed+=n;typedRuns++}
 }
 const scope=n=>n+' of '+rows.length+' loaded runs';
 return `<section class="profile-capture-stats" aria-label="Recorded capture measurements"><h2>Recorded activity</h2><dl>
 <div><dt>Recorded tokens</dt><dd>${usageRuns?tokens.toLocaleString('en-US'):'Not recorded'}</dd><small>${scope(usageRuns)} have usage</small></div>
 <div><dt>You typed</dt><dd>${typedRuns?typed.toLocaleString('en-US'):'Not recorded'}</dd><small>${scope(typedRuns)} have human message counts</small></div>
 <div><dt>Dollars</dt><dd>Not recorded</dd><small>No bill in these captures</small></div>
 <div><dt>Active time</dt><dd>Not recorded</dd><small>Elapsed spans include waiting</small></div>
 </dl><p class="profile-models">Recorded models: ${models.size?[...models].map(esc).join(', '):'Not recorded'}</p><p class="profile-stats-scope">Recorded usage only; missing captures are not counted as zero. Cached input is already included.</p></section>`;
}
const api={context,setup,metrics,validate,cardFacts,headlineFacts,headlineHtml,profileFacts,cardSecondary,factLabel,measurementNotes,measurementDetails,prepareForStorage};root.StriveContext=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
