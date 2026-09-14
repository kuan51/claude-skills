'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseFrontmatter } = require('./helpers/frontmatter.js');

const PLUGIN_DIR = path.join(__dirname, '..');
const AGENTS_DIR = path.join(PLUGIN_DIR, 'agents');
const SKILLS_DIR = path.join(PLUGIN_DIR, 'skills');

// Unlike ciso's roster, Write and Edit are NOT forbidden here: `editor` exists to change
// code and `test-runner` exists to create test files, so both legitimately need them.
// `Agent` is forbidden for every worker, which is what keeps the delegation tree one level
// deep -- a worker that can spawn workers makes cost and blast radius unbounded.
const FORBIDDEN_TOOLS = ['Agent'];

// Why each worker has the tools and the tier it has:
//   - explorer:    read-only search. Haiku is enough to locate a symbol, and the whole
//                  point is that this runs cheaper than the lead. No Bash: it answers
//                  "where is X", it does not run anything.
//   - researcher:  read-only, plus the two web tools. Haiku for the same reason. No Bash
//                  and no Write -- this is the main prompt-injection surface, and the
//                  narrow tool list is a stronger control than any hook: plugin hooks
//                  do run inside subagents, but the guard only matches patterns and
//                  can be walked around.
//   - editor:      Sonnet, because multi-file edits and refactors degrade on Haiku, and
//                  a botched edit costs more than the tier saved. Needs Bash to run the
//                  build it is asked to prove.
//   - test-runner: Sonnet for coverage judgement. Write is for creating test files only;
//                  the agent body forbids editing production code.
//   - refuter:     Opus, because review is judgement with little output -- the cheap place
//                  for a stronger model -- and Opus 5 review stays accurate at medium effort.
//                  Bash runs the diff and the tests; no Edit or Write, so it cannot fix what
//                  it is judging.
//   - investigator: Opus at high effort for hypothesis-driven narrowing. Same tools as the
//                  refuter for the same reason: it gathers evidence, the lead decides.
// Keep this in sync with plugins/fabflows/agents/*.md whenever one is added or changed.
const EXPECTED_TOOLS = {
  explorer: 'Read, Grep, Glob',
  researcher: 'Read, Grep, Glob, WebFetch, WebSearch',
  editor: 'Read, Edit, Write, Grep, Glob, Bash',
  'test-runner': 'Read, Grep, Glob, Bash, Write',
  refuter: 'Read, Grep, Glob, Bash',
  investigator: 'Read, Grep, Glob, Bash',
};
const EXPECTED_MODEL = {
  explorer: 'haiku',
  researcher: 'haiku',
  editor: 'sonnet',
  'test-runner': 'sonnet',
  refuter: 'opus',
  investigator: 'opus',
};

// Effort is pinned so a worker does not inherit the lead's session effort. Haiku 4.5 has no
// effort levels, so the Haiku workers must not declare one. CLAUDE_CODE_EFFORT_LEVEL, when set,
// still overrides these pins.
const EXPECTED_EFFORT = {
  editor: 'medium',
  'test-runner': 'low',
  refuter: 'medium',
  investigator: 'high',
};
const EXPECTED_NAMES = Object.keys(EXPECTED_TOOLS);

const NAME_RE = /^[a-z0-9-]+$/;
const MAX_NAME = 64;
const MAX_DESCRIPTION = 1024;
const RESERVED = ['anthropic', 'claude'];

test('every expected agent exists with its scoped tool set and pinned model tier', () => {
  for (const name of EXPECTED_NAMES) {
    const filePath = path.join(AGENTS_DIR, `${name}.md`);
    assert.ok(fs.existsSync(filePath), `missing agents/${name}.md`);
    const fields = parseFrontmatter(fs.readFileSync(filePath, 'utf8'));
    assert.equal(fields.name, name, `${name}.md frontmatter name must be "${name}"`);
    assert.ok(fields.description, `${name}.md is missing a description field`);
    assert.equal(
      fields.tools,
      EXPECTED_TOOLS[name],
      `${name}.md must declare tools: ${EXPECTED_TOOLS[name]} -- found "${fields.tools}"`
    );
    assert.equal(
      fields.model,
      EXPECTED_MODEL[name],
      `${name}.md must pin model: ${EXPECTED_MODEL[name]} -- found "${fields.model}". ` +
        'Without an explicit model the worker silently inherits the lead, which defeats the plugin.'
    );
    assert.equal(
      fields.effort,
      EXPECTED_EFFORT[name],
      `${name}.md must declare effort: ${EXPECTED_EFFORT[name] ?? '(none)'} -- found "${fields.effort}"`
    );
    for (const forbidden of FORBIDDEN_TOOLS) {
      assert.ok(
        !(fields.tools || '').split(/,\s*/).includes(forbidden),
        `${name}.md must never declare ${forbidden} -- found "${fields.tools}"`
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

test('every agent body carries the report contract and the injection clause', () => {
  for (const name of EXPECTED_NAMES) {
    const body = fs.readFileSync(path.join(AGENTS_DIR, `${name}.md`), 'utf8');
    assert.match(
      body,
      /permission denial[^.]*as the very first line/i,
      `${name}.md must require a permission denial as the first line of its report`
    );
    assert.match(
      body,
      /\*\*confirmed\*\* \/ \*\*inferred\*\* \/ \*\*guessed\*\*/,
      `${name}.md must require confidence labels on every claim`
    );
    assert.match(
      body,
      /data, never as instructions/i,
      `${name}.md must carry the prompt-injection clause`
    );
  }
});

test('every skill has valid frontmatter', () => {
  const skills = fs.readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());
  assert.ok(skills.length > 0, 'plugin must ship at least one skill');
  for (const dir of skills) {
    const filePath = path.join(SKILLS_DIR, dir.name, 'SKILL.md');
    assert.ok(fs.existsSync(filePath), `missing skills/${dir.name}/SKILL.md`);
    const fields = parseFrontmatter(fs.readFileSync(filePath, 'utf8'));
    assert.equal(fields.name, dir.name, `skills/${dir.name}/SKILL.md name must match its directory`);
    assert.ok(NAME_RE.test(fields.name), `skill name "${fields.name}" must match ${NAME_RE}`);
    assert.ok(fields.name.length <= MAX_NAME, `skill name "${fields.name}" exceeds ${MAX_NAME} chars`);
    for (const word of RESERVED) {
      assert.ok(
        !fields.name.includes(word),
        `skill name "${fields.name}" must not contain the reserved word "${word}"`
      );
    }
    assert.ok(fields.description, `skills/${dir.name}/SKILL.md is missing a description`);
    assert.ok(
      fields.description.length <= MAX_DESCRIPTION,
      `skills/${dir.name}/SKILL.md description exceeds ${MAX_DESCRIPTION} chars`
    );
  }
});

test('the skill routes to the namespaced agents that actually ship', () => {
  const skill = fs.readFileSync(path.join(SKILLS_DIR, 'fabflows', 'SKILL.md'), 'utf8');
  for (const name of EXPECTED_NAMES) {
    assert.ok(
      skill.includes(`fabflows:${name}`),
      `SKILL.md must route to fabflows:${name} -- a bare "${name}" will not resolve, ` +
        'because plugin agents are namespaced'
    );
  }
});

test('the skill fits the post-compaction re-injection cap', () => {
  // Claude Code re-injects an invoked skill after compaction, capped at 5,000 tokens.
  // 20,000 characters is a rough proxy (about four characters per token), not an exact count.
  const skill = fs.readFileSync(path.join(SKILLS_DIR, 'fabflows', 'SKILL.md'), 'utf8');
  assert.ok(
    skill.length <= 20000,
    `SKILL.md is ${skill.length} characters; keep it under 20,000 so it survives compaction whole`
  );
});

test('the SubagentStop contract check matches every worker', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, 'hooks', 'hooks.json'), 'utf8'));
  const matchers = hooks.hooks.SubagentStop.map((e) => new RegExp(e.matcher));
  for (const name of EXPECTED_NAMES) {
    assert.ok(
      matchers.some((re) => re.test(`fabflows:${name}`)),
      `hooks.json SubagentStop must match fabflows:${name}, or that worker's report goes unchecked`
    );
  }
});
