'use strict';

// Minimal, Node-stdlib-only (.xlsx is a standard ZIP container) reader for the small slice of
// OOXML SpreadsheetML this plugin needs: shared strings + a single worksheet. No npm dependency.

const fs = require('fs');
const zlib = require('zlib');

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;

// ---------------------------------------------------------------------------
// ZIP layer
// ---------------------------------------------------------------------------

function findEndOfCentralDirectory(buf) {
  // EOCD is at least 22 bytes; a trailing archive comment (max 65535 bytes) can follow it, so
  // scan backward far enough to tolerate one.
  const maxCommentLength = 65535;
  const searchFloor = Math.max(0, buf.length - 22 - maxCommentLength);
  for (let i = buf.length - 22; i >= searchFloor; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) {
      return i;
    }
  }
  throw new Error('Not a valid ZIP/.xlsx file: End Of Central Directory record not found');
}

function readCentralDirectory(buf) {
  const eocdOffset = findEndOfCentralDirectory(buf);
  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const centralDirSize = buf.readUInt32LE(eocdOffset + 12);
  const centralDirOffset = buf.readUInt32LE(eocdOffset + 16);

  const entries = new Map();
  let pos = centralDirOffset;
  const centralDirEnd = centralDirOffset + centralDirSize;
  for (let i = 0; i < totalEntries; i++) {
    if (pos + 46 > buf.length || pos >= centralDirEnd + 46) {
      throw new Error('Central directory is truncated or corrupt');
    }
    const signature = buf.readUInt32LE(pos);
    if (signature !== CENTRAL_DIR_SIGNATURE) {
      throw new Error(`Invalid central directory record signature at offset ${pos}`);
    }
    const method = buf.readUInt16LE(pos + 10);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const uncompressedSize = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localHeaderOffset = buf.readUInt32LE(pos + 42);
    const nameStart = pos + 46;
    const name = buf.toString('utf8', nameStart, nameStart + nameLen);
    entries.set(name, { localHeaderOffset, compressedSize, uncompressedSize, method });
    pos = nameStart + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readEntryData(buf, entry) {
  const { localHeaderOffset, compressedSize, method } = entry;
  const signature = buf.readUInt32LE(localHeaderOffset);
  if (signature !== LOCAL_FILE_SIGNATURE) {
    throw new Error(`Invalid local file header signature at offset ${localHeaderOffset}`);
  }
  // The local header's own name/extra-field lengths determine the real data offset -- these can
  // differ from the central directory's, so don't trust the central directory's offset blindly.
  const nameLen = buf.readUInt16LE(localHeaderOffset + 26);
  const extraLen = buf.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + nameLen + extraLen;
  const compressedData = buf.subarray(dataStart, dataStart + compressedSize);

  if (method === 0) {
    return Buffer.from(compressedData);
  }
  if (method === 8) {
    return zlib.inflateRawSync(compressedData);
  }
  throw new Error(`Unsupported ZIP compression method: ${method}`);
}

function openZip(filePath) {
  const buf = fs.readFileSync(filePath);
  const central = readCentralDirectory(buf);
  return {
    hasEntry(name) {
      return central.has(name);
    },
    readEntry(name) {
      const entry = central.get(name);
      if (!entry) return null;
      return readEntryData(buf, entry);
    },
  };
}

// ---------------------------------------------------------------------------
// XML-entity decoding
// ---------------------------------------------------------------------------

// &amp; must be decoded last, otherwise an already-encoded "&amp;lt;" would double-decode into "<".
function decodeXmlEntities(str) {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&');
}

// ---------------------------------------------------------------------------
// sharedStrings.xml
// ---------------------------------------------------------------------------

function parseSharedStrings(xml) {
  const items = [];
  const siRegex = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g;
  const tRegex = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let siMatch;
  while ((siMatch = siRegex.exec(xml))) {
    const inner = siMatch[1];
    let text = '';
    let tMatch;
    tRegex.lastIndex = 0;
    while ((tMatch = tRegex.exec(inner))) {
      text += decodeXmlEntities(tMatch[1]);
    }
    items.push(text);
  }
  return items;
}

// ---------------------------------------------------------------------------
// worksheet (sheet1.xml)
// ---------------------------------------------------------------------------

// "A" -> 0, "B" -> 1, ..., "Z" -> 25, "AA" -> 26, ...
function columnLettersToIndex(letters) {
  let index = 0;
  for (let i = 0; i < letters.length; i++) {
    index = index * 26 + (letters.charCodeAt(i) - 64);
  }
  return index - 1;
}

function parseCell(attrs, inner, sharedStrings) {
  const rMatch = /\br="([^"]+)"/.exec(attrs);
  const tMatch = /\bt="([^"]+)"/.exec(attrs);
  const cellType = tMatch ? tMatch[1] : null;

  let colIndex = null;
  if (rMatch) {
    const lettersMatch = /^([A-Za-z]+)/.exec(rMatch[1]);
    if (lettersMatch) colIndex = columnLettersToIndex(lettersMatch[1].toUpperCase());
  }

  let value = '';
  if (inner != null) {
    if (cellType === 's') {
      const vMatch = /<v>([\s\S]*?)<\/v>/.exec(inner);
      if (vMatch) {
        const idx = parseInt(vMatch[1], 10);
        value = sharedStrings[idx] != null ? sharedStrings[idx] : '';
      }
    } else if (cellType === 'inlineStr') {
      const isMatch = /<is>([\s\S]*?)<\/is>/.exec(inner);
      if (isMatch) {
        const tRegex = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
        let text = '';
        let tMatch2;
        while ((tMatch2 = tRegex.exec(isMatch[1]))) {
          text += decodeXmlEntities(tMatch2[1]);
        }
        value = text;
      }
    } else {
      // t="str" (formula result string), or no t attribute at all (plain number/value) --
      // in both cases the current cached value lives in <v>, ignore any <f> formula text.
      const vMatch = /<v>([\s\S]*?)<\/v>/.exec(inner);
      if (vMatch) value = decodeXmlEntities(vMatch[1]);
    }
  }
  return { colIndex, value };
}

function parseRowXml(rowInnerXml, sharedStrings) {
  const cellRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  const found = [];
  let maxCol = -1;
  let match;
  while ((match = cellRegex.exec(rowInnerXml))) {
    const attrs = match[1];
    const inner = match[2] !== undefined ? match[2] : null;
    const { colIndex, value } = parseCell(attrs, inner, sharedStrings);
    if (colIndex != null) {
      found.push({ colIndex, value });
      if (colIndex > maxCol) maxCol = colIndex;
    }
  }
  const row = new Array(maxCol + 1).fill('');
  for (const cell of found) row[cell.colIndex] = cell.value;
  return row;
}

// Returns an array of row arrays (each an array of cell strings, padded with '' up to that row's
// own highest referenced column so column alignment is preserved). Row 0 is the header row.
function parseWorkbookSheet(filePath) {
  const zip = openZip(filePath);

  const sharedStringsXml = zip.readEntry('xl/sharedStrings.xml');
  const sharedStrings = sharedStringsXml ? parseSharedStrings(sharedStringsXml.toString('utf8')) : [];

  const sheetXml = zip.readEntry('xl/worksheets/sheet1.xml');
  if (!sheetXml) {
    throw new Error('xl/worksheets/sheet1.xml not found in workbook');
  }
  const sheetText = sheetXml.toString('utf8');

  const rowRegex = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  const rows = [];
  let match;
  while ((match = rowRegex.exec(sheetText))) {
    const inner = match[2] !== undefined ? match[2] : '';
    rows.push(parseRowXml(inner, sharedStrings));
  }
  return rows;
}

// ---------------------------------------------------------------------------
// e1 export -> structured rows
// ---------------------------------------------------------------------------

const EXPECTED_HEADERS = {
  uniqueId: 'Unique ID',
  type: 'Type',
  level: 'Level',
  relatedControl: 'Related HITRUST CSF Control',
  statementText: 'HITRUST CSF Requirement Statement',
};

// Locates each expected column by matching header text (case-sensitive exact match) rather than
// assuming fixed column letters, since real MyCSF exports may reorder columns.
function parseE1Export(filePath) {
  const rows = parseWorkbookSheet(filePath);
  if (rows.length === 0) {
    throw new Error('Workbook sheet is empty -- no header row found');
  }
  const header = rows[0];
  const colIndex = {};
  const missing = [];
  for (const [key, headerText] of Object.entries(EXPECTED_HEADERS)) {
    const idx = header.indexOf(headerText);
    if (idx === -1) {
      missing.push(headerText);
    } else {
      colIndex[key] = idx;
    }
  }
  if (missing.length > 0) {
    throw new Error(`Missing expected column header(s) in workbook: ${missing.join(', ')}`);
  }

  const results = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const isEmptyRow = row.length === 0 || row.every((cell) => cell === '' || cell == null);
    if (isEmptyRow) continue;
    results.push({
      uniqueId: row[colIndex.uniqueId] || '',
      type: row[colIndex.type] || '',
      level: row[colIndex.level] || '',
      relatedControl: row[colIndex.relatedControl] || '',
      statementText: row[colIndex.statementText] || '',
    });
  }
  return results;
}

module.exports = {
  parseWorkbookSheet,
  parseE1Export,
  decodeXmlEntities,
  openZip,
};

if (require.main === module) {
  const [file] = process.argv.slice(2);
  if (!file) {
    console.error('Usage: node xlsx-lite.js <file.xlsx>');
    process.exit(1);
  }
  console.log(JSON.stringify(parseWorkbookSheet(file), null, 2));
}
