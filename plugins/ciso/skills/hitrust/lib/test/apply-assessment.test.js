'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { applyAssessment, markCategoryComplete } = require('../apply-assessment.js');
const { defaultControl } = require('../register-tier.js');

function makeTempState() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hitrust-apply-assessment-test-'));
  return path.join(dir, 'state.json');
}

function seedState(stateJsonPath, controlDefs, session) {
  const controls = {};
  for (const def of controlDefs) {
    controls[def.id] = defaultControl(def);
  }
  const state = {
    certifications: {
      hitrust: {
        displayName: 'HITRUST CSF',
        activeTier: 'e1',
        tiers: {
          e1: {
            controlSetVersion: 'v11.8.0',
            sourceAuthority: 'structural-only',
            importedFrom: null,
            importedAt: null,
            controls,
            archivedControls: {},
          },
        },
      },
    },
    interviewSessions: session
      ? [session]
      : [
          {
            certification: 'hitrust',
            tier: 'e1',
            startedAt: '2026-01-01T00:00:00.000Z',
            lastUpdatedAt: '2026-01-01T00:00:00.000Z',
            domainsCompleted: [],
            domainsRemaining: Array.from(new Set(controlDefs.map((c) => c.legacyCategoryPrefix))).sort(),
            status: 'in_progress',
          },
        ],
  };
  fs.writeFileSync(stateJsonPath, JSON.stringify(state, null, 2));
}

const CTRL_A = { id: 'CTRL-A', type: 'Organizational', level: 1, relatedControlCode: '01.a', relatedControlName: 'Control A', legacyCategoryPrefix: '01' };
const CTRL_B = { id: 'CTRL-B', type: 'System', level: 1, relatedControlCode: '01.b', relatedControlName: 'Control B', legacyCategoryPrefix: '01' };
const CTRL_C = { id: 'CTRL-C', type: 'System', level: 1, relatedControlCode: '02.c', relatedControlName: 'Control C', legacyCategoryPrefix: '02' };

test('applyAssessment throws when status is "met" without a justification, and makes no changes', () => {
  const stateJsonPath = makeTempState();
  seedState(stateJsonPath, [CTRL_A]);
  const before = fs.readFileSync(stateJsonPath, 'utf8');

  assert.throws(() => applyAssessment(stateJsonPath, 'hitrust', 'e1', 'CTRL-A', { status: 'met', justification: '' }), /justification/);
  assert.throws(() => applyAssessment(stateJsonPath, 'hitrust', 'e1', 'CTRL-A', { status: 'met', justification: '   ' }), /justification/);
  assert.throws(() => applyAssessment(stateJsonPath, 'hitrust', 'e1', 'CTRL-A', { status: 'met' }), /justification/);

  const after = fs.readFileSync(stateJsonPath, 'utf8');
  assert.equal(after, before, 'state.json must be byte-identical after a rejected payload');
});

test('applyAssessment throws when status is "in_progress" missing currentState or estimatedCloseness', () => {
  const stateJsonPath = makeTempState();
  seedState(stateJsonPath, [CTRL_A]);
  const before = fs.readFileSync(stateJsonPath, 'utf8');

  assert.throws(
    () => applyAssessment(stateJsonPath, 'hitrust', 'e1', 'CTRL-A', { status: 'in_progress', estimatedCloseness: 'close' }),
    /currentState/
  );
  assert.throws(
    () => applyAssessment(stateJsonPath, 'hitrust', 'e1', 'CTRL-A', { status: 'in_progress', currentState: 'partially rolled out' }),
    /estimatedCloseness/
  );

  const after = fs.readFileSync(stateJsonPath, 'utf8');
  assert.equal(after, before, 'state.json must be byte-identical after a rejected payload');
});

test('applyAssessment succeeds for "met" with a justification and stamps assessedAt', () => {
  const stateJsonPath = makeTempState();
  seedState(stateJsonPath, [CTRL_A]);

  const result = applyAssessment(stateJsonPath, 'hitrust', 'e1', 'CTRL-A', {
    status: 'met',
    justification: 'Policy is documented and reviewed annually.',
  });

  assert.equal(result.status, 'met');
  assert.equal(result.justification, 'Policy is documented and reviewed annually.');
  assert.ok(result.assessedAt && !Number.isNaN(Date.parse(result.assessedAt)));
  assert.deepEqual(result.inProgress, { currentState: null, estimatedCloseness: null });
});

test('applyAssessment succeeds for "in_progress" with both required fields', () => {
  const stateJsonPath = makeTempState();
  seedState(stateJsonPath, [CTRL_A]);

  const result = applyAssessment(stateJsonPath, 'hitrust', 'e1', 'CTRL-A', {
    status: 'in_progress',
    currentState: 'Draft policy exists, not yet approved.',
    estimatedCloseness: '80% complete, pending sign-off.',
  });

  assert.equal(result.status, 'in_progress');
  assert.deepEqual(result.inProgress, {
    currentState: 'Draft policy exists, not yet approved.',
    estimatedCloseness: '80% complete, pending sign-off.',
  });
  assert.ok(result.assessedAt);
});

test('applyAssessment accepts "gap" and "not_applicable" with no required detail', () => {
  const stateJsonPath = makeTempState();
  seedState(stateJsonPath, [CTRL_A, CTRL_B]);

  const gapResult = applyAssessment(stateJsonPath, 'hitrust', 'e1', 'CTRL-A', { status: 'gap' });
  assert.equal(gapResult.status, 'gap');
  assert.ok(gapResult.assessedAt);

  const naResult = applyAssessment(stateJsonPath, 'hitrust', 'e1', 'CTRL-B', { status: 'not_applicable' });
  assert.equal(naResult.status, 'not_applicable');
  assert.ok(naResult.assessedAt);
});

test('applyAssessment("defer") stores a valid schema status but still stamps assessedAt -- distinguishing "asked but deferred" from "never touched"', () => {
  const stateJsonPath = makeTempState();
  seedState(stateJsonPath, [CTRL_A]);

  const result = applyAssessment(stateJsonPath, 'hitrust', 'e1', 'CTRL-A', { status: 'defer' });

  // "defer" is not itself a persisted status value -- the schema enum is exactly
  // not_assessed|met|in_progress|gap|not_applicable.
  assert.equal(result.status, 'not_assessed');
  assert.ok(result.assessedAt !== null && result.assessedAt !== undefined);
  assert.ok(!Number.isNaN(Date.parse(result.assessedAt)));
});

test('applyAssessment resets stale inProgress detail when status moves away from in_progress', () => {
  const stateJsonPath = makeTempState();
  seedState(stateJsonPath, [CTRL_A]);

  applyAssessment(stateJsonPath, 'hitrust', 'e1', 'CTRL-A', {
    status: 'in_progress',
    currentState: 'halfway there',
    estimatedCloseness: 'a quarter left',
  });
  const result = applyAssessment(stateJsonPath, 'hitrust', 'e1', 'CTRL-A', {
    status: 'met',
    justification: 'Completed and verified.',
  });

  assert.deepEqual(result.inProgress, { currentState: null, estimatedCloseness: null });
});

test('applyAssessment throws on an unknown status', () => {
  const stateJsonPath = makeTempState();
  seedState(stateJsonPath, [CTRL_A]);
  assert.throws(() => applyAssessment(stateJsonPath, 'hitrust', 'e1', 'CTRL-A', { status: 'bogus' }), /Invalid status/);
});

test('applyAssessment throws for a control id that is not registered', () => {
  const stateJsonPath = makeTempState();
  seedState(stateJsonPath, [CTRL_A]);
  assert.throws(
    () => applyAssessment(stateJsonPath, 'hitrust', 'e1', 'NO-SUCH-CONTROL', { status: 'gap' }),
    /not found/
  );
});

test('markCategoryComplete throws if any control in the category has assessedAt: null', () => {
  const stateJsonPath = makeTempState();
  seedState(stateJsonPath, [CTRL_A, CTRL_B]);
  applyAssessment(stateJsonPath, 'hitrust', 'e1', 'CTRL-A', { status: 'gap' });
  // CTRL-B (same category "01") is never assessed.

  assert.throws(() => markCategoryComplete(stateJsonPath, 'hitrust', 'e1', '01'), /never assessed/);
});

test('markCategoryComplete succeeds once every control in the category is assessed, updating session state', () => {
  const stateJsonPath = makeTempState();
  seedState(stateJsonPath, [CTRL_A, CTRL_B, CTRL_C]);
  applyAssessment(stateJsonPath, 'hitrust', 'e1', 'CTRL-A', { status: 'gap' });
  applyAssessment(stateJsonPath, 'hitrust', 'e1', 'CTRL-B', { status: 'defer' });

  const session = markCategoryComplete(stateJsonPath, 'hitrust', 'e1', '01');
  assert.deepEqual(session.domainsCompleted, ['01']);
  assert.deepEqual(session.domainsRemaining, ['02']);
  assert.equal(session.status, 'in_progress'); // '02' still remains
  assert.ok(session.lastUpdatedAt);
});

test('markCategoryComplete flips session status to "completed" once domainsRemaining is empty', () => {
  const stateJsonPath = makeTempState();
  seedState(stateJsonPath, [CTRL_A], {
    certification: 'hitrust',
    tier: 'e1',
    startedAt: '2026-01-01T00:00:00.000Z',
    lastUpdatedAt: '2026-01-01T00:00:00.000Z',
    domainsCompleted: [],
    domainsRemaining: ['01'],
    status: 'in_progress',
  });
  applyAssessment(stateJsonPath, 'hitrust', 'e1', 'CTRL-A', { status: 'not_applicable' });

  const session = markCategoryComplete(stateJsonPath, 'hitrust', 'e1', '01');
  assert.deepEqual(session.domainsRemaining, []);
  assert.deepEqual(session.domainsCompleted, ['01']);
  assert.equal(session.status, 'completed');
});

test('markCategoryComplete is safe to call again on an already-completed category (idempotent domainsCompleted)', () => {
  const stateJsonPath = makeTempState();
  seedState(stateJsonPath, [CTRL_A], {
    certification: 'hitrust',
    tier: 'e1',
    startedAt: '2026-01-01T00:00:00.000Z',
    lastUpdatedAt: '2026-01-01T00:00:00.000Z',
    domainsCompleted: ['01'],
    domainsRemaining: [],
    status: 'completed',
  });
  applyAssessment(stateJsonPath, 'hitrust', 'e1', 'CTRL-A', { status: 'met', justification: 'Already satisfied.' });

  const session = markCategoryComplete(stateJsonPath, 'hitrust', 'e1', '01');
  assert.deepEqual(session.domainsCompleted, ['01']);
});

test('applyAssessment and markCategoryComplete are parameterized by certKey -- a second certification is independent of hitrust', () => {
  const stateJsonPath = makeTempState();
  const state = {
    certifications: {
      hitrust: {
        displayName: 'HITRUST CSF',
        activeTier: 'e1',
        tiers: {
          e1: {
            controlSetVersion: 'v11.8.0',
            sourceAuthority: 'structural-only',
            importedFrom: null,
            importedAt: null,
            controls: { 'CTRL-A': defaultControl(CTRL_A) },
            archivedControls: {},
          },
        },
      },
      soc2: {
        displayName: 'SOC 2 Type II',
        activeTier: 'type2',
        tiers: {
          type2: {
            controlSetVersion: '2017',
            sourceAuthority: 'structural-only',
            importedFrom: null,
            importedAt: null,
            controls: { 'CC1.1': defaultControl({ id: 'CC1.1', legacyCategoryPrefix: 'CC1' }) },
            archivedControls: {},
          },
        },
      },
    },
    interviewSessions: [
      { certification: 'hitrust', tier: 'e1', startedAt: '2026-01-01T00:00:00.000Z', lastUpdatedAt: '2026-01-01T00:00:00.000Z', domainsCompleted: [], domainsRemaining: ['01'], status: 'in_progress' },
      { certification: 'soc2', tier: 'type2', startedAt: '2026-01-01T00:00:00.000Z', lastUpdatedAt: '2026-01-01T00:00:00.000Z', domainsCompleted: [], domainsRemaining: ['CC1'], status: 'in_progress' },
    ],
  };
  fs.writeFileSync(stateJsonPath, JSON.stringify(state, null, 2));

  applyAssessment(stateJsonPath, 'soc2', 'type2', 'CC1.1', { status: 'met', justification: 'Documented control environment policy.' });
  const afterApply = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  assert.equal(afterApply.certifications.soc2.tiers.type2.controls['CC1.1'].assessment.status, 'met');
  assert.equal(afterApply.certifications.hitrust.tiers.e1.controls['CTRL-A'].assessment.status, 'not_assessed', 'hitrust must be untouched by a soc2 assessment');

  const session = markCategoryComplete(stateJsonPath, 'soc2', 'type2', 'CC1');
  assert.deepEqual(session.domainsCompleted, ['CC1']);
  assert.equal(session.status, 'completed');

  const afterComplete = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const hitrustSession = afterComplete.interviewSessions.find((s) => s.certification === 'hitrust');
  assert.deepEqual(hitrustSession.domainsRemaining, ['01'], 'hitrust session must be untouched by the soc2 category completion');
});
