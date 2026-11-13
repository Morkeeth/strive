/* Who can see this: one vocabulary and one control for every place an audience is shown or set.
 * Four audiences, widest first: Everyone (public), Followers (link), Close friends, Only me (private).
 * The mark is a dot with rings: more rings, more people. It carries the audience, never decoration.
 * Presentation only. Saving still goes through StriveRunVisibility.save and the database rules. */
(function(root){
'use strict';
const ORDER=['public','link','close_friends','private'];
const LABEL={public:'Everyone',link:'Followers',close_friends:'Close friends',private:'Only me'};
const DESC={
 public:'Anyone. Shows on your profile and in the Feed.',
 link:'People who follow you, and your close friends. Not on your profile or in the Feed.',
 close_friends:'Only the people on your Close friends list.',
 private:'Just you. Nobody else can open it.'
};
const SAVE={public:'Show to everyone',link:'Share with followers',close_friends:'Share with close friends',private:'Keep to only me'};
const RINGS={private:0,close_friends:1,link:2,public:3};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
// Anonymous is stored as private for reading purposes; anything unknown reads as the narrowest case.
const norm=v=>v==='anonymous'?'private':ORDER.includes(v)?v:'private';
const label=v=>LABEL[norm(v)];
function mark(v){
 // Only the rings that apply are drawn, so the count reads at 18px: none, one, two or three.
 const n=RINGS[norm(v)];
 return `<svg class="aud-mark" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="${n?2.4:3.2}" fill="currentColor"/>${[4.9,7.2,9.3].slice(0,n).map(r=>`<circle cx="10" cy="10" r="${r}" fill="none" stroke="currentColor" stroke-width="1.5"/>`).join('')}</svg>`;
}
// The owner's pill opens the picker; anyone else gets a read-only label.
function pill(v,{href=null,owner=false,shared=false,crew=false}={}){
 // A crew share is stored as private with crew_shared; it must never read as Only me.
 const a=crew||v==='crew'?'close_friends':norm(v),word=crew||v==='crew'?'Crew members':LABEL[a],text=word;
 const inner=`${mark(a)}<span class="aud-label">${esc(text)}</span>${owner?'<span class="aud-change">Change</span>':''}`;
 const cls=`aud-pill aud-${a.replace('_','-')}`;
 const title=owner?` aria-label="Who can see this: ${esc(word)}. Change"`:` aria-label="${shared?'Shared with you. ':''}Who can see this: ${esc(word)}"`;
 return owner&&href?`<a class="${cls}" href="${esc(href)}" data-audience-pill="${a}"${title}>${inner}</a>`:`<span class="${cls}" data-audience-pill="${a}"${title}>${inner}</span>`;
}
function countText(a,counts){
 if(!counts)return '';
 if(a==='link'&&Number.isFinite(counts.followers))return counts.followers===1?'1 follower':counts.followers+' followers';
 if(a==='close_friends'&&Number.isFinite(counts.closeFriends))return counts.closeFriends===1?'1 person':counts.closeFriends+' people';
 return '';
}
function options(current,{counts=null,name='audience'}={}){
 const c=norm(current);
 return `<div class="aud-options" role="radiogroup" aria-label="Who can see this">${ORDER.map(a=>{const n=countText(a,counts);const empty=a==='close_friends'&&counts&&counts.closeFriends===0;
  return `<label class="aud-option aud-${a.replace('_','-')}"><input type="radio" name="${esc(name)}" value="${a}"${a===c?' checked':''}>${mark(a)}<span class="aud-option-text"><strong>${LABEL[a]}</strong><span>${esc(DESC[a])}</span>${n?`<em>${esc(n)}</em>`:''}${empty?'<a class="aud-empty" href="/?friends">Your list is empty. Add people first.</a>':''}</span></label>`}).join('')}</div>`;
}
// Follower and Close friends counts for the signed-in owner. Unknown stays unknown (null), never 0.
async function counts(client,profileId){
 const out={followers:null,closeFriends:null};
 if(!client||!profileId)return out;
 try{const r=await client.from('grinder_follows').select('follower_id',{count:'exact',head:true}).eq('followed_id',profileId);if(!r.error&&Number.isFinite(r.count))out.followers=r.count;}catch(_){}
 try{const r=await client.from('close_friends').select('friend_profile_id',{count:'exact',head:true}).eq('owner_profile_id',profileId);if(!r.error&&Number.isFinite(r.count))out.closeFriends=r.count;}catch(_){}
 return out;
}
// The one picker. onSave(audience) must persist (or set a form value) and throw a readable error to keep the dialog open.
function open({current,counts:known=null,title='Who can see this?',onSave,saveLabel=a=>SAVE[a]}){
 document.getElementById('audience-dialog')?.remove();
 const dialog=document.createElement('dialog');dialog.id='audience-dialog';dialog.className='aud-dialog';
 dialog.innerHTML=`<form method="dialog"><h2>${esc(title)}</h2>${options(current,{counts:known})}<p class="aud-state" role="status" aria-live="polite"></p><div class="aud-actions"><button type="submit" class="aud-save" value="save"></button><button type="button" class="ghost aud-cancel">Cancel</button></div></form>`;
 document.body.append(dialog);
 const form=dialog.querySelector('form'),save=dialog.querySelector('.aud-save'),state=dialog.querySelector('.aud-state');
 const chosen=()=>form.querySelector('input[name=audience]:checked')?.value||norm(current);
 const paint=()=>{save.textContent=chosen()===norm(current)?'Keep '+LABEL[chosen()]:saveLabel(chosen());};
 form.addEventListener('change',paint);paint();
 dialog.querySelector('.aud-cancel').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 form.addEventListener('submit',async event=>{event.preventDefault();const a=chosen();if(a===norm(current)){dialog.close();return;}
  save.disabled=true;form.querySelectorAll('input').forEach(i=>i.disabled=true);state.textContent='Saving…';
  try{await onSave(a);dialog.close();}catch(error){state.textContent=error?.message||'Not saved. Try again.';save.disabled=false;form.querySelectorAll('input').forEach(i=>i.disabled=false);}
 });
 if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
 form.querySelector('input:checked')?.focus();
 return dialog;
}
// Owner-only summary for the profile: which audiences are hidden from visitors, and how many people are in each circle.
async function ownerRunCounts(client,profileId){
 // Head counts per audience: exact at any size, no rows transferred. A crew share is not Only me.
 const count=async apply=>{const r=await apply(client.from('runs').select('id',{count:'exact',head:true}).eq('profile_id',profileId));if(r.error||!Number.isFinite(r.count))throw r.error||Error('count');return r.count;};
 try{
  const [pub,link,cf,priv,crew]=await Promise.all([count(q=>q.eq('visibility','public')),count(q=>q.eq('visibility','link')),count(q=>q.eq('visibility','close_friends')),count(q=>q.in('visibility',['private','anonymous'])),count(q=>q.in('visibility',['private','anonymous']).eq('crew_shared',true))]);
  return {public:pub,link,close_friends:cf,private:Math.max(0,priv-crew),crew};
 }catch(_){return null;}
}
function profileStrip(runCounts,people,{handle}){
 // Who sees this page: everyone sees Everyone updates; listed close friends also see Close friends updates.
 // Followers and Only me updates never appear on a profile.
 const never=runCounts?runCounts.link+runCounts.private+(runCounts.crew||0):null;
 const lead='Visitors see your Everyone updates. Your close friends also see Close friends updates.'+(never?` ${never} more never show here.`:'');
 const chip=a=>`<a class="aud-count aud-${a.replace('_','-')}" href="/?mine">${mark(a)}<span>${LABEL[a]}</span><strong>${runCounts?runCounts[a]:'–'}</strong></a>`;
 const followers=Number.isFinite(people?.followers)?people.followers:null,friends=Number.isFinite(people?.closeFriends)?people.closeFriends:null;
 return `<section class="aud-profile" id="profile-privacy" aria-labelledby="profile-privacy-title"><div class="aud-profile-head"><h2 id="profile-privacy-title">Who sees what</h2><a href="/?account#privacy">Privacy settings</a></div><p class="aud-profile-lead">${esc(lead)}</p><div class="aud-profile-row">${ORDER.map(chip).join('')}</div><p class="aud-profile-people"><a href="/?account#privacy">${followers===null?'Followers':followers===1?'1 follower':followers+' followers'}</a><span aria-hidden="true"> · </span><a href="/?friends">${friends===null?'Close friends list':`Close friends: ${friends}`}</a><span aria-hidden="true"> · </span><a href="/?u=${encodeURIComponent(handle)}&amp;preview=public">See it as a visitor</a></p></section>`;
}
// Settings: one map of every privacy control, with the current state.
async function mountSettings({client,slot,profile,isCurrent=()=>true}){
 if(!slot||!profile)return;
 const handle=profile.handle||profile.github_handle||'';
 slot.innerHTML=`<h2 id="account-privacy-title">Privacy</h2><p>You choose who can see each update when you post it. Change it any time with the audience button on the update.</p><div class="aud-settings-actions"><a class="v2-button" href="/?friends">Edit Close friends</a><a class="v2-button" href="/?u=${encodeURIComponent(handle)}&amp;preview=public">See it as a visitor</a></div><ul class="aud-legend">${ORDER.map(a=>`<li>${mark(a)}<span><strong>${LABEL[a]}</strong> ${esc(DESC[a])}</span></li>`).join('')}</ul><div class="aud-settings-people"><div><h3>Followers</h3><p id="privacy-followers" role="status">Loading…</p></div><div><h3>Close friends</h3><p id="privacy-friends" role="status">Loading…</p></div><div><h3>Your profile</h3><p>Visitors see your Everyone updates. Your close friends also see Close friends updates.</p></div></div>`;
 const c=await counts(client,profile.id);if(!isCurrent())return;
 const fEl=slot.querySelector('#privacy-followers'),cEl=slot.querySelector('#privacy-friends');
 cEl.textContent=c.closeFriends===null?'Could not load your list. Reload to try again.':c.closeFriends===0?'Nobody yet. Only you can see this list.':`${c.closeFriends} ${c.closeFriends===1?'person':'people'}. Only you can see this list.`;
 if(c.followers===null){fEl.textContent='Could not load your followers. Reload to try again.';return;}
 if(c.followers===0){fEl.textContent='Nobody follows you yet. Followers can open updates you share with Followers.';return;}
 fEl.textContent=`${c.followers} ${c.followers===1?'person follows':'people follow'} you. They can open updates you share with Followers.`;
 try{
  const {data:rows,error}=await client.from('grinder_follows').select('follower_id').eq('followed_id',profile.id).limit(50);
  if(error||!rows?.length||!isCurrent())return;
  const {data:people}=await client.from('profiles').select('id,handle,github_handle,display_name,name').in('id',rows.map(r=>r.follower_id));
  if(!isCurrent()||!people?.length)return;
  const list=document.createElement('ul');list.className='aud-followers';
  list.innerHTML=people.map(p=>{const h=p.handle||p.github_handle||'';return `<li><a href="/?u=${encodeURIComponent(h)}">${esc(p.display_name||p.name||h)}</a> <span class="meta">@${esc(h)}</span></li>`}).join('');
  fEl.after(list);
 }catch(_){}
}
const api={ORDER,LABEL,DESC,norm,label,mark,pill,options,counts,open,ownerRunCounts,profileStrip,mountSettings};
root.StriveAudience=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
