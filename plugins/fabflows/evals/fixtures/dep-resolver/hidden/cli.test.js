'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root } = require('./load.js');

const BIN = path.join(root, 'bin', 'lockstep.js');
// A hung CLI becomes a failed test instead of stalling the grader's five-minute budget.
const run = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', cwd: root, timeout: 30000 });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lockstep-cli-'));
const write = (name, data) => {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, typeof data === 'string' ? data : JSON.stringify(data));
  return p;
};
const pkg = (deps) => ({ dependencies: deps || {} });

const registry = {
  a: { '1.0.0': pkg(), '1.2.0': pkg({ b: '~2.1.0' }), '2.0.0': pkg() },
  b: { '2.1.0': pkg(), '2.1.5': pkg(), '2.2.0': pkg() },
  x: { '1.0.0': pkg({ b: '^3.0.0' }) },
};
const manifestOk = write('manifest.json', { name: 'app', version: '1.0.0', dependencies: { a: '^1.0.0' } });
const manifestConflict = write('conflict.json', { name: 'app', version: '1.0.0', dependencies: { a: '^1.2.0', x: '*' } });
const registryFile = write('registry.json', registry);
const expectedLock = {
  lockfileVersion: 1,
  root: { name: 'app', version: '1.0.0', dependencies: { a: '1.2.0' } },
  packages: { a: { version: '1.2.0', dependencies: { b: '2.1.5' } }, b: { version: '2.1.5', dependencies: {} } },
};

test('cli: resolve prints the lockfile as indented JSON and exits 0', () => {
  const r = run('resolve', manifestOk, registryFile);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), expectedLock);
  assert.equal(r.stdout, `${JSON.stringify(expectedLock, null, 2)}\n`);
});

test('cli: resolve --out writes the file and prints nothing', () => {
  const out = path.join(tmp, 'lock.json');
  const r = run('resolve', manifestOk, registryFile, '--out', out);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
  assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')), expectedLock);
});

test('cli: resolve exits 2 with an error: line on a conflict', () => {
  const r = run('resolve', manifestConflict, registryFile);
  assert.equal(r.status, 2, `stdout=${r.stdout} stderr=${r.stderr}`);
  assert.match(r.stderr, /^error: .+/m);
});

test('cli: resolve exits 1 on a missing file or invalid JSON', () => {
  assert.equal(run('resolve', path.join(tmp, 'missing.json'), registryFile).status, 1);
  const bad = write('bad.json', '{not json');
  assert.equal(run('resolve', bad, registryFile).status, 1);
  assert.equal(run('resolve', manifestOk).status, 1, 'missing registry argument');
});

test('cli: check prints true and exits 0, or false and exits 2', () => {
  const yes = run('check', '1.2.3', '^1.0.0');
  assert.equal(yes.status, 0, yes.stderr);
  assert.equal(yes.stdout, 'true\n');
  const no = run('check', '2.0.0', '^1.0.0');
  assert.equal(no.status, 2, no.stderr);
  assert.equal(no.stdout, 'false\n');
  const pre = run('check', '1.2.3-alpha', '^1.0.0');
  assert.equal(pre.status, 2);
  assert.equal(pre.stdout, 'false\n');
});

test('cli: check exits 1 on an invalid version or range', () => {
  assert.equal(run('check', '1.2', '^1.0.0').status, 1);
  assert.equal(run('check', '1.2.3', '>>1').status, 1);
  assert.equal(run('check', '1.2.3').status, 1, 'missing range argument');
});

test('cli: no subcommand or an unknown one exits 1 with usage on stderr', () => {
  const none = run();
  assert.equal(none.status, 1);
  assert.ok(none.stderr.length > 0);
  assert.equal(run('frobnicate').status, 1);
});
