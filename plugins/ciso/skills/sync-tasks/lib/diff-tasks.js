'use strict';

const fs = require('fs');

const OPEN_STATUSES = ['gap', 'in_progress'];
const RESOLVED_STATUSES = ['met', 'not_applicable'];

function isNewerThan(assessedAt, syncedAt) {
  if (!assessedAt) return false;
  if (!syncedAt) return true;
  return new Date(assessedAt).getTime() > new Date(syncedAt).getTime();
}

function classifyFlatControl(controlId, control) {
  const status = control.assessment.status;
  const tracker = control.tracker;

  if (!tracker) {
    return OPEN_STATUSES.includes(status) ? { controlId, action: 'create' } : null;
  }
  if (tracker.status === 'closed') {
    // Regressed after its ticket was closed: the control resolved, we closed the
    // ticket, and it's now gapped/in_progress again. Reopen the existing ticket
    // rather than silently dropping a live compliance gap.
    if (OPEN_STATUSES.includes(status) && isNewerThan(control.assessment.assessedAt, tracker.syncedAt)) {
      return { controlId, action: 'reopen' };
    }
    return null;
  }
  if (RESOLVED_STATUSES.includes(status)) {
    return { controlId, action: 'close' };
  }
  if (OPEN_STATUSES.includes(status) && isNewerThan(control.assessment.assessedAt, tracker.syncedAt)) {
    return { controlId, action: 'update' };
  }
  return null;
}

const R2_DIMENSIONS = ['policy', 'procedure', 'implemented', 'measured', 'managed'];

function classifyR2Control(controlId, control) {
  const tracker = control.tracker;
  const maturity = control.assessment.maturity;
  const dimensionActions = {};

  for (const dimName of R2_DIMENSIONS) {
    const dimState = maturity[dimName];
    const subtask = tracker && tracker.subtasks && tracker.subtasks[dimName];

    if (!subtask) {
      if (OPEN_STATUSES.includes(dimState.status)) dimensionActions[dimName] = 'create';
      continue;
    }
    if (subtask.status === 'closed') {
      // Dimension regressed after its subtask was closed -> reopen that subtask.
      if (OPEN_STATUSES.includes(dimState.status) && isNewerThan(dimState.assessedAt, subtask.syncedAt)) {
        dimensionActions[dimName] = 'reopen';
      }
      continue;
    }
    if (RESOLVED_STATUSES.includes(dimState.status)) {
      dimensionActions[dimName] = 'close';
    } else if (OPEN_STATUSES.includes(dimState.status) && isNewerThan(dimState.assessedAt, subtask.syncedAt)) {
      dimensionActions[dimName] = 'update';
    }
  }

  if (!tracker) {
    return Object.keys(dimensionActions).length > 0
      ? { controlId, action: 'create', dimensionActions }
      : null;
  }
  if (tracker.status === 'closed') {
    // Parent ticket was closed; reopen it only if a dimension regressed
    // (reopen) or a previously-untouched dimension newly gapped (create).
    return Object.keys(dimensionActions).length > 0
      ? { controlId, action: 'reopen', dimensionActions }
      : null;
  }

  // Close the parent once nothing is outstanding. Untouched dimensions stay
  // `not_assessed` (never tracked), so gate on "no dimension is currently open"
  // rather than "every dimension resolved" — the latter never became true for
  // the common single-dimension-gapped shape and left parents open forever.
  const noOpenDimensions = R2_DIMENSIONS.every((d) => !OPEN_STATUSES.includes(maturity[d].status));
  const hasOpenSubtask = Object.values(tracker.subtasks || {}).some((s) => s.status !== 'closed');

  if (noOpenDimensions && !hasOpenSubtask) {
    return { controlId, action: 'close', dimensionActions };
  }
  if (Object.keys(dimensionActions).length > 0) {
    return { controlId, action: 'update', dimensionActions };
  }
  return null;
}

function classifyState(stateJsonPath, certKey, tierKey) {
  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const tier = state?.certifications?.[certKey]?.tiers?.[tierKey];
  if (!tier || !tier.controls) {
    throw new Error(`Tier "${certKey}/${tierKey}" not found in ${stateJsonPath}`);
  }

  const results = { creates: [], updates: [], closes: [], reopens: [] };
  for (const [controlId, control] of Object.entries(tier.controls)) {
    const classified = tierKey === 'r2'
      ? classifyR2Control(controlId, control)
      : classifyFlatControl(controlId, control);
    if (!classified) continue;
    results[`${classified.action}s`].push(classified);
  }
  return results;
}

function recordTracker(stateJsonPath, certKey, tierKey, controlId, trackerPatch) {
  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const control = state?.certifications?.[certKey]?.tiers?.[tierKey]?.controls?.[controlId];
  if (!control) {
    throw new Error(`Control "${controlId}" not found in ${certKey}/${tierKey}`);
  }

  const existingSubtasks = (control.tracker && control.tracker.subtasks) || {};
  const patchSubtasks = trackerPatch.subtasks || {};
  const mergedSubtasks = Object.assign({}, existingSubtasks, patchSubtasks);

  control.tracker = Object.assign({}, control.tracker, trackerPatch);
  if (Object.keys(mergedSubtasks).length > 0) {
    control.tracker.subtasks = mergedSubtasks;
  }

  fs.writeFileSync(stateJsonPath, JSON.stringify(state, null, 2) + '\n');
  return control.tracker;
}

function saveDestination(stateJsonPath, certKey, destination) {
  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  if (!state.certifications || !state.certifications[certKey]) {
    throw new Error(`Certification "${certKey}" not found in ${stateJsonPath}`);
  }
  state.certifications[certKey].sync = { destination };
  fs.writeFileSync(stateJsonPath, JSON.stringify(state, null, 2) + '\n');
  return { destination };
}

function recordTierGroup(stateJsonPath, certKey, tier, groupId) {
  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const destination = state?.certifications?.[certKey]?.sync?.destination;
  if (!destination) {
    throw new Error(`No sync destination for "${certKey}" in ${stateJsonPath} — run setup first`);
  }
  destination.tierGroupIds = destination.tierGroupIds || {};
  destination.tierGroupIds[tier] = groupId;
  fs.writeFileSync(stateJsonPath, JSON.stringify(state, null, 2) + '\n');
  return destination.tierGroupIds;
}

function getDestination(stateJsonPath, certKey) {
  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const destination = state?.certifications?.[certKey]?.sync?.destination;
  return destination || null;
}

module.exports = {
  classifyFlatControl,
  classifyR2Control,
  classifyState,
  recordTracker,
  saveDestination,
  recordTierGroup,
  getDestination,
  OPEN_STATUSES,
  RESOLVED_STATUSES,
  isNewerThan,
  R2_DIMENSIONS,
};

if (require.main === module) {
  const [stateJsonPath, certKey, tierKey] = process.argv.slice(2);
  if (!stateJsonPath || !certKey || !tierKey) {
    console.error('Usage: node diff-tasks.js <state.json> <certKey> <tierKey>');
    process.exit(1);
  }
  try {
    console.log(JSON.stringify(classifyState(stateJsonPath, certKey, tierKey), null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
