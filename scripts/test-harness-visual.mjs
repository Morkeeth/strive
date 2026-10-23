import assert from 'node:assert/strict';
import Feed from '../site/feed-card.js';

const run = harness => ({
  id: `run-${String(harness).toLowerCase().replace(/\W+/g, '-')}`,
  title: 'A real run',
  harness,
  visibility: 'public',
  profiles: {handle: 'builder', display_name: 'Builder'},
});

for (const [harness, key] of [
  ['Claude Code', 'claude'],
  ['claude-agent', 'claude'],
  ['Cursor', 'cursor'],
  ['Codex', 'codex'],
  ['Grok Bot', 'grok-bot'],
]) {
  const html = Feed.harnessVisual(run(harness));
  assert.match(html, new RegExp(`data-harness-visual="${key}"`));
  assert.match(html, /aria-hidden="true"/);
  assert.doesNotMatch(html, /<img|https?:\/\//);
}

const unknown = Feed.harnessVisual(run('Another agent'));
assert.match(unknown, /data-harness-visual="agent"/);

const emptyCard = Feed.card(run('Grok Bot'), {preview: true});
assert.match(emptyCard, /data-harness-visual="grok-bot"/);

const resultCard = Feed.card({...run('Codex'), shipped: ['Working preview']}, {preview: true});
assert.doesNotMatch(resultCard, /data-harness-visual/);
assert.match(resultCard, /Working preview/);

const measured = Feed.heroVisual({...run('Cursor'), route: [0, 1, 0]});
assert.match(measured, /fc-map/);
assert.doesNotMatch(measured, /data-harness-visual/);

console.log('harness visual tests passed');
