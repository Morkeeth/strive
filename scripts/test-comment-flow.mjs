import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const run='10000000-0000-4000-8000-000000000001',a='20000000-0000-4000-8000-000000000001',b='20000000-0000-4000-8000-000000000002';
const w=new JSDOM('<section id="thread"></section>',{url:'https://strive.test/',runScripts:'outside-only'}).window;
for(const f of ['run-links.js','run-contract.js','social.js'])w.eval(fs.readFileSync('site/'+f,'utf8'));
w.confirm=()=>true;let viewer={id:a},rows=[],failed=false,seq=0,count=null;
const client={from(table){let action='read',value,filters=[],countOnly=false;return {select(fields,options){countOnly=options?.head;return this},eq(k,v){filters.push([k,v]);return this},order(){return this},limit(){return this},or(){return this},insert(v){action='insert';value=v;return this},update(v){action='update';value=v;return this},delete(){action='delete';return this},then(resolve){
 const found=rows.filter(r=>filters.every(([k,v])=>r[k]===v));
 if(failed&&action!=='read')return resolve({error:{message:'TEST DATA rejected write'}});
 if(action==='insert')rows.unshift({...value,id:`30000000-0000-4000-8000-${String(++seq).padStart(12,'0')}`,created_at:new Date().toISOString(),author:{github_handle:viewer.id===a?'author-a':'author-b'}});
 if(action==='update')for(const r of found){if(r.author_id!==viewer.id)return resolve({error:{message:'Denied'}});Object.assign(r,value,{edited_at:new Date().toISOString()})}
 if(action==='delete')rows=rows.filter(r=>!found.includes(r));
 resolve({data:action==='read'?found:[],count:countOnly?found.length:null});
 }}}};
const ui=w.GrinderSocial({client,me:()=>viewer,status(){}}),slot=w.document.querySelector('#thread'),options={compact:true,onCount:n=>{count=n}};
const settled=()=>new Promise(r=>setTimeout(r,5));
for(const id of [a,b]){
 viewer={id};await ui.thread(run,slot,options);
 const area=slot.querySelector('textarea[name=body]');area.value='TEST DATA Enter comment';area.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await settled();
 assert.equal(rows.length,1,'Enter saves exactly once');assert.equal(slot.querySelector('textarea[name=body]').value,'');assert.equal(slot.dataset.compact,'1');assert.equal(w.document.activeElement,slot.querySelector('textarea[name=body]'),'ready for next comment');assert.equal(count,1);
 await ui.thread(run,slot,options);assert.match(slot.textContent,/TEST DATA Enter comment/);
 slot.querySelector('article button').click();const edit=slot.querySelector('[aria-label="Edit your reply"]');edit.value='TEST DATA edited';await [...slot.querySelectorAll('button')].find(x=>x.textContent==='Save').onclick();assert.match(slot.textContent,/TEST DATA edited/);assert.equal(slot.querySelector('textarea[name=body]').rows,1);
 const second=slot.querySelector('textarea[name=body]');second.value='TEST DATA '+ 'long '.repeat(500);second.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true,cancelable:true}));await settled();assert.equal(rows.length,1,'Shift Enter does not post');await slot.querySelector('form.reply-form').onsubmit({preventDefault(){}});assert.equal(rows.length,2);assert.equal(count,2);
 for(const button of [...slot.querySelectorAll('article button')].filter(x=>x.textContent==='Delete')){if(button.isConnected)await button.onclick();}
 // Each delete remounts the current list.
 while(rows.length)await [...slot.querySelectorAll('button')].find(x=>x.textContent==='Delete').onclick();
 assert.match(slot.textContent,/No comments yet/);assert.equal(count,0);
 const retry=slot.querySelector('textarea[name=body]');retry.value='TEST DATA keep draft';failed=true;await slot.querySelector('form.reply-form').onsubmit({preventDefault(){}});assert.equal(retry.value,'TEST DATA keep draft');assert.equal(rows.length,0);assert.equal(slot.querySelector('form button').disabled,false);failed=false;
 retry.value='   ';await slot.querySelector('form.reply-form').onsubmit({preventDefault(){}});assert.equal(rows.length,0,'blank comments stay unsaved');
}
w.close();console.log('PASS two fixture viewers: Enter/Shift Enter, long/second comment, edit/delete/reload, compact form, exact count, rejected write retains draft, blank input');
