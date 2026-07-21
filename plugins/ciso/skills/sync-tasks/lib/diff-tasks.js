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

module.exports = { classifyFlatControl, classifyR2Control, OPEN_STATUSES, RESOLVED_STATUSES, isNewerThan, R2_DIMENSIONS };
