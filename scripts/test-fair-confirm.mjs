// server/fair-confirm.mjs with a fake network. Off makes no request; bad input and a missing or
// foreign action make no Free Lunch request; a good link action is signed as the-fair expects.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {confirm,canonical,linkTicket} from '../server/fair-confirm.mjs';

const SECRET='s'.repeat(64), FAIR='http://127.0.0.1:4999', SB={SB_URL:'https://db.test',SB_KEY:'sb_publishable_x'};
const env={FAIR_PRODUCT_SECRET_STRIVE:SECRET,FAIR_URL:FAIR};
const CH='11111111-2222-4333-8444-555555555555', LINK='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', RUN='bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const now=Date.now(), iso=t=>new Date(t).toISOString();
const challenge={id:CH,nonce:'n',projectId:'strive',version:1,taskId:'t',visitorId:'v',issuedAt:now-60e3,expiresAt:now+60e3}; // epoch ms, as the-fair sends them
function net(over={}){
 const calls=[];
 const f=async(url,opts={})=>{calls.push(url);
  const json=(b,s=200)=>({ok:s<400,status:s,json:async()=>b});
  if(url.endsWith('/rpc/dropin_read')) return json(over.link===undefined?{id:LINK,created_at:iso(now)}:over.link);
  if(url.endsWith('/auth/v1/user')) return json(over.user??{id:'me'});
  if(url.endsWith('/rpc/grinder_profile_id')) return json(over.owner??'profile-me');
  if(url.includes('/rest/v1/runs?')) return json(over.runs??[{id:RUN,created_at:iso(now),profile_id:'profile-me'}]);
  if(url.includes('/api/build/challenge')) return over.challenge===null?json({},404):json({challenge:over.challenge??challenge});
  if(url.endsWith('/api/build/confirm')){f.proof=JSON.parse(opts.body).proof;return json(over.confirm??{receipt:{id:'r',kind:'fair-witnessed'}},over.confirmStatus??200);}
  throw new Error('unexpected '+url);
 };
 f.calls=calls;return f;
}
const post=(body,headers={})=>({method:'POST',headers,body});
const TICKET=linkTicket(LINK,env);
// A link needs its creator's ticket: none, or one for another id, is refused before any request.
for(const ticket of [undefined,linkTicket(RUN,env),'0'.repeat(64),'zz']){
 const f=net();const out=await confirm(post({challengeId:CH,kind:'link',id:LINK,ticket}),SB,env,f);assert.equal(out.status,404);assert.equal(f.calls.length,0);
}
assert.equal(linkTicket(LINK,{}),null,'no ticket when the feature is off');

// Off: no secret, a short secret, or no Free Lunch URL. Zero requests of any kind.
for(const e of [{},{FAIR_URL:FAIR},{FAIR_PRODUCT_SECRET_STRIVE:SECRET},{FAIR_PRODUCT_SECRET_STRIVE:'short',FAIR_URL:FAIR}]){
 const f=net();const out=await confirm(post({challengeId:CH,kind:'link',id:LINK,ticket:TICKET}),SB,e,f);
 assert.deepEqual(out.body,{off:true});assert.equal(f.calls.length,0);
}
// Bad input: nothing is fetched.
for(const b of [{},{challengeId:'x',kind:'link',id:LINK},{challengeId:CH,kind:'post',id:LINK},{challengeId:CH,kind:'link',id:'1'}]){
 const f=net();const out=await confirm(post(b),SB,env,f);assert.equal(out.status,400);assert.equal(f.calls.length,0);
}
// No such link: Free Lunch is never called.
{const f=net({link:null});const out=await confirm(post({challengeId:CH,kind:'link',id:LINK,ticket:TICKET}),SB,env,f);assert.equal(out.status,404);assert.ok(!f.calls.some(u=>u.startsWith(FAIR)));}
// A run needs the owner's token, and must be theirs.
{const f=net();const out=await confirm(post({challengeId:CH,kind:'run',id:RUN}),SB,env,f);assert.equal(out.status,404);assert.ok(!f.calls.some(u=>u.startsWith(FAIR)));}
{const f=net({runs:[{id:RUN,created_at:iso(now),profile_id:'profile-someone-else'}]});const out=await confirm(post({challengeId:CH,kind:'run',id:RUN},{authorization:'Bearer t'}),SB,env,f);assert.equal(out.status,404);assert.ok(!f.calls.some(u=>u.startsWith(FAIR)));}
// An action made before the visit, or a challenge for another product, is not confirmed.
{const f=net({link:{id:LINK,created_at:iso(now-3600e3)}});const out=await confirm(post({challengeId:CH,kind:'link',id:LINK,ticket:TICKET}),SB,env,f);assert.equal(out.status,409);assert.ok(!f.calls.some(u=>u.endsWith('/api/build/confirm')));}
{const f=net({challenge:{...challenge,projectId:'favour'}});const out=await confirm(post({challengeId:CH,kind:'link',id:LINK,ticket:TICKET}),SB,env,f);assert.equal(out.status,409);}
{const f=net({challenge:null});const out=await confirm(post({challengeId:CH,kind:'link',id:LINK,ticket:TICKET}),SB,env,f);assert.equal(out.status,409);}
// Good: signed with the product secret over canonical JSON, the challenge unchanged.
for(const [kind,id,headers] of [['link',LINK,{}],['run',RUN,{authorization:'Bearer t'}]]){
 const f=net();const out=await confirm(post({challengeId:CH,kind,id,...(kind==='link'?{ticket:TICKET}:{})},headers),SB,env,f);
 assert.deepEqual(out.body,{confirmed:true,kind:'fair-witnessed'});
 const {signature,...body}=f.proof;
 assert.deepEqual(body.challenge,challenge);assert.equal(body.protocol,'fair-proof-v1');assert.equal(body.actionId,`strive-${kind}-${id}`);assert.match(body.evidenceHash,/^[a-f0-9]{64}$/);
 assert.equal(signature,createHmac('sha256',SECRET).update(canonical(body)).digest('hex'));
}
// Free Lunch refuses: only its short code comes back, never its text.
{const f=net({confirm:{error:'TOO_EARLY <b>x</b>',code:'TOO_EARLY'},confirmStatus:409});const out=await confirm(post({challengeId:CH,kind:'link',id:LINK,ticket:TICKET}),SB,env,f);assert.deepEqual(out.body,{confirmed:false,code:'TOO_EARLY'});}
// canonical sorts keys at every level and keeps arrays in order.
assert.equal(canonical({b:1,a:{d:[2,1],c:null}}),'{"a":{"c":null,"d":[2,1]},"b":1}');
console.log('Free Lunch confirm checks passed.');
