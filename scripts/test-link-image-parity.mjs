import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {ImageResponse} from '@vercel/og';import {photoCard} from '../server/public-run.mjs';import {shareFonts} from '../server/share-fonts.mjs';
const folder=process.argv[2];if(!folder)throw new Error('Supply the browser receipt folder');
const checks=[];
for(const harness of ['cursor','claude','agent'])for(const width of [390,1440]){
 const stem=`${folder}/${harness}-${width}`,row=JSON.parse(fs.readFileSync(stem+'-image-row.json'));
 const hosted=Buffer.from(await new ImageResponse(photoCard(row,[],{}),{width:1200,height:630,fonts:await shareFonts()}).arrayBuffer());
 const local=fs.readFileSync(stem+'-link.png'),hash=x=>createHash('sha256').update(x).digest('hex');
 assert.equal(hash(local),hash(hosted),`${harness}/${width}: local PNG must be byte-identical to the hosted unfurl engine`);
 checks.push({harness,width,png_sha256:hash(local),byte_identical:true});
}
fs.writeFileSync(folder+'/link-image-parity.json',JSON.stringify(checks,null,2)+'\n');console.log('PASS six real local review PNGs are byte-identical to the hosted unfurl renderer');
