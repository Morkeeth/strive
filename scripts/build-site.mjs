import {cp,mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
import {runtimeConfig} from '../server/runtime-config.mjs';
import {BRAND,TAGLINE} from '../server/brand.mjs';
import {deploymentGitSha} from '../server/deployment-identity.mjs';
const config=runtimeConfig();
await mkdir('dist',{recursive:true});
await cp('site','dist',{recursive:true});
let html=await readFile('dist/index.html','utf8');
for(const name of ['SB_URL','SB_KEY']) {
 const pattern=new RegExp(`const ${name}="[^"]*";`);
 if(!pattern.test(html)) throw new Error(`Missing ${name} deployment marker`);
 html=html.replace(pattern,()=>`const ${name}=${JSON.stringify(config[name])};`);
}
// X sign-in can be switched on at build time (Vercel env AGENTGRINDER_X_SIGNIN=1) as well as by
// the runtime settings probe, so the button never waits on a guess about which key Supabase
// reports the X / Twitter (OAuth 2.0) provider under.
if(process.env.AGENTGRINDER_X_SIGNIN==='1') {
 const marker='const PROVIDERS_ENABLED=["github"];';
 if(!html.includes(marker)) throw new Error('Missing PROVIDERS_ENABLED marker');
 html=html.replace(marker,'const PROVIDERS_ENABLED=["github","x"];');
}
// Enable only after delivery from the configured custom SMTP sender has been verified.
if(process.env.STRIVE_EMAIL_SIGNIN==='1') {
 const marker='const EMAIL_SIGNIN_READY=false;';
 if(!html.includes(marker)) throw new Error('Missing email readiness marker');
 html=html.replace(marker,'const EMAIL_SIGNIN_READY=true;');
}
const gitSha=deploymentGitSha();
if(gitSha) {
 const title='<title>__BRAND__ · __TAGLINE__</title>';
 if(!html.includes(title)) throw new Error('Missing deployment identity marker');
 html=html.replace(title,`${title}\n<meta name="strive-git-sha" content="${gitSha}">`);
}
await writeFile('dist/index.html',html);

// The brand tokens carry the product name into every built text file, and __ORIGIN__ carries the
// deployed address into the share tags: a crawler will not resolve a relative og:image, so the
// home page's unfurl needs the absolute one this build is for. The source tree keeps the tokens
// so one edit in server/brand.mjs renames the product and one env var moves the address.
const TEXT=/\.(html|js|css|json|txt|webmanifest)$/;
async function files(dir) {
 const out=[];
 for(const entry of await readdir(dir,{withFileTypes:true})) {
  const path=`${dir}/${entry.name}`;
  if(entry.isDirectory()) out.push(...await files(path));
  else if(TEXT.test(entry.name)) out.push(path);
 }
 return out;
}
let replaced=0;
for(const path of await files('dist')) {
 const before=await readFile(path,'utf8');
 const after=before.replaceAll('__BRAND__',BRAND).replaceAll('__TAGLINE__',TAGLINE).replaceAll('__ORIGIN__',config.ORIGIN);
 if(after===before) continue;
 if(/__BRAND__|__TAGLINE__|__ORIGIN__/.test(after)) throw new Error(`Deployment token survived substitution in ${path}`);
 replaced++;
 await writeFile(path,after);
}
if(!replaced) throw new Error('Missing __BRAND__ deployment marker in the built site');
const built=await readFile('dist/index.html','utf8');
for(const tag of ['property="og:image"','name="twitter:card" content="summary_large_image"']) {
 if(!built.includes(tag)) throw new Error(`The home page lost its share tag: ${tag}`);
}
if(!built.includes(`content="${config.ORIGIN}/api/og"`)) throw new Error('The share image must be an absolute URL');
console.log(`Built ${BRAND} website with explicit strava schema; no privileged keys. Brand applied to ${replaced} file(s).`);
