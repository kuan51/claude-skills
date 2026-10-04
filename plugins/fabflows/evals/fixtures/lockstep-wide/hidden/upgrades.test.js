'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root, api, oracle } = require('./load.js');

const BIN = path.join(root, 'bin', 'lockstep.js');
const run = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', cwd: root, timeout: 30000 });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lockstep-upgrades-'));
const write = (name, data) => {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, JSON.stringify(data));
  return p;
};
const lockfile = (direct, transitive = {}) => {
  const packages = {};
  for (const [name, version] of Object.entries({ ...direct, ...transitive })) packages[name] = { version, dependencies: {} };
  return { lockfileVersion: 1, root: { name: 'app', version: '1.0.0', dependencies: direct }, packages };
};
const registry = (spec) => Object.fromEntries(Object.entries(spec).map(([name, versions]) => [name, Object.fromEntries(versions.map((v) => [v, {}]))]));
// Writes the three files under a case prefix and runs the command on them.
const upgrades = (key, deps, locked, reg, transitive) => run(
  'upgrades',
  write(`${key}-manifest.json`, { name: 'app', version: '1.0.0', dependencies: deps }),
  write(`${key}-lockstep.lock`, lockfile(locked, transitive)),
  write(`${key}-registry.json`, registry(reg)),
);

// The acceptance example in SPEC.md, word for word. It passes whether or not the defects ship.
test("upgrades: the spec's example prints left-pad only and exits 0", () => {
  const r = upgrades('spec', { 'left-pad': '^1.2.0', 'right-pad': '~2.0.0' }, { 'left-pad': '1.2.0', 'right-pad': '2.0.1' },
    { 'left-pad': ['1.2.0', '1.3.0', '2.0.0'], 'right-pad': ['2.0.1', '2.1.0'] });
  assert.equal(r.stdout, 'left-pad 1.2.0 1.3.0\n', r.stderr);
  assert.equal(r.status, 0);
});

// The four cases below each reach one planted defect through the command's normal path.
test('upgrades: the highest satisfying version listed last in the registry is reported', () => {
  assert.equal(oracle.maxSatisfying(['1.0.0', '1.1.0', '1.4.0'], '^1.0.0'), '1.4.0', 'oracle sanity');
  const r = upgrades('last', { a: '^1.0.0' }, { a: '1.0.0' }, { a: ['1.0.0', '1.1.0', '1.4.0'] });
  assert.equal(r.stdout, 'a 1.0.0 1.4.0\n', r.stderr);
  assert.equal(r.status, 0);
});

test('upgrades: a range joined by || without spaces is honoured', () => {
  const r = upgrades('or', { a: '^1.0.0||^2.0.0' }, { a: '1.0.0' }, { a: ['1.0.0', '2.1.0', '3.0.0'] });
  assert.equal(r.stdout, 'a 1.0.0 2.1.0\n', r.stderr);
  assert.equal(r.status, 0);
});

test('upgrades: a longer prerelease of the same version counts as newer', () => {
  assert.equal(oracle.maxSatisfying(['2.0.0-rc', '2.0.0-rc.1', '3.0.0'], '>=2.0.0-rc <3.0.0'), '2.0.0-rc.1', 'oracle sanity');
  const r = upgrades('pre', { a: '>=2.0.0-rc <3.0.0' }, { a: '2.0.0-rc' }, { a: ['2.0.0-rc', '2.0.0-rc.1', '3.0.0'] });
  assert.equal(r.stdout, 'a 2.0.0-rc 2.0.0-rc.1\n', r.stderr);
  assert.equal(r.status, 0);
});

test('upgrades: a locked version with a leading zero in its build metadata is accepted', () => {
  const r = upgrades('build', { a: '^1.0.0' }, { a: '1.0.0+build.007' }, { a: ['1.0.0+build.007', '1.1.0', '2.0.0'] });
  assert.equal(r.stdout, 'a 1.0.0+build.007 1.1.0\n', r.stderr);
  assert.equal(r.status, 0);
});

test('upgrades: up-to-date, unlisted and transitive packages print nothing and exit 0', () => {
  const r = upgrades('clean', { a: '^1.0.0', b: '~2.0.0', z: '^1.0.0' }, { a: '1.4.0', b: '2.0.3', z: '1.0.0' },
    { a: ['1.0.0', '1.4.0', '2.0.0'], b: ['2.0.3', '2.1.0'], c: ['1.0.0', '1.9.0', '2.0.0'] }, { c: '1.0.0' });
  assert.equal(r.stdout, '', r.stderr);
  assert.equal(r.status, 0, r.stderr);
});

test('upgrades: lines come in ascending name order', () => {
  const r = upgrades('order', { zeta: '^1.0.0', alpha: '^1.0.0' }, { zeta: '1.0.0', alpha: '1.0.0' },
    { zeta: ['1.0.0', '1.2.0', '2.0.0'], alpha: ['1.0.0', '1.1.0', '2.0.0'] });
  assert.equal(r.stdout, 'alpha 1.0.0 1.1.0\nzeta 1.0.0 1.2.0\n', r.stderr);
  assert.equal(r.status, 0);
});

test('upgrades: usage and input errors exit 1 with nothing on stdout', () => {
  const bad = upgrades('badrange', { a: '^1.x.2' }, { a: '1.0.0' }, { a: ['1.0.0'] });
  assert.equal(bad.status, 1);
  assert.equal(bad.stdout, '');
  const badVersion = upgrades('badversion', { a: '^1.0.0' }, { a: '1.0' }, { a: ['1.0.0'] });
  assert.equal(badVersion.status, 1);
  assert.equal(badVersion.stdout, '');
  assert.equal(run('upgrades', path.join(tmp, 'spec-manifest.json')).status, 1);
  assert.equal(run('upgrades', path.join(tmp, 'missing.json'), path.join(tmp, 'missing.lock'), path.join(tmp, 'missing-registry.json')).status, 1);
});

// One test per planted defect, each on the callee directly.
test('defect: parseVersion accepts a leading zero in build metadata', () => {
  assert.deepEqual(api.parseVersion('1.0.0+build.007').build, ['build', '007']);
});

test('defect: compareVersions ranks a longer prerelease above its prefix', () => {
  assert.equal(api.compareVersions('1.0.0-alpha', '1.0.0-alpha.1'), -1);
  assert.equal(api.compareVersions('1.0.0-alpha.1', '1.0.0-alpha'), 1);
});

test('defect: parseRange splits || without spaces', () => {
  assert.deepEqual(api.parseRange('^1.0.0||^2.0.0'), oracle.parseRange('^1.0.0||^2.0.0'));
});

test('defect: maxSatisfying considers the last version in the list', () => {
  assert.equal(api.maxSatisfying(['1.0.0', '1.2.0', '1.4.0'], '^1.0.0'), '1.4.0');
});
