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
