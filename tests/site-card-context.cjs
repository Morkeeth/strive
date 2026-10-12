// Execute the browser's real card modules and inline composition, without a client.
// No network or storage rule is substituted. These fixtures render; they cannot save.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {JSDOM}=require('jsdom');
module.exports=function cardContext(root){
 const source=fs.readFileSync(path.join(root,'site/index.html'),'utf8');
 const dom=new JSDOM('<main id="app"></main>',{url:'https://striverun.app/'});
 const ctx={URL,URLSearchParams,TextEncoder,document:dom.window.document,location:dom.window.location,ME:null,console};ctx.window=ctx;
 vm.createContext(ctx);
 for(const file of ['auth','run-links','run-contract','code-route-view','run-estimates','story-tile','run-placeholders','run-context','run-story','run-evidence','feed-card','day','day-card','activity-order','activity-post','historical-import','fork-run'])
  vm.runInContext(fs.readFileSync(path.join(root,'site',file+'.js'),'utf8'),ctx,{filename:file+'.js'});
 const slice=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);if(a<0||b<=a)throw Error('Missing current card dependency boundary: '+start);return source.slice(a,b)};
 const profile=source.match(/^const profileHandle=.*;$/m);if(!profile)throw Error('Missing current profile presentation helper');
 vm.runInContext(profile[0]+'\n'+slice('const esc=s=>','function roastShapeLines(')+'\n'+slice('function coachModeBanner(','function safeOutputUrl(')+'\n'+slice('function safeOutputUrl(','function wireKudos(')+'\nfunction fiveRow(r){return StriveContext.metrics(r)}',ctx);
 return {ctx,dom,render:(run,opts={})=>ctx.runCard(run,false,0,opts)};
};
