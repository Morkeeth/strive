// Local stack for scripts/check-photo-editor.py. TEST DATA only, never a hosted project.
// - the repository's disposable Postgres and REST/auth shim (scripts/disposable-supabase.mjs)
// - the shipped site/ files, with the same token and Supabase address substitution the build does
// - the real /api/run-photos handler (server/run-photos.mjs). Its Storage bucket is a Map in this
//   process: image bytes never leave this machine.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,join,normalize} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bootDisposable,seedJourneyActors,startDisposableServer,CASEY,RILEY} from './disposable-supabase.mjs';
import {runPhotos} from '../server/run-photos.mjs';

const SITE=join(fileURLToPath(new URL('..',import.meta.url)),'site');
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.webp':'image/webp','.webmanifest':'application/manifest+json'};
const {db}=await bootDisposable();
await seedJourneyActors(db);
const shim=await startDisposableServer(db);
const bucket=new Map();
const objectKey=url=>decodeURIComponent(new URL(url).pathname.replace(/^\/storage\/v1\/object\/(authenticated\/)?strive-run-photos\/?/,''));
async function transport(url,options={}){
  if(!String(url).includes('/storage/v1/object/'))return fetch(url,options);
  const key=objectKey(url);
  if(options.method==='POST'){bucket.set(key,Buffer.from(options.body));return new Response('{}',{status:200});}
  if(options.method==='DELETE'){for(const name of JSON.parse(options.body).prefixes||[])bucket.delete(name);return new Response('[]',{status:200});}
  return bucket.has(key)?new Response(bucket.get(key),{status:200}):new Response('{}',{status:404});
}
const config={SB_URL:shim.url,SB_KEY:'local-development-only',STORAGE_KEY:'local-test-storage'};
const body=request=>new Promise((resolve,reject)=>{const parts=[];request.on('data',part=>parts.push(part));request.on('end',()=>resolve(Buffer.concat(parts)));request.on('error',reject);});
const server=createServer(async(request,response)=>{
  try{
    const url=new URL(request.url,'http://127.0.0.1');
    if(url.pathname==='/api/run-photos'){
      const raw=await body(request);
      const out=await runPhotos({method:request.method,headers:request.headers,query:Object.fromEntries(url.searchParams),body:raw.length?JSON.parse(raw.toString()):undefined},config,transport);
      response.writeHead(out.status,Buffer.isBuffer(out.body)?out.headers:{...out.headers,'Content-Type':'application/json'});
      response.end(Buffer.isBuffer(out.body)?out.body:JSON.stringify(out.body));return;
    }
    if(url.pathname.startsWith('/api/')){response.writeHead(404,{'Content-Type':'application/json'});response.end('{"error":"Not part of this local stack."}');return;}
    let path=normalize(join(SITE,url.pathname==='/'?'index.html':url.pathname));
    if(!path.startsWith(SITE))throw new Error('outside site');
    let bytes;
    try{bytes=await readFile(path);}catch{
      // A missing file is a 404, as on the host. Only a page address falls back to the app shell.
      if(extname(path)){if(process.env.PHOTO_EDITOR_STACK_DEBUG)process.stderr.write('404 '+url.pathname+'\n');response.writeHead(404,{'Content-Type':'text/plain'});response.end('Not found');return;}
      path=join(SITE,'index.html');bytes=await readFile(path);
    }
    if(/\.(html|js|css|json|webmanifest)$/.test(path)){
      let text=bytes.toString().replaceAll('__BRAND__','STRIVE').replaceAll('__TAGLINE__','Build in good company').replaceAll('__ORIGIN__','http://'+request.headers.host);
      if(path.endsWith('index.html'))text=text.replace(/const SB_URL="[^"]*";/,()=>`const SB_URL=${JSON.stringify(shim.url)};`);
      bytes=Buffer.from(text);
    }
    response.writeHead(200,{'Content-Type':TYPES[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});response.end(bytes);
  }catch(error){response.writeHead(500,{'Content-Type':'text/plain'});response.end(String(error?.message||error));}
});
server.listen(0,'127.0.0.1',()=>{
  process.stdout.write(JSON.stringify({site:'http://127.0.0.1:'+server.address().port,supabase:shim.url,casey:CASEY,riley:RILEY})+'\n');
});
