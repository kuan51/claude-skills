'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseFrontmatter } = require('./helpers/frontmatter.js');

const AGENTS_DIR = path.join(__dirname, '..', 'agents');
const REQUIRED_TOOLS = 'Read, Grep, Glob, Bash';
const EXPECTED_NAMES = [
  'data-quality-reviewer',
  'statistical-methodologist',
  'domain-alignment-reviewer',
  'reproducibility-auditor',
  'findings-reconciler',
  'thesis-auditor',
  'extra-reviewer',
];

test('every expected agent file exists with the restricted, read-only tool set', () => {
  for (const name of EXPECTED_NAMES) {
    const filePath = path.join(AGENTS_DIR, `${name}.md`);
    assert.ok(fs.existsSync(filePath), `missing agents/${name}.md`);
    const fields = parseFrontmatter(fs.readFileSync(filePath, 'utf8'));
    assert.equal(fields.name, name, `${name}.md frontmatter name must be "${name}"`);
    assert.ok(fields.description, `${name}.md is missing a description field`);
    assert.equal(
      fields.tools,
      REQUIRED_TOOLS,
      `${name}.md must declare tools: ${REQUIRED_TOOLS} (no Write/Edit/Agent) — found "${fields.tools}"`
    );
  }
});

test('no extra agent files exist beyond the expected roster', () => {
  const files = fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md'));
  assert.equal(
    files.length,
    EXPECTED_NAMES.length,
    `expected exactly ${EXPECTED_NAMES.length} agent files, found: ${files.join(', ')}`
  );
});
