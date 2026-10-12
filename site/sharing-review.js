/* Exact outgoing row review. Browser-only display; no network or storage writes. */
(function(root){
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const metrics=[['tool_calls','Tool calls'],['files_touched','Files touched'],['commits','Commits'],['model','Model'],['duration','Duration']];
 const audiences={private:'Nobody',public:'Anyone, including signed-out visitors. Listed in Feed and your profile.',link:'Your signed-in followers and Close friends.',close_friends:'People on your Close friends list.'};
 const localStarted=value=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value));
 function mount({slot,run,buildRow,audience,save,onChange,buildProfile=()=>null,initial={}}){
  slot.innerHTML='<section class="sharing-review" aria-labelledby="sharing-review-heading"><p class="sharing-review-kicker">DATA · Not shared yet</p><h2 id="sharing-review-heading">What you are sharing</h2><p>Choose the measurements to save. Unticked measurements are left out of the saved run.</p><fieldset class="sharing-review-choices"><legend>Measurements to include</legend>'+metrics.map(([key,label])=>{const value=key==='model'?(run.model||(run.capture_metadata?.models?.length?run.capture_metadata.models.join(', '):null)):run[key==='duration'?'duration_s':key];const unknownGitZero=key==='commits'&&value===0&&!run.repo_url&&!run.code_route;return '<label><input type="checkbox" data-share-metric="'+key+'" '+(value==null||unknownGitZero?'disabled':initial[key]===false?'':'checked')+'>'+label+(unknownGitZero?' · Git repository not recorded':value==null?' · not recorded':' · '+esc(value)+(key==='duration'?' seconds':''))+'</label>'}).join('')+'</fieldset><div class="sharing-review-columns"><section><h3>Stays on this computer</h3><p>Original transcript, prompt text, file contents and source paths.</p><p class="hint">These are not included in this run. Your chosen title, note, links and images are included when you save.</p></section><section><h3>Saved to your account</h3><p data-share-save-note></p><dl data-share-summary></dl><details><summary>All fields and values</summary><pre data-share-row></pre></details><p class="hint">The service adds a run ID and save time. Sign-in identifies your account.</p></section><section><h3>Visible to others</h3><p class="sharing-review-audience" data-share-audience></p><p data-share-visible-note></p></section></div><p class="hint" data-share-agent-note></p></section>';
  const inputs=[...slot.querySelectorAll('[data-share-metric]')];
  function choices(){return Object.fromEntries(inputs.filter(i=>!i.disabled||i.dataset.shareMetric==='commits').map(i=>[i.dataset.shareMetric,i.checked]));}
  function refresh(){
   const row=buildRow(choices()),visibility=audience.value;
   const labels={title:'Run title',project:'Project',harness:'Agent',prompts:'Typed turns',tool_calls:'Tool calls',files_touched:'Files touched',commits:'Recorded commits',duration_s:'Duration in seconds',model:'Model',started_at:'Started'};
   slot.querySelector('[data-share-summary]').innerHTML=Object.entries(labels).filter(([key])=>row[key]!=null).map(([key,label])=>'<div><dt>'+label+'</dt><dd>'+esc(key==='started_at'?localStarted(row[key]):row[key])+'</dd></div>').join('');
   slot.querySelector('[data-share-row]').textContent=JSON.stringify({run:{...row,visibility},...(buildProfile()?{profile_updates:buildProfile()}: {})},null,2);
   slot.querySelector('[data-share-save-note]').textContent=run.review_run_id?'This private draft is already in your account. Confirming replaces its measurements with the selected fields below.':visibility==='private'?'Only you can open this saved run.':'Your saved run will use the audience below.';
   slot.querySelector('[data-share-audience]').textContent=audiences[visibility]||'Nobody';
   slot.querySelector('[data-share-visible-note]').textContent=visibility==='private'?'A link grants nobody else access.':'This audience can read the saved fields shown here, your chosen story and images marked visible to run readers. Source files and prompts are not shared.';
   slot.querySelector('[data-share-agent-note]').textContent=run.review_run_id?'An agent prepared this private draft. Review here, then press Save or Post yourself. No audience is changed by opening this preview.':'';
   if(!save.disabled)save.textContent=visibility==='private'?'Save, only me':visibility==='public'?'Post to feed':visibility==='link'?'Save for followers':'Save for close friends';
  }
  inputs.forEach(input=>input.addEventListener('change',()=>{onChange(choices());refresh()}));audience.addEventListener('change',refresh);
  refresh();return {choices,refresh};
 }
 root.StriveSharingReview={mount,metrics};if(typeof module==='object'&&module.exports)module.exports=root.StriveSharingReview;
})(typeof window==='object'?window:globalThis);
