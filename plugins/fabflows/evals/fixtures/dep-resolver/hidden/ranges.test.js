'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { api } = require('./load.js');

// Each row: range, versions that satisfy it, versions that do not. Every row follows one rule of
// SPEC.md section 2 word for word.
function table(name, rows) {
  test(name, () => {
    for (const [range, yes, no] of rows) {
      for (const v of yes) assert.equal(api.satisfies(v, range), true, `${v} should satisfy ${JSON.stringify(range)}`);
      for (const v of no) assert.equal(api.satisfies(v, range), false, `${v} should not satisfy ${JSON.stringify(range)}`);
    }
  });
}

table('ranges: any-version forms', [
  ['*', ['0.0.0', '0.0.1', '99.0.0'], ['1.0.0-alpha']],
  ['', ['0.0.1', '3.4.5'], ['0.0.1-0']],
  ['x', ['1.0.0'], []],
  ['X', ['1.0.0'], []],
]);

table('ranges: wildcard partials', [
  ['1', ['1.0.0', '1.9.9'], ['0.9.9', '2.0.0']],
  ['1.x', ['1.0.0', '1.9.9'], ['2.0.0']],
  ['1.X', ['1.5.0'], ['2.0.0']],
  ['1.*', ['1.5.0'], ['2.0.0']],
  ['1.2', ['1.2.0', '1.2.9'], ['1.1.9', '1.3.0']],
  ['1.2.x', ['1.2.5'], ['1.3.0']],
  ['1.2.*', ['1.2.5'], ['1.3.0']],
]);

table('ranges: exact versions and plain operators', [
  ['1.2.3', ['1.2.3'], ['1.2.4', '1.2.2']],
  ['=1.2.3', ['1.2.3'], ['1.2.4']],
  ['>=1.2.3', ['1.2.3', '9.0.0'], ['1.2.2']],
  ['>1.2.3', ['1.2.4'], ['1.2.3']],
  ['<2.0.0', ['1.9.9'], ['2.0.0']],
  ['<=2.0.0', ['2.0.0'], ['2.0.1']],
]);

table('ranges: operators on wildcard partials round outward', [
  ['>1.2', ['1.3.0'], ['1.2.9']],
  ['<1.2', ['1.1.9'], ['1.2.0']],
  ['>=1.2', ['1.2.0'], ['1.1.9']],
  ['<=1.2', ['1.2.9'], ['1.3.0']],
  ['>1', ['2.0.0'], ['1.9.9']],
  ['<=1', ['1.9.9'], ['2.0.0']],
]);

table('ranges: tilde', [
  ['~1.2.3', ['1.2.3', '1.2.9'], ['1.2.2', '1.3.0']],
  ['~1.2', ['1.2.0', '1.2.9'], ['1.3.0']],
  ['~1', ['1.0.0', '1.9.9'], ['2.0.0']],
  ['~0.2.3', ['0.2.3', '0.2.9'], ['0.3.0', '0.2.2']],
  ['~1.2.3-beta.2', ['1.2.3-beta.2', '1.2.3-beta.4', '1.2.3', '1.2.9'], ['1.2.3-beta.1', '1.2.4-beta.1', '1.3.0']],
]);

table('ranges: caret', [
  ['^1.2.3', ['1.2.3', '1.9.9'], ['1.2.2', '2.0.0']],
  ['^0.2.3', ['0.2.3', '0.2.9'], ['0.3.0']],
  ['^0.0.3', ['0.0.3'], ['0.0.4', '0.0.2']],
  ['^1.2.x', ['1.2.0', '1.5.0'], ['1.1.9', '2.0.0']],
  ['^0.0.x', ['0.0.0', '0.0.9'], ['0.1.0']],
  ['^0.2.x', ['0.2.0', '0.2.9'], ['0.3.0']],
  ['^1.x', ['1.0.0', '1.9.9'], ['2.0.0']],
  ['^1', ['1.0.0'], ['2.0.0']],
  ['^0.x', ['0.0.0', '0.9.9'], ['1.0.0']],
  ['^0', ['0.9.9'], ['1.0.0']],
  ['^1.2.3-beta.2', ['1.2.3-beta.2', '1.2.3-beta.3', '1.9.0'], ['1.2.3-beta.1', '1.2.4-beta.1', '2.0.0']],
  ['^0.0.3-beta', ['0.0.3-beta', '0.0.3-beta.1', '0.0.3'], ['0.0.4', '0.0.3-alpha']],
]);

table('ranges: hyphen', [
  ['1.2.3 - 2.3.4', ['1.2.3', '2.3.4', '2.0.0'], ['1.2.2', '2.3.5']],
  ['1.2 - 2.3.4', ['1.2.0', '2.3.4'], ['1.1.9', '2.3.5']],
  ['1.2.3 - 2.3', ['1.2.3', '2.3.9'], ['2.4.0']],
  ['1.2.3 - 2', ['2.9.9'], ['3.0.0', '1.2.2']],
]);

table('ranges: AND within a set, OR between sets', [
  ['>=1.2.0 <1.4.0', ['1.2.0', '1.3.9'], ['1.1.9', '1.4.0']],
  ['>=1.0.0 <1.2.0 || >=2.0.0', ['1.1.0', '2.0.0', '3.0.0'], ['1.2.0', '1.9.9']],
  ['1.x || 3.x', ['1.5.0', '3.1.0'], ['2.0.0', '4.0.0']],
  ['1.2.3 || 1.2.5', ['1.2.3', '1.2.5'], ['1.2.4']],
]);

table('ranges: the prerelease rule', [
  ['^1.2.0', ['1.2.0', '1.3.0'], ['1.2.3-alpha', '1.3.0-beta']],
  ['>=1.0.0', ['1.0.0'], ['1.2.3-alpha', '1.0.0-rc.1']],
  ['^1.2.3-0', ['1.2.3-alpha', '1.2.3-0', '1.2.3', '1.9.0'], ['1.2.4-alpha', '1.3.0-beta']],
  ['>=1.2.3-alpha', ['1.2.3-alpha', '1.2.3-beta', '1.2.3', '2.0.0'], ['1.2.4-alpha', '1.2.3-0']],
  ['>=1.2.3-alpha <2.0.0', ['1.2.3-alpha', '1.9.9'], ['2.0.0-alpha', '1.2.4-alpha']],
  ['1.2.3-alpha', ['1.2.3-alpha'], ['1.2.3', '1.2.3-beta']],
  ['<2.0.0', ['1.9.9'], ['2.0.0-alpha', '1.9.9-rc.1']],
  ['1.2.3-alpha || ^1.2.4-0', ['1.2.3-alpha', '1.2.4-beta', '1.5.0'], ['1.2.3-beta', '1.2.5-beta']],
]);

test('ranges: rejects malformed ranges with a TypeError', () => {
  for (const bad of ['>>1.0.0', '^', 'abc', '1.2.3.4', '^^1.0.0', '1.x.3', '1.x-alpha', '01.0.0', '1.2.3-01', '>= 1.2.3', 42, null]) {
    assert.throws(() => api.parseRange(bad), TypeError, `expected TypeError for ${JSON.stringify(bad)}`);
  }
});

test('ranges: satisfies accepts parsed inputs and rejects an invalid version', () => {
  const r = api.parseRange('^1.2.0');
  assert.equal(api.satisfies(api.parseVersion('1.3.0'), r), true);
  assert.equal(api.satisfies('2.0.0', r), false);
  assert.throws(() => api.satisfies('1.2', '^1.2.0'), TypeError);
});

test('ranges: maxSatisfying picks the highest admitted version or null', () => {
  assert.equal(api.maxSatisfying(['1.0.0', '1.5.0', '2.0.0', '1.9.0-beta.1', '1.4.0'], '^1.0.0'), '1.5.0');
  assert.equal(api.maxSatisfying(['1.9.0-beta.1', '1.9.0-beta.2', '1.8.0'], '^1.9.0-beta.0'), '1.9.0-beta.2');
  assert.equal(api.maxSatisfying(['0.1.0', '0.2.0'], '^1.0.0'), null);
  assert.equal(api.maxSatisfying([], '*'), null);
  assert.throws(() => api.maxSatisfying(['1.0.0', 'nope'], '*'), TypeError);
});
