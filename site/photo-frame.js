/* Shared by browser cards and signed-out run pages. No crop or subject inference. */
(function(root){
  function rule(width,height){
    const ratio=Number(width)/Number(height);
    if(!Number.isFinite(ratio)||ratio<=0)return {shape:'unknown',aspect:'4 / 3',fit:'contain'};
    return {shape:ratio>=1.6?'wide':ratio>=0.8?'square':'portrait',aspect:ratio>=1.6?'16 / 9':ratio>=0.8?'1 / 1':'4 / 5',fit:'contain'};
  }
  const api={rule};root.StrivePhotoFrame=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
