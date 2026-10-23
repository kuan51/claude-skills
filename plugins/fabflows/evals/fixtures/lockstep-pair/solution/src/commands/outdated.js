'use strict';
// Reference implementation of `lockstep outdated` from SPEC.md, as visible/bin/lockstep.js loads it.
const fs = require('node:fs');
const { satisfies } = require('../index.js');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

function main(args) {
  if (args.length !== 2) {
    process.stderr.write('usage: lockstep outdated <manifest.json> <lockstep.lock>\n');
    return 1;
  }
  try {
    const declared = readJson(args[0]).dependencies || {};
    const locked = readJson(args[1]).root.dependencies;
    const lines = Object.keys(declared).sort()
      .filter((name) => !satisfies(locked[name], declared[name]))
      .map((name) => `${name} ${locked[name]} ${declared[name]}\n`);
    process.stdout.write(lines.join(''));
    return lines.length ? 1 : 0;
  } catch (e) {
    process.stderr.write(`error: ${e.message}\n`);
    return 1;
  }
}

module.exports = { main };
