/* One profile, one activity stream. Filters change the view, never the audience. */
(function(root){
 function mount({app,runs,client,esc,current}){
  const header=app.querySelector('.profile-header');if(!header)return;
  app.querySelectorAll('.pp-intro,.pp-visitor-cta,.profile-recorded-details,.profile-project-list,.profile-summary,.heatmap,.profile-public-note').forEach(n=>n.remove());
  const nav=document.createElement('nav');nav.className='v2-profile-tabs';nav.setAttribute('aria-label','Profile views');
  nav.innerHTML=[['activity','Activity'],['agent','Agent runs'],['projects','Projects'],['tools','Tools'],['media','Media']].map(([key,label])=>'<button type="button" class="v2-button" data-profile-view="'+key+'" aria-pressed="'+(key==='activity')+'">'+label+'</button>').join('');header.after(nav);
  const stream=document.createElement('section');stream.className='v2-profile-stream';stream.setAttribute('aria-label','Activity');
  const overview=[...app.querySelectorAll('.strive-overview')];for(const el of overview)stream.append(el);nav.after(stream);
  const projects=app.querySelector('#pp-root');if(projects){projects.classList.add('v2-projects');projects.hidden=true;stream.after(projects);}
  // Remove the superseded activity headings; the filter row is the sole view control.
  [...app.children].filter(n=>n.classList.contains('head')&&/Activities/.test(n.textContent)).forEach(n=>n.remove());app.querySelectorAll('.pinned>.head').forEach(n=>n.remove());
  const tools=document.createElement('section');tools.className='v2-surface v2-pad v2-profile-tools';tools.hidden=true;
  const names=[...new Set(runs.filter(r=>r.trace_basis!=='typed-by-author').map(r=>root.StriveAgents?.agentName(r.harness)||r.harness).filter(Boolean))];tools.innerHTML='<h2>Tools in these runs</h2><div class="v2-row">'+names.map(name=>'<span class="v2-chip">'+esc(name)+'</span>').join('')+'</div>'+(names.length?'':'<p>No tools recorded in these public updates yet.</p>');stream.after(tools);
  const media=document.createElement('section');media.className='v2-profile-media';media.hidden=true;media.setAttribute('aria-label','Images from public updates');stream.after(media);let mediaLoaded=false;
  async function loadMedia(){if(mediaLoaded)return;mediaLoaded=true;media.innerHTML='<p role="status">Loading images…</p>';try{const ids=runs.filter(r=>r.visibility==='public').map(r=>r.id);if(!ids.length){media.textContent='No public images yet.';return;}const {data,error}=await client.from('run_photos').select('id,run_id,role,is_selected,is_private,personal_public_selected').in('run_id',ids).eq('is_selected',true).eq('is_private',false);if(!current())return;if(error)throw error;const photos=(data||[]).filter(p=>p.role!=='personal'||p.personal_public_selected===true);media.innerHTML=photos.map(p=>'<a href="/?run='+encodeURIComponent(p.run_id)+'"><img src="/api/run-photos?'+new URLSearchParams({run_id:p.run_id,id:p.id,w:'480'})+'" alt="Selected image from a public update" loading="lazy" width="480" height="360"></a>').join('')||'<p>No public images yet.</p>';}catch{if(current()){media.textContent='Images could not load. Choose Media to retry.';mediaLoaded=false;}}}
  nav.querySelectorAll('button').forEach(button=>button.onclick=()=>{if(!current())return;const view=button.dataset.profileView;nav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));stream.hidden=!['activity','agent'].includes(view);if(projects)projects.hidden=view!=='projects';tools.hidden=view!=='tools';media.hidden=view!=='media';stream.querySelectorAll('[data-run-id]').forEach(card=>{const run=runs.find(r=>r.id===card.dataset.runId);card.hidden=view==='agent'&&run?.trace_basis==='typed-by-author';});if(view==='media')void loadMedia();});
 }
 root.StriveProfileV2={mount};
})(typeof window==='undefined'?globalThis:window);
