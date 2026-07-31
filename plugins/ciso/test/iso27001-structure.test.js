'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const STRUCTURE_PATH = path.join(
  __dirname, '..', 'skills', 'iso27001', 'controls', 'isms.v2022.structure.json'
);
const structure = JSON.parse(fs.readFileSync(STRUCTURE_PATH, 'utf8'));

// Annex A's four themes and their terminal numbers. This is the arithmetic lock that makes a
// RECONSTRUCTED identifier set defensible in the first place (see ADDING-A-CERTIFICATION.md,
// "The middle column is narrow, and has an admission test"): each theme's count equals its own
// terminal integer, and the four sum to 93. A source that is wrong about Annex A therefore breaks
// the arithmetic rather than merely losing a vote -- which is exactly how the compile caught two
// live vendor pages publishing bad data, one ending A.7 at 7.13 while stating 14 controls on the
// same page, another listing A.8.1 as data masking when that is A.8.11.
//
// Asserted as ranges rather than a bare total because a count-only check passes on a file with the
// right number of wrong ids. If ISO revises Annex A, change these deliberately -- do not relax the
// assertion to make a drifted file pass.
const ANNEX_THEMES = { 5: 37, 6: 8, 7: 14, 8: 34 };
const ANNEX_TOTAL = Object.values(ANNEX_THEMES).reduce((n, c) => n + c, 0);

// Clause entries, LEAF headings only -- 6.1, 7.5, 9.2 and 9.3 are parents whose children are what
// actually gets assessed. Unlike Annex A there is no closure argument available here (no primary
// source was reachable, and no published count exists to check against), so this list is a
// deliberate editorial cut recorded in coverageNote, not a canonical enumeration.
const CLAUSES = [
  '4.1', '4.2', '4.3', '4.4',
  '5.1', '5.2', '5.3',
  '6.1.1', '6.1.2', '6.1.3', '6.2', '6.3',
  '7.1', '7.2', '7.3', '7.4', '7.5.1', '7.5.2', '7.5.3',
  '8.1', '8.2', '8.3',
  '9.1', '9.2.1', '9.2.2', '9.3.1', '9.3.2', '9.3.3',
  '10.1', '10.2',
];

// Partitioned on the domainKey prefix rather than a per-control discriminator field. An explicit
// `requirementType` would have been derivable from exactly this, and every derivable field a
// structure file ships also renders as a row on the dashboard -- so it was duplicated data the
// reader had to see 123 times.
const byCode = new Map(structure.controls.map((c) => [c.relatedControlCode, c]));
const annex = structure.controls.filter((c) => c.domainKey.startsWith('A'));
const clauses = structure.controls.filter((c) => c.domainKey.startsWith('CL'));

test('the structure file declares the tier, version and authority the module registers under', () => {
  assert.equal(structure.tier, 'isms');
  assert.equal(structure.controlSetVersion, 'v2022');
  assert.equal(structure.sourceAuthority, 'public-topic-level');
  assert.equal(structure.nonAuthoritative, true);
});

test('Annex A is complete and gap-free: 37/8/14/34 = 93, each theme terminating where its count says', () => {
  assert.equal(annex.length, ANNEX_TOTAL, `expected ${ANNEX_TOTAL} Annex A controls`);

  for (const [theme, count] of Object.entries(ANNEX_THEMES)) {
    const expected = Array.from({ length: count }, (_, i) => `A.${theme}.${i + 1}`);
    const actual = annex
      .filter((c) => c.relatedControlCode.startsWith(`A.${theme}.`))
      .map((c) => c.relatedControlCode);

    assert.deepEqual(
      actual.slice().sort(byNumber), expected,
      `theme A.${theme} must be A.${theme}.1 through A.${theme}.${count} with no gaps`
    );
  }
});

test('every clause entry in the recorded leaf-heading cut is present, and nothing extra', () => {
  assert.deepEqual(clauses.map((c) => c.relatedControlCode), CLAUSES);
});

test('clause and Annex A ids never collide, despite sharing the numbers 5 through 8', () => {
  // Clause 8.1 (operational planning) and A.8.1 (endpoints) are different requirements that would
  // silently overwrite one another in state.json if the `a.` infix were ever dropped from the id.
  const ids = structure.controls.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate control id');

  for (const code of ['5.1', '6.2', '7.2', '8.1']) {
    assert.ok(byCode.has(code), `clause ${code} missing`);
    assert.ok(byCode.has(`A.${code}`), `Annex A control A.${code} missing`);
    assert.notEqual(byCode.get(code).id, byCode.get(`A.${code}`).id);
  }
});

test('every entry carries the fields register-tier.js and the dashboard need', () => {
  for (const control of structure.controls) {
    assert.match(control.id, /^iso27001-/, `${control.id}: id must be certKey-prefixed`);
    assert.ok(control.domain, `${control.id}: needs a domain`);
    assert.match(control.domainKey, /^(CL(4|5|6|7|8|9|10)|A[5-8])$/, `${control.id}: unexpected domainKey "${control.domainKey}"`);
    assert.ok(control.topicLabel, `${control.id}: needs a topicLabel`);
    assert.ok(control.topicSummary, `${control.id}: needs a topicSummary`);
    assert.equal(control.nonAuthoritative, true, `${control.id}: must be marked non-authoritative`);
  }
});

test('identifiers claim corroboration, not verification, and name at least two sources', () => {
  // The distinction is load-bearing: `codeVerifiedBy` means "read out of the publisher's own
  // document" (SOC 2), and ISO's is sold rather than published. Using that field name here would
  // silently upgrade a weaker claim, so the weaker field is required and the stronger one banned.
  for (const control of structure.controls) {
    assert.equal(
      control.codeVerifiedBy, undefined,
      `${control.id}: must not claim codeVerifiedBy -- ISO/IEC 27001:2022 was not read directly`
    );
    assert.ok(
      Array.isArray(control.codeCorroboratedBy) && control.codeCorroboratedBy.length >= 2,
      `${control.id}: needs at least two independent codeCorroboratedBy sources`
    );
    for (const url of control.codeCorroboratedBy) {
      assert.match(url, /^https:\/\//, `${control.id}: codeCorroboratedBy entries must be https URLs`);
    }
  }
});

// SOC 2 ships both `citations` and `codeVerifiedBy` because for it they are genuinely different --
// topic sources vs the document the identifier was read from. ISO's sources corroborate both, so
// this module ships one field. Copying it into `citations` to match SOC 2's shape would render the
// same URLs twice on every control: once under "Sources", once via the dashboard's extra-fields
// block. That is what this guards, and it is how the duplication got shipped the first time.
test('no field duplicates codeCorroboratedBy -- one provenance list, rendered once', () => {
  for (const control of structure.controls) {
    for (const [field, value] of Object.entries(control)) {
      if (field === 'codeCorroboratedBy') continue;
      assert.notDeepEqual(
        value, control.codeCorroboratedBy,
        `${control.id}: "${field}" is a copy of codeCorroboratedBy -- ship one list, not two`
      );
    }
  }
});

// Same rule, one level up: a field whose value is always recoverable from another field is data the
// reader has to skim past on all 123 control cards.
test('no per-control field is derivable from domain or domainKey', () => {
  for (const control of structure.controls) {
    for (const [field, value] of Object.entries(control)) {
      if (field === 'domain' || field === 'domainKey') continue;
      if (typeof value !== 'string') continue;
      assert.notEqual(value, control.domainKey, `${control.id}: "${field}" just restates domainKey`);
      assert.notEqual(
        value.toLowerCase(), control.domain.toLowerCase(),
        `${control.id}: "${field}" just restates domain`
      );
    }
  }
});

// The middle column of ADDING-A-CERTIFICATION.md's reachability table requires TWO things, and this
// is the second: a named, reachable publisher artifact the closure can be checked against. Closure
// alone only proves the published counts agree with each other -- sources sharing one wrong upstream
// number close just as neatly. Without this field the module is claiming the column on half its
// admission test.
test('a publisher artifact is named, so the closure is checkable against something ISO controls', () => {
  assert.ok(structure.publisherArtifact, 'structure must name the publisher artifact');
  assert.match(structure.publisherArtifact, /^https:\/\//);
  assert.ok(
    structure.citations.includes(structure.publisherArtifact),
    'the publisher artifact must also appear in citations, where a reader will look for it'
  );
});

// Naming an artifact makes it tempting to imply more was done with it than was, in either direction.
// A maintainer read the preview's contents and confirmed the four terminal numbers -- so the
// enumeration rests on the publisher. Nothing else does: the per-control subjects and the "A." prefix
// are still secondary, and ISO 27001 itself was never obtained. Both halves have to stay in the
// prose, which is why this asserts the limits and not just the confirmation.
test('coverageNote records the artifact check and its limits, overstating in neither direction', () => {
  const note = structure.coverageNote;
  assert.match(
    note, /CONFIRMED BY A MAINTAINER READING THAT DOCUMENT DIRECTLY/,
    'coverageNote must record that the terminal numbers were read from the publisher artifact'
  );
  assert.match(
    note, /never obtained/,
    'coverageNote must still say ISO/IEC 27001:2022 itself was never obtained'
  );
  assert.match(
    note, /does NOT cover the per-control subject assignments/,
    'coverageNote must scope the artifact check to the enumeration, not the subjects'
  );
});

test('coverageNote states the weaker provenance rather than implying the standard was read', () => {
  const note = structure.coverageNote;
  assert.match(note, /RECONSTRUCTED FROM CONVERGENT PUBLIC SOURCES/,
    'coverageNote must say identifiers were reconstructed, not read');
  assert.match(note, /PARAPHRASE/,
    'coverageNote must say the labels and summaries are our own wording, not ISO\'s');
  assert.match(note, /\b30\b/, 'coverageNote must record the clause granularity actually used');
});

// ISO's own control titles are its copyrighted expression. This is a smoke check, not proof of
// non-infringement: it catches the specific mistake of pasting the published title list in as
// topicLabels, which is the way this would realistically go wrong.
test('topicLabels are not the published ISO control titles', () => {
  const published = new Map([
    ['A.5.7', 'threat intelligence'],
    ['A.8.28', 'secure coding'],
    ['A.8.23', 'web filtering'],
    ['A.7.14', 'secure disposal or re-use of equipment'],
    ['A.8.12', 'data leakage prevention'],
  ]);
  let verbatim = 0;
  for (const [code, title] of published) {
    if (byCode.get(code).topicLabel.trim().toLowerCase() === title) verbatim++;
  }
  assert.ok(
    verbatim <= 2,
    `${verbatim} of ${published.size} sampled topicLabels match the published ISO title verbatim -- ` +
    'short factual labels can legitimately collide, but a clean sweep means the title list was pasted in'
  );
});

function byNumber(a, b) {
  const n = (s) => Number(s.split('.').pop());
  return n(a) - n(b);
}
