'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const {
  computeRollups,
  escapeForInlineScript,
  injectData,
  renderDashboard,
  DATA_MARKER,
} = require('../render-dashboard.js');

const SCRIPT_PATH = path.join(__dirname, '..', 'render-dashboard.js');

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeControl(overrides) {
  return Object.assign(
    {
      id: 'CTRL.0001',
      type: 'Organizational',
      level: 1,
      relatedControlCode: '04.a',
      relatedControlName: 'Sample Control Name',
      legacyCategoryPrefix: '04',
      statementText: null,
      statementSource: 'structural-only',
      assessment: {
        status: 'not_assessed',
        justification: null,
        inProgress: { currentState: null, estimatedCloseness: null },
        assessedAt: null,
      },
      roadmap: { budgetTier: null, vendorResearch: [], recommendation: null, status: 'not_started' },
    },
    overrides
  );
}

function baseState(controlsById) {
  return {
    schemaVersion: '1.0.0',
    generatedAt: '2020-01-01T00:00:00.000Z',
    organization: { name: 'Example Test Org' },
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
            controls: controlsById,
            archivedControls: {},
          },
        },
      },
    },
    interviewSessions: [
      {
        certification: 'hitrust',
        tier: 'e1',
        startedAt: '2020-01-01T00:00:00.000Z',
        lastUpdatedAt: '2020-01-02T00:00:00.000Z',
        domainsCompleted: ['04'],
        domainsRemaining: ['09'],
        status: 'in_progress',
      },
    ],
  };
}

function writeState(dir, state) {
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(state, null, 2));
}

function mkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ciso-dashboard-test-'));
}

// ---------------------------------------------------------------------------
// computeRollups
// ---------------------------------------------------------------------------

test('computeRollups: empty certifications yields an empty rollups object', () => {
  const rollups = computeRollups({ certifications: {} });
  assert.deepEqual(rollups, {});
});

test('computeRollups: healthy mix of all 5 statuses computes correct percentages', () => {
  // 10 controls: 4 met, 2 in_progress, 1 gap, 2 not_assessed, 1 not_applicable.
  // assessedAt set on all of met/in_progress/gap (7 controls); null on the
  // not_assessed and not_applicable ones (3 controls).
  const controls = {};
  const spec = [
    ['met', true], ['met', true], ['met', true], ['met', true],
    ['in_progress', true], ['in_progress', true],
    ['gap', true],
    ['not_assessed', false], ['not_assessed', false],
    ['not_applicable', false],
  ];
  spec.forEach(([status, assessed], i) => {
    controls['c' + i] = makeControl({
      id: 'c' + i,
      legacyCategoryPrefix: '04',
      assessment: {
        status,
        justification: null,
        inProgress: { currentState: null, estimatedCloseness: null },
        assessedAt: assessed ? '2020-06-01T00:00:00.000Z' : null,
      },
    });
  });

  const state = baseState(controls);
  const rollups = computeRollups(state);
  const tier = rollups.hitrust.e1;

  assert.equal(tier.total, 10);
  assert.deepEqual(tier.byStatus, {
    not_assessed: 2, met: 4, in_progress: 2, gap: 1, not_applicable: 1,
  });
  // applicableTotal = 10 - 1 (not_applicable) = 9
  assert.equal(tier.applicableTotal, 9);
  // compliancePercent = round(100 * 4 / 9) = round(44.44...) = 44
  assert.equal(tier.compliancePercent, 44);
  // assessedPercent = round(100 * 7 / 10) = 70   (denominator is TOTAL, not applicableTotal)
  assert.equal(tier.assessedPercent, 70);
});

test('computeRollups: not_applicable-heavy tier is excluded from the compliance denominator but not the total', () => {
  // 5 controls: 3 not_applicable, 1 met, 1 gap. Only met/gap have assessedAt.
  const controls = {
    c0: makeControl({ id: 'c0', legacyCategoryPrefix: '09', assessment: { status: 'not_applicable', justification: null, inProgress: {}, assessedAt: null } }),
    c1: makeControl({ id: 'c1', legacyCategoryPrefix: '09', assessment: { status: 'not_applicable', justification: null, inProgress: {}, assessedAt: null } }),
    c2: makeControl({ id: 'c2', legacyCategoryPrefix: '09', assessment: { status: 'not_applicable', justification: null, inProgress: {}, assessedAt: null } }),
    c3: makeControl({ id: 'c3', legacyCategoryPrefix: '09', assessment: { status: 'met', justification: 'ok', inProgress: {}, assessedAt: '2020-01-01T00:00:00.000Z' } }),
    c4: makeControl({ id: 'c4', legacyCategoryPrefix: '09', assessment: { status: 'gap', justification: 'missing', inProgress: {}, assessedAt: '2020-01-01T00:00:00.000Z' } }),
  };
  const state = baseState(controls);
  const rollups = computeRollups(state);
  const tier = rollups.hitrust.e1;

  assert.equal(tier.total, 5, 'total must still include the not_applicable controls');
  assert.equal(tier.applicableTotal, 2, 'applicableTotal excludes the 3 not_applicable controls');
  // compliancePercent = round(100 * 1 met / 2 applicable) = 50
  assert.equal(tier.compliancePercent, 50);
  // assessedPercent = round(100 * 2 assessed / 5 total) = 40
  assert.equal(tier.assessedPercent, 40);

  // byDomain mirrors the same shape, grouped by legacyCategoryPrefix ("09" here).
  assert.equal(tier.byDomain['09'].total, 5);
  assert.equal(tier.byDomain['09'].applicableTotal, 2);
  assert.equal(tier.byDomain['09'].compliancePercent, 50);
});

test('computeRollups: groups by `domain` (not legacyCategoryPrefix) for topic-level i1/r2 controls', () => {
  const state = {
    certifications: {
      hitrust: {
        displayName: 'HITRUST CSF',
        activeTier: 'i1',
        tiers: {
          i1: {
            controlSetVersion: 'v11.8',
            sourceAuthority: 'public-topic-level',
            controls: {
              't1': { id: 't1', domain: 'Access Control', topicLabel: 'x', assessment: { status: 'met', assessedAt: '2020-01-01T00:00:00.000Z' } },
              't2': { id: 't2', domain: 'Access Control', topicLabel: 'y', assessment: { status: 'gap', assessedAt: '2020-01-01T00:00:00.000Z' } },
              't3': { id: 't3', domain: 'Endpoint Protection', topicLabel: 'z', assessment: { status: 'not_assessed', assessedAt: null } },
            },
            archivedControls: {},
          },
        },
      },
    },
  };
  const rollups = computeRollups(state);
  const tier = rollups.hitrust.i1;
  assert.equal(tier.total, 3);
  assert.deepEqual(Object.keys(tier.byDomain).sort(), ['Access Control', 'Endpoint Protection']);
  assert.equal(tier.byDomain['Access Control'].total, 2);
  assert.equal(tier.byDomain['Endpoint Protection'].total, 1);
});

// ---------------------------------------------------------------------------
// escapeForInlineScript / injectData -- XSS and $-pattern safety
// ---------------------------------------------------------------------------

test('escapeForInlineScript: round-trips through JSON.parse unchanged (proves unicode-escaping, not entity-escaping, is correct)', () => {
  const payload = { note: '<b>bold & "quoted" </script><script> stuff</b>' };
  const jsonString = JSON.stringify(payload);
  const escaped = escapeForInlineScript(jsonString);

  // The escaped form must still be valid JSON whose parsed value is
  // byte-for-byte identical to the original payload -- this only holds for
  // unicode escapes (< etc.), not HTML entities (&lt; etc.), since
  // entities would be stored as the 4 literal characters "&lt;" instead of "<".
  assert.deepEqual(JSON.parse(escaped), payload);

  // And the dangerous literal byte sequences must be gone from the escaped text.
  assert.ok(!escaped.includes('</script>'));
  assert.ok(!escaped.includes('<script>'));
});

test('injectData: full render neutralizes a </script><script> breakout payload', () => {
  const dir = mkTempDir();
  const controls = {
    c0: makeControl({
      id: 'c0',
      assessment: {
        status: 'gap',
        justification: '</script><script>alert(1)</script>',
        inProgress: { currentState: null, estimatedCloseness: null },
        assessedAt: null,
      },
    }),
  };
  writeState(dir, baseState(controls));

  renderDashboard(dir);
  const html = fs.readFileSync(path.join(dir, 'dashboard.html'), 'utf8');

  assert.ok(!html.includes('</script><script>alert(1)</script>'), 'the raw unescaped attack payload must never appear');
  assert.ok(html.includes('\\u003c/script\\u003e\\u003cscript\\u003ealert(1)\\u003c/script\\u003e'), 'the escaped form must be present');
});

test('injectData: does not corrupt output when injected data contains $-replacement-pattern characters', () => {
  // String.prototype.replace(str, str) treats $$, $&, $`, $' specially in the
  // REPLACEMENT argument. $' in particular splices in "everything after the
  // match" -- i.e. the rest of the template -- which would silently produce
  // garbled JS while every other test (none of which use "$") keeps passing.
  // injectData must not be vulnerable to this.
  const dangerous = "$$ $' $` $& <b>keep me literal</b>";
  const template = `before ${DATA_MARKER} after-marker-should-not-leak-into-payload`;
  const result = injectData(template, { note: dangerous });

  assert.ok(result.startsWith('before /*__CISO_DATA__*/'));
  assert.ok(result.endsWith('after-marker-should-not-leak-into-payload'));

  // Extract exactly what got substituted for the marker and confirm it
  // round-trips to the original dangerous string, proving no $-pattern
  // interpretation occurred.
  const injectedJson = result.slice(
    'before /*__CISO_DATA__*/'.length,
    result.length - ' after-marker-should-not-leak-into-payload'.length
  );
  assert.deepEqual(JSON.parse(injectedJson), { note: dangerous });
});

test('injectData: throws a clear error when the template marker is missing', () => {
  assert.throws(
    () => injectData('<html><body>no marker here</body></html>', { state: {}, rollups: {} }),
    /data marker.*not found/i
  );
});

// ---------------------------------------------------------------------------
// renderDashboard -- state.json mutation contract
// ---------------------------------------------------------------------------

test('renderDashboard: only mutates generatedAt in state.json, all other fields stay byte-identical', () => {
  const dir = mkTempDir();
  const controls = { c0: makeControl({ id: 'c0' }) };
  const before = baseState(controls);
  writeState(dir, before);

  renderDashboard(dir);

  const after = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'));

  assert.notEqual(after.generatedAt, before.generatedAt);
  assert.ok(!isNaN(new Date(after.generatedAt).getTime()), 'generatedAt must be a valid ISO timestamp');

  const beforeRest = Object.assign({}, before, { generatedAt: undefined });
  const afterRest = Object.assign({}, after, { generatedAt: undefined });
  assert.deepEqual(afterRest, beforeRest);
});

test('renderDashboard: renders successfully against certifications: {} without throwing, and shows the friendly empty state', () => {
  const dir = mkTempDir();
  const state = {
    schemaVersion: '1.0.0',
    generatedAt: '2020-01-01T00:00:00.000Z',
    organization: { name: null },
    certifications: {},
    interviewSessions: [],
  };
  writeState(dir, state);

  const result = renderDashboard(dir);
  assert.ok(result.html.length > 0);

  const html = fs.readFileSync(path.join(dir, 'dashboard.html'), 'utf8');
  assert.ok(html.toLowerCase().includes('ciso:hitrust'), 'should point the user at the hitrust skill');
  assert.ok(html.toLowerCase().includes('no certifications tracked yet'), 'should show a friendly empty state, not a blank page');
});

test('renderDashboard: throws a clear error when target-dir/state.json is missing', () => {
  const dir = mkTempDir();
  assert.throws(() => renderDashboard(dir), /no state\.json found/i);
});

// ---------------------------------------------------------------------------
// CLI smoke tests (usage error / non-zero exit)
// ---------------------------------------------------------------------------

test('CLI: exits non-zero with a usage message when target-dir is omitted', () => {
  assert.throws(() => execFileSync('node', [SCRIPT_PATH], { stdio: 'pipe' }));
});

test('CLI: exits non-zero with a clear error when state.json is missing', () => {
  const dir = mkTempDir();
  assert.throws(() => execFileSync('node', [SCRIPT_PATH, dir], { stdio: 'pipe' }));
});

test('CLI: succeeds and writes dashboard.html for a valid target-dir', () => {
  const dir = mkTempDir();
  writeState(dir, baseState({ c0: makeControl({ id: 'c0' }) }));
  execFileSync('node', [SCRIPT_PATH, dir], { stdio: 'pipe' });
  assert.ok(fs.existsSync(path.join(dir, 'dashboard.html')));
});
