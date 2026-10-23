'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseFrontmatter } = require('../../fabflows/test/helpers/frontmatter.js');

// The skill checks from plugins/fabflows/test/frontmatter.test.js, for this plugin's skills.
const SKILLS_DIR = path.join(__dirname, '..', 'skills');
const NAME_RE = /^[a-z0-9-]+$/;
const MAX_NAME = 64;
const MAX_DESCRIPTION = 1024;
const RESERVED = ['anthropic', 'claude'];
const skills = () => fs.readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());

test('every skill has valid frontmatter', () => {
  assert.ok(skills().length > 0, 'plugin must ship at least one skill');
  for (const dir of skills()) {
    const filePath = path.join(SKILLS_DIR, dir.name, 'SKILL.md');
    assert.ok(fs.existsSync(filePath), `missing skills/${dir.name}/SKILL.md`);
    const fields = parseFrontmatter(fs.readFileSync(filePath, 'utf8'));
    assert.equal(fields.name, dir.name, `skills/${dir.name}/SKILL.md name must match its directory`);
    assert.ok(NAME_RE.test(fields.name), `skill name "${fields.name}" must match ${NAME_RE}`);
    assert.ok(fields.name.length <= MAX_NAME, `skill name "${fields.name}" exceeds ${MAX_NAME} chars`);
    for (const word of RESERVED) {
      assert.ok(!fields.name.includes(word), `skill name "${fields.name}" must not contain the reserved word "${word}"`);
    }
    assert.ok(fields.description, `skills/${dir.name}/SKILL.md is missing a description`);
    assert.ok(
      fields.description.length <= MAX_DESCRIPTION,
      `skills/${dir.name}/SKILL.md description exceeds ${MAX_DESCRIPTION} chars`
    );
    // Every skill here needs Claude Code (the ticket.js hook, fabflows), and the Agent Skills
    // spec caps the field that says so at 500 characters. It must name this plugin.
    assert.ok(
      fields.compatibility && fields.compatibility.length <= 500,
      `skills/${dir.name}/SKILL.md must declare compatibility in at most 500 chars`
    );
    assert.ok(fields.compatibility.includes('fabflows-tickets'), `skills/${dir.name}/SKILL.md compatibility must name fabflows-tickets`);
  }
});

test('every skill fits the post-compaction re-injection cap', () => {
  // Claude Code re-injects an invoked skill after compaction, capped at 5,000 tokens.
  // 20,000 characters is a rough proxy (about four characters per token), not an exact count.
  for (const dir of skills()) {
    const skill = fs.readFileSync(path.join(SKILLS_DIR, dir.name, 'SKILL.md'), 'utf8');
    assert.ok(
      skill.length <= 20000,
      `${dir.name}/SKILL.md is ${skill.length} characters; keep it under 20,000 so it survives compaction whole`
    );
  }
});
