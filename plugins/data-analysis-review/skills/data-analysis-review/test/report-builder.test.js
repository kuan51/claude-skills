'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildReport } = require('../lib/report-builder.js');

const TEMPLATE = '# {{PROJECT_NAME}}\n\n{{THESIS}}\n\n{{FINDINGS}}\n\n{{VERDICT_ACCURACY}}';

test('substitutes simple tokens', () => {
  const out = buildReport(TEMPLATE, {
    projectName: 'Widget Forecast',
    thesis: 'Predict widget demand.',
    verdictAccuracy: 'Supported.',
  });
  assert.ok(out.includes('# Widget Forecast'));
  assert.ok(out.includes('Predict widget demand.'));
  assert.ok(out.includes('Supported.'));
});

test('renders findings grouped by role with severity and evidence', () => {
  const out = buildReport(TEMPLATE, {
    eda: [
      {
        key: 'data_quality',
        label: 'data quality & integrity reviewer',
        findings: [
          {
            severity: 'high',
            claim: 'Duplicate rows inflate the training set by 12%.',
            evidence: 'data/train.csv rows 100-350 are exact duplicates.',
            required_execution: true,
            verified: true,
          },
        ],
      },
    ],
  });
  assert.ok(out.includes('### data quality & integrity reviewer'));
  assert.ok(out.includes('**[high]** Duplicate rows inflate the training set by 12%.'));
  assert.ok(out.includes('verified — recomputed'));
});

test('flags a required-but-unexecuted finding as unverified', () => {
  const out = buildReport(TEMPLATE, {
    eda: [
      {
        key: 'statistical',
        label: 'statistical methodologist',
        findings: [
          {
            severity: 'medium',
            claim: 'Residuals look non-normal.',
            evidence: 'Inferred from model choice; not run.',
            required_execution: true,
            verified: false,
          },
        ],
      },
    ],
  });
  assert.ok(out.includes('unverified — inferred, not executed'));
  assert.ok(!out.includes('recomputed'));
});

test('falls back to placeholder text when a section has no data', () => {
  const out = buildReport(TEMPLATE, { projectName: 'Empty Project' });
  assert.ok(out.includes('_No independent findings recorded._'));
});

test('builds from the real template file without a leading BOM', () => {
  const templatePath = path.join(__dirname, '..', 'references', 'report-template.md');
  const templateText = fs.readFileSync(templatePath, 'utf8');
  const out = buildReport(templateText, {
    projectName: 'Real Template Project',
    thesis: 'Verify the on-disk template renders cleanly.',
  });
  assert.ok(!out.startsWith('﻿'), 'output must not start with a BOM character');
  assert.ok(out.includes('## Thesis & Goals'));
  assert.ok(out.includes('## Overall Verdicts'));
});

const REAL_TEMPLATE = fs.readFileSync(path.join(__dirname, '..', 'references', 'report-template.md'), 'utf8');
const PLUGIN_VERSION = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '..', '.claude-plugin', 'plugin.json'), 'utf8')
).version;

function section(out, heading) {
  const start = out.indexOf(`## ${heading}`);
  assert.ok(start >= 0, `missing section ${heading}`);
  const next = out.indexOf('\n## ', start + 1);
  return out.slice(start, next < 0 ? undefined : next);
}

const CC = (verdict, extra = {}) => ({
  topic: `${verdict} topic`,
  project_claim: 'claim',
  independent_finding: `${verdict} finding`,
  discrepancy: 'none',
  verdict,
  ...extra,
});

test('renders the executive summary as a three-item list, or a placeholder when absent', () => {
  const out = buildReport(REAL_TEMPLATE, { executiveSummary: ['Supported.', 'Affects rollout, material.', 'Add a baseline.'] });
  assert.ok(section(out, 'Executive summary').includes('- Supported.\n- Affects rollout, material.\n- Add a baseline.'));
  assert.ok(section(buildReport(REAL_TEMPLATE, {}), 'Executive summary').includes('_No executive summary provided._'));
});

test('fills the plugin version from plugin.json', () => {
  assert.ok(buildReport(REAL_TEMPLATE, {}).includes(`**Plugin version:** ${PLUGIN_VERSION}`));
});

test('renders overCap under Reconciliation Notes, including an entry without severity', () => {
  const out = buildReport(REAL_TEMPLATE, {
    overCap: [
      { topic: 'Late topic', severity: 'low', finding: 'Minor drift.', evidence: 'col x', verified: true },
      { topic: 'Unlabelled topic', finding: 'Something.', evidence: 'col y', verified: false },
    ],
  });
  const notes = section(out, 'Reconciliation Notes');
  assert.ok(notes.includes('Not cross-compared, over the topic cap'));
  assert.ok(notes.includes('- **[low]** **Late topic**: Minor drift. (verified)'));
  assert.ok(notes.includes('- **Unlabelled topic**: Something. (unverified)'));
  assert.ok(!notes.includes('undefined'));
});

test('cross-comparison renders the decision-affected and to-settle lines, and keeps Not Addressed out', () => {
  const out = buildReport(REAL_TEMPLATE, {
    crossCompare: [
      CC('Partially Supported', { business_impact: 'Rollout decision; lift is material.', to_settle: 'Re-run with a holdout.' }),
      CC('Not Addressed', { business_impact: 'Pricing decision.', evidence: 'rows 1-500', verified: false }),
    ],
  });
  const cc = section(out, 'Cross-Comparison');
  assert.ok(cc.includes('- **Decision affected / materiality:** Rollout decision; lift is material.'));
  assert.ok(cc.includes('- **To settle:** Re-run with a holdout.'));
  assert.ok(!cc.includes('Not Addressed'));
  const un = section(out, "Independent findings the project's report does not address");
  assert.ok(un.includes('### Not Addressed topic (unverified)'));
  assert.ok(un.includes('- **Evidence:** rows 1-500'));
  assert.ok(un.includes('- **Decision affected / materiality:** Pricing decision.'));
  assert.equal(out.split('Not Addressed finding').length - 1, 1, 'the unaddressed topic appears once');
});

test('headings use the reconciled topic when the workflow attached one, else the auditor topic', () => {
  const out = buildReport(REAL_TEMPLATE, {
    crossCompare: [
      CC('Supported', { reconciled_topic: 'topic-1: retention vs baseline' }),
      CC('Not Addressed', { reconciled_topic: 'topic-2: duplicate rows', verified: true }),
      CC('Unsupported'),
    ],
  });
  assert.ok(section(out, 'Cross-Comparison').includes('### topic-1: retention vs baseline — Supported'));
  assert.ok(!section(out, 'Cross-Comparison').includes('### Supported topic'));
  assert.ok(section(out, "Independent findings the project's report does not address").includes('### topic-2: duplicate rows (verified)'));
  assert.ok(section(out, 'Cross-Comparison').includes('### Unsupported topic — Unsupported'), 'falls back to the auditor topic');
});

test('prints a decision-affected line under an EDA finding carrying business_impact', () => {
  const out = buildReport(TEMPLATE, {
    eda: [{ key: 'domain_alignment', findings: [{ severity: 'medium', claim: 'c', evidence: 'e', required_execution: false, verified: false, business_impact: 'Staffing decision.' }] }],
  });
  assert.ok(out.includes('  - Decision affected / materiality: Staffing decision.'));
});

test('prints each new section placeholder when empty', () => {
  const out = buildReport(REAL_TEMPLATE, { crossCompare: [] });
  assert.ok(section(out, 'Cross-Comparison').includes('_No topic the project addresses was cross-compared._'));
  assert.ok(section(out, "Independent findings the project's report does not address").includes('_No independent finding went unaddressed by the project._'));
  assert.ok(!section(out, 'Reconciliation Notes').includes('over the topic cap'));
});

test('renders a 0.1.2-shaped result through the real template with no undefined or null', () => {
  const out = buildReport(REAL_TEMPLATE, {
    projectName: 'Old Result',
    reviewDate: '2026-09-01',
    thesis: 'Old thesis.',
    scope: 'Four roles.',
    eda: [{ key: 'statistical', label: 'Statistical Methodologist', findings: [{ severity: 'low', claim: 'c', evidence: 'e', required_execution: true, verified: true }] }],
    reconciled: [{ topic: 't', finding: 'f', evidence: 'e', verified: true }],
    disagreements: [{ topic: 't', description: 'd', roles_involved: ['statistical'] }],
    crossCompare: ['Supported', 'Partially Supported', 'Unsupported', 'Not Addressed'].map((v) => CC(v)),
    verdictAccuracy: 'a',
    verdictCohesiveness: 'b',
    verdictRationale: 'r',
  });
  assert.ok(!/undefined|null/.test(out), 'output must not contain undefined or null');
  assert.ok(section(out, 'Cross-Comparison').includes('- **Decision affected / materiality:** none identified'));
  assert.ok(section(out, "Independent findings the project's report does not address").includes('### Not Addressed topic\n'));
});

test('a token inside a substituted value stays literal and is not expanded', () => {
  const out = buildReport(REAL_TEMPLATE, { thesis: 'goal {{RECOMMENDATIONS}} end', recommendations: 'RECS-TEXT' });
  const thesis = section(out, 'Thesis & Goals');
  assert.ok(thesis.includes('goal {{RECOMMENDATIONS}} end'));
  assert.ok(!thesis.includes('RECS-TEXT'));
  assert.equal(section(out, 'Recommendations').split('RECS-TEXT').length - 1, 1);
});

test('a template token with no map entry stays literal', () => {
  assert.equal(buildReport('{{NOPE}} {{PROJECT_NAME}}', { projectName: 'P' }), '{{NOPE}} P');
});

test('recommendations and scope given as arrays render as bullet lists', () => {
  const out = buildReport(REAL_TEMPLATE, { scope: ['Four roles.', 'No skills.'], recommendations: ['Add a holdout.', 'Pin pandas.'] });
  assert.ok(section(out, 'Scope & Method').includes('- Four roles.\n- No skills.'));
  assert.ok(section(out, 'Recommendations').includes('- Add a holdout.\n- Pin pandas.'));
  assert.ok(!out.includes('Add a holdout.,Pin'));
});
