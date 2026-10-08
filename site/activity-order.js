/* Activity time is the session clock. Saving or importing a run never makes it newer. */
(function(root){
  const time=r=>{const n=Date.parse(r?.started_at);return Number.isFinite(n)?n:null};
  const compare=(a,b)=>{const x=time(a),y=time(b);return x===null&&y!==null?1:y===null&&x!==null?-1:x!==y?(y||0)-(x||0):String(b.id||'').localeCompare(String(a.id||''))};
  const sort=rows=>[...new Map((rows||[]).map(r=>[r.id,r])).values()].sort(compare);
  const label=r=>{const t=time(r);return t===null?'Activity time not recorded':new Date(t).toLocaleString(undefined,{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})};
  const query=q=>q.order('started_at',{ascending:false,nullsFirst:false}).order('id',{ascending:false});
  const project=value=>{const raw=root.GrinderContract?.projectLabel(value)||'';if(!raw)return '';const name=raw.split(/[\\/]/).filter(Boolean).pop()||'';const key=name.toLowerCase();if(['agentgrinder-public','strive'].includes(key))return 'STRIVE';if(key==='arc-kaggle'||key==='arc kaggle')return 'ARC KAGGLE';if(key==='favour')return 'FAVOUR';return name.replace(/[_-]+/g,' ').replace(/\b[a-z]/g,c=>c.toUpperCase());};
  const api={time,compare,sort,label,query,project};root.StriveActivity=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
