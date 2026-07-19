'use strict';

const fs = require('fs');
const path = require('path');

const GITIGNORE_COMMENT = '# ciso -- local security-certification tracking data (not for this repo)';

function toPosixRelative(fromDir, toDir) {
  return path.relative(fromDir, toDir).split(path.sep).join('/');
}

function relativeTargetPath(repoRoot, targetDir) {
  let rel = toPosixRelative(repoRoot, targetDir);
  if (!rel.endsWith('/')) rel += '/';
  return rel;
}

function isRepo(repoRoot) {
  return Boolean(repoRoot) && fs.existsSync(path.join(repoRoot, '.git'));
}

/**
 * Idempotently ensures `targetDir` is ignored by `repoRoot`'s .gitignore.
 * Safe to call repeatedly -- returns { updated: false } if an equivalent
 * entry (with or without trailing slash) is already present.
 */
function ensureGitignored(repoRoot, targetDir) {
  const gitignorePath = path.join(repoRoot, '.gitignore');
  const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';

  const relPath = relativeTargetPath(repoRoot, targetDir);
  const relPathNoSlash = relPath.replace(/\/+$/, '');

  const alreadyPresent = existing.split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return false;
    return trimmed.replace(/\/+$/, '') === relPathNoSlash;
  });

  if (alreadyPresent) {
    return { gitignorePath, updated: false };
  }

  const block = `${GITIGNORE_COMMENT}\n${relPath}\n`;
  let next;
  if (existing.length === 0) {
    next = block;
  } else if (existing.endsWith('\n')) {
    next = `${existing}\n${block}`;
  } else {
    next = `${existing}\n\n${block}`;
  }

  fs.writeFileSync(gitignorePath, next);
  return { gitignorePath, updated: true };
}

/**
 * Creates `targetDir` (if needed) and writes a fresh state.json into it.
 * Throws if state.json already exists -- callers must check first.
 */
function scaffoldStateJson(targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  const stateJsonPath = path.join(targetDir, 'state.json');
  if (fs.existsSync(stateJsonPath)) {
    throw new Error(`state.json already exists at ${stateJsonPath} -- refusing to overwrite`);
  }
  const state = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    organization: { name: null, budgetTier: null },
    certifications: {},
    interviewSessions: [],
  };
  fs.writeFileSync(stateJsonPath, JSON.stringify(state, null, 2) + '\n');
  return stateJsonPath;
}

/**
 * Full scaffold: state.json plus (when repoRoot is a git repo) a
 * gitignore entry for targetDir. Returns the summary object printed by the CLI.
 */
function initProject(targetDir, repoRoot) {
  const absTargetDir = path.resolve(targetDir);
  const stateJsonPath = scaffoldStateJson(absTargetDir);

  let gitignoreUpdated = false;
  if (repoRoot) {
    const absRepoRoot = path.resolve(repoRoot);
    if (isRepo(absRepoRoot)) {
      const result = ensureGitignored(absRepoRoot, absTargetDir);
      gitignoreUpdated = result.updated;
    }
  }

  return {
    targetDir: absTargetDir,
    stateJsonPath,
    gitignoreUpdated,
    alreadyExisted: false,
  };
}

module.exports = { initProject, scaffoldStateJson, ensureGitignored, isRepo };

if (require.main === module) {
  const [targetDir, repoRoot] = process.argv.slice(2);
  if (!targetDir) {
    console.error('Usage: node init-project.js <target-dir> [<repo-root>]');
    process.exit(1);
  }
  try {
    const result = initProject(targetDir, repoRoot);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
