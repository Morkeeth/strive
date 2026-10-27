/* Agent submissions reuse private runs. Public reads stay behind existing RLS. */
(function(root){
  function pending(run,owner){return !!owner&&run?.profile_id===owner&&run.visibility==='private'}
  // All saved private history is available. A choice never changes its audience.
  function waiting(run,owner){return pending(run,owner)}
  const context=()=>root.StriveContext||(typeof require==='function'?require('./run-context.js'):null);
  const stamp=r=>Date.parse(r.created_at)||Date.parse(r.started_at)||0;
  function newest(rows){return [...rows].sort((a,b)=>stamp(b)-stamp(a)||String(a.id).localeCompare(String(b.id)))}
  function facts(run){return context()?.shownFacts(run)||[];}
  function identity(run){
    // Authored result first; an author note is labelled as such, never inferred output.
    const result=String(run.story_result||'').trim(),note=String(run.caption||run.note||'').trim();
    let repo='';try{const u=new URL(run.repo_url);if(u.protocol==='https:'&&!u.username&&!u.password&&['github.com','gitlab.com','bitbucket.org'].includes(u.hostname))repo=u.hostname+'/'+u.pathname.replace(/^\/|\/$/g,'').replace(/\.git$/,'');}catch(_){}
    return {project:root.GrinderContract?.projectLabel?.(run.project)||String(run.project||'').trim()||'Project not recorded',repo,result:result||note||'Result not recorded. Activity alone does not say what was achieved.',label:result?'What changed':note?'Author note':'What changed'};
  }
  async function read(client,owner){
    if(!owner)return [];
    const all=[];
    // Page through the owner's history, including saves before the old launch cutoff.
    for(let from=0;;from+=500){
      let query=client.from('runs').select('*, profiles!runs_profile_id_fkey(github_handle,name,rig,handle,display_name,avatar_url)').eq('profile_id',owner).eq('visibility','private').order('created_at',{ascending:false,nullsFirst:false}).order('id',{ascending:false});
      const paged=typeof query.range==='function';
      const {data,error}=await (paged?query.range(from,from+499):query);
      if(error)throw error;all.push(...(data||[]));
      if(!paged||(data||[]).length<500)break;
    }
    return newest([...new Map(all.filter(run=>waiting(run,owner)).map(r=>[r.id,r])).values()]);
  }
  function recordedDay(run){const d=new Date(run.started_at||run.created_at);return Number.isFinite(d.getTime())?d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'):'';}
  function matches(run,{search='',project='',harness='',day=''}={}){
    const info=identity(run),text=[run.title,info.project,info.repo,info.result,run.harness].join(' ').toLowerCase();
    return (!search||text.includes(search.toLowerCase().trim()))&&(!project||info.project===project)&&(!harness||run.harness===harness)&&(!day||recordedDay(run)===day);
  }

  async function discard(client,run,owner){
    if(!pending(run,owner))throw Error('Only the owner can discard a pending run.');
    const {data,error}=await client.from('runs').delete().eq('id',run.id).eq('profile_id',owner).eq('visibility','private').select('id');
    if(error)throw error;if(data?.length!==1)throw Error('This run changed. Refresh before deciding.');
  }
  async function approve(client,run,owner){
    if(!pending(run,owner))throw Error('Only the owner can post a private run.');
    if(run.source_actor_id){
      const actor=await client.from('grinder_agents').select('visibility').eq('id',run.source_actor_id).eq('owner_id',owner).single();
      if(actor.error||actor.data?.visibility!=='public')throw Error('Make this agent profile public in Connect before posting. This run is still private.');
    }
    const {data,error}=await client.from('runs').update({visibility:'public'}).eq('id',run.id).eq('profile_id',owner).eq('visibility','private').select('id');
    if(error)throw Error('This run could not be posted. Refresh and try again.');
    if(data?.length!==1)throw Error('This run changed. Refresh before posting.');
  }
  async function mount({client,owner,slot,esc,current,open,renderCard}){
    if(!owner)return;
    let rows;try{rows=await read(client,owner)}catch(_){if(current())slot.insertAdjacentHTML('afterbegin','<p role="alert">Your review queue could not load. <a href="/?queue">Try again</a></p>');return}
    if(!current())return;if(!rows.length){if(!open)slot.insertAdjacentHTML('beforeend','<p>No private runs are waiting for review.</p>');return;}
    const box=document.createElement('section');box.className='card pad queue-list';box.setAttribute('aria-label','Choose private runs to post');
    const selected=new Set(),filters={search:'',project:'',harness:'',day:''};let page=0,activeId=null,renderGeneration=0,busy=false,disposePreview=()=>{};
    const options=(values)=>[...new Set(values.filter(Boolean))].sort().map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');
    box.innerHTML='<header class="queue-heading"><div><h2>Choose what to post</h2><p class="meta">'+rows.length+' saved private runs · Only me</p></div><a href="/?post" class="act">Import an older run</a></header><div class="queue-filters"><label>Search<input type="search" data-filter="search" placeholder="Project, title or result"></label><label>Project<select data-filter="project"><option value="">All projects</option>'+options(rows.map(r=>identity(r).project))+'</select></label><label>Agent<select data-filter="harness"><option value="">All agents</option>'+options(rows.map(r=>r.harness))+'</select></label><label>Recorded day<input type="date" data-filter="day"></label><button type="button" class="ghost" data-clear>Clear filters</button></div><div class="queue-selection"><span data-selected-count>0 chosen</span><button type="button" class="act blue" data-review disabled>Preview chosen runs</button><button type="button" class="ghost" data-clear-selection hidden>Clear choices</button></div><div data-results></div><nav class="queue-pages" aria-label="Saved run pages"><button type="button" class="ghost" data-prev>Previous</button><span data-page role="status"></span><button type="button" class="ghost" data-next-page>Next</button></nav><section class="queue-publish-preview" data-preview hidden aria-label="Public post preview"></section>';
    slot[open?'prepend':'append'](box);
    const results=box.querySelector('[data-results]'),preview=box.querySelector('[data-preview]');
    const valid=()=>current()&&box.isConnected;
    const selection=()=>{box.querySelector('[data-selected-count]').textContent=selected.size+' chosen';box.querySelector('[data-review]').disabled=!selected.size||busy;box.querySelector('[data-clear-selection]').hidden=!selected.size;};
    const paint=()=>{
      box.querySelector('.queue-heading .meta').textContent=rows.length+' saved private runs · Only me';
      const found=rows.filter(r=>matches(r,filters)),pages=Math.max(1,Math.ceil(found.length/12));page=Math.min(page,pages-1);
      results.innerHTML=found.slice(page*12,page*12+12).map(run=>{
        const info=identity(run),date=run.started_at||run.created_at,when=date?new Date(date).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}):'Date unknown';
        return '<label class="queue-choice"><input type="checkbox" data-choose="'+esc(run.id)+'" '+(selected.has(run.id)?'checked':'')+'><span><strong>'+esc(run.title||'Untitled run')+'</strong><small>'+esc(info.project)+' · '+esc(when)+' · '+esc(run.harness||'Agent unknown')+(run.started_at?'':' · start unknown')+'</small><span class="queue-choice-result">'+esc(info.result)+'</span></span></label>';
      }).join('')||'<p>No runs match these filters. Clear filters to see your history.</p>';
      box.querySelector('[data-page]').textContent=found.length+' matching · Page '+(page+1)+' of '+pages;
      box.querySelector('[data-prev]').disabled=page===0;box.querySelector('[data-next-page]').disabled=page===pages-1;
      results.querySelectorAll('[data-choose]').forEach(input=>input.onchange=()=>{input.checked?selected.add(input.dataset.choose):selected.delete(input.dataset.choose);selection();});selection();
    };
    box.querySelectorAll('[data-filter]').forEach(input=>input.addEventListener(input.tagName==='INPUT'&&input.type==='search'?'input':'change',()=>{filters[input.dataset.filter]=input.value;page=0;paint();}));
    box.querySelector('[data-clear]').onclick=()=>{for(const k of Object.keys(filters))filters[k]='';box.querySelectorAll('[data-filter]').forEach(i=>i.value='');page=0;paint();};
    box.querySelector('[data-prev]').onclick=()=>{page--;paint();};box.querySelector('[data-next-page]').onclick=()=>{page++;paint();};
    const browsing=shown=>box.querySelectorAll('.queue-filters,.queue-selection,[data-results],.queue-pages').forEach(el=>el.hidden=!shown);
    const closePreview=()=>{disposePreview();disposePreview=()=>{};renderGeneration++;activeId=null;preview.hidden=true;preview.replaceChildren();browsing(true);};
    box.querySelector('[data-clear-selection]').onclick=()=>{if(busy)return;selected.clear();closePreview();paint();};
    async function showPreview(id){
      if(!valid()||busy)return;const run=rows.find(r=>r.id===id&&selected.has(id));if(!run)return;
      disposePreview();disposePreview=()=>{};const generation=++renderGeneration;activeId=id;browsing(false);const chosen=[...selected],index=chosen.indexOf(id);preview.hidden=false;
      preview.innerHTML='<header><h3>Review public post · '+(index+1)+' of '+chosen.length+'</h3><button type="button" class="ghost" data-back>Back to choices</button></header><p><strong>Public</strong> · Anyone can see this run and its selected photos in Feed and on your profile.</p><div data-queue-card="'+esc(id)+'"><p role="status">Loading the exact card</p></div><p class="meta">Only this run is posted. Your other saved runs stay private.</p><div class="queue-actions"><button type="button" class="act blue" data-approve-id="'+esc(id)+'" disabled>Post this run publicly</button><a class="act" href="/?run='+encodeURIComponent(id)+'&review=1#run-edit">Edit this run</a><button type="button" class="ghost" data-skip>Skip this choice</button></div><p data-post-status role="status"></p>';
      preview.querySelector('[data-back]').onclick=()=>{if(!busy)closePreview();};
      preview.querySelector('[data-skip]').onclick=()=>{if(busy)return;selected.delete(id);paint();const next=[...selected][0];next?void showPreview(next):closePreview();};
      const button=preview.querySelector('[data-approve-id]');
      button.onclick=async()=>{
        if(!valid()||busy||button.disabled||activeId!==id||generation!==renderGeneration||!selected.has(id))return;busy=true;button.disabled=true;selection();
        preview.querySelectorAll('button,a').forEach(b=>{if(b.tagName==='BUTTON')b.disabled=true;else b.setAttribute('aria-disabled','true');});
        try{await approve(client,run,owner);if(!valid())return;rows=rows.filter(r=>r.id!==id);selected.delete(id);busy=false;paint();
          disposePreview();disposePreview=()=>{};preview.innerHTML='<h3>Posted</h3><p>'+esc(run.title||'Your run')+' is public.</p><a class="act" href="/r/'+encodeURIComponent(id)+'">Open public run</a><button type="button" class="act blue" data-continue>'+(selected.size?'Preview next chosen run':'Back to choices')+'</button>';
          preview.querySelector('[data-continue]').onclick=()=>selected.size?void showPreview([...selected][0]):closePreview();root.dispatchEvent?.(new Event('strive-review-changed'));
        }catch(error){busy=false;if(valid()&&generation===renderGeneration){preview.querySelector('[data-post-status]').textContent=error.message;preview.querySelectorAll('button').forEach(b=>b.disabled=false);selection();}}
      };
      preview.scrollIntoView?.({block:'start',behavior:'smooth'});
      try{const html=renderCard?await renderCard({...run,visibility:'public'}):null;if(!valid()||generation!==renderGeneration)return;
        if(!html)throw Error('Preview unavailable');const host=preview.querySelector('[data-queue-card]');host.innerHTML=html;
        if(!root.StriveRunPhotos?.mountCovers)throw Error('Selected photos cannot be verified. This run is still private.');
        const outcomes=await root.StriveRunPhotos.mountCovers({client,root:host,publishReview:true});
        if(!valid()||generation!==renderGeneration){outcomes?.forEach(result=>result?.dispose?.());return;}
        const outcome=outcomes?.find(result=>result?.runId===id);
        if(!outcome||!['ready','known-none'].includes(outcome.status))throw Error('Selected photos cannot be verified. This run is still private.');
        disposePreview=outcome.dispose||(()=>{});
        if(outcome.status==='known-none')preview.querySelector('[data-post-status]').textContent='No images selected. This run will post without images.';
        button.disabled=false;
      }catch(error){if(valid()&&generation===renderGeneration){
        button.disabled=true;const status=preview.querySelector('[data-post-status]');status.setAttribute('role','alert');status.textContent=(error.message||'Preview could not load.')+' ';
        const retry=document.createElement('button');retry.type='button';retry.className='ghost';retry.textContent='Retry selected photo preview';retry.onclick=()=>void showPreview(id);status.append(retry);
      }}
    }
    box.querySelector('[data-review]').onclick=()=>void showPreview([...selected][0]);paint();
    const seen=rows.reduce((best,run)=>!best||stamp(run)>stamp(best)||(stamp(run)===stamp(best)&&String(run.id)>String(best.id))?run:best,null);
    if(seen&&client.rpc)void client.rpc('mark_review_alerts_seen',{through_created_at:seen.created_at,through_id:seen.id}).then(({error})=>{if(!error&&current())root.dispatchEvent?.(new Event('strive-review-changed'))}).catch(()=>{});
  }

  const api={pending,waiting,newest,facts,identity,matches,read,discard,approve,mount};root.StriveRunQueue=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
