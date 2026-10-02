#!/usr/bin/env node
'use strict';

/**
 * Turns a controls list into ciso controls, by a mapping from ciso field to source header.
 * The list is a .csv, an .xlsx (its first sheet) or a .json array of objects. Anything else
 * Claude can read is first extracted into such a JSON array.
 *
 * Usage:
 *   node convert-controls.js headers <file>                  the file's headers, as JSON
 *   node convert-controls.js convert <file> <mapping.json>   { controls, warnings } as JSON on
 *                                                            stdout; each warning also on stderr
 *
 * A file-level problem (unreadable, a bad mapping, no usable rows) is an error and exit 1. A
 * problem with one row skips that row with a warning naming it. Stdlib only.
 */

const fs = require('fs');
const path = require('path');
const { parseWorkbookSheet, MAX_FILE_BYTES } = require('../../hitrust/lib/xlsx-lite.js');

const FIELDS = ['id', 'domain', 'domainKey', 'topicLabel', 'topicSummary', 'statementText', 'relatedControlCode'];
const REQUIRED = ['id', 'domain'];
// frameworks.js holds every id and domainKey to this, because they reach shell commands.
const TOKEN_RE = /^[A-Za-z0-9._-]+$/;

// RFC 4180 CSV: comma-delimited, quoted fields, "" for a quote, newlines inside quotes, CRLF.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (quoted) throw new Error('CSV has an unterminated quoted field');
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// { headers, rows: [{ where, cells: { header: text } }] }, skipping rows with no text at all.
function readTable(file) {
  const size = fs.statSync(file).size;
  if (size > MAX_FILE_BYTES) throw new Error(`${file} is ${size} bytes; the limit is ${MAX_FILE_BYTES}`);
  const ext = path.extname(file).toLowerCase();
  if (ext === '.json') return readJsonTable(file);
  if (ext !== '.csv' && ext !== '.xlsx') throw new Error(`${file}: expected a .csv, .xlsx or .json file`);
  const grid = ext === '.csv' ? parseCsv(fs.readFileSync(file, 'utf8')) : parseWorkbookSheet(file);
  if (grid.length === 0) throw new Error(`${file} is empty -- no header row`);
  const headers = grid[0].map((h) => String(h).trim());
  checkHeaders(headers);
  const rows = [];
  grid.slice(1).forEach((cells, i) => {
    if (cells.every((c) => String(c).trim() === '')) return;
    const byHeader = {};
    headers.forEach((h, col) => { byHeader[h] = cells[col] == null ? '' : String(cells[col]); });
    rows.push({ where: `row ${i + 2}`, cells: byHeader });
  });
  return { headers, rows };
}

function readJsonTable(file) {
  const items = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(items) || items.some((it) => !it || typeof it !== 'object' || Array.isArray(it))) {
    throw new Error(`${file}: a .json controls list must be an array of objects`);
  }
  const headers = [];
  const rows = items.map((it, i) => {
    const cells = {};
    for (const [key, value] of Object.entries(it)) {
      const h = key.trim();
      if (!headers.includes(h)) headers.push(h);
      if (value !== null && typeof value === 'object') throw new Error(`item ${i + 1}: "${key}" is not text`);
      cells[h] = value == null ? '' : String(value);
    }
    return { where: `item ${i + 1}`, cells };
  });
  checkHeaders(headers);
  return { headers, rows };
}

function checkHeaders(headers) {
  const seen = new Set();
  for (const h of headers) {
    if (h && seen.has(h)) throw new Error(`duplicate header "${h}" -- rename one so the mapping can tell them apart`);
    seen.add(h);
  }
}

function checkMapping(mapping, headers) {
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) throw new Error('the mapping must be a JSON object of ciso field to source header');
  for (const field of Object.keys(mapping)) {
    if (!FIELDS.includes(field)) throw new Error(`unknown field "${field}" in the mapping; the fields are ${FIELDS.join(', ')}`);
  }
  for (const field of REQUIRED) {
    if (typeof mapping[field] !== 'string' || !mapping[field]) throw new Error(`the mapping must name a source header for "${field}"`);
  }
  for (const [field, header] of Object.entries(mapping)) {
    if (!headers.includes(header)) throw new Error(`header "${header}" (for ${field}) is not in the file; its headers are: ${headers.join(', ')}`);
  }
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function convertControls(file, mapping) {
  const { headers, rows } = readTable(file);
  checkMapping(mapping, headers);
  const controls = [];
  const warnings = [];
  const seen = new Set();
  for (const { where, cells } of rows) {
    const source = {};
    for (const [field, header] of Object.entries(mapping)) source[field] = cells[header];
    const text = (field) => (source[field] || '').trim();
    const id = text('id');
    if (!id) { warnings.push(`${where}: no id, skipped`); continue; }
    if (!TOKEN_RE.test(id)) { warnings.push(`${where}: id "${id}" has characters other than letters, digits, ".", "_" and "-", skipped`); continue; }
    if (seen.has(id)) { warnings.push(`${where}: duplicate id "${id}", kept the first`); continue; }
    const domain = text('domain');
    if (!domain) { warnings.push(`${where} (${id}): no domain, skipped`); continue; }
    const domainKey = text('domainKey') || slug(domain);
    if (!TOKEN_RE.test(domainKey)) {
      warnings.push(`${where} (${id}): domainKey "${domainKey}" must be letters, digits, ".", "_" or "-" (map a domainKey column), skipped`);
      continue;
    }
    seen.add(id);
    const topicLabel = text('topicLabel') || id;
    const control = { id, domain, domainKey, topicLabel, topicSummary: text('topicSummary') || topicLabel };
    // Verbatim, untrimmed: this is the wording the org's licence covers.
    if (source.statementText && source.statementText.trim()) control.statementText = source.statementText;
    if (text('relatedControlCode')) control.relatedControlCode = text('relatedControlCode');
    control.source = source;
    controls.push(control);
  }
  if (controls.length === 0) throw new Error(`${file}: no usable rows -- every row was skipped${warnings.length ? ` (${warnings[0]}, ...)` : ''}`);
  return { controls, warnings };
}

module.exports = { parseCsv, readTable, convertControls, FIELDS };

function main([cmd, file, mappingFile]) {
  if (cmd === 'headers' && file) {
    console.log(JSON.stringify(readTable(file).headers));
    return 0;
  }
  if (cmd === 'convert' && file && mappingFile) {
    const result = convertControls(file, JSON.parse(fs.readFileSync(mappingFile, 'utf8')));
    for (const w of result.warnings) console.error(w);
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }
  console.error('Usage:\n  node convert-controls.js headers <file>\n  node convert-controls.js convert <file> <mapping.json>');
  return 1;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
