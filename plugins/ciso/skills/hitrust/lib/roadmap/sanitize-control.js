'use strict';

// The ONLY control fields allowed to leave the local project and reach the vendor-research agent
// (which holds WebSearch/WebFetch). Everything else -- an org's own `justification`, its
// in-progress posture notes (`inProgress`/`inProgressNotes`), and any licensed `statementText` --
// is org-private and must never egress. These fields describe the control's *subject* (what it is
// about), which is all a vendor researcher needs to find budget-appropriate tooling.
//
// This module is the tested source of truth. roadmap/workflow.js inlines the SAME list verbatim
// because it is a Workflow-tool script with no `require`/`import` access (see its top-of-file
// note); sanitize-control.test.js pins the two copies together. This deliberate
// duplication-with-sync-test mirrors this repo's existing R2_DIMENSIONS precedent (duplicated
// across register-tier.js / apply-assessment.js / render-dashboard.js for module independence).
const SUBJECT_FIELDS = [
  'relatedControlCode',
  'relatedControlName',
  'legacyCategoryPrefix',
  'topicLabel',
  'topicSummary',
  'domain',
  'domainKey',
];

// Fail-closed: returns `{ id, ...only the SUBJECT_FIELDS that are actually present }`. Any field
// not on the allowlist -- justification, inProgress, inProgressNotes, statementText, or ANY field
// added to a control in the future -- is dropped by default, so a new posture field can never
// silently start egressing just because someone added it to the control object upstream.
function sanitizeControlForResearch(control) {
  const c = control || {};
  const out = { id: c.id };
  for (const field of SUBJECT_FIELDS) {
    if (c[field] !== undefined && c[field] !== null) {
      out[field] = c[field];
    }
  }
  return out;
}

module.exports = { SUBJECT_FIELDS, sanitizeControlForResearch };
