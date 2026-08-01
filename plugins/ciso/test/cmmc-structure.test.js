'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CONTROLS = path.join(__dirname, '..', 'skills', 'cmmc', 'controls');
const load = (tier) =>
  JSON.parse(fs.readFileSync(path.join(CONTROLS, `${tier}.v32cfr170.structure.json`), 'utf8'));

const level1 = load('level1');
const level2 = load('level2');
const level3 = load('level3');

// The exact enumerations, asserted as sets rather than counts. A count-only check passes on a
// structure that has the right number of WRONG ids, which is the specific failure this file exists
// to prevent -- and the CMMC compile hit it twice: an id merged into a running footer went missing
// without changing the shape of anything, and a 1..n sequentiality check could not see it because a
// missing LAST child still reads as 1..n. If a future rule revision genuinely changes these, update
// them here deliberately; do not relax an assertion to make a drifted file pass.

// 48 CFR 52.204-21(b)(1)(i)-(xv), read from the eCFR API.
const LEVEL1 = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv'];

// NIST SP 800-171 R2, cross-checked against that document's own Appendix D mapping tables.
const LEVEL2 = {
  '3.1': ['3.1.1', '3.1.2', '3.1.3', '3.1.4', '3.1.5', '3.1.6', '3.1.7', '3.1.8', '3.1.9', '3.1.10', '3.1.11', '3.1.12', '3.1.13', '3.1.14', '3.1.15', '3.1.16', '3.1.17', '3.1.18', '3.1.19', '3.1.20', '3.1.21', '3.1.22'],
  '3.2': ['3.2.1', '3.2.2', '3.2.3'],
  '3.3': ['3.3.1', '3.3.2', '3.3.3', '3.3.4', '3.3.5', '3.3.6', '3.3.7', '3.3.8', '3.3.9'],
  '3.4': ['3.4.1', '3.4.2', '3.4.3', '3.4.4', '3.4.5', '3.4.6', '3.4.7', '3.4.8', '3.4.9'],
  '3.5': ['3.5.1', '3.5.2', '3.5.3', '3.5.4', '3.5.5', '3.5.6', '3.5.7', '3.5.8', '3.5.9', '3.5.10', '3.5.11'],
  '3.6': ['3.6.1', '3.6.2', '3.6.3'],
  '3.7': ['3.7.1', '3.7.2', '3.7.3', '3.7.4', '3.7.5', '3.7.6'],
  '3.8': ['3.8.1', '3.8.2', '3.8.3', '3.8.4', '3.8.5', '3.8.6', '3.8.7', '3.8.8', '3.8.9'],
  '3.9': ['3.9.1', '3.9.2'],
  '3.10': ['3.10.1', '3.10.2', '3.10.3', '3.10.4', '3.10.5', '3.10.6'],
  '3.11': ['3.11.1', '3.11.2', '3.11.3'],
  '3.12': ['3.12.1', '3.12.2', '3.12.3', '3.12.4'],
  '3.13': ['3.13.1', '3.13.2', '3.13.3', '3.13.4', '3.13.5', '3.13.6', '3.13.7', '3.13.8', '3.13.9', '3.13.10', '3.13.11', '3.13.12', '3.13.13', '3.13.14', '3.13.15', '3.13.16'],
  '3.14': ['3.14.1', '3.14.2', '3.14.3', '3.14.4', '3.14.5', '3.14.6', '3.14.7'],
};

// The 24 of NIST SP 800-172's 35 enhanced requirements that 32 CFR 170.14(c)(4) selects.
const LEVEL3 = [
  '3.1.2e', '3.1.3e', '3.2.1e', '3.2.2e', '3.4.1e', '3.4.2e', '3.4.3e', '3.5.1e', '3.5.3e',
  '3.6.1e', '3.6.2e', '3.9.2e', '3.11.1e', '3.11.2e', '3.11.3e', '3.11.4e', '3.11.5e', '3.11.6e',
  '3.11.7e', '3.12.1e', '3.13.4e', '3.14.1e', '3.14.3e', '3.14.6e',
];

const codes = (s) => s.controls.map((c) => c.relatedControlCode);

test('each tier declares the expected tier key, control-set version and authority', () => {
  for (const [tier, s] of [['level1', level1], ['level2', level2], ['level3', level3]]) {
    assert.equal(s.tier, tier);
    assert.equal(s.controlSetVersion, 'v32cfr170');
    // Unlike every other ciso module, this one ships the publisher's own words -- US Government
    // works carry no copyright. The authority string is what tells the dashboard and the verbs so.
    assert.equal(s.sourceAuthority, 'publisher-verbatim');
    assert.equal(s.nonAuthoritative, true);
  }
});

test('Level 1 is exactly the fifteen paragraphs of 48 CFR 52.204-21(b)(1)', () => {
  assert.deepEqual(
    codes(level1),
    LEVEL1.map((n) => `52.204-21(b)(1)(${n})`),
  );
});

test('every Level 2 family contains exactly the requirements NIST SP 800-171 R2 enumerates', () => {
  const byFamily = {};
  for (const c of level2.controls) (byFamily[c.domainKey] ||= []).push(c.relatedControlCode);
  assert.deepEqual(Object.keys(byFamily).sort(), Object.keys(LEVEL2).sort());
  for (const [family, expected] of Object.entries(LEVEL2)) {
    assert.deepEqual(byFamily[family], expected, `family ${family} drifted`);
  }
});

test('the totals hold: 15 at Level 1, 110 across 14 families at Level 2, 24 at Level 3', () => {
  assert.equal(level1.controls.length, 15);
  assert.equal(level2.controls.length, 110);
  assert.equal(Object.values(LEVEL2).reduce((n, ids) => n + ids.length, 0), 110);
  assert.equal(new Set(level2.controls.map((c) => c.domainKey)).size, 14);
  assert.equal(level3.controls.length, 24);
});

test('Level 3 is exactly the subset 32 CFR 170.14(c)(4) selects from NIST SP 800-172', () => {
  assert.deepEqual([...codes(level3)].sort(), [...LEVEL3].sort());
});

test('every requirement carries a canonical identifier backed by a verification citation', () => {
  for (const s of [level1, level2, level3]) {
    for (const c of s.controls) {
      assert.ok(c.relatedControlCode, `${c.id} has no relatedControlCode`);
      assert.ok(Array.isArray(c.codeVerifiedBy) && c.codeVerifiedBy.length > 0,
        `${c.id} has no codeVerifiedBy citation`);
    }
  }
});

test('ids are derived from the canonical identifier and namespaced by tier', () => {
  // 3.1.2 is a Level 2 requirement and 3.1.2e a Level 3 one; without the prefix they would
  // near-collide in a shared state.json, and apply-assessment.js is keyed by id.
  for (const [prefix, s] of [['cmmc-l1-', level1], ['cmmc-l2-', level2], ['cmmc-l3-', level3]]) {
    for (const c of s.controls) assert.ok(c.id.startsWith(prefix), `${c.id} lacks the ${prefix} prefix`);
  }
  for (const c of level2.controls) assert.equal(c.id, `cmmc-l2-${c.relatedControlCode}`);
  for (const c of level3.controls) assert.equal(c.id, `cmmc-l3-${c.relatedControlCode}`);
  const all = [...level1.controls, ...level2.controls, ...level3.controls].map((c) => c.id);
  assert.equal(new Set(all).size, all.length, 'control ids collide across tiers');
});

test('every requirement ships the fields the dashboard and interview depend on', () => {
  for (const s of [level1, level2, level3]) {
    assert.ok(Array.isArray(s.citations) && s.citations.length > 0, `${s.tier} has no citations`);
    for (const c of s.controls) {
      for (const field of ['id', 'domain', 'domainKey', 'topicLabel', 'topicSummary']) {
        assert.ok(c[field] && String(c[field]).trim().length > 0, `${c.id} is missing ${field}`);
      }
    }
  }
});

test('no per-control field repeats a value that is constant across the file', () => {
  // The ISO compile shipped citations and a corroboration array byte-identical on all 123 controls,
  // which bloated the file and printed the same row on every dashboard card. Anything genuinely
  // constant belongs at file level -- `sourceAuthority` already carries "these are verbatim", and
  // `tier` already carries which CMMC level this is.
  for (const s of [level1, level2, level3]) {
    for (const c of s.controls) {
      assert.equal(c.citations, undefined, `${c.id} repeats the file-level citations`);
      assert.equal(c.requirementTextIsVerbatim, undefined, `${c.id} duplicates sourceAuthority`);
      assert.equal(c.cmmcLevel, undefined, `${c.id} duplicates the tier`);
    }
  }
});

test('the requirement text is verbatim, and the derived label is never mistaken for it', () => {
  for (const s of [level1, level2, level3]) {
    // The verbatim claim is made once, at file level, not repeated on every control.
    assert.equal(s.sourceAuthority, 'publisher-verbatim');
    for (const c of s.controls) {
      // Verbatim regulatory text is a complete sentence. A fragment means the extractor truncated.
      assert.match(c.topicSummary, /\.\s*$/, `${c.id}'s summary is not a complete sentence`);
      // Labels are ours, cut from the requirement's opening clause -- they must never end on a
      // dangling connective, which reads as a truncation bug rather than a title.
      assert.doesNotMatch(c.topicLabel, /\b(and|or|of|to|for|in|on|with|by|the|a|an|as|at|from|that)$/i,
        `${c.id}'s label ends on a dangling connective`);
      // A footnote marker riding along on the terminal period is the specific extraction artifact
      // that survived the first pass ("...non-privileged accounts.24 25").
      assert.doesNotMatch(c.topicSummary, /\.\d+(\s+\d+)*\s*$/, `${c.id}'s summary carries a footnote marker`);
    }
  }
});

test('each coverageNote warns that CMMC binds a withdrawn NIST revision', () => {
  // The single most consequential thing a CMMC user can get wrong: reading the CURRENT NIST
  // publication (Rev 3) and assessing against a control set the regulation does not bind.
  for (const s of [level2, level3]) {
    assert.match(s.coverageNote, /withdrew|withdrawn/i);
  }
  assert.match(level2.coverageNote, /800-171/);
  assert.match(level3.coverageNote, /presupposes Level 2|also meet all 110/i);
});

test('no CMMC entry carries a PRISMA maturity dimension', () => {
  // That model is HITRUST r2's and is threaded through the core scripts as an optional per-control
  // feature. A CMMC requirement is met or it is not; leaking a dimension here would change how
  // register-tier and render-dashboard treat the tier.
  for (const s of [level1, level2, level3]) {
    for (const c of s.controls) {
      assert.equal(c.maturityDimensions, undefined, `${c.id} carries a maturity model`);
    }
  }
});
