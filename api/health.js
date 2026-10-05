module.exports=async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 const {SERVICE}=await import('../server/brand.mjs');
 const {deploymentGitSha}=await import('../server/deployment-identity.mjs');
 const gitSha=deploymentGitSha();
 const identity=gitSha?{git_sha:gitSha}:{};
 if(gitSha) res.setHeader('X-Strive-Git-Sha',gitSha);
 try {
  const {runtimeConfig}=await import('../server/runtime-config.mjs');
  const config=runtimeConfig();
  const {readiness}=await import('../server/readiness.mjs');
  const result=await readiness(config);
  // Reported beside the database checks, not inside them: an unset feedback destination must be
  // visible here, but it does not make the product unavailable.
  const {feedbackEnv,feedbackSetup}=await import('../server/feedback-notifications.mjs');
  const feedback_notifications=feedbackSetup(feedbackEnv()).ready?'ready':'not_configured';
  res.status(result.ready?200:503).json({service:SERVICE,database:result.ready?'ready':'unavailable',checks:result.checks,feedback_notifications,...identity});
 }catch {res.status(503).json({service:SERVICE,database:'unavailable',...identity});}
}
