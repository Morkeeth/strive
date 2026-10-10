import assert from 'node:assert/strict';import {createRequire} from 'node:module';import fs from 'node:fs';import vm from 'node:vm';
const require=createRequire(import.meta.url),Auth=require('../site/auth.js'),Feed=require('../site/feed-card.js'),Origin=require('../site/origin.js');
const profile={id:'p-a',auth_uid:'u-a',handle:'my-strive-name',display_name:'Current owner',github_handle:'real-github',avatar_url:null};
assert.equal(Auth.present(profile).avatar_url,null,'an owner-free profile has no saved avatar URL');
assert.match(Feed.face({profiles:profile}),/github\.com\/real-github\.png/,'verified GitHub alias supplies public photo');
assert.equal(Auth.present({...profile,avatar_url:'https://images.test/chosen.jpg'}).avatar_url,'https://images.test/chosen.jpg');
const provider={id:'u-a',identities:[{provider:'x',identity_data:{avatar_url:'https://images.test/provider.jpg'}}]};
assert.equal(Auth.present({...profile,github_handle:null},provider).avatar_url,'https://images.test/provider.jpg');
assert.equal(Auth.present({...profile,github_handle:null},{...provider,id:'u-b'}).avatar_url,null,'never borrow another account provider photo');
assert.equal(Auth.present({...profile,github_handle:null,avatar_url:'javascript:bad'}).avatar_url,null);
const context={window:{GrinderAuth:Auth},URLSearchParams,location:{search:'?account'},sessionStorage:{getItem:()=>null},document:{getElementById:()=>null}};
vm.createContext(context);vm.runInContext(fs.readFileSync('site/account.js','utf8'),context);
const make=enabled=>context.window.GrinderAccount({providersEnabled:enabled,origin:Origin.create()});
let panel=make(['github']).panelHtml(profile,[{id:'g',provider:'github',handle:'real-github'}],null,null,{id:'u-a'});
assert.match(panel,/Linked accounts/);assert.doesNotMatch(panel,/data-link="x"/);assert.match(panel,/X.*not available/s);assert.match(panel,/Origin repositories/);assert.doesNotMatch(panel,/data-origin-connect/);assert.match(panel,/href="\/\?feedback"/);
panel=make(['github','x']).panelHtml(profile,[{id:'g',provider:'github'}],null,null,{id:'u-a'});
assert.match(panel,/data-link="x"/);assert.doesNotMatch(panel,/X sign-in is unavailable/);
assert.doesNotMatch(make(['github','x']).identitiesHtml([{id:'t',provider:'twitter'}]),/data-link="x"/,'legacy Twitter identity already links X account');
console.log('PASS: shared current avatar, explicit image priority, cross-account refusal and truthful linked-account/Origin states');
const html=fs.readFileSync('site/index.html','utf8');
const loadSource=html.slice(html.indexOf('async function loadProviders(){'),html.indexOf('const providerLabel='));
for(const [external,wanted] of [[{x:false,twitter:false},['github']],[{twitter:true},['github','twitter']],[{x:true},['github','x']]]){
 const ctx={SB_URL:'https://auth.example.test',SB_KEY:'public',PROVIDERS_ENABLED:['github'],EMAIL_SIGNIN_READY:false,AbortSignal,fetch:async()=>({ok:true,json:async()=>({external})})};
 vm.createContext(ctx);vm.runInContext(loadSource,ctx);await ctx.loadProviders();assert.deepEqual(ctx.PROVIDERS_ENABLED,wanted);
}
const legacy=make(['github','twitter']).identitiesHtml([{id:'g',provider:'github'}]);assert.match(legacy,/data-link="twitter"/);assert.doesNotMatch(legacy,/data-link="x"/);
const calls=[];const api=Auth.create({client:{from(){throw new Error("unused")},auth:{linkIdentity:async v=>{calls.push(v.provider);return {data:{},error:null}},signInWithOAuth:async v=>{calls.push(v.provider);return {error:null}}}},storage:{setItem(){},getItem(){return null}},redirectTo:'https://strive.test/'});
await api.signIn('twitter');await api.link('twitter');assert.deepEqual(calls,['twitter','twitter']);
console.log('PASS: disabled X remains absent; x and twitter identifiers reach their actual OAuth endpoint');
const refreshSource=html.slice(html.indexOf('async function refreshAuth(){'),html.indexOf('// The publish payload survives'));
let resolve;const nodes={};const ctx={AUTH_GENERATION:0,AUTH_USER:null,ME:null,IDENTITY_SETUP:null,
 auth:{current:()=>new Promise(r=>resolve=r)},$:id=>nodes[id]||(nodes[id]={innerHTML:'',outerHTML:'',hidden:false}),
 GrinderAuth:Auth,GrinderFeed:Feed,window:{GrinderFeed:Feed},profileHandle:p=>p.handle,esc:s=>s,syncAuthNav(){},status(){},social:{}};
vm.createContext(ctx);vm.runInContext(refreshSource,ctx);
let job=ctx.refreshAuth();resolve({user:{id:'u-a'},profile});await job;
assert.match(nodes['nav-avatar'].outerHTML,/github\.com\/real-github\.png/,'actual header uses verified GitHub photo');
job=ctx.refreshAuth();ctx.AUTH_GENERATION++;ctx.ME={id:'p-b'};nodes['nav-avatar'].outerHTML='CURRENT B';resolve({user:{id:'u-a'},profile});await job;
assert.equal(nodes['nav-avatar'].outerHTML,'CURRENT B');assert.equal(ctx.ME.id,'p-b');
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(m[1].trim())new vm.Script(m[1]);
console.log('PASS: real header renders shared avatar and discards prior-account delayed refresh');
// Settings cannot return an old account panel after the shared shell changed identity.
{
 let selected={id:'a'},finish;const root={innerHTML:'CURRENT B'};
 const controller=context.window.GrinderAccount({me:()=>selected,app:root,auth:{recoverFromUrl:()=>null,pending:()=>null,current:()=>new Promise(r=>finish=r)}});
 const job=controller.view();selected={id:'b'};finish({user:{id:'u-a'},profile});await job;
 assert.equal(root.innerHTML,'CURRENT B');
}
// An explicit runtime disable wins over a previously baked-in X flag.
{
 const ctx={SB_URL:'https://auth.example.test',SB_KEY:'public',PROVIDERS_ENABLED:['github','x'],EMAIL_SIGNIN_READY:false,AbortSignal,fetch:async()=>({ok:true,json:async()=>({external:{x:false,twitter:false}})})};
 vm.createContext(ctx);vm.runInContext(loadSource,ctx);await ctx.loadProviders();assert.deepEqual(ctx.PROVIDERS_ENABLED,['github']);
}
console.log('PASS: settings rejects stale identity and runtime-disabled X is never offered');
