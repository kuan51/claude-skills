'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseFrontmatter } = require('./helpers/frontmatter.js');

const SKILL_PATH = path.join(__dirname, '..', 'skills', 'data-analysis-review', 'SKILL.md');

test('SKILL.md exists with valid frontmatter', () => {
  assert.ok(fs.existsSync(SKILL_PATH), 'missing skills/data-analysis-review/SKILL.md');
  const fields = parseFrontmatter(fs.readFileSync(SKILL_PATH, 'utf8'));
  assert.equal(fields.name, 'data-analysis-review');
  assert.ok(fields.description, 'SKILL.md is missing a description field');
  assert.ok(fields.description.startsWith('Use when'), 'description must start with "Use when" per SDO convention');
});
