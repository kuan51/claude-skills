'use strict';

const fs = require('fs');
const path = require('path');
const { diffStructureVersions } = require('./diff-structure-versions.js');

// Fields register-tier.js's defaultControl() (and this script's own `needsReview` flag) layer on
// top of a bare structure-file control entry once it's living in state.json. They must be stripped
// before diffing an existing tier's controls against a new structure file -- otherwise every
// unchanged control would look "modified" (a bare structure entry never carries an `assessment`
// object, so a naive field-by-field compare would flag it as a difference every time).
// `evidence` belongs here for the same reason `assessment` does: register-tier.js seeds it, a bare
// structure entry never carries it, and isDeepStrictEqual([], undefined) is false -- so omitting it
// makes EVERY carried-forward control diff as modified and flags the whole tier needsReview,
// destroying the one signal this reconcile exists to produce.
const STATE_ONLY_FIELDS = ['assessment', 'evidence', 'roadmap', 'statementText', 'statementSource', 'needsReview'];

// r2's five PRISMA maturity dimensions. Duplicated locally, per this file's own established
// precedent of re-implementing register-tier.js's default shape independently (see the comment
// on buildDefaultControl below).
const R2_DIMENSIONS = ['policy', 'procedure', 'implemented', 'measured', 'managed'];

function toStructuralEntry(control) {
  const entry = {};
  for (const key of Object.keys(control || {})) {
    if (!STATE_ONLY_FIELDS.includes(key)) entry[key] = control[key];
  }
  return entry;
}

// Small local re-implementation of register-tier.js's defaultControl() default shape. Duplicated
// intentionally (rather than imported) so this file's module boundary stays independent of
// register-tier.js. Structural fields are copied opaquely from `entry` -- whatever shape the
// tier's structure file uses (e1's relatedControlCode/relatedControlName/legacyCategoryPrefix, or
// i1/r2's topicLabel/topicSummary/domain/citations/nonAuthoritative) -- rather than naming them
// individually, since this script must not assume e1's exact field names. `tierKey === 'r2'`
// seeds the 5-dimension maturity object instead of a flat status, matching register-tier.js.
function buildDefaultControl(entry, tierKey) {
  const assessment = tierKey === 'r2'
    ? {
        status: null,
        maturity: R2_DIMENSIONS.reduce((acc, dim) => {
          acc[dim] = {
            status: 'not_assessed',
            justification: null,
            inProgress: { currentState: null, estimatedCloseness: null },
            assessedAt: null,
          };
          return acc;
        }, {}),
      }
    : {
        status: 'not_assessed',
        justification: null,
        inProgress: { currentState: null, estimatedCloseness: null },
        assessedAt: null,
      };

  return {
    ...entry,
    statementText: null,
    statementSource: 'structural-only',
    assessment,
    roadmap: {
      budgetTier: null,
      vendorResearch: [],
      recommendation: null,
      status: 'not_started',
    },
  };
}

// Reconciles `state.json`'s <certKey>/<tierKey> tier against `newStructure` (a newer-version
// structure file for the same tier). `certKey` is required -- this function is certification-
// agnostic and has no default to guess. Never destructive:
//   - unchanged ids: assessment/roadmap left completely untouched.
//   - modified ids: assessment/roadmap left untouched, but structural fields (everything except
//     the state-only bookkeeping fields above) are refreshed from `newStructure`, and a new
//     `needsReview: true` field is set so the org knows the underlying topic/control description
//     shifted since they last assessed it.
//   - added ids: seeded fresh with the same defaults register-tier.js's defaultControl() would
//     produce (status "not_assessed", empty roadmap, etc).
//   - removed ids: the entire existing control object -- assessment/roadmap and all -- is moved to
//     `tier.archivedControls[id]` rather than being dropped.
function reconcileStateVersion(stateJsonPath, certKey, tierKey, newStructure) {
  if (!certKey) throw new Error('reconcileStateVersion: certKey is required (e.g. "hitrust")');

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const tier = state?.certifications?.[certKey]?.tiers?.[tierKey];
  if (!tier) {
    throw new Error(
      `Tier ${certKey}/${tierKey} is not registered in state.json -- nothing to reconcile. Run register-tier.js first.`
    );
  }
  if (tier.sourceAuthority === 'imported') {
    throw new Error(
      `Tier ${certKey}/${tierKey} was populated from a licensed import (real MyCSF Unique IDs) -- reconciling against the bundled public structure (synthetic ids) would match nothing and misclassify every imported control as removed. Import a new licensed export for this version instead of reconciling.`
    );
  }
  if (!tier.controls) tier.controls = {};
  if (!tier.archivedControls) tier.archivedControls = {};

  // state.json doesn't store the original structure file separately, so reconstruct an old-style
  // structure object from the tier's currently registered controls, stripped down to structural
  // fields only.
  const oldStyleStructure = { controls: Object.values(tier.controls).map(toStructuralEntry) };
  const diff = diffStructureVersions(oldStyleStructure, newStructure);

  const newById = new Map((newStructure.controls || []).map((c) => [c.id, c]));

  // modified: merge in refreshed structural fields, flag needsReview, never touch assessment/roadmap.
  for (const { id } of diff.modified) {
    const control = tier.controls[id];
    const structuralUpdate = toStructuralEntry(newById.get(id));
    Object.assign(control, structuralUpdate);
    control.needsReview = true;
  }

  // added: seed fresh defaults.
  for (const id of diff.added) {
    tier.controls[id] = buildDefaultControl(newById.get(id), tierKey);
  }

  // removed: archive the entire existing control object -- never dropped.
  for (const id of diff.removed) {
    tier.archivedControls[id] = tier.controls[id];
    delete tier.controls[id];
  }

  tier.controlSetVersion = newStructure.controlSetVersion;

  fs.writeFileSync(stateJsonPath, JSON.stringify(state, null, 2) + '\n');

  return {
    carriedForward: diff.unchanged.length + diff.modified.length,
    needsReview: diff.modified.length,
    added: diff.added.length,
    archived: diff.removed.length,
  };
}

module.exports = { reconcileStateVersion, toStructuralEntry, buildDefaultControl, STATE_ONLY_FIELDS };

if (require.main === module) {
  const [stateJsonPath, certKey, tierKey, newStructurePath] = process.argv.slice(2);
  if (!stateJsonPath || !certKey || !tierKey || !newStructurePath) {
    console.error('Usage: node reconcile-state-version.js <state.json path> <certKey> <tier> <new-structure-file>');
    process.exit(1);
  }
  try {
    const newStructure = JSON.parse(fs.readFileSync(path.resolve(newStructurePath), 'utf8'));
    const result = reconcileStateVersion(path.resolve(stateJsonPath), certKey, tierKey, newStructure);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
