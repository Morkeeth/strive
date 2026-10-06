// The day page is computed from run rows by site/day.js. These are the rules it must keep.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const D=createRequire(import.meta.url)('../site/day.js');
const at=(h,m=0)=>new Date(2026,9,5,h,m).toISOString();
const label=v=>(typeof v==='string'&&v.trim())||'';
const runs=[
 {id:'a',project:'the-fair',started_at:at(10),duration_s:7200,commits:10,caption:'TEST DATA released',harness:'Claude Code',capture_metadata:{models:['model-a','model-a']},visibility:'public'},
 {id:'b',project:'zup',started_at:at(10,30),duration_s:3600,commits:3,story_result:'TEST DATA fixed names',harness:'Codex',capture_metadata:{models:['model-b']},feedback_question:'TEST DATA which would you open?',visibility:'private'},
 {id:'c',project:'zup',started_at:at(11),duration_s:1800,commits:null,harness:'Codex',model:'model-b',visibility:'private'},
 {id:'d',project:null,started_at:at(11,10),duration_s:600,commits:null,harness:'Claude Code',visibility:'private'},
 {id:'e',project:null,started_at:null,created_at:at(13),duration_s:0,caption:'TEST DATA typed by hand',visibility:'private'},
 {id:'yesterday',project:'zup',started_at:new Date(2026,9,4,23,50).toISOString(),duration_s:3600,commits:99,visibility:'private'},
 {id:'bad',project:'zup',started_at:'not a date',commits:5},
];
const m=D.compute(runs,'2026-10-05',label);
assert.deepEqual(m.items.map(i=>i.run.id),['a','b','c','d','e'],'a run belongs to the local day its session started on; another day and an unreadable start are left out');
assert.equal(m.commits,13,'commits are summed from the day only');
assert.equal(m.commitsUnknown,3,'a run with no commit count is unknown, and is counted as unknown');
assert.deepEqual(m.projects.map(p=>[p.name,p.commits,p.runs,p.unknown]),[['the-fair',10,1,0],['zup',3,2,1]],'projects are ordered by commits; an unknown count adds nothing');
assert.deepEqual(m.plumbing.map(i=>i.run.id),['d'],'only a run with no project and no written result is plumbing');
assert.deepEqual(m.lines.map(i=>i.run.id),['a','b','c','e'],'a written result alone is enough to be named work');
assert.deepEqual(m.groups.map(g=>[g.label,g.runs.length,g.open.id,g.result]),[['the-fair',1,'a','TEST DATA released'],['zup',2,'b','TEST DATA fixed names'],['',1,'e','TEST DATA typed by hand']],'one row per project; it opens the run that carries the written result, and counts every run behind it');
assert.equal(m.peak,4,'peak counts runs whose recorded times overlap');
assert.equal(m.lead.run.id,'b','the run that asks a question leads the day');
assert.deepEqual(m.models,[['model-b',2],['model-a',1]],'a model is counted once per run that recorded it');
assert.equal(D.compute(runs.filter(r=>r.id!=='b'),'2026-10-05',label).lead.run.id,'a','without a question the run with most commits leads');
assert.equal(D.compute([],'2026-10-05',label).lead,null);
assert.throws(()=>D.compute(runs,'5 Oct',label),/YYYY-MM-DD/);
assert.equal(D.shift('2026-10-01',-1),'2026-09-30');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mine=D.render(m,{esc,mine:true,dayLabel:'Monday 5 October 2026',publicHref:'/?day=2026-10-05&p=x'});
assert.match(mine,/13 commits across 2 projects\./);
const keyed=D.render(D.compute([{id:'k1',project:'Raw/Key 1',started_at:at(9),duration_s:60,commits:2},{id:'k2',project:'Raw/Key 1',started_at:at(10),duration_s:60,commits:1,caption:'TEST DATA'}],'2026-10-05',v=>v?'Shown name':''),{esc,mine:true,dayLabel:'d'});
assert.equal((keyed.match(/\/\?project=Raw%2FKey%201&scope=mine/g)||[]).length,2,'project links carry the stored value, not the shown label');
assert.match(D.render(D.compute([{id:'n',project:null,started_at:at(9),duration_s:60,commits:5,caption:'TEST DATA'}],'2026-10-05',label),{esc,mine:true,dayLabel:'d',leadWith:'numbers'}),/<h1>5 commits\.<\/h1>/,'commits on a run with no project are not credited to a project');assert.match(mine,/PARALLELISER/);assert.match(mine,/TEST DATA which would you open\?/);
assert.match(mine,/Unknown is not zero/);assert.match(mine,/Lineage is not recorded/);assert.match(mine,/See what others see/);
assert.ok(!mine.includes('undefined')&&!mine.includes('NaN'),'no unrendered value reaches the page');
const hostile=D.render(D.compute([{id:'x',project:'<img src=x onerror=1>',started_at:at(9),duration_s:60,caption:'<script>1</script>',feedback_question:'"><b>q'}],'2026-10-05',label),{esc,mine:false,dayLabel:'d'});
assert.ok(!hostile.includes('<script>')&&!hostile.includes('<img src=x')&&!hostile.includes('"><b>q'),'run text is escaped');
assert.ok(!hostile.includes('PARALLELISER'),'the badge needs at least three runs at once');
assert.ok(!hostile.includes('See what others see'),'the public view has no owner link');
const ev=(commits,end=at(18))=>({trace_basis:'historical-reconstruction',history_evidence:{repo_window_start:at(0),repo_window_end:end,first_observed_at:at(8),last_observed_at:at(17),history_entries:5,repo_commits:commits,repo_revision:'a'.repeat(40),source_ref:'b'.repeat(64)}});
const g=D.compute([...runs,{id:'g1',project:'zup',title:'Work on zup',...ev(17)},{id:'g2',project:null,title:'Work on bagel',...ev(48)},{id:'g3',project:'old',title:'x',...ev(9,new Date(2026,9,4,12).toISOString())},{id:'g4',project:'fake',title:'x',trace_basis:'elapsed',history_evidence:ev(500).history_evidence,started_at:at(9),commits:1}],'2026-10-05',label);
assert.deepEqual(g.projects.map(p=>[p.name,p.commits,p.fromGit]),[['Work on bagel',48,48],['zup',17,17],['the-fair',10,null],['fake',1,null]],'a recovered count replaces session counts for that project and is never added to them; evidence on a run that is not a recovery is ignored; another day is left out');
assert.equal(g.commits,76);assert.equal(g.items.some(i=>i.run.id==='g1'),false,'a recovered repository is not a session and is not on the clock');
const gr=D.render(g,{esc,mine:true,dayLabel:'d'});assert.match(gr,/from git history/);assert.match(gr,/<span class="day-name">Work on bagel<\/span>/,'a recovered row with no project is shown, not linked');
const night=D.compute([{id:'n1',project:'p',started_at:new Date(2026,9,5,23).toISOString(),duration_s:7200,commits:1,caption:'TEST DATA late'},{id:'n2',project:'q',started_at:new Date(2026,9,6,6).toISOString(),duration_s:600,commits:2,caption:'TEST DATA early'},{id:'n3',project:'r',started_at:new Date(2026,9,7,1).toISOString(),duration_s:60,commits:9}],'2026-10-05',label,'2026-10-06');
assert.deepEqual(night.items.map(i=>i.run.id),['n1','n2'],'a window through a second day keeps both days and nothing after');assert.equal(night.through,'2026-10-06');
assert.equal(D.compute([],'2026-10-05',label,'2026-10-20').through,'2026-10-05','a window longer than seven days is not accepted');
assert.equal(D.compute([],'2026-10-05',label,'2026-10-01').through,'2026-10-05');
const R=k=>D.render(m,{esc,mine:true,dayLabel:'d',leadWith:k,leadHref:x=>'/?day=2026-10-05&lead='+x});const idx=(h,t)=>h.indexOf(t);
assert.ok(idx(R('result'),'What got done')<idx(R('result'),'Ask the room')&&idx(R('result'),'Ask the room')<idx(R('result'),'Where the commits landed'));assert.ok(idx(R('journey'),'Where the commits landed')<idx(R('journey'),'Ask the room'));
assert.ok(idx(R('numbers'),'Where the commits landed')<idx(R('numbers'),'What got done'));assert.match(R('journey'),/lead=numbers/);assert.equal(D.leadOf('x'),'result');
assert.ok(!D.render(m,{esc,mine:false,dayLabel:'d',leadWith:'journey'}).includes('Lead with'),'a reader gets no chooser');
const depth=D.compute([{id:'d1',project:'deep',started_at:at(9),duration_s:600,commits:1,story_result:'TEST DATA the one that says something',feedback_question:'q?'},...['w','x','y','z'].map((n,i)=>({id:n,project:n,started_at:at(10+i),duration_s:60,commits:20}))],'2026-10-05',label);
const dr=D.render(depth,{esc,mine:false,dayLabel:'d',leadWith:'result'});
assert.match(dr,/<h1>TEST DATA the one that says something<\/h1>/,'leading with the result, the headline is what the author wrote, not a count');
assert.match(dr,/81 commits across 5 projects\./);assert.equal((dr.match(/class="day-line"/g)||[]).length,1,'only the project with a written result gets a full row');
assert.equal((dr.match(/class="day-quiet"/g)||[]).length,4);assert.match(dr,/<details class="day-untold" >/,'for a reader the unwritten projects are folded');
assert.match(D.render(depth,{esc,mine:false,dayLabel:'d',leadWith:'numbers'}),/<h1>81 commits across 5 projects\.<\/h1>/);
const zg=g.groups.find(x=>x.label==='zup'),bg=g.groups.find(x=>x.label==='Work on bagel');
assert.equal(zg.marks.length,1);assert.equal(zg.gitCommits,17);assert.equal(zg.runs.length,2,'git marks sit on the lane of the project that also has sessions');
assert.equal(bg.gitOnly,true);assert.equal(bg.runs.length,0);assert.equal(bg.gitCommits,48,'a project with git history and no captured session still gets a lane');
assert.match(gr,/class="day-mark"/);assert.match(gr,/48 commits, git/);
const failed=D.compute([{id:'f1',project:'arc',title:'Work on arc',story_result:'TEST DATA both arms ended in ERROR.',...ev(4)}],'2026-10-05',label);
const fr=D.render(failed,{esc,mine:false,dayLabel:'d',leadWith:'journey'});
assert.match(fr,/TEST DATA both arms ended in ERROR\./,'a written result on a git-history row is shown, failure included');assert.match(fr,/4 commits, from git history/);
assert.ok(!/Claude Code|Codex/.test(fr),'a git-history lane names no harness and no session');
assert.equal(failed.items.length,0);assert.equal(failed.peak,0);
console.log('PASS: git marks without session attribution; depth over count; night window, lead order; recovered git history; day membership, unknown commits, plumbing fold, peak, lead run, models, escaping and owner-only links');
