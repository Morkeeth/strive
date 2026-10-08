/* One renderer for the offline preview and exported PNG. No network or storage. */
(() => {
  'use strict';
  const data = JSON.parse(document.getElementById('session-data').textContent);
  const names = Object.keys(data.groups), $ = id => document.getElementById(id);
  const canvas = $('card'), ctx = canvas.getContext('2d'), blue = '#0047ff';
  const choices = names.map(() => ({caption:'', image:null, fit:'contain'}));
  let index = 0, busy = false;
  names.forEach((name,i) => { const o=document.createElement('option');o.value=i;o.textContent=name;$('project').append(o); });
  const number = n => Number.isFinite(n) ? new Intl.NumberFormat('en').format(n) : 'Not recorded';
  const short = n => n >= 1e6 ? (n/1e6).toFixed(2)+'m' : n >= 10000 ? (n/1000).toFixed(1)+'k' : number(n);
  const valid = n => Number.isFinite(n) && n >= 0;
  function text(s,x,y,size=24,color='#202027',weight=400) {ctx.font=(weight>=600?'bold':'normal')+' '+size+'px Arial';ctx.fillStyle=color;ctx.fillText(s,x,y);}
  function lines(s,maxWidth,size,weight=400) {
    ctx.font=(weight>=600?'bold':'normal')+' '+size+'px Arial';
    const out=[];let line='';
    for(const ch of String(s)) {
      if(ch==='\n'){out.push(line);line='';continue;}
      if(ctx.measureText(line+ch).width>maxWidth){out.push(line.trimEnd());line='';}
      line+=ch;
    }
    if(line)out.push(line.trimEnd());return out;
  }
  function selectedRuns(){return data.runs.filter(r=>r.project===names[index]);}
  function metric(label,value,x,y){let size=43;while(lines(value,280,size,650).length>1&&size>18)size-=2;text(label,x,y,23,'#64646d');text(value,x,y+53,size,'#202027',650);}
  function modelLabel(runs){
    const models=[...new Set(runs.flatMap(r=>(r.capture_metadata||{}).models||[]))];
    const missing=runs.filter(r=>!((r.capture_metadata||{}).models||[]).length).length;
    return models.join(', ')+(missing?(models.length?' · ':'')+'Model not recorded in '+missing+' session'+(missing===1?'':'s'):'');
  }
  function completeCalls(g){return g.tool_calls_measured===g.sessions && valid(g.tool_calls);}
  function draw(){
    const g=data.groups[names[index]], runs=selectedRuns(), choice=choices[index];
    const h={portrait:1350,story:1920,square:1080}[$('format').value];
    canvas.width=1080;canvas.height=h;ctx.fillStyle='#fff';ctx.fillRect(0,0,1080,h);
    const margin=64,w=952;
    text('STRIVE',margin,91,37,blue,850);
    text(runs.length+' selected session'+(runs.length===1?'':'s'),margin,136,22,'#64646d');
    const dates=[...new Set(runs.map(r=>String(r.started||'').slice(0,10)).filter(Boolean))].sort();
    const date=dates.length>1?dates[0]+' – '+dates[dates.length-1]:dates[0]||'Date not recorded';
    ctx.textAlign='right';text(date,1016,87,21,'#64646d');ctx.textAlign='left';
    let y=212;
    let nameSize=55;
    while(lines(names[index],w,nameSize,750).length>2 && nameSize>30)nameSize-=2;
    for(const line of lines(names[index],w,nameSize,750)){text(line,margin,y,nameSize,'#202027',750);y+=nameSize+7;}
    const caption=choice.caption.trim();
    if(caption){for(const line of lines(caption,w,29)){text(line,margin,y+8,29,'#44444e');y+=38;}y+=20;}
    else {text('Goal and result not added yet',margin,y+8,25,'#64646d');y+=48;}
    const facts=[];
    if(completeCalls(g)) facts.push(['Tool calls',number(g.tool_calls)]);
    const duration=runs.every(r=>valid(r.duration_s))?runs.reduce((s,r)=>s+r.duration_s,0):null;
    if(duration!==null)facts.push(['Session span',Math.floor(duration/3600)?Math.floor(duration/3600)+'h '+Math.floor(duration%3600/60)+'m':Math.floor(duration/60)+'m '+Math.floor(duration%60)+'s']);
    if($('show-tokens').checked && g.token_sessions===g.sessions)facts.push(['Recorded tokens',short(g.input_tokens+g.output_tokens)]);
    if(facts.length<3 && runs.every(r=>valid(r.commits)))facts.push(['Recorded commits',number(runs.reduce((s,r)=>s+r.commits,0))]);
    facts.slice(0,3).forEach((f,i)=>metric(f[0],f[1],margin+i*w/Math.min(facts.length,3),y+16));
    y+=facts.length?106:12;
    const eligible=Object.entries(data.groups).filter(([,group])=>completeCalls(group));
    const total=eligible.reduce((s,[,group])=>s+group.tool_calls,0);
    if(eligible.filter(([,group])=>group.tool_calls>0).length>=2 && completeCalls(g) && total>0){
      const ratio=g.tool_calls/total;ctx.lineWidth=12;ctx.strokeStyle='#e5ebff';ctx.beginPath();ctx.arc(88,y+25,24,0,2*Math.PI);ctx.stroke();
      ctx.strokeStyle=blue;ctx.beginPath();ctx.arc(88,y+25,24,-Math.PI/2,-Math.PI/2+ratio*2*Math.PI);ctx.stroke();
      text(Math.round(ratio*100)+'% of selected tool calls',131,y+23,24,blue,650);
      const excluded=names.length-eligible.length;
      text(number(g.tool_calls)+' of '+number(total)+(excluded?' · '+excluded+' project'+(excluded===1?'':'s')+' not counted':''),131,y+53,20,'#64646d');y+=89;
    }
    const unknown=[];
    if(!completeCalls(g))unknown.push('Tool calls not fully recorded');
    if($('show-tokens').checked && g.token_sessions!==g.sessions)unknown.push('Tokens not recorded in '+(g.sessions-g.token_sessions)+' of '+g.sessions+' sessions');
    if(duration===null)unknown.push('Session span not recorded');
    const footerLines=[];
    if($('show-models').checked){footerLines.push(...lines([...new Set(runs.map(r=>r.harness).filter(Boolean))].join(' · '),w,22,600));footerLines.push(...lines(modelLabel(runs),w,21));}
    footerLines.push(...unknown.flatMap(s=>lines(s,w,20)));
    footerLines.push('Selected sessions only · tool calls are activity, not success');
    if(duration!==null)footerLines.push('Session span includes idle time');
    const footerH=footerLines.length*29+58,visualH=h-y-footerH-30;
    const tooLong=visualH<120;
    $('download').disabled=tooLong||busy;
    if(tooLong){$('status').textContent='Choose a taller format or shorten your caption to keep the image readable.';}
    else if($('status').textContent.startsWith('Choose a taller'))$('status').textContent='';
    const vh=Math.max(0,visualH);
    ctx.save();ctx.beginPath();ctx.rect(margin,y,w,vh);ctx.clip();ctx.fillStyle='#f2f5ff';ctx.fillRect(margin,y,w,vh);
    if(choice.image && vh>0){
      const img=choice.image,scale=choice.fit==='cover'?Math.max(w/img.width,vh/img.height):Math.min(w/img.width,vh/img.height);
      const iw=img.width*scale,ih=img.height*scale;ctx.drawImage(img,margin+(w-iw)/2,y+(vh-ih)/2,iw,ih);
    }else if(vh>0){
      // Distinct sessions remain distinct charts; never join their clocks or invent gaps.
      const r=runs[0],values=Array.isArray(r.rhythm)?r.rhythm:[];
      const isTime=r.trace_basis==='elapsed-agent-tool-calls';
      const trace=isTime&&values.length>1&&values.every(valid);
      text(trace?'Tool calls per interval':'No timed activity trace recorded',margin+32,y+45,25,blue,600);
      if(trace){
        const peak=Math.max(...values),max=peak||1,left=margin+32,top=y+74,cw=w-64,ch=Math.max(0,vh-126);
        ctx.beginPath();values.forEach((v,i)=>{const x=left+i*cw/(values.length-1),yy=top+ch-v/max*ch;i?ctx.lineTo(x,yy):ctx.moveTo(x,yy);});
        ctx.strokeStyle=blue;ctx.lineWidth=4;ctx.stroke();ctx.lineTo(left+cw,top+ch);ctx.lineTo(left,top+ch);ctx.closePath();ctx.fillStyle='#0047ff12';ctx.fill();
        text((runs.length>1?'First selected session · ':'')+'Start → end · peak '+peak+' calls per interval',left,y+vh-20,19,'#64646d');
      }
    }
    ctx.restore();
    let fy=h-footerH+10;footerLines.forEach((line,i)=>{text(line,margin,fy, i===0&&$('show-models').checked?22:20,'#64646d',i===0?500:400);fy+=29;});
    text('striverun.app',margin,h-24,20,blue,650);
    canvas.setAttribute('aria-label',names[index]+'. '+facts.map(f=>f[0]+': '+f[1]).join('. ')+'. '+unknown.join('. '));
    $('measure-note').textContent='Tokens are recorded input plus output; cached input is not added again. Missing values stay unrecorded.';
    $('project-facts').replaceChildren();
    for(const line of [g.sessions+' selected sessions',modelLabel(runs),...unknown]){const p=document.createElement('p');p.textContent=line;$('project-facts').append(p);}
  }
  function select(i){
    index=Math.max(0,Math.min(names.length-1,i));$('project').value=index;
    $('caption').value=choices[index].caption;$('fit').value=choices[index].fit;$('photo').value='';
    $('remove-photo').hidden=!choices[index].image;
    $('position').textContent=names[index]+' · '+(index+1)+' of '+names.length;
    $('previous').disabled=index===0;$('next').disabled=index===names.length-1;
    $('status').textContent='';draw();
  }
  $('editor').addEventListener('submit',e=>e.preventDefault());
  $('previous').onclick=()=>select(index-1);$('next').onclick=()=>select(index+1);$('project').onchange=()=>select(Number($('project').value));
  $('caption').oninput=()=>{choices[index].caption=$('caption').value;draw();};
  $('fit').onchange=()=>{choices[index].fit=$('fit').value;draw();};
  for(const id of ['format','show-tokens','show-models'])$(id).onchange=draw;
  $('remove-photo').onclick=()=>{choices[index].image=null;$('remove-photo').hidden=true;draw();};
  $('photo').onchange=async()=>{
    const file=$('photo').files[0],selected=index;if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20*1024*1024){$('status').textContent='Choose a JPEG, PNG or WebP under 20 MB.';return;}
    busy=true;draw();const url=URL.createObjectURL(file),img=new Image();
    try{img.src=url;await img.decode();choices[selected].image=img;if(selected===index)$('remove-photo').hidden=false;$('status').textContent='Image added locally. Check the fit before downloading.';}
    catch{$('status').textContent='This image could not be read. Try a JPEG or PNG.';}
    finally{URL.revokeObjectURL(url);busy=false;draw();}
  };
  $('download').onclick=()=>{canvas.toBlob(blob=>{if(!blob){$('status').textContent='Could not create the image.';return;}const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download='strive-'+names[index].replace(/[^a-z0-9]+/gi,'-').toLowerCase()+'-'+$('format').value+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('status').textContent='Image download created. Nothing posted.';},'image/png');};
  $('copy').onclick=async()=>{const c=choices[index].caption.trim();const value=names[index]+(c?'\n'+c:'')+'\n'+$('card').getAttribute('aria-label')+'\nMade with STRIVE · striverun.app';try{await navigator.clipboard.writeText(value);$('status').textContent='Caption copied. Nothing posted.';}catch{$('status').textContent='Clipboard unavailable here. Select and copy your caption field.';}};
  window.addEventListener('beforeunload',event=>{if(choices.some(c=>c.caption||c.image)){event.preventDefault();event.returnValue='';}});
  select(0);
})();
