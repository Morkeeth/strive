/* Shared project links carry agent discovery in the background; no extra review component. */
(function(root){
 function mount({run}){if(run.visibility!=='public')return;root.document.querySelector('[data-project-agentic]')?.remove();const link=root.document.createElement('link');link.rel='alternate';link.type='text/markdown';link.title='Project instructions for agents';link.href='/r/'+encodeURIComponent(run.id)+'/agentic.md';link.dataset.projectAgentic='';root.document.head.append(link);}
 root.StriveAgentReview={mount};
})(typeof window!=='undefined'?window:globalThis);
