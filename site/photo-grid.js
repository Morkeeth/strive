/* One photo grid for the import step and the saved-run editor.
   It draws tiles and reports what the author did. The caller owns storage:
   nothing here uploads, saves or changes who can read a run. */
(function(root){
  'use strict';
  const ACCEPT=['image/jpeg','image/png','image/webp'];
  // The label on a photo is the run's audience. A hidden photo, or an audience this
  // file does not know, reads as the narrowest case. It never says Public by default.
  const AUDIENCE={private:'Only you',close_friends:'Close friends',link:'Followers',public:'Public'};
  const AUDIENCE_NOTE={private:'Only you can see this run and its photos.',close_friends:'Close friends who can read this run see this photo.',link:'Followers who can read this run see this photo.',public:'Anyone who can read this run sees this photo.'};
  const known=audience=>Object.hasOwn(AUDIENCE,audience)?audience:'private';
  const audienceLabel=(audience,hidden=false)=>hidden?'Hidden':AUDIENCE[known(audience)];
  const audienceNote=(audience,hidden=false)=>hidden?'Hidden from readers. Only you see this photo.':AUDIENCE_NOTE[known(audience)];
  const mounted=new Set(),pending=new WeakMap();
  // Controls carry the page's `ghost` class: without it the global rule paints every button blue.
  const make=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!=null)el.textContent=text;return el;};
  const hasFiles=event=>[...(event.dataTransfer?.types||[])].includes('Files');
  const images=list=>[...(list||[])].filter(file=>ACCEPT.includes(file.type));
  let serial=0;

  function relabel(section){
    const audience=section.__audience?.();
    section.querySelectorAll('.photo-audience').forEach(label=>{
      const hidden=label.dataset.hidden==='true';
      label.textContent=audienceLabel(audience,hidden);label.title=audienceNote(audience,hidden);
      if(label.tagName==='BUTTON')label.setAttribute('aria-label',(hidden?'Hidden. Show this photo to readers of the run':audienceLabel(audience)+'. Hide this photo from readers'));
    });
  }
  function refreshAudience(){for(const section of [...mounted]){if(section.isConnected===false){mounted.delete(section);continue;}relabel(section);}}

  // items: [{id,src,hidden}] in display order. The first item that is not hidden is the cover.
  function render({slot,title='Photos',headingLevel=3,items=[],limit=6,canAdd=true,locked=false,removed=false,note='',audience=()=> 'private',onAdd,onReorder,onRemove,onUndo,onToggleHidden}){
    for(const old of slot.querySelectorAll('.photo-editor'))mounted.delete(old);
    const section=make('section','photo-editor'),headId='photo-editor-title-'+(++serial);
    section.setAttribute('aria-labelledby',headId);section.__audience=audience;
    const head=make('div','photo-editor-head'),heading=make('h'+headingLevel,null,title);heading.id=headId;
    head.append(heading,make('span','meta',items.length+' of '+limit));
    const grid=make('ul','photo-editor-grid');grid.setAttribute('role','list');
    const status=make('p','photo-editor-message');status.setAttribute('role','status');status.hidden=true;
    const ids=items.map(item=>item.id),coverId=items.find(item=>!item.hidden)?.id;
    const edit=!locked;
    const move=(id,to,announce=true)=>{
      const from=ids.indexOf(id);if(from<0||to<0||to>=ids.length||to===from)return;
      const next=ids.filter(other=>other!==id);next.splice(to,0,id);
      pending.set(slot,announce?{focus:id,text:'Photo moved to position '+(to+1)+' of '+ids.length+'.'+(to===0?' It is the cover.':'')}:{});
      return onReorder?.(next);
    };
    let dragging=null,touchSource=null,touchTarget=null,touchTimer=null;
    const clearTouch=()=>{clearTimeout(touchTimer);touchTimer=null;touchSource?.classList.remove('photo-dragging');touchTarget?.classList.remove('photo-drop-target');touchSource=null;touchTarget=null;};
    items.forEach((item,index)=>{
      const tile=make('li','photo-tile'),image=make('img'),place='Photo '+(index+1)+' of '+items.length;
      tile.dataset.photoId=item.id;image.src=item.src;image.alt=place;image.draggable=false;image.loading='lazy';tile.append(image);
      if(item.id===coverId)tile.append(make('span','photo-cover-tag','Cover'));
      const label=make(edit&&onToggleHidden?'button':'span',edit&&onToggleHidden?'photo-audience ghost':'photo-audience');label.dataset.hidden=String(!!item.hidden);
      if(label.tagName==='BUTTON'){label.type='button';label.dataset.photoPrivate=item.id;label.setAttribute('aria-pressed',String(!!item.hidden));label.onclick=()=>onToggleHidden(item.id,!item.hidden);}
      tile.append(label);
      if(edit){
        const handle=make('button','photo-drag-handle ghost','⠿');handle.type='button';handle.dataset.photoMove=item.id;
        handle.setAttribute('aria-label','Move '+place.toLowerCase()+'. Arrow keys reorder');
        handle.onkeydown=event=>{
          const step={ArrowLeft:-1,ArrowUp:-1,ArrowRight:1,ArrowDown:1}[event.key],to=event.key==='Home'?0:event.key==='End'?ids.length-1:step?index+step:null;
          if(to==null)return;event.preventDefault();void move(item.id,to);
        };
        // Touch has no native drag. Hold the handle, then slide to another tile.
        handle.onpointerdown=event=>{if(event.pointerType!=='touch')return;touchTimer=setTimeout(()=>{touchSource=tile;tile.classList.add('photo-dragging');handle.setPointerCapture?.(event.pointerId);},180);};
        handle.onpointermove=event=>{if(!touchSource)return;event.preventDefault();const over=document.elementFromPoint(event.clientX,event.clientY)?.closest('.photo-tile[data-photo-id]');touchTarget?.classList.remove('photo-drop-target');touchTarget=over&&over!==touchSource?over:null;touchTarget?.classList.add('photo-drop-target');};
        handle.onpointerup=()=>{const source=touchSource?.dataset.photoId,target=touchTarget?.dataset.photoId;clearTouch();if(source&&target)void move(source,ids.indexOf(target),false);};
        handle.onpointercancel=clearTouch;handle.oncontextmenu=event=>event.preventDefault();
        const remove=make('button','photo-remove ghost','×');remove.type='button';remove.dataset.photoRemove=item.id;remove.setAttribute('aria-label','Remove '+place.toLowerCase());
        remove.onclick=()=>onRemove?.(item.id);
        tile.append(handle,remove);
        tile.draggable=true;
        tile.ondragstart=event=>{dragging=item.id;tile.classList.add('photo-dragging');event.dataTransfer?.setData('text/plain',item.id);if(event.dataTransfer)event.dataTransfer.effectAllowed='move';};
        tile.ondragend=()=>{dragging=null;tile.classList.remove('photo-dragging');grid.querySelectorAll('.photo-drop-target').forEach(el=>el.classList.remove('photo-drop-target'));};
        tile.ondragover=event=>{if(!dragging||dragging===item.id)return;event.preventDefault();tile.classList.add('photo-drop-target');};
        tile.ondragleave=()=>tile.classList.remove('photo-drop-target');
        // A dropped photo takes the place of the tile it lands on.
        tile.ondrop=event=>{if(!dragging)return;event.preventDefault();event.stopPropagation();const source=dragging;dragging=null;tile.classList.remove('photo-drop-target');void move(source,index,false);};
      }
      grid.append(tile);
    });
    const add=files=>{const chosen=images(files);if(!chosen.length){if([...(files||[])].length)handle.message('Choose a JPEG, PNG or WebP image.');return;}return onAdd?.(chosen);};
    if(edit&&canAdd){
      const tile=make('li','photo-add-tile'),label=make('label'),plus=make('span',null,'＋'),input=make('input');
      plus.setAttribute('aria-hidden','true');input.type='file';input.accept=ACCEPT.join(',');input.multiple=true;input.dataset.photoFile='';
      input.onchange=()=>{const files=[...(input.files||[])];try{input.value='';}catch(_){ }void add(files);};
      label.append(plus,make('span',null,'Add photos'),input);tile.append(label);grid.append(tile);
    }
    // A file dropped anywhere on the editor is added. Without this the browser would
    // leave the page to open the image.
    section.ondragover=event=>{if(!hasFiles(event))return;event.preventDefault();if(edit&&canAdd)section.classList.add('photo-drop-ready');};
    section.ondragleave=event=>{if(!section.contains(event.relatedTarget))section.classList.remove('photo-drop-ready');};
    section.ondrop=event=>{if(!hasFiles(event))return;event.preventDefault();section.classList.remove('photo-drop-ready');if(edit&&canAdd)void add(event.dataTransfer.files);};
    section.append(head,grid);
    if(removed&&edit){const undo=make('p','photo-undo','Photo removed. '),button=make('button','ghost','Undo');undo.setAttribute('role','status');button.type='button';button.dataset.photoUndo='';button.onclick=()=>onUndo?.();undo.append(button);section.append(undo);}
    if(note)section.append(make('p','photo-limit',note));
    section.append(status);
    const handle={root:section,message(text){status.textContent=text||'';status.hidden=!text;},relabel:()=>relabel(section)};
    relabel(section);slot.replaceChildren(section);mounted.add(section);
    const after=pending.get(slot);pending.delete(slot);
    if(after?.text)handle.message(after.text);
    if(after?.focus)[...grid.querySelectorAll('[data-photo-move]')].find(button=>button.dataset.photoMove===after.focus)?.focus();
    return handle;
  }
  root.StrivePhotoGrid={render,refreshAudience,audienceLabel,ACCEPT};
})(typeof window==='object'?window:globalThis);
