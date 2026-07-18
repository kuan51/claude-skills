'use strict';

function normalize(p) {
  return String(p).replace(/\\/g, '/').replace(/\/+$/, '');
}

function rewritePath(originalPath, projectRoot, sandboxRoot) {
  const root = normalize(projectRoot);
  const sandbox = normalize(sandboxRoot);
  const norm = normalize(originalPath);
  if (norm !== root && !norm.startsWith(root + '/')) {
    throw new Error(`Path "${originalPath}" is not inside project root "${projectRoot}" -- refusing to rewrite an out-of-scope path`);
  }
  return sandbox + norm.slice(root.length);
}

function rewritePaths(paths, projectRoot, sandboxRoot) {
  return (paths || []).map((p) => rewritePath(p, projectRoot, sandboxRoot));
}

module.exports = { rewritePath, rewritePaths };

if (require.main === module) {
  const [projectRoot, sandboxRoot, ...paths] = process.argv.slice(2);
  if (!projectRoot || !sandboxRoot || paths.length === 0) {
    console.error('Usage: node sandbox-paths.js <projectRoot> <sandboxRoot> <path1> [path2 ...]');
    process.exit(1);
  }
  console.log(JSON.stringify(rewritePaths(paths, projectRoot, sandboxRoot), null, 2));
}
