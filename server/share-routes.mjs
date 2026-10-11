import {runtimeConfig} from './runtime-config.mjs';
import {origin,readPublic,validId} from './public-run.mjs';

const config=runtimeConfig();
const reserved=new Set(['api','capture','about','privacy','terms','feed','people','add','r','l','d','proof','agents','account','connect','favicon','robots','sitemap','login','sign-in','post','projects','project','boards','inbox','following','mine','share']);
export const validHandle=value=>typeof value==='string'&&/^[a-z0-9](?:[a-z0-9_-]{0,38}[a-z0-9])?$/i.test(value)&&!reserved.has(value.toLowerCase());
export const slug=value=>String(value||'run').normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,64).replace(/-$/,'')||'run';
export const profilePath=handle=>validHandle(handle)?'/'+encodeURIComponent(handle):null;
export const runPath=run=>{
 const handle=run?.profiles?.handle||run?.profiles?.github_handle;
 return validHandle(handle)&&validId(run?.id)?`${profilePath(handle)}/${run.id.slice(0,8).toLowerCase()}-${slug(run.title)}`:null;
};
const headers={apikey:config.SB_KEY,'Accept-Profile':config.SB_SCHEMA};
export async function readProfile(handle,fetcher=fetch){
 if(!validHandle(handle))return null;
 const select='id,handle,github_handle,display_name,avatar_url';
 for(const key of ['handle','github_handle']){
  const query=new URLSearchParams({[key]:'eq.'+handle,select,limit:'1'});
  const response=await fetcher(config.SB_URL+'/rest/v1/profiles?'+query,{headers,cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error('Profile unavailable');
  const rows=await response.json();
  if(Array.isArray(rows)&&rows.length===1&&(rows[0].handle?.toLowerCase()===handle.toLowerCase()||rows[0].github_handle?.toLowerCase()===handle.toLowerCase()))return rows[0];
 }
 return null;
}
export async function readShortRun(handle,short,fetcher=fetch){
 if(!validHandle(handle)||!/^[0-9a-f]{8}$/i.test(short))return null;
 const lower=short.toLowerCase();
 const next=(BigInt('0x'+lower)+1n).toString(16).padStart(8,'0');
 const bounds=next.length===8?`(id.gte.${lower}-0000-0000-0000-000000000000,id.lt.${next}-0000-0000-0000-000000000000)`:`(id.gte.${lower}-0000-0000-0000-000000000000)`;
 const query=new URLSearchParams({and:bounds,visibility:'eq.public',select:'id,visibility,profiles!runs_profile_id_fkey(handle,github_handle)',limit:'20'});
 const response=await fetcher(config.SB_URL+'/rest/v1/runs?'+query,{headers,cache:'no-store',signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw new Error('Run unavailable');
 const rows=await response.json();
 const matches=Array.isArray(rows)?rows.filter(row=>row?.visibility==='public'&&row.id?.slice(0,8).toLowerCase()===lower&&[row.profiles?.handle,row.profiles?.github_handle].some(value=>value?.toLowerCase()===handle.toLowerCase())):[];
 return matches.length===1?readPublic(matches[0].id,fetcher):null;
}
export const canonicalProfile=handle=>origin+profilePath(handle);
