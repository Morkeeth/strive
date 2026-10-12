import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { ridge, mountRunMaps } = require(process.argv[2]);

function el(tag, attrs = {}, kids = []) {
  const node = {
    tagName: String(tag).toUpperCase(),
    attrs: { ...attrs },
    children: [],
    parentNode: null,
    dataset: {},
    listeners: {},
    textContent: "",
    value: attrs.value != null ? String(attrs.value) : "",
    className: attrs.class || "",
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
      return this._rect || { left: 0, width: 800, top: 0, height: 150 };
    },
  };
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k.startsWith("data-")) {
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
  const classes = String(node.className || "").split(/\s+/).filter(Boolean);
  let rest = sel;
  const tag = rest.match(/^[a-zA-Z]+/);
  if (tag) {
    if (node.tagName !== tag[0].toUpperCase()) return false;
    rest = rest.slice(tag[0].length);
  }
  while (rest.length) {
    if (rest[0] === ".") {
      const m = rest.match(/^\.([\w-]+)/);
      if (!m || !classes.includes(m[1])) return false;
      rest = rest.slice(m[0].length);
      continue;
    }
    if (rest[0] === "[") {
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

function queryAll(root, sel) {
  const out = [];
  const walk = (n) => {
    if (!n || !n.tagName) return;
    if (matches(n, sel)) out.push(n);
    for (const c of n.children || []) walk(c);
  };
  walk(root);
  return out;
}

const values = Array.from({ length: 50 }, (_, i) => (i === 20 ? 9 : i % 3));
const html = ridge({
  ridge: values,
  worker_bins: Array(50).fill(0),
  ridge_basis: "turn-order",
  commit_bins: [10],
  output_url: "https://github.com/example/repo/pull/1",
  commits: 0,
});
assert.ok(!html.includes("ridge-chip"), "output_url must not fabricate a timed chip");
// The basis is named where the map is read: the image label, the axis line and the help text
// (ce9b610 replaced the single "Activity along turn order" caption with these).
assert.ok(html.includes('aria-label="Tool calls across turn order"'));
assert.ok(html.includes("Horizontal: turn order · vertical: 0–9 tool requests per slice"));
assert.ok(html.includes("Each activity slice is one measured step along turn order."));
assert.ok(!html.includes("wall time"), "a turn-order map must not claim wall time");
assert.ok(html.includes("run-map-slider"));
assert.ok(html.includes("activity slice"));

const payloadMatch = html.match(/data-run-map="([^"]*)"/);
assert.ok(payloadMatch);
const payload = payloadMatch[1]
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&amp;/g, "&");
const data = JSON.parse(payload);

const wrap = el("div", {
  class: "ridge-wrap run-map",
  "data-run-map": payload,
  dataset: { runMap: payload },
});
const plot = el("div", { class: "run-map-plot" });
const svg = el("svg", { class: "ridge" });
svg._rect = { left: 0, width: 800, top: 0, height: 150 };
data.values.forEach((_, i) => {
  svg.appendChild(
    el("rect", { class: "run-map-hit", "data-bin": String(i), dataset: { bin: String(i) } }),
  );
});
svg.appendChild(el("line", { class: "run-map-scrub" }));
svg.appendChild(el("circle", { class: "run-map-focus" }));
plot.appendChild(svg);
wrap.appendChild(plot);
const slider = el("input", {
  class: "run-map-slider",
  type: "range",
  min: "0",
  max: String(data.values.length - 1),
  value: "0",
});
wrap.appendChild(el("label", { class: "run-map-slider-label" }, [slider]));
const readout = el("div", { class: "run-map-readout" });
wrap.appendChild(readout);
const root = el("div", {}, [wrap]);

mountRunMaps(root);
assert.equal(wrap.dataset.wired, "1");
assert.equal((wrap.listeners.touchmove || []).length, 0, "wrap must not trap touchmove");
assert.ok((plot.listeners.touchmove || []).length > 0, "plot owns touchmove");

assert.match(readout.textContent, /Activity slice/);
const before = readout.textContent;
assert.equal(wrap.dataset.activeBin, String(data.peakIndex));

(slider.listeners.keydown || []).forEach(({ fn }) =>
  fn({ key: "End", preventDefault() {} }),
);
assert.equal(wrap.dataset.activeBin, "49");
assert.notEqual(readout.textContent, before);
assert.match(readout.textContent, /Activity slice 50 of 50/);

(slider.listeners.keydown || []).forEach(({ fn }) =>
  fn({ key: "Home", preventDefault() {} }),
);
assert.equal(wrap.dataset.activeBin, "0");

let verticalPrevented = false;
(plot.listeners.touchstart || []).forEach(({ fn }) =>
  fn({ touches: [{ clientX: 100, clientY: 40 }] }),
);
(plot.listeners.touchmove || []).forEach(({ fn }) =>
  fn({
    touches: [{ clientX: 102, clientY: 80 }],
    cancelable: true,
    preventDefault() {
      verticalPrevented = true;
    },
  }),
);
assert.equal(verticalPrevented, false, "vertical pan must stay free");

let horizontalPrevented = false;
(plot.listeners.touchstart || []).forEach(({ fn }) =>
  fn({ touches: [{ clientX: 100, clientY: 40 }] }),
);
(plot.listeners.touchmove || []).forEach(({ fn }) =>
  fn({
    touches: [{ clientX: 400, clientY: 42 }],
    cancelable: true,
    preventDefault() {
      horizontalPrevented = true;
    },
  }),
);
assert.equal(horizontalPrevented, true, "horizontal scrub may preventDefault");
assert.notEqual(wrap.dataset.activeBin, "0");

console.log(JSON.stringify({ ok: true, active: wrap.dataset.activeBin, readout: readout.textContent }));
