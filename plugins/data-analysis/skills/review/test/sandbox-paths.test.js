'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { rewritePath, rewritePaths } = require('../lib/sandbox-paths.js');

test('rewrites a path under the project root to the same relative location under the sandbox root', () => {
  const result = rewritePath('/home/user/project/data/sales.csv', '/home/user/project', '/tmp/sandbox-copy');
  assert.equal(result, '/tmp/sandbox-copy/data/sales.csv');
});

test('normalizes trailing slashes on both roots', () => {
  const result = rewritePath('/home/user/project/data/sales.csv', '/home/user/project/', '/tmp/sandbox-copy/');
  assert.equal(result, '/tmp/sandbox-copy/data/sales.csv');
});

test('normalizes Windows backslashes', () => {
  const result = rewritePath('C:\\proj\\data\\sales.csv', 'C:\\proj', 'C:\\tmp\\sandbox-copy');
  assert.equal(result, 'C:/tmp/sandbox-copy/data/sales.csv');
});

test('rewrites a batch of paths in order', () => {
  const result = rewritePaths(
    ['/home/user/project/a.csv', '/home/user/project/src/b.py'],
    '/home/user/project',
    '/tmp/sandbox-copy'
  );
  assert.deepEqual(result, ['/tmp/sandbox-copy/a.csv', '/tmp/sandbox-copy/src/b.py']);
});

test('returns an empty array for an empty or undefined path list', () => {
  assert.deepEqual(rewritePaths(undefined, '/home/user/project', '/tmp/sandbox-copy'), []);
  assert.deepEqual(rewritePaths([], '/home/user/project', '/tmp/sandbox-copy'), []);
});

test('throws when a path is not inside the project root', () => {
  assert.throws(
    () => rewritePath('/home/user/other-project/a.csv', '/home/user/project', '/tmp/sandbox-copy'),
    /not inside project root/
  );
});

test('does not falsely match a sibling directory that shares a name prefix', () => {
  assert.throws(
    () => rewritePath('/home/user/project-other/a.csv', '/home/user/project', '/tmp/sandbox-copy'),
    /not inside project root/
  );
});
