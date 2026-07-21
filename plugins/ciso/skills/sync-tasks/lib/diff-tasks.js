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
  if (tracker.status === 'closed') return null;
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
    if (subtask.status === 'closed') continue;
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
  if (tracker.status === 'closed') return null;

  const allDimensionsResolved = R2_DIMENSIONS.every((d) => RESOLVED_STATUSES.includes(maturity[d].status));
  const hasOpenSubtask = Object.values(tracker.subtasks || {}).some((s) => s.status !== 'closed');

  if (allDimensionsResolved && !hasOpenSubtask) {
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

  const results = { creates: [], updates: [], closes: [] };
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
