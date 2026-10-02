'use strict';

// Pins what the HITRUST e1 import does today, end to end through its CLIs, so that sharing its
// replace step with the generic import (skills/import/lib/) cannot change it unnoticed. Set
// WRITE_GOLDEN=1 to rewrite the golden file after an intended change, and review its diff.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { scaffoldStateJson } = require('../../../init/lib/init-project.js');

const LIB = path.join(__dirname, '..');
const EXPORT = path.join(__dirname, 'fixtures', 'sample-e1-export.xlsx');
const GOLDEN = path.join(__dirname, 'fixtures', 'golden-e1-import.json');

const ISO_TS = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g;
const FILE_TS = /\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z/g;

function runImport() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ciso-golden-'));
  const stateJsonPath = scaffoldStateJson(dir);
  execFileSync('node', [path.join(LIB, 'register-tier.js'), dir, 'hitrust', 'HITRUST CSF', 'e1']);
  const run = spawnSync('node', [path.join(LIB, 'merge-import.js'), stateJsonPath, EXPORT], { encoding: 'utf8' });
  const archived = fs.readdirSync(path.join(dir, 'imports'));
  const archiveBytesEqual = archived.length === 1
    && fs.readFileSync(path.join(dir, 'imports', archived[0])).equals(fs.readFileSync(EXPORT));
  return {
    status: run.status,
    stdout: JSON.parse(run.stdout),
    stderr: run.stderr.split(dir).join('<dir>').replace(FILE_TS, '<ts>'),
    archived: archived.map((n) => n.replace(FILE_TS, '<ts>')),
    archiveBytesEqual,
    state: JSON.parse(fs.readFileSync(stateJsonPath, 'utf8').replace(ISO_TS, '<ts>')),
  };
}

test('the HITRUST e1 import matches its golden output', () => {
  const actual = runImport();
  if (process.env.WRITE_GOLDEN) fs.writeFileSync(GOLDEN, JSON.stringify(actual, null, 2) + '\n');
  assert.deepEqual(actual, JSON.parse(fs.readFileSync(GOLDEN, 'utf8')));
});
