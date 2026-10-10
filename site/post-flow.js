/* The post journey. This module arranges existing inputs; the importer owns all saves. */
(function(root){
  'use strict';
  const esc=value=>String(value??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
  const names=['Preview','Your story','Audience'];
  const steps=(current=0)=>`<ol class="post-flow-steps" aria-label="Run steps">${names.map((name,i)=>`<li${i===current?' aria-current="step"':''}><span>${i+1}</span>${name}</li>`).join('')}</ol>`;

  function setupHtml({agentPrompt,capture,syncHtml,dropHtml,agentFiles=[],agentCommands={}}){
    const tabs=[['editor','Editor plugin'],['terminal','Terminal'],['automatic','Automatic imports'],['files','Find a session']];
    return `<section class="post-start" aria-labelledby="post-start-title"><h2 id="post-start-title">Share what you made</h2>
      <p class="post-start-intro">Choose where you worked. STRIVE opens a private preview before you save a run.</p>${steps()}
      <div class="post-source-grid" aria-label="Choose your agent">
        <button class="ghost" type="button" data-post-source="cursor"><img src="/media/cursor-mark.svg" alt=""><strong>Cursor</strong><span>Choose a session file</span></button>
        <button class="ghost" type="button" data-post-source="claude" data-command="${esc(agentCommands.claude||capture)}"><img src="/media/claude-mark.svg" alt=""><strong>Claude Code</strong><span>Find my latest session</span></button>
        <button class="ghost" type="button" data-post-source="codex" data-command="${esc(agentCommands.codex||capture)}"><img src="/media/openai-mark.svg" alt=""><strong>Codex</strong><span>Find my latest session</span></button>
        <button class="ghost" type="button" data-post-source="grok"><span class="post-grok-mark" aria-hidden="true">𝕏</span><strong>Grok Bot</strong><span>Ask your companion</span></button>
      </div>
      <section class="post-quick-start" id="post-quick-start" hidden aria-live="polite"><h3 id="post-quick-title">Find your latest session</h3><p>Run this command in Terminal on the computer where you used your agent. It checks sessions across your projects and opens the latest supported session as a private preview. Check the project and session before saving.</p><div class="cmd"><code class="c" id="post-quick-command"></code><button class="act" type="button" id="post-quick-copy" data-copy="">Copy command</button></div><p class="hint">Needs <a href="https://docs.astral.sh/uv/getting-started/installation/">uv</a>. Your transcript stays on this computer. Check the session and numbers before saving. To pick a different session, use Find my sessions below.</p></section>
      <div class="post-agent-entry"><div><strong>Working with your agent?</strong><span>Ask it to collect a private preview.</span></div><button class="act" type="button" data-copy="${esc(agentPrompt)}">Copy request</button></div>
      <p class="hint">You can preview without signing in. Nothing is saved until you choose to save it.</p>
    </section>
    <section class="post-file-entry" aria-label="Find a session"><h2>Find my sessions</h2><p>Choose a file from the agent you used. On macOS, click <strong>Choose session file</strong>, press <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>G</kbd> in the file picker, and paste the folder below.</p><dl class="post-source-folders">${agentFiles.map(([name,path,help])=>`<div data-agent-folder="${esc(name)}"><dt>${esc(name)}</dt><dd><code>${esc(path)}</code><button class="ghost" type="button" data-copy="${esc(path)}" aria-label="Copy ${esc(name)} session folder">Copy folder</button><span>${esc(help)}</span></dd></div>`).join('')}</dl>${dropHtml}<p class="hint">JSON or JSONL from Cursor, Claude Code or Codex. For Grok, use an export your companion can actually read.</p></section>
    <p class="post-sample"><a href="/r/599095f1-3b49-4c0e-b50c-13afd4ae369e">See a real sample run →</a><span class="hint"> A public FAVOUR run. Your preview will use your own session.</span></p>
    <details class="post-setup" id="post-setup"><summary><span>Import setup</span><span class="post-setup-summary">Editor plugins, terminal and other sources</span></summary>
      <div class="post-setup-body"><div class="post-setup-tabs" role="tablist" aria-label="Import method">${tabs.map(([id,title],i)=>`<button type="button" role="tab" id="setup-tab-${id}" data-setup-tab="${id}" aria-controls="setup-${id}" aria-selected="${i===0}" tabindex="${i===0?'0':'-1'}">${title}</button>`).join('')}</div>
      <section id="setup-editor" role="tabpanel" aria-labelledby="setup-tab-editor"><h3>Keep STRIVE in your editor</h3><p>Install once, then ask for a private preview across the projects you choose.</p>
        <label class="post-editor-label">Your editor<select id="post-editor"><option value="cursor">Cursor</option><option value="claude">Claude Code</option></select></label>
        <p>Download and unzip the <a href="/plugins/strive.zip" download>STRIVE plugin</a>. In the extracted <code>strive</code> folder, run:</p>
        <div class="cmd"><code class="c" id="post-plugin-command">python3 scripts/strive-plugin.py install cursor</code><button type="button" class="act" id="post-plugin-copy" data-copy="python3 scripts/strive-plugin.py install cursor">Copy</button></div>
        <p id="post-plugin-next">Restart Cursor. Open STRIVE in the plugin list and select its strive skill.</p><p class="hint"><a href="/plugins/install.md">Install or update</a> · <a href="/plugins/release.json">Version and checksum</a></p>
      </section>
      <section id="setup-terminal" role="tabpanel" aria-labelledby="setup-tab-terminal" hidden><h3>Preview from a terminal</h3><p>Run this where you build. Check the project and session, then open the private preview link.</p><div class="cmd"><code class="c">${esc(capture)}</code><button type="button" class="act" data-copy="${esc(capture)}">Copy</button></div><p class="hint">Uses uv and Python. Supports Cursor, Claude Code and Codex. <a href="/agents.md">Choose an exact session</a>.</p></section>
      <section id="setup-automatic" role="tabpanel" aria-labelledby="setup-tab-automatic" hidden>${syncHtml}</section>
      <section id="setup-files" role="tabpanel" aria-labelledby="setup-tab-files" hidden><h3>Find your session file</h3><p>Use a transcript from the computer where you worked. In Finder, press Cmd+Shift+G and paste its folder.</p><dl class="post-source-folders">${agentFiles.map(([name,path,help,scope])=>`<div data-agent-folder="${esc(name)}"><dt>${esc(name)}</dt><dd><code>${esc(path)}</code><span>${esc(help)}${scope?' · '+esc(scope):''}</span></dd></div>`).join('')}</dl><p><a href="/?history-import">Recover an older build from a history file</a></p><p class="hint"><a href="/agents.md">MCP, Grok and other agent instructions</a></p></section>
      </div>
    </details>`;
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
    setup.querySelector('#post-editor').addEventListener('change',event=>{
      const editor=event.target.value==='claude'?'claude':'cursor';
      const command='python3 scripts/strive-plugin.py install '+editor;
      setup.querySelector('#post-plugin-command').textContent=command;
      setup.querySelector('#post-plugin-copy').dataset.copy=command;
      setup.querySelector('#post-plugin-next').textContent=editor==='claude'?'Restart Claude Code and use /strive:strive.':'Restart Cursor. Open STRIVE in the plugin list and select its strive skill.';
    });
    scope.querySelectorAll('[data-post-source]').forEach(button=>button.addEventListener('click',()=>{
      const source=button.dataset.postSource;
      if(source==='grok'){
        scope.querySelector('.post-agent-entry')?.scrollIntoView({block:'center',behavior:'smooth'});
        scope.querySelector('.post-agent-entry button')?.focus({preventScroll:true});return;
      }
      if(source==='cursor'){
        const row=scope.querySelector('.post-file-entry [data-agent-folder="Cursor"]');
        scope.querySelector('.post-file-entry')?.scrollIntoView({block:'start',behavior:'smooth'});
        row?.classList.add('post-folder-selected');row?.querySelector('button')?.focus({preventScroll:true});return;
      }
      const quick=scope.querySelector('#post-quick-start');quick.hidden=false;
      scope.querySelector('#post-quick-title').textContent='Find your latest '+({claude:'Claude Code',cursor:'Cursor',codex:'Codex'}[source]||'agent')+' session';
      scope.querySelector('#post-quick-command').textContent=button.dataset.command;
      scope.querySelector('#post-quick-copy').dataset.copy=button.dataset.command;
      scope.querySelectorAll('[data-post-source]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
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
    composer.querySelector('.post-flow-preview').append(previewSection);
    const fields=composer.querySelector('.post-flow-fields');fields.append(title.closest('label'),caption.closest('label'));if(details)fields.append(details);
    composer.querySelector('.post-flow-audience').append(audience.closest('label'),...hints.slice(0,1));
    save.classList.add('act','blue');
    composer.querySelector('#post-pane-2 .post-flow-actions').append(save);
    composer.querySelector('.post-flow-recovery').append(recover);
    sourcePanel.replaceWith(composer);
    if(root.StrivePhotoDraft&&photoOptions.token)root.StrivePhotoDraft.mount({slot:composer.querySelector('.post-photo-slot'),...photoOptions});
    const storageKey='strive-post-step:'+root.location.hash;
    let step=0;
    try{const old=Number(root.sessionStorage.getItem(storageKey));if(Number.isInteger(old)&&old>=0&&old<3)step=old}catch(_){}
    function go(next,focus=true){
      if(next===2&&!title.value.trim()){
        go(1,false);title.focus();title.reportValidity();return;
      }
      step=next;
      composer.querySelectorAll('.post-flow-pane').forEach((pane,i)=>{pane.hidden=i!==next;});
      composer.querySelectorAll('[data-post-step]').forEach((button,i)=>{button.classList.toggle('is-done',i<next);if(i===next)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
      try{root.sessionStorage.setItem(storageKey,String(next))}catch(_){}
      if(focus){const target=next===1?title:next===2?audience:preview;if(target===preview)target.setAttribute('tabindex','-1');target.focus({preventScroll:true});composer.scrollIntoView({block:'start',behavior:'instant'});}
    }
    composer.querySelectorAll('[data-post-step],[data-post-next]').forEach(button=>button.addEventListener('click',()=>go(Number(button.dataset.postStep??button.dataset.postNext))));
    go(step,false);
  }
  root.StrivePostFlow={setupHtml,mountSetup,mountImport};
  if(typeof module==='object'&&module.exports)module.exports=root.StrivePostFlow;
})(typeof window==='object'?window:globalThis);
