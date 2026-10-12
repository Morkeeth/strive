module.exports=async function handler(req,res){
 res.setHeader('X-Content-Type-Options','nosniff');
 try{
  const {readSitemapRuns,sitemapXml,SITEMAP_CACHE}=await import('../server/sitemap.mjs');
  const body=sitemapXml(await readSitemapRuns());
  res.statusCode=200;res.setHeader('Content-Type','application/xml; charset=utf-8');res.setHeader('Cache-Control',SITEMAP_CACHE);res.end(body);
 }catch(_){res.statusCode=503;res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','text/plain; charset=utf-8');res.end('Sitemap temporarily unavailable.');}
};
