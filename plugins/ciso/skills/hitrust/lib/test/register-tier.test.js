'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { registerTier, computeDomains, defaultControl, loadStructure, resolveStructurePath, STRUCTURE_FILE } = require('../register-tier.js');

function makeTempState(initial) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hitrust-register-test-'));
  const stateJsonPath = path.join(dir, 'state.json');
  fs.writeFileSync(stateJsonPath, JSON.stringify(initial ?? { certifications: {}, interviewSessions: [] }, null, 2));
  return stateJsonPath;
}

const TINY_STRUCTURE = {
  tier: 'e1',
  controlSetVersion: 'v11.8.0',
  controls: [
    { id: 'CTRL-A', type: 'Organizational', level: 1, relatedControlCode: '01.a', relatedControlName: 'Control A', legacyCategoryPrefix: '01' },
    { id: 'CTRL-B', type: 'System', level: 1, relatedControlCode: '02.b', relatedControlName: 'Control B', legacyCategoryPrefix: '02' },
  ],
};

test('fresh registration builds an id-keyed controls object with every field defaulted', () => {
  const stateJsonPath = makeTempState();
  const result = registerTier(stateJsonPath, TINY_STRUCTURE, 'hitrust', 'HITRUST CSF');
  assert.equal(result.added, 2);
  assert.equal(result.isNewTier, true);

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const tier = state.certifications.hitrust.tiers.e1;
  assert.equal(tier.sourceAuthority, 'structural-only');
  assert.equal(tier.controlSetVersion, 'v11.8.0');
  assert.equal(tier.importedFrom, null);
  assert.equal(tier.importedAt, null);
  assert.deepEqual(Object.keys(tier.controls).sort(), ['CTRL-A', 'CTRL-B']);

  const a = tier.controls['CTRL-A'];
  assert.equal(a.statementText, null);
  assert.equal(a.statementSource, 'structural-only');
  assert.equal(a.assessment.status, 'not_assessed');
  assert.equal(a.assessment.assessedAt, null);
  assert.deepEqual(a.assessment.inProgress, { currentState: null, estimatedCloseness: null });
  assert.deepEqual(a.roadmap, { budgetTier: null, vendorResearch: [], recommendation: null, status: 'not_started' });

  const session = state.interviewSessions.find((s) => s.certification === 'hitrust' && s.tier === 'e1');
  assert.ok(session);
  assert.deepEqual(session.domainsRemaining, ['01', '02']);
  assert.deepEqual(session.domainsCompleted, []);
  assert.equal(session.status, 'in_progress');
});

test('computeDomains returns the sorted, deduped set of legacyCategoryPrefix values', () => {
  const structure = {
    controls: [
      { legacyCategoryPrefix: '09' },
      { legacyCategoryPrefix: '01' },
      { legacyCategoryPrefix: '09' },
      { legacyCategoryPrefix: '04' },
    ],
  };
  assert.deepEqual(computeDomains(structure), ['01', '04', '09']);
});

test('additive re-registration does not clobber an existing control\'s assessment/roadmap', () => {
  const stateJsonPath = makeTempState();
  registerTier(stateJsonPath, TINY_STRUCTURE, 'hitrust', 'HITRUST CSF');

  // Simulate an already-assessed control.
  let state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const control = state.certifications.hitrust.tiers.e1.controls['CTRL-A'];
  control.assessment.status = 'met';
  control.assessment.justification = 'Documented policy exists and is reviewed annually.';
  control.assessment.assessedAt = '2026-01-01T00:00:00.000Z';
  control.roadmap.status = 'not_started';
  fs.writeFileSync(stateJsonPath, JSON.stringify(state, null, 2));

  // Re-run registration with the same structure -- must be a no-op for existing controls.
  const result = registerTier(stateJsonPath, TINY_STRUCTURE, 'hitrust', 'HITRUST CSF');
  assert.equal(result.added, 0);
  assert.equal(result.isNewTier, false);

  state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const reread = state.certifications.hitrust.tiers.e1.controls['CTRL-A'];
  assert.equal(reread.assessment.status, 'met');
  assert.equal(reread.assessment.justification, 'Documented policy exists and is reviewed annually.');
  assert.equal(reread.assessment.assessedAt, '2026-01-01T00:00:00.000Z');

  // interviewSessions entry must not be duplicated.
  const sessions = state.interviewSessions.filter((s) => s.certification === 'hitrust' && s.tier === 'e1');
  assert.equal(sessions.length, 1);
});

test('additive registration adds only ids missing from state, leaving pre-existing controls untouched', () => {
  const stateJsonPath = makeTempState();
  // Pre-seed state with only CTRL-A already registered (as if from an earlier partial structure file).
  const preSeeded = {
    certifications: {
      hitrust: {
        displayName: 'HITRUST CSF',
        activeTier: 'e1',
        tiers: {
          e1: {
            controlSetVersion: 'v11.8.0',
            sourceAuthority: 'imported',
            importedFrom: 'existing-export.xlsx',
            importedAt: '2025-06-01T00:00:00.000Z',
            controls: {
              'CTRL-A': (() => {
                const c = defaultControl(TINY_STRUCTURE.controls[0]);
                c.statementText = 'Already imported statement text.';
                c.statementSource = 'imported';
                return c;
              })(),
            },
            archivedControls: {},
          },
        },
      },
    },
    interviewSessions: [
      {
        certification: 'hitrust',
        tier: 'e1',
        startedAt: '2025-06-01T00:00:00.000Z',
        lastUpdatedAt: '2025-06-01T00:00:00.000Z',
        domainsCompleted: [],
        domainsRemaining: ['01'],
        status: 'in_progress',
      },
    ],
  };
  fs.writeFileSync(stateJsonPath, JSON.stringify(preSeeded, null, 2));

  const result = registerTier(stateJsonPath, TINY_STRUCTURE, 'hitrust', 'HITRUST CSF');
  assert.equal(result.added, 1); // only CTRL-B is new
  assert.equal(result.isNewTier, false);

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const tier = state.certifications.hitrust.tiers.e1;
  // Existing tier-level bookkeeping (sourceAuthority etc.) must not be reset by re-registration.
  assert.equal(tier.sourceAuthority, 'imported');
  assert.equal(tier.importedFrom, 'existing-export.xlsx');
  assert.equal(tier.controls['CTRL-A'].statementText, 'Already imported statement text.');
  assert.equal(tier.controls['CTRL-B'].statementText, null);
  assert.equal(tier.controls['CTRL-B'].statementSource, 'structural-only');

  // domainsRemaining is session bookkeeping, not touched by re-registration.
  const session = state.interviewSessions.find((s) => s.certification === 'hitrust' && s.tier === 'e1');
  assert.deepEqual(session.domainsRemaining, ['01']);
});

test('the bundled e1.v11.8.structure.json loads and registers its public-sourced topic-level controls', () => {
  const structure = loadStructure();
  assert.equal(structure.tier, 'e1');
  assert.equal(structure.sourceAuthority, 'public-topic-level');
  // Not a fixed count to hit -- this is public-research output, honestly reported, not padded to
  // match a publicly-quoted target (see the structure file's own coverageNote). Assert it's in the
  // right ballpark and non-empty rather than pinning an exact number that legitimate recompiles
  // (better sources, deeper research) would then spuriously break.
  assert.ok(structure.controls.length > 20 && structure.controls.length <= 44, `expected a plausible e1 count, got ${structure.controls.length}`);

  const stateJsonPath = makeTempState();
  const result = registerTier(stateJsonPath, structure, 'hitrust', 'HITRUST CSF');
  assert.equal(result.added, structure.controls.length);

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const tier = state.certifications.hitrust.tiers.e1;
  assert.equal(Object.keys(tier.controls).length, structure.controls.length);
  assert.equal(tier.controlSetVersion, 'v11.8');

  // Every current entry carries a modern domainKey ("01".."19"), so domainsRemaining groups on
  // that -- not the handful of legacy relatedControlCode-derived legacyCategoryPrefix values a few
  // entries also happen to carry (a different, older numbering scheme -- see register-tier.js's
  // computeDomains comment).
  const session = state.interviewSessions.find((s) => s.certification === 'hitrust' && s.tier === 'e1');
  const expectedDomainKeys = Array.from(new Set(structure.controls.map((c) => c.domainKey))).sort();
  assert.deepEqual(session.domainsRemaining, expectedDomainKeys);
});

const TINY_I1_STRUCTURE = {
  tier: 'i1',
  controlSetVersion: 'v11.8',
  sourceAuthority: 'public-topic-level',
  controls: [
    {
      id: 'i1-01-01', domain: 'Information Protection Program', topicLabel: 'Program governance',
      topicSummary: 'Placeholder topic summary.', citations: ['https://example.com/a'],
      baselineOverlap: 'true', nonAuthoritative: true,
    },
    {
      id: 'i1-02-01', domain: 'Endpoint Protection', topicLabel: 'Mobile code controls',
      topicSummary: 'Placeholder topic summary.', citations: ['https://example.com/b'],
      baselineOverlap: 'false', nonAuthoritative: true,
    },
  ],
};

test('registering an i1-shaped (topic-level) structure preserves domain/topicLabel/citations fields', () => {
  const stateJsonPath = makeTempState();
  const result = registerTier(stateJsonPath, TINY_I1_STRUCTURE, 'hitrust', 'HITRUST CSF');
  assert.equal(result.added, 2);

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const tier = state.certifications.hitrust.tiers.i1;
  assert.equal(tier.sourceAuthority, 'public-topic-level');
  assert.equal(tier.controlSetVersion, 'v11.8');

  const control = tier.controls['i1-01-01'];
  assert.equal(control.domain, 'Information Protection Program');
  assert.equal(control.topicLabel, 'Program governance');
  assert.equal(control.topicSummary, 'Placeholder topic summary.');
  assert.deepEqual(control.citations, ['https://example.com/a']);
  assert.equal(control.baselineOverlap, 'true');
  assert.equal(control.nonAuthoritative, true);
  // Fields that don't apply to topic-level entries simply aren't present -- not forced to null,
  // since defaultControl() only spreads what the structure file actually declares.
  assert.equal(control.relatedControlCode, undefined);
  assert.equal(control.legacyCategoryPrefix, undefined);
  // Still gets the standard assessment/roadmap/statementText defaults like any other tier.
  assert.equal(control.statementText, null);
  assert.equal(control.statementSource, 'public-topic-level');
  assert.equal(control.assessment.status, 'not_assessed');
  assert.deepEqual(control.roadmap, { budgetTier: null, vendorResearch: [], recommendation: null, status: 'not_started' });

  // domainsRemaining groups by `domain` (not legacyCategoryPrefix, which these entries don't have).
  const session = state.interviewSessions.find((s) => s.certification === 'hitrust' && s.tier === 'i1');
  assert.deepEqual(session.domainsRemaining.sort(), ['Endpoint Protection', 'Information Protection Program']);
});

test('resolveStructurePath: bare tier names resolve to the bundled controls/ directory', () => {
  assert.equal(resolveStructurePath('e1'), STRUCTURE_FILE);
  assert.ok(resolveStructurePath('i1').endsWith(path.join('controls', 'i1.v11.8.structure.json')));
  assert.ok(resolveStructurePath('r2').endsWith(path.join('controls', 'r2.v11.8.structure.json')));
});

test('resolveStructurePath: no argument defaults to e1 (backward compatibility)', () => {
  assert.equal(resolveStructurePath(undefined), STRUCTURE_FILE);
});

test('resolveStructurePath: anything else is treated as a direct path to a structure file', () => {
  const resolved = resolveStructurePath('/some/custom/dir/my-structure.json');
  assert.equal(resolved, path.resolve('/some/custom/dir/my-structure.json'));
});

test('registerTier is parameterized by certKey/certDisplayName -- a second certification lands independently of hitrust', () => {
  const stateJsonPath = makeTempState();
  registerTier(stateJsonPath, TINY_STRUCTURE, 'hitrust', 'HITRUST CSF');
  registerTier(stateJsonPath, TINY_STRUCTURE, 'soc2', 'SOC 2 Type II');

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  assert.ok(state.certifications.hitrust, 'hitrust must still be registered');
  assert.ok(state.certifications.soc2, 'a second certification must register independently');
  assert.equal(state.certifications.soc2.displayName, 'SOC 2 Type II');
  assert.deepEqual(Object.keys(state.certifications.soc2.tiers.e1.controls).sort(), ['CTRL-A', 'CTRL-B']);
  assert.equal(state.certifications.hitrust.tiers.e1.controls['CTRL-A'].assessment.status, 'not_assessed');

  const sessions = state.interviewSessions.map((s) => s.certification).sort();
  assert.deepEqual(sessions, ['hitrust', 'soc2']);
});

test('registerTier throws if certKey or certDisplayName is missing', () => {
  const stateJsonPath = makeTempState();
  assert.throws(() => registerTier(stateJsonPath, TINY_STRUCTURE), /certKey is required/);
  assert.throws(() => registerTier(stateJsonPath, TINY_STRUCTURE, 'hitrust'), /certDisplayName is required/);
});

test('the bundled r2.v11.8.structure.json entries are concrete, assessable controls with a valid applicabilityTier', () => {
  const structure = loadStructure(resolveStructurePath('r2'));
  assert.equal(structure.tier, 'r2');
  assert.ok(structure.controls.length > 0, 'r2 structure file must not be empty');

  for (const control of structure.controls) {
    assert.ok(
      ['universal', 'conditional'].includes(control.applicabilityTier),
      `${control.id} must have applicabilityTier "universal" or "conditional"`
    );
    if (control.applicabilityTier === 'conditional') {
      assert.ok(
        control.conditionalOn && control.conditionalOn.trim().length > 0,
        `${control.id} is conditional but has no conditionalOn note`
      );
    } else {
      assert.equal(control.conditionalOn, undefined, `${control.id} is universal and must not carry a conditionalOn note`);
    }
    assert.equal(control.baselineOverlap, undefined, `${control.id} must not carry the removed baselineOverlap field`);
    assert.equal(control.exampleOnly, undefined, `${control.id} must not carry the removed exampleOnly field`);
    assert.equal(control.nonAuthoritative, true, `${control.id} must be marked nonAuthoritative`);
    assert.ok(Array.isArray(control.citations) && control.citations.length > 0, `${control.id} must carry at least one citation`);
    assert.match(control.id, /^r2-\d{2}-\d{2}$/, `${control.id} must use the r2-<domainKey>-<NN> id format`);
  }
});

test('defaultControl seeds an r2 control with a null top-level status and all 5 maturity dimensions not_assessed', () => {
  const entry = {
    id: 'r2-01-01', domain: 'Information Protection Program', domainKey: '01',
    topicLabel: 'x', topicSummary: 'y', citations: ['https://example.com'],
    applicabilityTier: 'universal', nonAuthoritative: true,
  };
  const control = defaultControl(entry, 'public-topic-level', 'r2');

  assert.equal(control.assessment.status, null);
  assert.deepEqual(
    Object.keys(control.assessment.maturity).sort(),
    ['implemented', 'managed', 'measured', 'policy', 'procedure']
  );
  for (const dim of Object.keys(control.assessment.maturity)) {
    assert.deepEqual(control.assessment.maturity[dim], {
      status: 'not_assessed', justification: null,
      inProgress: { currentState: null, estimatedCloseness: null }, assessedAt: null,
    });
  }
});

test('defaultControl without tierKey (e1/i1) keeps the existing flat assessment shape', () => {
  const control = defaultControl({ id: 'CTRL-A', legacyCategoryPrefix: '01' });
  assert.equal(control.assessment.status, 'not_assessed');
  assert.equal(control.assessment.maturity, undefined);
});

test('registering the bundled r2.v11.8.structure.json seeds every control with the maturity shape', () => {
  const structure = loadStructure(resolveStructurePath('r2'));
  const stateJsonPath = makeTempState();
  const result = registerTier(stateJsonPath, structure, 'hitrust', 'HITRUST CSF');
  assert.equal(result.added, structure.controls.length);

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const tier = state.certifications.hitrust.tiers.r2;
  for (const id of Object.keys(tier.controls)) {
    const control = tier.controls[id];
    assert.equal(control.assessment.status, null, `${id} must have a null top-level status`);
    assert.ok(control.assessment.maturity && control.assessment.maturity.implemented, `${id} must have a maturity.implemented dimension`);
  }
});
