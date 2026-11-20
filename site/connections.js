/* Owner-only active upload grants; agent labels are not provider identity verification. */
(function(root){
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const time=v=>v?Date.parse(v):NaN;
 const active=(row,now=Date.now())=>row.revoked!==true&&(!row.expires_at||time(row.expires_at)>now);
 // 1 Nov: owner labels like "claude laptop + codex" name more than one agent; the header shows each.
 const AGENTS=[['Claude Code','anthropic',/\bclaude(?:[ -]code)?\b/i],['Codex','openai',/\bcodex\b/i],['Cursor','cursor',/\bcursor\b/i],['Grok','x',/\bgrok(?:[ -]bot)?\b/i]];
 const named=label=>{const hits=AGENTS.filter(x=>x[2].test(String(label||'')));return hits.length?hits.map(x=>({name:x[0],maker:x[1]})):[{name:'Unknown agent',maker:null}];};
 function identity(label){
  const names=AGENTS.filter(x=>x[2].test(String(label||'')));
  return names.length===1?{name:names[0][0],maker:names[0][1]}:{name:'Unknown agent',maker:null};
 }
 const GENERIC='<svg class="agent-logo" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="12" r="1.5" fill="currentColor"/><circle cx="15" cy="12" r="1.5" fill="currentColor"/></svg>';
 const mark=agent=>agent.maker?root.StriveAgents.markSvg(agent.maker,{size:22}):GENERIC;
 const date=v=>Number.isFinite(time(v))?new Date(v).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}):'not recorded';
 function header(rows,now=Date.now()){
  // Active owner-labelled harnesses only. Repeated grants share one mark; unknown names stay neutral.
  const all=[...new Map(rows.filter(r=>active(r,now)).flatMap(r=>named(r.label)).map(i=>[i.name,i])).values()];
  if(!all.length)return null;
  const agents=[...all.filter(i=>i.maker),...all.filter(i=>!i.maker)];
  const names=agents.map(i=>i.name).join(', ');
  return {label:'Open your active connections',title:names,html:'Connections'};
 }
 function card(row,{now=Date.now(),revoke=false}={}){
  const live=active(row,now),i=identity(row.label),status=row.revoked===true?'Revoked':live?'Active':'Expired';
  const start=time(row.created_at),end=time(row.expires_at),valid=Number.isFinite(start)&&Number.isFinite(end)&&end>start;
  const remaining=valid?Math.max(0,Math.min(100,100*(end-now)/(end-start))):null;
  return `<li class="connection-card connect-token${live?'':' is-revoked'}" data-active="${live}"><div class="connection-top"><span class="connection-mark" aria-hidden="true">${mark(i)}</span><div class="connection-identity"><strong>${esc(row.label||'Upload key')}</strong><span>${row.token_prefix?esc(row.token_prefix)+'…':''}</span></div><span class="connection-status">${status}</span></div><div class="connection-expiry"><span>${row.expires_at?'Expires '+esc(date(row.expires_at)):'Expiry not recorded'}</span>${remaining===null?'':`<progress max="100" value="${remaining.toFixed(2)}" aria-label="Upload key lifetime remaining"></progress>`}</div>${revoke&&live?`<button type="button" class="act ghost" aria-label="Revoke ${esc(row.label||'Upload key')}${row.token_prefix?' ('+esc(row.token_prefix)+'…)':''}" data-revoke="${esc(row.id)}">Revoke</button>`:''}</li>`;
 }
 function cards(rows,opts={}){
  const now=opts.now??Date.now(),live=rows.filter(r=>active(r,now)),ended=rows.filter(r=>!active(r,now));
  return ((live.length||ended.length)?'<p class="connection-upload">Last upload: not recorded per key.</p>':'')+(live.length?`<ul class="connection-grid connect-tokens" aria-label="Active upload keys">${live.map(r=>card(r,{...opts,now})).join('')}</ul>`:'')+(ended.length?`<details class="connection-ended"><summary>${ended.length} revoked or expired key${ended.length===1?'':'s'}</summary><ul class="connection-grid connect-tokens">${ended.map(r=>card(r,{...opts,now})).join('')}</ul></details>`:'');
 }
 root.StriveConnections={active,identity,header,cards};
})(typeof window==='object'?window:globalThis);
