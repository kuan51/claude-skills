'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
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
          },
        ],
      },
    ],
  });
  assert.ok(out.includes('### data quality & integrity reviewer'));
  assert.ok(out.includes('**[high]** Duplicate rows inflate the training set by 12%.'));
  assert.ok(out.includes('(recomputed)'));
});

test('falls back to placeholder text when a section has no data', () => {
  const out = buildReport(TEMPLATE, { projectName: 'Empty Project' });
  assert.ok(out.includes('_No independent findings recorded._'));
});
