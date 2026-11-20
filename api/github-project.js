module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Authorization, X-GitHub-Token');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'method_not_allowed'});}
 try{
  const {runtimeConfig}=await import('../server/runtime-config.mjs'),{githubProject}=await import('../server/github-project.mjs');
  return res.status(200).json(await githubProject({query:req.query||{},authorization:req.headers.authorization,githubToken:req.headers['x-github-token'],config:runtimeConfig()}));
 }catch(e){return res.status(e.status||503).json({error:e.code||'github_unavailable',message:e.status?e.message:'GitHub could not load this project. Please try again.'});}
};
