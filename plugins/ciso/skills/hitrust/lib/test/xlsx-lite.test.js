'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { parseWorkbookSheet, parseE1Export, decodeXmlEntities } = require('../xlsx-lite.js');

const FIXTURE = path.join(__dirname, 'fixtures', 'sample-e1-export.xlsx');

test('parseWorkbookSheet returns the header row plus every data row in document order', () => {
  const rows = parseWorkbookSheet(FIXTURE);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0], [
    'Related HITRUST CSF Control',
    'Unique ID',
    'HITRUST CSF Requirement Statement',
    'Type',
    'Level',
  ]);
});

test('parseWorkbookSheet resolves shared strings, including a reused string and a rich-text run', () => {
  const rows = parseWorkbookSheet(FIXTURE);
  // "1" (Level) is reused across all three data rows.
  assert.equal(rows[1][4], '1');
  assert.equal(rows[2][4], '1');
  assert.equal(rows[3][4], '1');
  // "Organizational" (Type) is reused across two non-adjacent rows.
  assert.equal(rows[1][3], 'Organizational');
  assert.equal(rows[3][3], 'Organizational');
  // Rich-text run (<r><t>...</t></r> x2) concatenates into one string.
  assert.equal(
    rows[1][2],
    'The organization shall establish, document, and disseminate an information security policy.'
  );
});

test('parseWorkbookSheet decodes XML entities, with &amp; decoded last', () => {
  const rows = parseWorkbookSheet(FIXTURE);
  assert.equal(rows[2][2], 'Contractual clause referencing AT&T Test requirements.');
});

test('decodeXmlEntities does not double-decode an already-encoded &amp;lt;', () => {
  assert.equal(decodeXmlEntities('&amp;lt;'), '&lt;');
});

test('decodeXmlEntities handles numeric character references', () => {
  assert.equal(decodeXmlEntities('&#65;&#x42;'), 'AB');
});

test('parseE1Export maps columns by header text regardless of their order in the sheet', () => {
  const rows = parseE1Export(FIXTURE);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].uniqueId, '0113.04a1Organizational.2');
  assert.equal(rows[0].type, 'Organizational');
  assert.equal(rows[0].level, '1');
  assert.equal(rows[0].relatedControl, '04.a Information Security Policy Document');
  assert.equal(
    rows[0].statementText,
    'The organization shall establish, document, and disseminate an information security policy.'
  );
});

test('parseE1Export returns every data row, including the drift and unmatched-id rows', () => {
  const rows = parseE1Export(FIXTURE);
  const ids = rows.map((r) => r.uniqueId);
  assert.deepEqual(ids, [
    '0113.04a1Organizational.2',
    '0226.09k1Organizational.2',
    'UNKNOWN-ID-999',
  ]);
});

test('parseE1Export throws a clear error naming the missing header column', () => {
  const missingHeaderFixture = path.join(__dirname, 'fixtures', 'missing-header-export.xlsx');
  assert.throws(() => parseE1Export(missingHeaderFixture), /Missing expected column header\(s\).*Level/);
});

test('parseWorkbookSheet throws a clear error for an unreadable/non-existent file', () => {
  assert.throws(() => parseWorkbookSheet(path.join(__dirname, 'fixtures', 'does-not-exist.xlsx')));
});
