import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{repository}=require('../site/github-project.js');
export class ProjectImportError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code;}}
const fail=(s,c,m)=>{throw new ProjectImportError(s,c,m);};
const safeHome=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.hostname.includes('.')&&!/^\d|:/.test(u.hostname)&&!/(?:^|\.)(localhost|local|internal)$/.test(u.hostname)?u.href:null;}catch(_){return null;}};
/** Reads one repository. Supabase bearer goes only to Supabase; optional GitHub bearer only to GitHub. */
export async function githubProject({query={},authorization,githubToken,config,fetcher=fetch}){
 if(Object.keys(query).some(k=>k!=='repo')||typeof query.repo!=='string')fail(400,'invalid_repository','Use a GitHub repository URL or owner/repository.');
 let requested;try{requested=repository(query.repo)}catch(e){fail(400,'invalid_repository',e.message);}
 if(githubToken&&(typeof githubToken!=='string'||githubToken.length>4096||/[\r\n]/.test(githubToken)))fail(400,'invalid_access','Reconnect GitHub to import this repository.');
 const deadline=AbortSignal.timeout(8000);
 const request=(url,options={})=>fetcher(url,{...options,redirect:'error',cache:'no-store',signal:deadline});
 let linkedId=null;
 if(githubToken){
  if(!/^Bearer \S+$/.test(authorization||''))fail(401,'sign_in_required','Sign in to use your connected GitHub access.');
  const auth=await request(config.SB_URL+'/auth/v1/user',{headers:{apikey:config.SB_KEY,Authorization:authorization}});
  if(!auth.ok)fail(401,'sign_in_required','Sign in again to use GitHub access.');
  const user=await auth.json(),identity=user.identities?.find(i=>i.provider==='github');linkedId=String(identity?.identity_data?.sub||'');
  if(!/^\d+$/.test(linkedId))fail(409,'github_link_required','Connect a GitHub account first.');
 }
 const headers={Accept:'application/vnd.github+json','User-Agent':'STRIVE-project-import','X-GitHub-Api-Version':'2022-11-28',...(githubToken?{Authorization:'Bearer '+githubToken}:{})};
 if(githubToken){
  const own=await request('https://api.github.com/user',{headers});
  if(!own.ok)fail(401,'github_access_expired','GitHub access expired. Sign in again or add the project manually.');
  const profile=await own.json();if(String(profile.id)!==linkedId)fail(403,'github_account_mismatch','GitHub access belongs to a different account. Sign in again.');
 }
 const r=await request('https://api.github.com/repos/'+requested.fullName.split('/').map(encodeURIComponent).join('/'),{headers});
 if(r.status===404)fail(404,'repository_unavailable','Repository not found or private. Use existing GitHub access, or add your project manually.');
 if(r.status===403&&r.headers.get('x-ratelimit-remaining')!=='0'&&!r.headers.get('retry-after'))fail(403,'github_permission_required','GitHub denied access. Check repository permissions or add details manually.');
 if(r.status===403||r.status===429)fail(429,'github_rate_limit','GitHub is limiting requests. Try again later; your manual text is kept.');
 if(!r.ok)fail(502,'github_unavailable','GitHub could not load this project. Try again later.');
 const data=await r.json();let canonical;try{canonical=repository(data.full_name)}catch(_){fail(502,'github_unavailable','GitHub returned incomplete repository details.');}
 if(!Number.isSafeInteger(data.id)||data.id<=0||typeof data.private!=='boolean'||(!githubToken&&data.private))fail(502,'github_unavailable','GitHub returned incomplete repository details.');
 return{repository:canonical.url,name:String(data.name||canonical.name).slice(0,120),description:typeof data.description==='string'?data.description.slice(0,2000):'',homepage:safeHome(data.homepage),private:data.private,owner:canonical.owner,source:'github',fetchedAt:new Date().toISOString()};
}
