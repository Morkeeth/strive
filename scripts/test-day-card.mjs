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
assert.deepEqual(d.slides.map(s=>s.name),['Overview','beta','alpha','gamma','Turning points'],'a project known only from git history has no view of its own');assert.equal(d.slides[0].quiet,1);assert.deepEqual(d.slides.map(s=>s.name).concat(['x']).slice(0,5),['Overview','beta','alpha','gamma','Turning points'],'the run first, then the project of the lead run, then projects with a written result, then the rest in time order, then turning points as one view');
const whole=d.slides[0];assert.equal(whole.result,'One run across 4 projects','the overview opens on a plain count, never on one project\'s sentence');assert.equal(whole.draft,true);
assert.equal(whole.facts.commits.value,12,'git history where a project has it (6 and 4), the runs elsewhere (2)');assert.equal(whole.facts.projects.value,4);
assert.equal(whole.facts.session.value,'2 h 40');assert.match(whole.facts.session.note,/summed across runs, not one person's hours/);assert.equal(whole.facts.elapsed.value,'5 h 00','first to last is a different number from summed session time');
assert.equal(whole.pie.unit,'commits');assert.deepEqual(whole.pie.parts.map(p=>[p.name,p.value]),[['beta',2],['alpha',6],['gamma',0],['delta',4]]);
const gamma=d.slides.find(s=>s.name==='gamma');assert.equal(gamma.facts.commits.value,null,'a project with no commit count is unknown, not zero');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const html=C.render(d,{esc,mine:false,author:'TEST DATA Author',windowLabel:'Monday'});
assert.match(html,/>not recorded</);assert.match(C.detail(d,esc),/Marks show when, never who\./);assert.match(C.detail(d,esc),/not one person's hours/);assert.match(html,/1 of 5/);assert.match(html,/class="dc-open"[^>]*>Open the run/);assert.ok(!/kudos/i.test(html.replace(/fc-kudos-mine/g,'')),'the word is XUDOS');assert.match(C.render(d,{esc,mine:false,author:'a',windowLabel:'w',actions:'<i>ROW</i>'}),/<footer class="fc-foot"><i>ROW<\/i><\/footer>/,'the action row is handed in, drawn by the shared function');
assert.ok(html.indexOf('class="dc-said"')<html.indexOf('class="dc-facts"')&&html.indexOf('class="dc-facts"')<html.indexOf('class="dc-graph"'),'the result, then the numbers, then one small graph');
assert.ok(!html.includes('dc-pie')&&!html.includes('dc-lane')&&!html.includes('role="tab"'),'no ring, no lane rows and no tab row on the card');
assert.match(html,/class="dc-area"/);assert.match(html,/class="dc-mark"/);assert.match(html,/captured sessions, up to \d at once/);assert.match(html,/commits landed/);
// a note or a caption is never promoted to the headline
const noted=C.slides(D.compute([{...runs[0],story_result:null,caption:'TEST DATA a mission statement',note:'TEST DATA note'}],'2026-10-05',label),new Map([[label(runs[0].project),T('beta')]]),null);
assert.ok(noted.slides.every(s=>!s.result),'only the result field makes a headline');
assert.ok(!html.includes('dc-photo'),'no picture unless the author chose one');assert.ok(!html.includes('Set up this card'),'a reader gets no setup link');
assert.equal((html.match(/class="dc-slide"/g)||[]).length,5);assert.equal((html.match(/<section class="dc-slide"[^>]* hidden /g)||[]).length,4,'one view is open at a time');
const reader0=D.compute(runs.filter(r=>r.id==='b1'),'2026-10-05',label),rt0=new Map([['beta',T('beta')]]);
// the author's choices
const chosen={lead:T('alpha'),order:[T('delta'),T('alpha'),T('beta')],hidden:[T('gamma')],photo:{run:'a2',id:'nope'},visual:'photo',facts:{whole:['runs','peak','elapsed','tools'],project:['projects','runs']},highlights:false};
const e=C.slides(model,tokens,chosen);
assert.deepEqual(e.slides.map(s=>s.name),['Overview','alpha','beta','Turning points'],'the chosen main project leads, then the author\'s order; a hidden project is gone');
assert.equal(e.slides[0].result,'One run across 3 projects');assert.equal(e.slides[0].draft,true);assert.equal(C.slides(model,tokens,{...chosen,title:'  TEST DATA  my own  headline '}).slides[0].result,'TEST DATA my own headline','the author\'s own headline wins and is tidied');
assert.ok(C.render(e,{esc,mine:true,author:'a',windowLabel:'w',setupHref:'/x'}).includes('Draft headline')&&!C.render(e,{esc,mine:false,author:'a',windowLabel:'w'}).includes('Draft headline'),'only the owner is told the headline is a draft');
const hashed=C.slides(D.compute([{...runs[2],story_result:'TEST DATA one thing done. Live is unchanged at 2e784e7.'},runs[0]],'2026-10-05',label),tokens,{lead:T('alpha')});assert.deepEqual(hashed.slides[0].highlights.map(h=>h.text),['TEST DATA alpha first','TEST DATA one thing done.'],'a sentence with a commit hash stays off the card');assert.match(hashed.slides.find(s=>s.name==='beta').result,/2e784e7/,'and stays on the project itself');assert.equal(e.slides[0].facts.projects.value,3,'a hidden project is not in the totals');assert.equal(e.slides[0].facts.commits.value,12);
assert.deepEqual(e.choices.facts,{whole:['runs','peak','elapsed'],project:['runs']},'at most three numbers, and a whole-run number is not offered on a project');
assert.equal(e.slides[1].highlights.length,0);assert.ok(!C.render(e,{esc,mine:true,author:'a',windowLabel:'w'}).includes('dc-photo'),'a choice that is not a real picture id shows nothing; the old on or off switch no longer picks a picture');
const U='11111111-2222-4333-8444-555555555555',P='99999999-2222-4333-8444-555555555555',pm=D.compute(runs.map(r=>r.id==='a2'?{...r,id:U}:r),'2026-10-05',label),pd=C.slides(pm,tokens,{...chosen,photo:{run:U,id:P}}),ph=C.render(pd,{esc,mine:false,author:'a',windowLabel:'w'});
assert.match(ph,new RegExp(`data-slide="0"[^]*?data-thumb-run="${U}" data-thumb-photo="${P}"[^]*?data-slide="1"`),'the chosen screenshot is on the overview');assert.equal((ph.match(/dc-photo/g)||[]).length,2,'and on the view of the project whose run it is from, nowhere else');
assert.ok(!C.render(C.slides(reader0,rt0,{...chosen,photo:{run:U,id:P}}),{esc,mine:false,author:'a',windowLabel:'w'}).includes(U),'a reader who cannot see that run gets no trace of the picture');

// privacy: a reader's model holds public runs only; a saved choice naming private work matches nothing and shows nothing
const reader=D.compute(runs.filter(r=>r.id==='b1'),'2026-10-05',label),rt=new Map([['beta',T('beta')]]);
const r=C.slides(reader,rt,chosen),rh=C.render(r,{esc,mine:false,author:'a',windowLabel:'w'});
assert.deepEqual(r.slides.map(s=>s.name),['beta'],'one public project: no carousel and no empty views');assert.ok(!rh.includes('dc-nav')&&!rh.includes('alpha')&&!rh.includes('delta')&&!rh.includes('gamma'));
assert.ok(!JSON.stringify(chosen).includes('alpha'),'saved choices hold tokens, never a project name');
assert.deepEqual(C.clean({lead:'alpha',order:['<script>',T('beta'),T('beta'),7],hidden:'x',visual:'huge',facts:{whole:['nope']},highlights:'yes'}),{lead:null,order:[T('beta')],hidden:[],visual:'trace',facts:{whole:C.DEFAULTS.whole,project:C.DEFAULTS.project},highlights:true,photo:null,title:''},'anything unexpected in saved choices is dropped');
assert.equal(C.render(C.slides(D.compute([],'2026-10-05',label),new Map(),null),{esc,mine:true,windowLabel:'w'}),'');
assert.ok(![html,rh].some(h=>h.includes('undefined')||h.includes('NaN')));
console.log('PASS: view order, lead project, measured facts with unknowns, author choices, hidden projects out of totals, reader privacy, saved choices hold no names');
