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

// --- Hostile files: an import file is untrusted ---

const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const { MAX_FILE_BYTES, MAX_ENTRY_BYTES } = require('../xlsx-lite.js');

// A minimal ZIP writer: deflated entries, CRC left at 0 (the reader never checks it).
function writeZip(file, entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const body = zlib.deflateRawSync(data);
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt32LE(offset, 42);
    parts.push(local, nameBuf, body);
    central.push(entry, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const dir = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(dir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  fs.writeFileSync(file, Buffer.concat([...parts, dir, eocd]));
}

function tmpFile(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'xlsx-lite-test-')), name);
}

function sheet(cellsXml) {
  return Buffer.from(`<worksheet><sheetData><row r="1">${cellsXml}</row></sheetData></worksheet>`);
}

test('writeZip builds a workbook the reader parses, so the hostile cases below test the caps', () => {
  const file = tmpFile('ok.xlsx');
  writeZip(file, [['xl/worksheets/sheet1.xml', sheet('<c r="B1" t="inlineStr"><is><t>x</t></is></c>')]]);
  assert.deepEqual(parseWorkbookSheet(file), [['', 'x']]);
});

test('parseWorkbookSheet refuses a file over the size cap before reading it', () => {
  const file = tmpFile('big.xlsx');
  fs.writeFileSync(file, '');
  fs.truncateSync(file, MAX_FILE_BYTES + 1); // sparse: no real disk use
  assert.throws(() => parseWorkbookSheet(file), /bytes; the limit is/);
});

test('parseWorkbookSheet refuses an entry that inflates past the per-entry cap', () => {
  const file = tmpFile('bomb.xlsx');
  writeZip(file, [['xl/worksheets/sheet1.xml', Buffer.alloc(MAX_ENTRY_BYTES + 1, 0x20)]]);
  assert.throws(() => parseWorkbookSheet(file), /inflates past/);
});

test('parseWorkbookSheet refuses a cell past the last column a spreadsheet can have', () => {
  const file = tmpFile('wide.xlsx');
  writeZip(file, [['xl/worksheets/sheet1.xml', sheet('<c r="ZZZZZZ1" t="inlineStr"><is><t>x</t></is></c>')]]);
  assert.throws(() => parseWorkbookSheet(file), /past the last column/);
});

test('decodeXmlEntities keeps an out-of-range character reference literal instead of throwing', () => {
  assert.equal(decodeXmlEntities('a&#x110000;b&#1114112;c'), 'a&#x110000;b&#1114112;c');
});
