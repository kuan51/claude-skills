'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { slugify } = require('../src/slug.js');

test('slugify joins words with single hyphens', () => {
  assert.equal(slugify('hello   world'), 'hello-world');
});

test('slugify lower-cases the title', () => {
  assert.equal(slugify('Hello World'), 'hello-world');
});

test('slugify trims leading and trailing punctuation', () => {
  assert.equal(slugify('  -- Release notes! --'), 'release-notes');
});
