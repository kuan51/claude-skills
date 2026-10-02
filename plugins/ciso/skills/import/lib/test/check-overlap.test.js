'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { findOverlaps, tokens } = require('../check-overlap.js');

const SCRIPT = path.join(__dirname, '..', 'check-overlap.js');
const SOURCE = 'Each user of the system shall be assigned a unique account before access is granted.';

function control(fields) {
  return Object.assign({
    id: 'AC-1',
    domain: 'Access Control',
    domainKey: 'access-control',
    topicLabel: 'Personal sign-in',
    topicSummary: 'Nobody shares a login; every person gets their own.',
    source: { id: 'AC-1', domain: 'Access Control', topicLabel: 'Unique accounts', statementText: SOURCE },
  }, fields);
}

test('tokens are Unicode letters and digits, lowercased', () => {
  assert.deepEqual(tokens('Zugriff für ALLE, v2.1!'), ['zugriff', 'für', 'alle', 'v2', '1']);
});

test('a paraphrase in its own words passes', () => {
  assert.deepEqual(findOverlaps([control({})]), []);
});

test('a shared run of 7 words passes and a run of 8 is rejected', () => {
  // The first shares "of the system shall be assigned a" with SOURCE, 7 words; the second shares 10.
  assert.deepEqual(findOverlaps([control({ topicSummary: 'Every person of the system shall be assigned a login.' })]), []);
  const rejected = findOverlaps([control({ topicSummary: 'Each user of the system shall be assigned a unique login.' })]);
  assert.equal(rejected.length, 1);
  assert.deepEqual([rejected[0].id, rejected[0].field], ['AC-1', 'topicSummary']);
  assert.match(rejected[0].reason, /8 or more words/);
});

test('case and punctuation do not hide a copied run', () => {
  const rejected = findOverlaps([control({ topicSummary: 'EACH user -- of the system! -- shall be assigned: a UNIQUE account' })]);
  assert.equal(rejected.length, 1);
});

test('a short label equal to a source cell is rejected, after normalising', () => {
  const rejected = findOverlaps([control({ topicLabel: 'Unique  Accounts.' })]);
  assert.deepEqual(rejected.map((r) => [r.field, r.reason]), [['topicLabel', 'equals a source cell']]);
});

test('a domain equal to its source cell passes, but a domain sharing an 8-word run does not', () => {
  assert.deepEqual(findOverlaps([control({ domain: 'access control' })]), []);
  const rejected = findOverlaps([control({ domain: 'Each user of the system shall be assigned' })]);
  assert.deepEqual(rejected.map((r) => r.field), ['domain']);
});

test('a control with no source cells is rejected rather than passed unchecked', () => {
  const c = control({});
  delete c.source;
  assert.match(findOverlaps([c])[0].reason, /no source cells/);
});

test('the CLI exits 1 and prints the rejections when any control overlaps', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-overlap-'));
  const ok = path.join(dir, 'ok.json');
  const bad = path.join(dir, 'bad.json');
  fs.writeFileSync(ok, JSON.stringify({ controls: [control({})] }));
  fs.writeFileSync(bad, JSON.stringify({ controls: [control({ topicLabel: 'unique accounts' })] }));
  const good = spawnSync('node', [SCRIPT, ok], { encoding: 'utf8' });
  assert.equal(good.status, 0, good.stderr);
  assert.deepEqual(JSON.parse(good.stdout), { rejections: [] });
  const run = spawnSync('node', [SCRIPT, bad], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.equal(JSON.parse(run.stdout).rejections[0].field, 'topicLabel');
});
