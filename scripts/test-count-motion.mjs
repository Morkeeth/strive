import vm from 'node:vm';import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
const source=readFileSync('site/index.html','utf8');const fn=source.slice(source.indexOf('function countUp(){'),source.indexOf('// a whole number gets'));
let frames=0;const el={dataset:{},isConnected:true,getAttribute:()=> '76',textContent:''};const box={document:{querySelectorAll:()=>[el]},window:{matchMedia:()=>({matches:true})},performance,requestAnimationFrame:()=>frames++};vm.createContext(box);vm.runInContext(fn,box);box.countUp();assert.equal(el.textContent,'76');assert.equal(frames,0);box.countUp();assert.equal(frames,0);
el.dataset={};box.window.matchMedia=()=>({matches:false});box.countUp();assert.equal(frames,1);box.countUp();assert.equal(frames,1);
console.log('Reduced motion sets measured count immediately; repeated wiring does not restart animation.');
