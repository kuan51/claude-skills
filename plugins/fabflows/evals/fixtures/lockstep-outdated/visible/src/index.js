'use strict';
// Semver parsing, range matching and the flat resolver behind the lockstep CLI.

const IDENT = /^[0-9A-Za-z-]+$/;
const NUMERIC = /^\d+$/;
const NO_LEADING_ZERO = /^(0|[1-9]\d*)$/;
const CORE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;

function identifiers(text, allowLeadingZero) {
  const ids = text.split('.');
  for (const id of ids) {
    if (!IDENT.test(id)) throw new TypeError(`invalid identifier "${id}"`);
    if (!allowLeadingZero && NUMERIC.test(id) && !NO_LEADING_ZERO.test(id)) throw new TypeError(`numeric identifier "${id}" has a leading zero`);
  }
  return ids;
}

function parseVersion(input) {
  if (input && typeof input === 'object' && typeof input.major === 'number') return input;
  if (typeof input !== 'string') throw new TypeError(`version must be a string, got ${typeof input}`);
  const m = CORE.exec(input);
  if (!m) throw new TypeError(`invalid version "${input}"`);
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] === undefined ? [] : identifiers(m[4], false),
    build: m[5] === undefined ? [] : identifiers(m[5], true),
  };
}

function compareIdentifiers(a, b) {
  const an = NUMERIC.test(a);
  const bn = NUMERIC.test(b);
  if (an && bn) return Math.sign(Number(a) - Number(b));
  if (an) return -1;
  if (bn) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  for (const k of ['major', 'minor', 'patch']) if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1;
  if (x.prerelease.length && !y.prerelease.length) return -1;
  if (!x.prerelease.length && y.prerelease.length) return 1;
  const n = Math.min(x.prerelease.length, y.prerelease.length);
  for (let i = 0; i < n; i++) {
    const c = compareIdentifiers(x.prerelease[i], y.prerelease[i]);
    if (c) return c;
  }
  return Math.sign(x.prerelease.length - y.prerelease.length);
}

// ---- ranges ---------------------------------------------------------------------------------

const PARTIAL = /^([xX*]|0|[1-9]\d*)(?:\.([xX*]|0|[1-9]\d*)(?:\.([xX*]|0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?)?)?$/;
const isX = (c) => c === undefined || /^[xX*]$/.test(c);

function parsePartial(text) {
  const m = PARTIAL.exec(text);
  if (!m) throw new TypeError(`invalid range component "${text}"`);
  const major = isX(m[1]) ? null : Number(m[1]);
  const minor = isX(m[2]) ? null : Number(m[2]);
  const patch = isX(m[3]) ? null : Number(m[3]);
  if ((major === null && (minor !== null || patch !== null)) || (minor === null && patch !== null)) throw new TypeError(`wildcard must be trailing in "${text}"`);
  if ((m[4] !== undefined || m[5] !== undefined) && patch === null) throw new TypeError(`prerelease or build on a wildcard partial "${text}"`);
  if (m[5] !== undefined) identifiers(m[5], true);
  return { major, minor, patch, prerelease: m[4] === undefined ? [] : identifiers(m[4], false) };
}

const V = (major, minor, patch, prerelease = []) => ({ major, minor, patch, prerelease, build: [] });
const ge = (v) => ({ op: '>=', v });
const gt = (v) => ({ op: '>', v });
const lt = (v) => ({ op: '<', v });
const le = (v) => ({ op: '<=', v });
const eq = (v) => ({ op: '=', v });
const ANY = [ge(V(0, 0, 0))];

function caret(p) {
  if (p.major === null) return ANY;
  if (p.minor === null) return [ge(V(p.major, 0, 0)), lt(V(p.major + 1, 0, 0))];
  if (p.patch === null) {
    if (p.major === 0) return [ge(V(0, p.minor, 0)), lt(V(0, p.minor + 1, 0))];
    return [ge(V(p.major, p.minor, 0)), lt(V(p.major + 1, 0, 0))];
  }
  const lo = V(p.major, p.minor, p.patch, p.prerelease);
  if (p.major > 0) return [ge(lo), lt(V(p.major + 1, 0, 0))];
  if (p.minor > 0) return [ge(lo), lt(V(1, 0, 0))];
  return [ge(lo), lt(V(0, 0, p.patch + 1))];
}

function tilde(p) {
  if (p.major === null) return ANY;
  if (p.minor === null) return [ge(V(p.major, 0, 0)), lt(V(p.major + 1, 0, 0))];
  return [ge(V(p.major, p.minor, p.patch === null ? 0 : p.patch, p.prerelease)), lt(V(p.major, p.minor + 1, 0))];
}

function comparator(text) {
  const m = /^(>=|<=|>|<|=|\^|~)?(.*)$/.exec(text);
  const op = m[1] || '=';
  if (!m[2]) throw new TypeError(`operator without a version in "${text}"`);
  const p = parsePartial(m[2]);
  if (op === '^') return caret(p);
  if (op === '~') return tilde(p);
  if (p.major === null) return ANY;
  const lo = V(p.major, p.minor === null ? 0 : p.minor, p.patch === null ? 0 : p.patch, p.prerelease);
  if (p.patch !== null) return [op === '=' ? eq(lo) : op === '>' ? gt(lo) : op === '<' ? lt(lo) : op === '>=' ? ge(lo) : le(lo)];
  const hi = p.minor === null ? V(p.major + 1, 0, 0) : V(p.major, p.minor + 1, 0);
  switch (op) {
    case '=': return [ge(lo), lt(hi)];
    case '>=': return [ge(lo)];
    case '<': return [lt(lo)];
    case '>': return [ge(hi)];
    default: return [lt(hi)]; // <=
  }
}

function hyphen(a, b) {
  const A = parsePartial(a);
  const B = parsePartial(b);
  const out = [];
  if (A.major !== null) out.push(ge(V(A.major, A.minor === null ? 0 : A.minor, A.patch === null ? 0 : A.patch, A.prerelease)));
  else out.push(ge(V(0, 0, 0)));
  if (B.major === null) return out;
  if (B.minor === null) out.push(lt(V(B.major + 1, 0, 0)));
  else if (B.patch === null) out.push(lt(V(B.major, B.minor + 1, 0)));
  else out.push(le(V(B.major, B.minor, B.patch, B.prerelease)));
  return out;
}

function parseSet(text) {
  if (text === '' || /^[xX*]$/.test(text)) return ANY;
  const hy = /^(\S+) - (\S+)$/.exec(text);
  if (hy) return hyphen(hy[1], hy[2]);
  const comps = [];
  for (const part of text.split(/\s+/)) comps.push(...comparator(part));
  return comps;
}

function parseRange(text) {
  if (text && typeof text === 'object' && Array.isArray(text.sets)) return text;
  if (typeof text !== 'string') throw new TypeError(`range must be a string, got ${typeof text}`);
  return { raw: text, sets: text.split('||').map((s) => parseSet(s.trim())) };
}

function holds(v, c) {
  const d = compareVersions(v, c.v);
  switch (c.op) {
    case '=': return d === 0;
    case '<': return d < 0;
    case '<=': return d <= 0;
    case '>': return d > 0;
    default: return d >= 0;
  }
}

function setSatisfies(v, set) {
  if (!set.every((c) => holds(v, c))) return false;
  if (!v.prerelease.length) return true;
  return set.some((c) => c.v.prerelease.length && c.v.major === v.major && c.v.minor === v.minor && c.v.patch === v.patch);
}

function satisfies(version, range) {
  const v = parseVersion(version);
  const r = parseRange(range);
  return r.sets.some((set) => setSatisfies(v, set));
}

function maxSatisfying(versions, range) {
  const r = parseRange(range);
  let best = null;
  for (const s of versions) {
    if (typeof s !== 'string') throw new TypeError('maxSatisfying takes version strings');
    parseVersion(s);
    if (satisfies(s, r) && (best === null || compareVersions(s, best) > 0)) best = s;
  }
  return best;
}

// ---- resolution -----------------------------------------------------------------------------

class ResolutionError extends Error {
  constructor(message, conflicts) {
    super(message);
    this.name = 'ResolutionError';
    this.conflicts = conflicts;
  }
}

const sortedKeys = (o) => Object.keys(o || {}).sort();

function resolve(manifest, registry) {
  if (!manifest || typeof manifest.name !== 'string') throw new TypeError('manifest.name must be a string');
  parseVersion(manifest.version);
  if (!registry || typeof registry !== 'object') throw new TypeError('registry must be an object');
  const rootDeps = manifest.dependencies || {};
  for (const range of Object.values(rootDeps)) parseRange(range);
  for (const versions of Object.values(registry)) {
    for (const [version, entry] of Object.entries(versions)) {
      parseVersion(version);
      for (const range of Object.values((entry && entry.dependencies) || {})) parseRange(range);
    }
  }

  const depsOf = (name, version) => (registry[name][version] && registry[name][version].dependencies) || {};
  const candidatesOf = (name) => Object.keys(registry[name] || {}).sort((a, b) => compareVersions(b, a));
  const selected = new Map();
  const deadEnds = new Map();

  function requirementsOn(name) {
    const reqs = [];
    if (Object.prototype.hasOwnProperty.call(rootDeps, name)) reqs.push({ from: 'root', range: rootDeps[name] });
    for (const [p, v] of selected) {
      const d = depsOf(p, v);
      if (Object.prototype.hasOwnProperty.call(d, name)) reqs.push({ from: `${p}@${v}`, range: d[name] });
    }
    return reqs;
  }

  function solve(pending) {
    if (!pending.length) return true;
    const [name, ...rest] = pending;
    const reqs = requirementsOn(name);
    const cands = candidatesOf(name).filter((v) => reqs.every((r) => satisfies(v, r.range)));
    if (!cands.length) {
      if (!deadEnds.has(name)) deadEnds.set(name, reqs);
      return false;
    }
    for (const v of cands) {
      selected.set(name, v);
      let ok = true;
      const add = [];
      for (const [q, range] of Object.entries(depsOf(name, v))) {
        if (selected.has(q)) {
          if (!satisfies(selected.get(q), range)) {
            // The conflict is on q: its selected version cannot meet the requirement this
            // candidate adds. requirementsOn(q) already includes that edge, since name is
            // selected at this point.
            if (!deadEnds.has(q)) deadEnds.set(q, requirementsOn(q));
            ok = false;
            break;
          }
        } else add.push(q);
      }
      if (ok && solve([...new Set([...rest, ...add])].sort())) return true;
      selected.delete(name);
    }
    return false;
  }

  if (!solve(sortedKeys(rootDeps))) {
    const conflicts = [...deadEnds].map(([name, requirements]) => ({ name, requirements }));
    const first = conflicts[0];
    throw new ResolutionError(`cannot resolve ${first.name}: ${first.requirements.map((r) => `${r.range} (from ${r.from})`).join(', ')}`, conflicts);
  }

  const packages = {};
  for (const name of [...selected.keys()].sort()) {
    const version = selected.get(name);
    const dependencies = {};
    for (const dep of sortedKeys(depsOf(name, version))) dependencies[dep] = selected.get(dep);
    packages[name] = { version, dependencies };
  }
  const rootLock = {};
  for (const dep of sortedKeys(rootDeps)) rootLock[dep] = selected.get(dep);
  return { lockfileVersion: 1, root: { name: manifest.name, version: manifest.version, dependencies: rootLock }, packages };
}

module.exports = { parseVersion, compareVersions, parseRange, satisfies, maxSatisfying, resolve, ResolutionError };
