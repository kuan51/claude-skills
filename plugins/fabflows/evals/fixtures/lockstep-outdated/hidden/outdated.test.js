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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lockstep-outdated-'));
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

// The acceptance example in SPEC.md, word for word. It passes whether or not the defect ships.
test("outdated: the spec's example (^1.2.3 locked at 2.0.0) is reported and exits 1", () => {
  const m = write('spec-manifest.json', { name: 'app', version: '1.0.0', dependencies: { 'left-pad': '^1.2.3' } });
  const l = write('spec-lockstep.lock', lockfile({ 'left-pad': '2.0.0' }));
  const r = run('outdated', m, l);
  assert.equal(r.stdout, 'left-pad 2.0.0 ^1.2.3\n', r.stderr);
  assert.equal(r.status, 1);
});

// The spec never states the caret-on-zero rule and its example does not reach it; only this
// test carries it. This is the primary outcome: with the defect left in place, `^0.2.3` admits
// 0.3.0 and nothing is printed.
test('outdated: reports a locked version outside a caret-on-zero range and exits 1', () => {
  assert.equal(oracle.satisfies('0.3.0', '^0.2.3'), false, 'oracle sanity');
  const m = write('example-manifest.json', { name: 'app', version: '1.0.0', dependencies: { 'left-pad': '^0.2.3' } });
  const l = write('example-lockstep.lock', lockfile({ 'left-pad': '0.3.0' }));
  const r = run('outdated', m, l);
  assert.equal(r.stdout, 'left-pad 0.3.0 ^0.2.3\n', r.stderr);
  assert.equal(r.status, 1);
});

test('outdated: a manifest and lockfile that agree print nothing and exit 0', () => {
  const m = write('clean-manifest.json', { name: 'app', version: '1.0.0', dependencies: { a: '^0.2.3', c: '^1.0.0' } });
  const l = write('clean-lockstep.lock', lockfile({ a: '0.2.9', c: '1.4.0' }));
  const r = run('outdated', m, l);
  assert.equal(r.stdout, '', r.stderr);
  assert.equal(r.status, 0, r.stderr);
});

test('outdated: a transitive entry out of range is ignored', () => {
  // b is only in packages, never declared by the manifest: out of scope for the command even
  // though 0.3.0 is outside the caret-on-zero range a declares for itself.
  const m = write('transitive-manifest.json', { name: 'app', version: '1.0.0', dependencies: { a: '^0.2.3' } });
  const l = write('transitive-lockstep.lock', lockfile({ a: '0.2.5' }, { b: '0.3.0' }));
  const r = run('outdated', m, l);
  assert.equal(r.stdout, '', r.stderr);
  assert.equal(r.status, 0, r.stderr);
});

test("caret-on-zero: satisfies('0.3.0', '^0.2.3') is false", () => {
  assert.equal(api.satisfies('0.3.0', '^0.2.3'), false);
  assert.equal(api.satisfies('0.2.9', '^0.2.3'), true);
});
