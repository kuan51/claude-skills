'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseCsv, readTable, convertControls } = require('../convert-controls.js');
const { MAX_FILE_BYTES } = require('../../../hitrust/lib/xlsx-lite.js');

const SCRIPT = path.join(__dirname, '..', 'convert-controls.js');
const E1_EXPORT = path.join(__dirname, '..', '..', '..', 'hitrust', 'lib', 'test', 'fixtures', 'sample-e1-export.xlsx');

function tmpFile(name, content) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'convert-controls-')), name);
  fs.writeFileSync(file, content);
  return file;
}

const MAPPING = { id: 'Control ID', domain: 'Domain', topicLabel: 'Title', statementText: 'Requirement' };

test('parseCsv handles quoted commas, doubled quotes, newlines in quotes, CRLF and a BOM', () => {
  const text = '﻿a,b,c\r\n1,"x, y","say ""hi"""\r\n2,"line one\nline two",z\n';
  assert.deepEqual(parseCsv(text), [
    ['a', 'b', 'c'],
    ['1', 'x, y', 'say "hi"'],
    ['2', 'line one\nline two', 'z'],
  ]);
});

test('parseCsv refuses an unterminated quoted field', () => {
  assert.throws(() => parseCsv('a,b\n1,"never closed\n'), /unterminated quoted field/);
});

test('readTable trims headers and refuses duplicate ones', () => {
  assert.deepEqual(readTable(tmpFile('t.csv', ' Control ID ,Domain\nA-1,Access\n')).headers, ['Control ID', 'Domain']);
  assert.throws(() => readTable(tmpFile('d.csv', 'Domain,Domain \nA,B\n')), /duplicate header "Domain"/);
});

test('readTable refuses a file over the size cap before reading it', () => {
  const file = tmpFile('big.csv', '');
  fs.truncateSync(file, MAX_FILE_BYTES + 1);
  assert.throws(() => readTable(file), /bytes; the limit is/);
});

test('readTable refuses an unknown extension and a JSON file that is not an array of objects', () => {
  assert.throws(() => readTable(tmpFile('x.txt', 'a')), /\.csv, \.xlsx or \.json/);
  assert.throws(() => readTable(tmpFile('x.json', '{"a":1}')), /array of objects/);
  assert.throws(() => readTable(tmpFile('y.json', '[{"a":{"b":1}}]')), /item 1: "a" is not text/);
});

test('convertControls maps fields, keeps statementText verbatim and records each control\'s source cells', () => {
  const file = tmpFile('acss.csv', 'Control ID,Domain,Title,Requirement\nAC-1,Access Control,Unique accounts,"  Each user shall have\na unique account.  "\n');
  const { controls, warnings } = convertControls(file, MAPPING);
  assert.deepEqual(warnings, []);
  assert.deepEqual(controls, [{
    id: 'AC-1',
    domain: 'Access Control',
    domainKey: 'access-control',
    topicLabel: 'Unique accounts',
    topicSummary: 'Unique accounts',
    statementText: '  Each user shall have\na unique account.  ',
    source: {
      id: 'AC-1', domain: 'Access Control', topicLabel: 'Unique accounts',
      statementText: '  Each user shall have\na unique account.  ',
    },
  }]);
});

test('convertControls defaults an unmapped domainKey, topicLabel and topicSummary', () => {
  const file = tmpFile('min.csv', 'ID,Area\nX.1,"Risk & Governance!"\n');
  const [c] = convertControls(file, { id: 'ID', domain: 'Area' }).controls;
  assert.equal(c.domainKey, 'risk-governance');
  assert.equal(c.topicLabel, 'X.1');
  assert.equal(c.topicSummary, 'X.1');
  assert.equal('statementText' in c, false);
});

test('convertControls skips bad rows with a warning naming each, and keeps the first of a duplicate id', () => {
  const file = tmpFile('rows.csv', [
    'Control ID,Domain,Title,Requirement',
    'AC-1,Access,One,R1',
    ',Access,No id,R2',
    'AC-2(1),Access,Unsafe id,R3',
    'AC-3,,No domain,R4',
    'AC-1,Access,Again,R5',
    'AC-4,"東京",Slugless domain,R6',
    '',
  ].join('\n'));
  const { controls, warnings } = convertControls(file, MAPPING);
  assert.deepEqual(controls.map((c) => [c.id, c.topicLabel]), [['AC-1', 'One']]);
  assert.equal(warnings.length, 5);
  assert.match(warnings[0], /row 3: no id/);
  assert.match(warnings[1], /row 4: id "AC-2\(1\)" .*skipped/);
  assert.match(warnings[2], /row 5 \(AC-3\): no domain/);
  assert.match(warnings[3], /row 6: duplicate id "AC-1"/);
  assert.match(warnings[4], /row 7 \(AC-4\): domainKey "" .*skipped/);
});

test('convertControls refuses a bad mapping, a missing mapped header and a file with no usable rows', () => {
  const file = tmpFile('m.csv', 'Control ID,Domain\nA-1,Access\n');
  assert.throws(() => convertControls(file, { id: 'Control ID' }), /mapping must name a source header for "domain"/);
  assert.throws(() => convertControls(file, { id: 'Control ID', domain: 'Domain', colour: 'Domain' }), /unknown field "colour"/);
  assert.throws(() => convertControls(file, { id: 'Control ID', domain: 'Area' }), /header "Area" \(for domain\) is not in the file/);
  const empty = tmpFile('e.csv', 'Control ID,Domain\n,Access\n');
  assert.throws(() => convertControls(empty, { id: 'Control ID', domain: 'Domain' }), /no usable rows/);
});

test('convertControls reads an xlsx workbook and a JSON array the same way', () => {
  const fromXlsx = convertControls(E1_EXPORT, { id: 'Unique ID', domain: 'Type', statementText: 'HITRUST CSF Requirement Statement' });
  assert.equal(fromXlsx.controls.length, 3);
  assert.equal(fromXlsx.controls[1].statementText, 'Contractual clause referencing AT&T Test requirements.');
  const json = tmpFile('c.json', JSON.stringify([{ 'Control ID': 'A-1', Domain: 'Access', Level: 2 }]));
  assert.deepEqual(convertControls(json, { id: 'Control ID', domain: 'Domain', topicLabel: 'Level' }).controls[0].topicLabel, '2');
});

test('the CLI prints headers, and prints controls on stdout with each warning also on stderr', () => {
  const file = tmpFile('cli.csv', 'Control ID,Domain\nA-1,Access\n,Access\n');
  const headers = spawnSync('node', [SCRIPT, 'headers', file], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(headers.stdout), ['Control ID', 'Domain']);
  const mapping = tmpFile('map.json', JSON.stringify({ id: 'Control ID', domain: 'Domain' }));
  const run = spawnSync('node', [SCRIPT, 'convert', file, mapping], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).controls.length, 1);
  assert.match(run.stderr, /row 3: no id/);
  const bad = spawnSync('node', [SCRIPT, 'convert', file, tmpFile('bad.json', '{"id":"Nope","domain":"Domain"}')], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /header "Nope"/);
});
