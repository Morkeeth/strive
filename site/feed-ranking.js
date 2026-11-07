/* Public-feed rule only. Actual reactions and authorized selected work images.
   No inferred engagement, personalized profile, or change to activity chronology. */
(function(root){
  'use strict';
  const activity=root.StriveActivity||(typeof require==='function'?require('./activity-order.js'):null);
  function rank(rows,{counts={},countsKnown=false,images={},now=Date.now()}={}){
    const newest=activity.sort(rows),scores={};
    if(!countsKnown||newest.some(r=>!Number.isSafeInteger(counts[r.id])||counts[r.id]<0))return {rows:newest,active:false,imageBonus:false,scores,reason:'Reactions could not load. Showing Latest.'};
    const imageBonus=newest.every(r=>typeof images[r.id]==='boolean');
    for(const run of newest){
      const raw=counts[run.id],likes=Number.isSafeInteger(raw)&&raw>=0?raw:0;
      const started=activity.time(run),age=started===null?null:Math.max(0,(now-started)/864e5);
      scores[run.id]=2*Math.log2(1+likes)+(imageBonus&&images[run.id]?0.5:0)+(age===null?0:2/(1+age));
    }
    return {rows:[...newest].sort((a,b)=>scores[b.id]-scores[a.id]||activity.compare(a,b)),active:true,imageBonus,scores};
  }
  const api={rank};root.StriveFeedRanking=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
