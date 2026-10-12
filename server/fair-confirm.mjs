// FREE LUNCH CONFIRM. A visitor Free Lunch sends here arrives with ?fair_challenge=<id>. When that
// visitor finishes a real action on STRIVE (a saved run, or an "Anyone with the link" card), the
// page asks this route to confirm it. The route checks the action exists in STRIVE's database and
// was made inside the challenge's life, reads the challenge from Free Lunch, signs it with STRIVE's
// product secret on this server, and posts the proof. Free Lunch files it as fair-witnessed.
//
// Off unless both FAIR_PRODUCT_SECRET_STRIVE (32 bytes or more) and FAIR_URL are set. Off answers
// without making any request. The secret never leaves this file: the browser sends ids, never a
// signature, and cannot confirm an action that did not happen.
// Protocol: the-fair README "How a build confirms" and proof/engine.mjs signCompletion.
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHALLENGE_ID=UUID; // the-fair randomId is a v4 UUID
const KINDS=new Set(['run','link']);
const MAX_BYTES=2048;

// Canonical JSON exactly as the-fair signs it: keys sorted at every level, arrays in order.
export const canonical=value=>{
 if(value===null||typeof value!=='object') return JSON.stringify(value);
 if(Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
 return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
};
export function signCompletion(secret,challenge,{actionId,evidenceHash}){
 const body={protocol:'fair-proof-v1',challenge,actionId,evidenceHash};
 return {...body,signature:createHmac('sha256',secret).update(canonical(body)).digest('hex')};
}

// A link id is public (it is in the /l/ address), so the link's creator also gets a ticket when the
// link is made: an HMAC of the id under the product secret, returned once, like the delete token.
// Confirming a link needs it, so nobody can confirm a stranger's card against their own visit.
export function linkTicket(id,env=process.env){
 const fair=fairConfig(env);
 return fair?createHmac('sha256',fair.secret).update('strive-link-ticket\0'+id).digest('hex'):null;
}
function ticketOK(id,ticket,secret){
 if(typeof ticket!=='string'||!/^[a-f0-9]{64}$/.test(ticket)) return false;
 const want=createHmac('sha256',secret).update('strive-link-ticket\0'+id).digest();
 return timingSafeEqual(want,Buffer.from(ticket,'hex'));
}

export function fairConfig(env=process.env){
 const secret=env.FAIR_PRODUCT_SECRET_STRIVE||'';
 let url='';
 try{const u=new URL(env.FAIR_URL||'');const loop=['localhost','127.0.0.1'].includes(u.hostname);if(u.protocol==='https:'||(loop&&u.protocol==='http:'))url=u.origin}catch{}
 return Buffer.byteLength(secret,'utf8')>=32&&url?{secret,url}:null;
}

// The action, read from STRIVE's own database. A run must belong to the signed-in person (their
// token, RLS, and their own profile id); a link is public by id. auth_uid is not readable here.
async function actionTime({kind,id,accessToken},{SB_URL,SB_KEY},fetchImpl){
 const base={apikey:SB_KEY,'Accept-Profile':'strava','Content-Profile':'strava'};
 if(kind==='link'){
  const r=await fetchImpl(SB_URL+'/rest/v1/rpc/dropin_read',{method:'POST',headers:{...base,'Content-Type':'application/json'},body:JSON.stringify({link_id:id}),signal:AbortSignal.timeout(8000)});
  const row=r.ok?await r.json().catch(()=>null):null;
  return row&&row.id===id?row.created_at:null;
 }
 if(typeof accessToken!=='string'||!accessToken) return null;
 const auth={...base,Authorization:'Bearer '+accessToken};
 const who=await fetchImpl(SB_URL+'/auth/v1/user',{headers:auth,signal:AbortSignal.timeout(8000)});
 const user=who.ok?await who.json().catch(()=>null):null;
 if(!user?.id) return null;
 const [r,me]=await Promise.all([
  fetchImpl(`${SB_URL}/rest/v1/runs?id=eq.${id}&select=id,created_at,profile_id`,{headers:auth,signal:AbortSignal.timeout(8000)}),
  fetchImpl(SB_URL+'/rest/v1/rpc/grinder_profile_id',{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(8000)}),
 ]);
 const rows=r.ok?await r.json().catch(()=>null):null;
 const owner=me.ok?await me.json().catch(()=>null):null;
 const row=Array.isArray(rows)?rows[0]:null;
 return row&&row.id===id&&typeof owner==='string'&&row.profile_id===owner?row.created_at:null;
}

export async function confirm({method,headers={},body},config,env=process.env,fetchImpl=fetch){
 if(method!=='POST') return {status:405,headers:{Allow:'POST'},body:{error:'Use POST.'}};
 const fair=fairConfig(env);
 if(!fair) return {status:200,body:{off:true}};
 if(Number(headers['content-length']||0)>MAX_BYTES||!body||typeof body!=='object') return {status:400,body:{error:'Send { challengeId, kind, id }.'}};
 const {challengeId,kind,id,ticket}=body;
 if(typeof challengeId!=='string'||!CHALLENGE_ID.test(challengeId)||!KINDS.has(kind)||typeof id!=='string'||!UUID.test(id)) return {status:400,body:{error:'Send { challengeId, kind, id }.'}};
 if(kind==='link'&&!ticketOK(id,ticket,fair.secret)) return {status:404,body:{error:'No such action of yours on STRIVE.'}};
 const accessToken=String(headers.authorization||'').replace(/^Bearer\s+/i,'')||null;
 let created;
 try{created=await actionTime({kind,id,accessToken},config,fetchImpl)}catch{return {status:503,body:{error:'STRIVE could not check the action.'}}}
 if(!created) return {status:404,body:{error:'No such action of yours on STRIVE.'}};
 let challenge;
 try{
  const r=await fetchImpl(`${fair.url}/api/build/challenge?id=${encodeURIComponent(challengeId)}`,{signal:AbortSignal.timeout(8000),redirect:'error'});
  if(r.status===404) return {status:409,body:{error:'The Free Lunch visit is closed or unknown.'}};
  challenge=r.ok?(await r.json().catch(()=>null))?.challenge:null;
 }catch{return {status:502,body:{error:'Free Lunch is unreachable.'}}}
 if(!challenge||challenge.id!==challengeId||challenge.projectId!=='strive') return {status:409,body:{error:'That Free Lunch visit is not for STRIVE.'}};
 // the-fair writes issuedAt and expiresAt as epoch milliseconds; an ISO string is read the same way.
 const ms=v=>typeof v==='number'?v:Date.parse(v);
 const t=Date.parse(created),from=ms(challenge.issuedAt),to=ms(challenge.expiresAt);
 if(!(t>=from&&t<=to)) return {status:409,body:{error:'The action was not made during this Free Lunch visit.'}};
 const actionId=`strive-${kind}-${id}`;
 const evidenceHash=createHash('sha256').update(`strive:${kind}:${id}:${created}`).digest('hex');
 const proof=signCompletion(fair.secret,challenge,{actionId,evidenceHash});
 try{
  const r=await fetchImpl(`${fair.url}/api/build/confirm`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({proof}),signal:AbortSignal.timeout(8000),redirect:'error'});
  const out=await r.json().catch(()=>null);
  if(r.ok&&out?.receipt?.kind) return {status:200,body:{confirmed:true,kind:out.receipt.kind}};
  // Free Lunch's code is a short constant (for example TOO_EARLY); nothing else is passed on.
  const code=typeof out?.code==='string'&&/^[A-Z_]{2,40}$/.test(out.code)?out.code:'REFUSED';
  return {status:409,body:{confirmed:false,code}};
 }catch{return {status:502,body:{error:'Free Lunch is unreachable.'}}}
}
