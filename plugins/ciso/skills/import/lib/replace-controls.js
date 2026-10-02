#!/usr/bin/env node
'use strict';

/**
 * The replace step every import shares: archive a registered tier's controls, then replace them
 * wholesale with imported ones. HITRUST's merge-import.js calls it after its MyCSF parsing.
 *
 * As a CLI, it replaces any registered tier whose framework has no flows/import.md of its own,
 * from a controls list and a mapping (see convert-controls.js). Always private: the list's
 * wording is kept verbatim and the tier becomes imported.
 *
 *   node replace-controls.js <docs/ciso-dir> <certKey> <tierKey> <file> <mapping.json>
 *     prints { imported, archived, warnings }; each warning also on stderr
 *
 * Stdlib only.
 */

const fs = require('fs');
const path = require('path');
const { computeDomains, defaultControl } = require('../../hitrust/lib/register-tier.js');
const { BUNDLED_ROOT } = require('../../_shared/frameworks.js');
const { convertControls } = require('./convert-controls.js');

// Imported ids rarely match the registered ones (HITRUST's bundled e1 uses synthetic ids such as
// "e1-01-01"; an export uses the publisher's), so there is no field-level merge:
//   1. Snapshot the registered controls into archivedControls, tagged
//      `archivedReason: "import-replaced"` -- raw insurance, not carried onto the new controls.
//   2. Replace tier.controls outright, and mark the tier imported.
//   3. Reset the tier's interview session to the new controls' own domains.
// `tier` must already be registered; the caller checks, so its error can name the framework.
// Returns how many controls were archived.
function replaceTierControls(state, certKey, tierKey, newControls, importedFrom, now = new Date().toISOString()) {
  const tier = state.certifications[certKey].tiers[tierKey];
  let archived = 0;
  for (const [id, control] of Object.entries(tier.controls)) {
    tier.archivedControls[id] = Object.assign({}, control, { archivedReason: 'import-replaced', archivedAt: now });
    archived += 1;
  }

  tier.controls = newControls;
  tier.sourceAuthority = 'imported';
  tier.importedFrom = importedFrom;
  tier.importedAt = now;

  const session = (state.interviewSessions || []).find((s) => s.certification === certKey && s.tier === tierKey);
  if (session) {
    session.domainsRemaining = computeDomains({ controls: Object.values(newControls) });
    session.domainsCompleted = [];
    session.status = 'in_progress';
    session.lastUpdatedAt = now;
  }
  return archived;
}

// Audit-trail copy, byte-for-byte, into <docs/ciso-dir>/imports/, which is already gitignored.
function archiveImportFile(docsCisoDir, srcPath) {
  const importsDir = path.join(docsCisoDir, 'imports');
  fs.mkdirSync(importsDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destPath = path.join(importsDir, `${timestamp}-${path.basename(srcPath)}`);
  fs.copyFileSync(srcPath, destPath);
  return destPath;
}

function replaceFromList(docsCisoDir, certKey, tierKey, file, mapping) {
  if (fs.existsSync(path.join(BUNDLED_ROOT, certKey, 'flows', 'import.md'))) {
    throw new Error(`${certKey} has its own import flow (frameworks/${certKey}/flows/import.md); follow it instead`);
  }
  const stateJsonPath = path.join(docsCisoDir, 'state.json');
  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const tier = state?.certifications?.[certKey]?.tiers?.[tierKey];
  if (!tier || !tier.controls) throw new Error(`${certKey}/${tierKey} is not registered in ${stateJsonPath} -- register it first`);

  const { controls, warnings } = convertControls(file, mapping); // throws before anything changes
  const newControls = {};
  for (const { source, ...entry } of controls) {
    newControls[entry.id] = defaultControl(entry, 'imported', tierKey, undefined, certKey);
  }
  const archived = replaceTierControls(state, certKey, tierKey, newControls, path.basename(file));
  fs.writeFileSync(stateJsonPath, JSON.stringify(state, null, 2) + '\n');
  return { imported: controls.length, archived, warnings };
}

module.exports = { replaceTierControls, archiveImportFile, replaceFromList };

if (require.main === module) {
  const [docs, certKey, tierKey, file, mappingFile] = process.argv.slice(2);
  if (!mappingFile) {
    console.error('Usage: node replace-controls.js <docs/ciso-dir> <certKey> <tierKey> <file> <mapping.json>');
    process.exit(1);
  }
  try {
    const summary = replaceFromList(docs, certKey, tierKey, file, JSON.parse(fs.readFileSync(mappingFile, 'utf8')));
    for (const w of summary.warnings) console.error(w);
    console.log(JSON.stringify(summary, null, 2));
    console.error(`Archived a copy of the import to ${archiveImportFile(docs, file)}`);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
