// A private subscription list. It never changes which runs the reader can see.
(function(root){
  async function mount({client,slot,project,profileId,signIn,canFollow=true,isCurrent=()=>true}){
    if(!slot)return;
    slot.replaceChildren();
    const button=document.createElement('button');button.type='button';button.className='act';
    const note=document.createElement('span');note.className='hint';note.setAttribute('role','status');
    slot.append(button,note);
    if(!profileId){button.textContent='Sign in to follow this project';button.onclick=()=>{
      if(typeof signIn==='function')signIn();
    };return;}
    button.textContent='Loading project follow…';button.disabled=true;
    const {data,error}=await client.from('project_follows').select('project').eq('profile_id',profileId).eq('project',project);
    if(!isCurrent()||!slot.isConnected)return;
    if(error){button.textContent='Project following unavailable';note.textContent='Reload to try again. Your existing follows are unchanged.';return;}
    let followed=!!data?.length,pending=false;
    const paint=()=>{button.textContent=followed?'Following project':canFollow?'Follow project':'No public updates to follow';button.setAttribute('aria-pressed',String(followed));button.disabled=pending||(!followed&&!canFollow);};
    paint();
    button.onclick=async()=>{
      if(pending||!isCurrent())return;pending=true;paint();note.textContent='';
      const result=followed?await client.from('project_follows').delete().eq('profile_id',profileId).eq('project',project)
        :await client.from('project_follows').insert({profile_id:profileId,project});
      if(!isCurrent()||!slot.isConnected)return;
      pending=false;
      if(result.error){note.textContent='The change could not be saved. Try again.';paint();return;}
      followed=!followed;paint();note.textContent=followed?'Saved. Find the next public update in Following projects.':'Project unfollowed.';
    };
  }
  root.StriveProjectFollow={mount};
})(typeof window==='object'?window:globalThis);
