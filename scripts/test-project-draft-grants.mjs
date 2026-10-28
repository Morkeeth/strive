// Agent draft links fill the form only, the four permissions stay separate, research is off by default,
// and a private "proud of this" mark never becomes a XUDOS. Offline: loads the browser modules under node.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

const store=new Map();
globalThis.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
const Draft=require('../site/agent-draft.js'),Mark=require('../site/self-mark.js');

// A round trip keeps text, including non-ASCII.
const draft={format:Draft.VERSION,project:'Café runner',title:'Faster sync',problem:'Runners lose laps',changed:'Sync now resumes.',feedback:'Is the resume obvious?',link:'https://example.com/run',agent:'Codex',evidence:[{label:'PR',url:'https://github.com/x/y/pull/1'}]};
const got=Draft.parse('#project-draft='+Draft.toBase64Url(draft));
assert.deepEqual(got.fields,{project:'Café runner',title:'Faster sync',problem:'Runners lose laps',changed:'Sync now resumes.',feedback:'Is the resume obvious?',link:'https://example.com/run'});
assert.equal(got.agent,'Codex');assert.deepEqual(got.evidence,[{label:'PR',url:'https://github.com/x/y/pull/1'}]);

// A draft cannot set visibility, audience, metrics or anything outside the six fields.
const sneaky=Draft.parse('#project-draft='+Draft.toBase64Url({...draft,visibility:'public',audience:'everyone',metrics:{xudos:99},publish:true}));
assert.deepEqual(Object.keys(sneaky.fields).sort(),['changed','feedback','link','problem','project','title']);

assert.equal(Draft.parse('#other=1'),null);
assert.equal(Draft.parse(''),null);
assert.throws(()=>Draft.parse('#project-draft='+Draft.toBase64Url({...draft,format:'v0'})),/unknown format/);
assert.equal(Draft.parse('#project-draft=@@@'),null);assert.throws(()=>Draft.parse('#project-draft=bm90IGpzb24'),/could not be read/);
assert.throws(()=>Draft.parse('#project-draft='+Draft.toBase64Url({...draft,title:'x'.repeat(121)})),/too long/);
assert.throws(()=>Draft.parse('#project-draft='+Draft.toBase64Url({...draft,title:7})),/must be text/);
assert.equal(Draft.parse('#project-draft='+Draft.toBase64Url({format:Draft.VERSION})).agent,'your agent');
assert.equal(Draft.parse('#project-draft='+Draft.toBase64Url({...draft,evidence:Array(9).fill({label:'a',url:'https://a.b'})})).evidence.length,5);

// Every draft field maps to a form input that exists.
const html=await readFile('site/index.html','utf8');
for(const id of Object.values(Draft.FORM))assert.match(html,new RegExp(`id="${id}"`),id);

// Self mark: one toggle. Signed out it stays in this browser.
assert.equal(await Mark.connect(null,null),'device');
assert.equal(Mark.marked('run-1'),false);
assert.equal(await Mark.toggle('run-1'),true);assert.equal(Mark.marked('run-1'),true);
assert.equal(await Mark.toggle('run-1'),false);assert.equal(Mark.marked('run-1'),false);
assert.ok(!/xudos|kudos|ack/i.test(store.get(Mark.SELF)),'self marks are not stored as XUDOS');

// The composer shows four separate permissions; research is chosen in Settings, not here.
assert.match(html,/class="grant-steps"/);
for(const step of ['Read on your computer','Save privately','Publish','Research use'])assert.ok(html.includes(step),step);
assert.doesNotMatch(html,/id="research-optin"/,'no device-only research box any more');
assert.match(html,/Off unless you choose it in <a href="\/\?account#account-research">Settings<\/a>/);
assert.match(html,/data-self-mark="\$\{r\.id\}"/);
assert.match(html,/It is not a XUDOS and is not counted/);
assert.match(html,/history\.replaceState/);

// Replies say who wrote them and what evidence they carry.
const social=await readFile('site/social.js','utf8');
assert.match(social,/Agent reply/);assert.match(social,/author-kind person/);assert.match(social,/No evidence attached/);

// The public manifest and schema describe the draft link as draft only.
const schema=JSON.parse(await readFile('site/schemas/project-update-draft.v1.json','utf8'));
assert.equal(schema.properties.format.const,Draft.VERSION);
for(const [k,max] of Object.entries(Draft.LIMITS))if(schema.properties[k])assert.equal(schema.properties[k].maxLength,max,k);
const front=await readFile('scripts/build-agent-frontdoor.mjs','utf8');
assert.match(front,/project_update_draft:\{default:'draft_only'/);
assert.match(front,/saves:false,publishes:false/);
for(const g of ['read_local','save_private','publish','research'])assert.match(front,new RegExp(g+':'),g);
console.log('project draft, grants, research and self mark: ok');

// The real path: open the draft link signed out, sign in, the composer re-renders, the draft is still there.
const {JSDOM}=await import('jsdom');
const enc=Draft.toBase64Url(draft);
const dom=new JSDOM('<main id="app"></main>',{url:'https://strive.example.com/?post#project-draft='+enc,runScripts:'outside-only'}),w=dom.window;
for(const file of ['project-update.js','run-story.js','agent-draft.js'])w.eval(await readFile('site/'+file,'utf8'));
w.eval(`var ME=null,sb;var StrivePhotoDraft={mount(){},hasDraft:async()=>false,saveIfDraft:async()=>false};var $=id=>document.getElementById(id);var status=()=>{};var showSignIn=()=>{};var viewRun=async()=>{};var fairConfirmRun=()=>{};var esc=s=>String(s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));`);
w.eval(html.slice(html.indexOf('function postComposerHtml('),html.indexOf('\nasync function viewPost()')));
w.eval(html.slice(html.indexOf('function wireComposer()'),html.indexOf('// GitHub is provider-backed')));
const paint=()=>{w.document.getElementById('app').innerHTML=w.postComposerHtml();w.wireComposer()};
paint();
assert.equal(w.document.getElementById('f_title').value,'Faster sync');
assert.equal(w.location.hash,'','fragment cleared');
assert.match(w.document.getElementById('agent-draft-note').textContent,/Drafted by Codex\. Nothing is saved or published/);
w.eval("ME={id:'signed-in-owner'}");paint();
assert.equal(w.document.getElementById('f_title').value,'Faster sync','draft survives sign-in re-render');
assert.equal(w.document.getElementById('f_caption').value,'Sync now resumes.');
console.log('draft link survives sign-in: ok');
