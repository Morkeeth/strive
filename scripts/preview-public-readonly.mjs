// Local UI against live PUBLIC reads only. Never forwards sessions, uploads, or database writes.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {html as publicHtml,neutralHtml,readPublic,readPublicPhotos,readKudos,validId} from '../server/public-run.mjs';
const origin='https://striverun.app',live=await (await fetch(origin)).text();
const url=live.match(/const SB_URL="([^"]+)"/)[1],key=live.match(/const SB_KEY="([^"]+)"/)[1];
const root=resolve('dist'),port=Number(process.env.PORT)||8128;
const server=createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://127.0.0.1:'+port);
 if(u.pathname.startsWith('/r/')&&req.method==='GET'){
  const id=u.pathname.slice(3);if(!validId(id)){res.writeHead(404);return res.end('No run');}
  const publicFetch=(request,options={})=>{const parsed=new URL(request);return fetch(url+parsed.pathname+parsed.search,{...options,method:'GET',headers:{...options.headers,apikey:key,authorization:'Bearer '+key}})};
  const run=await readPublic(id,publicFetch);res.setHeader('Content-Type','text/html');if(!run)return res.end(neutralHtml(id));
  const [photos,kudos]=await Promise.all([readPublicPhotos(run,publicFetch),readKudos(id,publicFetch)]);return res.end(publicHtml(run,{photos,kudos}));
 }
 if(u.pathname.startsWith('/public-read/')){
  const path=u.pathname.slice('/public-read'.length),readRpc=['/rest/v1/rpc/read_day_card','/rest/v1/rpc/strava_profile_by_handle','/rest/v1/rpc/grinder_recent_builders','/rest/v1/rpc/grinder_find_people'].includes(path)&&req.method==='POST';
  if(!((req.method==='GET'||req.method==='HEAD')&&(path.startsWith('/rest/v1/')||path==='/auth/v1/settings'))&&!readRpc){res.writeHead(403);return res.end('Read-only preview');}
  const chunks=[];for await(const c of req)chunks.push(c);
  const out=await fetch(url+path+u.search,{method:req.method,headers:{apikey:key,authorization:'Bearer '+key,'accept-profile':'strava','content-profile':'strava','content-type':'application/json',...(req.headers.accept?{accept:req.headers.accept}:{}),...(req.headers.prefer?{prefer:req.headers.prefer}:{})},...(readRpc?{body:Buffer.concat(chunks)}:{})});
  res.writeHead(out.status,{'Content-Type':out.headers.get('content-type')||'application/json',...(out.headers.get('content-range')?{'content-range':out.headers.get('content-range')}:{})});return res.end(Buffer.from(await out.arrayBuffer()));
 }
 if(u.pathname==='/api/run-photos'){
  if(req.method!=='GET'){res.writeHead(403);return res.end('Read-only preview');}
  const out=await fetch(origin+u.pathname+u.search);res.writeHead(out.status,{'Content-Type':out.headers.get('content-type')||'application/json'});return res.end(Buffer.from(await out.arrayBuffer()));
 }
 if(req.method!=='GET'){res.writeHead(403);return res.end('Read-only preview');}
 if(u.pathname==='/local-supabase.js'){res.setHeader('Content-Type','text/javascript');return res.end(await readFile(process.env.STRIVE_SUPABASE_SDK));}
 const file=resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+'/')){res.writeHead(404);return res.end();}
 let body=await readFile(file);if(file.endsWith('index.html'))body=Buffer.from(body.toString().replace(/const SB_URL="[^"]+";/,'const SB_URL="http://127.0.0.1:'+port+'/public-read";').replace(/const SB_KEY="[^"]+";/,'const SB_KEY='+JSON.stringify(key)+';').replace('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2','/local-supabase.js').replace('<body>','<body><div style="padding:6px;text-align:center;background:#e7efff;font-size:11px">LOCAL DESIGN PREVIEW · live public reads only · writes blocked</div>'));
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(body);
 }catch(e){res.writeHead(500);res.end('Preview unavailable: '+e.message)}});
server.listen(port,'127.0.0.1',()=>console.log('Read-only public preview: http://127.0.0.1:'+port+'/?explore'));
