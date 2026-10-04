// Local-only full SPA rehearsal: exact app, disposable PostgreSQL/Auth shim, in-memory photo storage.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {bootDisposable,seedJourneyActors,seedCoachRun,startDisposableServer,sessionFor,CASEY,RILEY} from './disposable-supabase.mjs';
import {runPhotos} from '../server/run-photos.mjs';
const {db}=await bootDisposable();await seedJourneyActors(db);
const run=await seedCoachRun(db,CASEY,'TEST DATA: redesigned photo component','f'.repeat(64),'now()');
await db.exec('reset role');await db.query("update strava.runs set caption=$1,story_result=$2,story_next=$3,feedback_question=$4,output_url=$5 where id=$6",['Photo presentation, before and after.','The full photo now fits. You can see the desk and the skyline together.','This is a local component comparison. A hosted release has not happened.','Does the full image make the run feel more personal?','https://striverun.app',run]);
const backend=await startDisposableServer(db);const blobs=new Map();
const localFetch=async(url,opts={})=>{
 const u=new URL(url);if(u.origin!==backend.url)throw Error('Only disposable backend allowed');
 if(!u.pathname.startsWith('/storage/v1/object/'))return fetch(url,opts);
 const key=u.pathname.replace('/storage/v1/object/','').replace(/^authenticated\//,'');
 if(opts.method==='POST'){blobs.set(key,opts.body);return new Response('{}');}
 if(opts.method==='DELETE'){for(const name of JSON.parse(opts.body).prefixes)blobs.delete(key+'/'+name);return new Response('{}');}
 return blobs.has(key)?new Response(blobs.get(key)):new Response('{}',{status:404});
};
const root=resolve('dist');const sdk='/Users/morkeeth/.local/state/day-run/2026-10-03/evening-six-hour-run/proof/wake9-spa/supabase-2.57.4.js';
const server=createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://127.0.0.1');
 res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ${backend.url}; img-src 'self' data: blob:`);
 if(u.pathname==='/fixture'){
  const peer=u.searchParams.has('peer'),session=sessionFor(peer?RILEY:CASEY,'fixture@example.test',peer?'test-riley':'test-casey');
  res.setHeader('Content-Type','text/html');return res.end(`<meta name="viewport" content="width=device-width"><h1>STRIVE local product rehearsal</h1><p>TEST DATA account, disposable database and local photo storage. No hosted services.</p><button id="go">Open ${peer?'peer':'owner'} fixture</button><script>go.onclick=()=>{localStorage.setItem('agentic-strava-auth',${JSON.stringify(JSON.stringify(session))});localStorage.setItem('ag_onboard_done','1');location.href='/?run=${run}'}</script>`);
 }
 if(u.pathname==='/__fixture'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({run,backend:backend.url,owner:CASEY,peer:RILEY}));}
 if(u.pathname==='/api/run-photos'){
  const chunks=[];for await(const c of req)chunks.push(c);const raw=Buffer.concat(chunks).toString();
  const out=await runPhotos({method:req.method,headers:req.headers,query:Object.fromEntries(u.searchParams),body:raw?JSON.parse(raw):undefined},{SB_URL:backend.url,SB_KEY:'local-development-only',STORAGE_KEY:'local-only'},localFetch);
  res.writeHead(out.status,{...out.headers,...(!Buffer.isBuffer(out.body)?{'Content-Type':'application/json'}:{})});return res.end(Buffer.isBuffer(out.body)?out.body:JSON.stringify(out.body));
 }
 if(u.pathname==='/local-supabase.js'){res.setHeader('Content-Type','text/javascript');return res.end(await readFile(sdk));}
 const file=resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+'/')){res.writeHead(404);return res.end();}
 let body=await readFile(file);if(file.endsWith('index.html'))body=Buffer.from(body.toString().replace('http://127.0.0.1:54321',backend.url).replace('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2','/local-supabase.js'));
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg'})[extname(file)]||'application/octet-stream');res.end(body);
 }catch(e){res.writeHead(500,{'Content-Type':'text/plain'});res.end('Local rehearsal failed: '+e.message)}});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({url:'http://127.0.0.1:'+server.address().port,run,backend:backend.url})));
process.on('SIGTERM',()=>{server.close();backend.server.close();db.close().then(()=>process.exit())});
