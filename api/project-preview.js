const recent=new Map();let active=0;
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({message:'Use POST.'});}
 // Enrichment is explicitly requested on this site; cross-site forms cannot spend fetch resources.
 if(req.headers['sec-fetch-site']==='cross-site')return res.status(403).json({message:'Open the project form to load a preview.'});
 if(!String(req.headers['content-type']||'').startsWith('application/json'))return res.status(415).json({message:'Use JSON.'});
 const body=req.body;
 if(!body||typeof body.url!=='string'||Object.keys(body).some(k=>k!=='url'))return res.status(400).json({message:'Add one public website link.'});
 const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0],now=Date.now(),hits=(recent.get(ip)||[]).filter(t=>now-t<60000);if(hits.length>=8||active>=4)return res.status(429).json({message:'Please wait before loading another preview.'});if(recent.size>1000)recent.clear();hits.push(now);recent.set(ip,hits);active++;
 try{const {projectPreview}=await import('../server/project-preview.mjs');return res.status(200).json(await projectPreview(body.url));}
 catch{return res.status(422).json({message:'This public link could not supply a preview. Use a link without query parameters, or add a photo.'});}finally{active--;}
};
