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
 if(r.mine)act=`<button type="button" class="act" data-withdraw="${esc(r.id)}">Withdraw</button><span class="meta">Your request. You cannot vote for it.</span>`;
 else if(r.my_vote)act=`<button type="button" class="act on" data-unvote="${esc(r.id)}" aria-pressed="true">${r.my_vote==='agent'?'Your agent asked':'You asked'} · undo</button>`;
 else if(!closed)act=`<button type="button" class="act blue" data-vote="${esc(r.id)}">I need this too</button>`;
 return `<article class="card pad feature-request" data-id="${esc(r.id)}"><p class="meta"><span class="state-chip state-${esc(r.state)}">${esc(STATES[r.state]||r.state)}</span> ${author}</p>
  <h3>${esc(r.title)}</h3><p>${esc(r.body)}</p>${r.state_note?`<p class="meta">Note from STRIVE: ${esc(r.state_note)}</p>`:''}
  <p class="meta">${ev?'Evidence: '+ev:'No evidence attached'}</p>
  <p class="vote-counts"><span class="count-chip">${people} ${people===1?'person':'people'} asked</span>${agents?`<span class="count-chip agent" title="Votes cast by agents for their owners. They do not rank requests.">${agents} agent ${agents===1?'vote':'votes'}</span>`:''}</p>
  <div class="account-actions">${act}</div></article>`;
}
function StriveRequests({client,me,slot,signIn=()=>{},status=()=>{}}){
 let requestId=root.crypto?.randomUUID?root.crypto.randomUUID():String(Date.now());
 slot.innerHTML=`<section class="feature-requests" aria-labelledby="fr-title"><h2 id="fr-title">Feature requests</h2>
  <p>Ask for a change in public, or add your name to one that is already here. The list is ranked by how many people asked: that shows demand, not quality. Agent votes are shown apart and do not rank.</p>
  <details class="fr-ask"><summary>Ask for a change</summary><form id="fr-form" class="panel reply-form"><label>What should change?<input name="title" required minlength="4" maxlength="120" placeholder="A short title"></label>
  <label>Why, and for whom?<textarea name="body" required maxlength="2000" rows="3" placeholder="What are you trying to do, and what gets in the way?"></textarea></label>
  <label>Evidence (optional)<textarea name="evidence" rows="2" maxlength="5000" placeholder="https://link Label, one per line, up to five"></textarea></label>
  <p class="hint">Visible to everyone, posted as you. You can withdraw it later.</p><button>Post request</button><p id="fr-state" class="account-state" role="status" aria-live="polite"></p></form></details>
  <label class="fr-filter">Show<select id="fr-filter" aria-label="Show requests"><option value="">All</option>${Object.entries(STATES).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>
  <div id="fr-list" aria-live="polite"><p>Loading…</p></div></section>`;
 const form=slot.querySelector('#fr-form'),list=slot.querySelector('#fr-list'),filter=slot.querySelector('#fr-filter'),state=slot.querySelector('#fr-state');
 form.addEventListener('input',()=>{requestId=root.crypto.randomUUID()});
 async function load(){
  const {data,error}=await client.rpc('feature_request_board',{p_state:filter.value||null,p_limit:50,p_offset:0});
  if(error){list.innerHTML=missing(error)?'<p>Feature requests are not available yet. Nothing here is saved.</p>':'<p>Requests could not load. Reload to try again.</p>';return false}
  list.innerHTML=(data||[]).length?data.map(card).join(''):'<p>No requests yet. Be the first to ask.</p>';return true;
 }
 async function run(fn){try{const {error}=await fn();if(error)throw error;await load()}catch(e){status(missing(e)?'Feature requests are not available yet.':(e.message||'That did not work.'),true)}}
 list.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(!me()){signIn();return}
  if(b.dataset.vote)run(()=>client.rpc('vote_feature_request',{p_request_id:b.dataset.vote}));
  else if(b.dataset.unvote)run(()=>client.from('feature_votes').delete().eq('request_id',b.dataset.unvote));
  else if(b.dataset.withdraw&&root.confirm('Withdraw this request? Its votes go with it.'))run(()=>client.from('feature_requests').delete().eq('id',b.dataset.withdraw));
 });
 filter.onchange=load;
 form.onsubmit=async e=>{e.preventDefault();if(!me()){signIn();return}
  let evidence;try{evidence=parseEvidence(form.elements.evidence.value)}catch(err){state.textContent=err.message;return}
  const btn=form.querySelector('button');btn.disabled=true;state.textContent='Posting…';
  try{const {data,error}=await client.rpc('create_feature_request',{p_request_id:requestId,p_title:form.elements.title.value,p_body:form.elements.body.value,p_evidence:evidence});
   if(error)throw error;if(!data?.id)throw Error('Not saved');
   form.reset();requestId=root.crypto.randomUUID();state.textContent=data.existing?'Already posted.':'Posted. It is public now.';await load();
  }catch(err){state.textContent=missing(err)?'Feature requests are not available yet. Nothing was posted.':(err.message||'Not posted. Try again.')}
  finally{btn.disabled=false}};
 return load();
}
const api={StriveRequests,parseEvidence,card,missing};
root.StriveRequests=StriveRequests;root.StriveRequestsKit=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
