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
assert.deepEqual(d.slides.map(s=>s.name),['beta','alpha','gamma'],'only project screens participate in navigation');assert.equal(d.summary.quiet,1);
const whole=d.summary;assert.equal(whole.result,'One run across 4 projects','the overview opens on a plain count, never on one project\'s sentence');assert.equal(whole.draft,true);
assert.equal(whole.facts.commits.value,12,'git history where a project has it (6 and 4), the runs elsewhere (2)');assert.equal(whole.facts.projects.value,4);
assert.equal(whole.facts.session.value,'2 h 40');assert.match(whole.facts.session.note,/summed across runs, not one person's hours/);assert.equal(whole.facts.elapsed.value,'5 h 00','first to last is a different number from summed session time');
assert.equal(whole.pie.unit,'commits');assert.deepEqual(whole.pie.parts.map(p=>[p.name,p.value]),[['beta',2],['alpha',6],['gamma',0],['delta',4]]);
const gamma=d.slides.find(s=>s.name==='gamma');assert.equal(gamma.facts.commits.value,null,'a project with no commit count is unknown, not zero');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const html=C.render(d,{esc,mine:false,author:'TEST DATA Author',windowLabel:'Monday'});
assert.match(C.render(d,{esc,mine:false,compact:false,author:"a",windowLabel:"w"}),/>not recorded</);assert.match(C.detail(d,esc),/Marks show when, never who\./);assert.match(C.detail(d,esc),/not one person's hours/);assert.match(html,/<b>beta<\/b> · 1 of 3/);assert.match(html,/class="dc-open"[^>]*>Open full run/);assert.ok(!/kudos/i.test(html.replace(/fc-kudos-mine/g,'')),'the word is XUDOS');assert.match(C.render(d,{esc,mine:false,author:'a',windowLabel:'w',actions:'<i>ROW</i>'}),/<footer class="fc-foot"><i>ROW<\/i><\/footer>/,'the action row is handed in, drawn by the shared function');
assert.ok(html.indexOf('class="dc-pages"')<html.indexOf('class="dc-said"')&&html.indexOf('class="dc-measured"')<html.indexOf('class="dc-visual"'),'measured band leads image on one compact project screen');
assert.ok(!html.includes('dc-lane')&&!html.includes('role="tab"'),'no lane rows and no tab row on the card');
// The split between projects: one ring, its metric named, and what is not counted said in words.
assert.match(html,/class="dc-share dc-share-one"/);assert.match(html,/Share of 12 commits, git history and runs\. 1 project not counted: no commit count recorded\./,'the ring names its metric and says what it leaves out');
assert.ok(!/class="dc-share-n">(?:<a[^>]*>)?gamma/.test(html),'a project with no commit count is not drawn as a zero slice');
assert.match(html,/<b>50%<\/b> of the run's commits: 6 of 12/);
assert.ok(!d.slides.some(s=>s.name==='delta'),'git-only project remains in denominator without an empty screen');
assert.match(html,/dc-share-one[^]*?<b>17%<\/b> of the run's commits: 2 of 12/,'a project page shows its own share');assert.match(html,/Not in the split: no commit count recorded for this project/);
// Positive, zero and missing are three different things in the split.
{const rz=[{id:'p1',project:'pos',started_at:at(9),duration_s:600,commits:5},{id:'p2',project:'pos2',started_at:at(10),duration_s:600,commits:3},{id:'z1',project:'zero',started_at:at(11),duration_s:600,commits:0},{id:'m1',project:'missing',started_at:at(12),duration_s:600}];
 const mz=D.compute(rz,'2026-10-05',label),tz=new Map();for(const g of mz.groups)tz.set(g.label,await C.token('owner','k',g.label));
 const hz=C.render(C.slides(mz,tz,null),{esc,mine:false,author:'a',windowLabel:'w'});
 assert.match(hz,/Share of 8 commits, recorded by the runs\. 1 project with 0 commits\. 1 project not counted: no commit count recorded\./,'a measured zero is said as zero, a missing count as not counted');
 assert.match(hz,/<b>0%<\/b> of the run's commits: 0 commits recorded for this project/);assert.match(hz,/Not in the split: no commit count recorded for this project/);
 assert.ok(!/dc-share-n">(?:<a[^>]*>)?(zero|missing)</.test(hz),'neither is drawn as a slice');}
// The card's own step: round and round, and only that move wraps.
assert.deepEqual(C.reduce({at:4,count:5},{type:'auto'}),{at:0,count:5});assert.deepEqual(C.reduce({at:1,count:5},{type:'auto'}),{at:2,count:5});assert.equal(C.reduce({at:4,count:5},{type:'next'}).at,4,'a press on Next never wraps');
assert.match(html,/class="dc-auto" data-auto hidden/,'the pause control is in the selector, hidden until the card rotates');
assert.match(html,/class="dc-area"/);assert.match(html,/class="dc-mark"/);assert.match(html,/captured sessions/);assert.match(html,/commits landed/);
// a note or a caption is never promoted to the headline
const noted=C.slides(D.compute([{...runs[0],story_result:null,caption:'TEST DATA a mission statement',note:'TEST DATA note'}],'2026-10-05',label),new Map([[label(runs[0].project),T('beta')]]),null);
assert.ok(noted.slides.every(s=>!s.result),'only the result field makes a headline');
assert.ok(!html.includes('data-visual-photo'),'no picture unless the author chose one');assert.ok(!html.includes('dc-menu')&&!html.includes('setup='),'a reader gets no owner menu and no setup link');
assert.equal((html.match(/class="dc-slide"/g)||[]).length,3);assert.equal((html.match(/<section class="dc-slide"[^>]* hidden /g)||[]).length,2,'one view is open at a time');
const reader0=D.compute(runs.filter(r=>r.id==='b1'),'2026-10-05',label),rt0=new Map([['beta',T('beta')]]);
// the author's choices
const chosen={lead:T('alpha'),order:[T('delta'),T('alpha'),T('beta')],hidden:[T('gamma')],photo:{run:'a2',id:'nope'},visual:'photo',facts:{whole:['runs','peak','elapsed','tools'],project:['projects','runs']},highlights:false};
const e=C.slides(model,tokens,chosen);
assert.deepEqual(e.slides.map(s=>s.name),['alpha','beta'],'the chosen main project leads, then the author\'s order; a hidden project is gone');
assert.equal(e.summary.result,'One run across 3 projects');assert.equal(e.summary.draft,true);assert.equal(C.slides(model,tokens,{...chosen,title:'  TEST DATA  my own  headline '}).summary.result,'TEST DATA my own headline','the author\'s own headline wins and is tidied');
assert.ok(!C.render(e,{esc,mine:true,author:'a',windowLabel:'w'}).includes('One run across'),'no duplicate overview screen');
const hashed=C.slides(D.compute([{...runs[2],story_result:'TEST DATA one thing done. Live is unchanged at 2e784e7.'},runs[0]],'2026-10-05',label),tokens,{lead:T('alpha')});assert.deepEqual(hashed.summary.highlights.map(h=>h.text),['TEST DATA alpha first','TEST DATA one thing done.'],'a sentence with a commit hash stays off the card');assert.match(hashed.slides.find(s=>s.name==='beta').result,/2e784e7/,'and stays on the project itself');assert.equal(e.summary.facts.projects.value,3,'a hidden project is not in the totals');assert.equal(e.summary.facts.commits.value,12);
assert.deepEqual(e.choices.facts,{whole:['runs','peak','elapsed'],project:['runs']},'at most three numbers, and a whole-run number is not offered on a project');
assert.equal(e.slides[1].highlights.length,0);assert.ok(!C.render(e,{esc,mine:true,author:'a',windowLabel:'w'}).includes('data-visual-photo'),'a choice that is not a real picture id shows nothing; the old on or off switch no longer picks a picture');
const U='11111111-2222-4333-8444-555555555555',P='99999999-2222-4333-8444-555555555555',pm=D.compute(runs.map(r=>r.id==='a2'?{...r,id:U,visibility:'private'}:r),'2026-10-05',label);
const shows=(h,i)=>new RegExp(`data-slide="${i}"(?:(?!data-slide=)[^])*data-visual-run="${U}" data-visual-photo="${P}"`).test(h),R=(deck,mine=false)=>C.render(deck,{esc,mine,author:'a',windowLabel:'w'});
// A choice saved before version 2: one picture, no way to say photo. It migrates to a screenshot, shown whole, on its own project only.
const old=C.slides(pm,tokens,{...chosen,photo:{run:U,id:P}}),oh=R(old);
assert.equal(old.choices.v,2);assert.equal(old.choices.visual,'screenshot','an old saved picture is kept as a screenshot, whatever the old switch said');assert.equal(old.choices.hero,false);
assert.ok(shows(oh,0)&&!shows(oh,1),'after migration the overview is the measured trace and the picture leads its own project');assert.equal((oh.match(/data-visual-photo=/g)||[]).length,1,'and it is nowhere else');
assert.match(oh,/data-kind="screenshot"[^>]*data-state="loading"/);assert.match(oh,/Screenshot chosen by the author, shown whole\./);
assert.match(oh,/<div class="dc-fallback" hidden><svg class="dc-graph"/,'the measured trace sits behind the picture, so a picture that cannot be fetched leaves the trace');
// Version 2: the author says photo or screenshot, where to hold the frame, and whether the overview takes it too.
const v2={...chosen,v:2,photo:{run:U,id:P},visual:'photo',hero:true,focus:'top'},pd=C.slides(pm,tokens,v2),ph=R(pd);
assert.ok(shows(ph,0)&&!shows(ph,1),'with hero on, the photo leads the overview and its own project');assert.equal((ph.match(/data-visual-photo=/g)||[]).length,1);
assert.match(ph,/data-kind="photo"[^>]*data-focus="top"/);assert.match(ph,/Photo chosen by the author\. Atmosphere, not a measurement\./,'a photo is labelled as atmosphere, not proof');
assert.equal((ph.match(/data-slide="0"(?:(?!data-slide=)[^])*/)[0].match(/class="dc-visual"/g)||[]).length,1,'one main visual on a page, never a thumbnail beside a graph');
assert.match(R(pd,true),/Its run is Only you, so readers get the measured trace instead\./,'the owner is told when the picture is on a run readers cannot see');assert.ok(!ph.includes('Only you'),'a reader is never told about private work');
assert.ok(!R(C.slides(pm,tokens,{...v2,visual:'data'})).includes(U+'" data-visual'),'data mode shows the trace and keeps the picture out of the page');
// Each project page may lead with the cover chosen on that project's own run. Never another project's picture.
{const two=C.render(C.slides(model,tokens,null),{esc,mine:false,author:'a',windowLabel:'w'}),pages=two.split('<section class="dc-slide"').slice(1);
 const own=n=>pages.find(x=>x.includes(`data-name="${n}"`));
 assert.match(own('alpha'),/data-visual-run="a2" data-visual-cover/);assert.match(own('beta'),/data-visual-run="b1" data-visual-cover/);assert.ok(!own('alpha').includes('"b1" data-visual')&&!own('beta').includes('"a2" data-visual'),'a project page asks only for its own run');
 assert.equal(own('Overview'),undefined,'no extra overview');assert.match(own('alpha'),/data-state="fallback"[^]*?class="dc-picture"[^>]*hidden/,'the measured data shows until a chosen cover is confirmed');
 assert.equal((own('alpha').match(/class="dc-visual"/g)||[]).length,1);const seen=C.render(C.slides(D.compute(runs.filter(r=>r.id==='b1'),'2026-10-05',label),new Map([['beta',T('beta')]]),null),{esc,mine:false,author:'a',windowLabel:'w'});assert.ok(!seen.includes('a2')&&!seen.includes('a1')&&seen.includes('data-visual-run="b1" data-visual-cover'),'a reader gets no cover request for a run they cannot see');}
assert.deepEqual(C.clean({...v2,visual:'video',focus:'<x>',hero:'yes'}).visual,'data');assert.equal(C.clean({...v2,focus:'<x>'}).focus,'center');assert.equal(C.clean({v:2,visual:'photo',hero:true}).hero,false,'a mode with no picture is data, and cannot lead the overview');
assert.ok(!R(C.slides(reader0,rt0,v2)).includes(U)&&!R(C.slides(reader0,rt0,v2)).includes(P),'a reader who cannot see that run gets no trace of the picture: not its id, not its run');
assert.match(R(C.slides(reader0,rt0,v2)),/data-kind="data"/,'and gets the measured trace in its place');
// No trace and no picture: one honest sentence, with a way forward for the owner only.
const bare=D.compute([{id:'z1',project:'zeta',started_at:at(9),story_result:'TEST DATA zeta said'}],'2026-10-05',label),bt=new Map([['zeta',T('alpha')]]),bd=C.slides(bare,bt,null);
assert.match(C.render(bd,{esc,mine:true,author:'a',windowLabel:'w',visualHref:'/v'}),/data-kind="none"[^]*?<p class="dc-empty">No measured trace and no picture on this page yet\. <a href="\/v">Choose a visual<\/a>/);
assert.ok(!R(bd).includes('Choose a visual')&&R(bd).includes('No measured trace and no picture'),'a reader gets the sentence without the owner link');
assert.match(C.render(d,{esc,mine:true,author:'a',windowLabel:'w',visualHref:'/v'}),/Add a photo or a screenshot to this page/);assert.ok(!html.includes('Add a photo'),'the prompt to add a visual is the owner\'s only');
// Names an agent or a screen reader can ask for: the headline is a heading, each number a named group.
assert.match(html,/<h2 class="dc-said">TEST DATA beta said<\/h2>/);assert.match(html,/role="group" aria-label="Commits, git history: 6"/);assert.match(C.render(d,{esc,compact:false}),/role="group" aria-label="Commits: not recorded"/,'full detail names unknown numbers');assert.ok(!html.includes('aria-label="Commits: not recorded"'),'compact cards reserve metric space for recorded values');
// PAGE SELECTOR: numbered links with their own names and addresses, built from the pages this reader has.
const nav=C.render(d,{esc,mine:false,author:'a',windowLabel:'w',start:2,pageHref:(k,i)=>`/?day=x&page=${k}`});
assert.deepEqual([...nav.matchAll(/class="dc-page" href="([^"]*)" data-goto="(\d)" aria-label="([^"]*)" (aria-current="page")?/g)].map(m=>[m[3],m[1],!!m[4]]),
 [['1 beta',`/?day=x&amp;page=${T('beta')}`,false],['2 alpha',`/?day=x&amp;page=${T('alpha')}`,false],['3 gamma',`/?day=x&amp;page=${T('gamma')}`,true]],'only included projects have navigation addresses');
assert.match(nav,/<b>gamma<\/b> · 3 of 3/);
assert.equal(C.pageIndex(d,T('alpha')),1);assert.equal(C.pageIndex(d,'points'),0);assert.equal(C.pageIndex(d,'ffffffffffff'),0);assert.equal(C.pageIndex(d,null,'99'),2);
// One reducer for every way of moving.
const st={at:1,count:5},Rd=C.reduce,edge={at:0,count:5};
assert.equal(Rd(st,{type:'next'}).at,2);assert.equal(Rd(st,{type:'prev'}).at,0);assert.equal(Rd(edge,{type:'prev'}),edge,'the first page does not wrap, and no change returns the same state');assert.equal(Rd({at:4,count:5},{type:'next'}).at,4,'the last page does not wrap');
assert.equal(Rd(st,{type:'goto',at:4}).at,4);assert.equal(Rd(st,{type:'goto',at:99}).at,4);assert.equal(Rd(st,{type:'key',key:'ArrowRight'}).at,2);assert.equal(Rd(st,{type:'key',key:'ArrowLeft'}).at,0);
assert.equal(Rd(st,{type:'key',key:'ArrowRight',guarded:true}),st,'an arrow typed in a field, a menu or a media control does not turn the page');assert.equal(Rd(st,{type:'key',key:'ArrowLeft',modified:true}),st,'Alt and an arrow is the browser\'s own Back');
assert.equal(Rd(st,{type:'swipe',dx:-80,dy:5}).at,2);assert.equal(Rd(st,{type:'swipe',dx:80,dy:5}).at,0);assert.equal(Rd(st,{type:'swipe',dx:-80,dy:70}),st,'a scroll is not a swipe');assert.equal(Rd(st,{type:'swipe',dx:-20,dy:0}),st);
// Owner menu: four entries, one function, owner only.
const links={edit:'/e',visual:'/v',reader:'/r',sharing:'/s'},mh=C.render(d,{esc,mine:true,author:'a',windowLabel:'w',menu:links});
assert.deepEqual([...mh.matchAll(/role="menuitem" href="([^"]*)" [^>]*>([^<]*)</g)].map(m=>[m[2],m[1]]),[['Edit card','/e'],['Choose visual','/v'],['Preview as reader','/r'],['Sharing','/s']]);
assert.match(mh,/aria-haspopup="menu" aria-expanded="false"[^>]*aria-label="Card options"/);assert.ok(!C.render(d,{esc,mine:false,author:'a',windowLabel:'w',menu:links}).includes('dc-menu'),'a reader never gets the owner menu, even if links are handed in');

// privacy: a reader's model holds public runs only; a saved choice naming private work matches nothing and shows nothing
const reader=D.compute(runs.filter(r=>r.id==='b1'),'2026-10-05',label),rt=new Map([['beta',T('beta')]]);
const r=C.slides(reader,rt,chosen),rh=C.render(r,{esc,mine:false,author:'a',windowLabel:'w'});
assert.deepEqual(r.slides.map(s=>s.name),['beta'],'one public project: no carousel and no empty views');assert.ok(!rh.includes('dc-pages')&&!rh.includes('class="dc-page"')&&!rh.includes('alpha')&&!rh.includes('delta')&&!rh.includes('gamma'));
assert.ok(!JSON.stringify(chosen).includes('alpha'),'saved choices hold tokens, never a project name');
assert.deepEqual(C.clean({lead:'alpha',order:['<script>',T('beta'),T('beta'),7],hidden:'x',visual:'huge',facts:{whole:['nope']},highlights:'yes'}),{v:2,projectVisuals:{},lead:null,order:[T('beta')],hidden:[],visual:'data',hero:false,focus:'center',facts:{whole:C.DEFAULTS.whole,project:C.DEFAULTS.project},highlights:true,photo:null,title:''},'anything unexpected in saved choices is dropped');
assert.equal(C.render(C.slides(D.compute([],'2026-10-05',label),new Map(),null),{esc,mine:true,windowLabel:'w'}),'');
assert.ok(![html,rh].some(h=>h.includes('undefined')||h.includes('NaN')));
// A reader with several public projects is numbered over those only.
const two=D.compute(runs.filter(r=>['b1','c1'].includes(r.id)),'2026-10-05',label),twoH=R(C.slides(two,tokens,{order:[T('alpha'),T('delta')],lead:T('alpha')}));
assert.deepEqual([...twoH.matchAll(/class="dc-page"[^>]*aria-label="(\d [^"]*)"/g)].map(m=>m[1]),['1 beta','2 gamma'],'numbering comes from visible pages only: a hidden or private project takes no number and leaves no name');assert.ok(!twoH.includes('alpha')&&!twoH.includes('delta'));
// Older imported sessions can have a caption and timing but no project or result.
const unnamed=D.compute([{id:'old-a',started_at:at(9),duration_s:120,caption:'Context only'},
 {id:'old-b',started_at:at(10),duration_s:180}], '2026-10-05',label);
const unnamedDeck=C.slides(unnamed,new Map(),null),unnamedHtml=R(unnamedDeck);
assert.match(unnamedHtml,/id="day-card"/,'saved sessions without project names still have a daily card');
assert.equal(unnamedDeck.slides[0].facts.runs.value,2);
assert.equal(unnamedDeck.slides[0].facts.commits.value,null);
assert.equal(unnamedDeck.slides[0].facts.projects,undefined,'unknown projects are not an invented project count');
assert.equal(unnamedDeck.slides[0].result,'','caption does not become a claimed result');
assert.match(unnamedHtml,/2 captured sessions/);
assert.equal(C.slides(model,tokens,{hidden:[...tokens.values()]}).slides.length,0,'fallback never restores deliberately hidden projects');
console.log('PASS: card anatomy, navigation, privacy, visual choices, and unnamed saved sessions');

{
// A stored picture cannot jump to a different project or a reader without its run.
const ra='11111111-2222-4333-8444-555555555555',rb='22222222-2222-4333-8444-555555555555',pa='33333333-2222-4333-8444-555555555555',pb='44444444-2222-4333-8444-555555555555';
const picRuns=[{id:ra,project:'alpha',started_at:at(9),duration_s:50,visibility:'private'},{id:rb,project:'beta',started_at:at(10),duration_s:60,visibility:'public'}];
const selected={v:2,projectVisuals:{[T('alpha')]:{photo:{run:ra,id:pa},visual:'photo',focus:'top'},[T('beta')]:{photo:{run:rb,id:pb},visual:'screenshot',focus:'center'}}};
const pd=C.slides(D.compute(picRuns,'2026-10-05',label),tokens,selected);
assert.equal(pd.slides.find(s=>s.name==='alpha').visual.id,pa);
assert.equal(pd.slides.find(s=>s.name==='beta').visual.id,pb);
const readerPhotos=C.render(C.slides(D.compute(picRuns.filter(r=>r.visibility==='public'),'2026-10-05',label),tokens,selected),{esc,mine:false});
assert.ok(!readerPhotos.includes(ra)&&!readerPhotos.includes(pa));
selected.projectVisuals[T('beta')].photo={run:ra,id:pa};
assert.equal(C.slides(D.compute(picRuns,'2026-10-05',label),tokens,selected).slides.find(s=>s.name==='beta').visual,null);

}

// A useful common denominator on captured multi-project days, without partial sums as facts.
{const rs=[{id:'t1',project:'A',started_at:at(9),tool_calls:12},{id:'t2',project:'B',started_at:at(10),tool_calls:8},{id:'t3',project:'C',started_at:at(11)}];
const m=D.compute(rs,'2026-10-05',label),t=new Map(m.groups.map((g,i)=>[g.label,String(i).padStart(12,'0')])),deck=C.slides(m,t,null);
assert.equal(deck.summary.pie.unit,'tool calls');assert.equal(deck.summary.pie.total,20);assert.equal(deck.summary.pie.parts.find(p=>p.name==='C').known,false);
assert.match(C.render(deck,{esc,mine:false}),/60%/);assert.match(C.render(deck,{esc,mine:false}),/no tool-call count recorded/);}
