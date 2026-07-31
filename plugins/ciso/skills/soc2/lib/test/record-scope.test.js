'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { recordScope } = require('../record-scope.js');

function mkStateDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ciso-soc2-scope-'));
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
              'soc2-cc6.1': {
                id: 'soc2-cc6.1',
                assessment: { status: 'met', justification: 'Okta SSO with MFA.', assessedAt: '2020-06-01T00:00:00.000Z' },
              },
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

const VALID = {
  reportType: 'type2',
  tscCategories: ['security', 'availability'],
  observationPeriodStart: '2026-08-01',
  observationPeriodEnd: '2027-01-31',
  subserviceMethod: 'carve-out',
};

test('records scope fields onto the tier', () => {
  const statePath = mkStateDir();
  const scope = recordScope(statePath, 'soc2', 'type2', VALID);

  assert.equal(scope.reportType, 'type2');
  assert.deepEqual(scope.tscCategories, ['security', 'availability']);
  assert.ok(scope.recordedAt, 'recordedAt must be stamped');

  const stored = readState(statePath).certifications.soc2.tiers.type2.scope;
  assert.equal(stored.observationPeriodEnd, '2027-01-31');
});

test('never touches controls, archivedControls or interviewSessions', () => {
  const statePath = mkStateDir();
  const before = readState(statePath);

  recordScope(statePath, 'soc2', 'type2', VALID);

  const after = readState(statePath);
  const beforeTier = before.certifications.soc2.tiers.type2;
  const afterTier = after.certifications.soc2.tiers.type2;

  assert.deepEqual(afterTier.controls, beforeTier.controls, 'assessment data must survive byte-for-byte');
  assert.deepEqual(afterTier.archivedControls, beforeTier.archivedControls);
  assert.deepEqual(after.interviewSessions, before.interviewSessions);
  assert.equal(afterTier.controlSetVersion, beforeTier.controlSetVersion, 'other tier metadata is untouched');
});

test('is idempotent and merges rather than replacing an existing scope', () => {
  const statePath = mkStateDir();
  recordScope(statePath, 'soc2', 'type2', VALID);
  // A later flow records only the auditor -- the earlier category selection must survive.
  const merged = recordScope(statePath, 'soc2', 'type2', { serviceAuditor: 'Example CPA LLP' });

  assert.equal(merged.serviceAuditor, 'Example CPA LLP');
  assert.deepEqual(merged.tscCategories, ['security', 'availability'], 'recording one field must not erase the others');
  assert.equal(merged.reportType, 'type2');
});

test('rejects an unknown scope field instead of silently storing it where nothing reads it', () => {
  const statePath = mkStateDir();
  assert.throws(
    () => recordScope(statePath, 'soc2', 'type2', { reportTyp: 'type2' }),
    /unknown scope field "reportTyp"/
  );
  assert.equal(readState(statePath).certifications.soc2.tiers.type2.scope, undefined, 'a rejected call must write nothing');
});

test('rejects tscCategories that omit security -- the Common Criteria are mandatory', () => {
  const statePath = mkStateDir();
  assert.throws(
    () => recordScope(statePath, 'soc2', 'type2', { tscCategories: ['availability'] }),
    /must include "security"/
  );
});

test('rejects out-of-vocabulary values for reportType, subserviceMethod and tscCategories', () => {
  const statePath = mkStateDir();
  assert.throws(() => recordScope(statePath, 'soc2', 'type2', { reportType: 'type3' }), /reportType must be one of/);
  assert.throws(() => recordScope(statePath, 'soc2', 'type2', { subserviceMethod: 'ignored' }), /subserviceMethod must be one of/);
  assert.throws(() => recordScope(statePath, 'soc2', 'type2', { tscCategories: ['security', 'availabilty'] }), /tscCategories entry must be one of/);
  assert.throws(() => recordScope(statePath, 'soc2', 'type2', { tscCategories: 'security' }), /tscCategories must be an array/);
});

test('requires certKey and tierKey rather than guessing, and reports an unregistered tier clearly', () => {
  const statePath = mkStateDir();
  assert.throws(() => recordScope(statePath, null, 'type2', VALID), /certKey is required/);
  assert.throws(() => recordScope(statePath, 'soc2', null, VALID), /tierKey is required/);
  assert.throws(() => recordScope(statePath, 'soc2', 'type1', VALID), /tier soc2\/type1 not found/);
  assert.throws(() => recordScope(statePath, 'soc2', 'type2', 'not-an-object'), /scope must be an object/);
});
