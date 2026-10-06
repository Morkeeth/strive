// The one card (site/day-card.js): what it shows, in which order, and what it must never show.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const C=require('../site/day-card.js'),D=require('../site/day.js');
const at=(h,m=0)=>new Date(2026,9,5,h,m).toISOString();
const ev=(c,a,b)=>({trace_basis:'historical-reconstruction',history_evidence:{repo_window_start:at(a),repo_window_end:at(b),first_observed_at:at(8),last_observed_at:at(17),history_entries:5,repo_commits:c,repo_revision:'a'.repeat(40),source_ref:'b'.repeat(64)}});
const runs=[{id:'a1',project:'alpha',started_at:at(9),duration_s:3600,tool_calls:10,story_result:'TEST DATA alpha first'},{id:'a2',project:'alpha',started_at:at(12),duration_s:1800,tool_calls:5,story_result:'TEST DATA alpha second'},
 {id:'b1',project:'beta',started_at:at(9,30),duration_s:3600,commits:2,story_result:'TEST DATA beta said',feedback_question:'q?'},{id:'c1',project:'gamma',started_at:at(10),duration_s:600},
 {id:'ga',project:'alpha',title:'w',...ev(6,10,11)},{id:'gd',project:'delta',title:'w',...ev(4,13,14)}];
const label=v=>v||'',model=D.compute(runs,'2026-10-05',label);
const tokens=new Map();for(const g of model.groups)tokens.set(g.label,await C.token('owner','2026-10-05_2026-10-05',g.label));
const T=n=>tokens.get(n);assert.match(T('alpha'),/^[a-f0-9]{12}$/);assert.notEqual(T('alpha'),await C.token('other-owner','2026-10-05_2026-10-05','alpha'),'a token is tied to its owner and window');
const d=C.slides(model,tokens,null);
assert.deepEqual(d.slides.map(s=>s.name),['The run','beta','alpha','gamma','Turning points'],'a project known only from git history has no view of its own');assert.equal(d.slides[0].quiet,1);assert.deepEqual(d.slides.map(s=>s.name).concat(['x']).slice(0,5),['The run','beta','alpha','gamma','Turning points'],'the run first, then the project of the lead run, then projects with a written result, then the rest in time order, then turning points as one view');
const whole=d.slides[0];assert.equal(whole.result,'TEST DATA beta said','the run opens on the lead project\'s own sentence');
assert.equal(whole.facts.commits.value,12,'git history where a project has it (6 and 4), the runs elsewhere (2)');assert.equal(whole.facts.projects.value,4);
assert.equal(whole.facts.session.value,'2 h 40');assert.match(whole.facts.session.note,/summed across runs, not one person's hours/);assert.equal(whole.facts.elapsed.value,'5 h 00','first to last is a different number from summed session time');
assert.equal(whole.pie.unit,'commits');assert.deepEqual(whole.pie.parts.map(p=>[p.name,p.value]),[['beta',2],['alpha',6],['gamma',0],['delta',4]]);
const gamma=d.slides.find(s=>s.name==='gamma');assert.equal(gamma.facts.commits.value,null,'a project with no commit count is unknown, not zero');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const html=C.render(d,{esc,mine:false,author:'TEST DATA Author',windowLabel:'Monday'});
assert.match(html,/>unknown</);assert.match(html,/Marks show when, never who\./);assert.match(html,/1 of 5/);assert.match(html,/class="act blue"[^>]*>Kudos</);assert.match(html,/data-comment>Comment</);
assert.ok(html.indexOf('class="dc-pie"')<html.indexOf('class="dc-graph"')&&html.indexOf('class="dc-graph"')<html.indexOf('class="dc-said"'),'pie and numbers, then the graph, then the story');
assert.ok(!html.includes('dc-photo'),'no picture unless the author chose one');assert.ok(!html.includes('Set up this card'),'a reader gets no setup link');
assert.equal((html.match(/class="dc-slide"/g)||[]).length,5);assert.equal((html.match(/class="dc-slide" data-slide="\d" hidden/g)||[]).length,4,'one view is open at a time');
// the author's choices
const chosen={lead:T('alpha'),order:[T('delta'),T('alpha'),T('beta')],hidden:[T('gamma')],visual:'photo',facts:{whole:['runs','peak','elapsed','tools'],project:['projects','runs']},highlights:false};
const e=C.slides(model,tokens,chosen);
assert.deepEqual(e.slides.map(s=>s.name),['The run','alpha','beta','Turning points'],'the chosen main project leads, then the author\'s order; a hidden project is gone');
assert.equal(e.slides[0].result,'TEST DATA alpha second');assert.equal(e.slides[0].facts.projects.value,3,'a hidden project is not in the totals');assert.equal(e.slides[0].facts.commits.value,12);
assert.deepEqual(e.choices.facts,{whole:['runs','peak','elapsed'],project:['runs']},'at most three numbers, and a whole-run number is not offered on a project');
assert.equal(e.slides[1].highlights.length,0);assert.match(C.render(e,{esc,mine:true,author:'a',windowLabel:'w',setupHref:'/x'}),/class="dc-photo"[^>]*data-thumb-run="a2"/);
// privacy: a reader's model holds public runs only; a saved choice naming private work matches nothing and shows nothing
const reader=D.compute(runs.filter(r=>r.id==='b1'),'2026-10-05',label),rt=new Map([['beta',T('beta')]]);
const r=C.slides(reader,rt,chosen),rh=C.render(r,{esc,mine:false,author:'a',windowLabel:'w'});
assert.deepEqual(r.slides.map(s=>s.name),['beta'],'one public project: no carousel and no empty views');assert.ok(!rh.includes('dc-nav')&&!rh.includes('alpha')&&!rh.includes('delta')&&!rh.includes('gamma'));
assert.ok(!JSON.stringify(chosen).includes('alpha'),'saved choices hold tokens, never a project name');
assert.deepEqual(C.clean({lead:'alpha',order:['<script>',T('beta'),T('beta'),7],hidden:'x',visual:'huge',facts:{whole:['nope']},highlights:'yes'}),{lead:null,order:[T('beta')],hidden:[],visual:'trace',facts:{whole:C.DEFAULTS.whole,project:C.DEFAULTS.project},highlights:true},'anything unexpected in saved choices is dropped');
assert.equal(C.render(C.slides(D.compute([],'2026-10-05',label),new Map(),null),{esc,mine:true,windowLabel:'w'}),'');
assert.ok(![html,rh].some(h=>h.includes('undefined')||h.includes('NaN')));
console.log('PASS: view order, lead project, measured facts with unknowns, author choices, hidden projects out of totals, reader privacy, saved choices hold no names');
