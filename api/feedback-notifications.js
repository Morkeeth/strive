const {timingSafeEqual}=require('node:crypto');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 const authorization=req.headers.authorization||'';
 if(req.method==='GET'){
  const secret=process.env.CRON_SECRET,actual=Buffer.from(authorization),expected=Buffer.from('Bearer '+(secret||''));
  if(!secret||actual.length!==expected.length||!timingSafeEqual(actual,expected))return res.status(401).json({error:'Unauthorized'});
 }else if(!/^Bearer [A-Za-z0-9._~-]+$/.test(authorization))return res.status(401).json({error:'Unauthorized'});
 try{
  const {runtimeConfig}=await import('../server/runtime-config.mjs');
  const {feedbackCaller,deliverFeedback}=await import('../server/feedback-notifications.mjs');
  const config={...runtimeConfig(),SERVICE_KEY:process.env.STRIVE_FEEDBACK_SERVICE_ROLE_KEY,
   WEBHOOK_URL:process.env.STRIVE_FEEDBACK_WEBHOOK_URL,WEBHOOK_HOST:process.env.STRIVE_FEEDBACK_WEBHOOK_HOST,
   WEBHOOK_FORMAT:process.env.STRIVE_FEEDBACK_WEBHOOK_FORMAT,INBOX_URL:process.env.STRIVE_FEEDBACK_INBOX_URL};
  let profileId=null;
  if(req.method==='POST'){
   profileId=await feedbackCaller(config,authorization);
   if(!profileId)return res.status(401).json({error:'Unauthorized'});
  }
  const result=await deliverFeedback(config,fetch,{profileId});
  return res.status(200).json(result);
 }catch{return res.status(503).json({error:'Feedback notification pending; stored feedback is unchanged.'});}
};
