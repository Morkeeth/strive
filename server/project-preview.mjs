/* Public URL enrichment. DNS answers are validated and pinned into the socket; no ambient credentials. */
import https from 'node:https';
import http from 'node:http';
import {lookup} from 'node:dns/promises';
import {BlockList,isIP} from 'node:net';
const denied=new BlockList();
for(const [address,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]])denied.addSubnet(address,prefix,'ipv4');
export function publicAddress(ip){return isIP(ip)===4?!denied.check(ip,'ipv4'):isIP(ip)===6&&/^2[0-9a-f]{3}:/i.test(ip)&&!/^2001:(?:0*:|db8:|[12][0-9a-f]:)/i.test(ip);}
export function publicUrl(value){
 let u;try{u=new URL(value)}catch{throw Error('Use a public website link.');}
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port||u.search||u.href.length>2048||!u.hostname.includes('.')||isIP(u.hostname)||/(?:^|\.)(localhost|local|internal|test|invalid|home|lan|onion)$/.test(u.hostname))throw Error('Use a public website link without credentials or query parameters.');
 u.hash='';return u;
}
export async function publicRead(value,{limit,signal,resolve=lookup}={}){
 let u=publicUrl(value);
 for(let redirects=0;redirects<=3;redirects++){
  if(signal?.aborted)throw Error('Preview timed out.');
  const addresses=await Promise.race([resolve(u.hostname,{all:true,verbatim:true}),new Promise((_,reject)=>{if(signal)signal.addEventListener('abort',()=>reject(Error('Preview timed out.')),{once:true});})]);
  if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw Error('This link does not resolve to a public website.');
  const chosen=addresses[0],response=await new Promise((resolve,reject)=>{
   const req=(u.protocol==='https:'?https:http).request(u,{method:'GET',agent:false,signal,headers:{'User-Agent':'STRIVE-link-preview/1.0',Accept:'text/html,image/jpeg,image/png,image/webp'},lookup:(_host,options,done)=>options?.all?done(null,[chosen]):done(null,chosen.address,chosen.family)},res=>{
    if([301,302,303,307,308].includes(res.statusCode)){res.destroy();resolve({redirect:res.headers.location});return;}
    if(res.statusCode!==200){res.destroy();reject(Error('The website did not provide a public preview.'));return;}
    if(Number(res.headers['content-length'])>limit){res.destroy();reject(Error('Preview is too large.'));return;}
    const chunks=[];let size=0;res.on('data',chunk=>{size+=chunk.length;if(size>limit){res.destroy(Error('Preview is too large.'));return;}chunks.push(chunk);});res.on('error',reject);res.on('end',()=>resolve({body:Buffer.concat(chunks),type:String(res.headers['content-type']||'').split(';')[0].toLowerCase(),url:u.href}));
   });req.setTimeout(4000,()=>req.destroy(Error('Preview timed out.')));req.on('error',reject);req.end();
  });
  if(!response.redirect)return response;
  if(redirects===3)throw Error('Too many preview redirects.');
  const next=publicUrl(new URL(response.redirect,u).href);if(u.protocol==='https:'&&next.protocol!=='https:')throw Error('Preview redirected to an insecure page.');u=next;
 }
}
const decode=s=>String(s||'').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const c=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return c>0&&c<=0x10ffff?String.fromCodePoint(c):'';}).replace(/&(amp|quot|apos|lt|gt);/g,(_,n)=>({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'}[n])).replace(/\s+/g,' ').trim();
export function pageMetadata(html){
 const meta={};
 for(const tag of html.match(/<meta\b[^>]{0,8192}>/gi)||[]){const attrs={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))attrs[m[1].toLowerCase()]=decode(m[2]??m[3]??m[4]);const key=(attrs.property||attrs.name||'').toLowerCase();if(key&&!meta[key])meta[key]=attrs.content||'';}
 return {title:(meta['og:title']||meta['twitter:title']||decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1])).slice(0,120),description:(meta['og:description']||meta.description||'').slice(0,2000),siteName:(meta['og:site_name']||'').slice(0,120),image:meta['og:image:secure_url']||meta['og:image']||meta['twitter:image']||null};
}
export async function projectPreview(url,{read=publicRead}={}){
 const signal=AbortSignal.timeout(8000),page=await read(url,{limit:512*1024,signal});
 if(!['text/html','application/xhtml+xml'].includes(page.type))throw Error('This link has no website preview.');
 const meta=pageMetadata(page.body.toString('utf8')),result={...meta,source:page.url,image:null,imageSource:null};
 if(meta.image)try{
  const imageUrl=publicUrl(new URL(meta.image,page.url).href),picture=await read(imageUrl.href,{limit:2*1024*1024,signal});
  const b=picture.body,isPng=b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),isJpeg=b[0]===255&&b[1]===216&&b[2]===255,isWebp=b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP';
  const type=isPng?'image/png':isJpeg?'image/jpeg':isWebp?'image/webp':null;
  if(type&&['image/png','image/jpeg','image/webp','application/octet-stream',''].includes(picture.type)){result.image='data:'+type+';base64,'+b.toString('base64');result.imageSource=picture.url;}
 }catch{/* A missing or rejected image never prevents a manual project. */}
 return result;
}
