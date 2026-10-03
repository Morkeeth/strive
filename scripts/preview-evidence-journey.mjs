// LOCAL ONLY. Disposable test account and capture. Never uses hosted credentials or endpoints.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {bootDisposable,seedJourneyActors,CASEY} from './disposable-supabase.mjs';
import {runPhotos} from '../server/run-photos.mjs';
import {randomUUID} from 'node:crypto';
const {db,as}=await bootDisposable();await seedJourneyActors(db);await as(CASEY);
const RUN=randomUUID();await db.query("insert into strava.runs(id,profile_id,title,harness,schema_version,measurement_revision,trace_basis,rhythm,tool_calls,duration_s,started_at) values($1,$2,'Local product rehearsal','codex',1,repeat('d',64),'elapsed','[1,3,2]',6,3600,'2026-10-03T10:00:00Z')",[RUN,CASEY]);
const blobs=new Map();
const adapter=async(url,options={})=>{
 const u=new URL(url),body=options.body?typeof options.body==='string'?JSON.parse(options.body):options.body:null;
 const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
 if(u.pathname.startsWith('/storage/v1/object/')){
  let key=u.pathname.replace('/storage/v1/object/','').replace(/^authenticated\//,'');
  if(options.method==='POST'){blobs.set(key,options.body);return response({});}
  if(options.method==='DELETE'){for(const prefix of body.prefixes)blobs.delete(key+'/'+prefix);return response({});}
  return blobs.has(key)?new Response(blobs.get(key)):response({},404);
 }
 try{
  if(u.pathname.endsWith('/rpc/grinder_profile_id'))return response(CASEY);
  if(u.pathname.endsWith('/rpc/choose_run_cover')){const x=await db.query('select strava.choose_run_cover($1,$2) id',[body.target_run,body.target_photo]);return response(x.rows[0].id);}
  if(u.pathname.endsWith('/runs'))return response((await db.query('select id from strava.runs where id=$1 and profile_id=$2',[u.searchParams.get('id')?.slice(3),CASEY])).rows);
  if(u.pathname.endsWith('/run_photos')){
   if(options.method==='POST')return response((await db.query('insert into strava.run_photos(id,run_id,width,height,byte_size) values($1,$2,$3,$4,$5) returning *',[body.id,body.run_id,body.width,body.height,body.byte_size])).rows,201);
   const id=u.searchParams.get('id')?.slice(3),run=u.searchParams.get('run_id')?.slice(3);
   if(options.method==='DELETE'){await db.query('delete from strava.run_photos where id=$1',[id]);return response({});}
   return response((await db.query('select * from strava.run_photos where ($1::uuid is null or id=$1) and ($2::uuid is null or run_id=$2) order by is_cover desc,created_at,id',[id||null,run||null])).rows);
  }
  return response({},404);
 }catch{return response({},403);}
};
const page=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>STRIVE private photo rehearsal</title><link rel="stylesheet" href="/design.css"><link rel="stylesheet" href="/feed.css"><link rel="stylesheet" href="/run-photos.css"><style>:root{--blue:#2458ff;--ink:#111;--muted:#666;--rule:#ddd;--rule-2:#f7f7f7}*{box-sizing:border-box}body{margin:0;background:#fafaf8;color:#111;font:16px system-ui}main{max-width:960px;margin:40px auto;padding:20px}h1{font-size:32px}.banner{padding:14px;border:1px solid #ddd;margin-bottom:24px}button,select{padding:12px;font:inherit;background:white;border:1px solid #ccc;cursor:pointer}.hint,.meta{color:#666;font-size:14px}.head{display:flex;justify-content:space-between;align-items:center}label{display:block}input[type=range]{display:block;width:100%}.run-photo-cover{max-height:420px}.card{border:1px solid #ddd;padding:20px;background:white;margin:20px 0}summary{cursor:pointer}#status{min-height:24px;color:#2458ff}</style></head><body><main><div class="banner">Local only · disposable test run. Your selected photos stay on this Mac. No run/date association or publication is being made.</div><h1>Choose the photo that tells your story</h1><p>Add a photo, preview the crop, then choose your cover. The map stays with the run.</p><div id="status" role="status"></div><div id="card"></div><div id="photos"></div><section id="evidence"></section></main><script src="/run-contract.js"></script><script src="/run-evidence.js"></script><script src="/feed-card.js"></script><script src="/run-photos.js"></script><script>
const run={id:'${RUN}',profile_id:'${CASEY}',title:'Local product rehearsal',harness:'codex',visibility:'private',measurement_revision:'d'.repeat(64),trace_basis:'elapsed',rhythm:[1,3,2],tool_calls:6,duration_s:3600,started_at:'2026-10-03T10:00:00Z',created_at:'2026-10-03T12:00:00Z'};
const client={auth:{getSession:async()=>({data:{session:{access_token:'local-rehearsal'}}})}};
async function cover(){document.querySelector('#card').innerHTML=GrinderFeed.card(run,{mine:true,foot:false});await StriveRunPhotos.mountCovers({client,root:document.querySelector('#card')});}
cover();document.querySelector('#evidence').innerHTML=StriveEvidence.detail(run);
StriveRunPhotos.mount({client,run,slot:document.querySelector('#photos'),owner:true,status:message=>document.querySelector('#status').textContent=message,onChanged:cover});
</script></body></html>`;
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end(page);return;}
  if(url.pathname==='/api/run-photos'){
   const chunks=[];for await(const part of req)chunks.push(part);const raw=Buffer.concat(chunks).toString();
   const out=await runPhotos({method:req.method,headers:req.headers,query:Object.fromEntries(url.searchParams),body:raw?JSON.parse(raw):undefined},{SB_URL:'http://local.invalid',SB_KEY:'local',STORAGE_KEY:'local'},adapter);
   res.writeHead(out.status,{...out.headers,...(!Buffer.isBuffer(out.body)?{'Content-Type':'application/json'}:{})});res.end(Buffer.isBuffer(out.body)?out.body:JSON.stringify(out.body));return;
  }
  if(!/^\/[a-z-]+\.(js|css)$/.test(url.pathname)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript':'text/css');res.end(await readFile('site'+url.pathname));
 }catch{res.writeHead(500);res.end('Local rehearsal failed');}
});
server.listen(8893,'127.0.0.1',()=>console.log('Local disposable photo/evidence journey ready: http://127.0.0.1:8893'));
