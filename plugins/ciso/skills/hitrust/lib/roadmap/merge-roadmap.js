'use strict';

const fs = require('fs');

// Every control keyed by `controlId`, searching every certification and tier, or only the
// `certKey`/`tierKey` given. Deliberately not hardcoded to `hitrust`/`e1` -- a control id could
// belong to any tier of any certification the project has registered. Controls are returned by
// reference, so the caller can mutate them in place.
function matchingControls(state, controlId, certKey, tierKey) {
  const matches = [];
  const certifications = (state && state.certifications) || {};
  for (const ck of Object.keys(certifications)) {
    if (certKey && ck !== certKey) continue;
    const tiers = (certifications[ck] && certifications[ck].tiers) || {};
    for (const tk of Object.keys(tiers)) {
      if (tierKey && tk !== tierKey) continue;
      const controls = (tiers[tk] && tiers[tk].controls) || {};
      if (Object.prototype.hasOwnProperty.call(controls, controlId)) matches.push(controls[controlId]);
    }
  }
  return matches;
}

// The one control `controlId` names, or null if none does or more than one does. A project
// framework's ids are unique only within a tier, so without certKey/tierKey an id can match
// controls in several tiers, and guessing would write research onto the wrong one.
function findControlById(state, controlId, certKey, tierKey) {
  const matches = matchingControls(state, controlId, certKey, tierKey);
  return matches.length === 1 ? matches[0] : null;
}

// Merges a roadmap workflow's result -- { budgetTier, results: [{controlId, certKey, tierKey,
// vendors, recommendation, confidence}, ...] } -- onto each matching control's `roadmap` field:
// exactly the named tier's control when certKey/tierKey are present, else the one control with
// that id across every certification/tier in `state`. Idempotent: re-running with the same result
// overwrites `roadmap` cleanly each time (the field is replaced wholesale, never appended to), so
// there's no duplication across repeated runs.
//
// A controlId that isn't found anywhere (e.g. removed by a version-upgrade reconciliation that
// ran between the roadmap workflow and this merge) is collected into `notFound` instead of
// throwing -- everything that DID match is still merged and written back. An id that matches more
// than one control is collected into `ambiguous` the same way, never merged onto a guess.
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
  const ambiguous = [];

  for (const entry of results) {
    const { controlId, certKey, tierKey, vendors, recommendation } = entry || {};
    const matches = matchingControls(state, controlId, certKey, tierKey);
    if (matches.length !== 1) {
      if (matches.length > 1) {
        ambiguous.push(controlId);
        console.error(`Warning: control "${controlId}" matches ${matches.length} controls in different tiers -- roadmap result not merged; it needs its certKey and tierKey.`);
      } else {
        notFound.push(controlId);
      }
      continue;
    }
    const control = matches[0];

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
  return { merged, notFound, ambiguous };
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
