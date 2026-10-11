'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PLUGIN_DIR = path.join(__dirname, '..');
const AGENTS_DIR = path.join(PLUGIN_DIR, 'agents');

// Each plugin ships on its own, so this parses frontmatter itself instead of importing another
// plugin's helper. Flat `key: value` lines only, which is all this plugin's agent uses.
function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(m, 'agent file has no frontmatter');
  const fields = {};
  for (const line of m[1].split(/\r?\n/)) {
    assert.doesNotMatch(line, /^\s/, 'frontmatter must be flat `key: value` lines');
    const i = line.indexOf(':');
    if (i > 0) fields[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return fields;
}

// A nested map, a block scalar or a continuation line could hide the real `tools:` or `model:`
// value, so the parser refuses any indented line instead of guessing what YAML would make of it.
test('frontmatter refuses an indented line', () => {
  assert.throws(() => frontmatter('---\ntools: Read, Bash\nhooks:\n  tools: Read, Grep, Glob\n---\n'));
  assert.throws(() => frontmatter('---\ntools: Read, Grep, Glob\n  , Bash\n---\n'));
});

// infra-inventory reads untrusted IaC and CI files, and the README promises it is read-only and
// runs on Haiku. An omitted tools line would inherit every tool, so the exact list is pinned.
test('infra-inventory is read-only and pinned to Haiku', () => {
  const fields = frontmatter(fs.readFileSync(path.join(AGENTS_DIR, 'infra-inventory.md'), 'utf8'));
  assert.equal(fields.name, 'infra-inventory');
  assert.ok(fields.description, 'infra-inventory.md is missing a description');
  assert.equal(fields.tools, 'Read, Grep, Glob');
  assert.equal(fields.model, 'haiku');
  for (const forbidden of ['Write', 'Edit', 'Bash', 'Agent']) {
    assert.ok(!fields.tools.split(/,\s*/).includes(forbidden), `infra-inventory must never declare ${forbidden}`);
  }
});

test('no agent ships beyond infra-inventory', () => {
  const files = fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md'));
  assert.deepEqual(files, ['infra-inventory.md']);
});

// Plugin agents register as <plugin>:<name>, so the skill names the agent that way.
test('the skill dispatches the agent by its namespaced name', () => {
  const skill = fs.readFileSync(path.join(PLUGIN_DIR, 'skills', 'docs-warden', 'SKILL.md'), 'utf8');
  assert.ok(skill.includes('`docs-warden:infra-inventory`'), 'SKILL.md must name docs-warden:infra-inventory');
  assert.doesNotMatch(skill, /(?<!docs-warden:)\binfra-inventory\b/, 'SKILL.md must not name the bare infra-inventory');
});
