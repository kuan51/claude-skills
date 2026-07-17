'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { detectDomainSignals } = require('../lib/domain-signals.js');

test('detects a clinical trial signal', () => {
  const matches = detectDomainSignals('This dataset tracks patient adverse event rates during the clinical trial.');
  assert.ok(matches.some((m) => m.key === 'clinical'));
});

test('detects a time-series forecasting signal', () => {
  const matches = detectDomainSignals('We built an ARIMA model to forecast monthly demand, accounting for seasonality.');
  assert.ok(matches.some((m) => m.key === 'time_series'));
});

test('returns no matches for generic text', () => {
  const matches = detectDomainSignals('This project counts words in a text file.');
  assert.deepEqual(matches, []);
});

test('detects multiple simultaneous signals', () => {
  const matches = detectDomainSignals('A causal analysis of loan default rates using propensity score matching.');
  const keys = matches.map((m) => m.key);
  assert.ok(keys.includes('financial'));
  assert.ok(keys.includes('causal'));
});
