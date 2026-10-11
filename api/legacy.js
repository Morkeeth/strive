module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 try{
  const {runPath,profilePath,readProfile}=await import('../server/share-routes.mjs');
  const {readPublic}=await import('../server/public-run.mjs');
  const query=new URLSearchParams();
  for(const [key,value] of Object.entries(req.query||{}))if(typeof value==='string'&&key!=='legacy')query.set(key,value);
  query.set('legacy','1');
  const spa='/?'+query.toString();
  const extra=Object.keys(req.query||{}).filter(key=>!['run','u','legacy'].includes(key));
  if(extra.length)return res.writeHead(307,{Location:spa}).end();
  if(req.query.run){const run=await readPublic(String(req.query.run));const path=run&&runPath(run);return res.writeHead(path?301:307,{Location:path||spa}).end()}
  if(req.query.u){const profile=await readProfile(String(req.query.u));const path=profile&&profilePath(profile.handle||profile.github_handle);return res.writeHead(path?301:307,{Location:path||spa}).end()}
  return res.writeHead(307,{Location:spa}).end();
 }catch(_){return res.status(503).send('Link temporarily unavailable.')}
};
