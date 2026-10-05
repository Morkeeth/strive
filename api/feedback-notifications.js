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
  const {feedbackCaller,deliverFeedback,feedbackEnv,feedbackSetup}=await import('../server/feedback-notifications.mjs');
  const config={...runtimeConfig(),...feedbackEnv()};
  let profileId=null;
  if(req.method==='POST'){
   profileId=await feedbackCaller(config,authorization);
   if(!profileId)return res.status(401).json({error:'Unauthorized'});
  }
  const setup=feedbackSetup(config);
  if(!setup.ready){
   // Setting names only. Nothing was claimed, so the queue row keeps zero attempts.
   console.error('feedback-notifications: not configured, nothing claimed. Absent or refused: '+setup.missing.join(', '));
   return res.status(503).json({error:'Feedback notification destination is not configured; stored feedback is unchanged.',configured:false});
  }
  const result=await deliverFeedback(config,fetch,{profileId});
  return res.status(200).json(result);
 }catch{return res.status(503).json({error:'Feedback notification pending; stored feedback is unchanged.'});}
};
