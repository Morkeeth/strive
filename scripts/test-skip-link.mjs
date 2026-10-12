import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';

// Keyboard users reach the page content with one Tab and Enter, before the header controls.
const {JSDOM}=createRequire(import.meta.url)('jsdom');
const html=readFileSync(new URL('../site/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../site/shared-ui.css',import.meta.url),'utf8');
const {document}=new JSDOM(html).window;
const focusable=[...document.body.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])')];
assert.equal(focusable[0].className,'skip-link','the skip link is the first focusable element');
assert.equal(focusable[0].getAttribute('href'),'#app');
assert.equal(focusable[0].textContent,'Skip to content');
assert.equal(document.getElementById('app').getAttribute('tabindex'),'-1','the main region can take focus');
assert.match(css,/\.skip-link\{position:absolute;[^}]*top:-120px/,'hidden until focused');
assert.match(css,/\.skip-link:focus\{top:12px/,'visible on focus');
assert.match(html,/if\(e\.target\.closest\('a\.skip-link'\)\)\{e\.preventDefault\(\);\$\('app'\)\.focus\(\);return;\}/,'activation focuses #app without touching location.hash');
console.log('PASS: Skip to content is the first Tab stop and moves focus into the main region');
