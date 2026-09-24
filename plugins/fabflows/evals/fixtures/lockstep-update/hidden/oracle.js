'use strict';
// Brute-force oracle for `update`: every registry package takes one of its versions or is
// absent; keep the selections that satisfy R1 (reference `satisfies`, which also carries R5) and
// R2 (reachability is checked, not assumed); count U1 changes against the old lockfile; apply
// U2. Exponential on purpose, so it refuses registries past 6 packages of 5 versions.
const { reference } = require('./load.js');

// The canonical lockfile for a manifest and a name -> version selection.
function build(manifest, versions, registry) {
  const deps = (name) => (registry[name][versions[name]] && registry[name][versions[name]].dependencies) || {};
  const pick = (obj) => Object.fromEntries(Object.keys(obj).sort().map((d) => [d, versions[d]]));
  const packages = {};
  for (const name of Object.keys(versions).sort()) packages[name] = { version: versions[name], dependencies: pick(deps(name)) };
  return { lockfileVersion: 1, root: { name: manifest.name, version: manifest.version, dependencies: pick(manifest.dependencies || {}) }, packages };
}

// U2 over two U1-equal changed lists of [name, version], sorted by name: negative if a wins.
function compareChanged(a, b) {
  if (a.length !== b.length) return a.length - b.length;
  for (let i = 0; i < a.length; i++) if (a[i][0] !== b[i][0]) return a[i][0] < b[i][0] ? -1 : 1;
  for (let i = 0; i < a.length; i++) {
    const c = reference.compareVersions(a[i][1], b[i][1]);
    if (c) return -c;
  }
  return 0;
}

// Returns the expected lockfile, or null when no selection exists (U3).
function oracle(manifest, lockfile, registry) {
  const names = Object.keys(registry).sort();
  if (names.length > 6 || names.some((n) => Object.keys(registry[n]).length > 5)) throw new Error('oracle: registry too large to enumerate');
  const old = Object.fromEntries(Object.entries(lockfile.packages).map(([n, e]) => [n, e.version]));
  const rootDeps = manifest.dependencies || {};
  const deps = (n, v) => (registry[n][v] && registry[n][v].dependencies) || {};
  const sel = {};
  let best = null;
  let bestChanged = null;

  const edgesHold = (from) => Object.entries(from).every(([d, r]) => sel[d] !== undefined && reference.satisfies(sel[d], r));
  function evaluate() {
    if (!edgesHold(rootDeps)) return;
    for (const n of Object.keys(sel)) if (!edgesHold(deps(n, sel[n]))) return;
    const reached = new Set();
    const stack = Object.keys(rootDeps);
    while (stack.length) {
      const n = stack.pop();
      if (reached.has(n)) continue;
      reached.add(n);
      stack.push(...Object.keys(deps(n, sel[n])));
    }
    if (reached.size !== Object.keys(sel).length) return;
    const changed = Object.keys(sel).sort().filter((n) => old[n] !== sel[n]).map((n) => [n, sel[n]]);
    if (!best || compareChanged(changed, bestChanged) < 0) {
      best = { ...sel };
      bestChanged = changed;
    }
  }
  (function rec(i) {
    if (i === names.length) return evaluate();
    rec(i + 1);
    for (const v of Object.keys(registry[names[i]])) {
      sel[names[i]] = v;
      rec(i + 1);
      delete sel[names[i]];
    }
  })(0);
  return best && build(manifest, best, registry);
}

const pkg = (deps) => ({ dependencies: deps || {} });

// The keep-trap under names suffixed with s; the large case glues four copies together.
function keepTrap(s) {
  const registry = {
    [`k${s}`]: { '1.0.0': pkg({ [`b${s}`]: '<3.0.0' }), '1.1.0': pkg({ [`b${s}`]: '*' }) },
    [`b${s}`]: { '1.0.0': pkg({ [`c${s}`]: '^1.0.0', [`e${s}`]: '^1.0.0' }), '2.0.0': pkg({ [`c${s}`]: '^2.0.0', [`e${s}`]: '^2.0.0' }), '3.0.0': pkg({ [`c${s}`]: '^1.0.0', [`e${s}`]: '^1.0.0' }) },
    [`c${s}`]: { '1.0.0': pkg(), '2.0.0': pkg() },
    [`e${s}`]: { '1.0.0': pkg(), '2.0.0': pkg() },
  };
  return {
    registry,
    oldDeps: { [`k${s}`]: '^1.0.0', [`b${s}`]: '^1.0.0' },
    newDeps: { [`k${s}`]: '^1.0.0', [`b${s}`]: '>=2.0.0' },
    oldVersions: { [`k${s}`]: '1.0.0', [`b${s}`]: '1.0.0', [`c${s}`]: '1.0.0', [`e${s}`]: '1.0.0' },
    // Keeping k forces b@2.0.0 and moves c and e (3 changes); moving k lets b@3.0.0 keep both (2).
    answer: { [`k${s}`]: '1.1.0', [`b${s}`]: '3.0.0', [`c${s}`]: '1.0.0', [`e${s}`]: '1.0.0' },
  };
}
module.exports = { oracle, build, keepTrap };
