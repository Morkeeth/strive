module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');return res.status(405).end('Use GET.');}
 try{const {readPublic,origin}=await import('../../server/public-run.mjs');const {projectAgentic}=await import('../../server/project-agentic.mjs');const run=await readPublic(req.query.id);res.setHeader('Content-Type','text/markdown; charset=utf-8');if(!run)return res.status(404).end('This public project is unavailable.');res.status(200).end(req.method==='HEAD'?'':projectAgentic(run,origin));}catch{return res.status(503).end('The public project could not load.');}
};
