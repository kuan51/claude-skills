'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyFlatControl } = require('../diff-tasks.js');

function control(status, assessedAt, tracker) {
  return { assessment: { status, assessedAt: assessedAt || null }, tracker };
}

test('classifyFlatControl: gap with no tracker yet -> create', () => {
  const result = classifyFlatControl('CTRL-A', control('gap', '2026-01-01T00:00:00.000Z'));
  assert.deepEqual(result, { controlId: 'CTRL-A', action: 'create' });
});

test('classifyFlatControl: in_progress with no tracker yet -> create', () => {
  const result = classifyFlatControl('CTRL-A', control('in_progress', '2026-01-01T00:00:00.000Z'));
  assert.deepEqual(result, { controlId: 'CTRL-A', action: 'create' });
});

test('classifyFlatControl: met with no tracker -> null (nothing to do)', () => {
  const result = classifyFlatControl('CTRL-A', control('met', '2026-01-01T00:00:00.000Z'));
  assert.equal(result, null);
});

test('classifyFlatControl: not_assessed with no tracker -> null', () => {
  const result = classifyFlatControl('CTRL-A', control('not_assessed', null));
  assert.equal(result, null);
});

test('classifyFlatControl: gap with an open tracker, unchanged since sync -> null', () => {
  const c = control('gap', '2026-01-01T00:00:00.000Z', { status: 'open', syncedAt: '2026-01-02T00:00:00.000Z' });
  assert.equal(classifyFlatControl('CTRL-A', c), null);
});

test('classifyFlatControl: gap with an open tracker, reassessed after last sync -> update', () => {
  const c = control('gap', '2026-01-03T00:00:00.000Z', { status: 'open', syncedAt: '2026-01-02T00:00:00.000Z' });
  assert.deepEqual(classifyFlatControl('CTRL-A', c), { controlId: 'CTRL-A', action: 'update' });
});

test('classifyFlatControl: now met with an open tracker -> close', () => {
  const c = control('met', '2026-01-03T00:00:00.000Z', { status: 'open', syncedAt: '2026-01-02T00:00:00.000Z' });
  assert.deepEqual(classifyFlatControl('CTRL-A', c), { controlId: 'CTRL-A', action: 'close' });
});

test('classifyFlatControl: now not_applicable with an open tracker -> close', () => {
  const c = control('not_applicable', '2026-01-03T00:00:00.000Z', { status: 'open', syncedAt: '2026-01-02T00:00:00.000Z' });
  assert.deepEqual(classifyFlatControl('CTRL-A', c), { controlId: 'CTRL-A', action: 'close' });
});

test('classifyFlatControl: already closed tracker -> null even if status is gap again', () => {
  const c = control('gap', '2026-01-03T00:00:00.000Z', { status: 'closed', syncedAt: '2026-01-02T00:00:00.000Z' });
  assert.equal(classifyFlatControl('CTRL-A', c), null);
});

const { classifyR2Control, R2_DIMENSIONS } = require('../diff-tasks.js');

function dim(status, assessedAt) {
  return { status, justification: null, inProgress: { currentState: null, estimatedCloseness: null }, assessedAt: assessedAt || null };
}

function r2Control(maturityOverrides, tracker) {
  const maturity = {};
  for (const d of R2_DIMENSIONS) maturity[d] = dim('not_assessed');
  Object.assign(maturity, maturityOverrides);
  return { assessment: { status: null, maturity }, tracker };
}

test('classifyR2Control: no gaps anywhere, no tracker -> null', () => {
  assert.equal(classifyR2Control('CTRL-R2', r2Control({})), null);
});

test('classifyR2Control: one gapped dimension, no tracker yet -> create with just that dimension', () => {
  const c = r2Control({ policy: dim('gap', '2026-01-01T00:00:00.000Z') });
  assert.deepEqual(classifyR2Control('CTRL-R2', c), {
    controlId: 'CTRL-R2',
    action: 'create',
    dimensionActions: { policy: 'create' },
  });
});

test('classifyR2Control: two gapped dimensions, no tracker yet -> create with both', () => {
  const c = r2Control({
    policy: dim('gap', '2026-01-01T00:00:00.000Z'),
    implemented: dim('in_progress', '2026-01-01T00:00:00.000Z'),
  });
  assert.deepEqual(classifyR2Control('CTRL-R2', c), {
    controlId: 'CTRL-R2',
    action: 'create',
    dimensionActions: { policy: 'create', implemented: 'create' },
  });
});

test('classifyR2Control: existing open subtask for a still-gapped dimension, unchanged -> null', () => {
  const c = r2Control(
    { policy: dim('gap', '2026-01-01T00:00:00.000Z') },
    { status: 'open', subtasks: { policy: { id: 'P-1', url: 'https://x/P-1', status: 'open', syncedAt: '2026-01-02T00:00:00.000Z' } } }
  );
  assert.equal(classifyR2Control('CTRL-R2', c), null);
});

test('classifyR2Control: existing subtask, dimension reassessed after last sync -> update for that dimension', () => {
  const c = r2Control(
    { policy: dim('gap', '2026-01-03T00:00:00.000Z') },
    { status: 'open', subtasks: { policy: { id: 'P-1', url: 'https://x/P-1', status: 'open', syncedAt: '2026-01-02T00:00:00.000Z' } } }
  );
  assert.deepEqual(classifyR2Control('CTRL-R2', c), {
    controlId: 'CTRL-R2',
    action: 'update',
    dimensionActions: { policy: 'update' },
  });
});

test('classifyR2Control: already-synced control gains a newly-gapped dimension with no subtask yet -> update with create for that dimension only', () => {
  const c = r2Control(
    { policy: dim('gap', '2026-01-01T00:00:00.000Z'), implemented: dim('gap', '2026-01-03T00:00:00.000Z') },
    { status: 'open', subtasks: {
      policy: { id: 'P-1', url: 'https://x/P-1', status: 'open', syncedAt: '2026-01-02T00:00:00.000Z' },
    } }
  );
  assert.deepEqual(classifyR2Control('CTRL-R2', c), {
    controlId: 'CTRL-R2',
    action: 'update',
    dimensionActions: { implemented: 'create' },
  });
});

test('classifyR2Control: one dimension now met, its subtask still open -> close that dimension only, parent stays open', () => {
  const c = r2Control(
    { policy: dim('met', '2026-01-03T00:00:00.000Z'), implemented: dim('gap', '2026-01-01T00:00:00.000Z') },
    { status: 'open', subtasks: {
      policy: { id: 'P-1', url: 'https://x/P-1', status: 'open', syncedAt: '2026-01-02T00:00:00.000Z' },
      implemented: { id: 'P-2', url: 'https://x/P-2', status: 'open', syncedAt: '2026-01-02T00:00:00.000Z' },
    } }
  );
  assert.deepEqual(classifyR2Control('CTRL-R2', c), {
    controlId: 'CTRL-R2',
    action: 'update',
    dimensionActions: { policy: 'close' },
  });
});

test('classifyR2Control: all dimensions resolved and all subtasks already closed -> close the parent', () => {
  const maturity = {};
  for (const d of R2_DIMENSIONS) maturity[d] = dim('met', '2026-01-03T00:00:00.000Z');
  const subtasks = {};
  for (const d of R2_DIMENSIONS) subtasks[d] = { id: `P-${d}`, url: `https://x/P-${d}`, status: 'closed', syncedAt: '2026-01-02T00:00:00.000Z' };
  const c = { assessment: { status: null, maturity }, tracker: { status: 'open', subtasks } };
  assert.deepEqual(classifyR2Control('CTRL-R2', c), {
    controlId: 'CTRL-R2',
    action: 'close',
    dimensionActions: {},
  });
});

test('classifyR2Control: parent already closed -> null', () => {
  const maturity = {};
  for (const d of R2_DIMENSIONS) maturity[d] = dim('met', '2026-01-03T00:00:00.000Z');
  const c = { assessment: { status: null, maturity }, tracker: { status: 'closed', subtasks: {} } };
  assert.equal(classifyR2Control('CTRL-R2', c), null);
});

const { classifyState, recordTracker, saveDestination, getDestination } = require('../diff-tasks.js');

function makeTempState(initial) {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-tasks-test-'));
  const stateJsonPath = path.join(dir, 'state.json');
  fs.writeFileSync(stateJsonPath, JSON.stringify(initial, null, 2));
  return stateJsonPath;
}

function baseState() {
  return {
    certifications: {
      hitrust: {
        displayName: 'HITRUST CSF',
        tiers: {
          e1: {
            controls: {
              'e1-01-01': { id: 'e1-01-01', topicLabel: 'Policy', assessment: { status: 'gap', assessedAt: '2026-01-01T00:00:00.000Z' } },
              'e1-01-02': { id: 'e1-01-02', topicLabel: 'Training', assessment: { status: 'met', assessedAt: '2026-01-01T00:00:00.000Z' } },
            },
          },
        },
      },
    },
  };
}

test('classifyState: returns creates/updates/closes buckets for a flat tier', () => {
  const stateJsonPath = makeTempState(baseState());
  const result = classifyState(stateJsonPath, 'hitrust', 'e1');
  assert.deepEqual(result.creates, [{ controlId: 'e1-01-01', action: 'create' }]);
  assert.deepEqual(result.updates, []);
  assert.deepEqual(result.closes, []);
});

test('classifyState: throws a clear error for an unregistered tier', () => {
  const stateJsonPath = makeTempState(baseState());
  assert.throws(() => classifyState(stateJsonPath, 'hitrust', 'r2'), /Tier "hitrust\/r2" not found/);
});

test('recordTracker: writes a tracker block onto the named control and persists it', () => {
  const fs = require('fs');
  const stateJsonPath = makeTempState(baseState());
  const tracker = recordTracker(stateJsonPath, 'hitrust', 'e1', 'e1-01-01', {
    system: 'jira', id: 'SEC-1', url: 'https://x/SEC-1', status: 'open', syncedAt: '2026-01-05T00:00:00.000Z',
  });
  assert.equal(tracker.id, 'SEC-1');
  const reloaded = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  assert.equal(reloaded.certifications.hitrust.tiers.e1.controls['e1-01-01'].tracker.id, 'SEC-1');
});

test('recordTracker: merges subtasks key-by-key instead of replacing the whole object', () => {
  const stateJsonPath = makeTempState(baseState());
  recordTracker(stateJsonPath, 'hitrust', 'e1', 'e1-01-01', {
    system: 'jira', id: 'SEC-1', url: 'https://x/SEC-1', status: 'open', syncedAt: '2026-01-05T00:00:00.000Z',
    subtasks: { policy: { id: 'SEC-2', url: 'https://x/SEC-2', status: 'open', syncedAt: '2026-01-05T00:00:00.000Z' } },
  });
  const tracker = recordTracker(stateJsonPath, 'hitrust', 'e1', 'e1-01-01', {
    subtasks: { procedure: { id: 'SEC-3', url: 'https://x/SEC-3', status: 'open', syncedAt: '2026-01-06T00:00:00.000Z' } },
  });
  assert.ok(tracker.subtasks.policy, 'earlier subtask entry must survive the second patch');
  assert.ok(tracker.subtasks.procedure);
});

test('recordTracker: throws for an unknown control id', () => {
  const stateJsonPath = makeTempState(baseState());
  assert.throws(() => recordTracker(stateJsonPath, 'hitrust', 'e1', 'nope', { id: 'X' }), /Control "nope" not found/);
});

test('saveDestination + getDestination: round-trips destination config', () => {
  const stateJsonPath = makeTempState(baseState());
  assert.equal(getDestination(stateJsonPath, 'hitrust'), null);
  const destination = { system: 'jira', projectKey: 'SEC', issueType: 'Task', hasAdvancedRoadmaps: false, epicId: 'SEC-100', epicUrl: 'https://x/SEC-100', tierGroupIds: {} };
  saveDestination(stateJsonPath, 'hitrust', destination);
  assert.deepEqual(getDestination(stateJsonPath, 'hitrust'), destination);
});
