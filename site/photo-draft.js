/* Images selected for an unsaved import. Blobs stay in IndexedDB until Save is clicked. */
(function(root){
  'use strict';
  const DB='strive-photo-drafts-v1', STORE='drafts', work=new Map(), listeners=new Map();
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const roles={personal:'Personal photo',result:'Screenshot / result',before:'Before',after:'After',photo:'Supporting image'};
  let database;
  async function db(){
    if(!database)database=new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE,{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new Error('Local photo storage is unavailable. Allow site storage, then choose the image again.'));});
    return database;
  }
  async function keyFor(token){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(token)));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
  async function read(key){const database=await db();return new Promise((resolve,reject)=>{const r=database.transaction(STORE).objectStore(STORE).get(key);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});}
  async function change(key,fn){
    const database=await db();return new Promise((resolve,reject)=>{
      const tx=database.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),r=store.get(key);let result,problem;
      r.onsuccess=()=>{try{result=fn(r.result||{key,version:1,items:[],phase:'staged',createdAt:Date.now()});store.put(result);}catch(error){problem=error;tx.abort();}};
      tx.oncomplete=()=>{listeners.get(key)?.();resolve(result)};tx.onabort=tx.onerror=()=>reject(problem||tx.error||new Error('Could not keep this photo on your device. Free some site storage and try again.'));
    });
  }
  function bound(draft,profileId){if(draft.profileId&&draft.profileId!==profileId)throw new Error('These images belong to a different signed-in account. Sign back in to that account to continue.');}
  function editable(draft){if(draft.runId)throw new Error('This save has started. Retry it or manage images on the saved run.');}
  async function imageBlob(file){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12*1024*1024)throw new Error('Choose a JPEG, PNG or WebP smaller than 12 MB.');
    const url=URL.createObjectURL(file),image=new Image();
    try{
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('This image could not be opened.'));image.src=url;});
      if(image.naturalWidth*image.naturalHeight>40000000)throw new Error('Choose an image with fewer than 40 megapixels.');
      const scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.84));if(!blob||blob.size>3*1024*1024)throw new Error('This image is too large after resizing. Choose a smaller image.');
      const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
      return {blob,width:canvas.width,height:canvas.height,contentKey:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')};
    }finally{URL.revokeObjectURL(url);image.onload=image.onerror=null;}
  }
  function enqueue(key,fn){const operation=(work.get(key)||Promise.resolve()).catch(()=>{}).then(fn);work.set(key,operation);operation.finally(()=>{if(work.get(key)===operation)work.delete(key)}).catch(()=>{});return operation;}
  async function hasDraft(token){const key=await keyFor(token);await work.get(key);const draft=await read(key);return !!draft&&draft.phase!=='complete'&&(draft.items.length>0||!!draft.runId);}
  async function mount({slot,token,profileId=null,eligible=true,isCurrent=()=>true}){
    if(!slot)return;
    if(!eligible){slot.innerHTML='<p class="hint">Images can be added to a recorded session with a capture reference.</p>';return;}
    const key=await keyFor(token);let active=true,urls=[];
    const clear=()=>{urls.forEach(url=>URL.revokeObjectURL(url));urls=[]};
    const current=()=>active&&slot.isConnected&&isCurrent();
    function message(text){if(current()){const el=slot.querySelector('[data-draft-message]');if(el){el.textContent=text;el.hidden=!text}}}
    async function paint(){
      const draft=await read(key);if(!current())return;clear();
      if(draft?.profileId&&draft.profileId!==profileId){slot.innerHTML='<p role="alert">These images belong to a different signed-in account. Sign back in to that account to continue.</p>';return;}
      if(draft?.phase==='complete'){slot.innerHTML='<p class="hint">These images are on your saved run. <a href="/?run='+encodeURIComponent(draft.runId)+'">Open the run</a> to change them.</p>';return;}
      const items=draft?.items||[],locked=!!draft?.runId;
      slot.innerHTML=`<section class="post-photo-draft" aria-labelledby="post-photo-title"><h3 id="post-photo-title">Images <span>Optional</span></h3><p class="hint">One personal photo, with screenshots or results alongside it. Choose each image yourself. Images stay on this device until you save.</p><div class="post-photo-grid"></div>${locked?'<p class="hint">This save has started. Your selected images are kept for retry. You can change them on the saved run.</p>':`<div class="post-photo-pickers"><label class="act">${items.some(item=>item.role==='personal')?'Personal photo selected':'Choose a personal photo'}<input data-draft-personal type="file" accept="image/jpeg,image/png,image/webp" ${items.some(item=>item.role==='personal')||items.length>=6?'disabled':''}></label><label class="act">Add a screenshot or result<input data-draft-support type="file" accept="image/jpeg,image/png,image/webp" ${items.length>=6?'disabled':''}></label></div><p class="hint">Up to six images total. The full image is kept, resized for the web.</p>`}<p data-draft-message role="status" hidden></p></section>`;
      const grid=slot.querySelector('.post-photo-grid');
      for(const item of items){const url=URL.createObjectURL(item.blob);urls.push(url);const figure=document.createElement('figure');figure.innerHTML=`<img src="${url}" alt="${escape(roles[item.role])} selected for this run"><figcaption>${escape(roles[item.role])}</figcaption>${item.role==='personal'?'':`<label>Image role<select data-draft-role="${item.id}" ${locked?'disabled':''}>${Object.entries(roles).filter(([role])=>role!=='personal').map(([role,label])=>`<option value="${role}" ${role===item.role?'selected':''}>${label}</option>`).join('')}</select></label>`}<label class="post-photo-cover"><input type="checkbox" data-draft-cover="${item.id}" ${item.cover?'checked':''} ${locked?'disabled':''}> Use as main image</label>${item.role==='personal'?'<p class="hint">Select as the main image to show this personal photo on your post.</p>':''}${locked?'':`<button type="button" class="act" data-draft-remove="${item.id}">Remove</button>`}`;grid.append(figure);}
      async function alter(fn){try{await enqueue(key,()=>change(key,d=>{bound(d,profileId);editable(d);fn(d);return d}));}catch(error){await paint();message(error.message)}}
      for(const [selector,role] of [['[data-draft-personal]','personal'],['[data-draft-support]','result']]){
        const input=slot.querySelector(selector);if(!input)continue;input.onchange=()=>{const file=input.files?.[0];if(!file)return;message('Preparing the image on this device…');enqueue(key,async()=>{const image=await imageBlob(file);await change(key,d=>{bound(d,profileId);editable(d);if(d.items.length>=6)throw new Error('Six images selected. Remove one before choosing another.');if(role==='personal'&&d.items.some(i=>i.role==='personal'))throw new Error('Only one personal photo can be selected. Remove it before choosing another.');if(d.items.some(i=>i.contentKey===image.contentKey))throw new Error('This image is already selected.');if(profileId)d.profileId=profileId;d.items.push({id:crypto.randomUUID(),role,cover:false,...image});return d;});}).catch(error=>message(error.message));};
      }
      slot.querySelectorAll('[data-draft-remove]').forEach(button=>button.onclick=()=>alter(d=>{d.items=d.items.filter(i=>i.id!==button.dataset.draftRemove)}));
      slot.querySelectorAll('[data-draft-cover]').forEach(input=>input.onchange=()=>{const checked=input.checked;alter(d=>{d.items.forEach(i=>{i.cover=i.id===input.dataset.draftCover&&checked})})});
      slot.querySelectorAll('[data-draft-role]').forEach(select=>select.onchange=()=>{const role=select.value;alter(d=>{if(['before','after'].includes(role)&&d.items.some(i=>i.id!==select.dataset.draftRole&&i.role===role))throw new Error('Choose only one '+role+' image.');d.items.find(i=>i.id===select.dataset.draftRole).role=role})});
    }
    const repaint=()=>paint().catch(error=>message(error.message));listeners.set(key,repaint);
    const observer=new MutationObserver(()=>{if(!slot.isConnected)dispose()});observer.observe(document.documentElement,{childList:true,subtree:true});
    function dispose(){active=false;clear();if(listeners.get(key)===repaint)listeners.delete(key);observer.disconnect();}
    try{await paint()}catch(error){slot.textContent=error.message;}
    return dispose;
  }
  async function save({token,profileId,client,buildRow,audience='private',isCurrent=()=>true,onProgress=()=>{}}){
    const key=await keyFor(token);await work.get(key);let draft=await read(key);
    if(!draft||(!draft.items.length&&!draft.runId)||draft.phase==='complete')return null;
    bound(draft,profileId);
    const assertCurrent=()=>{if(!isCurrent())throw new Error('The account or page changed. Return to this draft with the same account to continue.');};
    let authUserId;
    async function session(){assertCurrent();const result=await client.auth.getSession();assertCurrent();const s=result?.data?.session;if(result?.error||!s?.access_token||!s?.user?.id)throw new Error('Sign in again to save these images. Your draft stays on this device.');if(authUserId&&s.user.id!==authUserId)throw new Error('The signed-in account changed. Return to the original account to continue.');authUserId=s.user.id;return s;}
    await session();
    draft=await change(key,d=>{bound(d,profileId);if(d.authUserId&&d.authUserId!==authUserId)throw new Error('These images belong to a different signed-in account.');d.profileId=profileId;d.authUserId=authUserId;if(!d.runId)d.runId=crypto.randomUUID();d.phase=d.phase==='audience_pending'?'audience_pending':'saving';return d;});
    const runId=draft.runId;
    async function queryRun(id){await session();const {data,error}=await client.from('runs').select('id,visibility').eq('id',id).eq('profile_id',profileId).maybeSingle();assertCurrent();if(error)throw error;return data;}
    async function request(method,body){const s=await session();const response=await fetch('/api/run-photos',{method,headers:{Authorization:'Bearer '+s.access_token,'Content-Type':'application/json'},body:JSON.stringify(body)});assertCurrent();let result;try{result=await response.json()}catch(_){throw new Error('The image response could not be read. Retry to check the saved image.');}if(!response.ok)throw new Error(result?.error||'The image could not be saved.');return result;}
    async function finish(visibility){await change(key,d=>{d.phase='complete';d.items=[];d.savedAudience=visibility;return d});root.StriveRunPhotos?.forget?.();return {runId,visibility};}
    try{
      onProgress('Saving the run privately…');let existing=await queryRun(runId);
      if(!existing){
        const row=buildRow();if(!row.measurement_revision||row.trace_basis==='typed-by-author')throw new Error('Choose a recorded session with a capture reference before adding images.');
        const {data:prior,error:lookupError}=await client.from('runs').select('id,visibility').eq('profile_id',profileId).eq('measurement_revision',row.measurement_revision).limit(1);assertCurrent();if(lookupError)throw lookupError;
        if(prior?.length&&prior[0].id!==runId){const error=new Error('This session is already saved. Open that run to add images; these selected images are still on this device.');error.existingRunId=prior[0].id;throw error;}
        await session();const {error}=await client.from('runs').insert({...row,id:runId,profile_id:profileId,visibility:'private'}).select('id').single();assertCurrent();if(error)throw error;existing={id:runId,visibility:'private'};
      }
      if(existing.visibility!=='private'){
        if(draft.phase==='audience_pending'&&existing.visibility===draft.requestedAudience&&draft.items.every(i=>i.ready))return await finish(existing.visibility);
        throw new Error('The saved run is no longer private. Open it to manage these images; this draft will not change its audience.');
      }
      for(let at=0;at<draft.items.length;at++){
        let item=draft.items[at];onProgress('Saving image '+(at+1)+' of '+draft.items.length+'…');
        if(!item.photoId){const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('The selected image could not be read.'));reader.readAsDataURL(item.blob)});const result=await request('POST',{run_id:runId,image_base64:base64});if(!result.photo?.id)throw new Error('The image save was not confirmed. Retry to check it.');draft=await change(key,d=>{d.items.find(i=>i.id===item.id).photoId=result.photo.id;return d});item=draft.items[at];}
        await request('PATCH',{run_id:runId,photo_id:item.photoId,role:item.role});
        draft=await change(key,d=>{d.items.find(i=>i.id===item.id).ready=true;return d});
      }
      const cover=draft.items.find(item=>item.cover);if(cover){onProgress('Saving your main image choice…');await request('PATCH',{run_id:runId,photo_id:cover.photoId});}
      assertCurrent();
      if(audience!=='private'){
        if(!['close_friends','link','public'].includes(audience))throw new Error('Choose a supported audience.');
        draft=await change(key,d=>{d.phase='audience_pending';d.requestedAudience=audience;return d});
        await session();onProgress('Saving the audience you chose…');const {error}=await client.from('runs').update({visibility:audience}).eq('id',runId).eq('profile_id',profileId).eq('visibility','private');assertCurrent();if(error)throw error;
        const confirmed=await queryRun(runId);if(!confirmed||confirmed.visibility!==audience)throw new Error('The audience change was not confirmed. Retry to check this run.');
      }
      return await finish(audience);
    }catch(error){error.draftRunId=runId;error.message=String(error.message||error);throw error;}
  }
  const savingButtons=new WeakSet();
  async function saveIfDraft(options){
    const {button,recover,status=()=>{},onSaved=()=>{},isCurrent=()=>true}=options;
    if(savingButtons.has(button))return true;
    savingButtons.add(button);let active=false;const label=button.textContent;
    try{
      if(!await hasDraft(options.token))return !isCurrent();
      if(!isCurrent())return true;
      active=true;button.disabled=true;button.setAttribute('aria-busy','true');recover.hidden=true;
      const result=await save({...options,onProgress:text=>{if(isCurrent())button.textContent=text;}});
      if(result&&isCurrent()){
        try{await onSaved(result)}catch(_){
          status('Your run and images were saved. Open the run to continue.',true);
          if(recover.isConnected){recover.innerHTML='<p>Run and images saved. <a href="/?run='+encodeURIComponent(result.runId)+'">Open the run</a>.</p>';recover.hidden=false;}
        }
      }
      return true;
    }catch(error){
      if(isCurrent()){
        const runId=error.existingRunId||error.draftRunId;
        recover.innerHTML='<div class="card" role="alert"><p><b>Save needs attention.</b> '+escape(error.message)+'</p><p>Your selected images are kept on this device. Retry checks the same run and images before saving. An incomplete image save never changes the run’s audience.</p><div class="cta"><button type="button" data-photo-retry>Check and try again</button>'+(runId?'<a class="act" href="/?run='+encodeURIComponent(runId)+'">Check this run</a>':'')+'</div></div>';
        recover.hidden=false;recover.querySelector('[data-photo-retry]').onclick=()=>button.click();status('Save needs attention. Your image draft is kept on this device.',true);
      }
      return true;
    }finally{savingButtons.delete(button);if(active){button.disabled=false;button.removeAttribute('aria-busy');if(button.isConnected)button.textContent=label;}}
  }
  root.StrivePhotoDraft={mount,hasDraft,save,saveIfDraft};
})(typeof window==='object'?window:globalThis);
