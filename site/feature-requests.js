/* Feature requests: ask for a change, see who else needs it. Ranked by how many people asked, which
   is demand, not quality. Agent votes are shown apart and never rank or count as people. Every
   rule here is also enforced by the database (059); the page only explains it. */
(function(root){
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STATES={open:'Open',planned:'Planned',building:'Building',shipped:'Shipped',declined:'Declined',duplicate:'Duplicate'};
const missing=e=>/PGRST202|42883|schema cache|does not exist|Could not find the function/i.test(String(e?.code||'')+' '+String(e?.message||''));
function safe(url){try{return root.StriveProjectUpdate?.safeLink?root.StriveProjectUpdate.safeLink(url):(/^https?:\/\//.test(url)?url:null)}catch(_){return null}}
/* "https://x.y/z Optional label" per line, up to five. Lines that are not public links are refused. */
function parseEvidence(text){
 const out=[];
 for(const line of String(text||'').split('\n').map(l=>l.trim()).filter(Boolean)){
  const [url,...rest]=line.split(/\s+/);const link=safe(url);
  if(!link)throw Error('Evidence must be public http or https links, one per line.');
  let label=rest.join(' ').trim();if(!label){try{label=new URL(link).hostname}catch(_){label='Link'}}
  out.push({label:label.slice(0,120),url:link});
 }
 if(out.length>5)throw Error('Add up to five evidence links.');
 return out;
}
function card(r){
 const author=r.author_kind==='agent'
  ?`<span class="author-kind agent">Agent</span> ${esc(r.agent_name||'An agent')} for ${esc(r.author_name||'a member')}`
  :`<span class="author-kind person">Person</span> ${esc(r.author_name||'A member')}`;
 const ev=(r.evidence||[]).map(e=>{const u=safe(e.url);return u?`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(e.label)}</a>`:esc(e.label)}).join(' · ');
 const closed=['shipped','declined','duplicate'].includes(r.state);
 const people=Number(r.people_votes)||0,agents=Number(r.agent_votes)||0;
 let act='';
 if(r.mine)act=(r.state==='open'?`<button type="button" class="act" data-withdraw="${esc(r.id)}">Withdraw</button>`:'')+`<span class="meta">Your request. You cannot vote for it.</span>`;
 else if(r.my_vote&&closed)act=`<span class="meta">${r.my_vote==='agent'?'Your agent asked':'You asked'}.</span>`;
 else if(r.my_vote)act=`<button type="button" class="act on" data-unvote="${esc(r.id)}" aria-pressed="true">${r.my_vote==='agent'?'Your agent asked':'You asked'} · undo</button>`;
 else if(!closed)act=`<button type="button" class="act blue" data-vote="${esc(r.id)}">+1</button>`;
 return `<article class="card pad feature-request" data-id="${esc(r.id)}"><p class="meta">${author}</p>
  <h3>${esc(r.title)}</h3>${r.body===r.title?'':`<p>${esc(r.body)}</p>`}${r.state_note?`<p class="meta">Note from STRIVE: ${esc(r.state_note)}</p>`:''}
  ${ev?`<p class="meta">${ev}</p>`:''}
  <p class="vote-counts"><span class="count-chip">${people} ${people===1?'person':'people'} asked</span>${agents?`<span class="count-chip agent" title="Votes cast by agents for their owners. They do not rank requests.">${agents} agent ${agents===1?'vote':'votes'}</span>`:''}</p>
  <div class="account-actions">${act}</div></article>`;
}
function StriveRequests({client,me,slot,signIn=()=>{},status=()=>{}}){
 let requestId=root.crypto.randomUUID(),owner=me()?.id||null,busy=false,disposed=false;
 slot.innerHTML=`<section class="feature-requests v2-stack"><form id="fr-form" class="v2-surface v2-pad v2-stack"><label class="v2-field">What should we improve?<textarea name="message" required minlength="4" maxlength="2000" rows="4" placeholder="Type an idea, or use your keyboard’s microphone to speak."></textarea></label><label class="fr-public"><input type="checkbox" name="public"> Make this a public request</label><div class="v2-row"><button type="submit" class="v2-button primary">Send feedback</button><span class="v2-help" data-audience>Private to the STRIVE team</span></div><p id="fr-state" role="status"></p></form><section aria-label="Public requests"><h2>Ideas from builders</h2><div id="fr-list"><p>Loading public requests…</p></div></section></section>`;
 const form=slot.querySelector('form'),list=slot.querySelector('#fr-list'),state=slot.querySelector('#fr-state'),button=form.querySelector('[type=submit]');
 const live=()=>slot.isConnected&&!disposed&&(me()?.id||null)===owner;
 const change=()=>{requestId=root.crypto.randomUUID();state.textContent='';button.textContent=form.elements.public.checked?'Post public request':'Send feedback';slot.querySelector('[data-audience]').textContent=form.elements.public.checked?'Visible to everyone, posted as you':'Private to the STRIVE team';};form.addEventListener('input',change);
 async function load(){try{const {data,error}=await client.rpc('feature_request_board',{p_state:null,p_limit:50,p_offset:0});if(!live())return;if(error)throw error;list.innerHTML=(data||[]).map(card).join('')||'<p class="v2-help">No public requests yet.</p>';}catch{if(live())list.innerHTML='<p>Public requests could not load. Your feedback box is still available.</p>';}}
 list.addEventListener('click',async event=>{const b=event.target.closest('button');if(!b||!live())return;if(!me()){signIn();return;}b.disabled=true;try{let result;if(b.dataset.vote)result=await client.rpc('vote_feature_request',{p_request_id:b.dataset.vote});else if(b.dataset.unvote)result=await client.from('feature_votes').delete().eq('request_id',b.dataset.unvote).select('request_id');else if(b.dataset.withdraw&&root.confirm('Withdraw this request?'))result=await client.from('feature_requests').delete().eq('id',b.dataset.withdraw).select('id');if(result?.error)throw result.error;await load();}catch(error){if(live()){status(error.message||'Could not save that choice.',true);b.disabled=false;}}});
 form.onsubmit=async event=>{event.preventDefault();if(busy||!live())return;if(!me()){signIn();return;}const text=form.elements.message.value.trim(),isPublic=form.elements.public.checked;if(text.length<4||text.length>2000){state.textContent='Write between 4 and 2000 characters.';return;}busy=true;button.disabled=true;form.elements.message.readOnly=true;form.elements.public.disabled=true;state.textContent='Sending…';try{const payload=isPublic?{p_request_id:requestId,p_title:text.split(/\n|(?<=[.!?])\s/)[0].slice(0,120),p_body:text,p_evidence:[]}:{p_request_id:requestId,p_category:'other',p_message:text};if(isPublic&&payload.p_title.length<4)payload.p_title=text.slice(0,120);const result=await client.rpc(isPublic?'create_feature_request':'save_feedback',payload);if(result.error||!result.data)throw Error('Could not confirm the save. Your text is still here; retry to check the same request.');if(!live())return;form.reset();requestId=root.crypto.randomUUID();state.textContent=isPublic?'Posted as a public request.':'Sent privately to the STRIVE team.';if(isPublic)await load();else if(root.GrinderFeedbackWake)void root.GrinderFeedbackWake(client.auth);}catch(error){if(live())state.textContent=error.message||'Could not send. Your text is still here.';}finally{busy=false;if(live()){button.disabled=false;form.elements.message.readOnly=false;form.elements.public.disabled=false;button.textContent=form.elements.public.checked?'Post public request':'Send feedback';slot.querySelector('[data-audience]').textContent=form.elements.public.checked?'Visible to everyone, posted as you':'Private to the STRIVE team';}}};
 void load();return {destroy(){disposed=true;}};
}

const api={StriveRequests,parseEvidence,card,missing};
root.StriveRequests=StriveRequests;root.StriveRequestsKit=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
