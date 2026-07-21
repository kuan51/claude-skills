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

module.exports = { classifyFlatControl, OPEN_STATUSES, RESOLVED_STATUSES, isNewerThan };
