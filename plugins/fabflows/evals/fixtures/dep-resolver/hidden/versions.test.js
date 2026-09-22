'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { api } = require('./load.js');

test('versions: parses core, prerelease and build parts', () => {
  assert.deepEqual(api.parseVersion('1.2.3'), { major: 1, minor: 2, patch: 3, prerelease: [], build: [] });
  assert.deepEqual(api.parseVersion('1.2.3-alpha.1+build.5'), { major: 1, minor: 2, patch: 3, prerelease: ['alpha', '1'], build: ['build', '5'] });
  assert.deepEqual(api.parseVersion('0.0.0-0'), { major: 0, minor: 0, patch: 0, prerelease: ['0'], build: [] });
  assert.deepEqual(api.parseVersion('10.20.30+001'), { major: 10, minor: 20, patch: 30, prerelease: [], build: ['001'] });
});

test('versions: returns a parsed object unchanged', () => {
  const v = api.parseVersion('1.2.3');
  assert.equal(api.parseVersion(v), v);
});

test('versions: rejects every malformed form with a TypeError', () => {
  for (const bad of ['1.2', 'v1.2.3', '1.2.3.4', '01.2.3', '1.2.3-01', '1.2.3-', '1.2.3-a..b', '', ' 1.2.3', '1.2.3 ', '1.2.3-al pha', 42, null, undefined]) {
    assert.throws(() => api.parseVersion(bad), TypeError, `expected TypeError for ${JSON.stringify(bad)}`);
  }
});

test('versions: compares core numerically, not lexically', () => {
  assert.equal(api.compareVersions('1.0.0', '2.0.0'), -1);
  assert.equal(api.compareVersions('2.1.0', '2.0.9'), 1);
  assert.equal(api.compareVersions('1.10.0', '1.9.0'), 1);
  assert.equal(api.compareVersions('1.0.10', '1.0.9'), 1);
  assert.equal(api.compareVersions('1.2.3', '1.2.3'), 0);
});

test('versions: orders the semver 2.0.0 prerelease example', () => {
  const chain = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0'];
  for (let i = 0; i + 1 < chain.length; i++) {
    assert.equal(api.compareVersions(chain[i], chain[i + 1]), -1, `${chain[i]} < ${chain[i + 1]}`);
    assert.equal(api.compareVersions(chain[i + 1], chain[i]), 1, `${chain[i + 1]} > ${chain[i]}`);
  }
});

test('versions: ignores build metadata and accepts parsed objects', () => {
  assert.equal(api.compareVersions('1.0.0+a', '1.0.0+b'), 0);
  assert.equal(api.compareVersions(api.parseVersion('1.0.0'), '1.0.1'), -1);
  assert.equal(api.compareVersions('1.0.0-alpha+1', api.parseVersion('1.0.0-alpha+2')), 0);
});
