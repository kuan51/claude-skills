'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root } = require('./load.js');
const { build, keepTrap } = require('./oracle.js');

const BIN = path.join(root, 'bin', 'lockstep.js');
// A hung CLI becomes a failed test instead of stalling the grader.
const run = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', cwd: root, timeout: 30000 });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lockstep-update-cli-'));
const write = (name, data) => {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, typeof data === 'string' ? data : JSON.stringify(data));
  return p;
};
const pkg = (deps) => ({ dependencies: deps || {} });
const manifest = (deps) => ({ name: 'app', version: '1.0.0', dependencies: deps });

// Example 2 from SPEC.md.
const registry = {
  a: { '1.0.0': pkg({ c: '^1.0.0' }), '2.0.0': pkg({ c: '^2.0.0' }) },
  b: { '1.0.0': pkg({ c: '>=1.0.0' }), '1.1.0': pkg({ c: '>=1.0.0' }) },
  c: { '1.0.0': pkg(), '2.0.0': pkg(), '2.1.0': pkg() },
};
const oldLock = build(manifest({ a: '^1.0.0', b: '^1.0.0' }), { a: '1.0.0', b: '1.0.0', c: '1.0.0' }, registry);
const m = manifest({ a: '^2.0.0', b: '^1.0.0' });
const expected = build(m, { a: '2.0.0', b: '1.0.0', c: '2.1.0' }, registry);
const mFile = write('manifest.json', m);
const lFile = write('lockstep.lock', oldLock);
const rFile = write('registry.json', registry);

test('cli: update prints the new lockfile as two-space JSON with a trailing newline and exits 0', () => {
  const r = run('update', mFile, lFile, rFile);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, `${JSON.stringify(expected, null, 2)}\n`);
});

test('cli: update --out writes the file and prints nothing', () => {
  const out = path.join(tmp, 'new.lock');
  const r = run('update', mFile, lFile, rFile, '--out', out);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
  assert.equal(fs.readFileSync(out, 'utf8'), `${JSON.stringify(expected, null, 2)}\n`);
});

test('cli: update exits 1 on a malformed lockfile', () => {
  const bad = [
    { ...oldLock, lockfileVersion: 2 },
    { ...oldLock, root: 'app' },
    { ...oldLock, packages: null },
    { ...oldLock, packages: { ...oldLock.packages, a: { dependencies: {} } } },
  ];
  bad.forEach((lock, i) => {
    const r = run('update', mFile, write(`bad-${i}.lock`, lock), rFile);
    assert.equal(r.status, 1, `case ${i}: stdout=${r.stdout} stderr=${r.stderr}`);
    assert.equal(r.stdout, '', `case ${i}`);
  });
});

test('cli: update exits 2 with an error: line when no lockfile exists', () => {
  const r = run('update', write('conflict.json', manifest({ a: '^3.0.0', b: '^1.0.0' })), lFile, rFile);
  assert.equal(r.status, 2, `stdout=${r.stdout} stderr=${r.stderr}`);
  assert.match(r.stderr, /^error: .+/m);
});

test('cli: update handles the large case within 10 s', { timeout: 10000 }, () => {
  const traps = ['1', '2', '3', '4'].map(keepTrap);
  const merge = (key) => Object.assign({}, ...traps.map((t) => t[key]));
  const big = merge('registry');
  const bigM = manifest(merge('newDeps'));
  const r = spawnSync(process.execPath, [BIN, 'update', write('big-manifest.json', bigM), write('big.lock', build(manifest(merge('oldDeps')), merge('oldVersions'), big)), write('big-registry.json', big)], { encoding: 'utf8', cwd: root, timeout: 10000 });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, `${JSON.stringify(build(bigM, merge('answer'), big), null, 2)}\n`);
});
