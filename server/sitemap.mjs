// /sitemap.xml: public runs and the builders who posted them. Nothing else is listed: a profile
// with no public run is not advertised, and every run is re-checked as public here.
import {runtimeConfig} from './runtime-config.mjs';
import {runPath,profilePath,shareOrigin} from './share-routes.mjs';
import {validId} from './public-run.mjs';

const config=runtimeConfig();
const xml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const day=value=>{const t=Date.parse(value);return Number.isFinite(t)?new Date(t).toISOString().slice(0,10):null};
export const SITEMAP_CACHE='public, max-age=0, s-maxage=300, stale-while-revalidate=600';

export async function readSitemapRuns(fetcher=fetch){
 const query=new URLSearchParams({visibility:'eq.public',select:'id,title,created_at,visibility,profiles!runs_profile_id_fkey(handle,github_handle)',order:'created_at.desc',limit:'5000'});
 const response=await fetcher(config.SB_URL+'/rest/v1/runs?'+query,{headers:{apikey:config.SB_KEY,'Accept-Profile':config.SB_SCHEMA},cache:'no-store',signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw new Error('Public runs unavailable');
 const rows=await response.json();
 return Array.isArray(rows)?rows.filter(row=>row?.visibility==='public'&&validId(row.id)):[];
}

export function sitemapXml(runs){
 const entries=new Map([[shareOrigin+'/',null],[shareOrigin+'/install',null]]);
 for(const run of runs){
  const path=runPath(run);
  if(!path)continue;
  const lastmod=day(run.created_at);
  entries.set(shareOrigin+path,lastmod);
  const profile=profilePath(run.profiles?.handle||run.profiles?.github_handle);
  const url=profile&&shareOrigin+profile;
  if(url&&(!entries.get(url)||(lastmod&&lastmod>entries.get(url))))entries.set(url,lastmod);
 }
 const urls=[...entries].map(([loc,lastmod])=>`<url><loc>${xml(loc)}</loc>${lastmod?`<lastmod>${lastmod}</lastmod>`:''}</url>`).join('');
 return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`;
}
