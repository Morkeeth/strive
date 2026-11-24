/* The post journey. This module arranges existing inputs; the importer owns all saves. */
(function(root){
  'use strict';
  const esc=value=>String(value??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
  const names=['Preview','Your story','Audience'];
  const steps=(current=0)=>`<ol class="post-flow-steps" aria-label="Run steps">${names.map((name,i)=>`<li${i===current?' aria-current="step"':''}><span>${i+1}</span>${name}</li>`).join('')}</ol>`;

  // Each editor's own supported install route. Cursor opens its own MCP install dialog; Codex adds the same local MCP server.
  function editorRoute(editor,{mcpSpec='',cursorMcpLink=''}={}){
    if(editor==='claude')return{command:'claude plugin marketplace add Morkeeth/strive\nclaude plugin install strive@strive',next:'Restart Claude Code and use /strive:strive.'};
    if(editor==='codex')return{command:`codex mcp add strive -- uvx --from ${mcpSpec} strive-mcp`,next:'Start a new Codex session and ask it to list your recent STRIVE sessions.'};
    return{link:cursorMcpLink,command:JSON.stringify({mcpServers:{strive:{command:'uvx',args:['--from',mcpSpec,'strive-mcp']}}}),next:'Cursor asks you to confirm. Then ask your agent to list your recent STRIVE sessions.'};
  }
  function setupHtml({agentPrompt,capture,syncHtml='',dropHtml='',agentFiles=[],agentCommands={},mcpSpec='',cursorMcpLink='',ownerId='guest'}){
    return `<section class="post-setup v2-surface v2-pad v2-stack" id="post-setup" data-setup-owner="${esc(ownerId||'guest')}" data-mcp-spec="${esc(mcpSpec)}" data-cursor-mcp-link="${esc(cursorMcpLink)}">
      <div><h2>Bring something you built.</h2><p>A project link is enough. Add a recorded session when you want to show the work behind it.</p></div>
      <div class="v2-row"><a class="v2-button primary" href="/?post">Add a project</a><button type="button" class="v2-button" id="connect-alternatives-open">Upload a session file</button></div>
      <div class="v2-agent-link"><p>Already working with an agent? Give it <a href="/agentic.md">this STRIVE link</a>. It can read the setup guide and help you choose a session.</p></div>
      <div class="v2-stack"><h2 id="connect-editor-heading">Connect your editor</h2><input type="hidden" id="post-editor"><div class="v2-editor-choices" role="group" aria-label="Your editor">${[['cursor','Cursor','cursor'],['claude','Claude Code','anthropic'],['codex','Codex','openai']].map(([value,label,maker])=>`<button type="button" class="v2-button" data-editor-choice="${value}" aria-pressed="false">${root.StriveAgents?.markSvg(maker,{size:24})||''}<span>${label}</span></button>`).join('')}</div>
      <section id="setup-editor" class="v2-step-panel v2-stack" hidden><h3 id="post-editor-title"></h3><p id="post-plugin-link-row"><a class="v2-button primary" id="post-plugin-link">Open setup</a></p><p id="post-plugin-next"></p>
        <details id="post-manual-config"><summary>Advanced setup</summary><p id="post-plugin-command-label"></p><div class="cmd"><code class="c" id="post-plugin-command"></code><button type="button" class="v2-button" id="post-plugin-copy" data-copy="">Copy setup command</button></div></details>
      </section></div>
      <dialog class="v2-alternatives" id="connect-alternatives"><div class="v2-heading"><h2>Import a session</h2><button type="button" class="v2-button" id="connect-alternatives-close">Close</button></div><p>Choose only the session you want to preview. It stays private until you decide to share.</p>${dropHtml||'<a href="/?connect">Choose a session file</a>'}</dialog>
    </section>`;
  }

  function mountSetup(scope){
    const setup=scope.querySelector('#post-setup');if(!setup||setup.dataset.wired)return;setup.dataset.wired='1';
    const editor=setup.querySelector('#post-editor');
    const storageKey='strive-connect-editor:'+encodeURIComponent(setup.dataset.setupOwner||'guest');
    const choices=['cursor','claude','codex'];
    try{const saved=root.localStorage.getItem(storageKey)||root.sessionStorage.getItem(storageKey);if(choices.includes(saved))editor.value=saved;}catch(_){try{const saved=root.sessionStorage.getItem(storageKey);if(choices.includes(saved))editor.value=saved;}catch(_){}}
    const paint=()=>{
      const choice=editor.value,panel=setup.querySelector('#setup-editor');setup.querySelectorAll('[data-editor-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.editorChoice===choice)));panel.hidden=!choice;if(!choice)return;
      const route=editorRoute(choice,{mcpSpec:setup.dataset.mcpSpec,cursorMcpLink:setup.dataset.cursorMcpLink}),manual=setup.querySelector('#post-manual-config');
      setup.querySelector('#post-editor-title').textContent='Connect '+({cursor:'Cursor',claude:'Claude Code',codex:'Codex'}[choice]);
      setup.querySelector('#post-plugin-link-row').hidden=false;
      const link=setup.querySelector('#post-plugin-link');link.href=route.link||'/plugins/install.html#'+choice;link.textContent=route.link?'Add to Cursor':'Set up '+({claude:'Claude Code',codex:'Codex'}[choice]||choice);
      manual.open=false;manual.querySelector('summary').hidden=false;
      setup.querySelector('#post-plugin-command-label').textContent=route.link?'Add this in Settings, Tools and MCP:':'Run in Terminal:';
      setup.querySelector('#post-plugin-command').textContent=route.command;
      setup.querySelector('#post-plugin-copy').dataset.copy=route.command;
      setup.querySelector('#post-plugin-next').textContent='After setup, give your agent a STRIVE link. It can help you preview a session before saving.';
    };
    setup.querySelectorAll('[data-editor-choice]').forEach(b=>b.onclick=()=>{editor.value=b.dataset.editorChoice;editor.dispatchEvent(new Event('change',{bubbles:true}));});
    editor.addEventListener('change',()=>{
      for(const name of ['localStorage','sessionStorage']){try{root[name].setItem(storageKey,editor.value)}catch(_){}}
      paint();
    });
    const modal=setup.querySelector('#connect-alternatives'),opener=setup.querySelector('#connect-alternatives-open');opener.onclick=()=>modal.showModal();setup.querySelector('#connect-alternatives-close').onclick=()=>modal.close();
    // WebKit can otherwise skip every button when macOS keyboard navigation is off.
    modal.addEventListener('keydown',event=>{
      if(event.key!=='Tab')return;
      const controls=[...modal.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el=>el.tabIndex>=0&&[...el.getClientRects()].some(r=>r.width>0&&r.height>0)&&getComputedStyle(el).visibility!=='hidden');
      if(!controls.length)return;
      event.preventDefault();const index=controls.indexOf(document.activeElement),next=index<0?(event.shiftKey?controls.length-1:0):(index+(event.shiftKey?-1:1)+controls.length)%controls.length;controls[next].focus();
    });
    modal.addEventListener('close',()=>{if(opener.isConnected)opener.focus();});

    paint();
  }

  function mountImport(scope,photoOptions={}){
    const body=scope.querySelector('.preview-story'),preview=scope.querySelector('#import-card-preview');
    if(!body||!preview||scope.querySelector('.post-composer'))return;
    const title=scope.querySelector('#i_title'),caption=scope.querySelector('#i_caption'),audience=scope.querySelector('#i_vis'),save=scope.querySelector('#i_pub'),recover=scope.querySelector('#i_recover');
    if(!title||!caption||!audience||!save||!recover)return;
    const sourcePanel=body.parentElement,previewSection=preview.closest('section');
    const details=body.querySelector('.preview-details');
    const hints=[...body.children].filter(node=>node.tagName==='P');
    const composer=document.createElement('div');composer.className='post-composer';
    composer.innerHTML=`<nav class="post-flow-nav" aria-label="Run steps">${names.map((name,i)=>`<button type="button" class="ghost" data-post-step="${i}" aria-controls="post-pane-${i}"><span>${i+1}</span>${name}</button>`).join('')}</nav>
      <section class="post-flow-pane" id="post-pane-0" aria-label="Preview"><p class="post-flow-intro">Check the session you brought in. You can edit how it reads on the next step.</p><div class="post-flow-preview"></div><div class="post-flow-actions"><button type="button" class="act" data-post-next="1">Add your story (optional)</button></div></section>
      <section class="post-flow-pane" id="post-pane-1" aria-label="Your story" hidden><h2 tabindex="-1">What happened?</h2><div class="post-flow-fields"></div><div class="post-photo-slot"></div><div class="post-flow-actions"><button type="button" class="act" data-post-next="0">Back</button><button type="button" class="act" data-post-next="2">Choose audience</button></div></section>
      <section class="post-flow-pane" id="post-pane-2" aria-label="Audience" hidden><h2 tabindex="-1">Who can see this?</h2><div class="post-flow-audience"></div><div class="post-flow-actions"><button type="button" class="act" data-post-next="1">Back</button></div><div class="post-flow-recovery"></div></section>`;
    const review=scope.querySelector('#import-sharing-review');
    if(review){scope.querySelector('#import-card-heading')?.closest('section')?.remove();composer.insertBefore(review,composer.querySelector('#post-pane-0'));previewSection?.querySelector('[data-share-audience-choice]')?.append(audience.closest('label'));}
    else composer.querySelector('.post-flow-preview').append(previewSection);
    const fields=composer.querySelector('.post-flow-fields');fields.append(title.closest('label'),caption.closest('label'));if(details)fields.append(details);
    composer.querySelector('.post-flow-audience').append(...(review?[]:[audience.closest('label')]),...hints.slice(0,1));
    save.classList.add('act','blue');
    composer.querySelector('#post-pane-2 .post-flow-actions').append(save);
    composer.querySelector('.post-flow-recovery').append(recover);
    sourcePanel.replaceWith(composer);
    if(root.StrivePhotoDraft&&photoOptions.token){
      // A photo is labelled with the audience chosen on the last step. Until then it is private.
      root.StrivePhotoDraft.mount({slot:composer.querySelector('.post-photo-slot'),audience:()=>audience.value||'private',...photoOptions});
      audience.addEventListener('change',()=>root.StrivePhotoGrid?.refreshAudience());
    }
    const storageKey='strive-post-step:'+root.location.hash;
    let step=0;
    try{const old=Number(root.sessionStorage.getItem(storageKey));if(Number.isInteger(old)&&old>=0&&old<3)step=old}catch(_){}
    function go(next,focus=true){
      if(next===2&&!title.value.trim()){
        go(1,false);title.focus();title.reportValidity();return;
      }
      step=next;
      composer.querySelectorAll('.post-flow-pane').forEach((pane,i)=>{pane.hidden=i!==next;});
      const actions=composer.querySelector('#post-pane-'+next+' .post-flow-actions');
      // Keep the actual save/recovery controls available on Preview; story edits are optional.
      actions.append(save);actions.after(recover);
      const height=actions.getBoundingClientRect().height||68;composer.style.setProperty('--post-action-height',height+'px');
      composer.querySelectorAll('[data-post-step]').forEach((button,i)=>{button.classList.toggle('is-done',i<next);if(i===next)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
      try{root.sessionStorage.setItem(storageKey,String(next))}catch(_){}
      const barHeight=document.querySelector('.bar')?.getBoundingClientRect().height||64;composer.style.setProperty('--post-bar-height',barHeight+'px');composer.style.setProperty('--import-header-offset',(barHeight+composer.querySelector('.post-flow-nav').getBoundingClientRect().height+8)+'px');
      if(focus){const target=next===1?title:next===2?audience:preview;if(target===preview)target.setAttribute('tabindex','-1');target.focus({preventScroll:true});const heading=next===0?(scope.querySelector('.head')||composer):composer.querySelector('#post-pane-'+next);heading.style.scrollMarginTop=(barHeight+12)+'px';heading.scrollIntoView({block:'start',behavior:'instant'});}
    }
    composer.querySelectorAll('[data-post-step],[data-post-next]').forEach(button=>button.addEventListener('click',event=>{event.preventDefault();go(Number(button.dataset.postStep??button.dataset.postNext))}));
    go(step,false);
  }
  root.StrivePostFlow={setupHtml,mountSetup,mountImport,editorRoute};
  if(typeof module==='object'&&module.exports)module.exports=root.StrivePostFlow;
})(typeof window==='object'?window:globalThis);
