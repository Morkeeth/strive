/* One link-image tree for the hosted unfurl and the on-device sharing review. */
(function(root){
 const Feed=typeof module==='object'&&module.exports?require('./feed-card.js'):root.GrinderFeed;
 const BRAND='__BRAND__',BLUE='#0047ff',INK='#0a0a0a';
 const el=(type,props,...children)=>({type,props:{...props,children:children.length===1?children[0]:children}});
const wholeWords=(value,limit)=>{const text=String(value||'').replace(/\s+/g,' ').trim();if(text.length<=limit)return text;const cut=text.slice(0,limit+1);const end=cut.lastIndexOf(' ');return end>0?cut.slice(0,end).trimEnd()+'…':'Run…';};
const shareDuration=seconds=>{if(!Number.isFinite(seconds)||seconds<=0)return null;const rounded=Math.round(seconds);return rounded<60?`${rounded}s`:rounded<3600?`${Math.round(rounded/60)}m`:`${Math.floor(rounded/3600)}h ${Math.round(rounded%3600/60)}m`;};
const ridgeSeries=run=>{
 const values=run.ridge,workers=run.worker_bins;
 if(!Array.isArray(values)||values.length<40||values.length>60)return null;
 if(!values.every(v=>Number.isInteger(v)&&v>=0)||!values.some(v=>v>0))return null;
 if(workers!=null&&(!Array.isArray(workers)||workers.length!==values.length||!workers.every(v=>Number.isSafeInteger(v)&&v>=0)))return null;
 return{values,label:run.trace_basis==='observed native events; timestamps unavailable'?'Observed message order':'Agent ridge',filled:true};
};
const series=run=>{
 const ridge=ridgeSeries(run);
 if(ridge)return ridge;
 // A legacy rhythm remains readable when no ridge bins exist. A flat all-zero leftover rhythm is
 // not a trace, so it stays undrawn. `route` is the run map (Feed.routeGeometry), never a line.
 for(const [values,label] of [[run.rhythm,'Session trace']]){
  if(Array.isArray(values)&&values.length>1&&values.length<=10000&&values.every(v=>Number.isFinite(v)&&v>=0)&&values.some(v=>v>0))return{values,label,filled:false};
 }
 return null;
};
// Prefer the transcript count. When it is zero or missing and the stored ridge carried a
// real call count, print that count so the label matches the graph and the SPA strip.
// A recorded zero beside a live ridge with no ridge_tool_calls contradicts the map; omit it.
const toolCallCount=run=>{
 const recorded=run.tool_calls;
 const fromRidge=run.ridge_tool_calls;
 if((recorded==null||recorded===0)&&Number.isFinite(fromRidge)&&fromRidge>0)return fromRidge;
 const ridge=Array.isArray(run.ridge)?run.ridge:null;
 const ridgeLive=ridge&&ridge.length&&ridge.every(v=>Number.isFinite(v)&&v>=0)&&ridge.some(v=>v>0);
 if(recorded===0&&ridgeLive&&!(Number.isFinite(fromRidge)&&fromRidge>0))return null;
 return recorded;
};
const previewMetrics=run=>{
 const candidates=[['Commits',run.commits],['Files',run.files_touched],['Elapsed',shareDuration(run.wall_time_s??run.duration_s)],['Typed turns',run.prompts],['Tool calls',toolCallCount(run)]];
 return candidates.filter(([,value])=>value!==null&&value!==undefined&&value!==''&&(typeof value==='string'||Number.isFinite(value)&&value>0)).slice(0,3)
  .map(([label,value])=>[label,typeof value==='number'?value.toLocaleString('en-US'):String(value)]);
};
const previewBars=(run,color)=>{
 const trace=series(run);if(!trace||trace.values.length<8)return null;
 const peak=Math.max(...trace.values,1),values=trace.values.length>60?trace.values.filter((_,i)=>i%Math.ceil(trace.values.length/60)===0):trace.values;
 return el('div',{style:{display:'flex',alignItems:'flex-end',width:'100%',height:208,gap:4}},
  ...values.map(value=>el('div',{style:{display:'flex',flex:1,height:Math.max(7,Math.round(value/peak*200)),background:color,borderRadius:7}})));
};
const previewStats=(metrics,dark=false)=>el('div',{style:{display:'flex',width:'100%',height:100,gap:12,alignItems:'center'}},
 ...metrics.map(([label,value])=>el('div',{style:{display:'flex',flexDirection:'column',width:metrics.length===3?363:metrics.length===2?550:1112,minWidth:0}},
  el('div',{style:{display:'flex',fontSize:value.length>7?49:value.length>5?55:64,fontWeight:800,lineHeight:1,letterSpacing:-2,color:dark?'#fff':'#15254a',whiteSpace:'nowrap'}},value),
  el('div',{style:{display:'flex',fontSize:23,fontWeight:650,color:dark?'#cbd8ff':'#596784',marginTop:5}},label))));
function photoCard(run,photoUrls,opts={}){return linkPreviewCard(run,{...opts,photoUrls:Array.isArray(photoUrls)?photoUrls:[photoUrls]});}

// Built for the 300px-wide card people actually see in a message, from public run data only.
function linkPreviewCard(run,opts={}){
 const who=Feed.profileOf(run),metrics=previewMetrics(run),title=wholeWords(Feed.titleOf(run),66);
 const avatar=typeof opts.avatar==='string'&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(opts.avatar)?opts.avatar:null;
 const images=(Array.isArray(opts.photoUrls)?opts.photoUrls:[opts.photoUrl]).filter(url=>typeof url==='string'&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(url)).slice(0,3);
 const hasImages=images.length>0;
 const name=wholeWords(who.name,28);
 const face=avatar?el('img',{src:avatar,width:52,height:52,style:{width:52,height:52,borderRadius:26,objectFit:'cover'}}):
  el('div',{style:{display:'flex',width:52,height:52,borderRadius:26,alignItems:'center',justifyContent:'center',background:hasImages?'#e3eaff':'#fff',color:BLUE,fontSize:29,fontWeight:800}},String(name).trim().charAt(0).toUpperCase()||'S');
 const header=el('div',{style:{display:'flex',alignItems:'center',width:'100%',height:60}},
  el('div',{style:{display:'flex',alignItems:'center',gap:14}},
   el('div',{style:{display:'flex',width:35,height:35,borderRadius:9,background:hasImages?BLUE:'#fff',alignItems:'center',justifyContent:'center',color:hasImages?'#fff':BLUE,fontSize:25,fontWeight:800}},'S'),
   el('div',{style:{display:'flex',fontSize:35,fontWeight:800,letterSpacing:-1,color:hasImages?BLUE:'#fff'}},opts.brand||BRAND)),
  el('div',{style:{display:'flex',alignItems:'center',marginLeft:'auto',gap:12}},face,
   el('div',{style:{display:'flex',fontSize:28,fontWeight:700,color:hasImages?INK:'#fff'}},name)));
 const tileWidth=Math.floor((1112-12*(images.length-1))/Math.max(1,images.length));
 const media=hasImages?el('div',{style:{display:'flex',width:'100%',height:248,gap:12}},
  ...images.map(src=>el('img',{src,width:tileWidth,height:248,style:{width:tileWidth,height:248,objectFit:'cover',objectPosition:'center top',borderRadius:15}}))):
  el('div',{style:{display:'flex',alignItems:'flex-end',width:'100%',height:248,padding:'25px 0 14px'}},previewBars(run,'#fff')||el('div',{style:{display:'flex',fontSize:42,lineHeight:1.15,color:'#e7eeff',maxWidth:1050}},wholeWords(String(run.caption||'').split(/[.!?]/)[0],115)));
 return el('div',{style:{display:'flex',width:1200,height:630,background:hasImages?'#fff':BLUE,color:hasImages?INK:'#fff',fontFamily:'sans-serif',padding:'28px 44px 24px',flexDirection:'column'}},
  header,
  el('div',{style:{display:'flex',alignItems:'center',fontSize:56,fontWeight:800,lineHeight:1.04,letterSpacing:-1.6,height:116,overflow:'hidden',marginTop:18}},title),
  el('div',{style:{display:'flex',width:'100%',height:100,marginTop:18}},previewStats(metrics,!hasImages)),
  el('div',{style:{display:'flex',width:'100%',height:248,marginTop:18}},media));
}

const api={photoCard,linkPreviewCard,previewStats,series,toolCallCount,wholeWords,shareDuration};root.StriveLinkPreviewCard=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
