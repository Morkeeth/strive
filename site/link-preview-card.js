/* One share-card design for every image a public run or profile travels as: the link preview a
   message unfurls (1200x630), the square post (1080x1080) and the story (1080x1920). The hosted
   image route (api/og.js) and the on-device sharing review draw these trees with the same fonts. */
(function(root){
 const node=typeof module==='object'&&module.exports;
 const Feed=node?require('./feed-card.js'):root.GrinderFeed;
 const agents=()=>(node?require('./agent-names.js'):root.StriveAgents)||null;
 const BRAND='__BRAND__',BLUE='#0047ff',INK='#232733',SOFT='#646b79',RULE='#e8ebf0',WASH='#f2f5ff',BLUE_SOFT='#c4d2ff',SKY='#dbe4ff',ORANGE='#fc4c02';
 const FONT='IBM Plex Sans';
 const FORMATS={link:{width:1200,height:630},square:{width:1080,height:1080},story:{width:1080,height:1920}};
 // The site's typeface, IBM Plex Sans (site/fonts, SIL Open Font License 1.1). `read(file)` returns
 // a file's bytes; when one cannot be read the renderer keeps its own bundled font.
 const FONT_FILES=[['ibm-plex-sans-latin-400-normal.woff',400],['ibm-plex-sans-latin-ext-400-normal.woff',400],['ibm-plex-sans-latin-600-normal.woff',600],['ibm-plex-sans-latin-ext-600-normal.woff',600]];
 async function fonts(read){try{return await Promise.all(FONT_FILES.map(async([file,weight])=>({name:FONT,data:await read(file),weight,style:'normal'})))}catch(_){return undefined}}
 const el=(type,props,...children)=>({type,props:{...props,children:children.length===1?children[0]:children}});
 // Letter spacing as a share of the size, to the hundredth of a pixel.
 const track=(size,ratio)=>Math.round(size*ratio*100)/100;
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
 if(run.trace_basis==='typed-by-author')return null;
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

// IBM Plex Sans advances for space to tilde, in hundredths of an em, at 400 and 600. Text is fitted
// here, so every block has a known height before the renderer lays it out.
const ADVANCE={400:'2428427160936924343445602740273860606060606060606060292960606048896465626758567071405163508171716171645857686189615958323832605660535850585532535725255327875756585837493557497751504634313460',
 600:'2431476660967126343456603040304460606060606060606060323260606049906766646960587172425568528272716471666158696495666360334433605660566051605635555928285629895956606039503759528254525036383660'};
const advance=(code,weight)=>code>=32&&code<127?Number(ADVANCE[weight>=600?600:400].substr((code-32)*2,2)):code>=0x2e80?100:60;
const measure=(text,size,weight=400,tracking=0)=>{let width=0;for(const ch of String(text))width+=advance(ch.codePointAt(0),weight)*size/100+tracking;return width;};
// Whole-word lines for a block `width` wide. When the text needs more than `lines`, the last line
// ends in an ellipsis; a single word wider than the block is cut to fit.
function fitLines(value,{size,weight=400,width,lines=1,tracking=0}){
 const fits=text=>measure(text,size,weight,tracking)<=width,out=[];let line='';
 for(let word of String(value??'').replace(/\s+/g,' ').trim().split(' ')){
  if(!word)continue;
  if(fits(line?line+' '+word:word)){line=line?line+' '+word:word;continue;}
  if(line)out.push(line);
  while(word.length>1&&!fits(word)){let cut=word.length-1;while(cut>1&&!fits(word.slice(0,cut)))cut--;out.push(word.slice(0,cut));word=word.slice(cut);}
  line=word;
 }
 if(line)out.push(line);
 if(out.length<=lines)return Object.assign(out,{truncated:false});
 const kept=out.slice(0,lines);let last=kept[lines-1];
 while(last&&!fits(last+'…')){const space=last.lastIndexOf(' ');last=space>0?last.slice(0,space):last.slice(0,-1);}
 kept[lines-1]=last.replace(/[\s,.;:!?·–—-]+$/,'')+'…';
 return Object.assign(kept,{truncated:true});
}
// One text node per block: the fitted lines decide its height, and the renderer's own wrap stays
// inside it (the clamp only matters if the renderer breaks a line earlier than the fit did).
function textBlock(text,{size,weight=400,width,lines=1,color=INK,leading=1.15,tracking=0}){
 const fitted=fitLines(text,{size,weight,width,lines,tracking});
 if(!fitted.length)return null;
 const line=Math.round(size*leading);
 return {lines:fitted.length,truncated:fitted.truncated,height:fitted.length*line,node:el('div',{style:{display:'block',width,height:fitted.length*line,flexShrink:0,fontSize:size,fontWeight:weight,lineHeight:`${line}px`,letterSpacing:tracking,color,overflow:'hidden',lineClamp:fitted.length}},fitted.join(' '))};
}
// The largest [size, lines] option that holds the whole text, else the last option, cut.
function bestBlock(text,width,options,style={}){
 let best=null;
 for(const [size,lines] of options){best=textBlock(text,{weight:600,tracking:track(size,-.02),...style,size,width,lines});if(!best||!best.truncated)break;}
 return best;
}
const oneLine=(text,{size,weight=400,width,color=INK,tracking=0})=>el('div',{style:{display:'flex',flexShrink:0,fontSize:size,fontWeight:weight,lineHeight:1.2,letterSpacing:tracking,color,whiteSpace:'nowrap'}},fitLines(text,{size,weight,width,lines:1,tracking})[0]||'');

const dataImage=url=>typeof url==='string'&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(url);
const validId=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// The run's own day, in UTC, as the /r/ page prints it. A shared image never says "today".
const dayOf=run=>{const t=Date.parse(run.started_at||run.created_at);if(!Number.isFinite(t))return'';const d=new Date(t);return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;};
// PRODUCT.md: at most three recorded facts, in its order — commits, the labelled elapsed span and
// files touched. Tool-call and turn totals are not hero facts. A recorded zero is left off, and a
// field the row did not record is never drawn.
const previewMetrics=run=>run.trace_basis==='typed-by-author'?[]:[['Commits',run.commits],['Elapsed',shareDuration(run.wall_time_s??run.duration_s)],['Files',run.files_touched]]
 .filter(([,value])=>typeof value==='string'?value.length>0:Number.isFinite(value)&&value>0)
 .map(([label,value])=>[label,typeof value==='number'?value.toLocaleString('en-US'):value]);
// The agent and its recorded models, by the names a person reads, each with its maker.
function tools(run){
 if(run.trace_basis==='typed-by-author')return [];
 const names=agents();
 const all=[run.harness?names?names.agent(run.harness):{name:String(run.harness),maker:null}:null,
  ...(names?names.recordedModels(run):[]),
  run.model?names?names.model(run.model):{name:String(run.model),maker:null}:null].filter(item=>item&&item.name);
 return all.filter((item,i)=>all.findIndex(other=>other.name===item.name)===i);
}
const authored=run=>String(run.caption||run.story_result||'').replace(/\s+/g,' ').trim();

// The axis the stored trace was recorded on. A trace without a known clock never claims one.
const traceAxis=(run,ridge)=>ridge
 ?run.trace_basis==='observed native events; timestamps unavailable'?'Agent activity · observed message order'
  :run.ridge_basis==='wall-time'?'Agent activity · wall time':run.ridge_basis==='turn-order'?'Agent activity · turn order':'Agent activity · call order'
 :run.trace_basis==='elapsed'||run.trace_basis==='elapsed-agent-tool-calls'?'Session activity · elapsed time':run.trace_basis==='position'?'Session activity · event order':'Session activity';
// The stored trace as at most 60 bars, peaks kept. Commit ticks sit only on measured ridge bins.
function traceBins(run){
 const trace=series(run);if(!trace||trace.values.length<8)return null;
 let values=trace.values;
 if(values.length>60){const step=Math.ceil(values.length/60);values=Array.from({length:Math.ceil(values.length/step)},(_,i)=>Math.max(...values.slice(i*step,(i+1)*step)));}
 const ridge=!!ridgeSeries(run);
 const commits=new Set(ridge&&Array.isArray(run.commit_bins)&&(run.commit_basis==null||run.commit_basis===run.ridge_basis)?run.commit_bins.filter(v=>Number.isSafeInteger(v)&&v>=0&&v<values.length):[]);
 return {values,commits,axis:traceAxis(run,ridge)};
}
function traceNode(bins,{width,height,gap,radius,tick=0,label=0}){
 const peak=Math.max(...bins.values,1),ticks=tick>0&&bins.commits.size>0;
 const labelHeight=label?Math.round(label*1.5):0,tickHeight=ticks?tick+Math.round(tick*.6):0;
 return el('div',{style:{display:'flex',flexDirection:'column',width,height,flexShrink:0}},
  el('div',{style:{display:'flex',alignItems:'flex-end',width,height:height-tickHeight-labelHeight,gap}},
   ...bins.values.map(value=>el('div',{style:{display:'flex',flex:1,height:value?`${Math.max(4,Math.round(value/peak*100))}%`:'3%',background:value?BLUE:BLUE_SOFT,borderRadius:radius}}))),
  ticks?el('div',{style:{display:'flex',width,height:tickHeight,gap,alignItems:'flex-end'}},
   ...bins.values.map((_,i)=>el('div',{style:{display:'flex',flex:1,height:tick,justifyContent:'center'}},bins.commits.has(i)?el('div',{style:{display:'flex',width:Math.max(3,Math.round(tick/5)),height:tick,background:INK,borderRadius:2}}):null))):null,
  label?el('div',{style:{display:'flex',alignItems:'flex-end',justifyContent:'space-between',width,height:labelHeight,fontSize:label,color:SOFT}},
   el('div',{style:{display:'flex'}},bins.axis),
   ticks?el('div',{style:{display:'flex',alignItems:'center'}},el('div',{style:{display:'flex',width:3,height:Math.round(label*.9),background:INK,borderRadius:2,marginRight:Math.round(label*.4)}}),'Commit'):null):null);
}
// Up to three images, the first one largest. A wide panel puts the others beside it, a squarer one
// under it, so landscape screenshots keep their shape. The hosted route crops each to its slot.
function slotsFor(count,width,height,gap){
 const wide=width>=height*1.3,slots=[];
 if(count===1)slots.push({width,height});
 else if(count===2){if(wide){const half=Math.floor((width-gap)/2);slots.push({width:width-gap-half,height},{width:half,height});}else{const half=Math.floor((height-gap)/2);slots.push({width,height:height-gap-half},{width,height:half});}}
 else if(count>=3){
  if(wide){const first=Math.round((width-gap)*.62),rest=width-gap-first,top=Math.floor((height-gap)/2);slots.push({width:first,height},{width:rest,height:height-gap-top},{width:rest,height:top});}
  else{const first=Math.round((height-gap)*.6),rest=height-gap-first,left=Math.floor((width-gap)/2);slots.push({width,height:first},{width:width-gap-left,height:rest},{width:left,height:rest});}
 }
 return Object.assign(slots,{wide});
}
function mosaic(tiles,slots,{gap,radius}){
 const tile=(item,slot)=>dataImage(item.url)
  ?el('img',{src:item.url,width:slot.width,height:slot.height,style:{width:slot.width,height:slot.height,objectFit:'cover',objectPosition:'center top',borderRadius:radius}})
  :quote(item.title,{...slot,radius,sizes:[34,28,24,20].filter(size=>size<=Math.max(20,slot.width/6)),mark:false});
 const direction=slots.wide?'row':'column',across=slots.wide?'column':'row';
 if(tiles.length<3)return el('div',{style:{display:'flex',flexDirection:direction,gap,flexShrink:0}},...tiles.map((item,i)=>tile(item,slots[i])));
 return el('div',{style:{display:'flex',flexDirection:direction,gap,flexShrink:0}},tile(tiles[0],slots[0]),el('div',{style:{display:'flex',flexDirection:across,gap}},tile(tiles[1],slots[1]),tile(tiles[2],slots[2])));
}
// Missing imagery is a blue tile carrying the author's words, never an invented picture. The text
// takes the largest of `sizes` that holds it in at most five lines.
function quote(text,{width,height,radius,sizes,mark=true}){
 const pad=Math.round(Math.min(width,height)*.09);
 let body=null,markSize=0;
 for(const size of sizes){
  markSize=mark?Math.round(size*1.4):0;
  const lines=Math.max(1,Math.min(5,Math.floor((height-2*pad-markSize)/Math.round(size*1.2))));
  body=textBlock(text,{size,weight:600,width:width-2*pad,lines,color:'#fff',leading:1.2,tracking:track(size,-.01)});
  if(!body||!body.truncated)break;
 }
 return el('div',{style:{display:'flex',flexDirection:'column',justifyContent:'flex-end',width,height,padding:pad,borderRadius:radius,background:BLUE,flexShrink:0}},
  mark?el('div',{style:{display:'flex',height:markSize,fontSize:markSize*1.6,lineHeight:1,color:SKY}},'“'):null,
  body?body.node:null);
}
function face(avatar,size){
 if(dataImage(avatar))return el('img',{src:avatar,width:size,height:size,style:{width:size,height:size,borderRadius:size/2,objectFit:'cover',flexShrink:0}});
 const mark=Math.round(size*.68);
 return el('div',{style:{display:'flex',width:size,height:size,borderRadius:size/2,background:BLUE,alignItems:'center',justifyContent:'center',flexShrink:0}},
  el('svg',{width:mark,height:mark,viewBox:'0 0 64 64'},
   el('polyline',{points:'10,44 20,36 28,40 36,20 44,30 54,16',fill:'none',stroke:'#fff',strokeWidth:6,strokeLinecap:'round',strokeLinejoin:'round'}),
   el('circle',{cx:36,cy:20,r:5,fill:ORANGE,stroke:'#fff',strokeWidth:2})));
}
function author({name,handle,avatar},{size,nameSize,handleSize,width}){
 const textWidth=width-size-Math.round(size*.25);
 return el('div',{style:{display:'flex',alignItems:'center',height:size,flexShrink:0}},face(avatar,size),
  el('div',{style:{display:'flex',flexDirection:'column',marginLeft:Math.round(size*.25)}},
   oneLine(name,{size:nameSize,weight:600,width:textWidth}),
   handle?oneLine(handle,{size:handleSize,width:textWidth,color:SOFT}):null));
}
const chipWidth=(item,{size,pad})=>Math.ceil(measure(item.name,size,600)+2*pad+(item.maker&&agents()?.mark(item.maker)?Math.round(size*1.5):0));
function chip(item,{size,height,pad,width}){
 const names=agents(),logo=item.maker&&names?.mark(item.maker)?names.markNode(el,item.maker,Math.round(size*1.1)):null;
 const room=(width||Infinity)-2*pad-(logo?Math.round(size*1.5):0);
 return el('div',{style:{display:'flex',alignItems:'center',height,padding:`0 ${pad}px`,borderRadius:height/2,background:WASH,color:INK,fontSize:size,fontWeight:600,whiteSpace:'nowrap',flexShrink:0}},
  logo?el('div',{style:{display:'flex',marginRight:Math.round(size*.4)}},logo):null,
  fitLines(item.name,{size,weight:600,width:room,lines:1})[0]);
}
// As many chips as fit on one row, in order; the first is shortened rather than dropped.
function chipRow(items,{width,size,height,pad,gap,limit=3}){
 const shown=[];let used=0;
 for(const item of items.slice(0,limit)){const w=chipWidth(item,{size,pad});if(shown.length&&used+gap+w>width)break;shown.push(item);used+=(shown.length>1?gap:0)+w;}
 return shown.length?el('div',{style:{display:'flex',gap,height,flexShrink:0}},...shown.map((item,i)=>chip(item,{size,height,pad,width:i===0?width:undefined}))):null;
}
// The figure above its label, as on the link image since 11 Oct 2026; at most three columns, and
// one figure size for the row so a long duration does not shout over a count.
function factRow(metrics,{width,value,label,gap}){
 const column=Math.floor((width-gap*2)/3);
 const size=Math.min(value,...metrics.map(([,figure])=>Math.floor(column*.86/Math.max(1,measure(figure,1,600,-.03)))));
 return el('div',{style:{display:'flex',width,gap,flexShrink:0}},
  ...metrics.map(([name,figure])=>el('div',{style:{display:'flex',flexDirection:'column',width:column}},
   el('div',{style:{display:'flex',height:value,alignItems:'flex-end',fontSize:size,fontWeight:600,lineHeight:1,letterSpacing:track(size,-.03),color:INK,whiteSpace:'nowrap'}},figure),
   el('div',{style:{display:'flex',fontSize:label,lineHeight:1.2,color:SOFT,marginTop:Math.round(label*.35)}},name))));
}
const factHeight=({value,label})=>value+Math.round(label*.35)+Math.round(label*1.2);
// The brand band every format shares: the white card on STRIVE blue, the brand and the day above
// it and, on the formats people post as images, the run's address and a way to post your own.
function frame({width,height,pad,top,bottom,head,brandSize,metaSize,brand,meta,gap,card,cardPad,radius,foot}){
 const footHeight=foot?foot.height:0,cardHeight=height-top-bottom-head-gap-(foot?gap+footHeight:0);
 return el('div',{style:{display:'flex',flexDirection:'column',width,height,background:BLUE,fontFamily:FONT,color:INK,padding:`${top}px ${pad}px ${bottom}px`}},
  el('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',height:head,flexShrink:0}},
   el('div',{style:{display:'flex',fontSize:brandSize,fontWeight:600,letterSpacing:track(brandSize,-.05),lineHeight:1,color:'#fff'}},brand),
   meta?el('div',{style:{display:'flex',fontSize:metaSize,color:SKY}},meta):null),
  el('div',{style:{display:'flex',flexDirection:'column',width:width-2*pad,height:cardHeight,marginTop:gap,padding:cardPad,borderRadius:radius,background:'#fff',flexShrink:0}},...card),
  foot?el('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',height:footHeight,marginTop:gap,flexShrink:0}},
   el('div',{style:{display:'flex',fontSize:foot.size,color:SKY}},foot.address||''),
   el('div',{style:{display:'flex',alignItems:'center',height:footHeight,padding:`0 ${Math.round(footHeight*.42)}px`,borderRadius:footHeight/2,background:'#fff',color:BLUE,fontSize:foot.pill,fontWeight:600}},'Post yours →')):null);
}
const parts=(run,opts)=>{const who=Feed.profileOf(run);return{name:who.name||'Builder',handle:who.handle&&who.handle!==who.name?'@'+who.handle:'',avatar:dataImage(opts.avatar)?opts.avatar:null,
 title:Feed.titleOf(run),caption:authored(run),date:dayOf(run),metrics:previewMetrics(run),bins:traceBins(run),tools:tools(run),brand:opts.brand||BRAND,
 address:typeof opts.address==='string'?opts.address.slice(0,64):''};};
const images=list=>(Array.isArray(list)?list:[list]).filter(dataImage).slice(0,3).map(url=>({url}));

// THE STORY, 1080x1920, and THE SQUARE, 1080x1080: author, title, the trace beside or under any
// selected images, the recorded facts, and the agent and models.
const POSTER={
 story:{width:1080,height:1920,pad:64,top:72,bottom:72,head:72,brandSize:60,metaSize:30,gap:40,cardPad:56,radius:44,foot:{height:96,size:30,pill:32},
  block:36,face:96,nameSize:38,handleSize:28,title:[[68,2],[58,3]],caption:{size:34,lines:3,withImages:2},fact:{value:96,label:30,gap:24},chip:{size:28,height:60,pad:24,gap:14},trace:{gap:6,radius:6,tick:22,label:26,min:220},quote:[76,64,56,48]},
 square:{width:1080,height:1080,pad:48,top:44,bottom:44,head:56,brandSize:48,metaSize:26,gap:28,cardPad:44,radius:36,foot:{height:76,size:26,pill:28},
  block:26,face:72,nameSize:30,handleSize:24,title:[[54,2],[46,3]],caption:null,fact:{value:76,label:24,gap:20},chip:{size:22,height:46,pad:18,gap:10},trace:{gap:5,radius:5,tick:16,label:20,min:0},quote:[56,48,42,36]}
};
function posterLayout(run,count,opts,format){
 const L=POSTER[format],p=parts(run,opts),inner=L.width-2*L.pad-2*L.cardPad;
 const cardHeight=L.height-L.top-L.bottom-L.head-L.gap-(L.gap+L.foot.height),room=cardHeight-2*L.cardPad;
 const visual=count?'images':p.bins?'trace':'quote',tileText=visual==='quote'?(p.caption||p.title):null;
 const title=visual==='quote'&&!p.caption?null:bestBlock(p.title,inner,L.title,{leading:1.1});
 const caption=L.caption&&visual!=='quote'&&p.caption?textBlock(p.caption,{size:L.caption.size,width:inner,lines:count?L.caption.withImages:L.caption.lines,color:SOFT,leading:1.35}):null;
 // On the square the agent and models ride on the author row; the story gives them their own.
 const chipsOwnRow=format==='story'&&p.tools.length>0;
 const blocks=[L.face,title?.height,caption?.height,p.metrics.length?factHeight(L.fact)+L.block:0,chipsOwnRow?L.chip.height:0].filter(Boolean);
 const visualHeight=room-blocks.reduce((sum,h)=>sum+h,0)-L.block*blocks.length;
 // The story stacks the trace under the images; the square sets it beside them.
 const both=visual==='images'&&!!p.bins,stacked=both&&format==='story',beside=both&&format==='square';
 const traceHeight=stacked?Math.max(L.trace.min,Math.round(visualHeight*.3)):0;
 const imageHeight=visual==='images'?visualHeight-(traceHeight?traceHeight+L.block:0):0;
 const imageWidth=beside?Math.round((inner-L.block)*.6):inner;
 return {L,p,inner,title,caption,visual,tileText,chipsOwnRow,visualHeight,traceHeight,imageHeight,imageWidth,beside,slots:slotsFor(count,imageWidth,imageHeight,Math.round(L.block/2))};
}
function posterCard(run,urls,opts,format){
 const tiles=images(urls),{L,p,inner,title,caption,visual,tileText,chipsOwnRow,visualHeight,traceHeight,imageWidth,beside,slots}=posterLayout(run,tiles.length,opts,format);
 const chipStyle={...L.chip,width:inner},chips=chipsOwnRow?chipRow(p.tools,chipStyle):null;
 const sideChips=!chipsOwnRow&&p.tools.length?chipRow(p.tools,{...chipStyle,width:Math.round(inner*.52),limit:2}):null;
 const head=el('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',width:inner,height:L.face,flexShrink:0}},
  author(p,{size:L.face,nameSize:L.nameSize,handleSize:L.handleSize,width:sideChips?Math.round(inner*.46):inner}),sideChips);
 const traceStyle={width:inner,gap:L.trace.gap,radius:L.trace.radius,tick:L.trace.tick,label:L.trace.label};
 const radius=Math.round(L.radius*.55),gallery=visual==='images'?mosaic(tiles,slots,{gap:Math.round(L.block/2),radius}):null;
 const inset=Math.round(L.block*.8),panelWidth=inner-imageWidth-L.block;
 const picture=beside?el('div',{style:{display:'flex',gap:L.block,flexShrink:0}},gallery,
   el('div',{style:{display:'flex',width:panelWidth,height:visualHeight,padding:inset,borderRadius:radius,background:WASH,flexShrink:0}},
    traceNode(p.bins,{...traceStyle,width:panelWidth-2*inset,height:visualHeight-2*inset,gap:Math.max(2,L.trace.gap-2),radius:3,label:0})))
  :visual==='images'?el('div',{style:{display:'flex',flexDirection:'column',gap:L.block,flexShrink:0}},gallery,traceHeight?traceNode(p.bins,{...traceStyle,height:traceHeight}):null)
  :visual==='trace'?traceNode(p.bins,{...traceStyle,height:visualHeight})
  :quote(tileText,{width:inner,height:visualHeight,radius,sizes:L.quote,mark:!!p.caption});
 const facts=p.metrics.length?el('div',{style:{display:'flex',flexDirection:'column',flexShrink:0,borderTop:`2px solid ${RULE}`,paddingTop:L.block-2}},factRow(p.metrics,{width:inner,...L.fact})):null;
 return frame({...L,brand:p.brand,meta:p.date,foot:{...L.foot,address:p.address},
  card:[el('div',{style:{display:'flex',flexDirection:'column',gap:L.block,width:inner}},head,title?.node||null,caption?.node||null,picture,facts,chips)]});
}
const storyCard=(run,urls=[],opts={})=>posterCard(run,urls,opts,'story');
const squareCard=(run,urls=[],opts={})=>posterCard(run,urls,opts,'square');

// THE LINK PREVIEW, 1200x630: built for the 500px card a message or a post shows. Words on the
// left, the run's picture on the right: its selected images, else its trace, else its caption.
// X lays its domain label over the image's bottom-left corner, so the card ends above it.
const LINK={width:1200,height:630,pad:40,top:26,bottom:76,head:46,brandSize:34,metaSize:22,gap:18,cardPad:36,radius:28};
function linkLayout(run,count,opts){
 const p=parts(run,opts),inner=LINK.width-2*LINK.pad-2*LINK.cardPad,innerHeight=LINK.height-LINK.top-LINK.bottom-LINK.head-LINK.gap-2*LINK.cardPad;
 const visual=count?'images':p.bins?'trace':p.caption?'quote':null,side=visual?440:0,left=visual?inner-side-40:inner;
 return {p,inner,innerHeight,visual,side,left,slots:slotsFor(count,side,innerHeight,10)};
}
function linkPreviewCard(run,opts={}){
 const tiles=images(opts.photoUrls??opts.photoUrl),{p,innerHeight,visual,side,left,slots}=linkLayout(run,tiles.length,opts);
 const title=bestBlock(p.title,left,visual?[[46,2],[40,3]]:[[56,2],[48,3]],{leading:1.12});
 const chips=chipRow(p.tools,{width:left,size:19,height:40,pad:14,gap:8});
 const facts=p.metrics.length?factRow(p.metrics,{width:left,value:54,label:20,gap:18}):null;
 const words=el('div',{style:{display:'flex',flexDirection:'column',width:left,height:innerHeight,flexShrink:0}},
  author(p,{size:56,nameSize:26,handleSize:20,width:left}),
  el('div',{style:{display:'flex',marginTop:22}},title?.node||null),
  el('div',{style:{display:'flex',flexDirection:'column',marginTop:'auto',gap:18}},facts,chips));
 const picture=visual==='images'?mosaic(tiles,slots,{gap:10,radius:16})
  :visual==='trace'?el('div',{style:{display:'flex',width:side,height:innerHeight,padding:24,borderRadius:18,background:WASH,flexShrink:0}},traceNode(p.bins,{width:side-48,height:innerHeight-48,gap:3,radius:3,tick:14}))
  :visual==='quote'?quote(p.caption,{width:side,height:innerHeight,radius:18,sizes:[36,32,28,24]}):null;
 return frame({...LINK,brand:p.brand,meta:p.date,card:[el('div',{style:{display:'flex',justifyContent:'space-between',width:LINK.width-2*LINK.pad-2*LINK.cardPad,height:innerHeight}},words,picture)]});
}
function photoCard(run,photoUrls,opts={}){return linkPreviewCard(run,{...opts,photoUrls:Array.isArray(photoUrls)?photoUrls:[photoUrls]});}
// The crop size the hosted route gives each selected image, so no tile is scaled twice.
function photoSlots(run,format='link',count=1){
 const n=Math.max(0,Math.min(3,Math.floor(count)||0));
 return [...(format==='story'||format==='square'?posterLayout(run,n,{},format).slots:linkLayout(run,n,{}).slots)];
}
function shareCard(run,urls=[],opts={}){return opts.format==='story'?storyCard(run,urls,opts):opts.format==='square'?squareCard(run,urls,opts):photoCard(run,urls,opts);}

// A PROFILE LINK, in the same design: who, their public totals, the agents they post with, and
// their latest public runs as images or title tiles. Totals come from the public rows passed in.
function profileStats(profile,activities){
 const projects=new Set(activities.map(run=>String(run.project||'').trim().toLowerCase()).filter(Boolean));
 const commits=activities.reduce((sum,run)=>sum+(Number.isInteger(run.commits)&&run.commits>0?run.commits:0),0);
 return [['Public runs',activities.length?activities.length>=50?'50+':String(activities.length):null],['Projects',projects.size?String(projects.size):null],['Commits',commits?commits.toLocaleString('en-US'):null]].filter(([,value])=>value);
}
function profileTools(activities){
 const names=agents(),seen=new Map();
 for(const run of activities){const who=run.harness?names?names.agent(run.harness):{name:String(run.harness),maker:null}:null;if(who&&!seen.has(who.name))seen.set(who.name,who);}
 return [...seen.values()];
}
const profileTileSlots=count=>slotsFor(Math.max(0,Math.min(3,Math.floor(count)||0)),440,LINK.height-LINK.top-LINK.bottom-LINK.head-LINK.gap-2*LINK.cardPad,10);
const profileSlots=count=>[...profileTileSlots(count)];
function profileLinkCard(profile,opts={}){
 const activities=(Array.isArray(opts.activities)?opts.activities:[]).filter(run=>run?.visibility==='public'&&validId(run.id)&&run.profile_id===profile.id).slice(0,50);
 const handle=profile.handle||profile.github_handle||'',name=profile.display_name||handle||'Builder';
 const tiles=(Array.isArray(opts.tiles)?opts.tiles:[]).filter(tile=>tile&&typeof tile.title==='string').slice(0,3);
 const innerHeight=LINK.height-LINK.top-LINK.bottom-LINK.head-LINK.gap-2*LINK.cardPad,inner=LINK.width-2*LINK.pad-2*LINK.cardPad,side=tiles.length?440:0,left=side?inner-side-40:inner;
 const metrics=profileStats(profile,activities),chips=chipRow(profileTools(activities),{width:left,size:19,height:40,pad:14,gap:8});
 const words=el('div',{style:{display:'flex',flexDirection:'column',width:left,height:innerHeight,flexShrink:0}},
  author({name,handle:handle&&handle!==name?'@'+handle:'',avatar:dataImage(opts.avatar)?opts.avatar:null},{size:88,nameSize:38,handleSize:24,width:left}),
  el('div',{style:{display:'flex',fontSize:24,color:SOFT,marginTop:26}},activities.length?'Public runs on '+(opts.brand||BRAND):'No public runs yet'),
  el('div',{style:{display:'flex',flexDirection:'column',marginTop:'auto',gap:18}},metrics.length?factRow(metrics,{width:left,value:54,label:20,gap:18}):null,chips));
 return frame({...LINK,brand:opts.brand||BRAND,meta:'Profile',card:[el('div',{style:{display:'flex',justifyContent:'space-between',width:inner,height:innerHeight}},words,
  tiles.length?mosaic(tiles,profileTileSlots(tiles.length),{gap:10,radius:16}):null)]});
}

// THE NEUTRAL CARD for a run that is missing or not public, in any format: the same words for
// both, and nothing from a row, because there is no row.
function privateLinkCard({brand=BRAND,title,detail,format='link'}={}){
 const size=FORMATS[format]||FORMATS.link,link=size===FORMATS.link,scale=link?1:format==='story'?1.5:1.3;
 const L=link?LINK:{...LINK,width:size.width,height:size.height,pad:Math.round(size.width*.05),top:Math.round(size.width*.05),bottom:Math.round(size.width*.05),head:Math.round(56*scale),brandSize:Math.round(44*scale),radius:Math.round(36*scale),cardPad:Math.round(48*scale)};
 const badge=Math.round(84*scale),lock=Math.round(badge*.5);
 return frame({...L,brand,meta:null,card:[el('div',{style:{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',flexGrow:1}},
  el('div',{style:{display:'flex',width:badge,height:badge,borderRadius:badge/2,background:WASH,alignItems:'center',justifyContent:'center'}},
   el('svg',{width:lock,height:lock,viewBox:'0 0 24 24'},el('path',{d:'M7 10V7a5 5 0 0 1 10 0v3',fill:'none',stroke:BLUE,strokeWidth:2.4,strokeLinecap:'round'}),el('rect',{x:4.5,y:10,width:15,height:11,rx:2.5,fill:BLUE}))),
  el('div',{style:{display:'flex',fontSize:Math.round(42*scale),fontWeight:600,letterSpacing:track(Math.round(42*scale),-.02),marginTop:Math.round(30*scale),color:INK,textAlign:'center'}},title),
  el('div',{style:{display:'flex',fontSize:Math.round(22*scale),color:SOFT,marginTop:Math.round(16*scale),textAlign:'center'}},detail))]});
}

const api={FORMATS,fonts,photoCard,linkPreviewCard,storyCard,squareCard,shareCard,photoSlots,profileLinkCard,profileSlots,privateLinkCard,previewMetrics,traceBins,fitLines,measure,series,toolCallCount,wholeWords,shareDuration};root.StriveLinkPreviewCard=api;if(node)module.exports=api;
})(typeof window==='object'?window:globalThis);
