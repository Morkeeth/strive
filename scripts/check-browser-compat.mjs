// Check the actual deployment output, including every inline script and lazy engine.
import {readFile,readdir} from 'node:fs/promises';
import {parse} from 'acorn';
import {pathToFileURL} from 'node:url';
export async function checkBrowserCompat(dir='dist'){
 const failures=[];let count=0;
 async function visit(folder){for(const e of await readdir(folder,{withFileTypes:true})){
  const path=folder+'/'+e.name;if(e.isDirectory()){await visit(path);continue}
  if(!/\.(js|html)$/.test(path))continue;
  const text=await readFile(path,'utf8');
  const scripts=path.endsWith('.js')?[text]:[...text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>!m[1].includes('src=')&&!/type=["'](?:application\/ld\+json|application\/json)/.test(m[1])).map(m=>m[2]);
  for(const [i,code] of scripts.entries()){count++;try{parse(code,{ecmaVersion:2019,sourceType:'script',allowHashBang:true})}catch(e){failures.push(`${path}#${i}: ${e.message}`)}}
  if(path.endsWith('.html')&&/cdn\.jsdelivr\.net\/npm\/@supabase/.test(text))failures.push(path+': untransformed external Supabase SDK');
 }}
 await visit(dir);return {count,failures};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const r=await checkBrowserCompat(process.argv[2]||'dist');console.log(JSON.stringify(r,null,2));if(r.failures.length)process.exitCode=1;}
