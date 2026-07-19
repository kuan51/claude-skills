'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { reconcileStateVersion } = require('../reconcile-state-version.js');

function makeTempState(initial) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hitrust-reconcile-test-'));
  const stateJsonPath = path.join(dir, 'state.json');
  fs.writeFileSync(stateJsonPath, JSON.stringify(initial, null, 2));
  return stateJsonPath;
}

// A control record shaped exactly as register-tier.js's defaultControl()/apply-assessment.js
// would leave it in state.json, with assessment/roadmap overrides for the fixture.
function seededControl(entry, { assessment, roadmap } = {}) {
  return {
    id: entry.id,
    type: entry.type,
    level: entry.level,
    relatedControlCode: entry.relatedControlCode,
    relatedControlName: entry.relatedControlName,
    legacyCategoryPrefix: entry.legacyCategoryPrefix,
    statementText: null,
    statementSource: 'structural-only',
    assessment: assessment || {
      status: 'not_assessed',
      justification: null,
      inProgress: { currentState: null, estimatedCloseness: null },
      assessedAt: null,
    },
    roadmap: roadmap || {
      budgetTier: null,
      vendorResearch: [],
      recommendation: null,
      status: 'not_started',
    },
  };
}

// Fictional, clearly synthetic old/new version pair -- not a real HITRUST release.
const OLD_VERSION = 'v11.8.0';
const NEW_VERSION = 'v99.0.0-test';

function buildInitialState() {
  return {
    certifications: {
      hitrust: {
        displayName: 'HITRUST CSF',
        activeTier: 'e1',
        tiers: {
          e1: {
            controlSetVersion: OLD_VERSION,
            sourceAuthority: 'structural-only',
            importedFrom: null,
            importedAt: null,
            controls: {
              // Unchanged case.
              'CTRL-A': seededControl({
                id: 'CTRL-A',
                type: 'Organizational',
                level: 1,
                relatedControlCode: '01.a',
                relatedControlName: 'Control A',
                legacyCategoryPrefix: '01',
              }),
              // Modified case -- pre-seeded with a completed assessment that must survive intact.
              'CTRL-B': seededControl(
                {
                  id: 'CTRL-B',
                  type: 'System',
                  level: 1,
                  relatedControlCode: '02.b',
                  relatedControlName: 'Control B',
                  legacyCategoryPrefix: '02',
                },
                {
                  assessment: {
                    status: 'met',
                    justification: 'Documented policy exists and is reviewed annually.',
                    inProgress: { currentState: null, estimatedCloseness: null },
                    assessedAt: '2026-01-01T00:00:00.000Z',
                  },
                }
              ),
              // Removed case -- pre-seeded with assessment data that must be archived intact.
              'CTRL-C': seededControl(
                {
                  id: 'CTRL-C',
                  type: 'System',
                  level: 1,
                  relatedControlCode: '03.c',
                  relatedControlName: 'Control C',
                  legacyCategoryPrefix: '03',
                },
                {
                  assessment: {
                    status: 'gap',
                    justification: 'No control in place yet.',
                    inProgress: { currentState: null, estimatedCloseness: null },
                    assessedAt: '2026-01-02T00:00:00.000Z',
                  },
                }
              ),
            },
            archivedControls: {},
          },
        },
      },
    },
    interviewSessions: [],
  };
}

const NEW_STRUCTURE = {
  tier: 'e1',
  controlSetVersion: NEW_VERSION,
  controls: [
    { id: 'CTRL-A', type: 'Organizational', level: 1, relatedControlCode: '01.a', relatedControlName: 'Control A', legacyCategoryPrefix: '01' },
    // relatedControlName changed -- CTRL-B becomes "modified".
    { id: 'CTRL-B', type: 'System', level: 1, relatedControlCode: '02.b', relatedControlName: 'Control B (revised)', legacyCategoryPrefix: '02' },
    // CTRL-C intentionally absent -- becomes "removed".
    // CTRL-D is new -- becomes "added".
    { id: 'CTRL-D', type: 'System', level: 1, relatedControlCode: '04.d', relatedControlName: 'Control D', legacyCategoryPrefix: '04' },
  ],
};

test('reconcileStateVersion: unchanged control is left completely untouched', () => {
  const stateJsonPath = makeTempState(buildInitialState());
  reconcileStateVersion(stateJsonPath, 'e1', NEW_STRUCTURE);

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const a = state.certifications.hitrust.tiers.e1.controls['CTRL-A'];
  assert.equal(a.relatedControlName, 'Control A');
  assert.equal(a.needsReview, undefined);
  assert.equal(a.assessment.status, 'not_assessed');
});

test('reconcileStateVersion: modified control gets needsReview=true, updated fields, and untouched assessment/roadmap', () => {
  const stateJsonPath = makeTempState(buildInitialState());
  reconcileStateVersion(stateJsonPath, 'e1', NEW_STRUCTURE);

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const b = state.certifications.hitrust.tiers.e1.controls['CTRL-B'];
  assert.equal(b.needsReview, true);
  assert.equal(b.relatedControlName, 'Control B (revised)');
  // Pre-seeded assessment must survive untouched.
  assert.equal(b.assessment.status, 'met');
  assert.equal(b.assessment.justification, 'Documented policy exists and is reviewed annually.');
  assert.equal(b.assessment.assessedAt, '2026-01-01T00:00:00.000Z');
  assert.deepEqual(b.roadmap, { budgetTier: null, vendorResearch: [], recommendation: null, status: 'not_started' });
});

test('reconcileStateVersion: added control is seeded with correct not_assessed defaults', () => {
  const stateJsonPath = makeTempState(buildInitialState());
  reconcileStateVersion(stateJsonPath, 'e1', NEW_STRUCTURE);

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const d = state.certifications.hitrust.tiers.e1.controls['CTRL-D'];
  assert.ok(d, 'CTRL-D should have been added to tier.controls');
  assert.equal(d.relatedControlName, 'Control D');
  assert.equal(d.legacyCategoryPrefix, '04');
  assert.equal(d.statementText, null);
  assert.equal(d.statementSource, 'structural-only');
  assert.equal(d.assessment.status, 'not_assessed');
  assert.equal(d.assessment.assessedAt, null);
  assert.deepEqual(d.roadmap, { budgetTier: null, vendorResearch: [], recommendation: null, status: 'not_started' });
});

test('reconcileStateVersion: removed control is archived (with assessment data intact), not deleted', () => {
  const stateJsonPath = makeTempState(buildInitialState());
  reconcileStateVersion(stateJsonPath, 'e1', NEW_STRUCTURE);

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const tier = state.certifications.hitrust.tiers.e1;
  assert.equal(tier.controls['CTRL-C'], undefined);

  const archived = tier.archivedControls['CTRL-C'];
  assert.ok(archived, 'CTRL-C should be present in archivedControls');
  assert.equal(archived.assessment.status, 'gap');
  assert.equal(archived.assessment.justification, 'No control in place yet.');
  assert.equal(archived.assessment.assessedAt, '2026-01-02T00:00:00.000Z');
  assert.equal(archived.relatedControlName, 'Control C');
});

test('reconcileStateVersion: bumps controlSetVersion and returns an accurate summary', () => {
  const stateJsonPath = makeTempState(buildInitialState());
  const summary = reconcileStateVersion(stateJsonPath, 'e1', NEW_STRUCTURE);

  assert.deepEqual(summary, { carriedForward: 2, needsReview: 1, added: 1, archived: 1 });

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  assert.equal(state.certifications.hitrust.tiers.e1.controlSetVersion, NEW_VERSION);
});

test('reconcileStateVersion: throws a clear error if the tier is not registered yet', () => {
  const stateJsonPath = makeTempState({ certifications: {}, interviewSessions: [] });
  assert.throws(
    () => reconcileStateVersion(stateJsonPath, 'e1', NEW_STRUCTURE),
    /not registered/
  );
});

test('reconcileStateVersion: throws before writing anything if certifications.hitrust is entirely absent', () => {
  const stateJsonPath = makeTempState({ interviewSessions: [] });
  assert.throws(() => reconcileStateVersion(stateJsonPath, 'e1', NEW_STRUCTURE), /not registered/);
});
