import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {interactiveBrowser}=require('../api/share.js');
const browser={
  'user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
  accept:'text/html,application/xhtml+xml',
  'sec-fetch-mode':'navigate',
  'sec-fetch-dest':'document',
};
assert.equal(interactiveBrowser(browser),true,'clear browser navigation may open the app');
for(const agent of [
  'Mastodon/4.2.0 (http.rb/5.2.0)', 'Bluesky Cardyb/1.1',
  'Signal-Desktop', 'Iframely/1.3', 'Embedly/1.0', 'http.rb/5.2.0',
  'Unknown Link Reader', 'curl/8.7.1',
]){
  assert.equal(interactiveBrowser({'user-agent':agent}),false,`${agent} needs share metadata`);
}
assert.equal(interactiveBrowser({'user-agent':browser['user-agent'],accept:'text/html'}),false,'a browser-shaped preview without navigation headers gets metadata');
console.log('PASS: only an interactive browser navigation redirects; unknown link readers receive share metadata');
