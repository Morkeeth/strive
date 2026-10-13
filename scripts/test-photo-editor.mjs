// The photo editor is one plain grid, used on the import step and on the saved-run editor.
// Every case below runs the real modules in jsdom with TEST DATA. No network, no database.
// PHOTO_EDITOR_SITE points the same cases at another copy of site/ (used once, to see them fail
// on the editor this replaced).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
import {JSDOM} from 'jsdom';

const SITE=process.env.PHOTO_EDITOR_SITE||'site';
const RUN='11111111-1111-4111-a111-111111111111',OWNER='22222222-2222-4222-a222-222222222222';
const read=name=>fs.existsSync(`${SITE}/${name}`)?fs.readFileSync(`${SITE}/${name}`,'utf8'):'';
const until=async(check,what)=>{for(let i=0;i<200;i++){if(check())return;await new Promise(r=>setTimeout(r,5));}throw new Error('timed out waiting for '+what);};
const file=(w,name,type='image/png')=>new w.File(['TEST DATA '+name],name,{type});
const tiles=slot=>[...slot.querySelectorAll('.photo-editor-grid .photo-tile[data-photo-id]')];
const order=slot=>tiles(slot).map(tile=>tile.dataset.photoId);
const labels=slot=>tiles(slot).map(tile=>tile.querySelector('.photo-audience')?.textContent);
const covers=slot=>tiles(slot).map(tile=>!!tile.querySelector('.photo-cover-tag'));
const shape=slot=>tiles(slot).map(tile=>[...tile.children].map(child=>child.tagName+'.'+child.className).join(' '));

function fakeIndexedDB(){
  const data=new Map(),copy=v=>v&&{...v,items:v.items.map(item=>({...item}))};
  const database={createObjectStore(){},transaction(){
    const tx={aborted:false,abort(){tx.aborted=true;setTimeout(()=>tx.onabort?.())},objectStore:()=>({
      get(key){const request={};setTimeout(()=>{request.result=copy(data.get(key));request.onsuccess?.();setTimeout(()=>{if(!tx.aborted)tx.oncomplete?.()})});return request;},
      put(value){if(!tx.aborted)data.set(value.key,copy(value))}})};
    return tx;}};
  return {data,open(){const request={result:database};setTimeout(()=>{request.onupgradeneeded?.();request.onsuccess?.()});return request;}};
}

function page(){
  const dom=new JSDOM('<main id="app"><div id="run-edit"><div id="edit"></div></div><div class="post-composer"><div class="post-photo-slot" id="draft"></div></div></main>',{url:'https://strive.test/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,calls=[];let blobs=0;
  w.URL.createObjectURL=()=> 'blob:TEST-'+(++blobs);w.URL.revokeObjectURL=()=>{};
  Object.defineProperty(w,'crypto',{value:webcrypto,configurable:true});w.TextEncoder=TextEncoder;
  w.indexedDB=fakeIndexedDB();
  // jsdom decodes no pixels. These stand in for the browser's image decoder and canvas only.
  w.Image=class{set src(_){setTimeout(()=>{this.naturalWidth=60;this.naturalHeight=40;this.onload?.()})}};
  const createElement=w.document.createElement.bind(w.document);
  w.document.createElement=(tag,...rest)=>tag==='canvas'?{width:1,height:1,getContext:()=>({fillRect(){},drawImage(){}}),toBlob(done){done(new Blob(['TEST DATA pixels '+(++blobs)],{type:'image/jpeg'}))}}:createElement(tag,...rest);
  w.FileReader=class{readAsDataURL(blob){blob.arrayBuffer().then(bytes=>{this.result='data:image/jpeg;base64,'+Buffer.from(bytes).toString('base64');this.onload?.()})}};
  for(const name of ['photo-grid.js','photo-draft.js','run-photos.js'])if(read(name))w.eval(read(name));
  return {w,d:w.document,calls};
}

async function editor({visibility='private',count=3,photos=null}={}){
  const p=page(),{w,d}=p,writes=[];let audience=visibility;
  const seed=photos||Array.from({length:count},(_,i)=>({id:'saved-'+(i+1),role:'photo',is_selected:true,is_private:false,sort_position:i,url:`/api/run-photos?run_id=${RUN}&id=saved-${i+1}`}));
  w.fetch=async(path,options={})=>{
    if(options.method&&options.method!=='GET'){writes.push({method:options.method,body:options.body?JSON.parse(options.body):null});return {ok:true,json:async()=>({photo:{id:'uploaded-'+writes.length,url:`/api/run-photos?run_id=${RUN}&id=uploaded-${writes.length}`}})};}
    return String(path).includes('&id=')?{ok:true,blob:async()=>new Blob(['TEST'])}:{ok:true,json:async()=>({photos:seed.map(photo=>({...photo}))})};
  };
  const slot=d.querySelector('#edit'),status=[];
  const handle=await w.StriveRunPhotos.mount({client:null,run:{id:RUN,visibility},slot,owner:true,staged:true,status:text=>status.push(text),audience:()=>audience});
  return {...p,slot,handle,writes,status,setAudience(next){audience=next;w.StrivePhotoGrid?.refreshAudience();}};
}

async function draft({names=[],audience='private'}={}){
  const p=page(),{w,d}=p,slot=d.querySelector('#draft'),network=[];let chosen=audience;
  w.fetch=async(path,options={})=>{network.push({path:String(path),method:options.method||'GET',body:options.body?JSON.parse(options.body):null});const n=network.filter(c=>c.method==='POST').length;return {ok:true,json:async()=>({photo:{id:'30000000-0000-4000-8000-00000000000'+n}})};};
  await w.StrivePhotoDraft.mount({slot,token:'TEST DATA token',profileId:OWNER,eligible:true,audience:()=>chosen});
  for(const name of names){const before=tiles(slot).length;const input=slot.querySelector('[data-photo-file]');Object.defineProperty(input,'files',{value:[file(w,name)],configurable:true});input.onchange();await until(()=>tiles(slot).length===before+1,'draft tile '+name);}
  return {...p,slot,network,setAudience(next){chosen=next;w.StrivePhotoGrid?.refreshAudience();}};
}

const cases={
  async 'one grid draws both the import step and the saved-run editor'(){
    const edit=await editor({count:2}),step=await draft({names:['a.png','b.png']});
    assert.equal(edit.slot.querySelectorAll('.photo-editor-grid').length,1);assert.equal(step.slot.querySelectorAll('.photo-editor-grid').length,1);
    assert.deepEqual(shape(step.slot),shape(edit.slot),'tiles have the same parts in both places');
    for(const {d} of [edit,step])assert.equal(d.querySelectorAll('.post-photo-grid,.run-photo-grid,[data-draft-personal],[data-draft-support],[data-draft-role],[data-draft-cover],select').length,0,'no second photo model');
    assert.equal(typeof edit.w.StrivePhotoGrid.render,'function');
  },
  async 'the plus tile takes a click or a dropped file'(){
    for(const make of [()=>editor({count:1}),()=>draft({names:['first.png']})]){
      const {w,slot}=await make(),input=slot.querySelector('.photo-add-tile label input[type=file][data-photo-file]');
      assert.ok(input,'the plus tile is a label around a file input, so a click opens the picker');assert.equal(input.multiple,true);assert.equal(input.accept,'image/jpeg,image/png,image/webp');
      Object.defineProperty(input,'files',{value:[file(w,'clicked.png')],configurable:true});input.onchange();await until(()=>tiles(slot).length===2,'picked file');
      const event=new w.Event('drop',{bubbles:true,cancelable:true});event.dataTransfer={types:['Files'],files:[file(w,'dropped.png'),file(w,'notes.txt','text/plain')]};
      slot.querySelector('.photo-add-tile').dispatchEvent(event);
      assert.equal(event.defaultPrevented,true,'the browser does not leave the page to open the file');
      await until(()=>tiles(slot).length===3,'dropped file');assert.equal(tiles(slot).length,3,'the text file is not added');
    }
  },
  async 'images fill their tiles'(){
    const {w,d,slot}=await editor({count:1});
    const html=read('index.html'),sheets=[...html.matchAll(/<style>([\s\S]*?)<\/style>|<link rel="stylesheet" href="\/([\w.-]+\.css)">/g)].map(m=>m[1]??read(m[2])).join('\n');
    const style=d.createElement('style');style.textContent=sheets;d.head.append(style);
    const tile=slot.querySelector('.photo-tile'),image=w.getComputedStyle(tile.querySelector('img'));
    assert.equal(w.getComputedStyle(tile).aspectRatio.replace(/\s/g,''),'1/1','fixed aspect');assert.equal(w.getComputedStyle(tile).overflow,'hidden');
    assert.equal(image.position,'absolute');assert.equal(image.width,'100%');assert.equal(image.height,'100%');assert.equal(image.objectFit,'cover');
  },
  async 'drag reorders and the first visible photo is the labelled cover'(){
    for(const make of [()=>editor({count:3}),()=>draft({names:['a.png','b.png','c.png']})]){
      const {w,slot}=await make(),[one,two,three]=order(slot);
      assert.deepEqual(covers(slot),[true,false,false]);assert.equal(tiles(slot)[0].querySelector('.photo-cover-tag').textContent,'Cover');
      assert.equal(tiles(slot)[2].draggable,true);
      const fire=(tile,type)=>{const event=new w.Event(type,{bubbles:true,cancelable:true});event.dataTransfer={types:['text/plain'],setData(){}};tile.dispatchEvent(event);return event;};
      fire(tiles(slot)[2],'dragstart');assert.equal(fire(tiles(slot)[0],'dragover').defaultPrevented,true);fire(tiles(slot)[0],'drop');
      await until(()=>order(slot)[0]===three,'dragged order');
      assert.deepEqual(order(slot),[three,one,two]);assert.deepEqual(covers(slot),[true,false,false],'the cover is the photo now in first place');
      // Hiding the first photo from readers moves the cover to the next one they can see.
      tiles(slot)[0].querySelector('[data-photo-private]').click();await until(()=>covers(slot)[1],'cover after hiding');
      assert.deepEqual(covers(slot),[false,true,false]);
      assert.equal(slot.querySelectorAll('[data-draft-cover],[data-photo-cover]').length,0,'no separate cover control');
    }
  },
  async 'keyboard reorders and keeps focus on the moved photo'(){
    for(const make of [()=>editor({count:3}),()=>draft({names:['a.png','b.png','c.png']})]){
      const {w,d,slot}=await make(),[one,two,three]=order(slot);
      const press=(id,key)=>{const handle=[...slot.querySelectorAll('[data-photo-move]')].find(button=>button.dataset.photoMove===id);handle.focus();const event=new w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true});handle.dispatchEvent(event);return event;};
      assert.match(slot.querySelector('[data-photo-move]').getAttribute('aria-label'),/Move photo 1 of 3/);
      assert.equal(press(one,'ArrowRight').defaultPrevented,true);await until(()=>order(slot)[1]===one,'arrow move');
      assert.deepEqual(order(slot),[two,one,three]);assert.equal(d.activeElement.dataset.photoMove,one,'focus stays on the moved photo');
      assert.match(slot.querySelector('.photo-editor-message').textContent,/position 2 of 3/);
      press(one,'Home');await until(()=>order(slot)[0]===one,'Home move');assert.deepEqual(covers(slot),[true,false,false]);
      press(one,'End');await until(()=>order(slot)[2]===one,'End move');assert.deepEqual(order(slot),[two,three,one]);
      press(two,'ArrowLeft');await new Promise(r=>setTimeout(r,30));assert.deepEqual(order(slot),[two,three,one],'the first photo cannot move further');
    }
  },
  async 'remove comes with Undo'(){
    for(const make of [()=>editor({count:3}),()=>draft({names:['a.png','b.png','c.png']})]){
      const {slot}=await make(),before=order(slot);
      assert.equal(slot.querySelector('[data-photo-undo]'),null);
      assert.match(tiles(slot)[1].querySelector('[data-photo-remove]').getAttribute('aria-label'),/Remove photo 2 of 3/);
      tiles(slot)[1].querySelector('[data-photo-remove]').click();await until(()=>tiles(slot).length===2,'removal');
      assert.deepEqual(order(slot),[before[0],before[2]]);assert.match(slot.querySelector('.photo-undo').textContent,/Photo removed/);
      slot.querySelector('[data-photo-undo]').click();await until(()=>tiles(slot).length===3,'undo');
      assert.deepEqual(order(slot),before,'Undo puts the photo back in its place');assert.equal(slot.querySelector('[data-photo-undo]'),null);
    }
  },
  async 'the photo label follows the run audience and never says Public on a private run'(){
    const edit=await editor({visibility:'private',count:2});
    assert.deepEqual(labels(edit.slot),['Only you','Only you']);assert.doesNotMatch(edit.slot.textContent,/Public/);
    edit.setAudience('public');assert.deepEqual(labels(edit.slot),['Public','Public'],'the label follows the audience control without a reload');
    tiles(edit.slot)[0].querySelector('[data-photo-private]').click();await until(()=>labels(edit.slot)[0]==='Hidden','hidden label');
    assert.deepEqual(labels(edit.slot),['Hidden','Public']);
    edit.setAudience('close_friends');assert.deepEqual(labels(edit.slot),['Hidden','Close friends']);
    edit.setAudience('link');assert.deepEqual(labels(edit.slot),['Hidden','Followers']);
    edit.setAudience('private');assert.doesNotMatch(edit.slot.textContent,/Public/);
    // A run saved as public still reads from the control: the control now says Only me.
    const saved=await editor({visibility:'public',count:1});assert.deepEqual(labels(saved.slot),['Public']);saved.setAudience('private');assert.deepEqual(labels(saved.slot),['Only you']);
    // An audience this code does not know is treated as the narrowest one.
    const odd=await editor({visibility:'anonymous',count:1});assert.deepEqual(labels(odd.slot),['Only you']);
    // The import step has no saved run. Its photos are private until an audience is chosen.
    const step=await draft({names:['a.png']});assert.deepEqual(labels(step.slot),['Only you']);assert.doesNotMatch(step.slot.textContent,/Public/);
    step.setAudience('public');assert.deepEqual(labels(step.slot),['Public']);
    // A personal photo from before this editor stays hidden, as the database keeps it.
    const personal=await editor({visibility:'public',photos:[{id:'saved-1',role:'personal',personal_public_selected:false,is_private:true,is_selected:true,sort_position:0,url:`/api/run-photos?run_id=${RUN}&id=saved-1`},{id:'saved-2',role:'photo',is_private:false,is_selected:true,sort_position:1,url:`/api/run-photos?run_id=${RUN}&id=saved-2`}]});
    assert.deepEqual(labels(personal.slot),['Hidden','Public']);assert.deepEqual(covers(personal.slot),[false,true]);
  },
  async 'there are no explanatory paragraphs'(){
    for(const make of [()=>editor({count:2}),()=>draft({names:['a.png']}),()=>draft()]){
      const {slot}=await make();
      assert.equal(slot.querySelectorAll('p:not([hidden])').length,0,'no paragraph while the editor is in its normal state');
      assert.doesNotMatch(slot.textContent,/Drag to reorder|One personal photo|Choose each image|Up to six images|main image/i);
      assert.equal(slot.querySelector('.photo-editor-head').textContent,'Photos'+tiles(slot).length+' of 6');
    }
  },
  async 'six photos are shown and twelve are stored'(){
    const full=await editor({count:6});assert.equal(full.slot.querySelector('.photo-add-tile'),null);assert.match(full.slot.querySelector('.photo-limit').textContent,/Remove a photo to add another/);
    const stored=Array.from({length:12},(_,i)=>({id:'saved-'+(i+1),role:'photo',is_selected:i<5,is_private:false,sort_position:i,url:`/api/run-photos?run_id=${RUN}&id=saved-${i+1}`}));
    const twelve=await editor({photos:stored});assert.equal(tiles(twelve.slot).length,5);assert.equal(twelve.slot.querySelector('.photo-add-tile'),null,'a thirteenth image cannot be stored');assert.match(twelve.slot.querySelector('.photo-limit').textContent,/Twelve images are saved/);
    const step=await draft({names:['a.png','b.png','c.png','d.png','e.png','f.png']});assert.equal(tiles(step.slot).length,6);assert.equal(step.slot.querySelector('.photo-add-tile'),null);
  },
  async 'nothing is saved or published until the author saves'(){
    const edit=await editor({visibility:'private',count:3}),{w}=edit,ids=order(edit.slot);
    tiles(edit.slot)[2].querySelector('[data-photo-move]').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}));await until(()=>order(edit.slot)[0]===ids[2],'staged move');
    tiles(edit.slot)[1].querySelector('[data-photo-remove]').click();await until(()=>tiles(edit.slot).length===2,'staged removal');
    assert.equal(edit.writes.length,0,'edits on a saved run wait for Save changes');
    await edit.handle.save();
    assert.deepEqual(edit.writes.map(write=>write.body),[{run_id:RUN,photo_id:ids[0],is_selected:false},{run_id:RUN,photo_order:[ids[2],ids[0],ids[1]]}]);
    assert.ok(edit.writes.every(write=>!('visibility' in write.body)),'the photo editor never changes the audience');
    const step=await draft({names:['a.png','b.png','c.png']}),first=order(step.slot);
    tiles(step.slot)[2].querySelector('[data-photo-move]').dispatchEvent(new step.w.KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}));await until(()=>order(step.slot)[0]===first[2],'draft move');
    tiles(step.slot)[1].querySelector('[data-photo-private]').click();await until(()=>labels(step.slot)[1]==='Hidden','draft hide');
    assert.equal(step.network.length,0,'photos on the import step stay on this device');
    // Saving with the audience left at Only me: one private insert, photos in tile order, no audience change.
    const rows=[],updates=[];
    const client={auth:{getSession:async()=>({data:{session:{access_token:'TEST-token',user:{id:'auth-owner'}}}})},from(){let inserted=null;const query={select:()=>query,eq:()=>query,limit:async()=>({data:[]}),maybeSingle:async()=>({data:rows.at(-1)||null}),insert(row){inserted=row;rows.push(row);return query},single:async()=>({data:{id:inserted.id}}),update(row){updates.push(row);return query}};return query;}};
    const result=await step.w.StrivePhotoDraft.save({token:'TEST DATA token',profileId:OWNER,client,audience:'private',buildRow:()=>({measurement_revision:'a'.repeat(64),trace_basis:'elapsed',title:'TEST DATA run'})});
    assert.equal(rows.length,1);assert.equal(rows[0].visibility,'private');assert.equal(updates.length,0,'no audience update is sent');assert.equal(result.visibility,'private');
    const posts=step.network.filter(call=>call.method==='POST'),patches=step.network.filter(call=>call.method==='PATCH').map(call=>call.body);
    assert.equal(posts.length,3);
    const saved=posts.map((_,i)=>'30000000-0000-4000-8000-00000000000'+(i+1));
    assert.deepEqual(patches,[{run_id:rows[0].id,photo_id:saved[1],is_private:true},{run_id:rows[0].id,photo_order:saved}],'the hidden photo stays hidden and the tile order is stored');
  },
};

let failed=0;
for(const [name,run] of Object.entries(cases)){
  try{await run();console.log('PASS '+name);}
  catch(error){failed++;console.log('FAIL '+name+'\n     '+String(error.message).split('\n')[0]);}
}
console.log(failed?`${failed} of ${Object.keys(cases).length} photo editor behaviours failed (${SITE})`:`PASS photo editor: ${Object.keys(cases).length} behaviours, import step and saved-run editor (${SITE})`);
process.exit(failed?1:0);
