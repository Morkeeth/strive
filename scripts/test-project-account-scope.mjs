import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const Activity=createRequire(import.meta.url)('../site/activity-order.js');
globalThis.GrinderContract={projectLabel:s=>s};
const ui={StriveActivity:Activity,history:{replaceState(){}},feedCards:async (rows,ad,{decorate=html=>html}={})=>rows.map(r=>decorate(`CARD:${r.id}:${r.visibility}`,r)).join(''),wireKudos(){},StriveProjectFollow:{mount(){}},showSignIn(){}};
const html=readFileSync('site/index.html','utf8');
const fn=html.slice(html.indexOf('async function viewProjects()'),html.indexOf('function toolLogoHtml'));
const rows=[
 {project:'Oscar private work',profile_id:'oscar',visibility:'private',created_at:'2026-10-02'},
 {project:'Shared public work',profile_id:'oscar',visibility:'public',created_at:'2026-10-01'},
 {project:'Odawg private work',profile_id:'odawg',visibility:'private',created_at:'2026-10-03'}
];
async function render(me,search='?projects'){
 const app={innerHTML:''};let filters=[];
 const query={select(){return this},eq(k,v){filters.push(r=>r[k]===v);return this},not(k,op,v){filters.push(r=>r[k]!==v);return this},order(){return this},limit(){return Promise.resolve({data:rows.filter(r=>filters.every(f=>f(r)))})}};
 const ctx=vm.createContext({...ui,ackData:async()=>({mine:new Set(),counts:{}}),ME:me?{id:me}:null,location:{search},URLSearchParams,$:()=>app,frame(){},railHtml(){},setPrimarySection(){},skeletonCard(){return ''},sb:{from:()=>query},status(){},GrinderContract:{projectLabel:s=>s},projectTotals:r=>({runs:r.length,builders:new Set(r.map(x=>x.profile_id)).size,tool_calls:0}),safeOutputUrl:s=>s,esc:s=>s});
 await vm.runInContext(fn+';viewProjects()',ctx);return app.innerHTML;
}
const own=await render('odawg');
assert.match(own,/My projects/);assert.match(own,/scope=mine/);assert.match(own,/Odawg private work/i);assert.doesNotMatch(own,/Oscar private work|Shared public work/i);
const oscar=await render('oscar');assert.match(oscar,/Oscar private work/i);assert.doesNotMatch(oscar,/Odawg private work/i);
const publicPage=await render('odawg','?projects&scope=public');assert.match(publicPage,/Public projects/);assert.match(publicPage,/Shared public work/i);assert.doesNotMatch(publicPage,/Oscar private work|Odawg private work/i);
const stranger=await render(null);assert.match(stranger,/My projects/);assert.match(stranger,/Sign in to see your projects and private work/);assert.doesNotMatch(stranger,/Oscar private work|Odawg private work/i);
const anonymousPublic=await render(null,'?projects&scope=public');assert.match(anonymousPublic,/Shared public work/i);assert.doesNotMatch(anonymousPublic,/Oscar private work|Odawg private work/i);
console.log('PASS: accounts see only their own projects; signed-out My projects requests sign-in; explicit Public projects is public-only');

if(process.env.STRIVE_QA_DIR){
 mkdirSync(process.env.STRIVE_QA_DIR,{recursive:true});
 const head=html.slice(html.indexOf('<head>'),html.indexOf('</head>')+7).replaceAll('__BRAND__','STRIVE').replaceAll('__TAGLINE__','Post your strides');
 for(const [name,body] of [['personal',own],['public',publicPage]]) writeFileSync(`${process.env.STRIVE_QA_DIR}/${name}.html`,`<!doctype html><html>${head}<body><main style="max-width:680px;margin:32px auto;padding:16px">${body}</main></body></html>`);
}

// Execute the actual detail function against distinct public and owner-only rows.
// The query double supplies transport results; filtering and rendering stay real.
const detailFn=html.slice(html.indexOf('async function viewProject(name)'),html.indexOf('async function viewProjects()'));
const detailRows=[
 {id:'public-run',project:'Shared name',profile_id:'someone',visibility:'public',created_at:'2026-10-01'},
 {id:'oscar-private-run',project:'Shared name',profile_id:'oscar',visibility:'private',created_at:'2026-10-02'},
 {id:'odawg-private-run',project:'Shared name',profile_id:'odawg',visibility:'private',created_at:'2026-10-03'}
];
function harness({me='odawg',search='?project=Shared%20name',fail=false,delayQuery=false,delayAcks=false,dataRows=detailRows}={}){
 const renders=[];let releaseQuery,releaseAcks,queries=0,acks=0;
 const app={set innerHTML(value){renders.push(value)},get innerHTML(){return renders.at(-1)||''}};
 const sb={from(){const filters=[];return {
  select(){return this},eq(k,v){filters.push(r=>r[k]===v);return this},
  not(k,op,v){filters.push(r=>r[k]!==v);return this},order(){return this},
  limit(){
   queries++;
   const result=fail?{data:null,error:{message:'test transport failed'}}:{data:dataRows.filter(r=>filters.every(f=>f(r)))};
   if(delayQuery&&queries===1)return new Promise(resolve=>{releaseQuery=()=>resolve(result)});
   return Promise.resolve(result);
  }
 }}};
 const ctx=vm.createContext({...ui,
  ME:me?{id:me}:null,location:{search},URLSearchParams,$:()=>app,
  frame(){},railHtml(){},setPrimarySection(){},skeletonCard(){return 'Loading'},
  PROJECT_SELECT:'*',sb,status(){},noteTraces(){},GrinderContract:{projectLabel:s=>s},
  safeOutputUrl:s=>s,esc:s=>s,
  projectTotals:r=>({runs:r.length,builders:new Set(r.map(x=>x.profile_id)).size,tool_calls:0,commits:0}),
  ackData(){
   acks++;const result={mine:new Set(),counts:{}};
   if(delayAcks&&acks===1)return new Promise(resolve=>{releaseAcks=()=>resolve(result)});
   return Promise.resolve(result);
  },
  runCard:r=>`CARD:${r.id}:${r.visibility}`,wireKudos(){},countUp(){}
 });
 return {ctx,app,renders,releaseQuery:()=>releaseQuery(),releaseAcks:()=>releaseAcks(),
  hasPendingAcks:()=>!!releaseAcks,queries:()=>queries,
  startDetail:()=>vm.runInContext(detailFn+';viewProject("Shared name")',ctx),
  startList:()=>vm.runInContext(fn+';viewProjects()',ctx)};
}
for(const search of ['?project=Shared%20name','?project=Shared%20name&scope=public']){
 const h=harness({search});await h.startDetail();
 assert.match(h.app.innerHTML,/PUBLIC PROJECT/);assert.match(h.app.innerHTML,/CARD:public-run/);
 assert.doesNotMatch(h.app.innerHTML,/CARD:oscar-private-run|CARD:odawg-private-run/);
}
const personalDetail=harness({search:'?project=Shared%20name&scope=mine'});await personalDetail.startDetail();
assert.match(personalDetail.app.innerHTML,/MY PROJECT/);assert.match(personalDetail.app.innerHTML,/CARD:odawg-private-run/);
assert.doesNotMatch(personalDetail.app.innerHTML,/CARD:public-run|CARD:oscar-private-run/);
const failedDetail=harness({search:'?project=Shared%20name&scope=mine',fail:true});await failedDetail.startDetail();
assert.match(failedDetail.app.innerHTML,/could not load/);assert.doesNotMatch(failedDetail.app.innerHTML,/No saved runs|CARD:/);
console.log('PASS: default and public details exclude private runs; mine details isolate the owner; query errors stay errors');

// Resolve a response captured for the old account only after the identity changed.
const switchedList=harness({me:'oscar',search:'?projects',delayQuery:true,dataRows:rows});
const listPending=switchedList.startList();switchedList.ctx.ME={id:'odawg'};switchedList.releaseQuery();await listPending;
assert.equal(switchedList.queries(),2);
assert.equal(switchedList.renders.some(s=>s.includes('Oscar private work')),false);
assert.match(switchedList.app.innerHTML,/My projects/);
assert.match(switchedList.app.innerHTML,/Odawg private work/i);
const switchedDetail=harness({me:'oscar',search:'?project=Shared%20name&scope=mine',delayQuery:true});
const detailPending=switchedDetail.startDetail();switchedDetail.ctx.ME={id:'odawg'};switchedDetail.releaseQuery();await detailPending;
assert.equal(switchedDetail.renders.some(s=>s.includes('CARD:oscar-private-run')),false);
assert.match(switchedDetail.app.innerHTML,/CARD:odawg-private-run/);
assert.equal(switchedDetail.queries(),2);

// A later await can also cross an account change, after runs have loaded.
const lateSwitch=harness({me:'oscar',search:'?project=Shared%20name&scope=mine',delayAcks:true});
const latePending=lateSwitch.startDetail();
for(let i=0;i<10&&!lateSwitch.hasPendingAcks();i++)await Promise.resolve();
assert.equal(lateSwitch.hasPendingAcks(),true,'detail reached its pending acknowledgement request');
lateSwitch.ctx.ME={id:'odawg'};lateSwitch.releaseAcks();await latePending;
assert.equal(lateSwitch.renders.some(s=>s.includes('CARD:oscar-private-run')),false);
assert.match(lateSwitch.app.innerHTML,/CARD:odawg-private-run/);

const signedOut=harness({me:'oscar',search:'?project=Shared%20name&scope=mine',delayQuery:true});
const logoutPending=signedOut.startDetail();signedOut.ctx.ME=null;signedOut.releaseQuery();await logoutPending;
assert.equal(signedOut.renders.some(s=>s.includes('CARD:oscar-private-run')),false);
assert.match(signedOut.app.innerHTML,/PUBLIC PROJECT/);assert.match(signedOut.app.innerHTML,/CARD:public-run/);
console.log('PASS: delayed personal responses never render after account switch or sign-out, including the later acknowledgement await');
