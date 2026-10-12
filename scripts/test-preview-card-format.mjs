import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
const require=createRequire(import.meta.url),F=require('../site/feed-card.js');
const fixture={id:'preview',title:'moon-demo session',harness:'Cursor',started_at:'2026-10-12T13:09:00Z',created_at:'2026-10-12T18:00:00Z',prompts:1,tool_calls:4,files_touched:2,commits:0,visibility:'private',capture_metadata:{basis:'cursor-model-info',models:[]}};
const dom=new JSDOM('<main id="app"></main>',{runScripts:'outside-only',url:'https://striverun.app/#import=fixture'}),w=dom.window,d=w.document;
const doc=new JSDOM(F.card(fixture,{preview:true})).window.document;
const errors=[];function check(name,run){try{run()}catch(error){errors.push(name+': '+error.message)}}
const source=fs.readFileSync('site/index.html','utf8');
const titleCode=source.slice(source.indexOf('  const capturedProject=GrinderContract.projectLabel(run.project);'),source.indexOf('  const app=$(\'app\');',source.indexOf('  const capturedProject=GrinderContract.projectLabel(run.project);')));
check('keep payload title',()=>{const imported=new Function('run','GrinderContract',titleCode+'return importedTitle();')({...fixture,project:'moon-demo',title:'moon-demo run'},require('../site/run-contract.js'));assert.equal(imported,'moon-demo run')});
check('token note belongs to context',()=>assert.equal(doc.querySelectorAll('.post-token-note').length,0));
check('plain unsaved provenance',()=>{assert.ok(!doc.body.textContent.includes('Imported · client-reported'));assert.ok(!source.includes("profiles:ME||{display_name:'Local run'}"))});
check('one harness identity',()=>assert.ok(!doc.querySelector('.fc-who small').textContent.includes('Cursor')));
check('no repository-zero claim',()=>assert.ok(!doc.body.textContent.includes('0 commits')));
check('no non-git zero fallback fact',()=>{const noFiles=new JSDOM(F.card({...fixture,files_touched:null},{preview:true})).window.document;assert.ok(![...noFiles.querySelectorAll('.fc-activity-stats dt')].some(e=>e.textContent==='Commits'))});
check('consistent model and commit text',()=>{const git=new JSDOM(F.card({...fixture,commits:1},{preview:true})).window.document;assert.equal(git.querySelectorAll('.run-agent-identity .agent-fact:not(.preview-token-note)').length,2)});
check('plain stat labels',()=>assert.equal(doc.querySelectorAll('.fc-activity-stats dt summary,.fc-activity-stats dt a').length,0));
for(const label of ['XUDOS','Comment','Share'])check('no unsaved '+label,()=>assert.ok(!doc.querySelector('.fc-foot')?.textContent.includes(label)));
check('one story action',()=>assert.ok(!doc.body.textContent.includes('Preview your story')));
check('recorded clock time',()=>assert.ok(/\d{1,2}:\d{2}/.test(doc.querySelector('.fc-who small').textContent)));
// Actual composer: exercise Preview -> Your story -> Preview, preserving all edit values.
d.querySelector('#app').innerHTML='<header class="bar"></header><div class="head"><h2>Your imported session</h2></div><section><div id="import-card-preview"></div></section><div class="panel"><div class="preview-story"><label>Title<input id="i_title" value="Moon calendar"></label><label>Story<textarea id="i_caption">Authored story</textarea></label><label>Audience<select id="i_vis"><option value="private">Only me</option></select></label><button id="i_pub">Save run</button><div id="i_recover"></div></div></div>';
const scrolled=[];w.Element.prototype.scrollIntoView=function(){scrolled.push(this)};d.querySelector('.bar').getBoundingClientRect=()=>({height:64});
w.eval(fs.readFileSync('site/post-flow.js','utf8'));w.StrivePostFlow.mountImport(d.querySelector('#app'));
d.querySelector('[data-post-next="1"]').click();d.querySelector('[data-post-next="0"]').click();
check('header stays in scroll target',()=>assert.equal(scrolled.at(-1),d.querySelector('.head')));
check('sticky header offset',()=>assert.ok(parseFloat(d.querySelector('.head').style.scrollMarginTop)>=76));
assert.equal(d.querySelector('#i_title').value,'Moon calendar');assert.equal(d.querySelector('#i_caption').value,'Authored story');assert.equal(d.querySelector('#i_vis').value,'private');
// Saved cards keep their existing social actions and recorded zero; preview policy changes no data.
const saved=new JSDOM(F.card({...fixture,id:'saved',visibility:'public'},{page:true})).window.document;
assert.ok(saved.querySelector('.fc-foot'));assert.equal(fixture.commits,0);
if(errors.length)throw Error(errors.join('\n'));
console.log('PASS unsaved card format, recorded clock, single story action, scoped scrolling and preserved saved actions/data');
w.close();
