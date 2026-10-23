(function(root){
  "use strict";

  function create(options={}){
    const every=options.setInterval||root.setInterval.bind(root);
    const cancel=options.clearInterval||root.clearInterval.bind(root);
    const visible=options.visible||(()=>root.document?.visibilityState!=="hidden");
    let timer=null,running=null,generation=0,baseline=null,probe=null,refresh=null,current=()=>true;

    async function tick(){
      const turn=generation,read=probe,paint=refresh,isCurrent=current;
      if(running===turn||!visible()||!isCurrent())return false;
      running=turn;
      try{
        const next=await read();
        if(turn!==generation||!isCurrent()||next==null)return false;
        if(baseline==null){await paint();if(turn!==generation||!isCurrent())return false;baseline=next;return true;}
        if(next===baseline)return false;
        await paint();
        if(turn!==generation||!isCurrent())return false;
        baseline=next;
        return true;
      }catch(_){
        return false;
      }finally{
        if(running===turn)running=null;
      }
    }

    function stop(){
      if(timer!=null)cancel(timer);
      timer=null;generation++;running=null;
    }

    function start(config){
      stop();
      baseline=config.baseline??null;
      probe=config.probe;
      refresh=config.refresh;
      current=config.current||(()=>true);
      timer=every(tick,config.intervalMs||30000);
      return timer;
    }

    return {start,stop,tick};
  }

  root.StriveFeedRefresh={create};
  if(typeof module!=="undefined"&&module.exports)module.exports=root.StriveFeedRefresh;
})(typeof window!=="undefined"?window:globalThis);
