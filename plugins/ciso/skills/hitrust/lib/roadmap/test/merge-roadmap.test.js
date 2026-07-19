'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { mergeRoadmap, findControlById } = require('../merge-roadmap.js');

const MERGE_ROADMAP_SCRIPT = path.join(__dirname, '..', 'merge-roadmap.js');

function makeTempState(initial) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hitrust-merge-roadmap-test-'));
  const stateJsonPath = path.join(dir, 'state.json');
  fs.writeFileSync(stateJsonPath, JSON.stringify(initial, null, 2));
  return stateJsonPath;
}

function baseControl(overrides) {
  return {
    assessment: {
      status: 'gap',
      justification: null,
      inProgress: { currentState: null, estimatedCloseness: null },
      assessedAt: '2026-01-01T00:00:00.000Z',
    },
    roadmap: {
      budgetTier: null,
      vendorResearch: [],
      recommendation: null,
      status: 'not_started',
    },
    ...overrides,
  };
}

// Two different tiers under the same synthetic certification, so tests can prove the merge finds
// controls regardless of which tier they live in -- all names/urls below are placeholder/synthetic,
// not real vendors or organizations.
function makeFixtureState() {
  return {
    certifications: {
      hitrust: {
        displayName: 'HITRUST CSF',
        activeTier: 'e1',
        tiers: {
          e1: {
            controlSetVersion: 'v11.8.0',
            sourceAuthority: 'structural-only',
            controls: {
              'CTRL-A': baseControl({
                id: 'CTRL-A',
                relatedControlCode: '01.a',
                relatedControlName: 'Sample Access Control',
                legacyCategoryPrefix: '01',
              }),
              'CTRL-B': baseControl({
                id: 'CTRL-B',
                relatedControlCode: '02.b',
                relatedControlName: 'Sample Change Management',
                legacyCategoryPrefix: '02',
                roadmap: {
                  budgetTier: 'enterprise',
                  vendorResearch: [
                    { name: 'Old Example Tool', fitNotes: 'stale finding from a prior run', estCost: '$$$', sourceUrls: ['https://example.com/old'] },
                  ],
                  recommendation: 'Stale recommendation from a prior run.',
                  status: 'complete',
                },
              }),
            },
            archivedControls: {},
          },
          i1: {
            controlSetVersion: 'v11.8.0',
            sourceAuthority: 'public-topic-level',
            controls: {
              'TOPIC-C': baseControl({
                id: 'TOPIC-C',
                topicLabel: 'Access Governance',
                topicSummary: 'Placeholder topic summary text.',
                domain: 'Access Control',
              }),
            },
            archivedControls: {},
          },
        },
      },
    },
    interviewSessions: [],
  };
}

test('merges vendor data onto the right control regardless of which tier it lives in', () => {
  const stateJsonPath = makeTempState(makeFixtureState());
  const result = mergeRoadmap(stateJsonPath, {
    budgetTier: 'small_business',
    results: [
      {
        controlId: 'CTRL-A',
        vendors: [{ name: 'Example Vendor Co', fitNotes: 'Good fit for a small team.', estCost: '$50/mo', sourceUrls: ['https://example.com/vendor-a'] }],
        recommendation: 'Adopt Example Vendor Co.',
        confidence: 'high',
      },
      {
        controlId: 'TOPIC-C',
        vendors: [{ name: 'Open Example Project', fitNotes: 'Free and self-hosted.', sourceUrls: ['https://example.org/open-example'] }],
        recommendation: 'Self-host Open Example Project.',
        confidence: 'medium',
      },
    ],
  });

  assert.equal(result.merged, 2);
  assert.deepEqual(result.notFound, []);

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));

  const e1Control = state.certifications.hitrust.tiers.e1.controls['CTRL-A'];
  assert.equal(e1Control.roadmap.budgetTier, 'small_business');
  assert.equal(e1Control.roadmap.status, 'complete');
  assert.equal(e1Control.roadmap.vendorResearch.length, 1);
  assert.equal(e1Control.roadmap.vendorResearch[0].name, 'Example Vendor Co');
  assert.equal(e1Control.roadmap.recommendation, 'Adopt Example Vendor Co.');

  const i1Control = state.certifications.hitrust.tiers.i1.controls['TOPIC-C'];
  assert.equal(i1Control.roadmap.budgetTier, 'small_business');
  assert.equal(i1Control.roadmap.status, 'complete');
  assert.equal(i1Control.roadmap.vendorResearch[0].name, 'Open Example Project');
});

test('overwrites pre-existing roadmap data cleanly rather than appending to it', () => {
  const stateJsonPath = makeTempState(makeFixtureState());
  mergeRoadmap(stateJsonPath, {
    budgetTier: 'startup_scaling',
    results: [
      {
        controlId: 'CTRL-B',
        vendors: [{ name: 'New Example Tool', fitNotes: 'Better fit than the prior finding.', sourceUrls: ['https://example.com/new'] }],
        recommendation: 'Switch to New Example Tool.',
        confidence: 'high',
      },
    ],
  });

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const control = state.certifications.hitrust.tiers.e1.controls['CTRL-B'];
  assert.equal(control.roadmap.budgetTier, 'startup_scaling');
  assert.equal(control.roadmap.vendorResearch.length, 1);
  assert.equal(control.roadmap.vendorResearch[0].name, 'New Example Tool');
  assert.equal(control.roadmap.recommendation, 'Switch to New Example Tool.');
});

test('an unknown controlId is collected into notFound without throwing and without blocking other merges', () => {
  const stateJsonPath = makeTempState(makeFixtureState());
  const result = mergeRoadmap(stateJsonPath, {
    budgetTier: 'enterprise',
    results: [
      {
        controlId: 'CTRL-A',
        vendors: [{ name: 'Example Vendor Co', fitNotes: 'Fits the budget tier.', sourceUrls: ['https://example.com/vendor-a'] }],
        recommendation: 'Adopt it.',
        confidence: 'high',
      },
      {
        controlId: 'CTRL-DOES-NOT-EXIST',
        vendors: [],
        recommendation: 'N/A',
        confidence: 'low',
      },
    ],
  });

  assert.equal(result.merged, 1);
  assert.deepEqual(result.notFound, ['CTRL-DOES-NOT-EXIST']);

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  assert.equal(state.certifications.hitrust.tiers.e1.controls['CTRL-A'].roadmap.status, 'complete');
});

test('re-running with the same result is idempotent -- no duplication, clean overwrite', () => {
  const stateJsonPath = makeTempState(makeFixtureState());
  const roadmapResult = {
    budgetTier: 'enterprise',
    results: [
      {
        controlId: 'CTRL-A',
        vendors: [{ name: 'Example Vendor Co', fitNotes: 'Fits the budget tier.', sourceUrls: ['https://example.com/vendor-a'] }],
        recommendation: 'Adopt it.',
        confidence: 'high',
      },
    ],
  };

  mergeRoadmap(stateJsonPath, roadmapResult);
  const firstRun = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));

  mergeRoadmap(stateJsonPath, roadmapResult);
  const secondRun = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));

  assert.deepEqual(
    secondRun.certifications.hitrust.tiers.e1.controls['CTRL-A'].roadmap,
    firstRun.certifications.hitrust.tiers.e1.controls['CTRL-A'].roadmap
  );
  assert.equal(secondRun.certifications.hitrust.tiers.e1.controls['CTRL-A'].roadmap.vendorResearch.length, 1);
});

test('status is "researching" when vendors is empty and "complete" when non-empty', () => {
  const stateJsonPath = makeTempState(makeFixtureState());
  mergeRoadmap(stateJsonPath, {
    budgetTier: 'open_source',
    results: [
      { controlId: 'CTRL-A', vendors: [], recommendation: 'Nothing credible found for this budget tier.', confidence: 'low' },
      {
        controlId: 'TOPIC-C',
        vendors: [{ name: 'Open Example Project', fitNotes: 'Free and self-hosted.', sourceUrls: ['https://example.org/open-example'] }],
        recommendation: 'Self-host it.',
        confidence: 'medium',
      },
    ],
  });

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  assert.equal(state.certifications.hitrust.tiers.e1.controls['CTRL-A'].roadmap.status, 'researching');
  assert.equal(state.certifications.hitrust.tiers.i1.controls['TOPIC-C'].roadmap.status, 'complete');
});

test('findControlById returns null for an id that does not exist in any certification/tier', () => {
  const state = makeFixtureState();
  assert.equal(findControlById(state, 'NOPE'), null);
  assert.ok(findControlById(state, 'CTRL-A'));
  assert.ok(findControlById(state, 'TOPIC-C'));
});

test('CLI entry point: node merge-roadmap.js <state.json> <result.json> merges, warns on stderr for unknown ids, and exits 0', () => {
  const stateJsonPath = makeTempState(makeFixtureState());
  const resultJsonPath = path.join(path.dirname(stateJsonPath), 'result.json');
  fs.writeFileSync(
    resultJsonPath,
    JSON.stringify({
      budgetTier: 'enterprise',
      results: [
        {
          controlId: 'CTRL-A',
          vendors: [{ name: 'Example Vendor Co', fitNotes: 'Fits the budget tier.', sourceUrls: ['https://example.com/vendor-a'] }],
          recommendation: 'Adopt it.',
          confidence: 'high',
        },
        { controlId: 'CTRL-DOES-NOT-EXIST', vendors: [], recommendation: 'N/A', confidence: 'low' },
      ],
    }, null, 2)
  );

  const result = execFileSync('node', [MERGE_ROADMAP_SCRIPT, stateJsonPath, resultJsonPath], { encoding: 'utf8' });
  const stdout = JSON.parse(result);
  assert.equal(stdout.merged, 1);
  assert.deepEqual(stdout.notFound, ['CTRL-DOES-NOT-EXIST']);

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  assert.equal(state.certifications.hitrust.tiers.e1.controls['CTRL-A'].roadmap.status, 'complete');
});

test('CLI entry point: exits non-zero with usage text when arguments are missing', () => {
  assert.throws(() => execFileSync('node', [MERGE_ROADMAP_SCRIPT], { encoding: 'utf8' }));
});

test('persists budgetTier onto state.organization.budgetTier as the org-level default', () => {
  const fixture = makeFixtureState();
  fixture.organization = { name: 'Placeholder Org', budgetTier: null };
  const stateJsonPath = makeTempState(fixture);

  mergeRoadmap(stateJsonPath, {
    budgetTier: 'small_business',
    results: [{ controlId: 'CTRL-A', vendors: [], recommendation: 'n/a', confidence: 'low' }],
  });

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  assert.equal(state.organization.budgetTier, 'small_business');
  assert.equal(state.organization.name, 'Placeholder Org', 'must not clobber other organization fields');
});

test('creates state.organization if entirely absent (older/hand-edited state file) rather than throwing', () => {
  const fixture = makeFixtureState();
  delete fixture.organization;
  const stateJsonPath = makeTempState(fixture);

  mergeRoadmap(stateJsonPath, {
    budgetTier: 'enterprise',
    results: [{ controlId: 'CTRL-A', vendors: [], recommendation: 'n/a', confidence: 'low' }],
  });

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  assert.equal(state.organization.budgetTier, 'enterprise');
});

test('a run with no budgetTier does not touch an existing saved default', () => {
  const fixture = makeFixtureState();
  fixture.organization = { name: null, budgetTier: 'startup_scaling' };
  const stateJsonPath = makeTempState(fixture);

  mergeRoadmap(stateJsonPath, {
    budgetTier: null,
    results: [{ controlId: 'CTRL-A', vendors: [], recommendation: 'n/a', confidence: 'low' }],
  });

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  assert.equal(state.organization.budgetTier, 'startup_scaling');
});

test('CLI entry point: exits non-zero when the result file is not valid JSON', () => {
  const stateJsonPath = makeTempState(makeFixtureState());
  const resultJsonPath = path.join(path.dirname(stateJsonPath), 'bad-result.json');
  fs.writeFileSync(resultJsonPath, 'not valid json');

  assert.throws(() => execFileSync('node', [MERGE_ROADMAP_SCRIPT, stateJsonPath, resultJsonPath], { encoding: 'utf8' }));
});
