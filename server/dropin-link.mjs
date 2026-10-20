// DROP-IN LINKS. "Get a link" on the landing page posts the counts of a session the browser read,
// and this module turns them into an unlisted page at /l/<id>. No account is involved.
//
// The server holds no extra power: like server/agent-upload.mjs it forwards to three database
// functions with the public anon key (supabase/strava/011_dropin_links.sql), and the database
// checks the allowlist, the ranges and the rate limits. This file refuses early what the database
// would refuse anyway, so a bad request costs no database call, and it never forwards a key that
// is not on the allowlist.
import {BRAND} from './brand.mjs';
import {linkTicket} from './fair-confirm.mjs';
import Feed from '../site/feed-card.js';
import Dropin from '../site/dropin-parse.js';

export const MAX_BYTES=4096;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN=/^[0-9a-f]{64}$/;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const validLinkId=id=>typeof id==='string'&&UUID.test(id);

// The per-network bucket. Vercel sets x-forwarded-for; the first entry is the client. It is only
// ever hashed, inside the database, and those hashes are deleted after a day.
export function bucketOf(headers){
 const raw=String(headers['x-real-ip']||headers['x-forwarded-for']||'').split(',')[0].trim();
 return raw.slice(0,64)||'unknown';
}

async function rpc(name,args,{SB_URL,SB_KEY},fetchImpl){
 const response=await fetchImpl(SB_URL+'/rest/v1/rpc/'+name,{method:'POST',
  headers:{'Content-Type':'application/json',apikey:SB_KEY,'Content-Profile':'strava','Accept-Profile':'strava'},
  body:JSON.stringify(args),signal:AbortSignal.timeout(8000),cache:'no-store'});
 let result=null;try{result=await response.json()}catch{}
 return {ok:response.ok,status:response.status,result};
}

export async function createLink({method,headers,body},config,fetchImpl=fetch){
 if(method!=='POST') return {status:405,headers:{Allow:'POST'},body:{error:'Use POST.'}};
 if(Number(headers['content-length']||0)>MAX_BYTES) return {status:413,body:{error:'Send a run under 4 KiB.'}};
 if(!body||typeof body!=='object'||Array.isArray(body)) return {status:400,body:{error:'Send one run as a JSON object.'}};
 const extra=Object.keys(body).find(k=>!Dropin.UPLOAD_KEYS.includes(k));
 if(extra) return {status:400,body:{error:`Field not allowed: ${extra.slice(0,40)}`}};
 if(Buffer.byteLength(JSON.stringify(body),'utf8')>MAX_BYTES) return {status:413,body:{error:'Send a run under 4 KiB.'}};
 let out;
 try{out=await rpc('dropin_create',{payload:body,bucket:bucketOf(headers)},config,fetchImpl)}
 catch{return {status:503,body:{error:`${BRAND} is unavailable. Nothing was saved. Try again.`}}}
 if(!out.ok){
  const message=typeof out.result?.message==='string'?out.result.message.slice(0,200):'The link was refused.';
  return {status:out.status>=500?502:/limit reached/i.test(message)?429:400,body:{error:message}};
 }
 const r=out.result;
 if(!r||!validLinkId(r.id)||!TOKEN.test(r.delete_token||'')) return {status:502,body:{error:`${BRAND} returned an unexpected response.`}};
 const url=config.ORIGIN+'/l/'+r.id;
 // The delete secret rides in the fragment, which browsers never send to a server, so it cannot
 // land in an access log or a Referer header.
 // With Free Lunch confirm on, the creator also gets the ticket that proves they made this link.
 const ticket=linkTicket(r.id);
 return {status:200,body:{id:r.id,url,delete_url:url+'/delete#'+r.delete_token,expires_at:r.expires_at,...(ticket?{fair_ticket:ticket}:{})}};
}

export async function readLink(id,config,fetchImpl=fetch){
 if(!validLinkId(id)) return null;
 const out=await rpc('dropin_read',{link_id:id},config,fetchImpl);
 if(!out.ok) throw new Error('Link unavailable');
 const r=out.result;
 return r&&r.id===id?r:null;
}

export async function deleteLink({method,body},config,fetchImpl=fetch){
 if(method!=='POST') return {status:405,headers:{Allow:'POST'},body:{error:'Use POST.'}};
 const id=body&&body.id,token=body&&body.token;
 if(!validLinkId(id)||!TOKEN.test(String(token||''))) return {status:400,body:{error:'This delete link is not complete. Copy the whole link.'}};
 let out;
 try{out=await rpc('dropin_delete',{link_id:id,token},config,fetchImpl)}
 catch{return {status:503,body:{error:`${BRAND} is unavailable. Nothing was deleted. Try again.`}}}
 if(!out.ok) return {status:502,body:{error:'The delete did not complete. Try again.'}};
 return out.result===true?{status:200,body:{deleted:true}}:{status:404,body:{error:'Nothing to delete: the link was already deleted, has expired, or this is not its delete link.'}};
}

// A stored link as a feed-card row. Anonymous: no face, no name, nothing to follow.
export function linkRow(link){
 return {id:link.id,title:link.title,harness:link.harness,prompts:link.turns_typed,turns_typed:link.turns_typed,
  tool_calls:link.tool_calls,files_touched:link.files_touched,commits:link.commits,duration_s:link.duration_s,
  started_hour:link.started_hour,rhythm:link.rhythm,route:Array.isArray(link.route)?link.route:null,
  prompt_provenance:link.prompt_provenance||null,created_at:link.created_at,visibility:'anonymous'};
}

const STYLE=`*{box-sizing:border-box}html,body{margin:0;padding:0;max-width:100%;overflow-x:hidden}body{background:var(--paper);color:var(--ink);font:15px/1.5 'IBM Plex Sans',system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums;padding:0 16px 40px}a{color:inherit;text-decoration:none}main{max-width:560px;margin:0 auto}a.home{display:inline-flex;align-items:center;min-height:48px;margin:8px 0;font-weight:600;letter-spacing:.08em;color:var(--blue)}.fc{margin:0 0 16px}.fc h1.fc-title{font-size:24px}.cta{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;margin:0 0 16px}a.open,button.open{display:inline-flex;align-items:center;min-height:48px;background:var(--blue);color:#fff;padding:0 20px;font-weight:500;border:0;cursor:pointer;font-size:15px}button.open:disabled{opacity:.6}a:focus-visible,button:focus-visible{outline:2px solid var(--blue);outline-offset:3px}.note{color:var(--soft);font-size:13px;margin:0 0 8px}.box{background:var(--box);border:1px solid var(--rule);padding:24px 16px;margin:0 0 16px}.box h1{font-size:22px;line-height:1.25;font-weight:600;margin:0 0 8px}.box p{color:var(--soft);margin:0 0 16px}.fc>.fc-body:last-child{padding-bottom:16px}`;
const HEAD=`<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght%40400;500;600&display=swap" rel="stylesheet"><link rel="stylesheet" href="/design.css"><link rel="stylesheet" href="/feed.css"><style>${STYLE}</style><link rel="icon" href="/favicon.svg" type="image/svg+xml">`;
// The same footer the site's own pages carry.
const siteFoot='<footer class="site-foot"><a href="/about">About</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="https://github.com/Morkeeth/strive/issues">Contact</a><a href="/privacy#deletion">Delete your data</a></footer>';
// The one script on the link page: the card's own module, so Copy and Share on the stride line
// work. It reads nothing and sends nothing.
const STRIDE_SCRIPT=`<script src="/run-contract.js"></script><script src="/feed-card.js"></script><script>GrinderFeed.wireStride(document)</script>`;

// The drop-in sends "<harness> session, <day>" when the person typed no title (site/dropin.js
// titleText). That default is the card's own words, not theirs.
export function typedTitle(row){
 const t=String(row.title??'').trim(),h=Feed.harnessName(row)||'Agent';
 const auto=new RegExp('^'+h.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+' session(, \\d{1,2} [A-Z][a-z]{2})?$');
 return t&&!auto.test(t)?t:'';
}

export function linkHtml(link,{origin}){
 const row=linkRow(link),id=encodeURIComponent(link.id);
 const a=Feed.achievement(row);
 const lead=Feed.headline(row);
 // The unfurl title is the card's own title: the typed one, else the default.
 const title=esc(Feed.titleOf(row));
 const description=esc([lead?`${lead.n} ${lead.unit}`:'',a?`${a.label}: ${a.detail}`:'',`${row.harness} session`].filter(Boolean).join(' · '));
 const url=origin+'/l/'+id,image=origin+'/api/link?id='+id+'&image=1';
 const shared=Feed.card(row,{preview:true,heading:'h1',foot:false,url,copy:true});
 // The maker's number is the ask: a reader who sees 98 tool calls is invited to drop their own.
 // The ask lands on the drop zone itself (/#drop-zone), so one tap on a phone is one step, not a scroll.
 const ask=lead?`They logged ${esc(lead.n)} ${esc(lead.unit)}. Drop yours.`:'Make a card from your session';
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · ${BRAND}</title><meta name="robots" content="noindex,nofollow"><meta property="og:type" content="article"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="${url}"><meta property="og:image" content="${image}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${description}"><meta name="twitter:image" content="${image}">${HEAD}</head><body><main><a class="home" href="/" aria-label="${BRAND} home">${BRAND}</a>${shared}<p class="cta"><a class="open" href="/#drop-zone">${ask}</a></p><p class="note">The session file never left the device that read it. No prompts, code or file paths from it are here.</p><p class="note">Counts describe activity, not result quality.</p></main>${siteFoot}${STRIDE_SCRIPT}</body></html>`;
}

export function missingHtml(){
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link not found · ${BRAND}</title><meta name="robots" content="noindex">${HEAD}</head><body><main><a class="home" href="/">${BRAND}</a><article class="box"><h1>This link is gone</h1><p>It was deleted, or it expired after 90 days.</p><a class="open" href="/#drop-zone">Make a card from your session</a></article></main>${siteFoot}</body></html>`;
}

// The delete page. The secret is read from the fragment by the page itself and sent in a POST
// body when the person presses the button. A GET never deletes, so a link preview or a
// prefetching mail client cannot delete a card by opening its delete link.
export function deleteHtml(id){
 const safe=validLinkId(id)?id:'';
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Delete this card · ${BRAND}</title><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">${HEAD}</head><body><main><a class="home" href="/">${BRAND}</a><article class="box"><h1>Delete this card?</h1><p>The link stops working for everyone. This cannot be undone.</p><button class="open" id="del" type="button">Delete the card</button><p id="state" role="status"></p></article></main>${siteFoot}<script>(function(){var id=${JSON.stringify(safe)},token=location.hash.slice(1),b=document.getElementById('del'),s=document.getElementById('state');if(!id||!/^[0-9a-f]{64}$/.test(token)){b.disabled=true;s.textContent='This delete link is not complete. Copy the whole link.';return}b.onclick=function(){b.disabled=true;s.textContent='Deleting…';fetch('/api/link?action=delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id,token:token})}).then(function(r){return r.json().then(function(j){return[r.ok,j]})}).then(function(x){if(x[0]){history.replaceState(null,'',location.pathname);s.textContent='Deleted. The link no longer works.';b.hidden=true}else{s.textContent=x[1].error||'The delete did not complete.';b.disabled=false}}).catch(function(){s.textContent='The delete did not complete. Check the connection and try again.';b.disabled=false})}})();</script></body></html>`;
}
