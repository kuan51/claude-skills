'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { api, oracle } = require('./load.js');

// Checks R1, R2, R4 and the lockfile shape from SPEC.md section 3 against the oracle's
// `satisfies` and `compareVersions`, so the lockfile is judged by the spec, not by the
// project's own range code. Exact selections are asserted separately where the spec leaves
// only one answer.
function validate(lock, manifest, registry) {
  assert.equal(lock.lockfileVersion, 1);
  assert.deepEqual(Object.keys(lock).sort(), ['lockfileVersion', 'packages', 'root']);
  assert.equal(lock.root.name, manifest.name);
  assert.equal(lock.root.version, manifest.version);
  const rootDeps = manifest.dependencies || {};
  assert.deepEqual(Object.keys(lock.root.dependencies), Object.keys(rootDeps).sort(), 'root.dependencies keys are the manifest dependencies, sorted');
  assert.deepEqual(Object.keys(lock.packages), Object.keys(lock.packages).slice().sort(), 'packages keys are sorted');

  const selectedVersion = (name) => lock.packages[name] && lock.packages[name].version;
  const edges = [];
  for (const [dep, range] of Object.entries(rootDeps)) edges.push({ from: 'root', dep, range });
  for (const [name, entry] of Object.entries(lock.packages)) {
    assert.ok(registry[name] && registry[name][entry.version], `${name}@${entry.version} exists in the registry`);
    const declared = (registry[name][entry.version].dependencies) || {};
    assert.deepEqual(Object.keys(entry.dependencies), Object.keys(declared).sort(), `${name}: dependencies keys are the declared ones, sorted`);
    for (const [dep, range] of Object.entries(declared)) edges.push({ from: `${name}@${entry.version}`, dep, range });
  }
  // R1
  for (const e of edges) {
    const v = selectedVersion(e.dep);
    assert.ok(v, `${e.from} needs ${e.dep}, which is selected`);
    assert.equal(oracle.satisfies(v, e.range), true, `${e.dep}@${v} satisfies ${e.range} required by ${e.from}`);
    const recorded = e.from === 'root' ? lock.root.dependencies[e.dep] : lock.packages[e.from.split('@')[0]].dependencies[e.dep];
    assert.equal(recorded, v, `${e.from} records ${e.dep} as ${v}`);
  }
  // R2
  const reachable = new Set();
  const stack = Object.keys(rootDeps);
  while (stack.length) {
    const n = stack.pop();
    if (reachable.has(n)) continue;
    reachable.add(n);
    stack.push(...Object.keys(lock.packages[n].dependencies));
  }
  assert.deepEqual(Object.keys(lock.packages).sort(), [...reachable].sort(), 'every selected package is reachable from the root');
  // R4
  for (const [name, entry] of Object.entries(lock.packages)) {
    const placed = edges.filter((e) => e.dep === name).map((e) => e.range);
    for (const candidate of Object.keys(registry[name])) {
      if (oracle.compareVersions(candidate, entry.version) <= 0) continue;
      const fits = placed.every((r) => oracle.satisfies(candidate, r));
      const depsOk = Object.entries((registry[name][candidate].dependencies) || {}).every(([d, r]) => selectedVersion(d) && oracle.satisfies(selectedVersion(d), r));
      assert.ok(!(fits && depsOk), `${name}@${candidate} could replace ${entry.version} with no other change`);
    }
  }
}

const pkg = (deps) => ({ dependencies: deps || {} });
const manifest = (deps) => ({ name: 'app', version: '1.0.0', dependencies: deps });

test('resolver: picks the highest versions along a chain', () => {
  const registry = {
    a: { '1.0.0': pkg(), '1.1.0': pkg(), '1.2.0': pkg({ b: '~2.1.0' }), '2.0.0': pkg() },
    b: { '2.1.0': pkg(), '2.1.5': pkg(), '2.2.0': pkg() },
  };
  const m = manifest({ a: '^1.0.0' });
  const lock = api.resolve(m, registry);
  validate(lock, m, registry);
  assert.deepEqual(lock, {
    lockfileVersion: 1,
    root: { name: 'app', version: '1.0.0', dependencies: { a: '1.2.0' } },
    packages: { a: { version: '1.2.0', dependencies: { b: '2.1.5' } }, b: { version: '2.1.5', dependencies: {} } },
  });
});

test('resolver: an empty dependency list gives an empty lockfile', () => {
  const m = { name: 'solo', version: '2.3.4' };
  const lock = api.resolve(m, {});
  validate(lock, m, {});
  assert.deepEqual(lock, { lockfileVersion: 1, root: { name: 'solo', version: '2.3.4', dependencies: {} }, packages: {} });
});

test('resolver: a diamond shares one version that satisfies both parents', () => {
  const registry = {
    a: { '1.0.0': pkg({ c: '^1.0.0' }) },
    b: { '1.0.0': pkg({ c: '>=1.2.0 <1.5.0' }) },
    c: { '1.0.0': pkg(), '1.2.0': pkg(), '1.4.0': pkg(), '1.6.0': pkg() },
  };
  const m = manifest({ a: '^1.0.0', b: '^1.0.0' });
  const lock = api.resolve(m, registry);
  validate(lock, m, registry);
  assert.equal(lock.packages.c.version, '1.4.0');
});

test('resolver: backtracks when the highest version conflicts with a sibling', () => {
  const registry = {
    a: { '1.0.0': pkg({ b: '^1.0.0' }), '1.1.0': pkg({ b: '^2.0.0' }) },
    b: { '1.0.0': pkg(), '1.5.0': pkg(), '2.0.0': pkg() },
    c: { '1.0.0': pkg({ b: '^1.0.0' }) },
  };
  const m = manifest({ a: '^1.0.0', c: '^1.0.0' });
  const lock = api.resolve(m, registry);
  validate(lock, m, registry);
  assert.equal(lock.packages.a.version, '1.0.0');
  assert.equal(lock.packages.b.version, '1.5.0');
  assert.equal(lock.packages.c.version, '1.0.0');
});

test('resolver: backtracks through two levels of candidates', () => {
  const registry = {
    a: { '1.0.0': pkg({ b: '^1.0.0' }), '1.1.0': pkg({ b: '^2.0.0' }), '1.2.0': pkg({ b: '^3.0.0' }) },
    b: { '1.0.0': pkg({ c: '^1.0.0' }), '2.0.0': pkg({ c: '^2.0.0' }), '3.0.0': pkg({ c: '^3.0.0' }) },
    c: { '1.0.0': pkg(), '2.0.0': pkg(), '3.0.0': pkg() },
    d: { '1.0.0': pkg({ c: '^1.0.0' }) },
  };
  const m = manifest({ a: '^1.0.0', d: '^1.0.0' });
  const lock = api.resolve(m, registry);
  validate(lock, m, registry);
  assert.deepEqual(Object.fromEntries(Object.entries(lock.packages).map(([k, v]) => [k, v.version])), { a: '1.0.0', b: '1.0.0', c: '1.0.0', d: '1.0.0' });
});

test('resolver: a lower version avoids a dependency that cannot be met', () => {
  const registry = {
    a: { '1.0.0': pkg(), '1.1.0': pkg({ zzz: '^1.0.0' }) },
  };
  const m = manifest({ a: '^1.0.0' });
  const lock = api.resolve(m, registry);
  validate(lock, m, registry);
  assert.equal(lock.packages.a.version, '1.0.0');
  assert.equal(lock.packages.zzz, undefined);
});

test('resolver: packages not required by anything are left out', () => {
  const registry = {
    a: { '1.0.0': pkg() },
    unused: { '9.9.9': pkg() },
  };
  const m = manifest({ a: '*' });
  const lock = api.resolve(m, registry);
  validate(lock, m, registry);
  assert.deepEqual(Object.keys(lock.packages), ['a']);
});

test('resolver: a dependency cycle resolves and records both edges', () => {
  const registry = {
    a: { '1.0.0': pkg({ b: '^1.0.0' }) },
    b: { '1.0.0': pkg({ a: '^1.0.0' }) },
  };
  const m = manifest({ a: '^1.0.0' });
  const lock = api.resolve(m, registry);
  validate(lock, m, registry);
  assert.deepEqual(lock.packages, { a: { version: '1.0.0', dependencies: { b: '1.0.0' } }, b: { version: '1.0.0', dependencies: { a: '1.0.0' } } });
});

test('resolver: prereleases are chosen only where the range admits them', () => {
  const registry = { a: { '1.0.0': pkg(), '1.1.0-beta.1': pkg() } };
  const m1 = manifest({ a: '^1.0.0' });
  const l1 = api.resolve(m1, registry);
  validate(l1, m1, registry);
  assert.equal(l1.packages.a.version, '1.0.0');

  const m2 = manifest({ a: '^1.1.0-beta.0' });
  const l2 = api.resolve(m2, registry);
  validate(l2, m2, registry);
  assert.equal(l2.packages.a.version, '1.1.0-beta.1');

  const registry3 = { a: { '1.0.0': pkg(), '1.1.0-beta.1': pkg(), '1.2.0': pkg() } };
  const l3 = api.resolve(m2, registry3);
  validate(l3, m2, registry3);
  assert.equal(l3.packages.a.version, '1.2.0');
});

test('resolver: any locally maximal solution is accepted when several exist', () => {
  const registry = {
    a: { '1.0.0': pkg(), '2.0.0': pkg({ b: '<1.5.0' }) },
    b: { '1.0.0': pkg(), '1.5.0': pkg(), '2.0.0': pkg() },
  };
  const m = manifest({ a: '*', b: '*' });
  const lock = api.resolve(m, registry);
  validate(lock, m, registry);
});

test('resolver: the same inputs give a deep-equal lockfile', () => {
  const registry = {
    a: { '1.0.0': pkg({ b: '^1.0.0' }), '1.1.0': pkg({ b: '^2.0.0' }) },
    b: { '1.0.0': pkg(), '1.5.0': pkg(), '2.0.0': pkg() },
    c: { '1.0.0': pkg({ b: '^1.0.0' }) },
  };
  const m = manifest({ c: '^1.0.0', a: '^1.0.0' });
  assert.deepEqual(api.resolve(m, registry), api.resolve(m, registry));
  assert.deepEqual(Object.keys(api.resolve(m, registry).root.dependencies), ['a', 'c']);
});

test('resolver: a conflict throws ResolutionError naming the contested package', () => {
  const registry = {
    a: { '1.0.0': pkg({ c: '^1.0.0' }) },
    b: { '1.0.0': pkg({ c: '^2.0.0' }) },
    c: { '1.0.0': pkg(), '2.0.0': pkg() },
  };
  const m = manifest({ a: '^1.0.0', b: '^1.0.0' });
  let err = null;
  try { api.resolve(m, registry); } catch (e) { err = e; }
  assert.ok(err instanceof Error, 'throws an Error');
  assert.ok(err instanceof api.ResolutionError, 'throws the exported ResolutionError');
  assert.equal(err.name, 'ResolutionError');
  assert.ok(typeof err.message === 'string' && err.message.length > 0);
  assert.ok(Array.isArray(err.conflicts) && err.conflicts.length >= 1);
  const c = err.conflicts.find((x) => x.name === 'c');
  assert.ok(c, 'names c');
  assert.ok(c.requirements.length >= 1);
  for (const r of c.requirements) {
    assert.ok(['a@1.0.0', 'b@1.0.0'].includes(r.from), `from is a real edge, got ${r.from}`);
    assert.ok(['^1.0.0', '^2.0.0'].includes(r.range), `range is quoted as written, got ${r.range}`);
  }
});

test('resolver: a conflict met through an already-selected package names that package', () => {
  const registry = {
    a: { '1.0.0': pkg(), '1.2.0': pkg({ b: '~2.1.0' }), '2.0.0': pkg() },
    b: { '2.1.0': pkg(), '2.1.5': pkg(), '2.2.0': pkg() },
    x: { '1.0.0': pkg({ b: '^3.0.0' }) },
  };
  let err = null;
  try { api.resolve(manifest({ a: '^1.2.0', x: '*' }), registry); } catch (e) { err = e; }
  assert.ok(err instanceof api.ResolutionError, `expected ResolutionError, got ${err && err.constructor.name}: ${err && err.message}`);
  const c = err.conflicts.find((k) => k.name === 'b');
  assert.ok(c, `names b, whose requirements could not be met together; got ${JSON.stringify(err.conflicts)}`);
  assert.ok(c.requirements.length >= 1);
  for (const r of c.requirements) {
    assert.ok((r.from === 'a@1.2.0' && r.range === '~2.1.0') || (r.from === 'x@1.0.0' && r.range === '^3.0.0'), `real edge on b, got ${JSON.stringify(r)}`);
  }
});

test('resolver: a package missing from the registry is a ResolutionError from root', () => {
  let err = null;
  try { api.resolve(manifest({ nope: '^1.0.0' }), { a: { '1.0.0': pkg() } }); } catch (e) { err = e; }
  assert.ok(err instanceof api.ResolutionError);
  const c = err.conflicts.find((x) => x.name === 'nope');
  assert.ok(c, 'names the missing package');
  assert.deepEqual(c.requirements, [{ from: 'root', range: '^1.0.0' }]);
});

test('resolver: no candidate version at all is a ResolutionError, not a crash', () => {
  const registry = { a: { '2.0.0': pkg(), '2.5.0': pkg() }, empty: {} };
  let err = null;
  try { api.resolve(manifest({ a: '^1.0.0' }), registry); } catch (e) { err = e; }
  assert.ok(err instanceof api.ResolutionError);
  assert.equal(err.conflicts[0].name, 'a');
  err = null;
  try { api.resolve(manifest({ empty: '*' }), registry); } catch (e) { err = e; }
  assert.ok(err instanceof api.ResolutionError);
  assert.equal(err.conflicts[0].name, 'empty');
});

test('resolver: an invalid range or version in the inputs is a TypeError', () => {
  assert.throws(() => api.resolve(manifest({ a: '>>1' }), { a: { '1.0.0': pkg() } }), TypeError);
  assert.throws(() => api.resolve(manifest({ a: '^1.0.0' }), { a: { '1.0': pkg() } }), TypeError);
  assert.throws(() => api.resolve({ name: 'app', version: 'v1', dependencies: {} }, {}), TypeError);
});
