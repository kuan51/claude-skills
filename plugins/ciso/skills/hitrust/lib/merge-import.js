'use strict';

const fs = require('fs');
const path = require('path');
const { parseE1Export } = require('./xlsx-lite.js');
const { computeDomains } = require('./register-tier.js');

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

// The shipped e1.v11.8.structure.json is public-sourced (topic/domain-only synthetic ids, e.g.
// "e1-01-01" -- see hitrust-controls-compiler) and carries no real MyCSF Unique IDs to match
// against. So importing an org's own real, licensed export can't be a field-merge onto existing
// ids the way older versions of this function worked -- there's usually nothing to match. Instead
// this WHOLESALE-REPLACES the tier's controls with what the real export actually contains:
//   1. Snapshot whatever controls are currently registered (public placeholders, or a prior import)
//      into archivedControls, tagged `archivedReason: "import-replaced"` -- raw, unreconciled
//      insurance, not an attempt to carry assessment answers forward onto the real controls (their
//      ids don't correspond to anything in common, so there's nothing safe to carry forward).
//   2. Replace tier.controls outright with the real controls parsed from the export.
//   3. Reset the interview session's domainsRemaining/domainsCompleted against the real controls'
//      own category structure, since it's a different grouping than whatever the org was
//      interviewing against before.
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

  const archivedAt = new Date().toISOString();
  let archivedNow = 0;
  for (const [id, control] of Object.entries(tier.controls)) {
    tier.archivedControls[id] = Object.assign({}, control, { archivedReason: 'import-replaced', archivedAt });
    archivedNow += 1;
  }

  tier.controls = newControls;
  tier.sourceAuthority = 'imported';
  tier.importedFrom = path.basename(xlsxPath);
  tier.importedAt = archivedAt;

  const session = (state.interviewSessions || []).find(
    (s) => s.certification === 'hitrust' && s.tier === 'e1'
  );
  if (session) {
    session.domainsRemaining = computeDomains({ controls: Object.values(newControls) });
    session.domainsCompleted = [];
    session.status = 'in_progress';
    session.lastUpdatedAt = archivedAt;
  }

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

  // Audit-trail copy, byte-for-byte, no reparsing -- lands inside the already-gitignored target dir.
  const targetDir = path.dirname(stateJsonPath);
  const importsDir = path.join(targetDir, 'imports');
  fs.mkdirSync(importsDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destPath = path.join(importsDir, `${timestamp}-${path.basename(xlsxPath)}`);
  fs.copyFileSync(xlsxPath, destPath);
  console.error(`Archived a copy of the import to ${destPath}`);
}
