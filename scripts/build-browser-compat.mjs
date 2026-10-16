// Compile deployment bytes, not source tests. Keep the pinned SDK local and CSP-hashed
// inline bytes final. esbuild changes syntax; browser-compat.js supplies missing APIs.
import {transform} from 'esbuild';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {checkBrowserCompat} from './check-browser-compat.mjs';
const options={target:['es2019','chrome80'],charset:'utf8',legalComments:'eof'};
export async function buildBrowserCompat(dir='dist'){
 const version=JSON.parse(await readFile('node_modules/@supabase/supabase-js/package.json','utf8')).version;
 const sdk=await readFile('node_modules/@supabase/supabase-js/dist/umd/supabase.js','utf8');
 const vendored=(await transform(sdk,{...options,minify:true})).code;
 await mkdir(dir+'/vendor',{recursive:true});const sdkPath=`/vendor/supabase-${version}.js`;
 await writeFile(dir+sdkPath,vendored);
 const integrity='sha384-'+createHash('sha384').update(vendored).digest('base64');
 async function visit(folder){for(const e of await readdir(folder,{withFileTypes:true})){
  const path=folder+'/'+e.name;if(e.isDirectory()){if(e.name!=='vendor')await visit(path);continue;}
  if(e.name.endsWith('.js'))await writeFile(path,(await transform(await readFile(path,'utf8'),{...options,...(path.endsWith('/review-image-engine/index.js')?{format:'iife',globalName:'StriveReviewImageEngine'}:{})})).code);
  if(!e.name.endsWith('.html'))continue;
  let html=await readFile(path,'utf8');
  html=html.replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^/]+\/dist\/umd\/supabase\.js/g,sdkPath).replace(/(\b(?:src|href)="\/vendor\/supabase-[^"]+"[^>]*\bintegrity=")[^"]+/g,'$1'+integrity);
  const matches=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  for(const m of matches){const code=(await transform(m[1],options)).code;html=html.replace(m[0],'<script>'+code+'</script>');}
  await writeFile(path,html);
 }}
 await visit(dir);
 const check=await checkBrowserCompat(dir);if(check.failures.length)throw Error(check.failures.join('\n'));
 console.log(`Browser compatibility: ${check.count} served scripts parse as ES2019; pinned Supabase ${version} compiled locally.`);
}
