'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SUBJECT_FIELDS, CODE_FIELDS, CODE_RE, sanitizeControlForResearch } = require('../sanitize-control.js');

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
    statementSource: 'public-topic-level',
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
  const out = sanitizeControlForResearch({ id: 'x', statementSource: 'public-topic-level', topicLabel: null, domain: 'Access Control' });
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

// Wording is sent only for a control whose statementSource says where it came from and is not
// "imported". An imported control's wording (names and domains included) is the org's licensed
// text, and a payload that leaves statementSource out fails closed the same way.
const FULL = {
  id: 'x-1', topicLabel: 'LICENSED label', topicSummary: 'LICENSED summary wording',
  relatedControlName: 'LICENSED name', domain: 'LICENSED domain', domainKey: 'AC',
  relatedControlCode: 'AC-1', legacyCategoryPrefix: '01',
};
const CODES_ONLY = { id: 'x-1', domainKey: 'AC', relatedControlCode: 'AC-1', legacyCategoryPrefix: '01' };

test('an imported control sends only its codes', () => {
  const out = sanitizeControlForResearch({ ...FULL, statementSource: 'imported' });
  assert.deepEqual(out, CODES_ONLY);
  assert.ok(!JSON.stringify(out).includes('LICENSED'));
});

test('a control with no statementSource fails closed to its codes', () => {
  assert.deepEqual(sanitizeControlForResearch(FULL), CODES_ONLY);
  assert.deepEqual(sanitizeControlForResearch({ ...FULL, statementSource: null }), CODES_ONLY);
});

test('a code that is not a plain token is dropped when only codes may go', () => {
  const out = sanitizeControlForResearch({ ...FULL, statementSource: 'imported', relatedControlCode: '01.a Licensed control name', id: 'has space' });
  assert.deepEqual(out, { id: undefined, domainKey: 'AC', legacyCategoryPrefix: '01' });
});

test('any other statementSource sends the full subject', () => {
  for (const statementSource of ['public-topic-level', 'publisher-verbatim', 'structural-only']) {
    const out = sanitizeControlForResearch({ ...FULL, statementSource });
    assert.deepEqual(out, FULL, statementSource);
    assert.ok(!('statementSource' in out), 'statementSource is read, never sent');
  }
});

test('workflow.js inlines the same CODE_FIELDS and CODE_RE and applies them', () => {
  const workflowSrc = fs.readFileSync(path.join(__dirname, '..', 'workflow.js'), 'utf8');
  const match = workflowSrc.match(/const CODE_FIELDS = \[([^\]]*)\]/);
  assert.ok(match, 'workflow.js must declare `const CODE_FIELDS = [ ... ]`');
  const inline = match[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  assert.deepEqual(inline, CODE_FIELDS);
  assert.ok(workflowSrc.includes(`const CODE_RE = ${CODE_RE}`), 'workflow.js must inline the same CODE_RE');
  assert.ok(workflowSrc.includes("typeof c.statementSource === 'string' && c.statementSource !== 'imported'"), 'buildPrompt must fail closed on statementSource');
  assert.ok(workflowSrc.includes('isCode(field, value)'), 'buildPrompt must keep only codes when wording may not go');
});
