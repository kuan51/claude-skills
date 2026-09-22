'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Shape only. Accuracy needs a model in the loop: plugins/ciso/evals/RUNBOOK.md.
const corpus = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'evals', 'trigger-corpus.json'), 'utf8')
);

// A negative must be a near miss that shares the skills' own vocabulary, not random noise,
// or it tests nothing about over-triggering.
const ADJACENT_STEMS = [
  'delegate', 'spawn', 'subagent', 'worker', 'explore', 'grep', 'test', 'review', 'cost',
  'brainstorm', 'fix', 'rename', 'branch', 'fabflows', 'build', 'spec',
];

test('corpus declares its vocabularies and a real query list', () => {
  assert.deepEqual(corpus.expectedValues, ['fabflows', 'using-fabflows', 'brainstorming', null]);
  assert.ok(Array.isArray(corpus.categories) && corpus.categories.length > 0);
  assert.ok(Array.isArray(corpus.queries) && corpus.queries.length >= 20, 'expected at least 20 queries');
});

test('every entry is well-formed and uses declared values', () => {
  const seen = new Set();
  for (const entry of corpus.queries) {
    assert.equal(typeof entry.query, 'string');
    assert.ok(entry.query.trim(), 'query must be non-empty');
    assert.ok(!seen.has(entry.query), `duplicate query: ${entry.query}`);
    seen.add(entry.query);
    assert.ok(corpus.expectedValues.includes(entry.expected), `unknown expected in: ${entry.query}`);
    assert.ok(corpus.categories.includes(entry.category), `unknown category in: ${entry.query}`);
  }
});

test('every skill has enough positives, and negatives are near misses', () => {
  for (const skill of ['fabflows', 'using-fabflows', 'brainstorming']) {
    const n = corpus.queries.filter((q) => q.expected === skill).length;
    assert.ok(n >= 3, `${skill} needs at least 3 positive queries, found ${n}`);
  }
  const negatives = corpus.queries.filter((q) => q.category === 'negative');
  assert.ok(negatives.length >= 8, `need at least 8 negatives, found ${negatives.length}`);
  for (const q of negatives) {
    assert.equal(q.expected, null, `a negative must expect null: ${q.query}`);
    const text = q.query.toLowerCase();
    assert.ok(
      ADJACENT_STEMS.some((s) => text.includes(s)),
      `negative must share a skill stem (${ADJACENT_STEMS.join(', ')}): ${q.query}`
    );
  }
});

test('the disambiguation set covers each confusable pair', () => {
  const dis = corpus.queries.filter((q) => q.category === 'disambiguation').map((q) => q.expected);
  for (const expected of ['fabflows', 'using-fabflows', 'brainstorming', null]) {
    assert.ok(dis.includes(expected), `disambiguation must include a query resolving to ${expected}`);
  }
});
