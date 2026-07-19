'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { mergeImport, parseRelatedControl } = require('../merge-import.js');
const { defaultControl, loadStructure } = require('../register-tier.js');

const FIXTURE = path.join(__dirname, 'fixtures', 'sample-e1-export.xlsx');

// The fixture (plugins/ciso/skills/hitrust/lib/test/fixtures/sample-e1-export.xlsx) has 3 rows:
//   0113.04a1Organizational.2 -- "04.a Information Security Policy Document", no quirks
//   0226.09k1Organizational.2 -- "09.k Controls Against Mobile Code", statement text contains "AT&T"
//     (exercises XML entity decoding)
//   UNKNOWN-ID-999            -- "99.z Unknown Placeholder Control", an id with no bearing on
//     anything previously registered (the shipped e1 structure is now public-sourced with
//     synthetic ids like "e1-01-01", so a real MyCSF export's ids never match those anyway --
//     mergeImport no longer tries to match them at all, see merge-import.js's own docs).

function makeTempState(tierOverrides) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hitrust-merge-import-test-'));
  const stateJsonPath = path.join(dir, 'state.json');
  const structure = loadStructure(); // the bundled public-sourced e1 structure
  const controls = {};
  for (const entry of structure.controls.slice(0, 2)) {
    controls[entry.id] = defaultControl(entry, structure.sourceAuthority);
  }
  const state = {
    certifications: {
      hitrust: {
        displayName: 'HITRUST CSF',
        activeTier: 'e1',
        tiers: {
          e1: Object.assign(
            {
              controlSetVersion: structure.controlSetVersion,
              sourceAuthority: structure.sourceAuthority,
              importedFrom: null,
              importedAt: null,
              controls,
              archivedControls: {},
            },
            tierOverrides
          ),
        },
      },
    },
    interviewSessions: [
      {
        certification: 'hitrust',
        tier: 'e1',
        startedAt: '2020-01-01T00:00:00.000Z',
        lastUpdatedAt: '2020-01-01T00:00:00.000Z',
        domainsCompleted: ['01'],
        domainsRemaining: ['02', '03'],
        status: 'in_progress',
      },
    ],
  };
  fs.writeFileSync(stateJsonPath, JSON.stringify(state, null, 2));
  return { stateJsonPath, placeholderIds: Object.keys(controls) };
}

test('parseRelatedControl splits the leading code from the name', () => {
  assert.deepEqual(parseRelatedControl('09.b Change Management'), { code: '09.b', name: 'Change Management' });
  assert.deepEqual(parseRelatedControl('04.a Information Security Policy Document'), {
    code: '04.a',
    name: 'Information Security Policy Document',
  });
});

test('parseRelatedControl falls back gracefully when the leading-code pattern does not match', () => {
  const result = parseRelatedControl('Not a coded control name');
  assert.equal(result.code, null);
  assert.equal(result.name, 'Not a coded control name');
});

test('mergeImport wholesale-replaces controls with what the real export contains, decoding XML entities correctly', () => {
  const { stateJsonPath } = makeTempState();
  const summary = mergeImport(stateJsonPath, FIXTURE);
  assert.equal(summary.imported, 3);

  const tier = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8')).certifications.hitrust.tiers.e1;
  assert.deepEqual(Object.keys(tier.controls).sort(), ['0113.04a1Organizational.2', '0226.09k1Organizational.2', 'UNKNOWN-ID-999']);

  const clean = tier.controls['0113.04a1Organizational.2'];
  assert.equal(clean.type, 'Organizational');
  assert.equal(clean.level, 1); // coerced to a number, not the XML string "1"
  assert.equal(clean.relatedControlCode, '04.a');
  assert.equal(clean.relatedControlName, 'Information Security Policy Document');
  assert.equal(clean.legacyCategoryPrefix, '04');
  assert.equal(clean.statementText, 'The organization shall establish, document, and disseminate an information security policy.');
  assert.equal(clean.statementSource, 'imported');
  assert.equal(clean.assessment.status, 'not_assessed');
  assert.deepEqual(clean.roadmap, { budgetTier: null, vendorResearch: [], recommendation: null, status: 'not_started' });

  // "AT&T" round-trips correctly through the XML entity decode (was "AT&amp;T" in the raw XML).
  const mobileCode = tier.controls['0226.09k1Organizational.2'];
  assert.equal(mobileCode.statementText, 'Contractual clause referencing AT&T Test requirements.');
  assert.equal(mobileCode.legacyCategoryPrefix, '09');

  // An id with no relationship to anything previously registered imports cleanly too -- there's no
  // matching-by-id step anymore for mergeImport to fail at.
  const unknown = tier.controls['UNKNOWN-ID-999'];
  assert.equal(unknown.relatedControlCode, '99.z');
});

test('mergeImport snapshots the previously-registered controls into archivedControls, tagged import-replaced', () => {
  const { stateJsonPath, placeholderIds } = makeTempState();
  mergeImport(stateJsonPath, FIXTURE);

  const tier = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8')).certifications.hitrust.tiers.e1;
  for (const id of placeholderIds) {
    assert.ok(!(id in tier.controls), `placeholder "${id}" should no longer be in tier.controls`);
    const archived = tier.archivedControls[id];
    assert.ok(archived, `placeholder "${id}" should be archived`);
    assert.equal(archived.archivedReason, 'import-replaced');
    assert.ok(archived.archivedAt && !Number.isNaN(Date.parse(archived.archivedAt)));
    // The archive is a raw, unreconciled snapshot -- the placeholder's own topicLabel/domain
    // survive on the archived copy, not silently dropped.
    assert.ok(archived.topicLabel);
  }
});

test('mergeImport resets the interview session against the real controls, not the old placeholder domains', () => {
  const { stateJsonPath } = makeTempState();
  mergeImport(stateJsonPath, FIXTURE);

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const session = state.interviewSessions.find((s) => s.certification === 'hitrust' && s.tier === 'e1');
  // The real export's legacy category prefixes ("04", "09", "99"), not the placeholder's domainKeys.
  assert.deepEqual(session.domainsRemaining.sort(), ['04', '09', '99']);
  assert.deepEqual(session.domainsCompleted, []);
  assert.equal(session.status, 'in_progress');
});

test('mergeImport flips sourceAuthority/importedFrom/importedAt', () => {
  const { stateJsonPath } = makeTempState();
  mergeImport(stateJsonPath, FIXTURE);

  const tier = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8')).certifications.hitrust.tiers.e1;
  assert.equal(tier.sourceAuthority, 'imported');
  assert.equal(tier.importedFrom, 'sample-e1-export.xlsx'); // basename only, never a full path
  assert.ok(tier.importedAt && !Number.isNaN(Date.parse(tier.importedAt)));
});

test('mergeImport is safe to run a second time -- re-importing archives whatever the first import left behind', () => {
  const { stateJsonPath } = makeTempState();
  mergeImport(stateJsonPath, FIXTURE);
  const summary2 = mergeImport(stateJsonPath, FIXTURE);
  assert.equal(summary2.imported, 3);
  assert.equal(summary2.archived, 3); // the first import's 3 real controls, archived before the second replaces them

  const tier = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8')).certifications.hitrust.tiers.e1;
  // Still exactly 3 live controls (the second import's), not accumulated duplicates.
  assert.equal(Object.keys(tier.controls).length, 3);
});

test('mergeImport throws if the e1 tier has not been registered yet', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hitrust-merge-import-test-'));
  const stateJsonPath = path.join(dir, 'state.json');
  fs.writeFileSync(stateJsonPath, JSON.stringify({ certifications: {}, interviewSessions: [] }, null, 2));
  assert.throws(() => mergeImport(stateJsonPath, FIXTURE), /not registered/);
});
