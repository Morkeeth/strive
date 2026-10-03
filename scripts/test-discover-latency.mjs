import vm from 'node:vm';import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
const source=readFileSync(process.env.STRIVE_INDEX_SOURCE||'site/index.html','utf8');
const fn='async function viewExplore(){'+source.split('async function viewExplore(){')[1].split('\nfunction viewFeedback')[0];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const results=[];
for(const size of [0,3,5]){
 let counts=0;const events=[];const app={innerHTML:''},runs=Array.from({length:size},(_,id)=>({id}));
 const query={select(){return this},eq(){return this},order(){return this},async limit(){await delay(60);return {data:runs}}};
 const box={$:()=>app,ME:{id:'test'},sb:{from:()=>query},setPrimarySection(){},frame(){},railHtml:()=>'',feedTabs:()=>'',skeletonCard:()=>'',noteTraces(){},status(){},ackData:async()=>{events.push("ack-start");await delay(60);events.push("ack-end");return{}},runCount:async()=>{counts++;events.push("count-start");await delay(60);return 0},discoverySourcesHtml:()=>'<directories>',feedCards:()=>'<cards>',GrinderFeed:{nextSlot:()=>'<next>'},wireKudos(){},countUp(){}};
 vm.createContext(box);vm.runInContext(fn,box);const start=performance.now();await box.viewExplore();
 const elapsed=Math.round(performance.now()-start);results.push({rows:size,elapsed_ms:elapsed,countQueries:counts});
 assert.equal(app.innerHTML.includes('<next>'),size>0);
 if(!process.env.STRIVE_BASELINE&&size)assert.ok(app.innerHTML.indexOf('<cards>')<app.innerHTML.indexOf('<directories>'));
 if(!process.env.STRIVE_BASELINE){assert.equal(counts,size>=4?1:0);if(size>=4)assert.ok(events.indexOf("count-start")<events.indexOf("ack-end"));}
}
console.log(JSON.stringify({method:'actual viewExplore function; each independent mocked network stage60ms; no live API',results},null,2));
