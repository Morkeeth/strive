/* Loaded first, deliberately ES5. No storage, telemetry, error text or URL collection. */
(function(root){
 var failed=false;
 function show(){
  failed=true;var box=document.getElementById('load-failure');if(box)box.hidden=false;
 }
 root.addEventListener('error',function(event){var target=event.target;if(target&&target!==root&&(target.tagName!=='SCRIPT'||target.hasAttribute('data-optional')))return;show();},true);
 root.addEventListener('unhandledrejection',show);
 document.addEventListener('DOMContentLoaded',function(){if(failed)show();});
})(window);
