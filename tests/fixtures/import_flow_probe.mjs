// Runs the shipped import preview and its Save handler in jsdom, and prints what happened as JSON.
//
// Real code: the importRun block of site/index.html (IMPORT_STASH up to viewShareRun), the page's
// own projectForSave / safeOutputUrl / safeRepoUrl / audienceLabel, and the site modules the page
// loads for the preview (run contract, feed card, activity post, import row, sharing review,
// three-step post flow). Only the network, sign-in, the photo draft store and navigation to the
// saved run are recorded stubs.
//
// usage: node import_flow_probe.mjs <repo root> <import url> '<json spec>'
// spec: {me, edits:{id:value}, audience, prior:[rows], priorAfterInsert:[rows], insertError,
//        lookupError, unlock, clicks}. prior answers every lookup by measurement reference;
//        priorAfterInsert answers only the lookups after the first (a concurrent first save).
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {createRequire} from 'node:module';
const [root,url,specText='{}']=process.argv.slice(2);
const spec=JSON.parse(specText);
const require=createRequire(path.join(root,'package.json'));
const {JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(path.join(root,'site',file),'utf8');
const html=read('index.html');
const dom=new JSDOM('<main id="app"></main>',{url,runScripts:'outside-only'});
const w=dom.window;
for(const file of ['run-contract','story-tile','run-placeholders','run-estimates','run-context','run-story','run-evidence','feed-card','day','day-card','activity-order','activity-post','import-row','sharing-review','post-flow'])w.eval(read(file+'.js'));

const seen={signins:0,stashed:[],statuses:[],lookups:[],inserts:[],updates:[],fairConfirms:[],viewed:[],photoDraftSaves:0};
const filtered=(table,kind,row)=>{
  const filters={};
  const chain={eq(key,value){filters[key]=value;return chain},order(){return chain},
    limit(){seen.lookups.push({table,filters:{...filters}});return Promise.resolve(spec.lookupError?{data:null,error:{message:spec.lookupError}}:{data:(seen.lookups.length>1&&spec.priorAfterInsert)||spec.prior||[],error:null})},
    select(){return chain},
    single(){return Promise.resolve({data:{id:filters.id||'updated-run'},error:null})},
    then(ok,no){return Promise.resolve({error:null}).then(ok,no)}};
  if(kind==='update')seen.updates.push({table,row,filters});
  return chain;
};
const sb={from:table=>({
  select:()=>filtered(table,'select'),
  insert:row=>{seen.inserts.push({table,row});return {select:()=>({single:async()=>spec.insertError?{data:null,error:spec.insertError}:{data:{id:'saved-run'},error:null}})}},
  update:row=>filtered(table,'update',row),
})};
const ctx={setTimeout,clearTimeout,window:w,document:w.document,location:w.location,history:w.history,
  sessionStorage:w.sessionStorage,localStorage:w.localStorage,URL,atob,Blob,Response,Uint8Array,
  DecompressionStream:globalThis.DecompressionStream,
  RUN_VIEW_GENERATION:0,AUTH_GENERATION:0,ME:spec.me?{id:'owner',rig:{}}:null,sb,
  GrinderContract:w.GrinderContract,GrinderFeed:w.GrinderFeed,StrivePost:w.StrivePost,StriveActivity:w.StriveActivity,
  StriveImportRow:w.StriveImportRow,StriveSharingReview:w.StriveSharingReview,
  StriveSharingLinkImage:{render(){}},
  StrivePhotoDraft:{mount(){},saveIfDraft:async()=>{seen.photoDraftSaves++;return false}},
  $:id=>w.document.getElementById(id),
  esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  frame(){},status:(text,bad)=>seen.statuses.push({text,bad:!!bad}),
  showSignIn:()=>{seen.signins++},requireCloseFriendsForSave:async()=>true,
  fairConfirmRun:id=>seen.fairConfirms.push(id),viewRun:async id=>{seen.viewed.push(id)}};
vm.createContext(ctx);
const slice=(from,to)=>{const a=html.indexOf(from),b=html.indexOf(to,a);if(a<0||b<0)throw new Error('index.html no longer has '+(a<0?from:to));return html.slice(a,b)};
vm.runInContext([
  slice('const SESSION_PICKER_LINE=','\n'),
  slice('function safeOutputUrl(','function segmentSelectHtml('),
  slice('function audienceLabel(','async function requireCloseFriendsForSave('),
  slice('function projectForSave(','function projectLinkHtml('),
  slice('const IMPORT_STASH=','\nasync function viewShareRun('),
].join('\n'),ctx);
// stashImport is the page's own; count its calls without replacing what it does.
const stash=ctx.stashImport;ctx.stashImport=token=>{seen.stashed.push(token);return stash(token)};

const tick=async(n=6)=>{for(let i=0;i<n;i++)await new Promise(r=>setTimeout(r,0))};
const $=ctx.$;
const handled=await ctx.importRun();
await tick();
const text=node=>node?node.textContent.replace(/\s+/g,' ').trim():null;
const out={handled,heading:text(w.document.querySelector('.head h2')),meta:text(w.document.querySelector('.head .meta')),
  note:text(w.document.querySelector('p[role="note"]')),previewHeading:text($('import-card-heading'))};
if($('i_pub')){
  for(const [id,value] of Object.entries(spec.edits||{})){$(id).value=value;$(id).dispatchEvent(new w.Event('input',{bubbles:true}));}
  if(spec.audience){$('i_vis').value=spec.audience;$('i_vis').dispatchEvent(new w.Event('change',{bubbles:true}));}
  Object.assign(out,{
    previewHtml:$('import-card-preview').innerHTML,
    previewText:text($('import-card-preview')),
    previewLinks:$('import-card-preview').querySelectorAll('a[href],button,form,input,select,textarea').length,
    steps:[...w.document.querySelectorAll('.post-flow-nav [data-post-step]')].map(b=>text(b)),
    projectField:$('i_project').value,repoField:$('i_repo').value,
    exportDisclosure:text(w.document.querySelector('.export-contents')),
    reviewedRow:JSON.parse(w.document.querySelector('[data-share-row]').textContent).run,
    pubDisabled:$('i_pub').disabled,pubLabel:text($('i_pub')),
  });
  // A saved run's action row, drawn by the same module, as the control for "the preview has none".
  out.savedActions=w.GrinderFeed.actions({id:'real-run',shareHref:'/?share=1&run=real-run',to:'real-author',count:0,acked:false,commentHref:'/?run=real-run#grind-thread'});
  out.previewActions=w.GrinderFeed.actions({mode:'preview'});
  // unlock: take the disabled attribute away first, so the click reaches the handler's own guard.
  if(spec.unlock)$('i_pub').disabled=false;
  for(let i=0;i<(spec.clicks??1);i++){$('i_pub').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await tick(12);}
  out.recovery=$('i_recover')&&!$('i_recover').hidden?text($('i_recover')):null;
}else out.appText=text($('app'));
out.location=w.location.pathname+w.location.search+w.location.hash.slice(0,12);
Object.assign(out,seen);
process.stdout.write(JSON.stringify(out));
w.close();
