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
