// Draws the Add a run / Connect body with the shipped code and prints what a person can see and
// press, as JSON. Real code: connectBodyHtml and the command builders from site/index.html, the
// drop zone and folder list beside them, and site/post-flow.js (setupHtml and mountSetup).
// Signed out. Each agent button is pressed once, in order.
//
// usage: node connect_body_probe.mjs <repo root>
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {createRequire} from 'node:module';
const root=process.argv[2];
const {JSDOM}=createRequire(path.join(root,'package.json'))('jsdom');
const read=file=>fs.readFileSync(path.join(root,'site',file),'utf8');
const html=read('index.html');
const cut=(from,to)=>{const a=html.indexOf(from),b=html.indexOf(to,a);if(a<0||b<0)throw new Error('index.html no longer has '+(a<0?from:to));return html.slice(a,b)};
const w=new JSDOM('<main id="app"></main>',{url:'https://strive.test/?post',runScripts:'outside-only'}).window;
w.Element.prototype.scrollIntoView=function(){};
w.eval(read('post-flow.js'));
const ctx={ME:null,location:w.location,StrivePostFlow:w.StrivePostFlow,signInLabel:()=>'Sign in',esc:s=>String(s)};
vm.createContext(ctx);
vm.runInContext(cut('const ONE_LINE=','function wireConnectCopies(')+cut('function dropZoneHtml(){','// The newest public runs'),ctx);
const body=ctx.connectBodyHtml(),d=w.document,app=d.getElementById('app');
app.innerHTML=body;w.StrivePostFlow.mountSetup(app);
const text=n=>n?n.textContent.replace(/\s+/g,' ').trim():null,shown=n=>!!n&&!n.closest('[hidden]');
const out={body,intro:text(app.querySelector('.post-start-intro')),steps:[...app.querySelectorAll('.post-start .post-flow-steps li')].map(text),
 sources:[...app.querySelectorAll('[data-post-source]')].map(b=>({source:b.dataset.postSource,name:text(b.querySelector('strong')),command:b.dataset.command||null})),
 picks:{}};
out.before={quick:shown(app.querySelector('#post-quick-start')),agent:shown(app.querySelector('.post-agent-entry'))};
for(const b of app.querySelectorAll('[data-post-source]')){b.click();
 out.picks[b.dataset.postSource]={quick:shown(app.querySelector('#post-quick-start')),agent:shown(app.querySelector('.post-agent-entry')),
  title:text(app.querySelector('#post-quick-title')),command:text(app.querySelector('#post-quick-command')),copy:app.querySelector('#post-quick-copy').dataset.copy,copyLabel:text(app.querySelector('#post-quick-copy')),
  pipx:text(app.querySelector('#post-pipx-command')),agentCopy:app.querySelector('.post-agent-entry button').dataset.copy,
  folders:[...app.querySelectorAll('.post-file-entry [data-agent-folder]')].filter(r=>!r.hidden).map(r=>r.dataset.agentFolder)};}
out.quickText=text(app.querySelector('#post-quick-start'));
out.fileEntry={summary:text(app.querySelector('.post-file-entry summary')),open:app.querySelector('.post-file-entry').open,zone:!!app.querySelector('.post-file-entry #drop-zone'),input:app.querySelector('#drop-file')?.type,
 folders:[...app.querySelectorAll('.post-file-entry .post-source-folders code')].map(text),zoneText:text(app.querySelector('#drop-zone'))};
out.setup={open:app.querySelector('#post-setup').open,summary:text(app.querySelector('#post-setup summary')),tabs:[...app.querySelectorAll('[data-setup-tab]')].map(text),
 terminal:text(app.querySelector('#setup-terminal')),terminalCommand:text(app.querySelector('#setup-terminal code')),terminalCopy:app.querySelector('#setup-terminal [data-copy]').dataset.copy,
 files:text(app.querySelector('#setup-files')),automatic:text(app.querySelector('#setup-automatic'))};
out.links=[...app.querySelectorAll('a[href]')].map(a=>({href:a.getAttribute('href'),text:text(a)}));
out.hints=[...app.querySelectorAll('.post-start > .hint')].map(text);
out.order=['.post-start','.post-file-entry','#post-setup'].map(s=>[...app.children].indexOf(app.querySelector(s)));
process.stdout.write(JSON.stringify(out));
w.close();
