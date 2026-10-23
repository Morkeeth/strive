import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const timers=[];
const box={window:{},setInterval:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearInterval:()=>{}};
vm.createContext(box);
vm.runInContext(fs.readFileSync('site/feed-refresh.js','utf8'),box);
const index=fs.readFileSync('site/index.html','utf8');
assert.match(index,/script src="\/feed-refresh\.js"/);
assert.match(index,/feedRefresh\.start\(\{/);
assert.match(index,/feedRefresh\.stop\(\)/);
assert.match(index,/viewLanding\(\{requireComplete:true\}\)===false/,'automatic refresh requires a complete end-to-end feed read');
assert.match(index,/if\(requireComplete&&data\.runs===null\)return false/,'a failed full feed query keeps the changed token retryable');
assert.match(index,/feedCards\(page,await ackData\(page\),\{current,requireComplete\}\)/,'automatic refresh passes the complete-read requirement through card rendering');
assert.match(index,/if\(saved\?\.error\)\{if\(requireComplete\)throw Error\('Card choices could not load\.'\)/,'a failed day-card read keeps the changed token retryable');
assert.match(index,/if\(!requireComplete\)\{frame\(null,null,true\);[^\n]+app\.innerHTML=feedTabs\('home'\)\+landingHTML\(\)/,'automatic refresh keeps the current feed visible while reads complete');
assert.match(index,/if\(!requireComplete\)\{if\(!body\.querySelector\('\.feed-skeleton'\)\)body\.innerHTML=''/,'automatic refresh does not clear the current feed before the replacement is complete');
assert.match(index,/if\(requireComplete\)return \{html,mount:/,'complete refresh returns an explicit post-commit card mount');
assert.match(index,/complete\.mount\(\)/,'refreshed cards are wired only after their HTML is committed');
assert.match(index,/if\(requireComplete\)\{\$\('feed-more'\)\?\.closest\('\.feed-more-row'\)\?\.remove\(\)/,'successful refresh replaces the existing Show more control');
assert.match(index,/if\(!requireComplete\)feedRefresh\.start\(\{/,'a refresh does not restart and invalidate its own poll');

let visible=true,token='run-1',refreshes=0,reads=0,failRefresh=false;
const refresh=box.window.StriveFeedRefresh.create({setInterval:box.setInterval,clearInterval:box.clearInterval,visible:()=>visible});
refresh.start({baseline:'run-1',probe:async()=>{reads++;return token;},refresh:async()=>{refreshes++;if(failRefresh)throw Error('render failed');}});
assert.equal(timers.length,1);assert.equal(timers[0].ms,30000);
await timers[0].fn();assert.equal(refreshes,0,'the same newest run does not repaint the feed');
token='run-2';await timers[0].fn();assert.equal(refreshes,1,'a newly posted run refreshes the feed without a manual reload');
await timers[0].fn();assert.equal(refreshes,1,'the new token becomes the baseline after refresh');
token='run-3';failRefresh=true;await timers[0].fn();assert.equal(refreshes,2,'a failed repaint is attempted');
failRefresh=false;await timers[0].fn();assert.equal(refreshes,3,'a failed repaint does not consume the new token');
visible=false;token='run-4';await timers[0].fn();assert.equal(reads,5,'a hidden tab does not spend a feed read');assert.equal(refreshes,3);

vm.runInContext(fs.readFileSync('site/home.js','utf8'),box);
const query=new Proxy({}, {get:(_,key)=>key==='then'?resolve=>resolve({data:[{id:'newest',created_at:'2026-10-21T00:00:00Z'}],count:2,error:null}):()=>query});
const publicToken=await box.window.GrinderHome.latestRunToken({from:()=>query});
assert.equal(publicToken,'newest','the probe uses the public feed membership');

let coldRefreshes=0;
const cold=box.window.StriveFeedRefresh.create({setInterval:box.setInterval,clearInterval:box.clearInterval,visible:()=>true});
cold.start({baseline:null,probe:async()=>publicToken,refresh:async()=>{coldRefreshes++;}});await cold.tick();
assert.equal(coldRefreshes,1,'a failed initial baseline refreshes once when polling recovers');

let resolveOld,oldRefreshes=0,newRefreshes=0;
const restarted=box.window.StriveFeedRefresh.create({setInterval:box.setInterval,clearInterval:box.clearInterval,visible:()=>true});
restarted.start({baseline:'old',probe:()=>new Promise(resolve=>{resolveOld=resolve}),refresh:async()=>{oldRefreshes++;}});
const oldTick=restarted.tick();await Promise.resolve();restarted.stop();
restarted.start({baseline:'new',probe:async()=> 'new',refresh:async()=>{newRefreshes++;}});
resolveOld('changed');await oldTick;assert.equal(oldRefreshes,0,'a stopped poll cannot call its old refresh');assert.equal(newRefreshes,0,'a stopped poll cannot call a later route refresh');

let publicRows=[{id:'a'},{id:'b'}];
const membershipQuery=new Proxy({}, {get:(_,key)=>key==='then'?resolve=>resolve({data:publicRows,error:null}):()=>membershipQuery});
const membershipClient={from:()=>membershipQuery};
const beforeSwap=await box.window.GrinderHome.latestRunToken(membershipClient);
publicRows=[{id:'a'},{id:'c'}];
const afterSwap=await box.window.GrinderHome.latestRunToken(membershipClient);
assert.notEqual(afterSwap,beforeSwap,'a same-count public/private membership swap changes the token');

console.log('PASS feed refreshes once for a new public run and pauses while hidden.');
