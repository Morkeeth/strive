(function(root){
 'use strict';
 const historical=r=>r?.trace_basis==='historical-reconstruction';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const count=v=>Number.isSafeInteger(v)&&v>=0&&v<=2147483647;
 async function digest(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');}
 async function prepare(input){
  if(input?.schema!=='local-historical-recovery-v1'||input.source?.full_transcript_recovered!==false||input.source?.contains_raw_prompt_text!==false)throw Error('Choose a source-indexed historical recovery manifest, without raw prompt text.');
  const rows=input.source.rows,repo=input.repo_evidence,history=input.observed_history;
  if(!Array.isArray(rows)||!rows.length||rows.length>50000||rows.some(x=>!Number.isSafeInteger(x.timestamp_ms)||!/^[a-f0-9]{64}$/.test(x.line_sha256)))throw Error('History needs timestamped source references.');
  const entries=[...new Map(rows.map(x=>[x.timestamp_ms+':'+x.line_sha256,{timestamp_ms:x.timestamp_ms,hash:x.line_sha256}])).values()].sort((a,b)=>a.timestamp_ms-b.timestamp_ms||a.hash.localeCompare(b.hash));
  if(history?.unique_timestamped_entries!==entries.length)throw Error('History count does not match its source index.');
  if(!Array.isArray(repo?.reachable_commits_in_utc_window)||repo.reachable_commits_in_utc_window.some(x=>!/^[a-f0-9]{40}$/.test(x.sha)))throw Error('Repository history needs exact commit references.');
  const commits=[...new Set(repo.reachable_commits_in_utc_window.map(x=>x.sha))].sort();
  if(repo.commit_count!==commits.length||!/^[a-f0-9]{40}$/.test(repo.frozen_head)||!count(commits.length))throw Error('Repository count does not match its source index.');
  const window=repo.window;
  if(!Array.isArray(window)||window.length!==2||window.some(v=>typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(v)||!Number.isFinite(Date.parse(v)))||Date.parse(window[0])>=Date.parse(window[1]))throw Error('Repository history needs its own dated query window.');
  const evidence={repo_window_start:new Date(window[0]).toISOString(),repo_window_end:new Date(window[1]).toISOString(),first_observed_at:new Date(entries[0].timestamp_ms).toISOString(),last_observed_at:new Date(entries.at(-1).timestamp_ms).toISOString(),history_entries:entries.length,repo_commits:commits.length,repo_revision:repo.frozen_head,source_ref:await digest({entries,commits})};
  // Intentionally omit identity, local paths, row hashes, prompt text, commit prose and guessed metrics.
  const proposed=String(input.draft_copy?.title||'').trim();
  const title=/[\\/]|(?:^|\s)~|file:|\b[A-Za-z]:/.test(proposed)?'Recovered build':(proposed||'Recovered build').slice(0,160);
  return {title,caption:'Recovered prompt history and repository changes. Complete session measurements are unavailable.',project:null,harness:null,schema_version:1,trace_basis:'historical-reconstruction',measurement_revision:await digest({format:'strive-history-v1',evidence}),history_evidence:evidence,visibility:'private'};
 }
 function facts(r){const e=r.history_evidence;if(!historical(r)||!e)return '';const when=v=>Number.isFinite(Date.parse(v))?new Date(v).toISOString().replace('T',' ').replace('.000Z',' UTC').replace('Z',' UTC'):'Unknown date';return `<section class="history-source"><p class="run-story-label">Recovered build history</p><h3>Prompt history: ${esc(when(e.first_observed_at))} to ${esc(when(e.last_observed_at))}</h3><p>Repository query window: ${esc(when(e.repo_window_start))} to ${esc(when(e.repo_window_end))} (end exclusive).</p><dl class="run-evidence-facts"><div><dt>Prompt-history entries</dt><dd>${count(e.history_entries)?e.history_entries:'Unknown'}</dd></div><div><dt>Repository commits in its separate query window</dt><dd>${count(e.repo_commits)?e.repo_commits:'Unknown'}</dd></div></dl><p class="hint">History entries are not complete session turns. Repository commits are not attributed to one agent or run. This date span is not active work time.</p><p class="hint">Tool calls, active duration, model, tokens and cost are unknown. No activity trace or achievement is inferred.</p></section>`;}
 function mount({slot,client,me,authGeneration,signIn,openRun,status}){
  slot.innerHTML='<div class="head"><h1>Recover an older build</h1></div><p>You still have the story, even when the full session is gone. Preview a source-indexed history file without inventing the missing numbers.</p><label class="photo-add">Choose recovery file<input type="file" accept="application/json,.json" data-history-file></label><p class="hint">Read locally. Only a compact source summary is prepared. Review your title before saving; source paths and raw prompts are not imported.</p><div data-history-preview></div>';
  let selection=0;
  const fileInput=slot.querySelector('[data-history-file]');
  fileInput.onchange=async()=>{const ticket=++selection,file=fileInput.files?.[0],target=slot.querySelector('[data-history-preview]');if(!file)return;if(file.size>8*1024*1024){status('Choose a manifest smaller than 8 MB.',true);return;}target.textContent='Reading history…';
   try{const run=await prepare(JSON.parse(await file.text()));if(ticket!==selection||!slot.isConnected)return;target.innerHTML=`<article class="card"><h2>${esc(run.title)}</h2><p>Historical reconstruction · client-reported</p>${facts(run)}<p>Not in activity rankings. Photos can be added after a private save.</p><label>Title<input data-history-title maxlength="160" value="${esc(run.title)}"></label><p class="hint">Only the title, standard description and source summary shown here will be saved. No source files are uploaded.</p><button type="button" data-history-save>${me()?'Save history privately':'Sign in to save'}</button><p data-history-status role="status"></p></article>`;
    target.querySelector('[data-history-save]').onclick=async()=>{const person=me();if(!person){signIn();return;}const generation=authGeneration(),button=target.querySelector('[data-history-save]'),current=()=>ticket===selection&&slot.isConnected&&generation===authGeneration()&&me()?.id===person.id;const title=target.querySelector('[data-history-title]').value.trim();if(!title){status('Add a title.',true);return;}button.disabled=true;
     try{const {data:prior,error:lookupError}=await client.from('runs').select('id').eq('profile_id',person.id).eq('trace_basis','historical-reconstruction').eq('history_evidence->>source_ref',run.history_evidence.source_ref).maybeSingle();if(!current())return;if(lookupError)throw lookupError;if(prior){openRun(prior.id);return;}
      const {data,error}=await client.from('runs').insert({...run,title,profile_id:person.id}).select('id').single();if(!current())return;if(error){if(error.code==='23505'){const {data:existing,error:retryError}=await client.from('runs').select('id').eq('profile_id',person.id).eq('trace_basis','historical-reconstruction').eq('history_evidence->>source_ref',run.history_evidence.source_ref).maybeSingle();if(!current())return;if(!retryError&&existing){openRun(existing.id);return;}}throw error;}openRun(data.id);
     }catch(e){if(current())target.querySelector('[data-history-status]').textContent=e.message||'History could not be saved.';}finally{if(current())button.disabled=false;}
    };
   }catch(e){if(ticket===selection)target.textContent=e.message||'This history file could not be read.';}
  };
 }
 const api={prepare,facts,historical,mount};root.StriveHistory=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
