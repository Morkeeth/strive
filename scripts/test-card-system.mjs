// The card system in a page (site/day-card.js): what a press, a key and a save actually do.
// Rules: docs/design/CARD-SYSTEM.md. Pure rules (order, numbering, privacy) are in test-day-card.mjs.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';
// jsdom cannot follow a link; the one press this file leaves to the browser would print that as noise.
const dom=new JSDOM('<!doctype html><body><div id="host"></div><div id="setup"></div></body>',{url:'http://localhost/?day=2026-10-05',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
const {window}=dom,{document}=window;
globalThis.window=window;globalThis.document=document;
window.Element.prototype.scrollIntoView=()=>{};
const run=file=>window.eval(readFileSync(new URL('../site/'+file,import.meta.url),'utf8'));
run('day.js');run('day-card.js');
const C=window.StriveDayCard,D=window.StriveDay;
const at=(h,m=0)=>new Date(2026,9,5,h,m).toISOString();
const runs=[{id:'a1',project:'alpha',started_at:at(9),duration_s:3600,story_result:'TEST DATA alpha said',visibility:'public'},
 {id:'b1',project:'beta',started_at:at(10),duration_s:1800,story_result:'TEST DATA beta said',visibility:'private'},
 {id:'c1',project:'gamma',started_at:at(11),duration_s:600,visibility:'private'}];
const model=D.compute(runs,'2026-10-05',v=>v||''),tokens=new Map();
for(const g of model.groups)tokens.set(g.label,await C.token('owner','k',g.label));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const links={edit:'/e',visual:'/v',reader:'/r',sharing:'/s'};
const host=document.getElementById('host'),deck=C.slides(model,tokens,null);
host.innerHTML=C.render(deck,{esc,mine:true,author:'TEST DATA Author',windowLabel:'Mon',menu:links,pageHref:k=>'/?day=2026-10-05'+(k?'&page='+k:''),
 actions:'<button class="fc-act kudo">XUDOS</button><a class="fc-act" href="#day-thread" data-comment>Comment</a>'});
const card=host.querySelector('#day-card'),changes=[];
const pager=C.wire(card,{onChange:(n,key,o)=>changes.push([n,key,o.push])});
const shown=()=>[...card.querySelectorAll('.dc-slide')].filter(s=>!s.hidden).map(s=>s.dataset.name);
const current=()=>[...card.querySelectorAll('.dc-page[aria-current]')].map(a=>a.getAttribute('aria-label'));
const names=deck.slides.map(s=>s.name),last=names.length-1;
assert.ok(names.length>=4,'this fixture has an overview and several pages');
const press=(el,init={})=>{const e=new window.MouseEvent('click',{bubbles:true,cancelable:true,...init});el.dispatchEvent(e);return e};
const key=(el,k,init={})=>{const e=new window.KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true,...init});el.dispatchEvent(e);return e};

// ---- one page function: links, arrows, keyboard, back and forward
assert.deepEqual(shown(),['Overview']);assert.deepEqual(current(),['1 Overview']);
const link2=card.querySelector('.dc-page[data-goto="1"]'),e2=press(link2);
assert.ok(e2.defaultPrevented,'a plain press on a numbered link changes the page in place');assert.deepEqual(shown(),[names[1]]);assert.deepEqual(current(),[`2 ${names[1]}`],'aria-current follows the page');
assert.deepEqual(changes.at(-1),[1,deck.slides[1].key,true],'a press reports the page by its token and asks for a history step');
assert.match(card.querySelector('.dc-pos').textContent,new RegExp(`^${names[1]} · 2 of ${names.length}$`),'the page name stays visible in words');
press(card.querySelector(`.dc-page[data-goto="${last}"]`));assert.deepEqual(shown(),[names[last]]);assert.equal(card.querySelector('[data-step="1"]').disabled,true,'Next is off on the last page');
const n=changes.length;press(card.querySelector(`.dc-page[data-goto="${last}"]`));assert.equal(changes.length,n,'pressing the page you are on adds no history step');
press(card.querySelector('[data-step="-1"]'));assert.deepEqual(shown(),[names[last-1]]);
const newTab=press(link2,{metaKey:true});assert.ok(!newTab.defaultPrevented,'a press that asks for a new tab is left to the browser');assert.deepEqual(shown(),[names[last-1]]);
pager.go(0,{push:false});assert.deepEqual(shown(),['Overview']);assert.deepEqual(changes.at(-1),[0,'',false],'Back and Forward move the card without adding a step');
assert.ok(key(card,'ArrowRight').defaultPrevented);assert.deepEqual(shown(),[names[1]],'an arrow key on the card turns the page');
key(card,'ArrowLeft');assert.deepEqual(shown(),['Overview']);
const alt=key(card,'ArrowRight',{altKey:true});assert.ok(!alt.defaultPrevented);assert.deepEqual(shown(),['Overview'],'Alt and an arrow is left to the browser');
// arrows inside a field, a menu or a media control are not taken
for(const html of ['<textarea></textarea>','<input type="text">','<select><option>a</option></select>','<video controls></video>','<audio controls></audio>','<div role="slider" tabindex="0"></div>']){
  const box=document.createElement('div');box.innerHTML=html;card.querySelector('.fc-foot').append(box);const e=key(box.firstChild,'ArrowRight');
  assert.ok(!e.defaultPrevented,`an arrow in ${html} is not prevented`);assert.deepEqual(shown(),['Overview'],`an arrow in ${html} does not turn the page`);box.remove()}

// ---- owner menu: a real button and real links
const btn=card.querySelector('.dc-menu-btn'),list=card.querySelector('[role=menu]');
assert.equal(list.hidden,true);press(btn);assert.equal(list.hidden,false);assert.equal(btn.getAttribute('aria-expanded'),'true');
assert.equal(document.activeElement,list.querySelector('[role=menuitem]'),'opening the menu moves focus to its first entry');
key(document.activeElement,'ArrowDown');assert.equal(document.activeElement.textContent,'Choose visual');
key(document.activeElement,'ArrowRight');assert.deepEqual(shown(),['Overview'],'arrows inside the menu belong to the menu');
key(document.activeElement,'Escape');assert.equal(list.hidden,true);assert.equal(document.activeElement,btn,'Escape closes the menu and returns focus to its button');
press(btn);press(document.body);assert.equal(list.hidden,true,'a press outside closes the menu');
assert.equal(C.render(deck,{esc,mine:false,author:'a',windowLabel:'w',menu:links}).includes('Card options'),false,'a reader has no menu');

// ---- one project: the same anatomy, no selector
const one=D.compute(runs.slice(0,1),'2026-10-05',v=>v||''),oneHtml=C.render(C.slides(one,tokens,null),{esc,mine:false,author:'a',windowLabel:'w',actions:'<i>ROW</i>'});
const multiHtml=C.render(deck,{esc,mine:false,author:'a',windowLabel:'w',actions:'<i>ROW</i>'});
const anatomy=h=>{const d=new JSDOM(h).window.document,s=d.querySelector('.dc-slide:not([hidden])');return ['header.dc-head','.dc-story','.dc-facts','.dc-visual','footer.fc-foot'].map(q=>!!(q.startsWith('.dc-s')||q.startsWith('.dc-f')||q.startsWith('.dc-v')?s.querySelector(q):d.querySelector(q)))};
assert.deepEqual(anatomy(oneHtml),[true,true,true,true,true]);assert.deepEqual(anatomy(multiHtml),anatomy(oneHtml),'a one-project card and a many-project card are built from the same parts');
assert.ok(!oneHtml.includes('dc-pages'),'one page needs no selector');assert.equal(C.wire(new JSDOM(oneHtml).window.document.querySelector('#day-card')).at(),0);

// ---- Edit card: explicit save, four states, Cancel, a failed save, a warning on leaving
const slot=document.getElementById('setup'),sent=[];let answer=null;
const U='11111111-2222-4333-8444-555555555555',P='99999999-2222-4333-8444-555555555555';
let pick=null,reselected=[];
const savedBefore={v:2,title:'TEST DATA saved headline',order:[],hidden:[],facts:{whole:['projects','commits','elapsed'],project:['commits','session','runs']}};
const form=C.mountSetup({slot,model,tokens,saved:savedBefore,esc,renderOpts:{esc,author:'a',windowLabel:'w'},menu:links,readerHref:'/r',
 save:async choices=>{sent.push(JSON.parse(JSON.stringify(choices)));if(answer instanceof Error)throw answer;return answer},
 photos:(hostEl,list,selected,onPick)=>{reselected.push(selected);pick=onPick;return sel=>reselected.push(sel)}});
const state=()=>slot.querySelector('#cs-state').dataset.state,said=()=>slot.querySelector('#cs-state').textContent,save=slot.querySelector('#cs-save'),cancel=slot.querySelector('#cs-cancel'),title=slot.querySelector('#cs-title');
const leave=()=>{const e=new window.Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented};
const settle=()=>new Promise(r=>setTimeout(r,0));
assert.equal(state(),'saved');assert.equal(save.disabled,true);assert.equal(cancel.disabled,true);assert.equal(leave(),false,'nothing to lose: leaving is not questioned');
assert.equal(title.value,'TEST DATA saved headline');
title.value='TEST DATA new headline';title.dispatchEvent(new window.Event('input',{bubbles:true}));
assert.equal(state(),'unsaved');assert.equal(said(),'Unsaved changes.');assert.equal(save.disabled,false);assert.equal(leave(),true,'leaving with unsaved changes asks first');
assert.match(slot.querySelector('#cs-preview').textContent,/TEST DATA new headline/,'the preview is the real card with the unsaved choice');assert.equal(sent.length,0,'a change in the form sends nothing');
press(cancel);assert.equal(state(),'saved');assert.equal(title.value,'TEST DATA saved headline','Cancel puts the saved choices back');assert.match(slot.querySelector('#cs-preview').textContent,/TEST DATA saved headline/);assert.equal(leave(),false);
// choose a picture, say it is a photo, hold the top, lead the overview
const withPic=D.compute(runs.map((r,i)=>i?r:{...r,id:U}),'2026-10-05',v=>v||'');
pick({run:U,id:P},{role:'result'});
assert.equal(form.current().visual,'screenshot','a picked picture starts as a screenshot, shown whole: nothing guesses that it is a photo');
pick({run:U,id:P},{role:'result'});slot.querySelector('[name=cs-visual][value=photo]').checked=true;slot.querySelector('[name=cs-visual][value=photo]').dispatchEvent(new window.Event('change',{bubbles:true}));
assert.equal(form.current().visual,'photo','the author says it is a photo');assert.equal(slot.querySelector('#cs-frame').hidden,false,'and is then asked what to keep in the frame');
slot.querySelector('[name=cs-focus][value=top]').checked=true;slot.querySelector('[name=cs-focus][value=top]').dispatchEvent(new window.Event('change',{bubbles:true}));
slot.querySelector('#cs-hero').checked=true;slot.querySelector('#cs-hero').dispatchEvent(new window.Event('change',{bubbles:true}));
assert.equal(state(),'unsaved');
// a failed save keeps every choice and says so
answer='the service could not be reached';press(save);assert.equal(state(),'saving');assert.equal(save.disabled,true,'no second save while one is on its way');await settle();
assert.equal(state(),'error');assert.match(said(),/^Not saved: the service could not be reached\. Your choices are still here\. Press Save to try again\.$/);
assert.equal(form.current().focus,'top');assert.equal(save.disabled,false);assert.equal(leave(),true,'a failed save still warns on leaving');
answer=new Error('network down');press(save);await settle();assert.equal(state(),'error');assert.match(said(),/network down/,'a thrown failure is caught and shown, not lost');
// then it works
answer=null;press(save);await settle();assert.equal(state(),'saved');assert.equal(said(),'All changes saved.');assert.equal(leave(),false);
const body=sent.at(-1);assert.deepEqual(Object.keys(body).sort(),['facts','focus','hero','hidden','highlights','lead','order','photo','projectVisuals','title','v','visual'],'a save carries display choices only');
assert.ok(!JSON.stringify(body).match(/visibility|public|private|alpha|beta|gamma/),'a save names no audience and no project');
assert.deepEqual([body.v,body.visual,body.hero,body.focus,body.photo],[2,'photo',true,'top',{run:U,id:P}]);
assert.deepEqual(C.clean(body),{...body},'what is saved reads back unchanged');
// Cancel after a save goes back to the new saved state, not the first one
slot.querySelector('[name=cs-visual][value=data]').checked=true;slot.querySelector('[name=cs-visual][value=data]').dispatchEvent(new window.Event('change',{bubbles:true}));
assert.equal(state(),'unsaved');assert.equal(form.current().visual,'data');assert.equal(form.current().hero,false,'data mode cannot lead the overview with a picture');
press(cancel);assert.equal(form.current().visual,'photo');assert.deepEqual(reselected.at(-1),{run:U,id:P},'Cancel also puts the picture choice back in the picker');
// a mode with no picture never blocks a save and is stored as data
pick(null,null);slot.querySelector('[name=cs-visual][value=photo]').checked=true;slot.querySelector('[name=cs-visual][value=photo]').dispatchEvent(new window.Event('change',{bubbles:true}));
assert.match(slot.querySelector('#cs-visual-note').textContent,/Pick a picture below\. Until then the card keeps the measured trace, and nothing stops you saving\./);
press(save);await settle();assert.equal(state(),'saved');assert.equal(sent.at(-1).visual,'data');assert.equal(sent.at(-1).photo,null);
assert.match(slot.querySelector('#cs-preview').innerHTML,/data-kind="data"/);
// the picture is drawn in the preview only when its run is in the model
const pv=C.render(C.slides(withPic,tokens,body),{esc,mine:false,author:'a',windowLabel:'w'});assert.match(pv,new RegExp(`data-visual-photo="${P}"`));
// a picture on a run that is Only you: the owner is told on this screen, before a save, because the preview draws it from the owner's own view
const noteNow=()=>slot.querySelector('#cs-visual-note').textContent;
pick({run:'b1',id:P},{role:'result'});assert.notEqual(form.current().visual,'data');assert.match(noteNow(),/Its run is Only you, so readers get the measured trace instead\./,'a private picture is flagged on Edit card');
pick({run:'a1',id:P},{role:'result'});assert.ok(!/Only you/.test(noteNow()),'a picture on a public run carries no such note');
pick({run:'b1',id:P},{role:'result'});slot.querySelector('[name=cs-visual][value=data]').checked=true;slot.querySelector('[name=cs-visual][value=data]').dispatchEvent(new window.Event('change',{bubbles:true}));
assert.equal(form.current().visual,'data');assert.ok(!/Only you/.test(noteNow()),'data mode says nothing about a picture it does not draw');
press(cancel);

// ---- the rules are written down, and the names in the document exist in the styles
const doc=readFileSync(new URL('../docs/design/CARD-SYSTEM.md',import.meta.url),'utf8'),css=readFileSync(new URL('../site/design.css',import.meta.url),'utf8');
const named=[...new Set(doc.match(/--[a-z]+(?:-[a-z]+)+/g)||[])];assert.ok(named.length>=8,'the document names the tokens');
const tokensAt=css.indexOf(':root{',css.indexOf('/* CARD SYSTEM tokens.')),rootBlock=css.slice(tokensAt,css.indexOf('}',tokensAt));assert.ok(tokensAt>0);
for(const t of named)assert.ok(rootBlock.includes(t+':'),`${t} is named in CARD-SYSTEM.md and must be defined in the CARD SYSTEM :root block of site/design.css`);
for(const cls of [...new Set(doc.match(/`\.(dc|fc|cs|pc)-[a-z-]+`/g)||[])].map(c=>c.slice(1,-1)))assert.ok(css.includes(cls)||readFileSync(new URL('../site/feed.css',import.meta.url),'utf8').includes(cls),`${cls} is named in CARD-SYSTEM.md and must exist in the styles`);
assert.match(readFileSync(new URL('../AGENTS.md',import.meta.url),'utf8'),/docs\/design\/CARD-SYSTEM\.md/,'AGENTS.md sends the next agent to the rules');
// The page that saves display choices writes the profile and nothing else.
const index=readFileSync(new URL('../site/index.html',import.meta.url),'utf8'),saveFn=index.slice(index.indexOf('save:async choices=>'),index.indexOf('return;}',index.indexOf('save:async choices=>')));
assert.match(saveFn,/sb\.rpc\('save_day_card'/);assert.ok(!/from\('runs'\)|visibility/.test(saveFn),'saving display choices never touches a run or its audience');
console.log('PASS: one page function for links, arrows, keys and history; keys left alone in fields, menus and media; owner menu; same anatomy for one and many projects; save states, Cancel, failed save, leave warning; rules documented and bound to the styles');

// Each project owns its choice; merely changing the page selector does not edit the card.
const target=slot.querySelector('#cs-visual-target');
const beforePage=form.current();
target.value=tokens.get('alpha');target.dispatchEvent(new window.Event('change',{bubbles:true}));
assert.deepEqual(form.current(),beforePage);
pick({run:U,id:P},{role:'result'});
assert.equal(slot.querySelector('#cs-default').disabled,false,'new choice can immediately be reset');
const alphaChoice=JSON.parse(JSON.stringify(form.current().projectVisuals[tokens.get('alpha')]));
target.value=tokens.get('beta');target.dispatchEvent(new window.Event('change',{bubbles:true}));
assert.equal(form.current().projectVisuals[tokens.get('beta')],undefined);
pick({run:'22222222-2222-4333-8444-555555555555',id:P},{role:'personal'});
assert.deepEqual(JSON.parse(JSON.stringify(form.current().projectVisuals[tokens.get('alpha')])),alphaChoice);
target.value=tokens.get('alpha');target.dispatchEvent(new window.Event('change',{bubbles:true}));
assert.equal(slot.querySelector('[name=cs-visual][value=screenshot]').checked,true);
press(save);await settle();assert.equal(state(),'saved');
press(cancel);assert.equal(state(),'saved');

// Use default removes the override, and choosing Photo alone does not replace an inherited cover with Data.
target.value=tokens.get('alpha');target.dispatchEvent(new window.Event('change',{bubbles:true}));
press(slot.querySelector('#cs-default'));
assert.equal(form.current().projectVisuals[tokens.get('alpha')],undefined);
slot.querySelector('[name=cs-visual][value=photo]').checked=true;
slot.querySelector('[name=cs-visual][value=photo]').dispatchEvent(new window.Event('change',{bubbles:true}));
assert.equal(form.current().projectVisuals[tokens.get('alpha')],undefined);

// The chapter labels, not anonymous numbers, tell a reader what they will open.
assert.deepEqual([...card.querySelectorAll('.dc-page')].map(a=>a.textContent),names);
const chapterIndex=card.querySelector('.dc-chapters');chapterIndex.open=true;
press(card.querySelector('.dc-page[data-goto="1"]'));
assert.equal(chapterIndex.open,false,'choosing a chapter closes the index');
const chapter=card.querySelector('.dc-slide[data-slide="1"]');
assert.equal(chapter.querySelector('.dc-project-name').textContent,names[1]);
assert.equal(chapter.querySelector('.dc-measured').open,false,'metrics do not displace the story');
assert.ok(chapter.querySelector('.dc-visual').compareDocumentPosition(chapter.querySelector('.dc-measured')) & window.Node.DOCUMENT_POSITION_FOLLOWING,'the visual precedes measured details');
assert.ok(card.querySelectorAll('.dc-chapter-list a').length>=3,'overview gives direct project chapter links');
