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
  function setupHtml({agentPrompt,capture,syncHtml,dropHtml,agentFiles=[],agentCommands={},mcpSpec='',cursorMcpLink=''}){
    const route=editorRoute('cursor',{mcpSpec,cursorMcpLink});
    const tabs=[['editor','Editor plugin'],['terminal','Terminal'],['automatic','Automatic imports'],['files','Find a session']];
    return `<section class="post-start" aria-label="Choose your agent">
      <p class="post-start-intro">Choose your agent and copy one command. It opens a session list on your own computer; the session you pick opens here as a private preview. Nothing is saved online yet.</p><ol class="post-flow-steps" id="post-import-steps" aria-label="Import steps"><li aria-current="step"><span>1</span>Choose your agent</li><li><span>2</span>Run it in Terminal</li><li><span>3</span>Private preview</li></ol>
      <div class="post-source-grid" id="post-source-grid" aria-label="Choose your agent">
        <button class="ghost" type="button" data-post-source="cursor" data-command="${esc(agentCommands.cursor||capture)}"><img src="/media/cursor-mark.svg" alt=""><strong>Cursor</strong><span>Copy a Terminal command</span></button>
        <button class="ghost" type="button" data-post-source="claude" data-command="${esc(agentCommands.claude||capture)}"><img src="/media/claude-mark.svg" alt=""><strong>Claude Code</strong><span>Copy a Terminal command</span></button>
        <button class="ghost" type="button" data-post-source="codex" data-command="${esc(agentCommands.codex||capture)}"><img src="/media/openai-mark.svg" alt=""><strong>Codex</strong><span>Copy a Terminal command</span></button>
        <button class="ghost" type="button" data-post-source="grok"><span class="post-grok-mark" aria-hidden="true">𝕏</span><strong>Grok Bot</strong><span>Ask your companion</span></button>
        <button class="ghost" type="button" data-post-source="bb" data-command="bb thread log --self --all --json > bb-session.json"><span class="post-grok-mark" aria-hidden="true">bb</span><strong>bb</strong><span>Export this thread</span></button>
      </div>
      <section class="post-quick-start" id="post-quick-start" hidden aria-live="polite"><h3 id="post-quick-title">Pick a recent session</h3><p>Copy this command into Terminal on the computer where you worked. It opens a local list with time, project and first prompt. Pick your session there and its private preview opens in this browser as step 3.</p><div class="cmd"><button class="act blue" type="button" id="post-quick-copy" data-copy="">Copy command</button><details class="post-command-details"><summary>View command</summary><code class="c" id="post-quick-command"></code></details></div><p class="hint">Needs <a href="https://docs.astral.sh/uv/getting-started/installation/">uv</a> and Python 3.9+. This website cannot read your disk. The command reads locally; prompts and session files stay on your computer. Already installed the STRIVE plugin? Ask it to show recent sessions.</p><details><summary>No uv? Use pipx</summary><p>With Python 3.9+ and pipx installed, run:</p><code id="post-pipx-command"></code><button type="button" class="ghost" id="post-pipx-copy" data-copy="">Copy pipx command</button></details><p class="hint">The picker opens on 127.0.0.1, your own computer. Only the measured preview travels in a URL fragment; the website does not receive that fragment in its page request.</p></section>
      <div class="post-agent-entry" hidden><div><strong>Working with your agent?</strong><span>Ask it to collect a private preview.</span></div><button class="act" type="button" data-copy="${esc(agentPrompt)}">Copy request</button></div>
      <p class="hint">You can preview without signing in. Nothing is saved until you choose to save it.</p>
    </section>
    <details class="post-file-entry" aria-label="Find a session"><summary>Or drop a session file</summary><h3>Find your session file</h3><p>Choose a file from the agent you used. On macOS, click <strong>Choose session file</strong>, press <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>G</kbd> in the file picker, and paste the folder below. For bb, run the shown export inside the thread.</p><dl class="post-source-folders">${agentFiles.map(([name,path,help])=>`<div data-agent-folder="${esc(name)}"><dt>${esc(name)}</dt><dd><code>${esc(path)}</code><button class="ghost" type="button" data-copy="${esc(path)}" aria-label="Copy ${esc(name)} session source">Copy</button><span>${esc(help)}</span></dd></div>`).join('')}</dl>${dropHtml}<p class="hint">JSON or JSONL up to 64 MiB from bb, Cursor, Claude Code, Codex, or another role-based agent, or a prepared .strive.json preview. For larger native sessions, use the local picker above to choose a sitting. For Grok, use an export your companion can actually read.</p></details>
    <p class="post-sample"><a href="/r/90a16040-8ad5-4096-978c-8b1f78f3dd2f">See a real sample run →</a><span class="hint"> A public STRIVE run. Your preview will use your own session.</span></p>
    <details class="post-setup" id="post-setup" data-mcp-spec="${esc(mcpSpec)}" data-cursor-mcp-link="${esc(cursorMcpLink)}"><summary><span>Import setup</span><span class="post-setup-summary">Editor plugins, terminal and other sources</span></summary>
      <div class="post-setup-body"><div class="post-setup-tabs" role="tablist" aria-label="Import method">${tabs.map(([id,title],i)=>`<button type="button" role="tab" id="setup-tab-${id}" data-setup-tab="${id}" aria-controls="setup-${id}" aria-selected="${i===0}" tabindex="${i===0?'0':'-1'}">${title}</button>`).join('')}</div>
      <section id="setup-editor" role="tabpanel" aria-labelledby="setup-tab-editor"><h3>Keep STRIVE in your editor</h3><p>Install once, then ask for a private preview across the projects you choose.</p>
        <label class="post-editor-label">Your editor<select id="post-editor"><option value="cursor">Cursor</option><option value="claude">Claude Code</option><option value="codex">Codex</option></select></label>
        <p id="post-plugin-link-row"${route.link?'':' hidden'}><a class="act blue" id="post-plugin-link" href="${esc(route.link||'')}">Add to Cursor</a></p>
        <p id="post-plugin-command-label">${route.link?'Or add this server by hand in Settings, Tools and MCP:':'Run in Terminal:'}</p>
        <div class="cmd"><code class="c" id="post-plugin-command">${esc(route.command).replace(/\n/g,'<br>')}</code><button type="button" class="act" id="post-plugin-copy" data-copy="${esc(route.command)}">Copy</button></div>
        <p id="post-plugin-next">${esc(route.next)}</p>
        <p class="hint" id="post-plugin-privacy">Runs on your computer. Your agent can list recent sessions from every project on this computer, by project name and time only. Nothing leaves your computer until you open a preview and choose to save it.</p>
        <p class="hint"><a href="/install">All editor routes</a> · <a href="/plugins/install">Full plugin with the strive skill, ZIP fallback and checksum</a> · <a href="https://github.com/Morkeeth/strive">Public source</a></p>
      </section>
      <section id="setup-terminal" role="tabpanel" aria-labelledby="setup-tab-terminal" hidden><h3>Preview from a terminal</h3><p>Run this where you build. Check the project and session, then open the private preview link.</p><div class="cmd"><code class="c">${esc(capture)}</code><button type="button" class="act" data-copy="${esc(capture)}">Copy</button></div><p class="hint">Uses uv and Python. Supports Cursor, Claude Code and Codex. <a href="/agents.md">Choose an exact session</a>.</p></section>
      <section id="setup-automatic" role="tabpanel" aria-labelledby="setup-tab-automatic" hidden>${syncHtml}</section>
      <section id="setup-files" role="tabpanel" aria-labelledby="setup-tab-files" hidden><h3>Find your session file</h3><p>Use a transcript from the computer where you worked. In Finder, press Cmd+Shift+G and paste its folder.</p><dl class="post-source-folders">${agentFiles.map(([name,path,help,scope])=>`<div data-agent-folder="${esc(name)}"><dt>${esc(name)}</dt><dd><code>${esc(path)}</code><span>${esc(help)}${scope?' · '+esc(scope):''}</span></dd></div>`).join('')}</dl><p><a href="/?history-import">Recover an older build from a history file</a></p><p class="hint"><a href="/agents.md">MCP, Grok and other agent instructions</a></p></section>
      </div>
    </details>`;
  }

  // The page can only see the choice and the copy; the pick happens in the local list, which opens step 3 here.
  function setImportStep(scope,current){
    scope.querySelectorAll('#post-import-steps li').forEach((li,i)=>{li.classList.toggle('is-done',i<current);if(i===current)li.setAttribute('aria-current','step');else li.removeAttribute('aria-current');});
  }
  function mountSetup(scope){
    const setup=scope.querySelector('#post-setup');
    if(!setup||setup.dataset.wired)return;
    setup.dataset.wired='1';
    const tabs=[...setup.querySelectorAll('[data-setup-tab]')];
    function select(tab,focus=false){
      for(const button of tabs){const on=button===tab;button.setAttribute('aria-selected',String(on));button.tabIndex=on?0:-1;setup.querySelector('#'+button.getAttribute('aria-controls')).hidden=!on;}
      if(focus)tab.focus();
    }
    tabs.forEach((tab,i)=>{
      tab.addEventListener('click',()=>select(tab));
      tab.addEventListener('keydown',event=>{
        let at=i;
        if(event.key==='ArrowRight')at=(i+1)%tabs.length;
        else if(event.key==='ArrowLeft')at=(i+tabs.length-1)%tabs.length;
        else if(event.key==='Home')at=0;
        else if(event.key==='End')at=tabs.length-1;
        else return;
        event.preventDefault();select(tabs[at],true);
      });
    });
    const routeOptions={mcpSpec:setup.dataset.mcpSpec||'',cursorMcpLink:setup.dataset.cursorMcpLink||''};
    setup.querySelector('#post-editor').addEventListener('change',event=>{
      const editor=['claude','codex'].includes(event.target.value)?event.target.value:'cursor';
      const route=editorRoute(editor,routeOptions);
      setup.querySelector('#post-plugin-link-row').hidden=!route.link;
      if(route.link)setup.querySelector('#post-plugin-link').href=route.link;
      setup.querySelector('#post-plugin-command-label').textContent=route.link?'Or add this server by hand in Settings, Tools and MCP:':'Run in Terminal:';
      setup.querySelector('#post-plugin-command').innerHTML=esc(route.command).replace(/\n/g,'<br>');
      setup.querySelector('#post-plugin-copy').dataset.copy=route.command;
      setup.querySelector('#post-plugin-next').textContent=route.next;
    });
    scope.querySelectorAll('[data-post-source]').forEach(button=>button.addEventListener('click',()=>{
      const source=button.dataset.postSource;
      if(source==='grok'){
        scope.querySelector('.post-agent-entry').hidden=false;
        scope.querySelector('#post-quick-start').hidden=true;
        setImportStep(scope,1);
        scope.querySelector('.post-agent-entry')?.scrollIntoView({block:'center',behavior:'smooth'});
        scope.querySelector('.post-agent-entry button')?.focus({preventScroll:true});return;
      }
      scope.querySelector('.post-agent-entry').hidden=true;
      const quick=scope.querySelector('#post-quick-start');quick.hidden=false;
      scope.querySelector('#post-quick-title').textContent=source==='bb'?'Export this bb thread':'Copy to Terminal to open your '+({claude:'Claude Code',cursor:'Cursor',codex:'Codex'}[source]||'agent')+' session picker';
      scope.querySelector('#post-quick-command').textContent=button.dataset.command;
      scope.querySelector('#post-quick-copy').dataset.copy=button.dataset.command;
      const fallback=source==='bb'?button.dataset.command:button.dataset.command.replace(/^uvx --from /,'pipx run --spec ');
      scope.querySelector('#post-pipx-command').textContent=fallback;scope.querySelector('#post-pipx-copy').dataset.copy=fallback;
      scope.querySelectorAll('[data-post-source]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
      setImportStep(scope,1);
      const selectedName={claude:'Claude Code',cursor:'Cursor',codex:'Codex',bb:'bb'}[source];
      scope.querySelectorAll('.post-file-entry [data-agent-folder]').forEach(row=>row.hidden=row.dataset.agentFolder!==selectedName);
      quick.scrollIntoView({block:'nearest',behavior:'smooth'});
    }));
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
      <section class="post-flow-pane" id="post-pane-0" aria-label="Preview"><p class="post-flow-intro">Check the session you brought in. You can edit how it reads on the next step.</p><div class="post-flow-preview"></div><div class="post-flow-actions"><button type="button" class="act blue" data-post-next="1">Add your story</button></div></section>
      <section class="post-flow-pane" id="post-pane-1" aria-label="Your story" hidden><h2 tabindex="-1">What happened?</h2><div class="post-flow-fields"></div><div class="post-photo-slot"></div><div class="post-flow-actions"><button type="button" class="act" data-post-next="0">Back</button><button type="button" class="act blue" data-post-next="2">Choose audience</button></div></section>
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
      const actions=composer.querySelector('#post-pane-'+next+' .post-flow-actions'),height=actions?.getBoundingClientRect().height||68;composer.style.setProperty('--post-action-height',height+'px');
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
