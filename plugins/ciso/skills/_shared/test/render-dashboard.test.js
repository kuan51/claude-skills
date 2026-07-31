'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const {
  computeRollups,
  computeCertSummaries,
  certPageName,
  stateForCert,
  stateForIndex,
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

function makeR2Control(overrides) {
  const notAssessed = () => ({
    status: 'not_assessed', justification: null,
    inProgress: { currentState: null, estimatedCloseness: null }, assessedAt: null,
  });
  return Object.assign(
    {
      id: 'r2-01-01', domain: 'Information Protection Program', domainKey: '01',
      topicLabel: 'x', topicSummary: 'y', citations: ['https://example.com'],
      applicabilityTier: 'universal', nonAuthoritative: true,
      statementText: null, statementSource: 'public-topic-level',
      assessment: {
        status: null,
        maturity: {
          policy: notAssessed(), procedure: notAssessed(), implemented: notAssessed(),
          measured: notAssessed(), managed: notAssessed(),
        },
      },
      roadmap: { budgetTier: null, vendorResearch: [], recommendation: null, status: 'not_started' },
    },
    overrides
  );
}

test('computeRollups: r2 controls compute compliance/assessed from the Implemented dimension only, plus a maturityDepthPercent gauge', () => {
  const state = {
    certifications: {
      hitrust: {
        displayName: 'HITRUST CSF',
        activeTier: 'r2',
        tiers: {
          r2: {
            controlSetVersion: 'v11.8',
            sourceAuthority: 'public-topic-level',
            controls: {
              c0: makeR2Control({
                id: 'c0',
                assessment: {
                  status: null,
                  maturity: {
                    policy: { status: 'met', justification: 'ok', inProgress: { currentState: null, estimatedCloseness: null }, assessedAt: '2020-01-01T00:00:00.000Z' },
                    procedure: { status: 'not_assessed', justification: null, inProgress: { currentState: null, estimatedCloseness: null }, assessedAt: null },
                    implemented: { status: 'met', justification: 'ok', inProgress: { currentState: null, estimatedCloseness: null }, assessedAt: '2020-01-01T00:00:00.000Z' },
                    measured: { status: 'not_assessed', justification: null, inProgress: { currentState: null, estimatedCloseness: null }, assessedAt: null },
                    managed: { status: 'not_assessed', justification: null, inProgress: { currentState: null, estimatedCloseness: null }, assessedAt: null },
                  },
                },
              }),
              c1: makeR2Control({ id: 'c1' }),
            },
            archivedControls: {},
          },
        },
      },
    },
  };

  const rollups = computeRollups(state);
  const tier = rollups.hitrust.r2;

  assert.equal(tier.total, 2);
  assert.equal(tier.byStatus.met, 1, 'compliance counts only the Implemented dimension');
  assert.equal(tier.compliancePercent, 50);
  assert.equal(tier.assessedPercent, 50);
  // c0 has 2 of 5 dimensions assessed (policy, implemented); c1 has 0 of 5 -- (2+0)/(2*5) = 20%.
  assert.equal(tier.maturityDepthPercent, 20);
});

test('computeRollups: maturityDepthPercent is null for e1/i1 tiers (no maturity shape)', () => {
  const state = baseState({ c0: makeControl({ id: 'c0' }) });
  const rollups = computeRollups(state);
  assert.equal(rollups.hitrust.e1.maturityDepthPercent, null);
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
  // The justification travels to the certification's own page -- the index deliberately
  // ships no control data at all, so check both: escaped where it lands, absent elsewhere.
  const certHtml = fs.readFileSync(path.join(dir, 'cert-hitrust.html'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(dir, 'dashboard.html'), 'utf8');

  assert.ok(!certHtml.includes('</script><script>alert(1)</script>'), 'the raw unescaped attack payload must never appear');
  assert.ok(certHtml.includes('\\u003c/script\\u003e\\u003cscript\\u003ealert(1)\\u003c/script\\u003e'), 'the escaped form must be present');
  assert.ok(!indexHtml.includes('alert(1)'), 'the index carries no control data, so the payload must not reach it at all');
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

test('renderDashboard: an untracked project still renders the catalog, pointing at the skill that starts each certification', () => {
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
  assert.deepEqual(result.certPages, {}, 'nothing registered means no per-certification pages');

  const html = fs.readFileSync(path.join(dir, 'dashboard.html'), 'utf8');
  // Not a blank page and not a dead end: the index is a catalog, so a project that has
  // registered nothing still learns what this plugin supports and how to start.
  assert.ok(html.toLowerCase().includes('ciso:hitrust'), 'should point the user at the hitrust skill');
  assert.ok(html.toLowerCase().includes('not tracked yet'), 'catalog entries with no state must render as untracked');
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

// ---------------------------------------------------------------------------
// Multi-page output: dashboard.html (meta index) + cert-<certKey>.html per certification
// ---------------------------------------------------------------------------

// A second certification alongside HITRUST, so the per-page slicing is exercised against
// real cross-certification separation rather than a single-cert degenerate case.
function twoCertState() {
  const state = baseState({ h0: makeControl({ id: 'hitrust-only-control', legacyCategoryPrefix: '04' }) });
  state.certifications.soc2 = {
    displayName: 'SOC 2 Type II',
    activeTier: 'type2',
    tiers: {
      type2: {
        controlSetVersion: 'v2017tsc',
        sourceAuthority: 'public-topic-level',
        importedFrom: null,
        importedAt: null,
        controls: {
          s0: makeControl({ id: 'soc2-only-control', domainKey: 'CC6', domain: 'Logical and Physical Access Controls', legacyCategoryPrefix: undefined }),
        },
        archivedControls: {},
      },
    },
  };
  state.interviewSessions.push({
    certification: 'soc2', tier: 'type2',
    startedAt: '2020-01-01T00:00:00.000Z', lastUpdatedAt: '2020-01-02T00:00:00.000Z',
    domainsCompleted: [], domainsRemaining: ['CC6'], status: 'in_progress',
  });
  return state;
}

test('renderDashboard: writes the meta index plus exactly one page per registered certification', () => {
  const dir = mkTempDir();
  writeState(dir, twoCertState());

  const result = renderDashboard(dir);

  assert.deepEqual(result.certPages, { hitrust: 'cert-hitrust.html', soc2: 'cert-soc2.html' });
  assert.ok(fs.existsSync(path.join(dir, 'dashboard.html')));
  assert.ok(fs.existsSync(path.join(dir, 'cert-hitrust.html')));
  assert.ok(fs.existsSync(path.join(dir, 'cert-soc2.html')));
});

test('renderDashboard: each certification page carries only its own controls, never another certification\'s', () => {
  const dir = mkTempDir();
  writeState(dir, twoCertState());
  renderDashboard(dir);

  const hitrust = fs.readFileSync(path.join(dir, 'cert-hitrust.html'), 'utf8');
  const soc2 = fs.readFileSync(path.join(dir, 'cert-soc2.html'), 'utf8');

  assert.ok(hitrust.includes('hitrust-only-control'));
  assert.ok(!hitrust.includes('soc2-only-control'), 'the HITRUST page must not embed SOC 2 control data');
  assert.ok(soc2.includes('soc2-only-control'));
  assert.ok(!soc2.includes('hitrust-only-control'), 'the SOC 2 page must not embed HITRUST control data');
});

test('renderDashboard: the meta index embeds no control data', () => {
  const dir = mkTempDir();
  writeState(dir, twoCertState());
  renderDashboard(dir);

  const html = fs.readFileSync(path.join(dir, 'dashboard.html'), 'utf8');

  assert.ok(!html.includes('hitrust-only-control'), 'the index must not embed control data');
  assert.ok(!html.includes('soc2-only-control'), 'the index must not embed control data');
});

// The index's links are built client-side, so which hrefs it emits is asserted in
// dashboard-template.test.js (which actually runs the script). What this file owns is the
// other half of the same guarantee: every page the renderer claims to have written exists
// on disk under exactly the name the template will slugify to.
test('renderDashboard: every page named in certPages exists on disk', () => {
  const dir = mkTempDir();
  writeState(dir, twoCertState());
  const result = renderDashboard(dir);

  const names = Object.values(result.certPages);
  assert.ok(names.length >= 2, 'expected a page per tracked certification');
  for (const certKey of Object.keys(result.certPages)) {
    const name = result.certPages[certKey];
    assert.equal(name, certPageName(certKey), 'page name must be exactly what certPageName() produces');
    assert.ok(fs.existsSync(path.join(dir, name)), `certPages claims "${name}" but no such file was written`);
  }
});

test('renderDashboard: a certification removed from state has its stale page deleted on the next render', () => {
  const dir = mkTempDir();
  const state = twoCertState();
  writeState(dir, state);
  renderDashboard(dir);
  assert.ok(fs.existsSync(path.join(dir, 'cert-soc2.html')));

  const trimmed = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'));
  delete trimmed.certifications.soc2;
  writeState(dir, trimmed);

  const result = renderDashboard(dir);

  assert.deepEqual(result.removed, ['cert-soc2.html']);
  assert.ok(!fs.existsSync(path.join(dir, 'cert-soc2.html')), 'a deregistered certification must not leave a zombie page behind');
  assert.ok(fs.existsSync(path.join(dir, 'cert-hitrust.html')), 'the surviving certification keeps its page');
});

test("pruning never deletes a cert-*.html this renderer did not write -- the target dir is the user's own", () => {
  const dir = mkTempDir();
  writeState(dir, baseState({ c0: makeControl({ id: 'c0' }) }));

  // The kind of file a user really does leave in docs/ciso/: a saved draft or an export whose
  // name happens to match the pattern. The directory is gitignored, so deleting it would be
  // unrecoverable.
  const userFile = path.join(dir, 'cert-soc2-draft.html');
  fs.writeFileSync(userFile, '<html><body>my hand-written notes</body></html>', 'utf8');

  const result = renderDashboard(dir);

  assert.ok(fs.existsSync(userFile), 'a file without this renderer\'s data marker must never be deleted');
  assert.equal(fs.readFileSync(userFile, 'utf8'), '<html><body>my hand-written notes</body></html>');
  assert.deepEqual(result.removed, [], 'nothing was stale, so nothing should have been removed');
});

test('certPageName: reduces a certKey to a safe filename, so a traversal-shaped key cannot escape the target dir', () => {
  assert.equal(certPageName('hitrust'), 'cert-hitrust.html');
  assert.equal(certPageName('SOC2'), 'cert-soc2.html');
  assert.equal(certPageName('iso/27001'), 'cert-iso-27001.html');
  // The dangerous case: a key that would otherwise walk out of the target directory.
  const traversal = certPageName('../../etc/passwd');
  assert.ok(!traversal.includes('..') && !traversal.includes('/') && !traversal.includes('\\'), `certPageName must never emit a path (got "${traversal}")`);
});

test('stateForCert / stateForIndex: each page gets only the slice it renders', () => {
  const state = twoCertState();

  const certSlice = stateForCert(state, 'soc2');
  assert.deepEqual(Object.keys(certSlice.certifications), ['soc2']);
  assert.deepEqual(certSlice.interviewSessions.map((s) => s.certification), ['soc2']);
  assert.ok(certSlice.certifications.soc2.tiers.type2.controls, 'a certification page keeps its own controls');

  const indexSlice = stateForIndex(state);
  assert.deepEqual(Object.keys(indexSlice.certifications).sort(), ['hitrust', 'soc2']);
  for (const certKey of Object.keys(indexSlice.certifications)) {
    for (const tier of Object.values(indexSlice.certifications[certKey].tiers)) {
      assert.equal(tier.controls, undefined, 'the index drops control maps');
      assert.equal(tier.archivedControls, undefined, 'the index drops archived control maps');
      assert.ok(tier.controlSetVersion, 'but keeps the tier metadata its cards display');
    }
  }

  // Slicing must not mutate the source state -- the same object is sliced once per page.
  assert.ok(state.certifications.hitrust.tiers.e1.controls, 'stateForIndex must not strip controls from the original state');
});

test('computeCertSummaries: rolls tiers up by summed counts, not by averaging their percentages', () => {
  // Tier A: 1 of 1 met (100%). Tier B: 0 of 9 met (0%). Averaging percentages gives 50%;
  // the honest answer weighted by control count is 1/10 = 10%.
  const state = {
    certifications: {
      hitrust: {
        displayName: 'HITRUST CSF',
        tiers: {
          e1: { controls: { a: makeControl({ id: 'a', assessment: { status: 'met', assessedAt: '2020-01-01T00:00:00.000Z' } }) } },
          i1: { controls: {} },
        },
      },
    },
  };
  for (let i = 0; i < 9; i += 1) {
    state.certifications.hitrust.tiers.i1.controls['b' + i] = makeControl({
      id: 'b' + i,
      assessment: { status: 'gap', assessedAt: '2020-01-01T00:00:00.000Z' },
    });
  }

  const summaries = computeCertSummaries(computeRollups(state));

  assert.deepEqual(summaries.hitrust.tierKeys, ['e1', 'i1']);
  assert.equal(summaries.hitrust.total, 10);
  assert.equal(summaries.hitrust.byStatus.met, 1);
  assert.equal(summaries.hitrust.compliancePercent, 10, 'must be 1/10, not the 50% an average of 100% and 0% would give');
  assert.equal(summaries.hitrust.assessedPercent, 100);
});
