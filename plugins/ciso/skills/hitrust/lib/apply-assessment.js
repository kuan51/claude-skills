'use strict';

const fs = require('fs');

// Statuses accepted as interview input. "defer" and "not_assessed" are not persisted verbatim as
// distinct concepts beyond the schema's five status values -- STATUS_MAP below maps "defer" onto
// the stored enum ("not_assessed") while still stamping assessedAt, which is what distinguishes
// "asked but deferred" from "never touched" (assessedAt === null).
const VALID_INPUT_STATUSES = ['met', 'in_progress', 'gap', 'not_applicable', 'defer', 'not_assessed'];
const STATUS_MAP = { defer: 'not_assessed' };

// r2's five PRISMA maturity dimensions. Duplicated locally rather than imported from
// register-tier.js, mirroring reconcile-state-version.js's existing "small local
// re-implementation... so this file's module boundary stays independent" precedent.
const R2_DIMENSIONS = ['policy', 'procedure', 'implemented', 'measured', 'managed'];

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function validatePayloadShape(status, justification, currentState, estimatedCloseness) {
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
}

// r2 controls store a `maturity` object (one entry per PRISMA dimension) instead of e1/i1's flat
// `assessment.status` -- see docs/superpowers/specs/2026-07-19-ciso-r2-maturity-architecture-design.md.
// `payload.dimension` selects which of the 5 dimensions this call targets; omitting it is a
// whole-control call, which only accepts status "not_applicable" (engage -- short-circuits all 5
// dimensions to not_applicable) or "not_assessed" (reverse -- clears the whole-control state back
// to null and resets all 5 dimensions to not_assessed).
function applyR2Assessment(control, stateJsonPath, state, payload) {
  const { status, justification, currentState, estimatedCloseness, dimension } = payload;
  const storedStatus = STATUS_MAP[status] || status;

  if (!control.assessment || !control.assessment.maturity) {
    throw new Error(
      `Control "${control.id}" does not have an r2 maturity shape -- was it registered before this schema existed? Re-run register-tier.js.`
    );
  }

  if (dimension === undefined || dimension === null) {
    if (storedStatus !== 'not_applicable' && storedStatus !== 'not_assessed') {
      throw new Error(
        'A whole-control r2 call (no dimension) only accepts status "not_applicable" (to mark the whole control not applicable) or "not_assessed" (to reverse that)'
      );
    }
    const isEngagingNa = storedStatus === 'not_applicable';
    control.assessment.status = isEngagingNa ? 'not_applicable' : null;
    for (const dim of R2_DIMENSIONS) {
      control.assessment.maturity[dim] = {
        status: storedStatus,
        justification: null,
        inProgress: { currentState: null, estimatedCloseness: null },
        // Only the engage path is a real assessment event. Reversing back to not_assessed
        // must clear assessedAt, or isControlTouched() below still reads the control as
        // touched even though it has never actually been assessed on any dimension.
        assessedAt: isEngagingNa ? new Date().toISOString() : null,
      };
    }
    fs.writeFileSync(stateJsonPath, JSON.stringify(state, null, 2) + '\n');
    return control.assessment;
  }

  if (!R2_DIMENSIONS.includes(dimension)) {
    throw new Error(`Invalid dimension "${dimension}" -- expected one of: ${R2_DIMENSIONS.join(', ')}`);
  }
  if (storedStatus === 'not_applicable') {
    throw new Error('Per-dimension not_applicable is not supported for r2 -- use a whole-control call (omit dimension) instead');
  }
  if (control.assessment.status === 'not_applicable') {
    throw new Error('This control is marked whole-control not_applicable -- reverse it first (call with no dimension and status "not_assessed")');
  }
  if (dimension === 'managed' && storedStatus === 'met' && control.assessment.maturity.measured.status !== 'met') {
    throw new Error('"managed" cannot be marked "met" until "measured" is "met" -- HITRUST\'s PRISMA model never scores Managed higher than Measured');
  }

  const dim = control.assessment.maturity[dimension];
  dim.status = storedStatus;
  dim.justification = isBlank(justification) ? null : String(justification).trim();
  if (storedStatus === 'in_progress') {
    dim.inProgress = { currentState: String(currentState).trim(), estimatedCloseness: String(estimatedCloseness).trim() };
  } else {
    dim.inProgress = { currentState: null, estimatedCloseness: null };
  }
  dim.assessedAt = new Date().toISOString();

  fs.writeFileSync(stateJsonPath, JSON.stringify(state, null, 2) + '\n');
  return control.assessment;
}

// Mechanical backstop for the two hard interview rules. Throws (making NO changes to the file)
// before any read/write happens if:
//   - status === "met" and justification is missing/empty/whitespace-only
//   - status === "in_progress" and either currentState or estimatedCloseness is missing/blank
// On success, always stamps the relevant assessedAt (the control's own for e1/i1, or the targeted
// dimension's for r2), regardless of status (including "defer").
// `certKey` is required -- this function is certification-agnostic and has no default to guess.
function applyAssessment(stateJsonPath, certKey, tierKey, controlId, payload) {
  if (!certKey) throw new Error('applyAssessment: certKey is required (e.g. "hitrust")');

  const { status, justification, currentState, estimatedCloseness } = payload || {};
  validatePayloadShape(status, justification, currentState, estimatedCloseness);

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const tier = state?.certifications?.[certKey]?.tiers?.[tierKey];
  const control = tier && tier.controls && tier.controls[controlId];
  if (!control) {
    throw new Error(`Control "${controlId}" not found in ${certKey}/${tierKey} -- register the tier first.`);
  }

  if (tierKey === 'r2') {
    return applyR2Assessment(control, stateJsonPath, state, payload || {});
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

// A control counts as "touched" for domain-completion purposes once its Implemented dimension (r2)
// or its single flat status (e1/i1) has been assessed, or the whole control is marked
// not_applicable. Deepening r2's other 4 dimensions is opt-in progress that never blocks a domain
// from completing -- see the r2 maturity architecture design spec.
function isControlTouched(control, isR2) {
  if (isR2) {
    if (control.assessment && control.assessment.status === 'not_applicable') return true;
    const impl = control.assessment && control.assessment.maturity && control.assessment.maturity.implemented;
    return !!(impl && impl.assessedAt !== null && impl.assessedAt !== undefined);
  }
  return !!(control.assessment && control.assessment.assessedAt !== null && control.assessment.assessedAt !== undefined);
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

  const isR2 = tierKey === 'r2';
  const controlsInCategory = Object.values(tier.controls).filter(
    (c) => categoryKeyFor(c) === legacyCategoryPrefix
  );
  if (controlsInCategory.length === 0) {
    throw new Error(`No controls found for category "${legacyCategoryPrefix}" in ${certKey}/${tierKey}`);
  }
  const untouched = controlsInCategory.filter((c) => !isControlTouched(c, isR2));
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
