const fs=require('fs'),assert=require('assert');
const {JSDOM}=require('jsdom');
const {createCanvas}=require(process.env.STRIVE_CANVAS_MODULE || '@napi-rs/canvas');
const input=process.argv[2];
if(!input)throw new Error('Pass the local three-project acceptance review HTML.');
let painted=[],real;
const dom=new JSDOM(fs.readFileSync(input,'utf8'),{runScripts:'dangerously',beforeParse(w){
 w.HTMLCanvasElement.prototype.getContext=function(){real=createCanvas(1080,1350);const c=real.getContext('2d');
 Object.defineProperty(this,'width',{get:()=>real.width,set:v=>{real.width=v;painted=[]}});Object.defineProperty(this,'height',{get:()=>real.height,set:v=>{real.height=v;painted=[]}});
 const fill=c.fillText.bind(c);c.fillText=(text,x,y)=>{painted.push({text,x,y,width:c.measureText(text).width,align:c.textAlign});fill(text,x,y)};return c;};
}});
const w=dom.window,d=w.document,el=id=>d.getElementById(id),change=(id,value)=>{el(id).value=value;el(id).dispatchEvent(new w.Event('change'));};
assert.equal(el('position').textContent,'FAVOUR · 1 of 3');
assert(painted.some(t=>t.text==='3.46m')); // 3,446,168 input + 10,337 output, no double-count of cache
if(process.argv[3])fs.writeFileSync(process.argv[3],real.toBuffer('image/png'));
el('caption').value='A test caption';el('caption').dispatchEvent(new w.Event('input'));
el('next').click();assert.equal(el('caption').value,'');el('previous').click();assert.equal(el('caption').value,'A test caption');
change('project','2');assert(painted.some(t=>t.text.includes('Tokens not recorded')));assert(!painted.some(t=>t.text==='Recorded tokens'));
for(const format of ['portrait','story','square']){change('format',format);assert.equal(real.height,{portrait:1350,story:1920,square:1080}[format]);assert(painted.every(t=>t.align==='right'?t.x<=1081:t.x+t.width<=1081),JSON.stringify(painted.filter(t=>t.x+t.width>1081)));assert(el('download').disabled===false);}
// A long caption must never silently export clipped content.
el('caption').value='W\n'.repeat(90);el('caption').dispatchEvent(new w.Event('input'));assert(el('download').disabled);
console.log('PASS: real-session rendering, exact token sum, per-project captions, unknown measurements, all export sizes and clipping guard');
