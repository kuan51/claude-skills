'use strict';
// A small no-regression subset of the dep-resolver suite: the existing `resolve` and `check`
// behaviour must survive the new command.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root, api, oracle } = require('./load.js');

const BIN = path.join(root, 'bin', 'lockstep.js');
const run = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', cwd: root, timeout: 30000 });
const pkg = (deps) => ({ dependencies: deps || {} });

test('regression: resolve backtracks when the highest version conflicts with a sibling', () => {
  const registry = {
    a: { '1.0.0': pkg({ b: '^1.0.0' }), '1.1.0': pkg({ b: '^2.0.0' }) },
    b: { '1.0.0': pkg(), '1.5.0': pkg(), '2.0.0': pkg() },
    c: { '1.0.0': pkg({ b: '^1.0.0' }) },
  };
  const lock = api.resolve({ name: 'app', version: '1.0.0', dependencies: { a: '^1.0.0', c: '^1.0.0' } }, registry);
  assert.deepEqual(lock, oracle.resolve({ name: 'app', version: '1.0.0', dependencies: { a: '^1.0.0', c: '^1.0.0' } }, registry));
  assert.equal(lock.packages.b.version, '1.5.0');
});

test('regression: cli resolve prints the lockfile and exits 0', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lockstep-regression-'));
  const manifest = { name: 'app', version: '1.0.0', dependencies: { a: '^1.0.0' } };
  const registry = {
    a: { '1.0.0': pkg(), '1.2.0': pkg({ b: '~2.1.0' }), '2.0.0': pkg() },
    b: { '2.1.0': pkg(), '2.1.5': pkg(), '2.2.0': pkg() },
  };
  fs.writeFileSync(path.join(tmp, 'm.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(tmp, 'r.json'), JSON.stringify(registry));
  const r = run('resolve', path.join(tmp, 'm.json'), path.join(tmp, 'r.json'));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, `${JSON.stringify(oracle.resolve(manifest, registry), null, 2)}\n`);
});

test('regression: cli check prints true/false with exits 0/2, and 1 on bad input', () => {
  const yes = run('check', '1.2.3', '^1.0.0');
  assert.equal(yes.status, 0, yes.stderr);
  assert.equal(yes.stdout, 'true\n');
  const no = run('check', '2.0.0', '^1.0.0');
  assert.equal(no.status, 2, no.stderr);
  assert.equal(no.stdout, 'false\n');
  assert.equal(run('check', '1.2', '^1.0.0').status, 1);
});

test('regression: ranges other than caret-on-zero are unchanged', () => {
  for (const [v, r, want] of [['1.9.9', '^1.2.3', true], ['2.0.0', '^1.2.3', false], ['0.0.3', '^0.0.3', true], ['0.0.4', '^0.0.3', false], ['0.2.9', '~0.2.3', true], ['0.3.0', '~0.2.3', false]]) {
    assert.equal(api.satisfies(v, r), want, `${v} ${r}`);
  }
});
