'use strict';

const fs = require('fs');

// Searches every certification and every tier within it for a control keyed by `controlId`.
// Deliberately not hardcoded to `hitrust`/`e1` -- a control id could belong to any tier of any
// certification the project has registered. Returns the control object by reference (so the
// caller can mutate it in place) or null if it isn't found anywhere.
function findControlById(state, controlId) {
  const certifications = (state && state.certifications) || {};
  for (const certKey of Object.keys(certifications)) {
    const tiers = (certifications[certKey] && certifications[certKey].tiers) || {};
    for (const tierKey of Object.keys(tiers)) {
      const controls = (tiers[tierKey] && tiers[tierKey].controls) || {};
      if (Object.prototype.hasOwnProperty.call(controls, controlId)) {
        return controls[controlId];
      }
    }
  }
  return null;
}

// Merges a roadmap workflow's result -- { budgetTier, results: [{controlId, vendors,
// recommendation, confidence}, ...] } -- onto each matching control's `roadmap` field, searching
// across every certification/tier in `state`. Idempotent: re-running with the same result
// overwrites `roadmap` cleanly each time (the field is replaced wholesale, never appended to), so
// there's no duplication across repeated runs.
//
// A controlId that isn't found anywhere (e.g. removed by a version-upgrade reconciliation that
// ran between the roadmap workflow and this merge) is collected into `notFound` instead of
// throwing -- everything that DID match is still merged and written back.
function mergeRoadmap(stateJsonPath, roadmapResult) {
  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const results = (roadmapResult && roadmapResult.results) || [];

  // Persist the budget tier used for this run as the org-level default, so the next Roadmap
  // invocation can offer "use your saved default" instead of asking cold every time. `organization`
  // should always exist (ciso:init creates it), but tolerate a hand-edited/older state file missing it.
  if (roadmapResult && roadmapResult.budgetTier != null) {
    if (!state.organization) state.organization = { name: null };
    state.organization.budgetTier = roadmapResult.budgetTier;
  }

  let merged = 0;
  const notFound = [];

  for (const entry of results) {
    const { controlId, vendors, recommendation, confidence } = entry || {};
    const control = findControlById(state, controlId);
    if (!control) {
      notFound.push(controlId);
      continue;
    }

    const vendorList = Array.isArray(vendors) ? vendors : [];
    control.roadmap = {
      budgetTier: roadmapResult.budgetTier != null ? roadmapResult.budgetTier : null,
      vendorResearch: vendorList,
      recommendation: recommendation != null ? recommendation : null,
      status: vendorList.length > 0 ? 'complete' : 'researching',
    };
    merged += 1;
  }

  for (const id of notFound) {
    console.error(`Warning: control "${id}" was not found in any certification/tier -- roadmap result not merged for it.`);
  }

  fs.writeFileSync(stateJsonPath, JSON.stringify(state, null, 2) + '\n');
  return { merged, notFound };
}

module.exports = { mergeRoadmap, findControlById };

if (require.main === module) {
  const [stateJsonPath, resultJsonPath] = process.argv.slice(2);
  if (!stateJsonPath || !resultJsonPath) {
    console.error('Usage: node merge-roadmap.js <state.json path> <result.json path>');
    process.exit(1);
  }
  if (!fs.existsSync(stateJsonPath)) {
    console.error(`No state.json found at ${stateJsonPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(resultJsonPath)) {
    console.error(`No result.json found at ${resultJsonPath}`);
    process.exit(1);
  }

  let roadmapResult;
  try {
    roadmapResult = JSON.parse(fs.readFileSync(resultJsonPath, 'utf8'));
  } catch (err) {
    console.error(`Invalid JSON in ${resultJsonPath}: ${err.message}`);
    process.exit(1);
  }

  try {
    const summary = mergeRoadmap(stateJsonPath, roadmapResult);
    console.log(JSON.stringify(summary, null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
