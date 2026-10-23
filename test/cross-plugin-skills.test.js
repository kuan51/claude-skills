'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// fabflows' skills hand ticket work to fabflows-tickets by skill name. Nothing else notices when a
// skill there is renamed or removed, and the hand-off would then name a skill no session has.

const PLUGINS_DIR = path.join(__dirname, '..', 'plugins');
const SKILLS_DIR = path.join(PLUGINS_DIR, 'fabflows', 'skills');
const TICKETS_SKILLS = path.join(PLUGINS_DIR, 'fabflows-tickets', 'skills');

function markdownFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((d) => d.isFile() && d.name.endsWith('.md'))
    .map((d) => path.join(d.parentPath, d.name));
}

test('every fabflows-tickets:<skill> a fabflows skill names exists', () => {
  for (const file of markdownFiles(SKILLS_DIR)) {
    for (const [, skill] of fs.readFileSync(file, 'utf8').matchAll(/fabflows-tickets:([a-z0-9-]+)/g)) {
      assert.ok(
        fs.existsSync(path.join(TICKETS_SKILLS, skill, 'SKILL.md')),
        `${path.relative(PLUGINS_DIR, file)} names fabflows-tickets:${skill}, but plugins/fabflows-tickets/skills/${skill}/SKILL.md does not exist`
      );
    }
  }
});
