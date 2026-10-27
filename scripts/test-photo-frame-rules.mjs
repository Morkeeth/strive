import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);require('../site/run-photos.js');const rule=globalThis.StriveRunPhotos.frameRule;
for(const [w,h,shape] of [[1920,1080,'wide'],[390,844,'portrait'],[960,1280,'portrait'],[800,800,'square'],[3000,500,'wide'],[500,4000,'portrait'],[0,0,'unknown']]){assert.equal(rule(w,h).shape,shape);assert.equal(rule(w,h).fit,'contain');}
console.log('PASS: desktop screen, phone screen, portrait face, square photo, panorama, tall capture and unknown source all keep the complete image');

// The normal page loads the shared module; an older/standalone browser page may not.
const {JSDOM}=await import('jsdom');const {readFileSync}=await import('node:fs');
const w=new JSDOM('',{runScripts:'outside-only'}).window;
w.eval(readFileSync(new URL('../site/run-photos.js',import.meta.url),'utf8'));
assert.equal(w.StriveRunPhotos.frameRule(1920,1080).shape,'unknown');
assert.equal(w.StriveRunPhotos.frameRule(1920,1080).aspect,'4 / 3');
assert.equal(w.StriveRunPhotos.frameRule(1920,1080).fit,'contain');
w.eval(readFileSync(new URL('../site/photo-frame.js',import.meta.url),'utf8'));
assert.equal(w.StriveRunPhotos.frameRule(1920,1080).shape,'wide');
assert.equal(w.StriveRunPhotos.frameRule(1920,1080).aspect,'16 / 9');
console.log('PASS: browser helper absence retains a whole-image fallback; loading the real helper restores source-shape framing; direct CommonJS loading uses the shared rule');
