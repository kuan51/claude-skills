'use strict';

const DOMAIN_SIGNALS = {
  clinical: {
    keywords: ['patient', 'clinical trial', 'diagnosis', 'treatment', 'icd-10', 'ehr', 'adverse event'],
    label: 'Clinical / healthcare outcomes review',
  },
  financial: {
    keywords: ['credit score', 'loan', 'underwriting', 'default rate', 'fraud', 'transaction'],
    label: 'Financial decisioning review',
  },
  fairness: {
    keywords: ['hiring', 'demographic', 'protected class', 'race', 'gender', 'disparate impact', 'applicant'],
    label: 'Fairness / disparate-impact review',
  },
  time_series: {
    keywords: ['forecast', 'time series', 'seasonality', 'arima', 'prophet', 'lag feature'],
    label: 'Time-series leakage review',
  },
  causal: {
    keywords: ['causal', 'treatment effect', 'confounder', 'a/b test', 'randomized', 'propensity'],
    label: 'Causal inference validity review',
  },
};

function detectDomainSignals(text) {
  const lower = String(text || '').toLowerCase();
  const matches = [];
  for (const [key, { keywords, label }] of Object.entries(DOMAIN_SIGNALS)) {
    const hit = keywords.find((kw) => lower.includes(kw));
    if (hit) matches.push({ key, label, matchedKeyword: hit });
  }
  return matches;
}

module.exports = { detectDomainSignals, DOMAIN_SIGNALS };

if (require.main === module) {
  const fs = require('fs');
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: node domain-signals.js <path-to-text-file>');
    process.exit(1);
  }
  const text = fs.readFileSync(input, 'utf8');
  console.log(JSON.stringify(detectDomainSignals(text), null, 2));
}
