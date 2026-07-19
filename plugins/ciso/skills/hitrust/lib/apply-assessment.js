'use strict';

const fs = require('fs');

// Statuses accepted as interview input. "defer" and "not_assessed" are not persisted verbatim as
// distinct concepts beyond the schema's five status values -- STATUS_MAP below maps "defer" onto
// the stored enum ("not_assessed") while still stamping assessedAt, which is what distinguishes
// "asked but deferred" from "never touched" (assessedAt === null).
const VALID_INPUT_STATUSES = ['met', 'in_progress', 'gap', 'not_applicable', 'defer', 'not_assessed'];
const STATUS_MAP = { defer: 'not_assessed' };

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

// Mechanical backstop for the two hard interview rules. Throws (making NO changes to the file)
// before any read/write happens if:
//   - status === "met" and justification is missing/empty/whitespace-only
//   - status === "in_progress" and either currentState or estimatedCloseness is missing/blank
// On success, always stamps assessment.assessedAt, regardless of status (including "defer").
// `certKey` is required -- this function is certification-agnostic and has no default to guess.
function applyAssessment(stateJsonPath, certKey, tierKey, controlId, payload) {
  if (!certKey) throw new Error('applyAssessment: certKey is required (e.g. "hitrust")');

  const { status, justification, currentState, estimatedCloseness } = payload || {};

  if (!VALID_INPUT_STATUSES.includes(status)) {
    throw new Error(
      `Invalid status "${status}" -- expected one of: met, in_progress, gap, not_applicable, defer`
    );
  }
  if (status === 'met' && isBlank(justification)) {
    throw new Error('A non-empty justification is required when status is "met"');
  }
  if (status === 'in_progress' && (isBlank(currentState) || isBlank(estimatedCloseness))) {
    throw new Error(
      'Both currentState and estimatedCloseness are required when status is "in_progress"'
    );
  }

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const tier = state?.certifications?.[certKey]?.tiers?.[tierKey];
  const control = tier && tier.controls && tier.controls[controlId];
  if (!control) {
    throw new Error(`Control "${controlId}" not found in ${certKey}/${tierKey} -- register the tier first.`);
  }

  const storedStatus = STATUS_MAP[status] || status;

  control.assessment = control.assessment || {};
  control.assessment.status = storedStatus;
  control.assessment.justification = isBlank(justification) ? null : String(justification).trim();
  if (storedStatus === 'in_progress') {
    control.assessment.inProgress = {
      currentState: String(currentState).trim(),
      estimatedCloseness: String(estimatedCloseness).trim(),
    };
  } else {
    // Reset stale in-progress detail when status flips away from "in_progress".
    control.assessment.inProgress = { currentState: null, estimatedCloseness: null };
  }
  control.assessment.assessedAt = new Date().toISOString();

  fs.writeFileSync(stateJsonPath, JSON.stringify(state, null, 2) + '\n');
  return control.assessment;
}

// Same grouping-key fallback used by register-tier.js's computeDomains() and
// render-dashboard.js's computeRollups() -- keep all three identical, or a category passed here
// (taken from session.domainsRemaining, which computeDomains built) won't match any control.
function categoryKeyFor(c) {
  return (c && (c.domainKey || c.legacyCategoryPrefix || c.domain)) || 'unknown';
}

// Throws if any control in `categoryKey` still has assessedAt === null (something was
// missed between the interview Q&A and the apply step -- a hard stop, not a silent skip). On
// success, moves the category from domainsRemaining to domainsCompleted for the matching
// <certKey>/<tierKey> interviewSessions entry, updates lastUpdatedAt, and flips status to
// "completed" once domainsRemaining is empty. Despite the parameter name (kept for backward
// compatibility), this is whatever key computeDomains() produced -- usually a modern domainKey
// ("01".."19"), not literally always a legacy category prefix.
function markCategoryComplete(stateJsonPath, certKey, tierKey, legacyCategoryPrefix) {
  if (!certKey) throw new Error('markCategoryComplete: certKey is required (e.g. "hitrust")');

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const tier = state?.certifications?.[certKey]?.tiers?.[tierKey];
  if (!tier || !tier.controls) {
    throw new Error(`Tier ${certKey}/${tierKey} not found in state.json`);
  }

  const controlsInCategory = Object.values(tier.controls).filter(
    (c) => categoryKeyFor(c) === legacyCategoryPrefix
  );
  if (controlsInCategory.length === 0) {
    throw new Error(`No controls found for category "${legacyCategoryPrefix}" in ${certKey}/${tierKey}`);
  }
  const untouched = controlsInCategory.filter(
    (c) => !c.assessment || c.assessment.assessedAt === null || c.assessment.assessedAt === undefined
  );
  if (untouched.length > 0) {
    throw new Error(
      `Category "${legacyCategoryPrefix}" has ${untouched.length} control(s) never assessed (assessedAt is null): ${untouched
        .map((c) => c.id)
        .join(', ')}`
    );
  }

  if (!Array.isArray(state.interviewSessions)) {
    throw new Error('No interviewSessions array found in state.json');
  }
  const session = state.interviewSessions.find(
    (s) => s.certification === certKey && s.tier === tierKey
  );
  if (!session) {
    throw new Error(`No interview session found for ${certKey}/${tierKey}`);
  }

  session.domainsRemaining = (session.domainsRemaining || []).filter((d) => d !== legacyCategoryPrefix);
  if (!session.domainsCompleted) session.domainsCompleted = [];
  if (!session.domainsCompleted.includes(legacyCategoryPrefix)) {
    session.domainsCompleted.push(legacyCategoryPrefix);
  }
  session.lastUpdatedAt = new Date().toISOString();
  if (session.domainsRemaining.length === 0) {
    session.status = 'completed';
  }

  fs.writeFileSync(stateJsonPath, JSON.stringify(state, null, 2) + '\n');
  return session;
}

module.exports = { applyAssessment, markCategoryComplete };

if (require.main === module) {
  const args = process.argv.slice(2);
  try {
    if (args.length === 5) {
      const [stateJsonPath, certKey, tierKey, controlId, payloadJson] = args;
      let payload;
      try {
        payload = JSON.parse(payloadJson);
      } catch (err) {
        throw new Error(`Invalid JSON payload: ${err.message}`);
      }
      const result = applyAssessment(stateJsonPath, certKey, tierKey, controlId, payload);
      console.log(JSON.stringify(result, null, 2));
    } else if (args.length === 4) {
      const [stateJsonPath, certKey, tierKey, legacyCategoryPrefix] = args;
      const result = markCategoryComplete(stateJsonPath, certKey, tierKey, legacyCategoryPrefix);
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.error('Usage:');
      console.error('  node apply-assessment.js <state.json> <certKey> <tier> <controlId> <jsonPayloadString>');
      console.error('  node apply-assessment.js <state.json> <certKey> <tier> <legacyCategoryPrefix>   (marks category complete)');
      process.exit(1);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
