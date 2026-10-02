'use strict';

// HITRUST-e1/MyCSF-specific by design: this module parses MyCSF's exact e1 export column headers,
// including the "09.b Change Management" split no column mapping can express. Archiving and
// replacing the tier is the step every import shares, in skills/import/lib/replace-controls.js;
// other frameworks' lists go through skills/import/lib/convert-controls.js instead.

const fs = require('fs');
const path = require('path');
const { parseE1Export } = require('./xlsx-lite.js');
const { replaceTierControls, archiveImportFile } = require('../../import/lib/replace-controls.js');

// Parses the "Related HITRUST CSF Control" cell text the same way a real MyCSF export's
// relatedControlCode/relatedControlName are derived: leading code, then whitespace, then name.
// e.g. "09.b Change Management" -> { code: "09.b", name: "Change Management" }
function parseRelatedControl(text) {
  const match = /^([\d.]+[a-z]*)\s+(.*)$/.exec(String(text || '').trim());
  if (!match) {
    return { code: null, name: String(text || '').trim() };
  }
  return { code: match[1], name: match[2] };
}

function defaultAssessment() {
  return { status: 'not_assessed', justification: null, inProgress: { currentState: null, estimatedCloseness: null }, assessedAt: null };
}

function defaultRoadmap() {
  return { budgetTier: null, vendorResearch: [], recommendation: null, status: 'not_started' };
}

// Parses the org's own licensed e1 export, then WHOLESALE-REPLACES the e1 tier's controls with
// what it contains, through replaceTierControls (archive, replace, reset the session). The shipped
// e1 structure is public-sourced with synthetic ids (e.g. "e1-01-01", see
// hitrust-controls-compiler), so there are no real MyCSF Unique IDs to field-merge onto.
// Never aborts on a malformed row -- only a genuinely unreadable file, a missing required header
// column (both raised by parseE1Export), or an export with zero usable rows is fatal.
function mergeImport(stateJsonPath, xlsxPath) {
  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const tier = state?.certifications?.hitrust?.tiers?.e1;
  if (!tier || !tier.controls) {
    throw new Error(
      "HITRUST e1 tier is not registered in this project's state.json -- run the register flow first."
    );
  }

  const rows = parseE1Export(xlsxPath); // throws on unreadable file / missing header columns

  const warnings = [];
  const newControls = {};
  for (const row of rows) {
    const uniqueId = String(row.uniqueId || '').trim();
    if (!uniqueId) {
      warnings.push('Row skipped: missing Unique ID value.');
      continue;
    }
    if (newControls[uniqueId]) {
      warnings.push(`Duplicate Unique ID "${uniqueId}" in export -- keeping the first occurrence, ignoring the rest.`);
      continue;
    }
    const { code, name } = parseRelatedControl(row.relatedControl);
    newControls[uniqueId] = {
      id: uniqueId,
      type: row.type || null,
      level: row.level !== '' ? Number(row.level) : null,
      relatedControlCode: code,
      relatedControlName: name || null,
      legacyCategoryPrefix: code ? code.split('.')[0] : null,
      statementText: row.statementText || null,
      statementSource: 'imported',
      assessment: defaultAssessment(),
      roadmap: defaultRoadmap(),
    };
  }

  const importedCount = Object.keys(newControls).length;
  if (importedCount === 0) {
    throw new Error('No usable rows found in the export (every row was missing a Unique ID) -- nothing imported; existing controls left untouched.');
  }

  const archivedNow = replaceTierControls(state, 'hitrust', 'e1', newControls, path.basename(xlsxPath));

  fs.writeFileSync(stateJsonPath, JSON.stringify(state, null, 2) + '\n');

  return {
    imported: importedCount,
    archived: archivedNow,
    warnings,
  };
}

module.exports = { mergeImport, parseRelatedControl };

if (require.main === module) {
  const [stateJsonPath, xlsxPath] = process.argv.slice(2);
  if (!stateJsonPath || !xlsxPath) {
    console.error('Usage: node merge-import.js <state.json path> <xlsx path>');
    process.exit(1);
  }
  if (!xlsxPath.toLowerCase().endsWith('.xlsx')) {
    console.error(`Expected a .xlsx file, got: ${xlsxPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(xlsxPath)) {
    console.error(`File not found: ${xlsxPath}`);
    process.exit(1);
  }

  let summary;
  try {
    summary = mergeImport(stateJsonPath, xlsxPath);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  console.log(JSON.stringify(summary, null, 2));
  const destPath = archiveImportFile(path.dirname(stateJsonPath), xlsxPath);
  console.error(`Archived a copy of the import to ${destPath}`);
}
