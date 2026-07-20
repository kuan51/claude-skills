'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseFrontmatter } = require('./helpers/frontmatter.js');

const SKILLS_DIR = path.join(__dirname, '..', 'skills');

// Maintainer-only skills that must NOT be auto-selected by the model during an org's normal use --
// they stay reachable as an explicit /ciso:<name> invocation. Keep in sync with the
// `disable-model-invocation: true` frontmatter on each listed SKILL.md.
const MAINTAINER_ONLY = new Set(['hitrust-controls-compiler']);

// Anthropic's skill-name rules (per the marketplace authoring rubric): lowercase letters, digits,
// and hyphens only; <= 64 chars; must not contain the reserved words "anthropic" or "claude".
const NAME_RE = /^[a-z0-9-]+$/;
const RESERVED = ['anthropic', 'claude'];
const MAX_NAME = 64;
const MAX_DESCRIPTION = 1024;

function findSkillFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findSkillFiles(full));
    } else if (entry.name === 'SKILL.md') {
      out.push(full);
    }
  }
  return out;
}

const skillFiles = findSkillFiles(SKILLS_DIR);

test('every skill directory ships a SKILL.md (at least the known three)', () => {
  const names = skillFiles.map((f) => path.basename(path.dirname(f))).sort();
  for (const expected of ['hitrust', 'hitrust-controls-compiler', 'init']) {
    assert.ok(names.includes(expected), `missing SKILL.md for skill "${expected}"`);
  }
});

for (const file of skillFiles) {
  const dirName = path.basename(path.dirname(file));

  test(`${dirName}/SKILL.md has valid name + description frontmatter`, () => {
    const fields = parseFrontmatter(fs.readFileSync(file, 'utf8'));

    assert.ok(fields.name, `${dirName}: missing name`);
    assert.ok(fields.name.length <= MAX_NAME, `${dirName}: name exceeds ${MAX_NAME} chars`);
    assert.ok(NAME_RE.test(fields.name), `${dirName}: name must be lowercase letters/digits/hyphens`);
    for (const word of RESERVED) {
      assert.ok(!fields.name.includes(word), `${dirName}: name must not contain reserved word "${word}"`);
    }

    assert.ok(fields.description, `${dirName}: missing description`);
    assert.ok(
      fields.description.length <= MAX_DESCRIPTION,
      `${dirName}: description exceeds ${MAX_DESCRIPTION} chars (${fields.description.length})`
    );
  });

  test(`${dirName}/SKILL.md model-invocation matches its maintainer-only status`, () => {
    const fields = parseFrontmatter(fs.readFileSync(file, 'utf8'));
    const flag = fields['disable-model-invocation'];
    if (MAINTAINER_ONLY.has(dirName)) {
      assert.equal(
        flag,
        'true',
        `${dirName} is maintainer-only and must set "disable-model-invocation: true"`
      );
    } else {
      assert.notEqual(
        flag,
        'true',
        `${dirName} is an org-facing skill and must stay model-invocable (no disable-model-invocation)`
      );
    }
  });
}
