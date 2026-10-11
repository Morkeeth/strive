/* One browser rule for public profile and run links. Private runs keep their owner URL. */
(function(root){
 'use strict';
 const reserved=new Set(['api','capture','about','privacy','terms','feed','people','add','r','l','d','proof','agents','account','connect','favicon','robots','sitemap','login','sign-in','post','projects','project','boards','inbox','following','mine','share']);
 const validHandle=value=>typeof value==='string'&&/^[a-z0-9](?:[a-z0-9_-]{0,38}[a-z0-9])?$/i.test(value)&&!reserved.has(value.toLowerCase());
 const validId=value=>typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
 const slug=value=>String(value||'run').normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,64).replace(/-$/,'')||'run';
 const knownRuns=new Map();
 function profilePath(handle){return validHandle(handle)?'/'+encodeURIComponent(handle.toLowerCase()):null;}
 function runPath(run){
  if(run?.visibility!=='public'||!validId(run.id))return null;
  const profile=profilePath(run.profiles?.handle||run.profiles?.github_handle);
  if(!profile)return null;
  const path=profile+'/'+run.id.slice(0,8).toLowerCase()+'-'+slug(run.title);
  knownRuns.set(path,run.id);
  return path;
 }
 function profileHref(handle){return profilePath(handle)||'/?u='+encodeURIComponent(handle||'');}
 function runHref(run){return runPath(run)||'/?run='+encodeURIComponent(run?.id||'');}
 const api={profilePath,runPath,profileHref,runHref,knownRunId:path=>knownRuns.get(path)||null};
 root.StriveLinks=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
