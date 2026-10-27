import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);require('../site/run-photos.js');const rule=globalThis.StriveRunPhotos.frameRule;
for(const [w,h,shape] of [[1920,1080,'wide'],[390,844,'portrait'],[960,1280,'portrait'],[800,800,'square'],[3000,500,'wide'],[500,4000,'portrait'],[0,0,'unknown']]){assert.equal(rule(w,h).shape,shape);assert.equal(rule(w,h).fit,'contain');}
console.log('PASS: desktop screen, phone screen, portrait face, square photo, panorama, tall capture and unknown source all keep the complete image');
