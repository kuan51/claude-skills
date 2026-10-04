'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseVersion, compareVersions, satisfies, maxSatisfying, resolve, ResolutionError } = require('../src/index.js');

const BIN = path.join(__dirname, '..', 'bin', 'lockstep.js');
const run = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });
const pkg = (deps) => ({ dependencies: deps || {} });

test('parseVersion accepts strict versions and rejects the rest', () => {
  assert.deepEqual(parseVersion('1.2.3-beta.1+build.5'), { major: 1, minor: 2, patch: 3, prerelease: ['beta', '1'], build: ['build', '5'] });
  for (const bad of ['1.2', 'v1.2.3', '01.2.3', '1.2.3-01', '']) assert.throws(() => parseVersion(bad), TypeError, bad);
});

test('compareVersions follows semver precedence', () => {
  assert.equal(compareVersions('1.0.0-alpha', '1.0.0'), -1);
  assert.equal(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
  assert.equal(compareVersions('2.0.0', '1.9.9'), 1);
  assert.equal(compareVersions('1.0.0+a', '1.0.0+b'), 0);
});

test('satisfies handles caret, tilde, hyphen and prerelease ranges', () => {
  for (const [v, r, want] of [
    ['1.9.9', '^1.2.3', true], ['2.0.0', '^1.2.3', false],
    ['1.2.9', '~1.2.3', true], ['1.3.0', '~1.2.3', false],
    ['2.3.4', '1.2.3 - 2.3.4', true], ['2.3.5', '1.2.3 - 2.3.4', false],
    ['1.2.3-alpha', '^1.2.0', false], ['1.2.3-alpha', '>=1.2.3-alpha', true],
    ['1.5.0', '<1.0.0 || >=1.4.0', true],
  ]) assert.equal(satisfies(v, r), want, `${v} ${r}`);
  assert.equal(maxSatisfying(['1.0.0', '1.4.0', '2.0.0'], '^1.0.0'), '1.4.0');
});

test('resolve backtracks and reports conflicts', () => {
  const registry = {
    a: { '1.0.0': pkg({ b: '^1.0.0' }), '1.1.0': pkg({ b: '^2.0.0' }) },
    b: { '1.0.0': pkg(), '1.5.0': pkg(), '2.0.0': pkg() },
    c: { '1.0.0': pkg({ b: '^1.0.0' }) },
  };
  const lock = resolve({ name: 'app', version: '1.0.0', dependencies: { a: '^1.0.0', c: '^1.0.0' } }, registry);
  assert.deepEqual(lock.root.dependencies, { a: '1.0.0', c: '1.0.0' });
  assert.equal(lock.packages.b.version, '1.5.0');
  assert.throws(() => resolve({ name: 'app', version: '1.0.0', dependencies: { a: '^1.1.0', c: '*' } }, registry), ResolutionError);
});

test('cli: resolve and check exit codes', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lockstep-test-'));
  const m = path.join(tmp, 'manifest.json');
  const r = path.join(tmp, 'registry.json');
  fs.writeFileSync(m, JSON.stringify({ name: 'app', version: '1.0.0', dependencies: { a: '^1.0.0' } }));
  fs.writeFileSync(r, JSON.stringify({ a: { '1.0.0': pkg(), '1.2.0': pkg() } }));
  const res = run('resolve', m, r);
  assert.equal(res.status, 0, res.stderr);
  assert.equal(JSON.parse(res.stdout).root.dependencies.a, '1.2.0');
  assert.equal(run('check', '1.2.3', '^1.0.0').stdout, 'true\n');
  assert.equal(run('check', '2.0.0', '^1.0.0').status, 2);
  assert.equal(run('check', '1.2', '^1.0.0').status, 1);
  assert.equal(run('frobnicate').status, 1);
});
