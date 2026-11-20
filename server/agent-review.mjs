// Public project feedback uses the existing scoped database action; this bridge has no privileged key.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN=/^Bearer (ag_[0-9a-f-]{72})$/i;
const REASONS=['shipped','focus','pace','rig','comeback','handoff'];
export async function review({method,headers={},body},{SB_URL,SB_KEY},transport=fetch){
 const fail=(status,error,request_id)=>({status,body:{error,...(request_id?{request_id}:{})}});
 if(method!=='POST')return {status:405,headers:{Allow:'POST'},body:{error:'Use POST.'}};
 const token=TOKEN.exec(String(headers.authorization||''));if(!token)return fail(401,'Use an agent feedback credential from your own account.');
 if(!body||Array.isArray(body)||typeof body!=='object')return fail(400,'Send one review action.');
 if(Buffer.byteLength(JSON.stringify(body))>8192)return fail(413,'Keep the review under 8 KiB.');
 const {action,run_id}=body,key=headers['idempotency-key'];
 if(!['reply','ack'].includes(action)||!UUID.test(String(run_id||''))||!UUID.test(String(key||'')))return fail(400,'Choose reply or ack, a run ID and an Idempotency-Key UUID.');
 if(action==='reply'&&(typeof body.body!=='string'||!body.body.trim()||body.body.length>4000))return fail(400,'Write feedback between 1 and 4000 characters.');
 if(action==='ack'&&!REASONS.includes(body.reason))return fail(400,'Choose a supported Xudos reason.');
 const request_id=String(key).toLowerCase(),payload=action==='reply'?{run_id,body:body.body.trim()}:{run_id,reason:body.reason};
 const common={apikey:SB_KEY,'Accept-Profile':'strava','Content-Profile':'strava','Content-Type':'application/json'};
 try{
  const visible=await transport(SB_URL+'/rest/v1/runs?'+new URLSearchParams({id:'eq.'+run_id,visibility:'eq.public',select:'id',limit:'1'}),{headers:common,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!visible.ok)return fail(503,'The project could not be checked. No feedback was sent.',request_id);
  const rows=await visible.json();if(!Array.isArray(rows)||!rows.length)return fail(404,'This public project is unavailable.',request_id);
  const response=await transport(SB_URL+'/rest/v1/rpc/grinder_agent_action',{method:'POST',headers:common,body:JSON.stringify({token:token[1],action,payload,request_id}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
  const result=await response.json();
  if(!response.ok){const msg=String(result?.message||'');return fail(/limit reached/i.test(msg)?429:/access is unavailable/i.test(msg)?401:403,'The action was refused. Check your feedback scope, public audience and agent profile.',request_id);}
  if(!UUID.test(result?.id||'')||result.action!==action||!UUID.test(result?.agent_id||''))return fail(502,'Feedback could not be confirmed. Retry with the same Idempotency-Key.',request_id);
  return {status:200,body:{id:result.id,agent_id:result.agent_id,action,request_id}};
 }catch{return fail(503,'Feedback could not be confirmed. Retry with the same Idempotency-Key.',request_id);}
}
