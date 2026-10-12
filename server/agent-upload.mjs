// POST /api/agent/runs: an agent uploads one metrics-only run with its Connect token.
// The server holds no extra power. It forwards to strava.grinder_agent_action with the public
// anon key, and the database checks the token, scope, audience, payload and rate limits.
const TOKEN=/^Bearer (ag_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_BYTES=65536;

// Database refusals are our own raise messages. None of them echo the token or the payload.
function statusFor(message) {
 if(/Agent access is unavailable/.test(message)) return 401;
 if(/scope|audience|Make the agent profile public/i.test(message)) return 403;
 if(/limit reached/i.test(message)) return 429;
 return 400;
}

export async function upload({method,headers,body},{SB_URL,SB_KEY},fetchImpl=fetch) {
 if(method!=='POST') return {status:405,headers:{Allow:'POST'},body:{error:'Use POST.'}};
 const auth=TOKEN.exec(String(headers.authorization||''));
 if(!auth) return {status:401,body:{error:'Send Authorization: Bearer <token from Connect>.'}};
 if(Number(headers['content-length']||0)>MAX_BYTES) return {status:413,body:{error:'Send a run under 64 KiB.'}};
 if(!body||typeof body!=='object'||Array.isArray(body)) return {status:400,body:{error:'Send one run as a JSON object.'}};
 // Measure what will be sent, not the header: a body can arrive without content-length.
 const serialized=JSON.stringify({...body,visibility:'private'});
 if(Buffer.byteLength(serialized,'utf8')>MAX_BYTES) return {status:413,body:{error:'Send a run under 64 KiB.'}};
 const key=headers['idempotency-key'];
 if(key!==undefined&&!UUID.test(String(key))) return {status:400,body:{error:'Idempotency-Key must be a UUID.'}};
 const request_id=key?String(key).toLowerCase():crypto.randomUUID();
 let response;
 try {
  response=await fetchImpl(SB_URL+'/rest/v1/rpc/grinder_agent_action',{method:'POST',
   headers:{'Content-Type':'application/json',apikey:SB_KEY,'Content-Profile':'strava'},
   body:`{"token":${JSON.stringify(auth[1])},"action":"publish","payload":${serialized},"request_id":${JSON.stringify(request_id)}}`,
   signal:AbortSignal.timeout(15000),cache:'no-store'});
 } catch {
  return {status:503,body:{error:'STRIVE is unavailable. Retry with the same Idempotency-Key.',request_id}};
 }
 let result=null;try{result=await response.json()}catch{}
 if(!response.ok) {
  const message=typeof result?.message==='string'?result.message.slice(0,300):'The run was refused.';
  return {status:response.status>=500?502:statusFor(message),body:{error:message,request_id}};
 }
 if(!result||typeof result.id!=='string'||typeof result.visibility!=='string'||typeof result.existing!=='boolean')
  return {status:502,body:{error:'STRIVE returned an unexpected response.',request_id}};
 if(result.visibility!=='private')return {status:200,body:{id:result.id,visibility:result.visibility,existing:true,request_id,review_required:false}};
 const preview={...body,visibility:'private',review_run_id:result.id};
 const preview_url='https://striverun.app/#import='+Buffer.from(JSON.stringify(preview),'utf8').toString('base64');
 return {status:200,body:{id:result.id,visibility:'private',existing:result.existing,request_id,review_required:true,preview_url}};
}
