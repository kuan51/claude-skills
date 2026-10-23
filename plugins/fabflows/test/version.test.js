'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PLUGIN = path.join(__dirname, '..');
const ROOT = path.join(PLUGIN, '..', '..');

test('the current version is documented', () => {
  const { version } = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'));
  const log = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
  assert.ok(log.includes(`fabflows ${version}`), `CHANGELOG.md must name fabflows ${version}`);
});
