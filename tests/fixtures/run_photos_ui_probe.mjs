// Runs the real site/photo-grid.js and site/run-photos.js in jsdom and prints what they did.
// TEST DATA only: fetch is a recorder, no network.
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const RUN='11111111-1111-4111-a111-111111111111';
const photo=(id,extra={})=>({id,role:'photo',is_selected:true,is_private:false,sort_position:Number(id.at(-1)),url:`/api/run-photos?run_id=${RUN}&id=${id}`,...extra});
function page(html,{token='TEST-TOKEN',photos=[photo('p1'),photo('p2')]}={}){
  const w=new JSDOM(html,{url:'https://strive.test/',runScripts:'outside-only'}).window,calls=[],made=[];
  w.URL.createObjectURL=()=>{made.push('blob:TEST-'+(made.length+1));return made.at(-1)};w.URL.revokeObjectURL=()=>{};
  w.FileReader=class{readAsDataURL(blob){blob.arrayBuffer().then(bytes=>{this.result='data:image/jpeg;base64,'+Buffer.from(bytes).toString('base64');this.onload?.()})}};
  w.fetch=async(path,options={})=>{calls.push({path:String(path),method:options.method||'GET',authorization:options.headers?.Authorization||null,body:options.body?JSON.parse(options.body):null});
    if(options.method==='POST')return {ok:true,json:async()=>({photo:{id:'p9',url:`/api/run-photos?run_id=${RUN}&id=p9`}})};
    if(options.method&&options.method!=='GET')return {ok:true,json:async()=>({})};
    return String(path).includes('&id=')||String(path).includes('?id=')?{ok:true,headers:{get:()=>null},blob:async()=>new Blob(['TEST'])}:{ok:true,json:async()=>({photos:photos.map(p=>({...p}))})};};
  for(const name of ['photo-grid.js','run-photos.js'])w.eval(fs.readFileSync('site/'+name,'utf8'));
  const client=token?{auth:{getSession:async()=>({data:{session:{access_token:token}}})}}:null;
  return {w,calls,made,client};
}
const out={};
{ // Owner editor: every read carries the bearer header, images are blob URLs, a foreign URL is never fetched.
  const p=page('<div id="slot"></div>',{photos:[photo('p1'),photo('p2'),{...photo('p3'),url:'https://elsewhere.test/api/run-photos?run_id='+RUN+'&id=p3'}]}),slot=p.w.document.querySelector('#slot'),status=[];
  const editor=await p.w.StriveRunPhotos.mount({client:p.client,run:{id:RUN,visibility:'private'},slot,owner:true,staged:true,status:(text,bad)=>status.push([text,!!bad])});
  out.owner={paths:p.calls.map(c=>c.path),authorizations:[...new Set(p.calls.map(c=>c.authorization))],sources:[...slot.querySelectorAll('.photo-tile img')].map(i=>i.src),
    controls:{remove:slot.querySelectorAll('[data-photo-remove]').length,move:slot.querySelectorAll('[data-photo-move]').length,file:slot.querySelectorAll('[data-photo-file]').length},
    accept:slot.querySelector('[data-photo-file]').accept,multiple:slot.querySelector('[data-photo-file]').multiple};
  // Upload: a 13 MB file is refused; a small one is staged and sent only by Save.
  const pick=async files=>{for(let i=0;i<100&&!slot.querySelector('[data-photo-file]');i++)await new Promise(r=>setTimeout(r,5));const input=slot.querySelector('[data-photo-file]');Object.defineProperty(input,'files',{value:files,configurable:true});input.onchange();for(let i=0;i<100&&!done();i++)await new Promise(r=>setTimeout(r,5));};
  let done=()=>status.length>0;
  const big=new p.w.File(['x'],'big.jpg',{type:'image/jpeg'});Object.defineProperty(big,'size',{value:13*1024*1024});
  await pick([big]);out.tooLarge={status:status.at(-1),tiles:slot.querySelectorAll('.photo-tile').length};
  done=()=>slot.querySelectorAll('.photo-tile').length===3;
  await pick([new File(['TEST DATA image bytes'],'small.jpg',{type:'image/jpeg'})]);
  out.staged={tiles:slot.querySelectorAll('.photo-tile').length,writesBeforeSave:p.calls.filter(c=>c.method!=='GET').length};
  await editor.save();
  const post=p.calls.find(c=>c.method==='POST');
  out.upload={path:post?.path,keys:Object.keys(post?.body||{}).sort(),run:post?.body?.run_id,decoded:Buffer.from(post?.body?.image_base64||'','base64').toString(),authorization:post?.authorization};
  out.tokenInUrl=[...p.calls.map(c=>c.path),...out.owner.sources].some(text=>/access_token|TEST-TOKEN/.test(text));
}
{ // Reader: pictures, no owner controls.
  const p=page('<div id="slot"></div>'),slot=p.w.document.querySelector('#slot');
  await p.w.StriveRunPhotos.mount({client:p.client,run:{id:RUN,visibility:'public'},slot,owner:false,status(){}});
  out.reader={images:slot.querySelectorAll('img').length,controls:slot.querySelectorAll('[data-photo-remove],[data-photo-move],[data-photo-file],[data-photo-private],.photo-add-tile').length,open:slot.querySelectorAll('button.photo-open').length};
}
{ // Feed card covers. Signed out on a public run: a plain URL with no token. Signed in: bearer header, blob URL.
  const card=visibility=>`<article class="fc" data-run-id="${RUN}" data-run-visibility="${visibility}"><a class="fc-body" href="/r/${RUN}"><h3>TEST DATA</h3></a></article>`;
  const cover=async(visibility,token,photos)=>{const p=page(card(visibility),{token,photos});await p.w.StriveRunPhotos.mountCovers({client:p.client,root:p.w.document});
    return {sources:[...p.w.document.querySelectorAll('.run-media img.run-photo-cover')].map(i=>i.getAttribute('src')),paths:p.calls.map(c=>c.path),authorizations:[...new Set(p.calls.map(c=>c.authorization))]};};
  out.anonymousCover=await cover('public',null,[photo('p1',{is_cover:true})]);
  out.signedInCover=await cover('private','TEST-TOKEN',[photo('p1',{is_cover:true})]);
  // The cover the author chose leads the card, not the first upload.
  out.chosenSecond=await cover('public',null,[photo('p1',{sort_position:null}),photo('p2',{sort_position:null,is_cover:true})]);
}
process.stdout.write(JSON.stringify(out));
