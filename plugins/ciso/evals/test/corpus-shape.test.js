'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const corpus = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'trigger-corpus.json'), 'utf8')
);

// Keyword stems a "negative" query must share with a ciso skill so it tests adjacent intent
// (over-triggering) rather than random noise -- the rubric requires negatives to look like near
// misses, not unrelated text.
const ADJACENT_STEMS = [
  'hitrust', 'ciso', 'mycsf', 'e1', 'i1', 'r2', 'control', 'certif', 'dashboard', 'interview',
  'import', 'register', 'upgrade', 'vendor', 'scaffold', 'init', 'track', 'compli', 'security',
  'structure', 'maturity', 'prisma', 'soc 2', 'domain', 'assess',
  // Verb-surface stems: the near-miss negatives now include ordinary uses of the verbs' own
  // English words ("review this PR for bugs", "audit our AWS bill"), which is exactly the
  // over-triggering these skills are most exposed to.
  'review', 'evidence', 'audit', 'scope', 'gap', 'jira', 'linear', 'ticket', 'annex', 'iso 27001',
  'pull request',
];

test('corpus declares the value/category vocabularies and a non-empty query list', () => {
  assert.ok(Array.isArray(corpus.expectedValues) && corpus.expectedValues.length > 0);
  assert.ok(Array.isArray(corpus.categories) && corpus.categories.length > 0);
  assert.ok(Array.isArray(corpus.queries) && corpus.queries.length >= 20, 'expected a real corpus (>= 20 queries)');
});

test('every entry is well-formed and uses declared values/categories', () => {
  const seen = new Set();
  for (const entry of corpus.queries) {
    assert.equal(typeof entry.query, 'string');
    assert.ok(entry.query.trim().length > 0, 'query must be non-empty');
    assert.ok(!seen.has(entry.query), `duplicate query: ${entry.query}`);
    seen.add(entry.query);

    // `expected: null` is a legal value (no skill should fire); check membership explicitly since
    // Array.includes(null) works but a typo like "none" must fail.
    assert.ok(
      corpus.expectedValues.some((v) => v === entry.expected),
      `entry expected "${entry.expected}" not in expectedValues: ${entry.query}`
    );
    assert.ok(
      corpus.categories.includes(entry.category),
      `entry category "${entry.category}" not in categories: ${entry.query}`
    );
  }
});

test('every model-invocable skill and the null case are covered, across categories', () => {
  const byExpected = {};
  for (const value of corpus.expectedValues) byExpected[value === null ? 'null' : value] = 0;

  const categories = new Set();
  for (const entry of corpus.queries) {
    byExpected[entry.expected === null ? 'null' : entry.expected] += 1;
    categories.add(entry.category);
  }

  // Derived from expectedValues rather than a hardcoded list, so adding a verb to the corpus
  // vocabulary without writing queries for it fails here instead of silently shipping untested.
  for (const [value, count] of Object.entries(byExpected)) {
    assert.ok(count >= 4, `need a meaningful number of "${value}" queries, got ${count}`);
  }
  assert.ok(byExpected.null >= 5, 'need negative-control queries');
  for (const cat of corpus.categories) {
    assert.ok(categories.has(cat), `no query exercises category "${cat}"`);
  }
});

// The verbs are much closer in meaning to each other than the old per-certification skills were.
// These are the pairs a real user actually collides: recording a status vs reporting on statuses
// already recorded, reading a code change vs attaching an artifact, and setup vs scaffolding.
// Whether the model actually gets them right is what the eval run measures -- this only guards
// that the corpus keeps asking.
test('the corpus disambiguates the verbs that genuinely overlap', () => {
  const disambiguation = corpus.queries.filter((e) => e.category === 'disambiguation');
  for (const verb of ['init', 'register', 'interview', 'audit', 'review', 'evidence']) {
    assert.ok(
      disambiguation.some((e) => e.expected === verb),
      `no disambiguation query expects "${verb}" -- it is one of the verbs most likely to be confused for another`
    );
  }
});

test('negatives are adjacent (share a skill keyword), not random noise', () => {
  const negatives = corpus.queries.filter((e) => e.expected === null);
  for (const entry of negatives) {
    const q = entry.query.toLowerCase();
    assert.ok(
      ADJACENT_STEMS.some((stem) => q.includes(stem)),
      `negative shares no keyword with any skill (should be adjacent intent): ${entry.query}`
    );
  }
});

test('the maintainer-only compiler is never an expected auto-selection', () => {
  for (const entry of corpus.queries) {
    assert.notEqual(
      entry.expected,
      'hitrust-controls-compiler',
      'compiler is disable-model-invocation -- it must not appear as an expected auto-trigger'
    );
  }
});
