(function(root){
  "use strict";
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const roles={photo:'Photo',result:'Result',before:'Before',after:'After',personal:'Personal photo'};
  // Local editorial preview for one already-public run. These are public project images,
  // captured 10 Oct 2026 from https://world-relay.vercel.app/.
  // They are context for the project, not evidence that the recorded session made them.
  const showcase={
    '599095f1-3b49-4c0e-b50c-13afd4ae369e':[
      {src:'/media/favour-public-page-20261010.webp',width:1024,height:1156,label:'Public FAVOUR page · 10 Oct',url:'https://world-relay.vercel.app/',alt:'Public FAVOUR campaign page'},
      {src:'/media/favour-campaign-builder-20261010.webp',width:464,height:615,label:'FAVOUR campaign builder · 10 Oct',url:'https://world-relay.vercel.app/',alt:'Public FAVOUR campaign builder section'}
    ]
  };
  const disposers=new Set(),coverGeneration=new WeakMap();
  function disposeAll(){for(const dispose of [...disposers])dispose();}
  async function token(client){
    const result=await client?.auth?.getSession?.();
    return result?.data?.session?.access_token||null;
  }
  async function headers(client,json=false){
    const t=await token(client), h={};
    if(t) h.Authorization=`Bearer ${t}`;
    if(json) h["Content-Type"]="application/json";
    return h;
  }
  async function responseMessage(res){
    try{const body=await res.json();return body?.error||body?.message||`Request failed (${res.status})`;}catch(_){return `Request failed (${res.status})`;}
  }
  // One way to read photos. Every read goes to the server, which checks access under the reader's own
  // sign-in each time. Nothing is ever shown from memory without that check: a picture the owner
  // removed, or a run the reader lost, answers 404 and the copy held here is dropped.
  // What this saves is bytes and repeats. A picture already held is asked for with its ETag, and the
  // server answers 304 with no body after the same access check. Two parts of one page that ask for
  // the same thing at the same moment share one request. A list is never kept.
  // The key holds the Authorization value, so another account in the same tab starts empty.
  const kept=new Map(),flying=new Map(),KEEP=60;
  function forget(){kept.clear()}
  function get(url,opts={},width){
    const image=/[?&]id=/.test(url),full=image&&width?`${url}&w=${width}`:url,key=`${opts.headers?.Authorization||''} ${full}`;
    if(flying.has(key))return flying.get(key);
    const job=(async()=>{
      const hit=image?kept.get(key):null,headers={...(opts.headers||{}),...(hit?{'If-None-Match':hit.etag}:{})};
      // A shared read outlives any one subscriber. Each subscriber checks its own active flag.
      const {signal,...sharedOptions}=opts;
      const res=await fetch(full,{...sharedOptions,headers});
      if(hit&&res.status===304){kept.delete(key);kept.set(key,hit);return {ok:true,status:200,revalidated:true,blob:async()=>hit.body}}
      if(!res.ok){kept.delete(key);return res}
      if(!image){const body=await res.json();return {ok:true,status:200,json:async()=>body}}
      const body=await res.blob(),etag=res.headers?.get?.('ETag');
      if(etag){kept.set(key,{etag,body});while(kept.size>KEEP)kept.delete(kept.keys().next().value)}
      return {ok:true,status:200,blob:async()=>body};
    })().finally(()=>flying.delete(key));
    flying.set(key,job);return job;
  }
  // Which picture leads a run's card. Only one the author chose: the selected cover, or the one
  // marked Result when the layout asks for it. With a single picture on the run there is nothing to
  // guess. Otherwise no picture: the first upload is never assumed to be the right one.
  function lead(photos,mode){
    photos=photos.filter(p=>p.is_selected!==false);
    const shown=photos.filter(p=>p.role!=='personal'||p.personal_public_selected===true),cover=shown.find(p=>p.is_cover),result=shown.find(p=>p.role==='result');
    return (mode==='result'?result||cover:cover)||(shown.length===1?shown[0]:null);
  }
  // A feed card can show the selected cover and the work beside it. Keep at most one
  // personal picture, and never turn the other personal uploads into a public gallery.
  function cardPhotos(photos,mode,projectFirst=false){
    photos=photos.filter(p=>p.is_selected!==false);
    if(photos.length&&photos.every(p=>Number.isInteger(p.sort_position)))return photos.filter(p=>p.role!=='personal'||p.personal_public_selected===true).sort((a,b)=>a.sort_position-b.sort_position).slice(0,6);
    if(projectFirst){
      const work=photos.filter(p=>p.role!=='personal');
      const result=work.find(p=>p.role==='result');
      const personal=photos.find(p=>p.role==='personal'&&p.personal_public_selected===true);
      return [...(result?[result]:[]),...work.filter(p=>p!==result),...(personal?[personal]:[])].slice(0,6);
    }
    const before=photos.find(p=>p.role==='before'),after=photos.find(p=>p.role==='after');
    const pair=mode==='before_after'&&before&&after?[before,after]:[];
    const first=pair.length?null:lead(photos,mode);
    const chosen=[...pair,...(first?[first]:[])];
    const work=photos.filter(p=>p.role!=='personal'&&!chosen.some(item=>item.id===p.id));
    return [...chosen,...work].slice(0,6);
  }
  function photoPath(photo){
    if(typeof photo?.url!=="string")return null;
    try{
      const parsed=new URL(photo.url,location.origin);
      if(parsed.origin!==location.origin||parsed.pathname!=="/api/run-photos"||!parsed.searchParams.get("id")||!parsed.searchParams.get("run_id"))return null;
      return parsed.pathname+parsed.search;
    }catch(_){return null;}
  }
  // Anonymous public images use a stable URL: the browser can lazy-load and revalidate
  // bytes itself. The endpoint still checks run visibility before every 200 or 304.
  // Authenticated/private reads retain their bearer-token path and account-scoped cache.
  function publicImage(path,host,requestHeaders,gallery=false){
    const card=host.closest?.('[data-run-visibility]');
    if(requestHeaders.Authorization||card?.dataset.runVisibility!=='public')return null;
    const box=host.getBoundingClientRect?.().width||card.getBoundingClientRect?.().width||480;
    const width=gallery?Math.min(Math.max(1,box-40)*.48,360):box;
    const wanted=width*(root.devicePixelRatio||1),variant=[320,480,960].find(w=>w>=wanted)||960;
    const url=new URL(path,location.origin);url.searchParams.set('w',variant);return url.pathname+url.search;
  }
  function cropper(file,host,onReady){
    const url=URL.createObjectURL(file), image=new Image(), state={mode:'original',zoom:1,x:.5,y:.5,ready:false};
    host.innerHTML='<div class="photo-crop"><label>Shape<select data-photo-shape><option value="original">Original</option><option value="square">Square</option><option value="wide">Wide</option></select></label><p class="hint">Original keeps the full photo. Choose Square or Wide to crop it.</p><canvas width="1" height="1" aria-label="Photo preview"></canvas><label>Zoom<input data-photo-zoom type="range" min="1" max="3" value="1" step="0.05"></label><div class="photo-position"><label>Left / right<input data-photo-x type="range" min="0" max="1" value="0.5" step="0.01"></label><label>Up / down<input data-photo-y type="range" min="0" max="1" value="0.5" step="0.01"></label></div><button type="button" data-photo-upload disabled>Add photo</button><button type="button" class="ghost" data-photo-cancel>Cancel</button></div>';
    const canvas=host.querySelector('canvas'), ctx=canvas.getContext('2d');
    const size=()=>{if(state.mode==='square')return [1200,1200];if(state.mode==='wide')return [1600,900];const scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));return [Math.max(1,Math.round(image.naturalWidth*scale)),Math.max(1,Math.round(image.naturalHeight*scale))]};
    const paint=()=>{if(!image.naturalWidth)return;const base=Math.max(canvas.width/image.naturalWidth,canvas.height/image.naturalHeight),scale=base*state.zoom,w=image.naturalWidth*scale,h=image.naturalHeight*scale,maxX=Math.max(0,w-canvas.width),maxY=Math.max(0,h-canvas.height);ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,-maxX*state.x,-maxY*state.y,w,h)};
    const resize=()=>{const [width,height]=size();canvas.width=width;canvas.height=height;paint()};
    let disposed=false;
    const dispose=()=>{disposed=true;image.onload=null;image.onerror=null;URL.revokeObjectURL(url);host.innerHTML=''};
    image.onload=()=>{if(disposed)return;state.ready=true;resize();host.querySelector('[data-photo-upload]').disabled=false;URL.revokeObjectURL(url)};image.onerror=()=>{URL.revokeObjectURL(url);host.textContent='This image could not be opened.'};image.src=url;
    host.querySelector('[data-photo-shape]').onchange=e=>{state.mode=e.target.value;state.zoom=1;host.querySelector('[data-photo-zoom]').value='1';resize()};
    for(const [name,key] of [['zoom','zoom'],['x','x'],['y','y']])host.querySelector(`[data-photo-${name}]`).oninput=e=>{state[key]=Number(e.target.value);paint()};
    host.querySelector('[data-photo-cancel]').onclick=dispose;
    host.querySelector('[data-photo-upload]').onclick=async()=>{
      const button=host.querySelector('[data-photo-upload]');
      button.disabled=true;
      try{
        if(disposed||!state.ready)return;
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.84));
        if(blob&&!disposed)await onReady(blob);
      }finally{if(button.isConnected)button.disabled=false;}
    };
    return dispose;
  }
  async function openImage({path,client,label='Run image',gallery=[],initialId=null}){
    const dialog=document.createElement('dialog');dialog.className='run-image-lightbox';
    dialog.innerHTML='<header><button type="button" data-image-prev aria-label="Previous image">←</button><span data-image-count></span><button type="button" data-image-next aria-label="Next image">→</button><button type="button" data-image-close aria-label="Close image">Close ×</button></header><div data-image-body><p>Loading image…</p></div>';document.body.append(dialog);dialog.showModal();
    let url=null,closed=false,generation=0,index=Math.max(0,gallery.findIndex(p=>initialId?p.id===initialId:photoPath(p)===path));
    const close=()=>{closed=true;generation++;if(url)URL.revokeObjectURL(url);dialog.remove();disposers.delete(close)};disposers.add(close);dialog.addEventListener('close',close,{once:true});dialog.querySelector('[data-image-close]').onclick=()=>dialog.close();dialog.onclick=e=>{if(e.target===dialog)dialog.close()};
    const show=async()=>{const turn=++generation;if(url){URL.revokeObjectURL(url);url=null}const item=gallery[index],target=item?photoPath(item):path,body=dialog.querySelector('[data-image-body]');body.innerHTML='<p>Loading image…</p>';dialog.querySelector('[data-image-count]').textContent=gallery.length>1?(index+1)+' / '+gallery.length:'';dialog.querySelector('[data-image-prev]').hidden=gallery.length<2;dialog.querySelector('[data-image-next]').hidden=gallery.length<2;
      try{const res=item?.draftBlob?{ok:true,blob:async()=>item.draftBlob}:await get(target,{headers:await headers(client)});if(closed||turn!==generation)return;if(!res.ok)throw Error('unavailable');const blob=await res.blob();if(closed||turn!==generation)return;url=URL.createObjectURL(blob);const image=document.createElement('img');image.src=url;image.alt=item?(roles[item.role]||'Run image'):label;body.replaceChildren(image);}catch(_){if(!closed&&turn===generation)body.textContent='This image is no longer available to this reader.';}
    };
    const move=step=>{index=(index+step+gallery.length)%gallery.length;void show()};dialog.querySelector('[data-image-prev]').onclick=()=>move(-1);dialog.querySelector('[data-image-next]').onclick=()=>move(1);dialog.onkeydown=e=>{if(gallery.length>1&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();move(e.key==='ArrowLeft'?-1:1)}};await show();
  }
  async function mount({client,run,slot,owner,status,isCurrent=()=>true,onChanged=()=>{},staged=false}){
    if(!slot||!run?.id)return;
    let active=true,cropDispose=null,placeholderDispose=null,draftPhotos=null,originalPhotos=[];
    const controller=new AbortController(),objectUrls=[],imageBlobs=new Map();
    const current=()=>active&&isCurrent()&&slot.isConnected!==false;
    const dispose=()=>{active=false;controller.abort();cropDispose?.();placeholderDispose?.();clearUrls();imageBlobs.clear();slot.innerHTML='';disposers.delete(dispose)};
    disposers.add(dispose);
    const request=async(path,json=false,options={})=>{
      const h=await headers(client,json);
      if(!current())return null;
      if(options.method&&options.method!=='GET')forget();   // an upload, a cover change or a removal: read fresh after it
      return fetch(path,{...options,headers:h,signal:controller.signal});
    };
    const clearUrls=()=>{while(objectUrls.length)URL.revokeObjectURL(objectUrls.pop())};
    async function load(){
      if(!current())return;
      cropDispose?.();cropDispose=null;placeholderDispose?.();placeholderDispose=null;clearUrls();slot.innerHTML='<p class="hint">Loading photos…</p>';
      let res;
      if(staged&&draftPhotos)res={ok:true,json:async()=>({photos:draftPhotos})};
      else try{res=await request(`/api/run-photos?run_id=${encodeURIComponent(run.id)}`);}catch(_){if(current())slot.innerHTML='<p class="hint">Photos could not load.</p>';return;}
      if(!current()||!res)return;
      if(!res.ok){const message=await responseMessage(res);if(current())slot.innerHTML=`<p class="hint">${esc(message)}</p>`;return;}
      const body=await res.json();if(!current())return;const photos=Array.isArray(body)?body:(body.photos||[]);if(staged&&!draftPhotos){originalPhotos=photos.map(p=>({...p}));draftPhotos=photos.map(p=>({...p}));}if(owner&&photos.every(p=>Number.isInteger(p.sort_position))){const first=[...photos].sort((a,b)=>a.sort_position-b.sort_position)[0]?.id;photos.forEach(p=>p.is_cover=p.id===first);}
      const selectedPersonal=photos.find(p=>p.role==='personal'&&p.personal_public_selected===true);
      // Readers see the chosen candid photo only. Owners retain every saved image for reselection.
      const projectFirst=run.photo_layout==='result'&&run.capture_metadata?.estimates?.v===1;
      const displayed=owner?[...photos].sort((a,b)=>(a.sort_position??100)-(b.sort_position??100)||Number(b.is_cover)-Number(a.is_cover)):projectFirst?cardPhotos(photos,'result',true):photos.filter(p=>p.is_selected!==false&&(p.role!=='personal'||p.id===selectedPersonal?.id));
      if(!owner&&!displayed.length){slot.innerHTML=root.StrivePlaceholders?`<div class="run-detail-story">${root.StrivePlaceholders.render('image',{story:run.caption||run.title,harness:run.harness,model:run.model||(run.capture_metadata?.models||[]).join(', '),seed:run.id,width:640,height:280})}</div>`:'';placeholderDispose=root.StrivePlaceholders?.fit?.(slot);return;}
      const canAdd=owner&&photos.length<6;
      slot.innerHTML=`<section class="run-photos" aria-labelledby="run-photos-title"><div class="head"><h2 id="run-photos-title">Images from this run</h2><span class="meta">${owner?photos.length+' of 6':displayed.length+' image'+(displayed.length===1?'':'s')}</span></div>${owner&&photos.length?'<p class="hint photo-lead-hint" id="photo-lead-hint">Choose the lead image below. Save keeps your choice; sharing stays unchanged.</p>':''}<div class="run-photo-grid"${owner?' role="radiogroup" aria-label="Lead image"':''}></div>${canAdd?'<label class="photo-add"><span aria-hidden="true">＋</span> Add an image<input data-photo-file type="file" accept="image/jpeg,image/png,image/webp"></label><p class="hint">Add a photo of where you worked. Move images with the arrows or drag them; the first is the lead image. × hides it; ↶ brings it back. Save keeps your changes.</p><div data-photo-editor></div>':owner?'<p class="hint">Six photos added. Remove one before adding another.</p>':''}</section>`;
      const grid=slot.querySelector('.run-photo-grid');grid.dataset.photoCount=displayed.length;if(!owner)grid.classList.add('run-photo-grid--reader');
      for(const photo of displayed){
        try{const path=photoPath(photo);if(!path&&!photo.draftBlob)continue;const cached=photo.draftBlob||imageBlobs.get(path);const imageRes=cached?{ok:true,blob:async()=>cached}:await get(path,{headers:await headers(client),signal:controller.signal},480);if(!current())return;if(!imageRes?.ok)continue;const blob=await imageRes.blob();if(!current())return;if(path)imageBlobs.set(path,blob);const url=URL.createObjectURL(blob);objectUrls.push(url);const item=document.createElement('figure');item.classList.toggle('photo-hidden',photo.is_selected===false);if(owner){item.draggable=true;item.dataset.photoId=photo.id;}item.innerHTML=owner?`<button type="button" class="photo-thumb-cover" data-photo-cover="${esc(photo.id)}" role="radio" aria-label="${esc(roles[photo.role]||'Photo')} ${displayed.indexOf(photo)+1}: lead image" aria-checked="${!!photo.is_cover}" tabindex="${photo.is_cover?0:-1}"><img src="${url}" alt="${esc(roles[photo.role]||'Photo')}" loading="lazy"><span class="photo-lead-indicator" aria-hidden="true">${photo.is_cover?'●':'○'}</span><span class="photo-lead-label">${photo.is_cover?'Lead image':'Use as lead'}${photo.is_selected===false?' · Hidden':photo.role==='personal'&&!photo.personal_public_selected?' · Private':''}</span></button><button type="button" class="photo-hide" data-photo-selected="${esc(photo.id)}" aria-pressed="${photo.is_selected!==false}" aria-label="${photo.is_selected===false?'Show image':'Hide image'}">${photo.is_selected===false?'↶':'×'}</button><button type="button" class="photo-personal" data-photo-personal="${esc(photo.id)}" aria-pressed="${photo.role==='personal'}">${photo.role==='personal'?'Personal ✓':'Mark personal'}</button>${photo.role==='personal'?`<button type="button" class="photo-public" data-photo-public="${esc(photo.id)}" aria-pressed="${photo.personal_public_selected===true}">Show this photo publicly${photo.personal_public_selected===true?' ✓':''}</button><small class="photo-consent-note">Off keeps this photo private. On shares it with the run’s readers. Moving it does not change sharing.</small>`:''}<div class="photo-move"><button type="button" data-photo-move="${esc(photo.id)}" data-direction="-1" aria-label="Move image earlier" ${displayed.indexOf(photo)===0?'disabled':''}>←</button><button type="button" data-photo-move="${esc(photo.id)}" data-direction="1" aria-label="Move image later" ${displayed.indexOf(photo)===displayed.length-1?'disabled':''}>→</button></div><details class="photo-advanced"><summary>Advanced</summary><button type="button" class="ghost" data-photo-inspect="${esc(photo.id)}">Open full image</button><div class="photo-role-controls" role="group" aria-label="Image role">${Object.entries(roles).map(([key,label])=>`<button type="button" class="ghost" data-photo-role="${esc(photo.id)}" data-role="${key}" aria-pressed="${key===(photo.role||'photo')}">${label}</button>`).join('')}</div><button type="button" class="ghost" data-photo-delete="${esc(path||photo.id)}">Delete image</button></details>`:`<img src="${url}" alt="${esc(roles[photo.role]||'Photo')}" loading="lazy"><figcaption>${esc(roles[photo.role]||'Photo')}</figcaption>`;if(owner)item.querySelectorAll('button:not([disabled])').forEach(button=>{button.disabled=true;button.dataset.photoLoading='1'});if(!owner){
          const image=item.querySelector('img'),button=document.createElement('button');button.type='button';button.className='photo-open ghost';button.setAttribute('aria-label','Open '+(roles[photo.role]||'image')+' at full size');button.append(image);const hint=document.createElement('span');hint.textContent='Open full image';button.append(hint);button.onclick=()=>void openImage({path,client,label:roles[photo.role]||'Run image',gallery:displayed});item.prepend(button);
        }grid.append(item);}catch(_){}
      }
      if(!current())return;
      if(canAdd){
        slot.querySelector('[data-photo-file]').onchange=e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>12*1024*1024){status('Choose an image smaller than 12 MB.',true);return;}cropDispose=cropper(file,slot.querySelector('[data-photo-editor]'),async blob=>{try{if(!current())return;if(blob.size>3*1024*1024){status('The cropped image is still larger than 3 MB.',true);return;}if(staged){draftPhotos.push({id:'draft-'+Date.now(),role:'photo',is_cover:false,draftBlob:blob});status('Image added to your edit. Save changes to keep it.');await load();return;}const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob)});const upload=await request('/api/run-photos',true,{method:'POST',body:JSON.stringify({run_id:run.id,image_base64:base64})});if(!current()||!upload)return;if(!upload.ok){const message=await responseMessage(upload);if(current())status(message,true);return;}const saved=await upload.json();if(!current())return;status(saved.duplicate?'This photo is already on this run. Choose Use as cover if you want it first.':'Photo added.');await load();await onChanged();}catch(_){if(current())status('Photo upload could not reach STRIVE. Try again.',true);}});};
      }
      if(owner)slot.querySelectorAll('[data-photo-inspect]').forEach(button=>button.onclick=()=>{const photo=photos.find(p=>p.id===button.dataset.photoInspect);if(photo)void openImage({path:photoPath(photo),initialId:photo.id,client,label:roles[photo.role]||'Run image',gallery:photos})});
      if(owner)slot.querySelectorAll('[data-photo-selected]').forEach(button=>button.onclick=async()=>{
        const selected=button.getAttribute('aria-pressed')!=='true';button.disabled=true;
        try{if(staged){draftPhotos.find(p=>p.id===button.dataset.photoSelected).is_selected=selected;await load();return;}
          const res=await request('/api/run-photos',true,{method:'PATCH',body:JSON.stringify({run_id:run.id,photo_id:button.dataset.photoSelected,is_selected:selected})});
          if(!current()||!res)return;if(!res.ok){status(await responseMessage(res),true);await load();return;}status(selected?'Image shown with the run.':'Image hidden from readers. The saved image is kept.');await load();await onChanged();
        }catch(_){if(current())status('Image selection could not be saved. Reload and try again.',true);}finally{if(button.isConnected)button.disabled=false;}
      });
      if(owner)slot.querySelectorAll('[data-photo-personal]').forEach(button=>button.onclick=async()=>{
        const photo=photos.find(p=>p.id===button.dataset.photoPersonal),role=photo.role==='personal'?(photo.previousProjectRole||'photo'):'personal';
        if(staged){const draft=draftPhotos.find(p=>p.id===photo.id);if(draft.role!=='personal')draft.previousProjectRole=draft.role;draft.role=role;if(role!=='personal')draft.personal_public_selected=false;await load();return;}
        const target=[...slot.querySelectorAll('[data-photo-role]')].find(b=>b.dataset.photoRole===photo.id&&b.dataset.role===role);if(target)await target.onclick();
      });
      if(owner)slot.querySelectorAll('[data-photo-role]').forEach(select=>select.onclick=async()=>{if(select.getAttribute('aria-pressed')==='true')return;select.disabled=true;try{if(staged){const draft=draftPhotos.find(p=>p.id===select.dataset.photoRole);draft.role=select.dataset.role;if(draft.role!=='personal')draft.personal_public_selected=false;await load();return;}const res=await request('/api/run-photos',true,{method:'PATCH',body:JSON.stringify({run_id:run.id,photo_id:select.dataset.photoRole,role:select.dataset.role})});if(!current()||!res)return;if(!res.ok){status(await responseMessage(res),true);await load();return;}status('Image role saved.');await load();await onChanged();}catch(_){if(current())status('Image role could not be saved. Reload and try again.',true);}finally{if(select.isConnected)select.disabled=false;}});
      async function reorder(ids){
        if(staged){draftPhotos=ids.map((id,index)=>({...draftPhotos.find(p=>p.id===id),sort_position:index,is_cover:index===0}));await load();return;}
        const res=await request('/api/run-photos',true,{method:'PATCH',body:JSON.stringify({run_id:run.id,photo_order:ids})});if(!res?.ok){status(await responseMessage(res),true);return;}await load();await onChanged();
      }
      if(owner){
        slot.querySelectorAll('[data-photo-move]').forEach(button=>button.onclick=async()=>{const ids=displayed.map(p=>p.id),i=ids.indexOf(button.dataset.photoMove),j=i+Number(button.dataset.direction);if(j<0||j>=ids.length)return;[ids[i],ids[j]]=[ids[j],ids[i]];await reorder(ids);});
        let dragging=null;slot.querySelectorAll('[data-photo-id]').forEach(item=>{item.ondragstart=e=>{dragging=item.dataset.photoId;e.dataTransfer?.setData('text/plain',dragging)};item.ondragover=e=>e.preventDefault();item.ondrop=async e=>{e.preventDefault();if(!dragging||dragging===item.dataset.photoId)return;const ids=displayed.map(p=>p.id).filter(id=>id!==dragging);ids.splice(ids.indexOf(item.dataset.photoId),0,dragging);dragging=null;await reorder(ids);};});
        slot.querySelectorAll('[data-photo-public]').forEach(button=>button.onclick=async()=>{const photo=photos.find(p=>p.id===button.dataset.photoPublic),selected=photo.personal_public_selected!==true;if(staged){if(selected)draftPhotos.forEach(p=>p.personal_public_selected=false);draftPhotos.find(p=>p.id===photo.id).personal_public_selected=selected;await load();return;}const res=await request('/api/run-photos',true,{method:'PATCH',body:JSON.stringify({run_id:run.id,photo_id:photo.id,personal_public_selected:selected})});if(!res?.ok){status(await responseMessage(res),true);return;}await load();await onChanged();});
      }
      if(owner)slot.querySelectorAll('[data-photo-cover]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{if(staged){await reorder([button.dataset.photoCover,...displayed.map(p=>p.id).filter(id=>id!==button.dataset.photoCover)]);return;}const res=await request('/api/run-photos',true,{method:'PATCH',body:JSON.stringify({run_id:run.id,photo_id:button.dataset.photoCover})});if(!current()||!res)return;if(!res.ok){status(await responseMessage(res),true);return;}status('Cover selected. Your other photos stay in the gallery.');await load();await onChanged();}catch(_){if(current())status('Cover could not be saved. Try again.',true);}finally{if(button.isConnected)button.disabled=false;}});
      if(owner)slot.querySelectorAll('[data-photo-cover]').forEach(button=>button.onkeydown=async event=>{
        if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
        event.preventDefault();const choices=[...slot.querySelectorAll('[data-photo-cover]')],at=choices.indexOf(button),next=event.key==='Home'?0:event.key==='End'?choices.length-1:(at+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)+choices.length)%choices.length,id=choices[next].dataset.photoCover;
        await choices[next].onclick();[...slot.querySelectorAll('[data-photo-cover]')].find(b=>b.dataset.photoCover===id)?.focus();
      });
      if(owner)slot.querySelectorAll('[data-photo-delete]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{if(staged){draftPhotos=draftPhotos.filter(p=>(photoPath(p)||p.id)!==button.dataset.photoDelete);await load();return;}const res=await request(button.dataset.photoDelete,false,{method:'DELETE'});if(!current()||!res)return;if(!res.ok){const message=await responseMessage(res);if(current())status(message,true);return;}status('Photo removed.');await load();await onChanged();}catch(_){if(current())status('Photo removal could not reach STRIVE. Try again.',true);}finally{if(button.isConnected)button.disabled=false;}});
      slot.querySelectorAll('[data-photo-loading]').forEach(button=>{button.disabled=false;delete button.dataset.photoLoading});
    }
    dispose.save=async()=>{
      if(!staged||!current()||!draftPhotos)return;
      let saved=0;const send=async(path,options)=>{const response=await request(path,options.method!=='DELETE',options);if(!response?.ok)throw Error(saved?'Some image changes were saved. '+await responseMessage(response):await responseMessage(response));saved++;if(!current())throw Error('The edit is no longer active. Reopen the run to check saved changes.');return response.json()};
      // Resolve edits through the existing owner-only API; audience is saved separately afterwards.
      for(const old of [...originalPhotos])if(!draftPhotos.some(p=>p.id===old.id)){await send(photoPath(old),{method:'DELETE'});originalPhotos=originalPhotos.filter(p=>p.id!==old.id);}
      for(const photo of draftPhotos){
        if(photo.draftBlob){const image_base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(photo.draftBlob)});const uploaded=await send('/api/run-photos',{method:'POST',body:JSON.stringify({run_id:run.id,image_base64})});photo.id=uploaded.photo.id;photo.url=uploaded.photo.url;delete photo.draftBlob;}
        const old=originalPhotos.find(p=>p.id===photo.id);if((photo.is_selected!==false)!==(old?.is_selected!==false))await send('/api/run-photos',{method:'PATCH',body:JSON.stringify({run_id:run.id,photo_id:photo.id,is_selected:photo.is_selected!==false})});if(!old||old.role!==photo.role)await send('/api/run-photos',{method:'PATCH',body:JSON.stringify({run_id:run.id,photo_id:photo.id,role:photo.role})});
      }
      // Consent changes are separate from order. Revoke first before granting a replacement.
      for(const photo of [...draftPhotos].sort((a,b)=>Number(a.personal_public_selected===true)-Number(b.personal_public_selected===true))){const old=originalPhotos.find(p=>p.id===photo.id);if(photo.role==='personal'&&(photo.personal_public_selected===true)!==(old?.personal_public_selected===true))await send('/api/run-photos',{method:'PATCH',body:JSON.stringify({run_id:run.id,photo_id:photo.id,personal_public_selected:photo.personal_public_selected===true})});}
      const order=[...draftPhotos].sort((a,b)=>(a.sort_position??100)-(b.sort_position??100)||Number(b.is_cover)-Number(a.is_cover)).map(p=>p.id);
      if(order.join()!==[...originalPhotos].sort((a,b)=>(a.sort_position??100)-(b.sort_position??100)||Number(b.is_cover)-Number(a.is_cover)).map(p=>p.id).join())await send('/api/run-photos',{method:'PATCH',body:JSON.stringify({run_id:run.id,photo_order:order})});
      originalPhotos=draftPhotos.map(p=>({...p}));await onChanged();
    };
    await load();
    return dispose;
  }
  async function prepareCards(runs,client){
    const h=await headers(client);
    return Promise.all(runs.map(async run=>{try{
      const res=await get(`/api/run-photos?run_id=${encodeURIComponent(run.id)}`,{headers:h});
      if(!res.ok)return run;
      const photos=(await res.json())?.photos||[];
      const count=cardPhotos(photos,run.photo_layout||'cover').length+(run.visibility==='public'?(showcase[run.id]||[]).length:0);
      return {...run,_readablePhotoCount:count};
    }catch(_){return run;}}));
  }
  async function mountCovers({client,root:host=document}){
    let active=true,stopTileFit=()=>{};const controller=new AbortController(),urls=new Set(),images=new Set();
    const dispose=()=>{active=false;controller.abort();for(const url of urls)URL.revokeObjectURL(url);urls.clear();for(const image of images)image.remove();stopTileFit();disposers.delete(dispose)};
    disposers.add(dispose);
    stopTileFit=root.StrivePlaceholders?.fit?.(host)||(()=>{});
    const cards=[...host.querySelectorAll('.activity-post[data-photo-gallery]:not([data-photo-checked]), .fc[data-run-id]:not([data-photo-checked]), .card[data-run-id]:not(.dc):not([data-photo-checked]), .history-run[data-run-id]:not([data-photo-checked])')];
    await Promise.all(cards.map(async (card,cardIndex)=>{
      card.dataset.photoChecked='true';
      const placeholder=card.querySelector('[data-photo-placeholder]');
      const generation=Symbol(),pendingUrls=new Set();coverGeneration.set(card,generation);
      const current=()=>{if(active&&card.isConnected!==false&&coverGeneration.get(card)===generation)return true;for(const url of pendingUrls){URL.revokeObjectURL(url);urls.delete(url)}pendingUrls.clear();return false;};
      try{
        const runId=card.dataset.runId;
        const visuals=card.dataset.runVisibility==='public'?showcase[runId]||[]:[];
        const listHeaders=await headers(client);if(!current())return;
        const list=await get(`/api/run-photos?run_id=${encodeURIComponent(runId)}`,{headers:listHeaders,signal:controller.signal});
        if(!current())return;if(!list.ok){if(placeholder)placeholder.innerHTML='<p class="media-read-error">Images unavailable. Open the run to try again.</p>';return;}
        const payload=await list.json(), photos=payload?.photos||[];
        const mode=card.dataset.photoLayout||'cover';
        const ordered=photos.length>0&&photos.every(p=>Number.isInteger(p.sort_position));
        const projectFirst=!ordered&&card.dataset.projectGallery!==undefined;
        if(ordered)card.querySelector('.post-visual[data-visual-run]')?.remove();
        const selected=cardPhotos(!ordered&&!projectFirst&&card.dataset.gallerySupporting!==undefined?photos.filter(p=>p.role!=='personal'):photos,mode,projectFirst);
        if(!selected.length&&!visuals.length){card.querySelector('.post-workline>.run-agent-identity')?.remove();const empty=card.querySelector('[data-photo-placeholder]');if(empty){empty.hidden=false;if(root.StrivePlaceholders)empty.innerHTML=root.StrivePlaceholders.render('screenshot',{story:card.dataset.mediaStory||'',owner:card.dataset.runOwner==='true',seed:card.dataset.mediaSeed,harness:card.dataset.mediaHarness,model:card.dataset.mediaModel});}return;}
        // Build a detached group. Attach only while the same view is active, after all reads.
        const group=document.createElement('div');group.className='run-media run-media-gallery';group.setAttribute('aria-label','Images from this run');group.tabIndex=0;
        if(projectFirst&&!selected.some(p=>p.role!=='personal')){
          const empty=document.createElement('figure');empty.className='run-project-missing';
          empty.innerHTML=root.StrivePlaceholders?.render('screenshot',{story:card.dataset.mediaStory||card.querySelector('.title,h2')?.textContent||'',owner:card.dataset.runOwner==='true',seed:card.dataset.mediaSeed,harness:card.dataset.mediaHarness,model:card.dataset.mediaModel})||'<section class="strive-empty"><h3>No project screenshot added</h3><p>The personal photo is separate from the project result.</p></section>';
          group.append(empty);
        }
        const personal=selected.find(p=>p.role==='personal');
        const visible=ordered?selected.slice(0,3):selected.length>3?(personal?[...selected.filter(p=>p!==personal).slice(0,2),personal]:selected.slice(0,3)):selected;
        for(const photo of visible){
          const path=photoPath(photo);if(!path)continue;
          const imageHeaders=await headers(client);if(!current())return;
          let url=publicImage(path,card,imageHeaders,true),objectUrl=false;
          if(!url){
            const imageRes=await get(path,{headers:imageHeaders,signal:controller.signal},960);
            if(!current()||!imageRes.ok)return;
            const blob=await imageRes.blob();if(!current())return;
            url=URL.createObjectURL(blob);objectUrl=true;urls.add(url);pendingUrls.add(url);
          }
          const figure=document.createElement('figure'),image=document.createElement('img');let lowPreview=null;
          figure.dataset.photoRole=photo.role||'photo';image.className='run-photo-cover';if(photo.width&&photo.height){image.width=photo.width;image.height=photo.height}image.decoding='async';image.alt=roles[photo.role]||'Run photo';image.loading=cardIndex===0?'eager':'lazy';image.fetchPriority=cardIndex===0?'high':'low';image.classList.add('image-reveal');image.src=url;images.add(image);if(cardIndex===0&&!objectUrl){const preload=document.createElement('link');preload.rel='preload';preload.as='image';preload.href=url;document.head.append(preload);}
          const release=()=>{if(objectUrl){URL.revokeObjectURL(url);urls.delete(url);pendingUrls.delete(url)}};
          image.onload=()=>{image.classList.add('is-loaded');lowPreview?.remove();release()};image.onerror=()=>{release();figure.replaceChildren();figure.innerHTML=root.StrivePlaceholders?.render('screenshot',{story:card.dataset.mediaStory||'',owner:card.dataset.runOwner==='true',seed:card.dataset.mediaSeed,harness:card.dataset.mediaHarness,model:card.dataset.mediaModel})||''};
          const link=document.createElement('a');link.href=(card.querySelector('.fc-body')?.getAttribute('href')||'/?run='+encodeURIComponent(runId))+'#run-photos';link.setAttribute('aria-label','Open '+(roles[photo.role]||'run image')+' at full size');link.append(image);if(!objectUrl){const tiny=new URL(url,location.origin);tiny.searchParams.set('w','64');lowPreview=document.createElement('img');lowPreview.className='run-photo-preview';lowPreview.alt='';lowPreview.loading=image.loading;lowPreview.src=tiny.pathname+tiny.search;link.append(lowPreview);}
          link.onclick=event=>{event.preventDefault();void openImage({path,client,label:roles[photo.role]||'Run image',gallery:selected})};figure.append(link);
          const caption=document.createElement('figcaption');caption.textContent=roles[photo.role]||'Photo';figure.append(caption);group.append(figure);
        }
        for(const visual of visuals){
          const figure=document.createElement('figure'),link=document.createElement('a'),image=document.createElement('img'),caption=document.createElement('figcaption');
          link.href=visual.url;link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label','Open source of '+visual.label);
          image.className='run-photo-cover';image.width=visual.width;image.height=visual.height;image.loading='lazy';image.decoding='async';image.src=visual.src;image.alt=visual.alt;
          caption.textContent=visual.label+' · project context';link.append(image);figure.append(link,caption);group.append(figure);
        }
        const total=selected.length+visuals.length+(projectFirst&&!selected.some(p=>p.role!=='personal')?1:0);group.dataset.mediaCount=String(Math.min(3,group.children.length));group.dataset.totalMedia=String(total);if(total>3){const more=document.createElement('span');more.className='media-more-count';more.textContent='+'+(total-3);more.setAttribute('aria-label',(total-3)+' more images');group.children[2].querySelector('a')?.append(more);}group.style.setProperty('--media-count',Math.min(3,group.children.length));if(card.querySelector('.run-media-slot'))card.querySelector('.run-media-slot').dataset.mediaCount=group.dataset.mediaCount;
        if(visuals.length)group.classList.add('run-project-gallery');
        if(!current())return;
        card.querySelectorAll('.run-media').forEach(el=>el.remove());
        const route=card.querySelector(':scope > .checkpoint-route');
        const body=card.querySelector('.history-visual')||card.querySelector('.fc-body');
        const slot=card.querySelector('.run-media-slot');
        if(slot){slot.replaceChildren(group);}
        else if(route)route.after(group);
        else if(body)body.after(group);
        else if(card.querySelector('.post-open'))card.querySelector('.post-open').before(group);
        else{const title=card.querySelector('.run-metrics')||card.querySelector('.note')||card.querySelector('.run-title-row');if(title)title.after(group);else card.prepend(group)}
        images.add(group);
      }catch(_){}
    }));
    if(active){stopTileFit();stopTileFit=root.StrivePlaceholders?.fit?.(host)||(()=>{});}
  }
  // First picture and latest picture of a project, side by side. runs is oldest first. A photo the
  // author marked Before or After wins; otherwise the earliest and the latest photo are used and are
  // labelled as that, never as Before and After. With fewer than two different photos nothing is shown.
  async function mountPair({client,slot,runs}){
    if(!slot)return;let active=true;const controller=new AbortController(),urls=new Set();
    const dispose=()=>{active=false;controller.abort();for(const url of urls)URL.revokeObjectURL(url);urls.clear();disposers.delete(dispose)};
    disposers.add(dispose);
    try{
      const found=[];
      for(const run of (runs||[]).slice(-24)){
        const res=await get(`/api/run-photos?run_id=${encodeURIComponent(run.id)}`,{headers:await headers(client),signal:controller.signal});
        if(!active)return;if(!res.ok)continue;
        for(const photo of ((await res.json())?.photos||[]))if(photo.is_selected!==false&&photo.role!=='personal')found.push({photo,run});
      }
      if(!active||found.length<2)return;
      const marked=role=>found.filter(f=>f.photo.role===role);
      const before=marked('before')[0]||found[0],after=[...marked('after'),...marked('result')].pop()||found[found.length-1];
      if(before.photo.id===after.photo.id)return;
      const declared=before.photo.role==='before'&&['after','result'].includes(after.photo.role);
      const figures=[];
      for(const [item,label] of [[before,declared?'Before':'First picture'],[after,declared?(after.photo.role==='result'?'Result':'After'):'Latest picture']]){
        const path=photoPath(item.photo);if(!path)return;
        const res=await get(path,{headers:await headers(client),signal:controller.signal},480);if(!active||!res.ok)return;
        const url=URL.createObjectURL(await res.blob());urls.add(url);
        figures.push(`<figure><a href="${esc(root.StriveLinks.runHref(item.run))}"><img src="${url}" alt="${esc(label)}" loading="lazy"></a><figcaption>${esc(label)}</figcaption></figure>`);
      }
      if(active)slot.innerHTML=figures.join('<span class="j-arrow" aria-hidden="true">→</span>');
    }catch(_){}
  }
  // One small picture beside a result line: the run's result image, else its first photo. It is
  // evidence the reader can open, so it links nowhere itself; the line around it opens the run.
  async function mountThumbs({client,root:host=document}){
    let active=true;const controller=new AbortController(),urls=new Set();
    const dispose=()=>{active=false;controller.abort();for(const url of urls)URL.revokeObjectURL(url);urls.clear();disposers.delete(dispose)};
    disposers.add(dispose);
    // A thumbnail inside a folded section asks for nothing until the section is opened.
    await Promise.all([...host.querySelectorAll('[data-thumb-run]:not([data-thumb-asked])')].filter(slot=>!slot.closest('details:not([open])')&&!slot.closest('[hidden]')).slice(0,24).map(async slot=>{
      slot.dataset.thumbAsked='1';
      try{
        const list=await get(`/api/run-photos?run_id=${encodeURIComponent(slot.dataset.thumbRun)}`,{headers:await headers(client),signal:controller.signal});
        if(!active||!list.ok)return;const photos=((await list.json())?.photos||[]).filter(p=>p.is_selected!==false&&p.role!=='personal');
        // A strict slot takes only a picture the author marked as the result or the after state, never just the first one.
        // A slot that names one picture shows that picture or nothing: the author chose it.
        const photo=slot.dataset.thumbPhoto?photos.find(p=>p.id===slot.dataset.thumbPhoto):photos.find(p=>p.role==='result')||photos.find(p=>p.role==='after')||(slot.dataset.thumbStrict===undefined?photos[0]:null),path=photo&&photoPath(photo);if(!path)return;
        const res=await get(path,{headers:await headers(client),signal:controller.signal},320);if(!active||!res.ok)return;
        const url=URL.createObjectURL(await res.blob());urls.add(url);
        const image=document.createElement('img');image.src=url;image.alt=roles[photo.role]||'Run photo';image.loading='lazy';slot.replaceChildren(image);
      }catch(_){}
    }));
  }
  // The main visual of a card page (site/day-card.js): one picture the author chose by id. It is drawn only
  // if this reader may fetch it. If it cannot be fetched for any reason, the measured trace that sits behind
  // it is shown instead, so a page never has an empty frame and a private picture leaves no trace.
  // A screenshot is shown whole. A photo fills its frame around the point the author picked. Neither is stretched.
  const FOCUS={center:'50% 50%',top:'50% 0%',bottom:'50% 100%',left:'0% 50%',right:'100% 50%'};
  async function mountVisuals({client,root:host=document}){
    let active=true;const controller=new AbortController(),urls=new Set();
    const dispose=()=>{active=false;controller.abort();for(const url of urls)URL.revokeObjectURL(url);urls.clear();disposers.delete(dispose)};
    disposers.add(dispose);
    // A page of the card that is not open asks for nothing. Its picture is read when the page opens.
    const figures=[...host.querySelectorAll('figure[data-visual-run]:not([data-visual-asked])')].filter(f=>!f.closest('[hidden]')).slice(0,24);
    await Promise.all(figures.map(async figure=>{
      figure.dataset.visualAsked='1';const own=figure.dataset.visualCover!==undefined;
      // A picture the author picked for the card falls back to the measured trace when it cannot be shown.
      // A run's own cover works the other way: the measured data stays until the cover is confirmed.
      const fall=()=>{if(!active||own)return;figure.dataset.state='fallback';const f=figure.querySelector('.dc-fallback');if(f)f.hidden=false;figure.querySelector('.dc-picture')?.remove();figure.querySelector('figcaption')?.remove()};
      try{
        const requestHeaders=await headers(client);
        const list=await get(`/api/run-photos?run_id=${encodeURIComponent(figure.dataset.visualRun)}`,{headers:requestHeaders,signal:controller.signal});
        if(!active)return;if(!list.ok)return fall();
        const photos=((await list.json())?.photos||[]).filter(p=>p.is_selected!==false),photo=own?lead(photos,'cover'):photos.find(p=>p.id===figure.dataset.visualPhoto),path=photo&&photoPath(photo);if(!path)return fall();
        let url=publicImage(path,figure,requestHeaders);
        if(!url){const res=await get(path,{headers:requestHeaders,signal:controller.signal},960);if(!active)return;if(!res.ok)return fall();url=URL.createObjectURL(await res.blob());urls.add(url)}
        const image=document.createElement('img');image.loading='lazy';image.alt=figure.dataset.alt||'Picture chosen by the author';image.decoding='async';
        if(photo.width&&photo.height){image.width=photo.width;image.height=photo.height}
        if(own){figure.dataset.was=figure.dataset.kind;figure.dataset.kind=photo.role==='personal'?'photo':'screenshot'}
        if(figure.dataset.kind==='photo')image.style.objectPosition=FOCUS[figure.dataset.focus]||FOCUS.center;
        const slot=figure.querySelector('.dc-picture');image.onerror=()=>{if(own){slot.hidden=true;figure.dataset.kind=figure.dataset.was||'data';figure.dataset.state='fallback';const f=figure.querySelector('.dc-fallback');if(f)f.hidden=false;const c=figure.querySelector('figcaption');if(c)c.hidden=true}else fall()};
        image.src=url;slot?.replaceChildren(image);
        if(own){slot.hidden=false;const f=figure.querySelector('.dc-fallback');if(f)f.hidden=true;const c=figure.querySelector('figcaption');if(c)c.hidden=false}
        figure.dataset.state='shown';
      }catch(_){fall()}
    }));
  }
  // The author picks one picture for a card from the pictures already on their runs. Nothing is
  // uploaded, moved or changed here: the choice is the picture's id. Thumbnails are the real pictures,
  // whole, large enough to tell two screenshots apart. Returns a function that sets the selection again.
  function mountChooser({client,slot,runs,selected,onPick}){
    slot.__strivePhotoChooserDispose?.();
    let active=true,loading=true,chosen=selected||null;const controller=new AbortController(),urls=new Set();
    const dispose=()=>{active=false;controller.abort();for(const url of urls)URL.revokeObjectURL(url);urls.clear();disposers.delete(dispose)};
    disposers.add(dispose);slot.__strivePhotoChooserDispose=dispose;slot.innerHTML='<p class="meta">Looking for pictures on these runs…</p>';
    const found=[],on=f=>!!chosen&&chosen.id===f.photo.id&&chosen.run===f.run.id;
    const paint=()=>{if(!active)return;if(loading){slot.innerHTML='<p class="meta">Looking for pictures on these runs…</p>';return;}
      const unavailable=!!chosen&&!found.some(on);
      slot.innerHTML=`<div class="pc-list" role="radiogroup" aria-label="Picture for the main visual"><label class="pc-item pc-none"><input type="radio" name="pc-photo" value="" ${chosen?'':'checked'}><span>No picture</span></label>`
        +found.map((f,i)=>`<label class="pc-item"><input type="radio" name="pc-photo" value="${i}" ${on(f)?'checked':''} aria-label="${esc(roles[f.photo.role]||'Photo')} picture on ${esc(f.run.label||'a run')}, ${f.photo.width} by ${f.photo.height}"><img src="${f.url}" alt=""><span aria-hidden="true">${esc(f.run.label||'Run')} · ${esc((roles[f.photo.role]||'Photo').toLowerCase())}</span></label>`).join('')+'</div>'
        +(unavailable?'<p class="meta" role="status">Your saved picture is not available here. It stays selected until you choose another picture or No picture.</p>':'')
        +(found.length||unavailable?'':`<p class="meta">No picture on these runs yet. ${runs&&runs[0]?`<a href="${esc(root.StriveLinks.runHref(runs[0]))}">Open a run to add one</a>, then choose it here. `:''}The card works without one.</p>`);
      slot.querySelectorAll('[name=pc-photo]').forEach(r=>r.addEventListener('change',e=>{e.stopPropagation();const f=found[+r.value];chosen=r.value===''||!f?null:{run:f.run.id,id:f.photo.id};onPick(chosen,f&&r.value!==''?{role:f.photo.role,width:f.photo.width,height:f.photo.height}:null)}))};
    (async()=>{
      // Every run on the card is asked, eight at a time, so a long day does not lose the pictures on its later runs.
      const queue=(runs||[]).slice(0,240),ask=async run=>{
        try{const res=await get(`/api/run-photos?run_id=${encodeURIComponent(run.id)}`,{headers:await headers(client),signal:controller.signal});if(!active||!res.ok)return;
          for(const photo of ((await res.json())?.photos||[])){const path=photoPath(photo);if(!path)continue;
            const img=await get(path,{headers:await headers(client),signal:controller.signal},320);if(!active||!img.ok)continue;const blob=await img.blob();if(!active)continue;const url=URL.createObjectURL(blob);urls.add(url);found.push({run,photo,url})}
        }catch(_){}};
      let next=0;await Promise.all(Array.from({length:8},async()=>{while(active&&next<queue.length)await ask(queue[next++])}));
      found.sort((a,b)=>runs.indexOf(a.run)-runs.indexOf(b.run));loading=false;paint();
    })();
    return next=>{chosen=next||null;paint()};
  }
  root.StriveRunPhotos={prepareCards,mount,mountCovers,mountPair,mountThumbs,mountVisuals,mountChooser,disposeAll,forget,lead,cardPhotos};
})(typeof window!=="undefined"?window:globalThis);
