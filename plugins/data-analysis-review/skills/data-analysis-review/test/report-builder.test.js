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
