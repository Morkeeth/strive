// Content-Security-Policy for the built app page. It must run after every step that rewrites
// dist/index.html, because each inline script is allowed by the hash of its final bytes.
// frame-ancestors cannot be set from a meta tag; vercel.json sends it as a header.
import {createHash} from 'node:crypto';

const sha256=text=>"'sha256-"+createHash('sha256').update(text,'utf8').digest('base64')+"'";
// The one inline handler kept: feed-card.js avatars on the script-free share pages need it too.
export const ALLOWED_INLINE_HANDLERS=['this.remove()'];

export function contentSecurityPolicy(html,{supabaseOrigin}){
 const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>sha256(m[1]));
 const external=[...html.matchAll(/<script\b([^>]*)\bsrc="(https:\/\/[^"]+)"([^>]*)>/g)].map(([,before,src,after])=>{
  if(!/\bintegrity="sha(256|384|512)-[A-Za-z0-9+/=]+"/.test(before+after)||!/\bcrossorigin="anonymous"/.test(before+after))
   throw new Error(`Third-party script without integrity: ${src}`);
  return src;
 });
 const origin=new URL(supabaseOrigin).origin;
 // The on-device link preview (sharing-link-image.js) compiles the resvg and yoga WebAssembly
 // in dist/review-image-engine; yoga's bytes are fetched from a data: URL inside that bundle.
 return [
  "default-src 'self'",
  ["script-src 'self'",...external,"'wasm-unsafe-eval'","'unsafe-hashes'",...ALLOWED_INLINE_HANDLERS.map(sha256),...inline].join(' '),
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  `connect-src 'self' data: ${origin}`,
  "frame-src 'none'",
  "worker-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
 ].join('; ');
}

export function withContentSecurityPolicy(html,options){
 if(html.includes('http-equiv="Content-Security-Policy"'))throw new Error('index.html already carries a policy');
 const meta=`<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(html,options)}">`;
 if(!/<meta charset="utf-8">/.test(html))throw new Error('Missing charset marker for the policy');
 return html.replace('<meta charset="utf-8">','<meta charset="utf-8">\n'+meta);
}
