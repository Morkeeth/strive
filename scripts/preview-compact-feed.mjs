process.on('uncaughtException',e=>{console.error(e.message);process.exit(1)});
// Local-only full SPA rehearsal: exact app, disposable PostgreSQL/Auth shim, in-memory photo storage.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {bootDisposable,seedJourneyActors,seedCoachRun,startDisposableServer,sessionFor,CASEY,RILEY} from './disposable-supabase.mjs';
import {html as publicHtml} from '../server/public-run.mjs';
import {runPhotos} from '../server/run-photos.mjs';
const {db}=await bootDisposable();await seedJourneyActors(db);
const fixtureRuns=[];
for(let i=1;i<=20;i++){
 const owner=i===1?CASEY:'33000000-0000-4000-a000-'+String(i).padStart(12,'0');
 if(i!==1)await db.query("insert into strava.profiles(id,auth_uid,handle,display_name,name) values($1,$1,$2,$3,$3)",[owner,'test-builder-'+i,'TEST DATA Builder '+i]);
 for(let j=0;j<2;j++){
 const id=(await db.query("insert into strava.runs(profile_id,title,visibility,harness,schema_version,measurement_revision,trace_basis,started_at,prompts,tool_calls,duration_s,project,story_result,rhythm) values($1,$2,'private','Codex',1,$3,'elapsed',now(),3,$4,$5,$6,$7,'[1,2,1]') returning id",[owner,'TEST DATA compact project '+j,(i*2+j).toString(16).padStart(64,'0'),20+i+j*17,1200+j*400,j?'Garden planner':'Photo journal',j?'Added a weekly view.':'A new way to arrange the week.'])).rows[0].id;
 if(i!==1||j===0)await db.query("update strava.runs set visibility='public' where id=$1",[id]);
 fixtureRuns.push({id,owner,i,j});
 }
}
const run=fixtureRuns[0].id,missing=fixtureRuns[1].id;
const backend=await startDisposableServer(db);const blobs=new Map();
const localFetch=async(url,opts={})=>{
 const u=new URL(url);if(u.origin!==backend.url)throw Error('Only disposable backend allowed');
 if(!u.pathname.startsWith('/storage/v1/object/'))return fetch(url,opts);
 const key=u.pathname.replace('/storage/v1/object/','').replace(/^authenticated\//,'');
 if(opts.method==='POST'){blobs.set(key,opts.body);return new Response('{}');}
 if(opts.method==='DELETE'){for(const name of JSON.parse(opts.body).prefixes)blobs.delete(key+'/'+name);return new Response('{}');}
 return blobs.has(key)?new Response(blobs.get(key)):new Response('{}',{status:404});
};
import sharp from 'sharp';
for(const row of fixtureRuns){
 const image=await sharp(Buffer.from(`<svg width="640" height="320" xmlns="http://www.w3.org/2000/svg"><rect width="640" height="320" fill="${row.j?'#e7edf1':'#eeeee8'}"/><text x="32" y="64" font-family="sans-serif" font-size="18" fill="#65707a">TEST DATA · COMPONENT FIXTURE</text><rect x="32" y="104" width="576" height="168" rx="10" fill="white"/><text x="56" y="160" font-family="sans-serif" font-size="32" fill="#222">${row.j?'Garden planner':'Photo journal'}</text><text x="56" y="212" font-family="sans-serif" font-size="18" fill="#647078">Builder ${row.i} · project ${row.j+1}</text></svg>`)).png().toBuffer();
 const headers={authorization:'Bearer '+sessionFor(row.owner,'fixture@example.test','test-builder').access_token};
 const config={SB_URL:backend.url,SB_KEY:'local-development-only',STORAGE_KEY:'local-only'};
 const out=await runPhotos({method:'POST',headers,body:{run_id:row.id,image_base64:image.toString('base64')}},config,localFetch);
 if(out.status!==201&&out.status!==200)throw Error(JSON.stringify(out));
 await runPhotos({method:'PATCH',headers,body:{run_id:row.id,photo_id:out.body.photo.id}},config,localFetch);
}
const root=resolve('dist');const sdk=process.env.STRIVE_SUPABASE_SDK;
if(!sdk)throw Error('Set STRIVE_SUPABASE_SDK to a local Supabase browser SDK file for offline rehearsal.');
const server=createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://127.0.0.1');
 res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ${backend.url}; img-src 'self' data: blob:`);
 if(u.pathname.startsWith('/r/')){await db.exec('reset role');const row=(await db.query('select * from strava.runs where id=$1',[u.pathname.slice(3)])).rows[0];res.setHeader('Content-Type','text/html');const photos=(await db.query('select * from strava.run_photos where run_id=$1',[row.id])).rows;return res.end(publicHtml(row,{photos}));}
 if(u.pathname==='/fixture'){
  const peer=u.searchParams.has('peer'),session=sessionFor(peer?RILEY:CASEY,'fixture@example.test',peer?'test-riley':'test-casey');
  res.setHeader('Content-Type','text/html');return res.end(`<meta name="viewport" content="width=device-width"><h1>STRIVE 20-person feed rehearsal · TEST DATA</h1><p>TEST DATA account, disposable database and local photo storage. No hosted services.</p><button id="go">Open ${peer?'peer':'owner'} fixture</button><script>go.onclick=()=>{localStorage.setItem('agentic-strava-auth',${JSON.stringify(JSON.stringify(session))});localStorage.setItem('ag_onboard_done','1');location.href='/?explore'}</script>`);
 }
 if(u.pathname==='/__fixture'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({run,missing,backend:backend.url,owner:CASEY,peer:RILEY,fixtureRuns}));}
 if(u.pathname==='/api/run-photos'){
  const chunks=[];for await(const c of req)chunks.push(c);const raw=Buffer.concat(chunks).toString();
  const out=await runPhotos({method:req.method,headers:req.headers,query:Object.fromEntries(u.searchParams),body:raw?JSON.parse(raw):undefined},{SB_URL:backend.url,SB_KEY:'local-development-only',STORAGE_KEY:'local-only'},localFetch);
  res.writeHead(out.status,{...out.headers,...(!Buffer.isBuffer(out.body)?{'Content-Type':'application/json'}:{})});return res.end(Buffer.isBuffer(out.body)?out.body:JSON.stringify(out.body));
 }
 if(u.pathname==='/local-supabase.js'){res.setHeader('Content-Type','text/javascript');return res.end(await readFile(sdk));}
 const file=resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+'/')){res.writeHead(404);return res.end();}
 let body=await readFile(file);if(file.endsWith('index.html'))body=Buffer.from(body.toString().replace('<body>', '<body><div style="background:#fff4cf;padding:8px;text-align:center;font-size:12px">TEST DATA · 20 synthetic builders · local only</div>').replace('http://127.0.0.1:54321',backend.url).replace('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2','/local-supabase.js'));
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg'})[extname(file)]||'application/octet-stream');res.end(body);
 }catch(e){res.writeHead(500,{'Content-Type':'text/plain'});res.end('Local rehearsal failed: '+e.message)}});
server.listen(Number(process.env.PORT)||0,'127.0.0.1',()=>console.log(JSON.stringify({url:'http://127.0.0.1:'+server.address().port,run,missing,backend:backend.url})));
process.on('SIGTERM',()=>{server.close();backend.server.close();db.close().then(()=>process.exit())});
