'use strict';
// `update` against the brute-force oracle on small registries, and against hand-checked
// lockfiles everywhere (the large case is past the oracle's reach on purpose).
const test = require('node:test');
const assert = require('node:assert/strict');
const { api, reference } = require('./load.js');
const { oracle, build, keepTrap } = require('./oracle.js');

const pkg = (deps) => ({ dependencies: deps || {} });
const manifest = (deps) => ({ name: 'app', version: '1.0.0', dependencies: deps });

// The project's answer must equal both the oracle's and the hand-checked one.
function check(m, oldLock, registry, expectedVersions) {
  const expected = build(m, expectedVersions, registry);
  assert.deepStrictEqual(oracle(m, oldLock, registry), expected, 'oracle sanity');
  const got = api.update(m, oldLock, registry);
  assert.deepStrictEqual(got, expected);
  assert.equal(JSON.stringify(got), JSON.stringify(expected), 'canonical key order');
}

test('update: example 1, nothing changes and the old lockfile is re-emitted in canonical order', () => {
  const m = manifest({ a: '^1.0.0' });
  const registry = { a: { '1.0.0': pkg({ b: '^1.0.0' }) }, b: { '1.0.0': pkg() } };
  const oldLock = { lockfileVersion: 1, root: { name: 'app', version: '1.0.0', dependencies: { a: '1.0.0' } }, packages: { b: { version: '1.0.0', dependencies: {} }, a: { version: '1.0.0', dependencies: { b: '1.0.0' } } } };
  check(m, oldLock, registry, { a: '1.0.0', b: '1.0.0' });
});

test('update: example 2, a range bump moves a direct and a transitive dependency', () => {
  const registry = {
    a: { '1.0.0': pkg({ c: '^1.0.0' }), '2.0.0': pkg({ c: '^2.0.0' }) },
    b: { '1.0.0': pkg({ c: '>=1.0.0' }), '1.1.0': pkg({ c: '>=1.0.0' }) },
    c: { '1.0.0': pkg(), '2.0.0': pkg(), '2.1.0': pkg() },
  };
  const oldLock = build(manifest({ a: '^1.0.0', b: '^1.0.0' }), { a: '1.0.0', b: '1.0.0', c: '1.0.0' }, registry);
  check(manifest({ a: '^2.0.0', b: '^1.0.0' }), oldLock, registry, { a: '2.0.0', b: '1.0.0', c: '2.1.0' });
});

test('update: example 3, a removed dependency and its transitive one drop out', () => {
  const registry = { a: { '1.0.0': pkg() }, b: { '1.0.0': pkg({ d: '^1.0.0' }) }, d: { '1.0.0': pkg() } };
  const oldLock = build(manifest({ a: '^1.0.0', b: '^1.0.0' }), { a: '1.0.0', b: '1.0.0', d: '1.0.0' }, registry);
  check(manifest({ a: '^1.0.0' }), oldLock, registry, { a: '1.0.0' });
});

test('update: keep-trap, moving a kept package saves two changes (optimum 2, greedy 3)', () => {
  const t = keepTrap('');
  check(manifest(t.newDeps), build(manifest(t.oldDeps), t.oldVersions, t.registry), t.registry, t.answer);
});

test('update: block-trap, keeping the locked version makes resolution impossible (optimum 2)', () => {
  const registry = {
    k: { '1.0.0': pkg({ b: '^1.0.0' }), '1.1.0': pkg({ b: '^2.0.0' }) },
    b: { '1.0.0': pkg(), '2.0.0': pkg() },
  };
  const oldLock = build(manifest({ k: '^1.0.0', b: '^1.0.0' }), { k: '1.0.0', b: '1.0.0' }, registry);
  check(manifest({ k: '^1.0.0', b: '^2.0.0' }), oldLock, registry, { k: '1.1.0', b: '2.0.0' });
});

test('update: U2 picks the smaller changed-name list, then the higher version', () => {
  // a@2.0.0 moves x, a@2.1.0 moves y: both two changes; [a, x] < [a, y], and x takes 2.5.0.
  const registry = {
    a: { '1.0.0': pkg(), '2.0.0': pkg({ x: '^2.0.0' }), '2.1.0': pkg({ y: '^2.0.0' }) },
    x: { '1.0.0': pkg(), '2.0.0': pkg(), '2.5.0': pkg() },
    y: { '1.0.0': pkg(), '2.0.0': pkg() },
  };
  const oldLock = build(manifest({ a: '^1.0.0', x: '*', y: '*' }), { a: '1.0.0', x: '1.0.0', y: '1.0.0' }, registry);
  check(manifest({ a: '^2.0.0', x: '*', y: '*' }), oldLock, registry, { a: '2.0.0', x: '2.5.0', y: '1.0.0' });
});

test('update: a locked prerelease the range still admits is kept', () => {
  const registry = { a: { '1.0.0': pkg(), '1.1.0-beta.1': pkg(), '1.2.0': pkg() } };
  const oldLock = build(manifest({ a: '>=1.1.0-beta.1 <2.0.0' }), { a: '1.1.0-beta.1' }, registry);
  assert.equal(reference.satisfies('1.1.0-beta.1', '>=1.1.0-beta.1 <2.0.0'), true, 'reference sanity');
  check(manifest({ a: '>=1.1.0-beta.1 <2.0.0' }), oldLock, registry, { a: '1.1.0-beta.1' });
});

test('update: a two-package cycle moves both ends', () => {
  const registry = {
    a: { '1.0.0': pkg({ b: '^1.0.0' }), '2.0.0': pkg({ b: '^1.0.0' }) },
    b: { '1.0.0': pkg({ a: '^1.0.0' }), '1.1.0': pkg({ a: '^2.0.0' }) },
  };
  const oldLock = build(manifest({ a: '^1.0.0' }), { a: '1.0.0', b: '1.0.0' }, registry);
  check(manifest({ a: '^2.0.0' }), oldLock, registry, { a: '2.0.0', b: '1.1.0' });
});

test('update: a locked version missing from the registry is replaced, highest first', () => {
  const registry = { a: { '1.0.0': pkg({ b: '^1.0.0' }) }, b: { '1.0.1': pkg(), '1.1.0': pkg() } };
  const oldRegistry = { ...registry, b: { ...registry.b, '1.0.0': pkg() } };
  const m = manifest({ a: '^1.0.0' });
  check(m, build(m, { a: '1.0.0', b: '1.0.0' }, oldRegistry), registry, { a: '1.0.0', b: '1.1.0' });
});

test('update: newer versions that R1 allows are not taken (zero changes)', () => {
  const registry = { a: { '1.0.0': pkg({ b: '^1.0.0' }), '1.5.0': pkg({ b: '^1.0.0' }) }, b: { '1.0.0': pkg(), '1.2.0': pkg() } };
  const m = manifest({ a: '^1.0.0' });
  check(m, build(m, { a: '1.0.0', b: '1.0.0' }, registry), registry, { a: '1.0.0', b: '1.0.0' });
});

test('update: no answer throws ResolutionError exactly when resolve has none', () => {
  const registry = { a: { '1.0.0': pkg(), '2.0.0': pkg() } };
  const m0 = manifest({ a: '^1.0.0' });
  const m = manifest({ a: '^3.0.0' });
  const oldLock = build(m0, { a: '1.0.0' }, registry);
  assert.equal(oracle(m, oldLock, registry), null, 'oracle sanity');
  assert.throws(() => reference.resolve(m, registry), { name: 'ResolutionError' }, 'reference sanity');
  assert.throws(() => api.update(m, oldLock, registry), (e) => e.name === 'ResolutionError' && typeof e.message === 'string' && e.message.length > 0 && Array.isArray(e.conflicts) && e.conflicts.length > 0);
});

test('update: large case, four keep-traps over 16 packages, within 10 s', { timeout: 10000 }, () => {
  const traps = ['1', '2', '3', '4'].map(keepTrap);
  const merge = (key) => Object.assign({}, ...traps.map((t) => t[key]));
  const registry = merge('registry');
  const oldLock = build(manifest(merge('oldDeps')), merge('oldVersions'), registry);
  // The four small answers combined, checked by hand; the oracle cannot enumerate 16 packages.
  const expected = build(manifest(merge('newDeps')), merge('answer'), registry);
  const got = api.update(manifest(merge('newDeps')), oldLock, registry);
  assert.deepStrictEqual(got, expected);
  assert.equal(JSON.stringify(got), JSON.stringify(expected));
});
