// One project as a journey (site/journey.js): what counts as a turning point, and what a reader meets first.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const J=createRequire(import.meta.url)('../site/journey.js');
const at=(d,h)=>new Date(2026,9,d,h).toISOString();
const runs=[
 {id:'c',started_at:at(5,18),duration_s:3600,commits:3,story_result:'TEST DATA third',story_next:'TEST DATA still open',feedback_question:'TEST DATA q?',harness:'Claude Code'},
 {id:'a',started_at:at(4,9),duration_s:1800,commits:2,caption:'TEST DATA first'},
 {id:'b',started_at:at(5,10),duration_s:600,commits:null},
 {id:'g',trace_basis:'historical-reconstruction',history_evidence:{repo_commits:16,repo_window_end:at(5,20)},caption:'boilerplate'},
 {id:'bad',started_at:'nope',commits:9,caption:'x'}];
const j=J.compute(runs);
assert.deepEqual(j.points.map(p=>[p.run.id,p.after]),[['a',2],['b',2],['c',5]],'runs in time order with commits so far; a recovered git row and an unreadable start are not points');
assert.deepEqual(j.turning.map(p=>p.run.id),['a','c'],'only a run with a written result is a turning point');
assert.equal(j.commits,5);assert.equal(j.commitsUnknown,1);assert.equal(j.gitCommits,16);assert.equal(j.days,2);assert.equal(j.open,'TEST DATA still open');assert.equal(j.question,'TEST DATA q?');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const share=k=>'/?project=x&scope=mine&lead='+k;
const result=J.render(j,{esc,mine:true,leadWith:'result',shareHref:share}),journey=J.render(j,{esc,mine:true,leadWith:'journey',shareHref:share}),numbers=J.render(j,{esc,mine:true,leadWith:'numbers',shareHref:share});
const pos=(h,c)=>h.indexOf(`class="${c}"`);
assert.ok(pos(result,'j-result')<pos(result,'j-journey')&&pos(result,'j-journey')<pos(result,'j-numbers'));
assert.ok(pos(journey,'j-journey')<pos(journey,'j-result'));assert.ok(pos(numbers,'j-numbers')<pos(numbers,'j-result'));
assert.equal(J.lead('anything else'),'result','an unknown choice falls back to the result');
assert.match(result,/TEST DATA third/);assert.match(result,/Commits, from git history/);assert.equal((result.match(/class="j-ring"/g)||[]).length,2);assert.equal((result.match(/class="j-dot"/g)||[]).length,1);
assert.ok(!J.render(j,{esc,mine:false,leadWith:'result'}).includes('Lead with'),'a reader gets no chooser');
const one=J.render(J.compute([runs[1]]),{esc,mine:true,leadWith:'result',shareHref:share});assert.ok(!one.includes('<svg'),'one run draws no line');
assert.match(J.render(J.compute([{id:'n',started_at:at(5,9),commits:1}]),{esc,mine:true,shareHref:share}),/No turning point yet/);
assert.equal(J.render(J.compute([]),{esc,mine:true}),'');
assert.ok(!J.render(J.compute([{id:'h',started_at:at(5,9),caption:'<script>1</script>'}]),{esc,mine:false}).includes('<script>'));
assert.ok(![result,journey,numbers].some(h=>h.includes('undefined')||h.includes('NaN')));
const calls=J.compute([{id:'t1',started_at:at(5,9),commits:0,tool_calls:40,caption:'TEST DATA a'},{id:'t2',started_at:at(5,12),commits:0,tool_calls:60,caption:'TEST DATA b'}]);
assert.deepEqual(calls.metric,{key:'callsAfter',total:100,unit:'tool call'},'with no commits recorded the trace climbs with tool calls');
assert.match(J.render(calls,{esc,mine:false}),/100 tool calls recorded/);assert.equal(j.metric.unit,'commit');
assert.ok(!J.render(J.compute([{id:'z1',started_at:at(5,9),caption:'a'},{id:'z2',started_at:at(5,10),caption:'b'}]),{esc,mine:false}).includes('<svg'),'nothing recorded, no trace');
const st=J.strip(j,{esc,currentId:'c',projectHref:'/?project=x&scope=mine',projectName:'X'});
assert.match(st,/<li class="j-here">/);assert.match(st,/this run/);assert.match(st,/2 turning points in 3 runs/);
assert.equal(J.strip(J.compute([runs[1]]),{esc,currentId:'a',projectHref:'/',projectName:'X'}),'','one run alone has no journey to sit in');
assert.ok(!J.strip(j,{esc,currentId:'b',projectHref:'/',projectName:'X'}).includes('j-here'),'a run that is not a turning point is not highlighted');
console.log('PASS: run strip; trace metric; turning points need a written result, recovered rows are not points, lead order, reader view, escaping');
