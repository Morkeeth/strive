import {isIP} from 'node:net';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function webhookConfig(config){
 const url=new URL(config.WEBHOOK_URL);
 const host=config.WEBHOOK_HOST;
 if(!host||url.hostname!==host||url.protocol!=='https:'||url.username||url.password||url.hash||url.port||
  isIP(host)||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||!host.includes('.'))
  throw new Error('Configure an approved HTTPS feedback destination.');
 if(!['generic','slack'].includes(config.WEBHOOK_FORMAT||'generic'))throw new Error('Unsupported feedback notification format.');
 return url.href;
}
function inbox(config){
 const url=new URL(config.INBOX_URL);
 if(url.protocol!=='https:'||url.hostname!=='supabase.com'||url.username||url.password||url.hash||
  !/^\/dashboard\/project\/[a-z0-9-]+\/editor(?:\/|$)/.test(url.pathname))throw new Error('Configure the owner-only feedback inbox URL.');
 return url.href;
}
export function feedbackEnv(env=process.env){
 return {SERVICE_KEY:env.STRIVE_FEEDBACK_SERVICE_ROLE_KEY,WEBHOOK_URL:env.STRIVE_FEEDBACK_WEBHOOK_URL,WEBHOOK_HOST:env.STRIVE_FEEDBACK_WEBHOOK_HOST,
  WEBHOOK_FORMAT:env.STRIVE_FEEDBACK_WEBHOOK_FORMAT,INBOX_URL:env.STRIVE_FEEDBACK_INBOX_URL};
}
// Operator setup state. Reports the names of absent or refused settings, never a value.
// Without this, an unconfigured destination looks the same as a healthy empty queue.
export function feedbackSetup(config,cronSecret=process.env.CRON_SECRET){
 const missing=[];
 if(!cronSecret)missing.push('CRON_SECRET');
 if(!config.SERVICE_KEY)missing.push('STRIVE_FEEDBACK_SERVICE_ROLE_KEY');
 try{webhookConfig(config);}catch{missing.push('STRIVE_FEEDBACK_WEBHOOK_URL/HOST/FORMAT');}
 try{inbox(config);}catch{missing.push('STRIVE_FEEDBACK_INBOX_URL');}
 return {ready:missing.length===0,missing};
}
export async function feedbackCaller(config,authorization,fetchImpl=fetch){
 if(!/^Bearer [A-Za-z0-9._~-]+$/.test(authorization||''))return null;
 const r=await fetchImpl(config.SB_URL+'/rest/v1/rpc/grinder_profile_id',{method:'POST',
  headers:{apikey:config.SB_KEY,Authorization:authorization,'Accept-Profile':'strava','Content-Profile':'strava','Content-Type':'application/json'},
  body:'{}',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000)});
 if(!r.ok)return null;
 const id=await r.json();return typeof id==='string'&&UUID.test(id)?id:null;
}
export async function deliverFeedback(config,fetchImpl=fetch,{profileId=null}={}){
 // Validate all operator configuration before claiming any durable work.
 const destination=webhookConfig(config),inboxUrl=inbox(config);
 if(!config.SERVICE_KEY)throw new Error('Feedback service capability is missing.');
 if(profileId!==null&&!UUID.test(profileId))throw new Error('Invalid feedback owner.');
 const rpc=async(name,body)=>{
  const r=await fetchImpl(config.SB_URL+'/rest/v1/rpc/'+name,{method:'POST',
   headers:{apikey:config.SERVICE_KEY,Authorization:'Bearer '+config.SERVICE_KEY,
    'Accept-Profile':'strava','Content-Profile':'strava','Content-Type':'application/json'},
   body:JSON.stringify(body),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!r.ok)throw new Error('Feedback '+name+' request failed.');return r.json();
 };
 // Claim + four (ping, acknowledgement) pairs have at most 45s of network waits.
 // The Vercel function has a 60s cap. The immediate owner wake claims only one.
 const limit=profileId?1:4;
 const rows=await rpc('feedback_notification_claim',{p_limit:limit,p_profile_id:profileId});
 if(!Array.isArray(rows)||rows.length>limit)throw new Error('Invalid feedback recovery batch.');
 let delivered=0,retry=0;
 for(const row of rows){
  if(!UUID.test(row.feedback_id)||!UUID.test(row.lease_token)||!['bug','idea','other'].includes(row.category))throw new Error('Invalid private notification record.');
  const event={event:'strive.feedback.received',feedback_id:row.feedback_id,category:row.category,created_at:row.created_at,inbox_url:inboxUrl};
  const body=config.WEBHOOK_FORMAT==='slack'?{text:`Private STRIVE feedback received (${row.category}). Reference: ${row.feedback_id}. Open your private inbox: ${inboxUrl}`} :event;
  let ok=false;
  try{ok=(await fetchImpl(destination,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':row.feedback_id},
   body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(5000),cache:'no-store'})).ok===true;}catch{}
  // If this acknowledgement fails, the lease expires and a later worker retries.
  // Receiver acceptance and durable acknowledgement cannot be an atomic transaction.
  let completed;try{completed=await rpc('feedback_notification_complete',{p_feedback_id:row.feedback_id,p_lease_token:row.lease_token,p_ok:ok});}
  catch{throw new Error('Feedback completion unknown; lease retained for retry.');}
  if(completed!==true)throw new Error('Feedback completion lease expired; retry may occur.');
  if(ok)delivered++;else retry++;
 }
 return {delivered,retry};
}
