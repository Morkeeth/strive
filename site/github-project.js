/* Repository metadata and logos. A linked repository is not proof of ownership or measured work. */
(function(root){
'use strict';
const part=/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})$/;
function repository(value){
 const text=String(value||'').trim();let path=text;
 if(/^https?:/i.test(text)){
  let u;try{u=new URL(text)}catch(_){throw Error('Use a GitHub repository URL or owner/repository.');}
  if(u.protocol!=='https:'||u.hostname!=='github.com'||u.username||u.password||u.port||u.search||u.hash)throw Error('Use an https://github.com/owner/repository link.');
  path=u.pathname.replace(/^\/|\/$/g,'');
 }
 const parts=path.split('/');if(parts.length!==2||!parts.every(x=>part.test(x))||parts.some(x=>x==='.'||x==='..'))throw Error('Use a GitHub repository URL or owner/repository.');
 parts[1]=parts[1].replace(/\.git$/,'');if(!parts[1])throw Error('Add the repository name.');
 return{owner:parts[0],name:parts[1],fullName:parts.join('/'),url:'https://github.com/'+parts.join('/')};
}
// GitHub documents gho_/ghu_ as OAuth/user token prefixes; never forward another provider's bearer.
function access(session){const token=session?.provider_token;return typeof token==='string'&&/^gh[ou]_[A-Za-z0-9_]+$/.test(token)&&token.length<=4096?token:null;}
function logo(url){try{const r=repository(url);return'https://github.com/'+encodeURIComponent(r.owner)+'.png?size=64';}catch(_){return null;}}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function badge(url,{preview=false}={}){
 let r;try{r=repository(url)}catch(_){return'';}
 const inner=`<span aria-hidden="true">↗</span><span>${esc(r.fullName)}</span>`;
 return preview?`<span class="github-project-link" data-github-project>${inner}</span>`:`<a class="github-project-link" data-github-project href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
}
function form(){return `<section class="github-project-import" aria-labelledby="gh-import-title"><h3 id="gh-import-title">Import from GitHub</h3><label>Repository URL or owner/repository<input id="gh-repository" maxlength="240" placeholder="owner/repository" autocomplete="off"></label><button class="act" id="gh-import" type="button">Load project</button><p class="hint">Loads public repository details. Private repositories need existing GitHub access.</p><button class="ghost" id="gh-signin" type="button" hidden>Sign in with GitHub</button><p id="gh-import-status" role="status" aria-live="polite"></p><div id="gh-import-result" hidden></div><input type="hidden" id="f_repo_url" value=""></section>`;}
function wire({slot,load,onChange=()=>{},account=()=>null,onSignIn=()=>{}}){
 if(!slot)return()=>{};
 const input=slot.querySelector('#gh-repository'),button=slot.querySelector('#gh-import'),state=slot.querySelector('#gh-import-status'),result=slot.querySelector('#gh-import-result'),repo=slot.querySelector('#f_repo_url');
 let generation=0,disposed=false;
 const signIn=slot.querySelector('#gh-signin');
 signIn.onclick=()=>onSignIn();
 input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();if(!button.disabled)button.click();}});
 const clear=()=>{generation++;button.disabled=false;signIn.hidden=true;repo.value='';result.hidden=true;result.replaceChildren();state.textContent='';onChange();};
 input.addEventListener('input',clear);
 button.onclick=async()=>{
  const turn=++generation,owner=account(),live=()=>!disposed&&turn===generation&&account()===owner&&slot.isConnected;
  let r;try{r=repository(input.value)}catch(e){state.textContent=e.message;return;}
  repo.value='';result.hidden=true;signIn.hidden=true;onChange();button.disabled=true;state.textContent='Loading repository…';
  try{
   const data=await load(r.fullName);if(!live())return;
   const linked=repository(data.repository);repo.value=linked.url;
   for(const [id,value] of [['f_title',data.name],['f_project',data.name],['f_problem',String(data.description||'').slice(0,280)],['f_output_url',data.homepage||linked.url]]){
    const el=slot.closest('#manualbox')?.querySelector('#'+id);if(el&&!el.value.trim()&&value)el.value=String(value);
   }
   result.innerHTML=badge(linked.url,{preview:true})+`<p class="hint">${data.private?'Private repository. Will save as Only me.':'Repository details from GitHub.'} Review the text before saving. Sharing this post can reveal the repository name, logo and text even when the repository is private.</p><button class="ghost" type="button" data-gh-remove>Remove repository link</button>`;result.hidden=false;
   result.querySelector('[data-gh-remove]').onclick=()=>{input.value='';clear();};
   state.textContent='Project loaded. Review it, then save privately.';onChange();
  }catch(e){if(live()){repo.value='';result.hidden=true;state.textContent=e.message||'GitHub could not load this repository. Your manual text is kept.';signIn.hidden=!['sign_in_required','github_access_expired','github_link_required','github_account_mismatch','invalid_access','repository_unavailable','github_permission_required'].includes(e.code);onChange();}}
  finally{if(!disposed&&turn===generation)button.disabled=false;}
 };
 if(repo.value){try{const r=repository(repo.value);input.value=r.fullName;result.innerHTML=badge(r.url,{preview:true})+'<p class="hint">Sharing this post can reveal the repository name, logo and text even when the repository is private.</p><button class="ghost" type="button" data-gh-remove>Remove repository link</button>';result.hidden=false;result.querySelector('[data-gh-remove]').onclick=()=>{input.value='';clear();};}catch(_){repo.value='';}}
 return()=>{disposed=true;generation++;};
}
root.document?.addEventListener('error',event=>{if(event.target?.classList?.contains('gh-owner-logo'))event.target.hidden=true;},true);
const api={repository,access,logo,badge,form,wire};root.StriveGitHubProject=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
