/* Research use: a choice recorded on your account (060), off until you make it, separate from
   reading, saving and publishing. It records a choice, never content: transcripts, prompts and
   session files are not a scope. Stop, delete and export are always on screen.
   An older version kept a "yes" in this browser only. That yes was never sent, so it is never
   turned into consent here: the person is asked again. */
(function(root){
'use strict';
const LEGACY='strive-research-preference-v1';
const SCOPES={update_text:'The text of updates I save',run_measurements:'Run measurements: durations and counts'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const missing=e=>/PGRST202|PGRST205|42883|42P01|schema cache|does not exist|Could not find/i.test(String(e?.code||'')+' '+String(e?.message||''));
function legacyYes(){try{const v=JSON.parse(root.localStorage.getItem(LEGACY)||'null');return v?.choice==='yes'}catch(_){return false}}
function clearLegacy(){try{root.localStorage.removeItem(LEGACY)}catch(_){}}
const day=t=>{try{return new Date(t).toISOString().slice(0,10)}catch(_){return ''}};
async function StriveResearchConsent({client,slot,profileId,current=()=>true,download}){
 if(!slot)return;
 const paint=async(note='')=>{
  const [{data:rows,error},{data:runs}]=await Promise.all([
   client.from('research_consents').select('id,scope,project,granted_at,revoked_at').order('granted_at',{ascending:false}),
   client.from('runs').select('project').eq('profile_id',profileId).not('project','is',null).limit(5000)]);
  if(!current())return;
  if(error){slot.innerHTML=`<h2 id="account-research-title">Research use</h2><p>${missing(error)?'Research choices are not available yet. Nothing is recorded, and research use stays off.':'Your research choice could not be confirmed right now. It is unchanged: if you allowed research use before, it is still allowed. Reload to check.'}</p>`;return}
  const active=rows.filter(r=>!r.revoked_at),ended=rows.filter(r=>r.revoked_at);
  const projects=[...new Set((runs||[]).map(r=>String(r.project||'').trim()).filter(Boolean))].sort();
  slot.innerHTML=`<h2 id="account-research-title">Research use</h2>
   <p>Off unless you choose it here. This records a choice, not content: STRIVE never collects transcripts, prompts or session files for research. Saving and publishing are separate choices and do not change this.</p>
   ${legacyYes()?'<p class="research-legacy" role="status">You said yes on a device before. That was never sent to STRIVE. Choose again below if you still want it. <button type="button" class="act" id="research-legacy-dismiss">Dismiss</button></p>':''}
   <p><strong>${active.length?'On for:':'Off.'}</strong></p>${active.length?'<ul class="research-active">'+active.map(r=>`<li>${esc(SCOPES[r.scope]||r.scope)} · ${r.project?esc(r.project):'all my projects'} · since ${esc(day(r.granted_at))} <button type="button" class="act" data-revoke="${esc(r.id)}">Stop</button></li>`).join('')+'</ul>':''}
   <form id="research-form" class="research-choice"><label>What may be used<select name="scope">${Object.entries(SCOPES).map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
    <label>Which project<select name="project"><option value="">All my projects</option>${projects.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('')}</select></label>
    <button class="act blue">Allow research use</button></form>
   <div class="account-actions"><button type="button" class="act" id="research-export">Export my data</button><button type="button" class="act" id="research-delete"${rows.length?'':' disabled'}>Delete all research choices</button></div>
   ${ended.length?`<details><summary>Ended choices (${ended.length})</summary><ul>${ended.map(r=>`<li>${esc(SCOPES[r.scope]||r.scope)} · ${r.project?esc(r.project):'all my projects'} · ${esc(day(r.granted_at))} to ${esc(day(r.revoked_at))}</li>`).join('')}</ul></details>`:''}
   <p class="account-state" role="status" aria-live="polite" id="research-state">${esc(note)}</p>`;
  const say=t=>{const s=slot.querySelector('#research-state');if(s)s.textContent=t};
  const call=async(fn,done)=>{try{const {data,error}=await fn();if(error)throw error;await paint(done(data))}catch(e){say(missing(e)?'Research choices are not available yet. Nothing was recorded.':(e.message||'That did not work.'))}};
  slot.querySelector('#research-legacy-dismiss')?.addEventListener('click',()=>{clearLegacy();paint('Dismissed. Research use stays as shown.')});
  slot.querySelector('#research-form').onsubmit=e=>{e.preventDefault();const f=e.target;
   call(()=>client.rpc('grant_research_consent',{p_scope:f.elements.scope.value,p_project:f.elements.project.value.trim()||null}),()=>{clearLegacy();return 'Recorded. You can stop it at any time.'})};
  slot.querySelectorAll('[data-revoke]').forEach(b=>b.onclick=()=>call(()=>client.rpc('revoke_research_consent',{p_consent_id:b.dataset.revoke}),()=>'Stopped. The dated record stays until you delete it.'));
  slot.querySelector('#research-delete').onclick=()=>{if(root.confirm('Delete every research choice and its history? This cannot be undone.'))call(()=>client.rpc('delete_research_consent',{p_consent_id:null}),n=>`Deleted ${Number(n)||0} research ${Number(n)===1?'choice':'choices'} and their history.`)};
  slot.querySelector('#research-export').onclick=()=>call(()=>client.rpc('export_my_feedback_and_consent'),data=>{(download||save)(data);return 'Exported. The file has your research choices, requests, votes and private marks.'});
 };
 await paint();
}
function save(data){
 const blob=new Blob([JSON.stringify(data,null,1)],{type:'application/json'}),a=document.createElement('a');
 a.href=URL.createObjectURL(blob);a.download='strive-feedback-and-consent.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
const api={StriveResearchConsent,LEGACY,SCOPES,missing};
root.StriveResearchConsent=StriveResearchConsent;root.StriveResearchKit=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
