'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseFrontmatter } = require('./helpers/frontmatter.js');

const AGENTS_DIR = path.join(__dirname, '..', 'agents');
const FORBIDDEN_TOOLS = ['Write', 'Edit', 'Agent'];

// Phase 1 (scaffold/init/hitrust register-import-interview) shipped zero subagents --
// the interview runs conversationally in the main thread via AskUserQuestion/plan mode,
// and register/import/apply-assessment are plain scripts, not agents. Phases 2-3 add
// research-only roles, each scoped to the minimum tools it needs and never granted
// Write/Edit/Agent (they return findings via schema, they don't touch the filesystem):
//   - hitrust-topic-researcher / hitrust-controls-verifier: need to fetch and read live
//     web sources (public HITRUST advisories/pages) to research or verify citations.
//   - hitrust-controls-reconciler: pure text reconciliation over data already handed to
//     it in its prompt -- no web or file access needed at all.
//   - vendor-researcher: needs to search/fetch vendor and SaaS product information.
// Keep this in sync with plugins/ciso/agents/*.md whenever one is added or changed.
const EXPECTED_TOOLS = {
  'hitrust-topic-researcher': 'Read, WebSearch, WebFetch',
  'hitrust-controls-reconciler': 'Read',
  'hitrust-controls-verifier': 'Read, WebSearch, WebFetch',
  'vendor-researcher': 'Read, WebSearch, WebFetch',
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

test('no extra agent files exist beyond the expected roster', () => {
  const files = fs.existsSync(AGENTS_DIR)
    ? fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md'))
    : [];
  assert.equal(
    files.length,
    EXPECTED_NAMES.length,
    `expected exactly ${EXPECTED_NAMES.length} agent files, found: ${files.join(', ')}`
  );
});
