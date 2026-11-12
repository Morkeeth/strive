// Who can see this: one vocabulary, narrowest by default, unknown counts stay unknown.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const A=createRequire(import.meta.url)('../site/audience.js');
const text=html=>html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
assert.deepEqual(A.ORDER,['public','link','close_friends','private'],'four audiences, widest first');
assert.deepEqual(A.ORDER.map(A.label),['Everyone','Followers','Close friends','Only me']);
for(const v of ['anonymous',undefined,null,'','<script>'])assert.equal(A.label(v),'Only me','unknown or anonymous reads as the narrowest case');
assert.ok(!A.pill('<img onerror=x>').includes('<img'),'a stored value never becomes markup');
assert.match(text(A.pill('private',{owner:true,href:'#run-audience'})),/^Only me Change$/,'owner pill offers Change');
assert.ok(A.pill('private',{owner:true,href:'#a'}).startsWith('<a '),'owner pill is a link');
assert.ok(A.pill('public').startsWith('<span '),'reader pill is not a control');
assert.equal(text(A.pill('private',{shared:true,crew:true})),'Crew members','a crew share never reads as Only me');
assert.match(A.pill('link',{shared:true}),/aria-label="Shared with you\. Who can see this: Followers"/);
assert.equal(text(A.pill('crew',{owner:true,href:'#a'})),'Crew members Change');
// Ring mark counts reach: Only me has none, Everyone has three.
const rings=v=>(A.mark(v).match(/fill="none"/g)||[]).length;
assert.deepEqual(A.ORDER.map(rings),[3,2,1,0]);
// Options: the current audience is checked; counts appear only when known.
const html=A.options('link',{counts:{followers:2,closeFriends:0}});
assert.match(html,/value="link" checked/);
assert.match(html,/2 followers/);assert.match(html,/Your list is empty/);
assert.ok(!/followers<\/em>/.test(A.options('link',{counts:{followers:null,closeFriends:null}})),'unknown count is not printed as 0');
// Counts: a failing query is unknown (null), never zero.
const failing={from:()=>({select:()=>({eq:async()=>({error:{message:'down'},count:null})})})};
assert.deepEqual(await A.counts(failing,'p1'),{followers:null,closeFriends:null});
const working={from:t=>({select:()=>({eq:async()=>({error:null,count:t==='grinder_follows'?3:1})})})};
assert.deepEqual(await A.counts(working,'p1'),{followers:3,closeFriends:1});
// Profile strip: says how many are hidden; an unknown run count does not invent one.
assert.match(text(A.profileStrip({public:1,link:2,close_friends:0,private:1},{followers:1,closeFriends:0},{handle:'h'})),/3 more are hidden/);
assert.ok(!/hidden from them/.test(A.profileStrip(null,{},{handle:'h'})),'unknown runs make no hidden claim');
assert.match(A.profileStrip(null,{},{handle:'a b'}),/preview=public/);
console.log('audience: ok');
