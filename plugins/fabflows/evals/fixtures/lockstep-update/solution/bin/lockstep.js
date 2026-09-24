#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const { resolve, update, satisfies, ResolutionError } = require('../src/index.js');

function usage() {
  process.stderr.write('usage: lockstep resolve <manifest.json> <registry.json> [--out <file>]\n       lockstep update <manifest.json> <lockstep.lock> <registry.json> [--out <file>]\n       lockstep check <version> <range>\n');
  return 1;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function main(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === 'resolve' || cmd === 'update') {
    const outIdx = rest.indexOf('--out');
    const out = outIdx === -1 ? null : rest[outIdx + 1];
    const positional = outIdx === -1 ? rest : [...rest.slice(0, outIdx), ...rest.slice(outIdx + 2)];
    if (positional.length !== (cmd === 'update' ? 3 : 2) || (outIdx !== -1 && !out)) return usage();
    let inputs;
    try {
      inputs = positional.map(readJson);
    } catch (e) {
      process.stderr.write(`error: ${e.message}\n`);
      return 1;
    }
    try {
      const lock = `${JSON.stringify(cmd === 'update' ? update(...inputs) : resolve(...inputs), null, 2)}\n`;
      if (out) fs.writeFileSync(out, lock);
      else process.stdout.write(lock);
      return 0;
    } catch (e) {
      process.stderr.write(`error: ${e.message}\n`);
      return e instanceof ResolutionError ? 2 : 1;
    }
  }
  if (cmd === 'check') {
    if (rest.length !== 2) return usage();
    try {
      const ok = satisfies(rest[0], rest[1]);
      process.stdout.write(`${ok}\n`);
      return ok ? 0 : 2;
    } catch (e) {
      process.stderr.write(`error: ${e.message}\n`);
      return 1;
    }
  }
  return usage();
}

process.exitCode = main(process.argv.slice(2));
