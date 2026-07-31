'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const STRUCTURE_PATH = path.join(
  __dirname, '..', 'skills', 'soc2', 'controls', 'type2.v2017tsc.structure.json'
);
const structure = JSON.parse(fs.readFileSync(STRUCTURE_PATH, 'utf8'));

// The exact AICPA 2017 Trust Services Criteria enumeration, read directly out of the criteria
// document rather than assembled from secondary write-ups (which disagreed: one enumerated 15
// privacy criteria with P6 ending at P6.2, another said "approximately 18", a third conflated the
// 8 privacy series with 8 criteria -- all wrong; P6 runs P6.1-P6.7).
//
// Accurate enumeration is this file's entire value, so these sets are asserted exactly, not as
// counts: a count-only check would pass on a structure that had the right number of wrong ids.
// If a future TSC revision genuinely changes this, update it here deliberately -- do not relax
// the assertion to make a drifted file pass.
const EXPECTED = {
  CC1: ['CC1.1', 'CC1.2', 'CC1.3', 'CC1.4', 'CC1.5'],
  CC2: ['CC2.1', 'CC2.2', 'CC2.3'],
  CC3: ['CC3.1', 'CC3.2', 'CC3.3', 'CC3.4'],
  CC4: ['CC4.1', 'CC4.2'],
  CC5: ['CC5.1', 'CC5.2', 'CC5.3'],
  CC6: ['CC6.1', 'CC6.2', 'CC6.3', 'CC6.4', 'CC6.5', 'CC6.6', 'CC6.7', 'CC6.8'],
  CC7: ['CC7.1', 'CC7.2', 'CC7.3', 'CC7.4', 'CC7.5'],
  CC8: ['CC8.1'],
  CC9: ['CC9.1', 'CC9.2'],
  A1: ['A1.1', 'A1.2', 'A1.3'],
  C1: ['C1.1', 'C1.2'],
  PI1: ['PI1.1', 'PI1.2', 'PI1.3', 'PI1.4', 'PI1.5'],
  P1: ['P1.1'],
  P2: ['P2.1'],
  P3: ['P3.1', 'P3.2'],
  P4: ['P4.1', 'P4.2', 'P4.3'],
  P5: ['P5.1', 'P5.2'],
  P6: ['P6.1', 'P6.2', 'P6.3', 'P6.4', 'P6.5', 'P6.6', 'P6.7'],
  P7: ['P7.1'],
  P8: ['P8.1'],
};

const TOTAL = Object.values(EXPECTED).reduce((n, ids) => n + ids.length, 0);
const VALID_CATEGORIES = new Set([
  'security', 'availability', 'confidentiality', 'processing-integrity', 'privacy',
]);

function byDomainKey() {
  const groups = {};
  for (const control of structure.controls) {
    (groups[control.domainKey] = groups[control.domainKey] || []).push(control.relatedControlCode);
  }
  return groups;
}

test('the file declares the expected tier, version and authority', () => {
  assert.equal(structure.tier, 'type2');
  assert.equal(structure.controlSetVersion, 'v2017tsc');
  assert.equal(structure.sourceAuthority, 'public-topic-level');
  assert.equal(structure.nonAuthoritative, true);
});

test('every criteria series contains exactly the criteria the AICPA document enumerates', () => {
  const actual = byDomainKey();

  assert.deepEqual(
    Object.keys(actual).sort(),
    Object.keys(EXPECTED).sort(),
    'the set of criteria series must match exactly -- no extra series, none missing'
  );

  for (const series of Object.keys(EXPECTED)) {
    assert.deepEqual(
      actual[series].slice().sort(),
      EXPECTED[series].slice().sort(),
      `series ${series} must contain exactly ${EXPECTED[series].join(', ')}`
    );
  }
});

test('the totals hold: 33 common criteria and 18 privacy criteria, 61 overall', () => {
  const common = structure.controls.filter((c) => c.domainKey.startsWith('CC'));
  const privacy = structure.controls.filter((c) => c.tscCategory === 'privacy');

  assert.equal(common.length, 33, '33 common criteria');
  assert.equal(privacy.length, 18, '18 privacy criteria -- NOT the 8 series, and not the 15 one secondary source claimed');
  assert.equal(structure.controls.length, TOTAL);
  assert.equal(structure.controls.length, 61);
});

test('every control carries a canonical identifier backed by a verification citation', () => {
  for (const control of structure.controls) {
    assert.ok(
      control.relatedControlCode,
      `${control.id} has no relatedControlCode -- every control must map to its canonical identifier`
    );
    assert.ok(
      Array.isArray(control.codeVerifiedBy) && control.codeVerifiedBy.length > 0,
      `${control.id} claims code "${control.relatedControlCode}" with no codeVerifiedBy -- an unverified identifier is worse than none, because it looks canonical`
    );
    for (const url of control.codeVerifiedBy) {
      assert.match(url, /^https:\/\//, `${control.id}: codeVerifiedBy entries must be resolvable https URLs`);
    }
  }
});

test('ids and domain keys are derived from the canonical identifier, not chosen freehand', () => {
  const seen = new Set();
  for (const control of structure.controls) {
    assert.equal(
      control.id,
      `soc2-${control.relatedControlCode.toLowerCase()}`,
      `${control.id} must be soc2-<lowercased criterion code>`
    );
    assert.ok(!seen.has(control.id), `duplicate control id: ${control.id}`);
    seen.add(control.id);

    // "CC6.1" -> "CC6", "PI1.3" -> "PI1", "P6.7" -> "P6"
    const series = control.relatedControlCode.split('.')[0];
    assert.equal(
      control.domainKey, series,
      `${control.id}: domainKey must be the criterion's own series (${series}) -- the dashboard groups by it`
    );
  }
});

test('every control ships the fields the dashboard and interview depend on', () => {
  for (const control of structure.controls) {
    assert.ok(control.domain && control.domain.trim().length > 0, `${control.id}: missing domain display name`);
    assert.ok(control.topicLabel && control.topicLabel.trim().length > 0, `${control.id}: missing topicLabel`);
    assert.ok(control.topicSummary && control.topicSummary.trim().length > 0, `${control.id}: missing topicSummary`);
    assert.ok(
      Array.isArray(control.citations) && control.citations.length > 0,
      `${control.id}: needs at least one topic citation (separate from codeVerifiedBy, which justifies the identifier)`
    );
    assert.equal(control.nonAuthoritative, true, `${control.id}: must be flagged non-authoritative`);
    assert.ok(VALID_CATEGORIES.has(control.tscCategory), `${control.id}: unknown tscCategory "${control.tscCategory}"`);
  }
});

test('all four optional categories are represented, and Security is the largest', () => {
  const counts = {};
  for (const control of structure.controls) {
    counts[control.tscCategory] = (counts[control.tscCategory] || 0) + 1;
  }
  assert.deepEqual(counts, {
    security: 33, availability: 3, confidentiality: 2, 'processing-integrity': 5, privacy: 18,
  });
});

test('no provisional/series-level escape hatch survives anywhere in the file', () => {
  // `seriesLevelOnly` marked privacy entries that shipped at series granularity before the
  // enumeration was verified. Its reason is gone; if it reappears, an entry has regressed to a
  // coarser mapping than the canonical identifier this file now guarantees.
  const raw = fs.readFileSync(STRUCTURE_PATH, 'utf8');
  assert.ok(!raw.includes('seriesLevelOnly'), 'seriesLevelOnly must not reappear');
  for (const control of structure.controls) {
    assert.equal(control.provisionalCode, undefined, `${control.id}: provisional codes are not accepted in this file`);
  }
});

test('the coverageNote states the real count and does not still claim Privacy is series-level', () => {
  const note = structure.coverageNote;
  assert.ok(note.includes('61'), 'coverageNote must state the actual entry count');
  assert.ok(note.includes('P6.1-P6.7'), 'coverageNote must record the verified P6 range');
  assert.ok(
    !/Privacy ships at series granularity|series granularity only/i.test(note),
    'coverageNote must no longer claim Privacy ships at series granularity'
  );
});
