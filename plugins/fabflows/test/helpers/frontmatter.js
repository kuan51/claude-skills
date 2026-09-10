'use strict';
const assert = require('node:assert/strict');

function parseFrontmatter(fileContents) {
  const match = fileContents.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(match, 'file must start with YAML frontmatter delimited by ---');
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return fields;
}

module.exports = { parseFrontmatter };
