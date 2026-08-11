'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {
  computeRollups,
  computeCertSummaries,
  injectData,
  stateForIndex,
  readCatalog,
} = require('../render-dashboard.js');

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
    title: '',
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

function runTemplate(payload) {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const html = injectData(template, payload);

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
    crumbHtml: document.getElementById('crumb').innerHTML,
    filterBarDisplay: document.getElementById('filterBar').style.display,
    title: document.title,
  };
}

// Runs the REAL, unmodified dashboard-template.html client script against `state` in CERT
// view, via the same injectData()/computeRollups() production code path render-dashboard.js
// uses. Defaults to the first certification in state so every pre-existing single-cert test
// keeps exercising the same view it always did.
function renderClientSide(state, certKey) {
  const key = certKey || Object.keys(state.certifications || {})[0];
  return runTemplate({
    state,
    rollups: computeRollups(state),
    view: { mode: 'cert', certKey: key },
  });
}

// Runs the same real template in INDEX view, mirroring the payload render-dashboard.js
// builds for dashboard.html (controls stripped, catalog + per-cert summaries attached).
function renderIndexClientSide(state, catalog) {
  const rollups = computeRollups(state);
  return runTemplate({
    state: stateForIndex(state),
    rollups,
    certSummaries: computeCertSummaries(rollups),
    catalog: catalog || readCatalog(),
    view: { mode: 'index' },
  });
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

function makeR2Control(overrides) {
  const notAssessed = () => ({
    status: 'not_assessed', justification: null,
    inProgress: { currentState: null, estimatedCloseness: null }, assessedAt: null,
  });
  return Object.assign(
    {
      id: 'r2-01-01', domain: 'Information Protection Program', domainKey: '01',
      topicLabel: 'Formal penetration testing', topicSummary: 'Documented pentest program.',
      citations: ['https://example.com'], applicabilityTier: 'universal', nonAuthoritative: true,
      statementText: null, statementSource: 'public-topic-level',
      assessment: {
        status: null,
        maturity: {
          policy: notAssessed(), procedure: notAssessed(), implemented: notAssessed(),
          measured: notAssessed(), managed: notAssessed(),
        },
      },
      roadmap: { budgetTier: null, vendorResearch: [], recommendation: null, status: 'not_started' },
    },
    overrides
  );
}

function baseR2State(controlsById) {
  return {
    schemaVersion: '1.0.0',
    generatedAt: '2020-01-01T00:00:00.000Z',
    organization: { name: 'Example Test Org' },
    certifications: {
      hitrust: {
        displayName: 'HITRUST CSF',
        activeTier: 'r2',
        tiers: {
          r2: {
            controlSetVersion: 'v11.8',
            sourceAuthority: 'public-topic-level',
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

test('a shallow r2 control (only Implemented assessed) shows a 1 / 5 maturity dims badge', () => {
  const notAssessed = () => ({
    status: 'not_assessed', justification: null,
    inProgress: { currentState: null, estimatedCloseness: null }, assessedAt: null,
  });
  const state = baseR2State({
    c1: makeR2Control({
      assessment: {
        status: null,
        maturity: {
          policy: notAssessed(),
          procedure: notAssessed(),
          implemented: { status: 'met', justification: 'Pentest completed.', inProgress: { currentState: null, estimatedCloseness: null }, assessedAt: '2026-01-01T00:00:00.000Z' },
          measured: notAssessed(),
          managed: notAssessed(),
        },
      },
    }),
  });

  const { drilldownsHtml } = renderClientSide(state);

  assert.ok(drilldownsHtml.includes('1 / 5 maturity dims'), 'badge must show 1 of 5 dimensions assessed');
  assert.ok(drilldownsHtml.includes('Pentest completed.'), "Implemented dimension's justification must render in the primary assessment field");
  assert.ok(drilldownsHtml.includes('>Policy<'), 'the maturity breakdown must list the Policy dimension label');
  assert.ok(drilldownsHtml.includes('>Managed<'), 'the maturity breakdown must list the Managed dimension label');
});

test('a fully deepened r2 control (all 5 dimensions assessed) shows a 5 / 5 maturity dims badge', () => {
  const fullMaturity = {};
  for (const dim of ['policy', 'procedure', 'implemented', 'measured', 'managed']) {
    fullMaturity[dim] = {
      status: 'met', justification: dim + ' satisfied.',
      inProgress: { currentState: null, estimatedCloseness: null }, assessedAt: '2026-01-01T00:00:00.000Z',
    };
  }
  const state = baseR2State({ c1: makeR2Control({ assessment: { status: null, maturity: fullMaturity } }) });

  const { drilldownsHtml } = renderClientSide(state);
  assert.ok(drilldownsHtml.includes('5 / 5 maturity dims'));
});

test('Sources falls back to codeVerifiedBy when citations and codeCorroboratedBy are both absent', () => {
  const state = baseState({
    c1: makeControl({ id: 'e1-11-01', codeVerifiedBy: ['https://example.com/verified'] }),
  });
  const { drilldownsHtml } = renderClientSide(state);
  assert.ok(drilldownsHtml.includes('href="https://example.com/verified"'), 'codeVerifiedBy must render as a Sources link when no other source field exists');
});

test('a control carrying both citations and codeVerifiedBy renders only citations in Sources, and codeVerifiedBy never appears twice', () => {
  const state = baseState({
    c1: makeControl({
      id: 'e1-11-01',
      citations: ['https://example.com/secondary'],
      codeVerifiedBy: ['https://example.com/verified'],
    }),
  });
  const { drilldownsHtml } = renderClientSide(state);
  assert.ok(drilldownsHtml.includes('href="https://example.com/secondary"'), 'citations must still win the Sources fallback');
  assert.ok(!drilldownsHtml.includes('href="https://example.com/verified"'), 'codeVerifiedBy must not also render once citations already won');
  assert.ok(!drilldownsHtml.includes('Additional detail'), 'codeVerifiedBy must not leak into Additional detail either');
});

test('only http(s) URLs become links; a javascript: URL renders as inert text in citations and vendor sourceUrls', () => {
  const state = baseR2State({
    c1: makeR2Control({
      citations: ['https://example.com/real-source', 'javascript:alert(1)'],
      roadmap: {
        budgetTier: 'lean',
        vendorResearch: [
          { name: 'Acme Pentest Co', sourceUrls: ['javascript:alert(2)', 'https://acme.example/pricing'] },
        ],
        recommendation: null,
        status: 'complete',
      },
    }),
  });

  const { drilldownsHtml } = renderClientSide(state);

  assert.ok(drilldownsHtml.includes('href="https://example.com/real-source"'), 'https citation must render as a link');
  assert.ok(drilldownsHtml.includes('href="https://acme.example/pricing"'), 'https sourceUrl must render as a link');
  assert.ok(!drilldownsHtml.includes('href="javascript:'), 'a javascript: URL must never become an href');
  assert.ok(drilldownsHtml.includes('javascript:alert(1)'), 'the rejected citation must still be visible as inert text');
  assert.ok(drilldownsHtml.includes('javascript:alert(2)'), 'the rejected sourceUrl must still be visible as inert text');
});

test('the overview card shows a Maturity depth gauge for r2 but not for e1', () => {
  const r2State = baseR2State({ c1: makeR2Control() });
  const { overviewHtml: r2Overview } = renderClientSide(r2State);
  assert.ok(r2Overview.includes('Maturity depth'), 'r2 overview card must show the maturity depth gauge');

  const e1State = baseState({ c1: makeControl({ id: 'c1' }) });
  const { overviewHtml: e1Overview } = renderClientSide(e1State);
  assert.ok(!e1Overview.includes('Maturity depth'), 'e1 overview card must not show the maturity depth gauge');
});

// ---------------------------------------------------------------------------
// Extra fields -- per-control data a certification module ships that no core script knows about
// ---------------------------------------------------------------------------

test('unknown per-control fields render instead of silently vanishing, and known ones are not duplicated', () => {
  const state = baseState({
    c1: makeControl({
      id: 'e1-11-01',
      requiredPolicies: ['Access Control Policy', 'Password Policy'],
      evidenceExamples: ['MFA enforcement screenshot'],
      tscCategory: 'security',
    }),
  });

  const { drilldownsHtml } = renderClientSide(state);

  assert.ok(drilldownsHtml.includes('Additional detail'), 'an extra-fields block must appear');
  assert.ok(drilldownsHtml.includes('Required Policies'), 'the field key must render as a readable label');
  assert.ok(drilldownsHtml.includes('Access Control Policy'));
  assert.ok(drilldownsHtml.includes('MFA enforcement screenshot'));
  assert.ok(drilldownsHtml.includes('Tsc Category'));

  // Fields the template already renders explicitly must not be repeated in the block --
  // otherwise every control would show its id, status and citations twice.
  const additional = drilldownsHtml.slice(drilldownsHtml.indexOf('Additional detail'));
  assert.ok(!additional.includes('Statement Source'), 'explicitly-rendered fields must be excluded');
  assert.ok(!additional.includes('Related Control Name'), 'explicitly-rendered fields must be excluded');
});

test('a control with no extra fields renders no extra-fields block at all', () => {
  const state = baseState({ c1: makeControl({ id: 'e1-11-01' }) });
  const { drilldownsHtml } = renderClientSide(state);
  assert.ok(!drilldownsHtml.includes('Additional detail'), 'no empty block for a plain control');
});

// ---------------------------------------------------------------------------
// Meta index view
// ---------------------------------------------------------------------------

const TEST_CATALOG = [
  { certKey: 'hitrust', displayName: 'HITRUST CSF', skill: 'ciso:register', tiers: ['e1'], summary: 'Healthcare harmonizing framework.' },
  { certKey: 'soc2', displayName: 'SOC 2 Type II', skill: 'ciso:register', tiers: ['type2'], summary: 'AICPA Trust Services Criteria.' },
];

test('index view: a tracked certification links to its own page; an untracked one names the skill that starts it', () => {
  const state = baseState({ c1: makeControl({ id: 'e1-11-01' }) });
  const { overviewHtml, drilldownsHtml } = renderIndexClientSide(state, TEST_CATALOG);

  assert.ok(overviewHtml.includes('href="cert-hitrust.html"'), 'the tracked certification must link to its page');
  assert.ok(overviewHtml.includes('HITRUST CSF'));

  assert.ok(overviewHtml.includes('SOC 2 Type II'), 'a catalog certification this project does not track must still appear');
  assert.ok(overviewHtml.includes('not tracked yet'));
  assert.ok(overviewHtml.includes('ciso:register'), 'an untracked card must name the verb that would start it');
  assert.ok(!overviewHtml.includes('href="cert-soc2.html"'), 'an untracked certification has no page to link to');

  assert.equal(drilldownsHtml, '', 'the index renders no control drilldowns');
});

test('index view: emits no same-page fragment links, whose anchors only exist on the certification pages', () => {
  const state = baseState({ c1: makeControl({ id: 'e1-11-01' }) });
  const { overviewHtml } = renderIndexClientSide(state, TEST_CATALOG);

  const fragmentOnly = [...overviewHtml.matchAll(/href="(#[^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(fragmentOnly, [], `index must have no same-page fragment links (found ${fragmentOnly.join(', ')})`);
});

test('index view: the filter toolbar stays hidden and no back-link is shown; a certification page shows both', () => {
  const state = baseState({ c1: makeControl({ id: 'e1-11-01' }) });

  const index = renderIndexClientSide(state, TEST_CATALOG);
  assert.notEqual(index.filterBarDisplay, 'flex', 'the index has no control rows, so it must not show a filter toolbar');
  assert.equal(index.crumbHtml, '', 'the index is the top level -- nothing to go back to');

  const cert = renderClientSide(state);
  assert.equal(cert.filterBarDisplay, 'flex', 'a certification page filters its own controls');
  assert.ok(cert.crumbHtml.includes('dashboard.html'), 'a certification page must link back to the index');
});

test('index view: a certification tracked in state but absent from the catalog still gets a card', () => {
  const state = baseState({ c1: makeControl({ id: 'e1-11-01' }) });
  // Catalog knows only SOC 2; the project actually tracks HITRUST. The index must never
  // hide data the project holds just because the shipped catalog has moved on.
  const { overviewHtml } = renderIndexClientSide(state, [TEST_CATALOG[1]]);

  assert.ok(overviewHtml.includes('HITRUST CSF'), 'an off-catalog tracked certification must still render');
  assert.ok(overviewHtml.includes('href="cert-hitrust.html"'), 'and must still link to its page');
});

test('index view: the certification page title and the index title differ, so browser tabs are distinguishable', () => {
  const state = baseState({ c1: makeControl({ id: 'e1-11-01' }) });
  assert.notEqual(renderIndexClientSide(state, TEST_CATALOG).title, renderClientSide(state).title);
  assert.ok(renderClientSide(state).title.includes('HITRUST CSF'));
});

// ---------------------------------------------------------------------------
// Evidence records, and the nested-object fallback that renders sync-tasks' tracker
// ---------------------------------------------------------------------------

test('evidence: records render with kind, a linkified ref and the summary', () => {
  const state = baseState({
    c1: makeControl({
      id: 'e1-11-01',
      assessment: { status: 'met', justification: 'Enforced in CI.', inProgress: {}, assessedAt: '2026-01-01T00:00:00.000Z' },
      evidence: [
        { kind: 'pr', ref: 'https://github.com/example/repo/pull/123', summary: 'Adds audit logging', recordedAt: '2026-02-01T00:00:00.000Z' },
        { kind: 'ci-run', ref: 'build-4471', summary: 'Log assertions green on main', recordedAt: '2026-02-02T00:00:00.000Z' },
      ],
    }),
  });

  const { drilldownsHtml } = renderClientSide(state);

  assert.ok(drilldownsHtml.includes('Evidence'), 'the evidence block must be labelled');
  assert.ok(drilldownsHtml.includes('Adds audit logging'));
  assert.ok(drilldownsHtml.includes('Log assertions green on main'));
  assert.ok(
    drilldownsHtml.includes('href="https://github.com/example/repo/pull/123"'),
    'an http(s) ref must become a clickable link'
  );
  assert.ok(drilldownsHtml.includes('build-4471'), 'a non-URL ref must still render as text');
  assert.ok(drilldownsHtml.includes('Ci Run') || drilldownsHtml.includes('Ci-run'), 'the kind must be shown');
});

test('evidence: a met control with none says so, rather than looking identical to an evidenced one', () => {
  const evidenced = baseState({
    c1: makeControl({
      id: 'e1-11-01',
      assessment: { status: 'met', justification: 'Enforced in CI.', inProgress: {}, assessedAt: '2026-01-01T00:00:00.000Z' },
      evidence: [{ kind: 'pr', ref: 'https://example.com/pr/1', summary: 'Does the thing', recordedAt: '2026-02-01T00:00:00.000Z' }],
    }),
  });
  const bare = baseState({
    c1: makeControl({
      id: 'e1-11-01',
      assessment: { status: 'met', justification: 'Enforced in CI.', inProgress: {}, assessedAt: '2026-01-01T00:00:00.000Z' },
      evidence: [],
    }),
  });

  assert.ok(renderClientSide(bare).drilldownsHtml.includes('No evidence recorded'));
  assert.ok(!renderClientSide(evidenced).drilldownsHtml.includes('No evidence recorded'));
});

test('evidence: an unassessed control is not nagged about missing evidence', () => {
  const state = baseState({ c1: makeControl({ id: 'e1-11-01', evidence: [] }) });
  assert.ok(!renderClientSide(state).drilldownsHtml.includes('No evidence recorded'));
});

test('evidence: a control registered before the field existed renders as if empty', () => {
  const control = makeControl({ id: 'e1-11-01' });
  delete control.evidence;
  assert.doesNotThrow(() => renderClientSide(baseState({ c1: control })));
});

test('evidence: renders once -- explicitly, never also via the extra-fields fallback', () => {
  const state = baseState({
    c1: makeControl({
      id: 'e1-11-01',
      assessment: { status: 'met', justification: 'Enforced in CI.', inProgress: {}, assessedAt: '2026-01-01T00:00:00.000Z' },
      evidence: [{ kind: 'pr', ref: 'https://example.com/pr/1', summary: 'Uniquely worded summary', recordedAt: '2026-02-01T00:00:00.000Z' }],
    }),
  });

  const { drilldownsHtml } = renderClientSide(state);
  const occurrences = drilldownsHtml.split('Uniquely worded summary').length - 1;
  assert.equal(occurrences, 1, 'evidence is in RENDERED_CONTROL_FIELDS, so the fallback must not render it a second time');
});

test('extra fields: a nested object renders its keys, never the string "[object Object]"', () => {
  // sync-tasks writes `tracker` as a plain object, and r2 nests `subtasks` one level deeper.
  // Both used to hit esc(String(value)) and render as "[object Object]".
  const state = baseState({
    c1: makeControl({
      id: 'e1-11-01',
      tracker: {
        system: 'jira',
        id: 'SEC-412',
        url: 'https://example.atlassian.net/browse/SEC-412',
        status: 'open',
        subtasks: { implemented: { id: 'SEC-413', status: 'open' } },
      },
    }),
  });

  const { drilldownsHtml } = renderClientSide(state);

  assert.ok(!drilldownsHtml.includes('[object Object]'), 'a nested object must never stringify to [object Object]');
  assert.ok(drilldownsHtml.includes('SEC-412'), 'the tracker id must be visible');
  assert.ok(drilldownsHtml.includes('SEC-413'), 'a nested subtask must recurse, not stop at the top level');
  assert.ok(drilldownsHtml.includes('href="https://example.atlassian.net/browse/SEC-412"'), 'the ticket URL must be clickable');
});
