'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Workflow scripts cannot import, so discover carries copies of review's shared blocks. A block is
// its `const`/`function` line plus every following line that is blank or starts with whitespace,
// `}`, `]` or `)`, with trailing blank lines trimmed, so a blank line inside a block cannot end it.
const read = (skill) => fs.readFileSync(path.join(__dirname, '..', '..', skill, 'workflow.js'), 'utf8');
const SHARED = ['SCOPE_DISCIPLINE', 'INJECTION_DEFENSE', 'EVIDENCE_HYGIENE', 'FINDING_FORMAT', 'EXECUTION_RULE', 'FINDING_ITEM_SCHEMA', 'RECONCILE_SCHEMA', 'wrap', 'assertSandboxed', 'drop', 'strip'];

function block(source, name) {
  const lines = source.split('\n');
  const start = lines.findIndex((l) => new RegExp(`^(?:const|function) ${name}\\b`).test(l));
  assert.ok(start >= 0, `${name} not found`);
  let end = start + 1;
  while (end < lines.length && (lines[end] === '' || /^[\s}\])]/.test(lines[end]))) end++;
  while (end > start + 1 && !lines[end - 1].trim()) end--;
  return lines.slice(start, end).join('\n');
}

test('every shared block is byte-identical in review and discover workflow.js', () => {
  const review = read('review');
  const discover = read('discover');
  for (const name of SHARED) assert.equal(block(discover, name), block(review, name), `${name} drifted`);
});
