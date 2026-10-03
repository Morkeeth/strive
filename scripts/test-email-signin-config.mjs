import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync('site/index.html','utf8');
const start=html.indexOf('const PROVIDERS_ENABLED=');
const end=html.indexOf('const profileHandle=',start);
async function providers(ready,external,fail=false){
 const code=html.slice(start,end).replace('const EMAIL_SIGNIN_READY=false;',`const EMAIL_SIGNIN_READY=${ready};`);
 const ctx=vm.createContext({SB_URL:'https://example.supabase.co',SB_KEY:'public',AbortSignal,fetch:async()=>{if(fail)throw Error('offline');return {ok:true,json:async()=>({external})}}});
 return JSON.parse(await vm.runInContext(code+';loadProviders().then(()=>JSON.stringify({providers:PROVIDERS_ENABLED,label:signInLabel()}))',ctx));
}
assert.deepEqual((await providers(false,{email:true})).providers,['github']);
assert.deepEqual((await providers(true,{email:true})).providers,['github','email']);
assert.match((await providers(true,{email:true})).label,/email/);
assert.deepEqual((await providers(true,{email:false})).providers,['github']);
assert.deepEqual((await providers(true,{email:true},true)).providers,['github']);
assert.deepEqual((await providers(true,{email:true,twitter:true})).providers,['github','x','email']);
console.log('PASS: email requires explicit delivery readiness and live provider enablement; failures do not advertise it');
