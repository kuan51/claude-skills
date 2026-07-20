'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { initProject, scaffoldStateJson, ensureGitignored, isRepo } = require('../init-project.js');

function mkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ciso-init-test-'));
}

function rmTempDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

test('fresh scaffold produces a state.json matching the exact schema', () => {
  const tmp = mkTempDir();
  try {
    const targetDir = path.join(tmp, 'docs', 'ciso');
    const result = initProject(targetDir);

    assert.equal(result.targetDir, path.resolve(targetDir));
    assert.equal(result.stateJsonPath, path.join(path.resolve(targetDir), 'state.json'));
    assert.equal(result.gitignoreUpdated, false);
    assert.equal(result.alreadyExisted, false);

    const raw = fs.readFileSync(result.stateJsonPath, 'utf8');
    const state = JSON.parse(raw);

    assert.deepEqual(Object.keys(state).sort(), [
      'certifications',
      'generatedAt',
      'interviewSessions',
      'organization',
      'schemaVersion',
    ].sort());

    assert.equal(state.schemaVersion, '1.0.0');
    assert.equal(new Date(state.generatedAt).toISOString(), state.generatedAt);
    assert.deepEqual(state.organization, { name: null, budgetTier: null });
    assert.deepEqual(state.certifications, {});
    assert.deepEqual(state.interviewSessions, []);
  } finally {
    rmTempDir(tmp);
  }
});

test('calling scaffoldStateJson again against an already-scaffolded directory throws', () => {
  const tmp = mkTempDir();
  try {
    const targetDir = path.join(tmp, 'docs', 'ciso');
    scaffoldStateJson(targetDir);

    assert.throws(() => scaffoldStateJson(targetDir), /already exists/);
    assert.throws(() => initProject(targetDir), /already exists/);
  } finally {
    rmTempDir(tmp);
  }
});

test('gitignore idempotency: running twice does not duplicate the entry', () => {
  const tmp = mkTempDir();
  try {
    fs.mkdirSync(path.join(tmp, '.git'));
    const targetDir = path.join(tmp, 'docs', 'ciso');
    fs.mkdirSync(targetDir, { recursive: true });

    const first = ensureGitignored(tmp, targetDir);
    assert.equal(first.updated, true);
    const contentAfterFirst = fs.readFileSync(path.join(tmp, '.gitignore'), 'utf8');

    const second = ensureGitignored(tmp, targetDir);
    assert.equal(second.updated, false);
    const contentAfterSecond = fs.readFileSync(path.join(tmp, '.gitignore'), 'utf8');

    assert.equal(contentAfterSecond, contentAfterFirst);
    const matches = contentAfterSecond.match(/docs\/ciso\//g) || [];
    assert.equal(matches.length, 1);
  } finally {
    rmTempDir(tmp);
  }
});

test('gitignore handling works when .gitignore is absent', () => {
  const tmp = mkTempDir();
  try {
    fs.mkdirSync(path.join(tmp, '.git'));
    const targetDir = path.join(tmp, 'docs', 'ciso');
    fs.mkdirSync(targetDir, { recursive: true });

    assert.equal(fs.existsSync(path.join(tmp, '.gitignore')), false);
    const result = ensureGitignored(tmp, targetDir);
    assert.equal(result.updated, true);

    const content = fs.readFileSync(path.join(tmp, '.gitignore'), 'utf8');
    assert.match(content, /docs\/ciso\//);
    assert.match(content, /ciso -- local security-certification tracking data/);
  } finally {
    rmTempDir(tmp);
  }
});

test('gitignore handling works when .gitignore is empty', () => {
  const tmp = mkTempDir();
  try {
    fs.mkdirSync(path.join(tmp, '.git'));
    const targetDir = path.join(tmp, 'docs', 'ciso');
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(tmp, '.gitignore'), '');

    const result = ensureGitignored(tmp, targetDir);
    assert.equal(result.updated, true);
    const content = fs.readFileSync(path.join(tmp, '.gitignore'), 'utf8');
    assert.match(content, /docs\/ciso\//);
  } finally {
    rmTempDir(tmp);
  }
});

test('gitignore handling recognizes an existing entry spelled without a trailing slash', () => {
  const tmp = mkTempDir();
  try {
    fs.mkdirSync(path.join(tmp, '.git'));
    const targetDir = path.join(tmp, 'docs', 'ciso');
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(tmp, '.gitignore'), 'node_modules/\ndocs/ciso\n');

    const before = fs.readFileSync(path.join(tmp, '.gitignore'), 'utf8');
    const result = ensureGitignored(tmp, targetDir);
    assert.equal(result.updated, false);
    const after = fs.readFileSync(path.join(tmp, '.gitignore'), 'utf8');
    assert.equal(after, before);
  } finally {
    rmTempDir(tmp);
  }
});

test('gitignore handling recognizes an existing entry spelled with a trailing slash', () => {
  const tmp = mkTempDir();
  try {
    fs.mkdirSync(path.join(tmp, '.git'));
    const targetDir = path.join(tmp, 'docs', 'ciso');
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(tmp, '.gitignore'), 'node_modules/\ndocs/ciso/\n');

    const before = fs.readFileSync(path.join(tmp, '.gitignore'), 'utf8');
    const result = ensureGitignored(tmp, targetDir);
    assert.equal(result.updated, false);
    const after = fs.readFileSync(path.join(tmp, '.gitignore'), 'utf8');
    assert.equal(after, before);
  } finally {
    rmTempDir(tmp);
  }
});

test('no git repo present (no repoRoot arg) scaffolds state.json fine and skips gitignore work', () => {
  const tmp = mkTempDir();
  try {
    const targetDir = path.join(tmp, 'docs', 'ciso');
    const result = initProject(targetDir);
    assert.equal(result.gitignoreUpdated, false);
    assert.equal(fs.existsSync(result.stateJsonPath), true);
  } finally {
    rmTempDir(tmp);
  }
});

test('no git repo present (repoRoot has no .git) scaffolds state.json fine and skips gitignore work without erroring', () => {
  const tmp = mkTempDir();
  try {
    const targetDir = path.join(tmp, 'docs', 'ciso');
    assert.equal(isRepo(tmp), false);

    const result = initProject(targetDir, tmp);
    assert.equal(result.gitignoreUpdated, false);
    assert.equal(fs.existsSync(result.stateJsonPath), true);
    assert.equal(fs.existsSync(path.join(tmp, '.gitignore')), false);
  } finally {
    rmTempDir(tmp);
  }
});

test('isRepo treats .git as a repo marker whether it is a directory (normal clone) or a file (worktree)', () => {
  const tmp = mkTempDir();
  try {
    fs.mkdirSync(path.join(tmp, '.git'));
    assert.equal(isRepo(tmp), true);
  } finally {
    rmTempDir(tmp);
  }

  const tmp2 = mkTempDir();
  try {
    fs.writeFileSync(path.join(tmp2, '.git'), 'gitdir: /somewhere/else\n');
    assert.equal(isRepo(tmp2), true);
  } finally {
    rmTempDir(tmp2);
  }
});
