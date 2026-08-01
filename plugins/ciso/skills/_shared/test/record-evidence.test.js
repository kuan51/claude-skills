'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { recordEvidence, EVIDENCE_KINDS } = require('../record-evidence.js');

function ctl(id, status, assessedAt, extra) {
  return Object.assign({
    id,
    assessment: {
      status,
      justification: status === 'met' ? 'Okta SSO with MFA.' : null,
      inProgress: { currentState: null, estimatedCloseness: null },
      assessedAt,
    },
    evidence: [],
  }, extra);
}

// cc6.1 is assessed and evidenceable. cc7.1 is deliberately untouched (assessedAt: null) so the
// "never makes an unassessed control look assessed" invariant has something to assert on. cc8.1
// predates the evidence field entirely -- no `evidence` key at all.
function mkStateDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ciso-evidence-'));
  const cc8 = ctl('soc2-cc8.1', 'met', '2020-06-01T00:00:00.000Z');
  delete cc8.evidence;

  const state = {
    schemaVersion: '1.0.0',
    generatedAt: '2020-01-01T00:00:00.000Z',
    organization: { name: 'Example Org' },
    certifications: {
      soc2: {
        displayName: 'SOC 2 Type II',
        activeTier: 'type2',
        tiers: {
          type2: {
            controlSetVersion: 'v2017tsc',
            sourceAuthority: 'public-topic-level',
            controls: {
              'soc2-cc6.1': ctl('soc2-cc6.1', 'met', '2020-06-01T00:00:00.000Z'),
              'soc2-cc7.1': ctl('soc2-cc7.1', 'not_assessed', null),
              'soc2-cc8.1': cc8,
            },
            archivedControls: { 'old-1': { id: 'old-1' } },
          },
        },
      },
    },
    interviewSessions: [
      { certification: 'soc2', tier: 'type2', domainsCompleted: ['CC6'], domainsRemaining: ['CC7'], status: 'in_progress' },
    ],
  };
  const statePath = path.join(dir, 'state.json');
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  return statePath;
}

function readState(statePath) {
  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

function controlIn(statePath, id) {
  return readState(statePath).certifications.soc2.tiers.type2.controls[id];
}

const VALID = {
  kind: 'pr',
  ref: 'https://github.com/example/repo/pull/123',
  summary: 'Adds structured audit logging to all API handlers',
};

test('appends an evidence record to the control', () => {
  const statePath = mkStateDir();
  const evidence = recordEvidence(statePath, 'soc2', 'type2', 'soc2-cc6.1', VALID);

  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].kind, 'pr');
  assert.equal(evidence[0].ref, VALID.ref);
  assert.equal(evidence[0].summary, VALID.summary);
  assert.match(evidence[0].recordedAt, /^\d{4}-\d{2}-\d{2}T/);

  assert.deepEqual(controlIn(statePath, 'soc2-cc6.1').evidence, evidence);
});

test('appends rather than replacing, so a control accumulates evidence', () => {
  const statePath = mkStateDir();
  recordEvidence(statePath, 'soc2', 'type2', 'soc2-cc6.1', VALID);
  recordEvidence(statePath, 'soc2', 'type2', 'soc2-cc6.1', {
    kind: 'ci-run',
    ref: 'https://github.com/example/repo/actions/runs/456',
    summary: 'Log-assertion suite passing on main',
  });

  const evidence = controlIn(statePath, 'soc2-cc6.1').evidence;
  assert.equal(evidence.length, 2);
  assert.deepEqual(evidence.map((e) => e.kind), ['pr', 'ci-run']);
});

test('treats a control with no evidence array as empty rather than failing', () => {
  const statePath = mkStateDir();
  assert.equal(controlIn(statePath, 'soc2-cc8.1').evidence, undefined);

  const evidence = recordEvidence(statePath, 'soc2', 'type2', 'soc2-cc8.1', VALID);
  assert.equal(evidence.length, 1);
});

// The load-bearing invariant. apply-assessment.js's markCategoryComplete throws while any control
// in a domain has assessedAt: null, so if recording evidence stamped assessedAt it would silently
// make an unassessed domain completable -- and ciso:audit could never report "met without
// evidence" because the two axes would have collapsed into one.
test('never touches assessment -- not status, and above all not assessedAt', () => {
  const statePath = mkStateDir();
  const before = controlIn(statePath, 'soc2-cc7.1').assessment;

  recordEvidence(statePath, 'soc2', 'type2', 'soc2-cc7.1', VALID);

  const after = controlIn(statePath, 'soc2-cc7.1').assessment;
  assert.deepEqual(after, before, 'assessment must be byte-identical after recording evidence');
  assert.equal(after.assessedAt, null, 'an unassessed control must stay unassessed');
  assert.equal(after.status, 'not_assessed');
});

test('leaves other controls, archivedControls and interviewSessions untouched', () => {
  const statePath = mkStateDir();
  const before = readState(statePath);

  recordEvidence(statePath, 'soc2', 'type2', 'soc2-cc6.1', VALID);

  const after = readState(statePath);
  assert.deepEqual(after.certifications.soc2.tiers.type2.controls['soc2-cc7.1'],
    before.certifications.soc2.tiers.type2.controls['soc2-cc7.1']);
  assert.deepEqual(after.certifications.soc2.tiers.type2.archivedControls,
    before.certifications.soc2.tiers.type2.archivedControls);
  assert.deepEqual(after.interviewSessions, before.interviewSessions);
});

test('rejects an unknown kind', () => {
  const statePath = mkStateDir();
  assert.throws(
    () => recordEvidence(statePath, 'soc2', 'type2', 'soc2-cc6.1', { ...VALID, kind: 'screenshot' }),
    /kind must be one of/
  );
});

test('accepts every documented kind', () => {
  const statePath = mkStateDir();
  for (const kind of EVIDENCE_KINDS) {
    recordEvidence(statePath, 'soc2', 'type2', 'soc2-cc6.1', { ...VALID, kind });
  }
  assert.equal(controlIn(statePath, 'soc2-cc6.1').evidence.length, EVIDENCE_KINDS.size);
});

test('rejects an unknown field rather than writing it somewhere nothing reads', () => {
  const statePath = mkStateDir();
  assert.throws(
    () => recordEvidence(statePath, 'soc2', 'type2', 'soc2-cc6.1', { ...VALID, confidence: 'high' }),
    /unknown evidence field "confidence"/
  );
});

test('requires a non-blank ref and summary', () => {
  const statePath = mkStateDir();
  assert.throws(() => recordEvidence(statePath, 'soc2', 'type2', 'soc2-cc6.1', { ...VALID, ref: '   ' }), /ref is required/);
  assert.throws(() => recordEvidence(statePath, 'soc2', 'type2', 'soc2-cc6.1', { ...VALID, summary: '' }), /summary is required/);
});

test('trims whitespace off ref and summary', () => {
  const statePath = mkStateDir();
  const evidence = recordEvidence(statePath, 'soc2', 'type2', 'soc2-cc6.1', {
    kind: 'commit',
    ref: '  abc1234  ',
    summary: '  Pins the base image digest  ',
  });
  assert.equal(evidence[0].ref, 'abc1234');
  assert.equal(evidence[0].summary, 'Pins the base image digest');
});

test('rejects bad arguments -- missing keys, unknown target, non-object record', () => {
  const statePath = mkStateDir();
  const rejects = (args, pattern) => assert.throws(() => recordEvidence(statePath, ...args), pattern);

  rejects([null, 'type2', 'soc2-cc6.1', VALID], /certKey is required/);
  rejects(['soc2', null, 'soc2-cc6.1', VALID], /tierKey is required/);
  rejects(['soc2', 'type2', null, VALID], /controlId is required/);
  rejects(['soc2', 'type2', 'soc2-zz9.9', VALID], /control "soc2-zz9.9" not found/);
  rejects(['soc2', 'type1', 'soc2-cc6.1', VALID], /tier soc2\/type1 not found/);
  rejects(['hitrust', 'e1', 'soc2-cc6.1', VALID], /tier hitrust\/e1 not found/);
  rejects(['soc2', 'type2', 'soc2-cc6.1', [VALID]], /record must be an object/);
  rejects(['soc2', 'type2', 'soc2-cc6.1', 'pr'], /record must be an object/);
});

test('a rejected record writes nothing at all', () => {
  const statePath = mkStateDir();
  const before = fs.readFileSync(statePath, 'utf8');
  assert.throws(() => recordEvidence(statePath, 'soc2', 'type2', 'soc2-cc6.1', { ...VALID, kind: 'nope' }));
  assert.equal(fs.readFileSync(statePath, 'utf8'), before);
});

// occurredAt: the artifact's own date, distinct from recordedAt (write time). SOC 2 Type II turns
// on whether a control operated across the observation period, so attaching a 2024 PR during a
// 2025 period must not read as "started mid-period".
test('occurredAt is optional, stored as ISO, and never confused with recordedAt', () => {
  const statePath = mkStateDir();
  const evidence = recordEvidence(statePath, 'soc2', 'type2', 'soc2-cc6.1', {
    ...VALID,
    occurredAt: '2024-03-11',
  });

  assert.equal(evidence[0].occurredAt, '2024-03-11T00:00:00.000Z');
  assert.notEqual(evidence[0].occurredAt, evidence[0].recordedAt);
  assert.ok(new Date(evidence[0].recordedAt) > new Date(evidence[0].occurredAt),
    'recordedAt is write time and must be later than a backdated artifact');
});

test('occurredAt is omitted entirely when not supplied, so "unknown" is distinguishable from a date', () => {
  const statePath = mkStateDir();
  const evidence = recordEvidence(statePath, 'soc2', 'type2', 'soc2-cc6.1', VALID);
  assert.ok(!('occurredAt' in evidence[0]), 'absent means nobody stated the artifact date');
  assert.ok(evidence[0].recordedAt);
});

test('rejects an unparseable occurredAt rather than storing an epoch-era timestamp', () => {
  const statePath = mkStateDir();
  assert.throws(
    () => recordEvidence(statePath, 'soc2', 'type2', 'soc2-cc6.1', { ...VALID, occurredAt: 'last spring' }),
    /occurredAt must be an ISO-8601 date/
  );
  assert.deepEqual(controlIn(statePath, 'soc2-cc6.1').evidence, [], 'nothing written on rejection');
});
