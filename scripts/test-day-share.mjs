// Rules of "Choose what readers see" that hold without a browser (site/day-share.js), and the day's lead run.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const S=require('../site/day-share.js'),D=require('../site/day.js');
const at=h=>new Date(2026,9,5,h).toISOString();
const ev=c=>({trace_basis:'historical-reconstruction',history_evidence:{repo_window_start:at(9),repo_window_end:at(10),first_observed_at:at(8),last_observed_at:at(17),history_entries:5,repo_commits:c,repo_revision:'a'.repeat(40),source_ref:'b'.repeat(64)}});
const runs=[{id:'a',project:'p',started_at:at(10),duration_s:600,commits:1,story_result:'TEST DATA said by the author',visibility:'private',harness:'Codex'},
 {id:'b',project:'p',started_at:at(11),duration_s:600,visibility:'public',feedback_question:'q?',story_result:'TEST DATA other'},{id:'c',project:null,started_at:at(12),duration_s:60,visibility:'private'},
 {id:'g',project:'p',title:'w',visibility:'private',...ev(4)}];
const label=v=>v||'',model=D.compute(runs,'2026-10-05',label),items=S.collect(model);
assert.deepEqual(items.map(i=>[i.id,i.git,i.visibility]),[['a',false,'private'],['b',false,'public'],['c',false,'private'],['g',true,'private']]);
const now=new Set(['b']);assert.deepEqual(S.plan(items,now),{toPublic:[],toPrivate:[]},'the starting choice is how things already are: nothing changes by opening the page');
const want=new Set(['a','g']),d=S.plan(items,want);
assert.deepEqual([d.toPublic.map(i=>i.id),d.toPrivate.map(i=>i.id)],[['a','g'],['b']]);
assert.deepEqual(S.preview(items,want),{runs:1,git:1,projects:1,hidden:2,results:1});
assert.deepEqual(S.preview(items,new Set()),{runs:0,git:0,projects:0,hidden:4,results:0},'with nothing ticked a reader finds nothing');
for(const i of d.toPublic)i.visibility='public';for(const i of d.toPrivate)i.visibility='private';
assert.deepEqual(S.plan(items,want),{toPublic:[],toPrivate:[]},'pressing again after it worked changes nothing');
items[0].visibility='private';assert.deepEqual(S.plan(items,want).toPublic.map(i=>i.id),['a'],'after a partial failure only what is still different is retried');
assert.equal(model.lead.run.id,'b','without a choice the run that asks a question leads');
assert.equal(D.compute(runs,'2026-10-05',label,null,'a').lead.run.id,'a','the author can name the run that leads');
assert.equal(D.compute(runs,'2026-10-05',label,null,'not-a-run').lead.run.id,'b','a run that is not on the day cannot lead it');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
assert.match(D.render(D.compute(runs,'2026-10-05',label,null,'a'),{esc,mine:false,dayLabel:'d',leadWith:'result'}),/<h1>TEST DATA said by the author<\/h1>/,'the headline is the sentence the author wrote on the run that leads');
console.log('PASS: nothing changes on open, exact plan and reader preview, retry only the difference, author names the lead run');

// The share screen shows the owner's totals beside the reader's, so the smaller reader card is no surprise.
{
  const rows=[{id:'a',project:'P',git:false,commits:null},{id:'b',project:'P',git:true,commits:7},{id:'c',project:'Q',git:false,commits:1},{id:'d',project:'Q',git:false,commits:null},{id:'e',project:'',git:false,commits:3}];
  assert.deepEqual(S.compare(rows,new Set(['c','d'])),{yours:{projects:2,commits:8,runs:3},readers:{projects:1,commits:1,runs:2}});
  assert.deepEqual(S.compare(rows,new Set(['a'])).readers,{projects:1,commits:null,runs:1},'a commit count nobody recorded stays unknown, never zero');
  assert.deepEqual(S.compare(rows,new Set()).readers,{projects:0,commits:null,runs:0});
}
