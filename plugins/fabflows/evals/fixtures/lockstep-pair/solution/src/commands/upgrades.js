'use strict';
// Reference implementation of `lockstep upgrades` from SPEC.md, as visible/bin/lockstep.js loads it.
const fs = require('node:fs');
const { parseVersion, compareVersions, parseRange, maxSatisfying } = require('../index.js');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

function main(args) {
  if (args.length !== 3) {
    process.stderr.write('usage: lockstep upgrades <manifest.json> <lockstep.lock> <registry.json>\n');
    return 1;
  }
  try {
    const declared = readJson(args[0]).dependencies || {};
    const locked = readJson(args[1]).root.dependencies;
    const registry = readJson(args[2]);
    const lines = [];
    for (const name of Object.keys(declared).sort()) {
      const range = parseRange(declared[name]);
      parseVersion(locked[name]);
      const wanted = maxSatisfying(Object.keys(registry[name] || {}), range);
      if (wanted !== null && compareVersions(wanted, locked[name]) > 0) lines.push(`${name} ${locked[name]} ${wanted}\n`);
    }
    process.stdout.write(lines.join(''));
    return 0;
  } catch (e) {
    process.stderr.write(`error: ${e.message}\n`);
    return 1;
  }
}

module.exports = { main };
