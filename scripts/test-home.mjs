// site/home.js: the week strip, builders, popular runs and rows, from real-shaped data only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const H=createRequire(import.meta.url)('../site/home.js');
const now=new Date(2026,8,25,12).getTime();
const at=(d,h=10)=>new Date(new Date(2026,8,25+d,h).getTime()).toISOString();
// Week: 14 days, runs only behind (and today), events only ahead (and today).
const runs=[{id:'a',profile_id:'p1',visibility:'public',created_at:at(0)},{id:'b',profile_id:'p1',visibility:'public',created_at:at(-3)},{id:'c',profile_id:'p2',visibility:'public',created_at:at(-3)},{id:'old',profile_id:'p3',visibility:'public',created_at:at(-20)}];
const events=[{id:'e1',title:'Sunday <b>builders</b>',starts_at:at(2,15),place:'Paris',club:{name:'Club & co'},going:3},{id:'past',title:'x',starts_at:at(-2)}];
const w=H.week(runs,events,now);
assert.equal(w.days.length,14);
assert.equal(w.days.find(d=>d.t===w.today).runs,1);
assert.equal(w.days.reduce((a,d)=>a+d.runs,0),3,'the 20-day-old run is off the strip');
assert.equal(w.days.filter(d=>d.t<=w.today).length,7,'seven days of runs including today');
assert.equal(w.days.filter(d=>d.t>w.today).length,7,'seven days ahead');
// A run 7 days back is outside 'the last 7 days' (today counts as one of them).
assert.equal(H.week([{id:'x',created_at:at(-7)}],[],now).days.reduce((a,d)=>a+d.runs,0),0);
// Across the end of daylight saving (Paris, 25 Oct 2026) every date appears once.
{const t=new Date(2026,9,22,12).getTime();const keys=H.week([],[],t).days.map(d=>new Date(d.t).getDate());assert.equal(new Set(keys).size,14);}
assert.equal(w.days.reduce((a,d)=>a+d.events.length,0),1,'a past event is not shown ahead');
const html=H.weekHtml(runs,events,now);
assert.match(html,/3 public runs in the last 7 days · 1 event in the next 7/);
assert.ok(!html.includes('<b>builders</b>'),'event titles are escaped');
assert.match(H.weekHtml([],[],now),/No public runs in the last 7 days · no events in the next 7/);
// Rows escape everything they print.
const row=H.eventRow(events[0]);
assert.ok(row.includes('Sunday &lt;b&gt;builders&lt;/b&gt;')&&row.includes('Club &amp; co')&&row.includes('3 going'));
assert.ok(H.clubRow({id:'c"1',name:'<x>',members:1}).includes('&lt;x&gt;')&&H.clubRow({id:'c',name:'A',members:1}).includes('1 member<'));
// Builders: public only, most runs first, one row each.
const b=H.builders([...runs,{id:'priv',profile_id:'p9',visibility:'private',created_at:at(0)}]);
assert.deepEqual(b.map(x=>x.run.profile_id),['p1','p2','p3']);
assert.equal(b[0].n,2);
// Popular: most XUDOS first, then newest.
assert.deepEqual(H.popular(runs,{c:2,b:2}).map(r=>r.id),['b','c','a','old']);
assert.deepEqual(H.popular(runs,{old:5}).map(r=>r.id)[0],'old');
// read(): each failed section is null (the page says it failed); a missing events table is none.
const q=(result)=>{const o={select:()=>o,eq:()=>o,gte:()=>o,lt:()=>o,order:()=>o,limit:()=>o,then:(a,b)=>Promise.resolve(result).then(a,b)};return o};
const sbOK={from:(t)=>q(t==='grinder_events'?{data:null,error:{code:'PGRST205'}}:{data:[],error:null})};
const ok=await H.read(sbOK,now);
assert.deepEqual([ok.runs,ok.clubs,ok.events],[[],[],[]]);
const sbBad={from:(t)=>q(t==='grinder_crews'?{data:null,error:{code:'500'}}:{data:[],error:null})};
const bad=await H.read(sbBad,now);
assert.equal(bad.clubs,null);assert.deepEqual(bad.runs,[]);
const thrown=await H.read({from:()=>{throw new Error('x')}},now);
assert.deepEqual([thrown.runs,thrown.clubs,thrown.events],[null,null,null]);
assert.match(H.weekHtml([],null,now),/No public runs in the last 7 days · events could not load/);
assert.match(H.weekHtml(null,[],now),/Runs could not load · no events in the next 7/);
// Clubs and events as entry points: real rows, an honest empty line with the door still offered, and a failed read that says so.
{const H=(await import('../site/home.js')).default||globalThis.GrinderHome;
 const full=H.community({clubs:[{id:'c1',name:'TEST DATA club',members:2}],events:[{id:'e1',title:'TEST DATA event',place:'',starts_at:new Date(Date.now()+864e5).toISOString(),club:{name:'TEST DATA club'},going:1}]});
 assert.match(full,/href="\/\?crew=c1"/);assert.match(full,/href="\/\?event=e1"/);assert.match(full,/All clubs/);
 const none=H.community({clubs:[],events:[]});assert.match(none,/No public club yet\./);assert.match(none,/No event in the next 7 days\./);assert.match(none,/href="\/\?crews">Start or join a club/,'with no club the door is still offered');assert.ok(!/member|going/.test(none),'no activity is invented');
 const bad=H.community({clubs:null,events:null});assert.equal((bad.match(/data-failed/g)||[]).length,2,'a failed read says it failed and never says none');}
console.log('Home checks passed.');
