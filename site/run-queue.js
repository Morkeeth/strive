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
  function shareable(run){
    const project=String(root.GrinderContract?.projectLabel?.(run.project)||run.project||'').trim();
    if(!project||/^(unknown|project unknown|unknown project|project|session|untitled|none|null)$/i.test(project))return false;
    const result=String(run.story_result||'').trim();
    let output=false;try{const url=new URL(run.output_url);output=url.protocol==='https:'&&!url.username&&!url.password;}catch(_){}
    return result.length>=12||output;
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
  function matches(run,{search='',project='',harness='',day='',owner=null,includeQA=false}={}){
    if(!includeQA&&owner&&run.profile_id===owner&&run.title==='QA STRIVE private acceptance 4Nov165126')return false;
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
    if(!owner)return;const box=document.createElement('section');box.className='v2-stack queue-one';slot[open?'prepend':'append'](box);
    let cursor=null,justPosted=false;let generation=0,busy=false,dispose=()=>{};
    const valid=()=>current()&&box.isConnected;
    async function next(){
      if(!valid()||busy)return;dispose();dispose=()=>{};const ticket=++generation;box.innerHTML='<p role="status">Finding your next private update…</p>';
      let run;try{let query=client.from('runs').select('*, profiles!runs_profile_id_fkey(github_handle,name,rig,handle,display_name,avatar_url)').eq('profile_id',owner).eq('visibility','private').order('created_at',{ascending:false}).order('id',{ascending:false}).not('project','is',null).not('project','eq','').or('story_result.not.is.null,output_url.not.is.null');if(cursor)query=query.or('created_at.lt.'+cursor.created_at+',and(created_at.eq.'+cursor.created_at+',id.lt.'+cursor.id+')');const result=await query.limit(1);if(result.error)throw result.error;run=result.data?.[0];}catch{if(valid())box.innerHTML='<p role="alert">Your next update could not load. <a href="/?queue">Try again</a></p>';return;}
      if(!valid()||ticket!==generation)return;
      if(!run){box.innerHTML=root.StriveUI?.empty({title:'You have reviewed these updates',body:'Updates with a named project and a written result or product link appear here. Your other private runs stay in your activity.'})||'<p>No more private updates to review.</p>';if(justPosted)box.insertAdjacentHTML('afterbegin','<p role="status">Posted. Your update is public.</p>');return;}
      if(!shareable(run)||!matches(run,{owner})){cursor=run;await next();return;}
      const id=run.id;box.innerHTML='<header><p class="v2-help">Only me · One update at a time</p><h2>Would you share this?</h2><p>Check the text and selected images. Posting makes this update public.</p></header><div data-queue-card="'+esc(id)+'"></div><div class="v2-row"><button type="button" class="v2-button primary" data-post disabled>Post publicly</button><a class="v2-button" href="/?run='+encodeURIComponent(id)+'#run-edit">Edit update</a><button type="button" class="v2-button" data-next>Keep private and next</button></div><p data-state role="status"></p>';
      const button=box.querySelector('[data-post]'),state=box.querySelector('[data-state]');box.querySelector('[data-next]').onclick=()=>{if(busy)return;cursor=run;void next();};
      button.onclick=async()=>{if(!valid()||busy||button.disabled||ticket!==generation)return;busy=true;box.querySelectorAll('button').forEach(b=>b.disabled=true);try{await approve(client,run,owner);if(!valid())return;cursor=run;justPosted=true;busy=false;root.dispatchEvent?.(new Event('strive-review-changed'));await next();}catch(error){busy=false;if(valid()&&ticket===generation){state.textContent=error.message;box.querySelectorAll('button').forEach(b=>b.disabled=false);}}};
      try{const host=box.querySelector('[data-queue-card]');host.innerHTML=await renderCard({...run,visibility:'public'});if(!valid()||ticket!==generation)return;
       if(!root.StriveRunPhotos?.mountCovers)throw Error('Selected images could not be checked. Your update stays private.');
       const outcomes=await root.StriveRunPhotos.mountCovers({client,root:host,publishReview:true});if(!valid()||ticket!==generation){outcomes?.forEach(o=>o?.dispose?.());return;}
       const outcome=outcomes?.find(o=>o?.runId===id);if(!outcome||!['ready','known-none'].includes(outcome.status))throw Error('Selected images could not be checked. Your update stays private.');dispose=outcome.dispose||(()=>{});if(outcome.status==='known-none')state.textContent='No images selected. This update will post without images.';button.disabled=false;
      }catch(error){if(valid()&&ticket===generation){state.textContent=error.message||'Preview unavailable. Your update stays private.';button.disabled=true;const retry=document.createElement('button');retry.type='button';retry.className='v2-button';retry.textContent='Try preview again';retry.onclick=()=>void next();state.append(retry);}}
    }
    await next();
  }

  const api={shareable,pending,waiting,newest,facts,identity,matches,read,discard,approve,mount};root.StriveRunQueue=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
