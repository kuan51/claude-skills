'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { listFrameworks, validateFramework } = require('../skills/_shared/frameworks.js');

const PLUGIN_ROOT = path.join(__dirname, '..');
const BUNDLED = path.join(PLUGIN_ROOT, 'frameworks');
const SCRIPT = path.join(PLUGIN_ROOT, 'skills', '_shared', 'frameworks.js');
const EXAMPLE = path.join(__dirname, 'fixtures', 'frameworks', 'example');

const bundledDirs = fs.readdirSync(BUNDLED, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => path.join(BUNDLED, e.name));

function run(...args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
}

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ciso-frameworks-'));
}

// A fresh copy of the example fixture under <root>/<name>/, for a test to break one thing in.
function copyExample(root, name) {
  const dir = path.join(root || tmp(), name || 'example');
  fs.cpSync(EXAMPLE, dir, { recursive: true });
  return dir;
}

function editJson(file, fn) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  fn(data);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const STRUCTURE = 'core.v1.structure.json';

test('every bundled framework validates with --bundled', () => {
  assert.ok(bundledDirs.length >= 4, 'expected the four bundled frameworks');
  for (const dir of bundledDirs) {
    const r = run('validate', dir, '--bundled');
    assert.equal(r.status, 0, `${dir}: ${r.stderr}`);
    assert.equal(r.stdout.trim(), 'ok');
  }
});

test('the example fixture validates as a project framework', () => {
  assert.deepEqual(validateFramework(EXAMPLE, 'project'), []);
  const r = run('validate', EXAMPLE);
  assert.equal(r.status, 0, r.stderr);
});

test('every bundled framework has a non-empty ground-rules.md, from the folder listing', () => {
  for (const dir of bundledDirs) {
    const rules = path.join(dir, 'ground-rules.md');
    assert.ok(fs.existsSync(rules), `${rules} is missing`);
    assert.ok(fs.readFileSync(rules, 'utf8').trim().length > 0, `${rules} is empty`);
  }
});

test('no SKILL.md under frameworks/ -- frameworks are dispatched into, not invoked', () => {
  const found = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name === 'SKILL.md') found.push(full);
    }
  })(BUNDLED);
  assert.deepEqual(found, []);
});

// One broken fixture per validation error. Each starts from a valid copy of the example and breaks
// exactly one thing, so a passing case proves that check, not some other one.
const ERROR_CASES = [
  ['missing ground-rules.md', (dir) => fs.rmSync(path.join(dir, 'ground-rules.md')), /ground-rules\.md is missing/],
  ['certKey not equal to folder', (dir) => editJson(path.join(dir, 'framework.json'), (f) => { f.certKey = 'other'; }), /must equal the folder name/],
  ['undeclared structure file', (dir) => fs.copyFileSync(path.join(dir, STRUCTURE), path.join(dir, 'extra.v1.structure.json')), /tier "extra" is not declared/],
  ['declared tier with no file', (dir) => editJson(path.join(dir, 'framework.json'), (f) => { f.tiers.push('plus'); }), /tier "plus" is declared but has no/],
  ['filename not matching tier/version', (dir) => editJson(path.join(dir, STRUCTURE), (s) => { s.controlSetVersion = 'v2'; }), /filename must be/],
  ['unknown sourceAuthority', (dir) => editJson(path.join(dir, STRUCTURE), (s) => { s.sourceAuthority = 'made-up'; }), /sourceAuthority "made-up"/],
  ['duplicate id', (dir) => editJson(path.join(dir, STRUCTURE), (s) => { s.controls[1].id = s.controls[0].id; }), /duplicate id "EX-AC-1"/],
  ['__proto__ id', (dir) => {
    const file = path.join(dir, STRUCTURE);
    // JSON.stringify drops a __proto__ key set through assignment, so write the text directly.
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('"EX-AC-1"', '"__proto__"'));
  }, /id "__proto__" is not allowed/],
  ['missing required field', (dir) => editJson(path.join(dir, STRUCTURE), (s) => { delete s.controls[0].topicSummary; }), /topicSummary must be a non-empty string/],
  ['a STATE_ONLY_FIELDS field', (dir) => editJson(path.join(dir, STRUCTURE), (s) => { s.controls[0].assessment = { status: 'met' }; }), /"assessment" is a field ciso state owns/],
  ['structure tier not declared, though the filename prefix is', (dir) => {
    editJson(path.join(dir, STRUCTURE), (s) => { s.tier = 'core.v1'; });
    fs.renameSync(path.join(dir, STRUCTURE), path.join(dir, 'core.v1.v1.structure.json'));
  }, /tier "core\.v1" must be a string matching/],
  ['structure with no tier field', (dir) => {
    editJson(path.join(dir, 'framework.json'), (f) => { f.tiers = ['undefined']; });
    editJson(path.join(dir, STRUCTURE), (s) => { delete s.tier; });
    fs.renameSync(path.join(dir, STRUCTURE), path.join(dir, 'undefined.v1.structure.json'));
  }, /tier "undefined" must be a string matching/],
  ['control id with shell characters', (dir) => editJson(path.join(dir, STRUCTURE), (s) => { s.controls[0].id = 'EX $(id)'; }), /id "EX \$\(id\)" must match/],
  ['domainKey with a space', (dir) => editJson(path.join(dir, STRUCTURE), (s) => { s.controls[0].domainKey = 'Access Control'; }), /domainKey "Access Control" must match/],
  ['domainKey constructor', (dir) => editJson(path.join(dir, STRUCTURE), (s) => { s.controls[0].domainKey = 'constructor'; }), /domainKey "constructor" is not allowed/],
  ['domainKey __proto__', (dir) => editJson(path.join(dir, STRUCTURE), (s) => { s.controls[0].domainKey = '__proto__'; }), /domainKey "__proto__" is not allowed/],
  // Any name Object.prototype carries breaks the plain-object grouping in render-dashboard.js.
  ['domainKey toString', (dir) => editJson(path.join(dir, STRUCTURE), (s) => { s.controls[0].domainKey = 'toString'; }), /domainKey "toString" is not allowed/],
  ['domainKey valueOf', (dir) => editJson(path.join(dir, STRUCTURE), (s) => { s.controls[0].domainKey = 'valueOf'; }), /domainKey "valueOf" is not allowed/],
  ['id hasOwnProperty', (dir) => editJson(path.join(dir, STRUCTURE), (s) => { s.controls[0].id = 'hasOwnProperty'; }), /id "hasOwnProperty" is not allowed/],
  ['certKey constructor', (dir) => editJson(path.join(dir, 'framework.json'), (f) => { f.certKey = 'constructor'; }), /certKey "constructor" is not allowed/],
  ['declared tier constructor', (dir) => editJson(path.join(dir, 'framework.json'), (f) => { f.tiers.push('constructor'); }), /tier "constructor" is not allowed/],
  ['declared tier constructor with no file', (dir) => editJson(path.join(dir, 'framework.json'), (f) => { f.tiers.push('constructor'); }), /tier "constructor" is declared but has no/],
  ['structure tier constructor', (dir) => {
    editJson(path.join(dir, 'framework.json'), (f) => { f.tiers = ['constructor']; });
    editJson(path.join(dir, STRUCTURE), (s) => { s.tier = 'constructor'; });
    fs.renameSync(path.join(dir, STRUCTURE), path.join(dir, 'constructor.v1.structure.json'));
  }, /constructor\.v1\.structure\.json: tier "constructor" is not allowed/],
  ['displayName with $(...)', (dir) => editJson(path.join(dir, 'framework.json'), (f) => { f.displayName = 'X $(id)'; }), /displayName may not contain/],
  ['project flows/', (dir) => { fs.mkdirSync(path.join(dir, 'flows')); fs.writeFileSync(path.join(dir, 'flows', 'interview.md'), 'run this'); }, /flows\/ is not allowed/],
];

for (const [name, breakIt, expected] of ERROR_CASES) {
  test(`validate rejects: ${name}`, () => {
    const dir = copyExample();
    breakIt(dir);
    const errors = validateFramework(dir, 'project');
    assert.ok(errors.some((m) => expected.test(m)), `expected ${expected}, got ${JSON.stringify(errors)}`);
    const r = run('validate', dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, expected);
  });
}

test('validate rejects: a bundled tier declared imported (and allows it in a project)', () => {
  const dir = copyExample();
  editJson(path.join(dir, STRUCTURE), (s) => { s.sourceAuthority = 'imported'; });
  assert.deepEqual(validateFramework(dir, 'project'), []);
  const r = run('validate', dir, '--bundled');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /a bundled tier may not be "imported"/);
});

// A version bump moves the old structure file into previous/ for the upgrade diff; a second file
// for the tier there must not count against "exactly one per tier".
test('a previous/ folder holding an older structure file leaves a bundled framework valid', () => {
  const dir = copyExample();
  fs.mkdirSync(path.join(dir, 'previous'));
  const old = path.join(dir, 'previous', 'core.v0.structure.json');
  fs.copyFileSync(path.join(dir, STRUCTURE), old);
  editJson(old, (s) => { s.controlSetVersion = 'v0'; });
  assert.deepEqual(validateFramework(dir, 'bundled'), []);
  const r = run('validate', dir, '--bundled');
  assert.equal(r.status, 0, r.stderr);
});

test('list returns the example fixture with origin "project", alongside the bundled frameworks', () => {
  const docs = tmp();
  copyExample(path.join(docs, 'frameworks'));
  const r = run('list', docs);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
  const frameworks = JSON.parse(r.stdout);
  const example = frameworks.find((f) => f.certKey === 'example');
  assert.equal(example.origin, 'project');
  assert.deepEqual(example.tiers, ['core']);
  assert.equal(example.dir, path.join(docs, 'frameworks', 'example'));
  for (const key of ['hitrust', 'soc2', 'iso27001', 'cmmc']) {
    assert.equal(frameworks.find((f) => f.certKey === key).origin, 'bundled', key);
  }
});

test('list excludes a project folder that reuses a bundled certKey, naming both paths, and exits 0', () => {
  const docs = tmp();
  const clash = path.join(docs, 'frameworks', 'hitrust');
  fs.cpSync(path.join(BUNDLED, 'hitrust'), clash, { recursive: true });
  const r = run('list', docs);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stderr.includes(clash), 'stderr must name the project path');
  assert.ok(r.stderr.includes(path.join(BUNDLED, 'hitrust')), 'stderr must name the bundled path');
  const hitrust = JSON.parse(r.stdout).filter((f) => f.certKey === 'hitrust');
  assert.equal(hitrust.length, 1);
  assert.equal(hitrust[0].origin, 'bundled');
});

test('list: an invalid project framework is reported and skipped, and never fails the run', () => {
  const docs = tmp();
  const dir = copyExample(path.join(docs, 'frameworks'));
  fs.rmSync(path.join(dir, 'ground-rules.md'));
  const r = run('list', docs);
  assert.equal(r.status, 0);
  assert.match(r.stderr, /^project .*example: ground-rules\.md is missing$/m);
  assert.ok(!JSON.parse(r.stdout).some((f) => f.certKey === 'example'));

  const { frameworks, errors } = listFrameworks(docs);
  assert.ok(!frameworks.some((f) => f.certKey === 'example'));
  assert.deepEqual(errors.map((e) => e.origin), ['project']);
});

test('list: a project frameworks/ that is not a folder is reported, and bundled frameworks still list', () => {
  const docs = tmp();
  fs.writeFileSync(path.join(docs, 'frameworks'), 'not a folder');
  const { frameworks, errors } = listFrameworks(docs);
  assert.ok(frameworks.some((f) => f.certKey === 'hitrust'), 'bundled frameworks must still list');
  assert.ok(errors.some((e) => e.origin === 'project' && /not readable/.test(e.message)), JSON.stringify(errors));
  const r = run('list', docs);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(JSON.parse(r.stdout).some((f) => f.certKey === 'hitrust'));
});

test('list: a symlinked project framework folder is listed like a real one', () => {
  const docs = tmp();
  const real = copyExample(tmp(), 'example');
  fs.mkdirSync(path.join(docs, 'frameworks'));
  fs.symlinkSync(real, path.join(docs, 'frameworks', 'example'), 'dir');
  const { frameworks, errors } = listFrameworks(docs);
  assert.deepEqual(errors, []);
  const example = frameworks.find((f) => f.certKey === 'example');
  assert.ok(example, 'the symlinked framework must be listed');
  assert.equal(example.origin, 'project');
});

test('list: an unreadable project file is reported as an error, never thrown', () => {
  const docs = tmp();
  const dir = copyExample(path.join(docs, 'frameworks'));
  fs.rmSync(path.join(dir, 'ground-rules.md'));
  fs.mkdirSync(path.join(dir, 'ground-rules.md')); // exists, but reading it fails with EISDIR
  const { frameworks, errors } = listFrameworks(docs);
  assert.ok(!frameworks.some((f) => f.certKey === 'example'));
  assert.ok(errors.some((e) => e.origin === 'project' && /not readable/.test(e.message)), JSON.stringify(errors));
  const r = run('list', docs);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /^project .*example: .*not readable/m);
});

// The CLI's bundled root is fixed relative to the script, so lay out a throwaway plugin with the
// same relative paths and one broken bundled framework.
test('list exits 1 when a bundled framework is invalid', () => {
  const plugin = tmp();
  for (const rel of [
    'skills/_shared/frameworks.js',
    'skills/hitrust/lib/versioning/reconcile-state-version.js',
    'skills/hitrust/lib/versioning/diff-structure-versions.js',
  ]) {
    fs.mkdirSync(path.dirname(path.join(plugin, rel)), { recursive: true });
    fs.copyFileSync(path.join(PLUGIN_ROOT, rel), path.join(plugin, rel));
  }
  const broken = copyExample(path.join(plugin, 'frameworks'));
  fs.rmSync(path.join(broken, 'ground-rules.md'));
  const r = spawnSync(process.execPath, [path.join(plugin, 'skills/_shared/frameworks.js'), 'list', tmp()], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^bundled .*example: ground-rules\.md is missing$/m);
});
