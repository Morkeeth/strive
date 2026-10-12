import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {contentSecurityPolicy,withContentSecurityPolicy,ALLOWED_INLINE_HANDLERS} from './csp.mjs';

const site=new URL('../site/',import.meta.url);
const read=name=>readFileSync(new URL(name,site),'utf8');
const sha=text=>"'sha256-"+createHash('sha256').update(text,'utf8').digest('base64')+"'";
const index=read('index.html');

// The policy allows each inline script by its own hash, and no script by 'unsafe-inline'.
const policy=contentSecurityPolicy(index,{supabaseOrigin:'https://example.supabase.co'});
const scriptSrc=policy.split('; ').find(d=>d.startsWith('script-src '));
const inline=[...index.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
assert.ok(inline.length>=2,'the app keeps its inline scripts');
for(const body of inline)assert.ok(scriptSrc.includes(sha(body)),'every inline script is hashed');
assert.doesNotMatch(scriptSrc,/'unsafe-inline'|'unsafe-eval'|https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2(?:[ ;]|$)/);
assert.match(scriptSrc,/ https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2\.\d+\.\d+\/dist\/umd\/supabase\.js /,'only the exact pinned SDK file');
assert.match(policy,/connect-src 'self' https:\/\/example\.supabase\.co;/);
for(const d of ["object-src 'none'","base-uri 'none'","frame-src 'none'","form-action 'self'"])assert.ok(policy.includes(d),d);

// The meta tag is the first element after the charset, before any script runs.
const built=withContentSecurityPolicy(index,{supabaseOrigin:'https://example.supabase.co'});
assert.match(built,/^<!doctype html>\n<html lang="en"><head><meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="default-src 'self'; /);
assert.throws(()=>withContentSecurityPolicy(built,{supabaseOrigin:'https://example.supabase.co'}),/already carries/);

// A third-party script without Subresource Integrity fails the build instead of shipping.
assert.throws(()=>contentSecurityPolicy('<script src="https://cdn.example/x.js"></script>',{supabaseOrigin:'https://example.supabase.co'}),/without integrity/);
// The pinned tag, the devDependency tests load, and the integrity hash name the same bytes.
const sdk=JSON.parse(readFileSync(new URL('../node_modules/@supabase/supabase-js/package.json',import.meta.url))).version;
const umd=readFileSync(new URL('../node_modules/@supabase/supabase-js/dist/umd/supabase.js',import.meta.url));
const tag=index.match(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@([^/"]+)\/dist\/umd\/supabase\.js" integrity="(sha384-[A-Za-z0-9+/=]+)" crossorigin="anonymous"><\/script>/);
assert.ok(tag,'the SDK tag is pinned with integrity');
assert.equal(tag[1],sdk,'the page pins the version package.json installs');
assert.equal(tag[2],'sha384-'+createHash('sha384').update(umd).digest('base64'),'integrity matches the installed SDK file');

// No inline event handler can be added to the app without a policy change.
const sources=['index.html',...readdirSync(site).filter(name=>name.endsWith('.js'))];
for(const name of sources){
 for(const match of read(name).matchAll(/\son[a-z]+="([^"]*)"/g))
  assert.ok(ALLOWED_INLINE_HANDLERS.includes(match[1]),`${name}: inline handler ${match[0].trim()} needs a delegated listener`);
}

// Framing is refused for every route, which a meta policy cannot express.
const headers=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url))).headers.find(h=>h.source==='/(.*)').headers;
const header=key=>headers.find(h=>h.key===key)?.value;
assert.equal(header('X-Frame-Options'),'DENY');
assert.equal(header('Content-Security-Policy'),"frame-ancestors 'none'");
console.log('PASS: hashed inline scripts, pinned SDK with integrity, no inline handlers, framing refused');
