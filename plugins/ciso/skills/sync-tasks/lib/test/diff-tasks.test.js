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
