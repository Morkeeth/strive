// One fixture, three surfaces: /r/ HTML, SPA heroStats + Explore, share caption facts.
// Peak slice counts and run totals must not be confused; null Code Route must not be promised.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { html } from '../../server/public-run.mjs';

const require = createRequire(import.meta.url);
const GrinderContract = require('../../site/run-contract.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const ridge = Array.from({ length: 50 }, (_, i) => (i === 24 ? 10 : i % 3 === 0 ? 2 : 1));
const ridgeSum = ridge.reduce((a, b) => a + b, 0);
assert.equal(Math.max(...ridge), 10);
assert.ok(ridgeSum > 10);

const fixture = {
  id: '3afa89e7-aff5-488d-bec3-da36196b8c5e',
  title: 'Cursor night review ridge',
  caption: 'First wall-time ridge on STRIVE.',
  visibility: 'public',
  prompts: 1,
  tool_calls: 0,
  ridge_tool_calls: ridgeSum,
  ridge,
  worker_bins: Array(50).fill(0),
  ridge_basis: 'wall-time',
  ridge_wall_seconds: 1080,
  project: 'CODE-worktrees-strava-night-review-20260915',
  harness: 'Cursor',
  code_route: null,
  profiles: { handle: 'morkeeth' },
};

// Every surface that prints this run's tool-call total, read back as [surface, printed number].
// The run recorded 0 on the transcript and 75 on its ridge: the contract (toolCallCount) says the
// total is the ridge's count. A surface may leave the total out; it may not print another one.
const total = GrinderContract.toolCallCount(fixture);
assert.equal(total, ridgeSum);
const printed = [];
const read = (surface, markup, pattern) => {
  const found = [...markup.matchAll(pattern)].map((m) => Number(m[1].replace(/,/g, '')));
  for (const n of found) printed.push([surface, n]);
  return found;
};

const page = html(fixture);
// The share page's own strip (server/public-run.mjs): the ridge's count, never 0 or the peak 10.
assert.deepEqual(read('/r/ share-stats', page.slice(page.indexOf('<dl class="share-stats"'), page.indexOf('</dl>', page.indexOf('<dl class="share-stats"'))),
  /<dt>Tool calls<\/dt><dd>([\d,]+)<\/dd>/g), [ridgeSum]);
// "Recorded details and sources" on the same page (site/run-context.js headlineHtml).
read('/r/ recorded details', page.slice(page.indexOf('<details class="share-extra"')),
  /What Tool calls means">Tool calls<\/summary>.*?<\/dt><dd[^>]*>([\d,]+)<\/dd>/g);
assert.doesNotMatch(page, /Code Route/);

// The SPA strip is work facts since b803b86 (8 Oct 2026): it no longer carries a tool-call cell,
// so it cannot disagree. Elapsed is the ridge's wall time.
const strip = GrinderContract.heroStats(fixture);
assert.deepEqual(strip, [['Elapsed', '18m']]);
read('heroStats', strip.filter(([label]) => /tool/i.test(label)).map(([, value]) => `<n>${value}</n>`).join(''), /<n>([\d,]+)<\/n>/g);

// The real SPA run card (site/index.html runCard) over the real shared modules.
const cardHtml = (() => {
  const source = fs.readFileSync(root + '/site/index.html', 'utf8');
  const cut = (from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));
  const context = {
    URL, Date, GrinderContract, ME: null,
    GrinderFeed: require('../../site/feed-card.js'),
    StriveActivity: require('../../site/activity-order.js'),
    StriveContext: require('../../site/run-context.js'),
    StriveEvidence: require('../../site/run-evidence.js'),
    StriveHistory: require('../../site/historical-import.js'),
    StrivePost: require('../../site/activity-post.js'),
    StriveLinks: require('../../site/run-links.js'),
    StriveStory: require('../../site/run-story.js'),
    esc: (s) =>
      String(s ?? '').replace(
        /[<>&"']/g,
        (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]),
      ),
    runAttribution: () => ({ handle: 'morkeeth', name: 'morkeeth', link: null, ghost: false }),
    avatar: () => '',
    coachModeBanner: () => '',
  };
  vm.createContext(context);
  vm.runInContext(
    cut('function fiveRow(r)', 'const pace=') +
      cut('function coachBlock(r){', '// A repository link is an https address') +
      cut('function connectWrapperName(', 'function wireKudos('),
    context,
  );
  return vm.runInContext('runCard(' + JSON.stringify(fixture) + ',false,0)', context);
})();
const explore = cardHtml.slice(cardHtml.indexOf('<details class="ridge-more run-explore"'));
const face = cardHtml.slice(0, cardHtml.indexOf('<details class="ridge-more run-explore"'));
assert.ok(explore.startsWith('<details'), 'the run card keeps its receipts disclosure');
// Explore, "Code activity": the ridge's count.
assert.deepEqual(read('Explore code activity', explore, /<strong class="num">([\d,]+)<\/strong> Tool calls/g), [ridgeSum]);
// Explore, "Recorded activity" (site/run-context.js metrics).
read('Explore recorded activity', explore, /<summary>Tool requests: <strong>([\d,]+)<\/strong><\/summary>/g);
// The card's face (site/activity-post.js trail).
read('SPA card face', face, /([\d,]+) agent tool calls/g);
assert.doesNotMatch(cardHtml, /Code Route/);

const shareCtx = { window: { GrinderContract }, URL };
vm.runInNewContext(fs.readFileSync(root + '/site/sharing.js', 'utf8'), shareCtx);
const facts = shareCtx.window.GrinderSharing.storyFacts(fixture);
assert.equal(facts.code, `${ridgeSum} tool calls`);
const shareStrip = shareCtx.window.GrinderSharing.metricStrip(fixture);
// With the contract loaded, as it is in the browser, the share strip is the SPA strip: one source.
assert.deepEqual(JSON.parse(JSON.stringify(shareStrip)), strip);
read('share caption', `<n>${facts.code}</n>`, /<n>([\d,]+) tool calls<\/n>/g);

const mapHtml = GrinderContract.ridge(fixture);
assert.ok(mapHtml.includes('data-run-map'));
const payload = JSON.parse(
  mapHtml
    .match(/data-run-map="([^"]*)"/)[1]
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&'),
);
assert.equal(payload.peak, 10);
assert.equal(payload.values[payload.peakIndex], 10);

function el(tag, attrs = {}, kids = []) {
  const node = {
    tagName: String(tag).toUpperCase(),
    attrs: { ...attrs },
    children: [],
    parentNode: null,
    dataset: {},
    listeners: {},
    textContent: '',
    value: attrs.value != null ? String(attrs.value) : '',
    className: attrs.class || '',
    getAttribute(name) {
      return this.attrs[name] != null ? String(this.attrs[name]) : null;
    },
    setAttribute(name, value) {
      this.attrs[name] = String(value);
    },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    querySelector(sel) {
      return queryAll(this, sel)[0] || null;
    },
    querySelectorAll(sel) {
      return queryAll(this, sel);
    },
    addEventListener(type, fn, opts) {
      (this.listeners[type] ||= []).push({ fn, opts });
    },
    closest(sel) {
      for (let n = this; n; n = n.parentNode) if (matches(n, sel)) return n;
      return null;
    },
    getBoundingClientRect() {
      return { left: 0, width: 800, top: 0, height: 150 };
    },
  };
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('data-')) {
      const camel = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      node.dataset[camel] = v;
    }
    node.attrs[k] = v;
  }
  for (const kid of kids) node.appendChild(kid);
  return node;
}
function matches(node, sel) {
  if (!node || !node.tagName) return false;
  const classes = String(node.className || '').split(/\s+/).filter(Boolean);
  let rest = sel;
  const tag = rest.match(/^[a-zA-Z]+/);
  if (tag) {
    if (node.tagName !== tag[0].toUpperCase()) return false;
    rest = rest.slice(tag[0].length);
  }
  while (rest.length) {
    if (rest[0] === '.') {
      const m = rest.match(/^\.([\w-]+)/);
      if (!m || !classes.includes(m[1])) return false;
      rest = rest.slice(m[0].length);
      continue;
    }
    if (rest[0] === '[') {
      const m = rest.match(/^\[([^\=\]]+)(?:=\"([^\"]*)\")?\]/);
      if (!m) return false;
      const val = node.getAttribute(m[1]);
      if (val == null) return false;
      if (m[2] != null && val !== m[2]) return false;
      rest = rest.slice(m[0].length);
      continue;
    }
    return false;
  }
  return true;
}
function queryAll(rootNode, sel) {
  const out = [];
  const walk = (n) => {
    if (!n || !n.tagName) return;
    if (matches(n, sel)) out.push(n);
    for (const c of n.children || []) walk(c);
  };
  walk(rootNode);
  return out;
}

const encoded = mapHtml.match(/data-run-map="([^"]*)"/)[1];
const decoded = encoded
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&');
const wrap = el('div', {
  class: 'ridge-wrap run-map',
  'data-run-map': decoded,
  dataset: { runMap: decoded },
});
const plot = el('div', { class: 'run-map-plot' });
const svg = el('svg', { class: 'ridge' });
payload.values.forEach((_, i) => {
  svg.appendChild(el('rect', { class: 'run-map-hit', 'data-bin': String(i), dataset: { bin: String(i) } }));
});
svg.appendChild(el('line', { class: 'run-map-scrub' }));
svg.appendChild(el('circle', { class: 'run-map-focus' }));
plot.appendChild(svg);
wrap.appendChild(plot);
const slider = el('input', {
  class: 'run-map-slider',
  type: 'range',
  min: '0',
  max: String(payload.values.length - 1),
  value: '0',
});
wrap.appendChild(el('label', { class: 'run-map-slider-label' }, [slider]));
const readout = el('div', { class: 'run-map-readout' });
wrap.appendChild(readout);
GrinderContract.mountRunMaps(el('div', {}, [wrap]));
assert.match(readout.textContent, /10 tool calls in this slice/);
assert.match(readout.textContent, /peak activity 10/);
assert.doesNotMatch(readout.textContent, new RegExp(`${ridgeSum} tool calls in this slice`));

const withRoute = {
  ...fixture,
  code_route: {
    v: 1,
    projects: [
      { id: 'a', label: 'strive' },
      { id: 'b', label: 'zup' },
    ],
    stops: [
      { id: 's1', kind: 'edit', label: 'Edit', basis: 'measured', project: 'a' },
      { id: 's2', kind: 'check', label: 'Check', basis: 'measured', project: 'b' },
    ],
    connectors: [],
    finish: { stop: 's2', kind: 'artifact', label: 'Ship' },
    stats: { projects_touched: 2 },
  },
};
assert.match(html(withRoute), /Code Route/);
assert.match(GrinderContract.codeRoute(withRoute), /Code Route/);

// One source, one total. Nothing above may print the transcript's 0 or the peak slice's 10.
const wrong = printed.filter(([, n]) => n !== ridgeSum);
assert.deepEqual(wrong, [], `surfaces disagree with the run total ${ridgeSum}: ${JSON.stringify(wrong)}`);

console.log(
  JSON.stringify({
    ok: true,
    toolCalls: ridgeSum,
    peakSlice: 10,
    surfaces: ['/r/', 'heroStats', 'Explore', 'share', 'slice readout'],
  }),
);
