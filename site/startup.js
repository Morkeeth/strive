/* One auth restore and one route for each settled identity. Cached state is a paint hint only. */
(function(root){
 function cachedMember(storage,now=Date.now()){
  try{const s=JSON.parse(storage.getItem('agentic-strava-auth'));return !!(s?.user?.id&&Number.isFinite(s.expires_at)&&s.expires_at*1000>now)}catch(_){return false}
 }
 function coordinator({refresh,route,generation}){
  let active=null;
  return function request(){
   if(active)return active;
   active=(async()=>{for(;;){const start=generation();await refresh();if(start!==generation())continue;await route();if(start===generation())break}})().finally(()=>{active=null});
   return active;
  };
 }
 const api={cachedMember,coordinator};root.StriveStartup=api;if(typeof module!=='undefined')module.exports=api;
 if(root.document){root.document.documentElement.dataset.authBoot='pending';try{root.document.documentElement.dataset.authHint=cachedMember(root.localStorage)?'member':'guest'}catch(_){root.document.documentElement.dataset.authHint='guest'}}
})(typeof window!=='undefined'?window:globalThis);
