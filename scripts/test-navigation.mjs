import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../site/index.html',import.meta.url),'utf8');
const navigation=readFileSync(new URL('../site/navigation.js',import.meta.url),'utf8');
const dom=new JSDOM(source,{url:'https://strive.test/',runScripts:'outside-only'});
const {window}=dom,{document}=window;
window.eval(navigation);
const nav=document.getElementById('product-nav');
assert.equal(document.querySelectorAll('nav[aria-label="Primary"]').length,1);
assert.equal(document.querySelectorAll('.desktop-nav,.tabbar').length,0);
for(const [path,page,parent,label] of [
 ['/', 'feed'],['/?mine','mine'],['/?explore','discover'],
 ['/?following','following','feed','Following'],['/?people','people','discover','Find people'],
 ['/?boards','boards','discover','Activity'],['/?day=2026-10-01','day','mine','Day view'],
 ['/?projects','projects','mine','Projects'],['/?feedday=2026-10-08&feedpage=alpha','feed'],
 ['/?day=2026-10-01&p=someone',null],['/?run=abc',null],['/?account',null],['/?post',null],['/#import=abc',null]
]) {
 window.history.replaceState(null,'',path);
 window.StriveNavigation.sync();
 const exact=[...nav.querySelectorAll('[aria-current="page"]')];
 assert.deepEqual(exact.map(e=>e.dataset.navPage),page?[page]:[],path);
 const contextual=[...nav.querySelectorAll('[aria-current="location"]')];
 assert.deepEqual(contextual.map(e=>e.dataset.navPage),parent?[parent]:[],path);
 if(parent){const context=nav.querySelector(`[data-nav-group="${parent}"] [data-nav-context]`);assert.equal(context.hidden,false);assert.equal(context.textContent,label);}
 assert.equal(nav.querySelectorAll('.product-nav-group.on').length,page?1:0,path);
}
// All primary destinations are real anchors, without a separate desktop or phone copy.
assert.deepEqual([...nav.querySelectorAll('.product-nav-link')].map(a=>a.getAttribute('href')),['/','/?mine','/?explore']);
assert.match(nav.querySelector('[data-nav-page="day"]').getAttribute('href'),/^\/\?day=\d{4}-\d{2}-\d{2}$/);
console.log('PASS: one menu; exact page versus parent selection; current subview label; unselected unrelated routes; day link and feed card query state.');
