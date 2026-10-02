'use strict';

/**
 * The replace step every import shares: archive a registered tier's controls, then replace them
 * wholesale with imported ones. HITRUST's merge-import.js calls it after its MyCSF parsing.
 * Stdlib only.
 */

const fs = require('fs');
const path = require('path');
const { computeDomains } = require('../../hitrust/lib/register-tier.js');

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

module.exports = { replaceTierControls, archiveImportFile };
