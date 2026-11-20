module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 try{const {review}=await import('../../server/agent-review.mjs');const {runtimeConfig}=await import('../../server/runtime-config.mjs');const out=await review({method:req.method,headers:req.headers,body:req.body},runtimeConfig());for(const [k,v]of Object.entries(out.headers||{}))res.setHeader(k,v);res.status(out.status).json(out.body);}catch{res.status(503).json({error:'Feedback is unavailable.'});}
};
