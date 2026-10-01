'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Workflow scripts cannot import, so discover carries copies of review's shared blocks. Each block
// runs from its `const`/`function` line to the first blank line after it.
const read = (skill) => fs.readFileSync(path.join(__dirname, '..', '..', skill, 'workflow.js'), 'utf8');
const SHARED = ['SCOPE_DISCIPLINE', 'INJECTION_DEFENSE', 'EVIDENCE_HYGIENE', 'FINDING_FORMAT', 'EXECUTION_RULE', 'FINDING_ITEM_SCHEMA', 'RECONCILE_SCHEMA', 'wrap', 'assertSandboxed'];

function block(source, name) {
  const m = source.match(new RegExp(`^(?:const|function) ${name}\\b[\\s\\S]*?\\n(?=\\n)`, 'm'));
  assert.ok(m, `${name} not found`);
  return m[0];
}

test('every shared block is byte-identical in review and discover workflow.js', () => {
  const review = read('review');
  const discover = read('discover');
  for (const name of SHARED) assert.equal(block(discover, name), block(review, name), `${name} drifted`);
});
