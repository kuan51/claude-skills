'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Appends an evidence record to a control in state.json.
 *
 * Evidence is the durable link between a control and the development artifact that supports it --
 * a merged PR, a commit, a CI run, a scan result, a document. Before this existed the only thing
 * a "met" control stored was free prose in `assessment.justification`, so nothing produced by a
 * development workflow could reach the dashboard except by a human retyping it during an
 * interview.
 *
 * EVIDENCE AND ASSESSMENT ARE INDEPENDENT AXES. This script writes ONLY `control.evidence` and
 * must never touch `control.assessment` -- not `status`, and above all not `assessedAt`.
 * apply-assessment.js's `markCategoryComplete` throws if any control in a domain still has
 * `assessedAt: null`, so that null is load-bearing: it is the difference between "nobody has
 * looked at this yet" and "asked and deferred". Attaching evidence to an unassessed control must
 * not make the domain look completable. That separation is also what lets ciso:audit report the
 * interesting case -- a control marked `met` with no evidence behind it.
 *
 * Shape and guards mirror record-scope.js. Stdlib only -- no npm dependencies.
 */

// Fail-closed allowlist, matching record-scope.js's reasoning: an unrecognized key is a typo or a
// field someone expected this script to understand, and either way rejecting loudly beats writing
// it somewhere the dashboard and the skills will never look at again.
const EVIDENCE_FIELDS = new Set(['kind', 'ref', 'summary']);

// Closed enum. Deliberately coarse -- these describe where an artifact came from, not a taxonomy
// of compliance evidence. "manual" is the escape hatch for anything asserted without an artifact.
const EVIDENCE_KINDS = new Set(['pr', 'commit', 'ci-run', 'scan', 'doc', 'manual']);

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function validate(record) {
  for (const key of Object.keys(record)) {
    if (!EVIDENCE_FIELDS.has(key)) {
      throw new Error(
        `recordEvidence: unknown evidence field "${key}" -- allowed fields are ${[...EVIDENCE_FIELDS].join(', ')}`
      );
    }
  }

  if (!EVIDENCE_KINDS.has(record.kind)) {
    throw new Error(
      `recordEvidence: kind must be one of ${[...EVIDENCE_KINDS].join(', ')} -- got "${record.kind}"`
    );
  }

  // A reference with no summary is a bare URL nobody can interpret at audit time, and a summary
  // with no reference is just another justification. Both halves are required for the record to
  // be worth more than the prose it supplements.
  if (isBlank(record.ref)) {
    throw new Error('recordEvidence: ref is required (a URL, file path, or commit SHA)');
  }
  if (isBlank(record.summary)) {
    throw new Error('recordEvidence: summary is required -- state what this artifact demonstrates');
  }
}

/**
 * Reads <stateJsonPath>, appends one evidence record to
 * state.certifications[certKey].tiers[tierKey].controls[controlId].evidence, and writes it back.
 * Returns the control's full evidence array.
 */
function recordEvidence(stateJsonPath, certKey, tierKey, controlId, record) {
  if (!certKey) throw new Error('recordEvidence: certKey is required (e.g. "soc2")');
  if (!tierKey) throw new Error('recordEvidence: tierKey is required (e.g. "type2")');
  if (!controlId) throw new Error('recordEvidence: controlId is required');
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('recordEvidence: record must be an object with kind, ref and summary');
  }

  validate(record);

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const tier = state
    && state.certifications
    && state.certifications[certKey]
    && state.certifications[certKey].tiers
    && state.certifications[certKey].tiers[tierKey];

  if (!tier) {
    throw new Error(`recordEvidence: tier ${certKey}/${tierKey} not found in state.json -- register it first.`);
  }

  const control = tier.controls && tier.controls[controlId];
  if (!control) {
    throw new Error(`recordEvidence: control "${controlId}" not found in ${certKey}/${tierKey}.`);
  }

  // Missing array rather than empty array is the normal case for any control registered before
  // this field shipped -- coerce instead of migrating.
  if (!Array.isArray(control.evidence)) control.evidence = [];

  control.evidence.push({
    kind: record.kind,
    ref: String(record.ref).trim(),
    summary: String(record.summary).trim(),
    recordedAt: new Date().toISOString(),
  });

  fs.writeFileSync(stateJsonPath, JSON.stringify(state, null, 2) + '\n');
  return control.evidence;
}

module.exports = { recordEvidence, EVIDENCE_KINDS };

if (require.main === module) {
  const [targetDir, certKey, tierKey, controlId, recordJson] = process.argv.slice(2);
  if (!targetDir || !certKey || !tierKey || !controlId || !recordJson) {
    console.error("Usage: node record-evidence.js <target-dir> <certKey> <tierKey> <controlId> '<jsonRecord>'");
    process.exit(1);
  }
  const stateJsonPath = path.join(targetDir, 'state.json');
  if (!fs.existsSync(stateJsonPath)) {
    console.error(`No state.json found at ${stateJsonPath} -- run ciso:init first.`);
    process.exit(1);
  }
  try {
    console.log(JSON.stringify(recordEvidence(stateJsonPath, certKey, tierKey, controlId, JSON.parse(recordJson)), null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
