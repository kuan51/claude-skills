'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { computeRollups, injectData } = require('../render-dashboard.js');

const TEMPLATE_PATH = path.join(__dirname, '..', '..', '..', 'assets', 'dashboard-template.html');

// ---------------------------------------------------------------------------
// Minimal stub DOM -- just enough for render()/applyFilters() to run to
// completion without throwing. querySelectorAll always returns [] since live
// filter-toolbar interaction (wiring real DOM events to real rows) is out of
// scope for these tests -- see the design spec.
// ---------------------------------------------------------------------------

function makeElement() {
  return {
    innerHTML: '',
    textContent: '',
    value: '',
    style: {},
    appendChild() {},
    addEventListener() {},
  };
}

function makeStubDocument() {
  const byId = {};
  return {
    getElementById(id) {
      if (!byId[id]) byId[id] = makeElement();
      return byId[id];
    },
    createElement() {
      return makeElement();
    },
    querySelectorAll() {
      return [];
    },
  };
}

// Runs the REAL, unmodified dashboard-template.html client script against `state`, via the same
// injectData()/computeRollups() production code path render-dashboard.js uses, and returns the
// rendered #overview/#drilldowns innerHTML strings.
function renderClientSide(state) {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const rollups = computeRollups(state);
  const html = injectData(template, { state, rollups });

  const scriptStart = html.indexOf('<script>') + '<script>'.length;
  const scriptEnd = html.indexOf('</script>', scriptStart);
  const scriptBody = html.slice(scriptStart, scriptEnd);

  const document = makeStubDocument();
  const sandbox = { document };
  vm.createContext(sandbox);
  vm.runInContext(scriptBody, sandbox);

  return {
    overviewHtml: document.getElementById('overview').innerHTML,
    drilldownsHtml: document.getElementById('drilldowns').innerHTML,
  };
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeControl(overrides) {
  return Object.assign(
    {
      id: 'CTRL.0001',
      type: 'Organizational',
      level: 1,
      relatedControlCode: '11.a',
      relatedControlName: 'Sample Control Name',
      domainKey: '11',
      statementText: null,
      statementSource: 'structural-only',
      assessment: {
        status: 'not_assessed',
        justification: null,
        inProgress: { currentState: null, estimatedCloseness: null },
        assessedAt: null,
      },
      roadmap: { budgetTier: null, vendorResearch: [], recommendation: null, status: 'not_started' },
    },
    overrides
  );
}

function baseState(controlsById) {
  return {
    schemaVersion: '1.0.0',
    generatedAt: '2020-01-01T00:00:00.000Z',
    organization: { name: 'Example Test Org' },
    certifications: {
      hitrust: {
        displayName: 'HITRUST CSF',
        activeTier: 'e1',
        tiers: {
          e1: {
            controlSetVersion: 'v11.8.0',
            sourceAuthority: 'structural-only',
            importedFrom: null,
            importedAt: null,
            controls: controlsById,
            archivedControls: {},
          },
        },
      },
    },
    interviewSessions: [],
  };
}

// A real e1 domain (domainKey "11") that mixes controls carrying legacyCategoryPrefix with
// controls that don't -- this exact shape is what commit 3c238d8's client/server grouping-key
// mismatch split into two groups instead of one.
const MIXED_DOMAIN_CONTROLS = {
  c1: makeControl({ id: 'e1-11-01', legacyCategoryPrefix: '01' }),
  c2: makeControl({ id: 'e1-11-02', legacyCategoryPrefix: '01' }),
  c3: makeControl({ id: 'e1-11-03' }),
  c4: makeControl({ id: 'e1-11-04' }),
  c5: makeControl({ id: 'e1-11-05' }),
};

test('REGRESSION (commit 3c238d8): a domain mixing controls with and without legacyCategoryPrefix renders as ONE group matching the server rollup, not split', () => {
  const state = baseState(MIXED_DOMAIN_CONTROLS);

  const rollups = computeRollups(state);
  assert.deepEqual(Object.keys(rollups.hitrust.e1.byDomain), ['11'], 'sanity check: the server rollup groups all 5 controls under domainKey 11');

  const { overviewHtml, drilldownsHtml } = renderClientSide(state);

  const groupIds = [...drilldownsHtml.matchAll(/<details class="category-group" id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(
    groupIds,
    ['cat-hitrust-e1-11'],
    'client must render exactly ONE group for domainKey 11, matching the server rollup -- not split into a legacyCategoryPrefix-01 group and a domain-less group'
  );

  const statsMatch = /id="cat-hitrust-e1-11"[\s\S]*?<span class="cat-stats">(\d+) controls?/.exec(drilldownsHtml);
  assert.ok(statsMatch, 'expected a cat-stats block for the cat-hitrust-e1-11 group');
  assert.equal(Number(statsMatch[1]), 5, 'all 5 controls must be counted in the single group, not split across two');

  assert.ok(overviewHtml.includes('href="#cat-hitrust-e1-11"'), 'overview jump-link must point at the single correctly-keyed group');
});

test('every overview domain-bar link href has a matching drilldown group id, and vice versa, across multiple domains', () => {
  const controls = Object.assign({}, MIXED_DOMAIN_CONTROLS, {
    d1: makeControl({ id: 'e1-04-01', domainKey: '04', legacyCategoryPrefix: '04' }),
    d2: makeControl({ id: 'e1-09-01', domainKey: '09' }),
  });
  const state = baseState(controls);

  const { overviewHtml, drilldownsHtml } = renderClientSide(state);

  const hrefIds = [...overviewHtml.matchAll(/href="#(cat-[^"]+)"/g)].map((m) => m[1]);
  const groupIds = [...drilldownsHtml.matchAll(/<details class="category-group" id="([^"]+)"/g)].map((m) => m[1]);

  assert.ok(hrefIds.length > 0, 'expected at least one domain-bar link');
  for (const href of hrefIds) {
    assert.ok(groupIds.includes(href), `overview link href "${href}" has no matching drilldown group id -- would be a dead jump-link`);
  }
  assert.deepEqual(
    groupIds.slice().sort(),
    hrefIds.slice().sort(),
    'every rendered domain group must have exactly one corresponding overview link, and vice versa'
  );
});

test('a rendered control row includes its id, control name, status tag, and justification', () => {
  const state = baseState({
    c1: makeControl({
      id: 'e1-11-01',
      relatedControlCode: '11.a',
      relatedControlName: 'Access Control Policy',
      assessment: {
        status: 'met',
        justification: 'Documented and reviewed annually.',
        inProgress: { currentState: null, estimatedCloseness: null },
        assessedAt: '2026-01-01T00:00:00.000Z',
      },
    }),
  });

  const { drilldownsHtml } = renderClientSide(state);

  assert.ok(drilldownsHtml.includes('e1-11-01'), 'control id must be rendered');
  assert.ok(drilldownsHtml.includes('Access Control Policy'), 'control name must be rendered');
  assert.ok(drilldownsHtml.includes('st-met'), 'the "met" status tag class must be present');
  assert.ok(drilldownsHtml.includes('Documented and reviewed annually.'), 'justification must be rendered');
});
