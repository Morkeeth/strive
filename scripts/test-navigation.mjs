import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../site/index.html',import.meta.url),'utf8');
const navigation=readFileSync(new URL('../site/navigation.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../site/navigation.css',import.meta.url),'utf8');
const dom=new JSDOM(source,{url:'https://strive.test/',runScripts:'outside-only'});
const {window}=dom,{document}=window;
window.eval(navigation);
const nav=document.getElementById('product-nav');
assert.equal(document.querySelectorAll('nav[aria-label="Primary"]').length,1);
assert.deepEqual([...nav.querySelectorAll('[data-nav-page]')].map(a=>a.dataset.navPage),['feed','post']);
assert.equal(nav.querySelectorAll('details').length,0);
assert.equal(document.querySelectorAll('.site-foot a[href="/?feedback"]').length,1);
assert.equal(document.querySelectorAll('.site-foot a[href="/privacy#deletion"]').length,1);
assert.equal(document.querySelectorAll('.site-foot a[href="/?account#danger"]').length,1);
assert.equal(document.querySelectorAll('a[href="/?explore"]').length,0);
for(const [path,page] of [
 ['/', 'feed'],['/?mine',null],['/?explore','feed'],['/?post','post'],
 ['/?following','feed'],['/?people',null],['/?boards',null],
 ['/?day=2026-10-01',null],['/?friends',null],
 ['/?projects&scope=public',null],['/?projects',null],
 ['/?feedday=2026-10-08&feedpage=alpha','feed'],
 ['/?run=abc',null],['/?account',null],['/#import=abc','feed']
]) {
 window.history.replaceState(null,'',path);
 window.StriveNavigation.sync();
 assert.deepEqual([...nav.querySelectorAll('[aria-current="page"]')].map(e=>e.dataset.navPage),page?[page]:[],path);
}
assert.match(css,/\.product-nav-add\{display:none\}/);
assert.match(css,/@media\(max-width:800px\)[\s\S]*\.product-nav-add\{display:flex\}/);
assert.match(css,/@media\(max-width:800px\)[\s\S]*\.global-add\{display:none!important\}/);
console.log('PASS: direct primary routes, one Feed, one visible Add run per screen size, one feedback path.');
