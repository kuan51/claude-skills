'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SUBJECT_FIELDS, sanitizeControlForResearch } = require('../sanitize-control.js');

test('keeps every subject field and drops org-private / licensed fields', () => {
  const control = {
    id: 'e1-11-01',
    relatedControlCode: '11.a',
    relatedControlName: 'Access Control Policy',
    legacyCategoryPrefix: '11',
    topicLabel: 'Access control',
    topicSummary: 'Restrict access to information systems',
    domain: 'Access Control',
    domainKey: '11',
    // org-private posture / licensed content -- must NOT egress:
    justification: 'We fail this: the VPN has no MFA and the CISO deprioritized it in Q3',
    inProgress: { currentState: 'rolling out Okta', estimatedCloseness: '60%' },
    inProgressNotes: 'sensitive internal posture note',
    statementText: 'LICENSED MyCSF verbatim requirement wording',
  };

  const out = sanitizeControlForResearch(control);

  for (const field of SUBJECT_FIELDS) {
    assert.equal(out[field], control[field], `subject field ${field} must be preserved`);
  }
  assert.equal(out.id, 'e1-11-01');
  assert.ok(!('justification' in out));
  assert.ok(!('inProgress' in out));
  assert.ok(!('inProgressNotes' in out));
  assert.ok(!('statementText' in out));

  // Belt-and-suspenders: none of the sensitive substrings can appear anywhere in the serialized
  // payload that becomes the research prompt.
  const serialized = JSON.stringify(out);
  for (const secret of ['MFA', 'Okta', 'deprioritized', 'LICENSED', 'internal posture']) {
    assert.ok(!serialized.includes(secret), `serialized output must not leak "${secret}"`);
  }
});

test('fail-closed: an unknown / future field is dropped by default', () => {
  const out = sanitizeControlForResearch({ id: 'x', futurePostureField: 'secret-value' });
  assert.deepEqual(out, { id: 'x' });
});

test('null / undefined subject fields are omitted, not serialized as null', () => {
  const out = sanitizeControlForResearch({ id: 'x', topicLabel: null, domain: 'Access Control' });
  assert.ok(!('topicLabel' in out));
  assert.equal(out.domain, 'Access Control');
});

test('handles a null/empty control without throwing', () => {
  assert.deepEqual(sanitizeControlForResearch(null), { id: undefined });
  assert.deepEqual(sanitizeControlForResearch({}), { id: undefined });
});

// Sync guard: workflow.js is a Workflow-tool script with no require access, so it cannot import
// this module -- it inlines the SUBJECT_FIELDS list instead. This test reads workflow.js as text
// and asserts its inline list matches this module's, so the two can never drift apart silently.
test('workflow.js inlines the same SUBJECT_FIELDS list', () => {
  const workflowSrc = fs.readFileSync(path.join(__dirname, '..', 'workflow.js'), 'utf8');
  const match = workflowSrc.match(/const SUBJECT_FIELDS = \[([\s\S]*?)\]/);
  assert.ok(match, 'workflow.js must declare `const SUBJECT_FIELDS = [ ... ]`');
  const inlineFields = match[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
  assert.deepEqual(
    inlineFields,
    SUBJECT_FIELDS,
    'workflow.js SUBJECT_FIELDS must stay in sync with sanitize-control.js'
  );

  // Matching the list is not enough -- buildPrompt must actually USE it. workflow.js can't be
  // require()'d (ESM + injected Workflow globals), so pin its behavior by source: it must iterate
  // SUBJECT_FIELDS and must NOT reintroduce the old fail-open spread. Without this, a future edit
  // could restore `...descriptiveFields` while leaving the const declared -- this test would stay
  // green and posture prose would silently egress again (the exact bug this change fixed).
  assert.ok(
    workflowSrc.includes('for (const field of SUBJECT_FIELDS)'),
    'buildPrompt must iterate SUBJECT_FIELDS, not spread every field'
  );
  assert.ok(
    !workflowSrc.includes('...descriptiveFields'),
    'workflow.js must not spread all non-id fields (the removed fail-open egress path)'
  );
});
