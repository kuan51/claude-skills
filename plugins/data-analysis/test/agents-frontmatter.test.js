'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseFrontmatter } = require('./helpers/frontmatter.js');

const AGENTS_DIR = path.join(__dirname, '..', 'agents');
const FORBIDDEN_TOOLS = ['Write', 'Edit', 'Agent'];
// Each agent's tools are scoped to what it actually uses: the 4 fixed EDA roles + extra-reviewer
// execute code/queries (need Bash); extra-reviewer-static runs a non-canned persona (no Bash); thesis-auditor only reads and compares text (no Bash);
// findings-reconciler never receives a file path at all (no file/exec tools needed);
// pattern-hunter recomputes the metric (needs Bash); so-what-auditor only judges given evidence.
const EXPECTED_TOOLS = {
  'data-quality-reviewer': 'Read, Grep, Glob, Bash',
  'statistical-methodologist': 'Read, Grep, Glob, Bash',
  'domain-alignment-reviewer': 'Read, Grep, Glob, Bash',
  'reproducibility-auditor': 'Read, Grep, Glob, Bash',
  'findings-reconciler': 'Read',
  'thesis-auditor': 'Read, Grep, Glob',
  'extra-reviewer': 'Read, Grep, Glob, Bash',
  'extra-reviewer-static': 'Read, Grep, Glob',
  'pattern-hunter': 'Read, Grep, Glob, Bash',
  'so-what-auditor': 'Read',
};
const EXPECTED_NAMES = Object.keys(EXPECTED_TOOLS);

test('every expected agent file exists with its scoped tool set, and none can Write/Edit/spawn Agents', () => {
  for (const name of EXPECTED_NAMES) {
    const filePath = path.join(AGENTS_DIR, `${name}.md`);
    assert.ok(fs.existsSync(filePath), `missing agents/${name}.md`);
    const fields = parseFrontmatter(fs.readFileSync(filePath, 'utf8'));
    assert.equal(fields.name, name, `${name}.md frontmatter name must be "${name}"`);
    assert.ok(fields.description, `${name}.md is missing a description field`);
    assert.equal(
      fields.tools,
      EXPECTED_TOOLS[name],
      `${name}.md must declare tools: ${EXPECTED_TOOLS[name]} — found "${fields.tools}"`
    );
    for (const forbidden of FORBIDDEN_TOOLS) {
      assert.ok(
        !(fields.tools || '').includes(forbidden),
        `${name}.md must never declare ${forbidden} — found "${fields.tools}"`
      );
    }
  }
});

// Every agent meant to be blind to the project's conclusions omits its CLAUDE.md, which can state
// them. thesis-auditor is left out: it is the one agent that reads the conclusions.
test('every blind agent omits the project CLAUDE.md', () => {
  const blind = [
    'pattern-hunter', 'so-what-auditor', 'findings-reconciler',
    'data-quality-reviewer', 'statistical-methodologist', 'domain-alignment-reviewer',
    'reproducibility-auditor', 'extra-reviewer', 'extra-reviewer-static',
  ];
  for (const name of blind) {
    const fields = parseFrontmatter(fs.readFileSync(path.join(AGENTS_DIR, `${name}.md`), 'utf8'));
    assert.equal(fields.omitClaudeMd, 'true', `${name}.md must set omitClaudeMd: true`);
  }
  const auditor = parseFrontmatter(fs.readFileSync(path.join(AGENTS_DIR, 'thesis-auditor.md'), 'utf8'));
  assert.notEqual(auditor.omitClaudeMd, 'true', 'thesis-auditor.md keeps CLAUDE.md: it reads the conclusions anyway');
});

test('no extra agent files exist beyond the expected roster', () => {
  assert.equal(EXPECTED_NAMES.length, 10);
  const files = fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md'));
  assert.equal(
    files.length,
    EXPECTED_NAMES.length,
    `expected exactly ${EXPECTED_NAMES.length} agent files, found: ${files.join(', ')}`
  );
});
