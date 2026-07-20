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

// A second, fake certification (not a real HITRUST tier) used to prove reconcileStateVersion's
// certKey parameter is load-bearing rather than hardcoded to 'hitrust'. Shared by both the
// "reconciling one cert doesn't touch another" test and the "certKey='soc2' actually reconciles
// soc2" test below, so the ~20-line seed isn't duplicated.
function seedSoc2Tier() {
  return {
    displayName: 'SOC 2 Type II',
    activeTier: 'type2',
    tiers: {
      type2: {
        controlSetVersion: '2017',
        sourceAuthority: 'structural-only',
        importedFrom: null,
        importedAt: null,
        controls: {
          'CC1.1': seededControl({
            id: 'CC1.1',
            type: 'Organizational',
            level: 1,
            relatedControlCode: 'CC1.1',
            relatedControlName: 'Control Environment',
            legacyCategoryPrefix: 'CC1',
          }),
        },
        archivedControls: {},
      },
    },
  };
}

// Fictional newer structure for soc2/type2 -- produces a real diff (one modified, one added)
// against the CC1.1 seeded by seedSoc2Tier(), the same way NEW_STRUCTURE does for hitrust/e1.
const SOC2_NEW_VERSION = 'v2022-test';
const SOC2_NEW_STRUCTURE = {
  tier: 'type2',
  controlSetVersion: SOC2_NEW_VERSION,
  controls: [
    // CC1.1 relatedControlName changed -- becomes "modified" (needsReview).
    { id: 'CC1.1', type: 'Organizational', level: 1, relatedControlCode: 'CC1.1', relatedControlName: 'Control Environment (revised)', legacyCategoryPrefix: 'CC1' },
    // CC1.2 is new -- becomes "added".
    { id: 'CC1.2', type: 'Organizational', level: 1, relatedControlCode: 'CC1.2', relatedControlName: 'Board Independence', legacyCategoryPrefix: 'CC1' },
  ],
};

test('reconcileStateVersion: unchanged control is left completely untouched', () => {
  const stateJsonPath = makeTempState(buildInitialState());
  reconcileStateVersion(stateJsonPath, 'hitrust', 'e1', NEW_STRUCTURE);

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const a = state.certifications.hitrust.tiers.e1.controls['CTRL-A'];
  assert.equal(a.relatedControlName, 'Control A');
  assert.equal(a.needsReview, undefined);
  assert.equal(a.assessment.status, 'not_assessed');
});

test('reconcileStateVersion: modified control gets needsReview=true, updated fields, and untouched assessment/roadmap', () => {
  const stateJsonPath = makeTempState(buildInitialState());
  reconcileStateVersion(stateJsonPath, 'hitrust', 'e1', NEW_STRUCTURE);

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
  reconcileStateVersion(stateJsonPath, 'hitrust', 'e1', NEW_STRUCTURE);

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
  reconcileStateVersion(stateJsonPath, 'hitrust', 'e1', NEW_STRUCTURE);

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
  const summary = reconcileStateVersion(stateJsonPath, 'hitrust', 'e1', NEW_STRUCTURE);

  assert.deepEqual(summary, { carriedForward: 2, needsReview: 1, added: 1, archived: 1 });

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  assert.equal(state.certifications.hitrust.tiers.e1.controlSetVersion, NEW_VERSION);
});

test('reconcileStateVersion: throws if certKey is missing', () => {
  const stateJsonPath = makeTempState(buildInitialState());
  assert.throws(() => reconcileStateVersion(stateJsonPath, undefined, 'e1', NEW_STRUCTURE), /certKey is required/);
});

test('reconcileStateVersion: throws a clear error if the tier is not registered yet', () => {
  const stateJsonPath = makeTempState({ certifications: {}, interviewSessions: [] });
  assert.throws(
    () => reconcileStateVersion(stateJsonPath, 'hitrust', 'e1', NEW_STRUCTURE),
    /not registered/
  );
});

test('reconcileStateVersion: throws before writing anything if certifications.hitrust is entirely absent', () => {
  const stateJsonPath = makeTempState({ interviewSessions: [] });
  assert.throws(() => reconcileStateVersion(stateJsonPath, 'hitrust', 'e1', NEW_STRUCTURE), /not registered/);
});

test('reconcileStateVersion: throws before writing anything if the tier was populated from a licensed import', () => {
  const initial = buildInitialState();
  initial.certifications.hitrust.tiers.e1.sourceAuthority = 'imported';
  initial.certifications.hitrust.tiers.e1.importedFrom = 'export.xlsx';
  const stateJsonPath = makeTempState(initial);
  const before = fs.readFileSync(stateJsonPath, 'utf8');

  assert.throws(
    () => reconcileStateVersion(stateJsonPath, 'hitrust', 'e1', NEW_STRUCTURE),
    /licensed import/
  );

  const after = fs.readFileSync(stateJsonPath, 'utf8');
  assert.equal(after, before, 'an imported tier must be left byte-identical, not partially reconciled');
});

test('reconcileStateVersion is parameterized by certKey -- reconciling one certification does not touch another', () => {
  const state = buildInitialState();
  state.certifications.soc2 = seedSoc2Tier();
  const stateJsonPath = makeTempState(state);

  reconcileStateVersion(stateJsonPath, 'hitrust', 'e1', NEW_STRUCTURE);

  const after = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  assert.equal(after.certifications.soc2.tiers.type2.controlSetVersion, '2017', 'soc2 must be untouched by a hitrust/e1 reconciliation');
  assert.equal(after.certifications.soc2.tiers.type2.controls['CC1.1'].relatedControlName, 'Control Environment');
  assert.equal(after.certifications.hitrust.tiers.e1.controlSetVersion, NEW_VERSION, 'hitrust/e1 itself still reconciles as before');
});

test('reconcileStateVersion with certKey="soc2" reconciles soc2 itself and leaves hitrust untouched (certKey is load-bearing)', () => {
  const state = buildInitialState();
  Object.assign(state.certifications, { soc2: seedSoc2Tier() });
  const stateJsonPath = makeTempState(state);

  const summary = reconcileStateVersion(stateJsonPath, 'soc2', 'type2', SOC2_NEW_STRUCTURE);

  const after = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  // soc2 WAS reconciled by the certKey='soc2' call:
  assert.equal(after.certifications.soc2.tiers.type2.controlSetVersion, SOC2_NEW_VERSION, 'soc2 controlSetVersion must bump when soc2 is the reconciled cert');
  assert.equal(after.certifications.soc2.tiers.type2.controls['CC1.1'].needsReview, true, 'CC1.1 must be flagged needsReview after a soc2 reconcile');
  assert.equal(after.certifications.soc2.tiers.type2.controls['CC1.1'].relatedControlName, 'Control Environment (revised)');
  assert.ok(after.certifications.soc2.tiers.type2.controls['CC1.2'], 'CC1.2 must be added to soc2');
  assert.equal(summary.added, 1);
  assert.equal(summary.needsReview, 1);
  // hitrust must be COMPLETELY untouched when soc2 is the reconciled cert:
  assert.equal(after.certifications.hitrust.tiers.e1.controlSetVersion, OLD_VERSION, 'hitrust must be untouched when reconciling soc2');
  assert.equal(after.certifications.hitrust.tiers.e1.controls['CTRL-B'].needsReview, undefined, 'hitrust CTRL-B must not be flagged by a soc2 reconcile');
  assert.ok(after.certifications.hitrust.tiers.e1.controls['CTRL-C'], 'hitrust CTRL-C must not be archived by a soc2 reconcile');
});

function seededR2Control(entry, maturityOverrides) {
  const maturity = {};
  for (const dim of ['policy', 'procedure', 'implemented', 'measured', 'managed']) {
    maturity[dim] = (maturityOverrides && maturityOverrides[dim]) || {
      status: 'not_assessed', justification: null,
      inProgress: { currentState: null, estimatedCloseness: null }, assessedAt: null,
    };
  }
  return {
    ...entry,
    statementText: null,
    statementSource: 'public-topic-level',
    assessment: { status: null, maturity },
    roadmap: { budgetTier: null, vendorResearch: [], recommendation: null, status: 'not_started' },
  };
}

function r2Entry(overrides) {
  return Object.assign(
    {
      id: 'r2-01-01', domain: 'Information Protection Program', domainKey: '01',
      topicLabel: 'x', topicSummary: 'y', citations: ['https://example.com'],
      applicabilityTier: 'universal', nonAuthoritative: true,
    },
    overrides
  );
}

test('reconcileStateVersion: an added r2 control is seeded with the not_assessed maturity shape', () => {
  const stateJsonPath = makeTempState({
    certifications: {
      hitrust: {
        displayName: 'HITRUST CSF',
        activeTier: 'r2',
        tiers: {
          r2: {
            controlSetVersion: 'v11.8',
            sourceAuthority: 'public-topic-level',
            importedFrom: null,
            importedAt: null,
            controls: { 'r2-01-01': seededR2Control(r2Entry()) },
            archivedControls: {},
          },
        },
      },
    },
    interviewSessions: [],
  });

  const newStructure = {
    tier: 'r2',
    controlSetVersion: 'v99.0.0-test',
    controls: [
      r2Entry(),
      r2Entry({ id: 'r2-01-02', topicLabel: 'new topic', applicabilityTier: 'conditional', conditionalOn: 'applies if X' }),
    ],
  };

  reconcileStateVersion(stateJsonPath, 'hitrust', 'r2', newStructure);

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const added = state.certifications.hitrust.tiers.r2.controls['r2-01-02'];
  assert.ok(added, 'r2-01-02 should have been added');
  assert.equal(added.assessment.status, null);
  assert.equal(added.assessment.maturity.implemented.status, 'not_assessed');
  assert.equal(added.assessment.maturity.managed.assessedAt, null);
});

test('reconcileStateVersion: a removed r2 control is archived with its maturity data intact', () => {
  const stateJsonPath = makeTempState({
    certifications: {
      hitrust: {
        displayName: 'HITRUST CSF',
        activeTier: 'r2',
        tiers: {
          r2: {
            controlSetVersion: 'v11.8',
            sourceAuthority: 'public-topic-level',
            importedFrom: null,
            importedAt: null,
            controls: {
              'r2-01-01': seededR2Control(r2Entry(), {
                implemented: {
                  status: 'met', justification: 'Done.',
                  inProgress: { currentState: null, estimatedCloseness: null },
                  assessedAt: '2026-01-01T00:00:00.000Z',
                },
              }),
            },
            archivedControls: {},
          },
        },
      },
    },
    interviewSessions: [],
  });

  const newStructure = { tier: 'r2', controlSetVersion: 'v99.0.0-test', controls: [] };
  reconcileStateVersion(stateJsonPath, 'hitrust', 'r2', newStructure);

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  assert.equal(state.certifications.hitrust.tiers.r2.controls['r2-01-01'], undefined);
  const archived = state.certifications.hitrust.tiers.r2.archivedControls['r2-01-01'];
  assert.ok(archived, 'r2-01-01 should be archived');
  assert.equal(archived.assessment.maturity.implemented.status, 'met');
  assert.equal(archived.assessment.maturity.implemented.justification, 'Done.');
});
