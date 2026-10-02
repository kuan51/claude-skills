'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { writeFramework } = require('../write-framework.js');
const { convertControls } = require('../convert-controls.js');
const { applyParaphrases } = require('../check-overlap.js');
const { validateFramework } = require('../../../_shared/frameworks.js');
const { registerTier, loadStructure } = require('../../../hitrust/lib/register-tier.js');

const SCRIPT = path.join(__dirname, '..', 'write-framework.js');
const CSV = [
  'Control ID,Domain,Title,Requirement',
  'AC-1,Access Control,Unique accounts,Each user of the system shall be assigned a unique account before access is granted.',
  'LG-1,Logging,Audit logs,The organization shall record security events and retain the records for one year.',
].join('\n');
const MAPPING = { id: 'Control ID', domain: 'Domain', topicLabel: 'Title', statementText: 'Requirement' };
const META = { certKey: 'acss', displayName: 'Acme Cloud Security Standard', summary: 'An invented standard for tests.', tier: 'core', controlSetVersion: 'v2026' };
const OWN_WORDS = {
  'AC-1': { topicLabel: 'Personal sign-in', topicSummary: 'Nobody shares a login; every person gets their own before reaching anything.' },
  'LG-1': { topicLabel: 'Keeping a trail', topicSummary: 'Note down what happens that matters for security, and hold on to it for twelve months.' },
};

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'write-framework-'));
  const docs = path.join(root, 'docs', 'ciso');
  fs.mkdirSync(docs, { recursive: true });
  fs.writeFileSync(path.join(docs, 'state.json'), JSON.stringify({ certifications: {}, interviewSessions: [] }));
  const csv = path.join(root, 'acss.csv');
  fs.writeFileSync(csv, CSV);
  return { root, docs, controls: convertControls(csv, MAPPING).controls };
}

function frameworkDir(docs, certKey = 'acss') {
  return path.join(docs, 'frameworks', certKey);
}

test('private mode writes an imported framework that validates and keeps the verbatim wording', () => {
  const { docs, controls } = setup();
  const result = writeFramework(docs, Object.assign({ mode: 'private' }, META), controls);
  const dir = frameworkDir(docs);
  assert.equal(result.dir, dir);
  assert.deepEqual(validateFramework(dir, 'project'), []);
  const structure = loadStructure(path.join(dir, 'core.v2026.structure.json'));
  assert.equal(structure.sourceAuthority, 'imported');
  assert.equal(structure.nonAuthoritative, false);
  assert.equal(structure.controls[0].statementText, 'Each user of the system shall be assigned a unique account before access is granted.');
  assert.ok(structure.controls.every((c) => !('source' in c)), 'source cells are working data, never written');
  assert.match(fs.readFileSync(path.join(dir, 'ground-rules.md'), 'utf8'), /licensed wording/);
  // ...and the wording survives registration into state.json.
  registerTier(path.join(docs, 'state.json'), structure, 'acss', META.displayName);
  const state = JSON.parse(fs.readFileSync(path.join(docs, 'state.json'), 'utf8'));
  assert.equal(state.certifications.acss.tiers.core.controls['LG-1'].statementText, structure.controls[1].statementText);
});

test('shareable mode writes only the six fields, paraphrased and non-authoritative', () => {
  const { docs, controls } = setup();
  writeFramework(docs, Object.assign({ mode: 'shareable' }, META), applyParaphrases(controls, OWN_WORDS), { termsPermitDerivatives: true });
  const dir = frameworkDir(docs);
  assert.deepEqual(validateFramework(dir, 'project'), []);
  const structure = loadStructure(path.join(dir, 'core.v2026.structure.json'));
  assert.equal(structure.sourceAuthority, 'paraphrased');
  assert.equal(structure.nonAuthoritative, true);
  assert.deepEqual(Object.keys(structure.controls[0]), ['id', 'domain', 'domainKey', 'topicLabel', 'topicSummary']);
  assert.equal(structure.controls[0].topicLabel, 'Personal sign-in');
  const rules = fs.readFileSync(path.join(dir, 'ground-rules.md'), 'utf8');
  assert.match(rules, /verified nothing|nothing verified/);
  assert.match(rules, /tripwire/);
});

test('shareable mode is refused without the terms flag, and writes nothing', () => {
  const { docs, controls } = setup();
  assert.throws(
    () => writeFramework(docs, Object.assign({ mode: 'shareable' }, META), applyParaphrases(controls, OWN_WORDS)),
    /--terms-permit-derivatives/
  );
  assert.equal(fs.existsSync(frameworkDir(docs)), false);
});

test('shareable mode is refused when any control overlaps its source, and writes nothing', () => {
  const { docs, controls } = setup();
  const copied = Object.assign({}, OWN_WORDS, { 'LG-1': { topicLabel: 'Audit logs', topicSummary: 'Keep a record.' } });
  assert.throws(
    () => writeFramework(docs, Object.assign({ mode: 'shareable' }, META), applyParaphrases(controls, copied), { termsPermitDerivatives: true }),
    /LG-1 topicLabel: equals a source cell/
  );
  assert.equal(fs.existsSync(frameworkDir(docs)), false);
});

test('applyParaphrases refuses a control with no paraphrase, and an id that is not in the list', () => {
  const { controls } = setup();
  assert.throws(() => applyParaphrases(controls, { 'AC-1': OWN_WORDS['AC-1'] }), /no paraphrase for "LG-1"/);
  assert.throws(() => applyParaphrases(controls, Object.assign({ 'ZZ-9': OWN_WORDS['AC-1'] }, OWN_WORDS)), /"ZZ-9" is not a control/);
});

test('the writer refuses an existing folder and a bundled certKey', () => {
  const { docs, controls } = setup();
  fs.mkdirSync(frameworkDir(docs), { recursive: true });
  assert.throws(() => writeFramework(docs, Object.assign({ mode: 'private' }, META), controls), /already exists/);
  assert.throws(() => writeFramework(docs, Object.assign({ mode: 'private' }, META, { certKey: 'hitrust' }), controls), /bundled framework/);
});

test('the writer refuses a certKey, tier or version that could leave its folder, before writing', () => {
  const { root, docs, controls } = setup();
  for (const bad of [{ certKey: '../escape' }, { tier: '../core' }, { controlSetVersion: 'v1/../../x' }]) {
    assert.throws(() => writeFramework(docs, Object.assign({ mode: 'private' }, META, bad), controls), /must match/);
  }
  assert.deepEqual(fs.readdirSync(root).sort(), ['acss.csv', 'docs']);
  assert.equal(fs.existsSync(path.join(docs, 'frameworks')), false);
});

test('the writer removes its folder when the result fails validation', () => {
  const { docs, controls } = setup();
  assert.throws(
    () => writeFramework(docs, Object.assign({ mode: 'private' }, META, { displayName: 'Bad $(id)' }), controls),
    /displayName may not contain/
  );
  assert.equal(fs.existsSync(frameworkDir(docs)), false);
});

test('the CLI writes a shareable framework only with --paraphrases and --terms-permit-derivatives', () => {
  const { root, docs, controls } = setup();
  const meta = path.join(root, 'meta.json');
  const converted = path.join(root, 'converted.json');
  const words = path.join(root, 'paraphrases.json');
  fs.writeFileSync(meta, JSON.stringify(Object.assign({ mode: 'shareable' }, META)));
  fs.writeFileSync(converted, JSON.stringify({ controls, warnings: [] }));
  fs.writeFileSync(words, JSON.stringify(OWN_WORDS));
  const refused = spawnSync('node', [SCRIPT, docs, meta, converted, '--paraphrases', words], { encoding: 'utf8' });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /--terms-permit-derivatives/);
  const run = spawnSync('node', [SCRIPT, docs, meta, converted, '--paraphrases', words, '--terms-permit-derivatives'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).controls, 2);
});
