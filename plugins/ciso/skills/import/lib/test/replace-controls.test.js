'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { registerTier, loadStructure } = require('../../../hitrust/lib/register-tier.js');

const SCRIPT = path.join(__dirname, '..', 'replace-controls.js');
const EXAMPLE = path.join(__dirname, '..', '..', '..', '..', 'test', 'fixtures', 'frameworks', 'example', 'core.v1.structure.json');

// A project with the example framework's core tier registered, a licensed list and its mapping.
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'replace-controls-'));
  const docs = path.join(root, 'docs', 'ciso');
  fs.mkdirSync(docs, { recursive: true });
  const stateJsonPath = path.join(docs, 'state.json');
  fs.writeFileSync(stateJsonPath, JSON.stringify({ certifications: {}, interviewSessions: [] }));
  registerTier(stateJsonPath, loadStructure(EXAMPLE), 'example', 'Example Framework');
  const list = path.join(root, 'licensed.csv');
  fs.writeFileSync(list, 'Ref,Area,Wording\nEX.1,Identity,Each person shall have their own account.\nEX.2,Records,Events shall be logged.\n,Records,No id here.\n');
  const mapping = path.join(root, 'mapping.json');
  fs.writeFileSync(mapping, JSON.stringify({ id: 'Ref', domain: 'Area', statementText: 'Wording' }));
  return { docs, stateJsonPath, list, mapping };
}

function run(...args) {
  return spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8' });
}

test('replacing a non-HITRUST tier archives its controls and replaces them with the imported list', () => {
  const { docs, stateJsonPath, list, mapping } = setup();
  const r = run(docs, 'example', 'core', list, mapping);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { imported: 2, archived: 3, warnings: ['row 4: no id, skipped'] });
  assert.match(r.stderr, /Archived a copy of the import to /);

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const tier = state.certifications.example.tiers.core;
  assert.deepEqual(Object.keys(tier.controls), ['EX.1', 'EX.2']);
  assert.deepEqual(Object.keys(tier.archivedControls), ['EX-AC-1', 'EX-AC-2', 'EX-LG-1']);
  assert.equal(tier.archivedControls['EX-AC-1'].archivedReason, 'import-replaced');
  assert.equal(tier.sourceAuthority, 'imported');
  assert.equal(tier.importedFrom, 'licensed.csv');
  const c = tier.controls['EX.1'];
  assert.equal(c.statementText, 'Each person shall have their own account.');
  assert.equal(c.statementSource, 'imported', 'so vendor research sends only its codes');
  assert.equal(c.assessment.status, 'not_assessed');
  assert.equal('source' in c, false);
  assert.deepEqual(state.interviewSessions.find((s) => s.certification === 'example').domainsRemaining, ['identity', 'records']);

  const copies = fs.readdirSync(path.join(docs, 'imports'));
  assert.equal(copies.length, 1);
  assert.ok(copies[0].endsWith('-licensed.csv'));
});

test('a framework with its own import flow, and a tier not registered, are refused before anything changes', () => {
  const { docs, stateJsonPath, list, mapping } = setup();
  const before = fs.readFileSync(stateJsonPath, 'utf8');
  const hitrust = run(docs, 'hitrust', 'e1', list, mapping);
  assert.equal(hitrust.status, 1);
  assert.match(hitrust.stderr, /flows\/import\.md/);
  const missing = run(docs, 'example', 'extra', list, mapping);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /example\/extra is not registered/);
  assert.equal(fs.readFileSync(stateJsonPath, 'utf8'), before);
  assert.equal(fs.existsSync(path.join(docs, 'imports')), false);
});
