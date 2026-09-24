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

test('every entry is well-formed and uses declared values', () => {
  assert.deepEqual(corpus.expectedValues, ['fabflows', 'using-fabflows', 'brainstorming', 'fabflows-setup', 'ticket', null]);
  assert.ok(corpus.queries.length >= 20, 'expected at least 20 queries');
  const seen = new Set();
  for (const entry of corpus.queries) {
    assert.ok(entry.query.trim(), 'query must be non-empty');
    assert.ok(!seen.has(entry.query), `duplicate query: ${entry.query}`);
    seen.add(entry.query);
    assert.ok(corpus.expectedValues.includes(entry.expected), `unknown expected in: ${entry.query}`);
    assert.ok(corpus.categories.includes(entry.category), `unknown category in: ${entry.query}`);
  }
});

test('every shipped skill and the null case are covered, across every category', () => {
  // Derived from the skills directory, so a renamed skill or one with no queries fails here
  // instead of the corpus silently measuring the wrong set.
  const skills = fs.readdirSync(path.join(__dirname, '..', 'skills')).sort();
  assert.deepEqual(corpus.expectedValues.filter(Boolean).sort(), skills);
  for (const value of corpus.expectedValues) {
    const n = corpus.queries.filter((q) => q.expected === value).length;
    assert.ok(n >= 4, `need at least 4 "${value}" queries, got ${n}`);
  }
  for (const cat of corpus.categories) {
    assert.ok(corpus.queries.some((q) => q.category === cat), `no query exercises category "${cat}"`);
  }
});

test('negatives expect null and are near misses', () => {
  const negatives = corpus.queries.filter((q) => q.category === 'negative');
  assert.ok(negatives.length >= 8, `need at least 8 negatives, found ${negatives.length}`);
  for (const q of negatives) {
    assert.equal(q.expected, null, `a negative must expect null: ${q.query}`);
    assert.ok(
      ADJACENT_STEMS.some((s) => q.query.toLowerCase().includes(s)),
      `negative must share a skill stem: ${q.query}`
    );
  }
});
