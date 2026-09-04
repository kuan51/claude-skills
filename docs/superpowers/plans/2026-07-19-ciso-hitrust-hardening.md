---
owner: kuan51
review_by: 2027-03-03
generated: false
---

# CISO HITRUST Hardening Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three gaps found in the `ciso` HITRUST plugin's alignment audit: add test coverage for the dashboard's client-side rendering, parameterize the certification-agnostic library modules that currently hardcode `'hitrust'`, and shrink the interview's commit granularity from a whole domain to small sub-batches.

**Architecture:** No new files besides one test file. All work is targeted edits to existing `plugins/ciso/skills/hitrust/lib/*.js` modules, their existing `node:test` suites, `plugins/ciso/skills/hitrust/SKILL.md`, and two header comments. Nothing here changes `render-dashboard.js`, the roadmap subsystem, the compiler, or any shipped `*.structure.json` control data.

**Tech Stack:** Plain Node.js (CommonJS), `node:test` + `node:assert/strict`, Node's built-in `vm` module. No npm dependencies anywhere in this plan.

## Global Constraints

- Stdlib only. No new npm dependencies, anywhere (matches this repo's own "never install packages" instruction and the plugin's existing xlsx-lite.js-style conventions).
- Tests use `node:test` + `node:assert/strict` exclusively, matching every existing test file in `plugins/ciso`. No test framework.
- Every pre-existing passing test must still pass after these changes — where a function's signature changes, its existing test call sites are updated in the same task, not left broken.
- Out of scope (do not touch): `render-dashboard.js`, `merge-roadmap.js`, `roadmap/workflow.js`, `diff-structure-versions.js`, `hitrust-controls-compiler/*`, and the shipped `e1`/`i1`/`r2` `*.structure.json` control data files.
- Spec: `docs/superpowers/specs/2026-07-19-ciso-hitrust-hardening-design.md`.

---

## Task 1: Dashboard client-side test coverage

**Files:**
- Create: `plugins/ciso/skills/_shared/test/dashboard-template.test.js`
- Read (no changes): `plugins/ciso/assets/dashboard-template.html`, `plugins/ciso/skills/_shared/render-dashboard.js`

**Interfaces:**
- Consumes: `computeRollups(state)` and `injectData(template, payload)`, both exported from `plugins/ciso/skills/_shared/render-dashboard.js` (unchanged signatures, already in the codebase).
- Produces: nothing consumed by later tasks — this task is self-contained.

The dashboard's actual rendering logic (grouping, anchor-id construction, control-row markup) lives entirely inside one inline `<script>` in `dashboard-template.html`, executed only when a browser opens the generated `dashboard.html`. It exposes nothing to an outer scope, so testing it means actually executing that script. The approach: read the real template, inject a fixture payload through the real `injectData`/`computeRollups` (the same functions production uses), extract the `<script>...</script>` body from the *result*, and run that unmodified body inside Node's built-in `vm` module against a minimal stub `document` (no jsdom, no new dependency). The stub only needs to support what `render()` actually calls: `getElementById`, `createElement`, `querySelectorAll` (returns `[]`, since live filter-toolbar interaction is explicitly out of scope), plain `.innerHTML`/`.textContent`/`.value`/`.style` properties, and no-op `appendChild`/`addEventListener`.

- [ ] **Step 1: Write the test file with its harness and fixture helpers**

Create `plugins/ciso/skills/_shared/test/dashboard-template.test.js`:

```js
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

module.exports = { renderClientSide, makeControl, baseState };
```

- [ ] **Step 2: Run the test file to confirm it loads with zero tests (sanity check before adding assertions)**

Run: `node --test plugins/ciso/skills/_shared/test/dashboard-template.test.js`
Expected: `# tests 0`, `# pass 0`, `# fail 0` (the file has no `test(...)` calls yet, so this just proves the harness module loads without a syntax/require error).

- [ ] **Step 3: Add the primary regression test (reproduces the real e1 domain-11 bug fixed in commit 3c238d8)**

Append to `plugins/ciso/skills/_shared/test/dashboard-template.test.js`:

```js
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
```

- [ ] **Step 4: Run the test to confirm it passes against the current (already-fixed) template**

Run: `node --test plugins/ciso/skills/_shared/test/dashboard-template.test.js`
Expected: `# tests 1`, `# pass 1`, `# fail 0`

- [ ] **Step 5: Temporarily verify the test actually catches the regression it's named for**

Using the Edit tool, temporarily change `plugins/ciso/assets/dashboard-template.html`'s line 750 from:

```js
const byDomain = groupBy(controls, function (c) { return (c && (c.domainKey || c.legacyCategoryPrefix || c.domain)) || 'unknown'; });
```

to the pre-fix version (drop the `c.domainKey ||` clause):

```js
const byDomain = groupBy(controls, function (c) { return (c && (c.legacyCategoryPrefix || c.domain)) || 'unknown'; });
```

Then run: `node --test plugins/ciso/skills/_shared/test/dashboard-template.test.js`
Expected: `# fail 1` — the regression test must fail once the client's grouping key regresses to the pre-fix version. This proves the test is a real regression guard, not a tautology.

Then revert: `git checkout -- plugins/ciso/assets/dashboard-template.html`
Run the test once more to confirm it's back to `# pass 1`.

- [ ] **Step 6: Add the multi-domain overview/drilldown anchor-consistency test**

Append:

```js
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
```

- [ ] **Step 7: Run tests, confirm both pass**

Run: `node --test plugins/ciso/skills/_shared/test/dashboard-template.test.js`
Expected: `# tests 2`, `# pass 2`, `# fail 0`

- [ ] **Step 8: Add the control-row smoke test**

Append:

```js
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
```

- [ ] **Step 9: Run the full file, confirm all 3 tests pass**

Run: `node --test plugins/ciso/skills/_shared/test/dashboard-template.test.js`
Expected: `# tests 3`, `# pass 3`, `# fail 0`

- [ ] **Step 10: Run the full existing plugins/ciso suite to confirm nothing else regressed**

Run: `node --test --test-reporter=spec $(find plugins/ciso -name '*.test.js')` (or on Windows PowerShell: `Get-ChildItem -Path plugins/ciso -Recurse -Filter *.test.js | ForEach-Object { node --test $_.FullName }`)
Expected: all pre-existing suites still pass, plus the 3 new tests.

- [ ] **Step 11: Commit**

```bash
git add plugins/ciso/skills/_shared/test/dashboard-template.test.js
git commit -m "test(ciso): add client-side dashboard rendering coverage

Executes the real, unmodified dashboard-template.html client script via
node:vm (no jsdom) against a minimal stub document, anchored on the
grouping-key regression just fixed in 3c238d8."
```

---

## Task 2: Parameterize `register-tier.js` by certification key

**Files:**
- Modify: `plugins/ciso/skills/hitrust/lib/register-tier.js`
- Modify: `plugins/ciso/skills/hitrust/lib/test/register-tier.test.js`

**Interfaces:**
- Produces: `registerTier(stateJsonPath, structure, certKey, certDisplayName)` — `certKey`/`certDisplayName` now required, no default. CLI: `node register-tier.js <target-dir> <certKey> <certDisplayName> [<tier-or-path>]`. Task 6 (SKILL.md) consumes this exact CLI shape.

- [ ] **Step 1: Add a failing cross-certification test**

In `plugins/ciso/skills/hitrust/lib/test/register-tier.test.js`, append (after the existing tests, before the final `resolveStructurePath` tests or anywhere at top level):

```js
test('registerTier is parameterized by certKey/certDisplayName -- a second certification lands independently of hitrust', () => {
  const stateJsonPath = makeTempState();
  registerTier(stateJsonPath, TINY_STRUCTURE, 'hitrust', 'HITRUST CSF');
  registerTier(stateJsonPath, TINY_STRUCTURE, 'soc2', 'SOC 2 Type II');

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  assert.ok(state.certifications.hitrust, 'hitrust must still be registered');
  assert.ok(state.certifications.soc2, 'a second certification must register independently');
  assert.equal(state.certifications.soc2.displayName, 'SOC 2 Type II');
  assert.deepEqual(Object.keys(state.certifications.soc2.tiers.e1.controls).sort(), ['CTRL-A', 'CTRL-B']);
  assert.equal(state.certifications.hitrust.tiers.e1.controls['CTRL-A'].assessment.status, 'not_assessed');

  const sessions = state.interviewSessions.map((s) => s.certification).sort();
  assert.deepEqual(sessions, ['hitrust', 'soc2']);
});

test('registerTier throws if certKey or certDisplayName is missing', () => {
  const stateJsonPath = makeTempState();
  assert.throws(() => registerTier(stateJsonPath, TINY_STRUCTURE), /certKey is required/);
  assert.throws(() => registerTier(stateJsonPath, TINY_STRUCTURE, 'hitrust'), /certDisplayName is required/);
});
```

- [ ] **Step 2: Run to confirm the new tests fail against the current implementation**

Run: `node --test plugins/ciso/skills/hitrust/lib/test/register-tier.test.js`
Expected: the 6 pre-existing tests still pass (extra args are silently ignored by the old 2-arg function). The 2 new tests fail: the cross-cert test fails with `state.certifications.soc2` being `undefined`; the "throws if missing" test fails because the old function doesn't throw.

- [ ] **Step 3: Implement the parameterization in `register-tier.js`**

Replace the `registerTier` function (current lines 55-120):

```js
// Reads <stateJsonPath>, registers/merges `tierKey` from `structure` under
// state.certifications[certKey] (creating that certification entry with `certDisplayName` if it
// doesn't exist yet), and writes the result back. Safe to re-run: existing controls and an
// existing interview session are never touched, only ids missing from state get added. `certKey`
// and `certDisplayName` are both required -- there is no default, since a generic registration
// function cannot guess which certification (or its human-readable name) a caller means.
function registerTier(stateJsonPath, structure, certKey, certDisplayName) {
  if (!certKey) throw new Error('registerTier: certKey is required (e.g. "hitrust")');
  if (!certDisplayName) throw new Error('registerTier: certDisplayName is required (e.g. "HITRUST CSF")');

  const resolvedStructure = structure || loadStructure();
  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));

  if (!state.certifications) state.certifications = {};
  if (!state.certifications[certKey]) {
    state.certifications[certKey] = {
      displayName: certDisplayName,
      activeTier: resolvedStructure.tier,
      tiers: {},
    };
  }
  const certEntry = state.certifications[certKey];
  if (!certEntry.tiers) certEntry.tiers = {};

  const tierKey = resolvedStructure.tier;
  let tier = certEntry.tiers[tierKey];
  const isNewTier = !tier;

  // The structure file declares its own authority level ("structural-only" for e1's real-but-
  // text-free structure, "public-topic-level" for i1/r2's researched-and-cited topic content).
  // Falls back to "structural-only" for older structure files (e.g. e1's) that predate this field.
  const tierSourceAuthority = resolvedStructure.sourceAuthority || 'structural-only';

  if (isNewTier) {
    tier = {
      controlSetVersion: resolvedStructure.controlSetVersion,
      sourceAuthority: tierSourceAuthority,
      importedFrom: null,
      importedAt: null,
      controls: {},
      archivedControls: {},
    };
    certEntry.tiers[tierKey] = tier;
  }
  if (!tier.controls) tier.controls = {};
  if (!tier.archivedControls) tier.archivedControls = {};

  let added = 0;
  for (const entry of resolvedStructure.controls) {
    if (!Object.prototype.hasOwnProperty.call(tier.controls, entry.id)) {
      tier.controls[entry.id] = defaultControl(entry, tierSourceAuthority);
      added += 1;
    }
  }

  if (!Array.isArray(state.interviewSessions)) state.interviewSessions = [];
  const hasSession = state.interviewSessions.some(
    (s) => s.certification === certKey && s.tier === tierKey
  );
  if (!hasSession) {
    const now = new Date().toISOString();
    state.interviewSessions.push({
      certification: certKey,
      tier: tierKey,
      startedAt: now,
      lastUpdatedAt: now,
      domainsCompleted: [],
      domainsRemaining: computeDomains(resolvedStructure),
      status: 'in_progress',
    });
  }

  fs.writeFileSync(stateJsonPath, JSON.stringify(state, null, 2) + '\n');
  return { tier: tierKey, added, totalControls: Object.keys(tier.controls).length, isNewTier };
}
```

Then replace the CLI block (current lines 138-161):

```js
module.exports = { registerTier, defaultControl, computeDomains, loadStructure, resolveStructurePath, STRUCTURE_FILE };

if (require.main === module) {
  const [targetDir, certKey, certDisplayName, tierArg] = process.argv.slice(2);
  if (!targetDir || !certKey || !certDisplayName) {
    console.error('Usage: node register-tier.js <target-dir> <certKey> <certDisplayName> [<tier: e1|i1|r2, or a structure-file path>]');
    process.exit(1);
  }
  const stateJsonPath = path.join(targetDir, 'state.json');
  if (!fs.existsSync(stateJsonPath)) {
    console.error(`No state.json found at ${stateJsonPath} -- run ciso:init first.`);
    process.exit(1);
  }
  const structurePath = resolveStructurePath(tierArg);
  if (!fs.existsSync(structurePath)) {
    console.error(`No structure file found at ${structurePath}`);
    process.exit(1);
  }
  try {
    const result = registerTier(stateJsonPath, loadStructure(structurePath), certKey, certDisplayName);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
```

- [ ] **Step 4: Update the 6 pre-existing test call sites**

In `plugins/ciso/skills/hitrust/lib/test/register-tier.test.js`, make 3 find-and-replace edits (each `replace_all`):

1. Replace all occurrences of `registerTier(stateJsonPath, TINY_STRUCTURE)` with `registerTier(stateJsonPath, TINY_STRUCTURE, 'hitrust', 'HITRUST CSF')` (4 occurrences: the fresh-registration test, both calls in the additive-re-registration test, and the additive-registration-adds-only-missing-ids test).
2. Replace `registerTier(stateJsonPath, structure)` with `registerTier(stateJsonPath, structure, 'hitrust', 'HITRUST CSF')` (1 occurrence: the bundled e1 structure test).
3. Replace `registerTier(stateJsonPath, TINY_I1_STRUCTURE)` with `registerTier(stateJsonPath, TINY_I1_STRUCTURE, 'hitrust', 'HITRUST CSF')` (1 occurrence: the i1-shaped structure test).

- [ ] **Step 5: Run the full file, confirm all 11 tests pass**

Run: `node --test plugins/ciso/skills/hitrust/lib/test/register-tier.test.js`
Expected: `# tests 11`, `# pass 11`, `# fail 0` (9 pre-existing + 2 new)

- [ ] **Step 6: Commit**

```bash
git add plugins/ciso/skills/hitrust/lib/register-tier.js plugins/ciso/skills/hitrust/lib/test/register-tier.test.js
git commit -m "refactor(ciso): parameterize register-tier.js by certKey/certDisplayName

register-tier.js no longer hardcodes 'hitrust' -- callers must say which
certification and display name they mean, proven by a test that
registers a second certification independently of hitrust."
```

---

## Task 3: Parameterize `apply-assessment.js` by certification key

**Files:**
- Modify: `plugins/ciso/skills/hitrust/lib/apply-assessment.js`
- Modify: `plugins/ciso/skills/hitrust/lib/test/apply-assessment.test.js`

**Interfaces:**
- Consumes: `defaultControl(entry, sourceAuthority)` from `register-tier.js` (unchanged, already used by the existing test file's `seedState` helper).
- Produces: `applyAssessment(stateJsonPath, certKey, tierKey, controlId, payload)` and `markCategoryComplete(stateJsonPath, certKey, tierKey, categoryKey)` — both take a required `certKey` as their 2nd argument now. CLI: `node apply-assessment.js <state.json> <certKey> <tier> <controlId> <jsonPayload>` (5 args) or `node apply-assessment.js <state.json> <certKey> <tier> <categoryKey>` (4 args). Task 6 (SKILL.md) consumes this exact CLI shape.

- [ ] **Step 1: Add a failing cross-certification test**

In `plugins/ciso/skills/hitrust/lib/test/apply-assessment.test.js`, append:

```js
test('applyAssessment and markCategoryComplete are parameterized by certKey -- a second certification is independent of hitrust', () => {
  const stateJsonPath = makeTempState();
  const state = {
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
            controls: { 'CTRL-A': defaultControl(CTRL_A) },
            archivedControls: {},
          },
        },
      },
      soc2: {
        displayName: 'SOC 2 Type II',
        activeTier: 'type2',
        tiers: {
          type2: {
            controlSetVersion: '2017',
            sourceAuthority: 'structural-only',
            importedFrom: null,
            importedAt: null,
            controls: { 'CC1.1': defaultControl({ id: 'CC1.1', legacyCategoryPrefix: 'CC1' }) },
            archivedControls: {},
          },
        },
      },
    },
    interviewSessions: [
      { certification: 'hitrust', tier: 'e1', startedAt: '2026-01-01T00:00:00.000Z', lastUpdatedAt: '2026-01-01T00:00:00.000Z', domainsCompleted: [], domainsRemaining: ['01'], status: 'in_progress' },
      { certification: 'soc2', tier: 'type2', startedAt: '2026-01-01T00:00:00.000Z', lastUpdatedAt: '2026-01-01T00:00:00.000Z', domainsCompleted: [], domainsRemaining: ['CC1'], status: 'in_progress' },
    ],
  };
  fs.writeFileSync(stateJsonPath, JSON.stringify(state, null, 2));

  applyAssessment(stateJsonPath, 'soc2', 'type2', 'CC1.1', { status: 'met', justification: 'Documented control environment policy.' });
  const afterApply = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  assert.equal(afterApply.certifications.soc2.tiers.type2.controls['CC1.1'].assessment.status, 'met');
  assert.equal(afterApply.certifications.hitrust.tiers.e1.controls['CTRL-A'].assessment.status, 'not_assessed', 'hitrust must be untouched by a soc2 assessment');

  const session = markCategoryComplete(stateJsonPath, 'soc2', 'type2', 'CC1');
  assert.deepEqual(session.domainsCompleted, ['CC1']);
  assert.equal(session.status, 'completed');

  const afterComplete = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const hitrustSession = afterComplete.interviewSessions.find((s) => s.certification === 'hitrust');
  assert.deepEqual(hitrustSession.domainsRemaining, ['01'], 'hitrust session must be untouched by the soc2 category completion');
});
```

- [ ] **Step 2: Run to confirm the new test fails against the current implementation**

Run: `node --test plugins/ciso/skills/hitrust/lib/test/apply-assessment.test.js`
Expected: pre-existing tests still pass (extra args silently ignored). The new test fails: `applyAssessment(stateJsonPath, 'soc2', 'type2', 'CC1.1', ...)` is actually interpreted by the OLD 4-arg-payload signature as `(stateJsonPath, tierKey='soc2', controlId='type2', payload='CC1.1')` — a string where an object payload is expected — so it throws a different, unexpected error (e.g. destructuring `status` off a string), or `markCategoryComplete`'s old 3-arg form misreads the shifted args. Either way, the assertions after it (checking `afterApply.certifications.soc2...`) fail because nothing was ever written under `certifications.soc2`.

- [ ] **Step 3: Implement the parameterization in `apply-assessment.js`**

Replace `applyAssessment` (current lines 21-63):

```js
// Mechanical backstop for the two hard interview rules. Throws (making NO changes to the file)
// before any read/write happens if:
//   - status === "met" and justification is missing/empty/whitespace-only
//   - status === "in_progress" and either currentState or estimatedCloseness is missing/blank
// On success, always stamps assessment.assessedAt, regardless of status (including "defer").
// `certKey` is required -- this function is certification-agnostic and has no default to guess.
function applyAssessment(stateJsonPath, certKey, tierKey, controlId, payload) {
  const { status, justification, currentState, estimatedCloseness } = payload || {};

  if (!VALID_INPUT_STATUSES.includes(status)) {
    throw new Error(
      `Invalid status "${status}" -- expected one of: met, in_progress, gap, not_applicable, defer`
    );
  }
  if (status === 'met' && isBlank(justification)) {
    throw new Error('A non-empty justification is required when status is "met"');
  }
  if (status === 'in_progress' && (isBlank(currentState) || isBlank(estimatedCloseness))) {
    throw new Error(
      'Both currentState and estimatedCloseness are required when status is "in_progress"'
    );
  }

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const tier = state?.certifications?.[certKey]?.tiers?.[tierKey];
  const control = tier && tier.controls && tier.controls[controlId];
  if (!control) {
    throw new Error(`Control "${controlId}" not found in ${certKey}/${tierKey} -- register the tier first.`);
  }

  const storedStatus = STATUS_MAP[status] || status;

  control.assessment = control.assessment || {};
  control.assessment.status = storedStatus;
  control.assessment.justification = isBlank(justification) ? null : String(justification).trim();
  if (storedStatus === 'in_progress') {
    control.assessment.inProgress = {
      currentState: String(currentState).trim(),
      estimatedCloseness: String(estimatedCloseness).trim(),
    };
  } else {
    // Reset stale in-progress detail when status flips away from "in_progress".
    control.assessment.inProgress = { currentState: null, estimatedCloseness: null };
  }
  control.assessment.assessedAt = new Date().toISOString();

  fs.writeFileSync(stateJsonPath, JSON.stringify(state, null, 2) + '\n');
  return control.assessment;
}
```

Replace `markCategoryComplete` (current lines 79-125):

```js
// Throws if any control in `categoryKey` still has assessedAt === null (something was
// missed between the interview Q&A and the apply step -- a hard stop, not a silent skip). On
// success, moves the category from domainsRemaining to domainsCompleted for the matching
// <certKey>/<tierKey> interviewSessions entry, updates lastUpdatedAt, and flips status to
// "completed" once domainsRemaining is empty. Despite the parameter name (kept for backward
// compatibility), this is whatever key computeDomains() produced -- usually a modern domainKey
// ("01".."19"), not literally always a legacy category prefix.
function markCategoryComplete(stateJsonPath, certKey, tierKey, legacyCategoryPrefix) {
  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const tier = state?.certifications?.[certKey]?.tiers?.[tierKey];
  if (!tier || !tier.controls) {
    throw new Error(`Tier ${certKey}/${tierKey} not found in state.json`);
  }

  const controlsInCategory = Object.values(tier.controls).filter(
    (c) => categoryKeyFor(c) === legacyCategoryPrefix
  );
  if (controlsInCategory.length === 0) {
    throw new Error(`No controls found for category "${legacyCategoryPrefix}" in ${certKey}/${tierKey}`);
  }
  const untouched = controlsInCategory.filter(
    (c) => !c.assessment || c.assessment.assessedAt === null || c.assessment.assessedAt === undefined
  );
  if (untouched.length > 0) {
    throw new Error(
      `Category "${legacyCategoryPrefix}" has ${untouched.length} control(s) never assessed (assessedAt is null): ${untouched
        .map((c) => c.id)
        .join(', ')}`
    );
  }

  if (!Array.isArray(state.interviewSessions)) {
    throw new Error('No interviewSessions array found in state.json');
  }
  const session = state.interviewSessions.find(
    (s) => s.certification === certKey && s.tier === tierKey
  );
  if (!session) {
    throw new Error(`No interview session found for ${certKey}/${tierKey}`);
  }

  session.domainsRemaining = (session.domainsRemaining || []).filter((d) => d !== legacyCategoryPrefix);
  if (!session.domainsCompleted) session.domainsCompleted = [];
  if (!session.domainsCompleted.includes(legacyCategoryPrefix)) {
    session.domainsCompleted.push(legacyCategoryPrefix);
  }
  session.lastUpdatedAt = new Date().toISOString();
  if (session.domainsRemaining.length === 0) {
    session.status = 'completed';
  }

  fs.writeFileSync(stateJsonPath, JSON.stringify(state, null, 2) + '\n');
  return session;
}
```

Replace the CLI block (current lines 129-156):

```js
module.exports = { applyAssessment, markCategoryComplete };

if (require.main === module) {
  const args = process.argv.slice(2);
  try {
    if (args.length === 5) {
      const [stateJsonPath, certKey, tierKey, controlId, payloadJson] = args;
      let payload;
      try {
        payload = JSON.parse(payloadJson);
      } catch (err) {
        throw new Error(`Invalid JSON payload: ${err.message}`);
      }
      const result = applyAssessment(stateJsonPath, certKey, tierKey, controlId, payload);
      console.log(JSON.stringify(result, null, 2));
    } else if (args.length === 4) {
      const [stateJsonPath, certKey, tierKey, legacyCategoryPrefix] = args;
      const result = markCategoryComplete(stateJsonPath, certKey, tierKey, legacyCategoryPrefix);
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.error('Usage:');
      console.error('  node apply-assessment.js <state.json> <certKey> <tier> <controlId> <jsonPayloadString>');
      console.error('  node apply-assessment.js <state.json> <certKey> <tier> <legacyCategoryPrefix>   (marks category complete)');
      process.exit(1);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
```

- [ ] **Step 4: Update the pre-existing test call sites**

In `plugins/ciso/skills/hitrust/lib/test/apply-assessment.test.js`, make 2 find-and-replace edits (each `replace_all`):

1. Replace all occurrences of `applyAssessment(stateJsonPath, 'e1', ` with `applyAssessment(stateJsonPath, 'hitrust', 'e1', ` (covers every `applyAssessment` call in the file, regardless of the arguments that follow).
2. Replace all occurrences of `markCategoryComplete(stateJsonPath, 'e1', ` with `markCategoryComplete(stateJsonPath, 'hitrust', 'e1', ` (covers every `markCategoryComplete` call in the file).

- [ ] **Step 5: Run the full file, confirm all tests pass**

Run: `node --test plugins/ciso/skills/hitrust/lib/test/apply-assessment.test.js`
Expected: `# tests 14`, `# pass 14`, `# fail 0` (13 pre-existing + 1 new)

- [ ] **Step 6: Commit**

```bash
git add plugins/ciso/skills/hitrust/lib/apply-assessment.js plugins/ciso/skills/hitrust/lib/test/apply-assessment.test.js
git commit -m "refactor(ciso): parameterize apply-assessment.js by certKey

applyAssessment() and markCategoryComplete() no longer hardcode
'hitrust' -- callers must say which certification they mean, proven
by a test that assesses a second certification independently of hitrust."
```

---

## Task 4: Parameterize `reconcile-state-version.js` by certification key

**Files:**
- Modify: `plugins/ciso/skills/hitrust/lib/versioning/reconcile-state-version.js`
- Modify: `plugins/ciso/skills/hitrust/lib/versioning/test/reconcile-state-version.test.js`

**Interfaces:**
- Consumes: `diffStructureVersions(oldStructure, newStructure)` from `./diff-structure-versions.js` (unchanged, out of scope).
- Produces: `reconcileStateVersion(stateJsonPath, certKey, tierKey, newStructure)` — `certKey` is a new required 2nd argument. CLI: `node reconcile-state-version.js <state.json path> <certKey> <tier> <new-structure-file>`. Task 6 (SKILL.md) consumes this exact CLI shape.

- [ ] **Step 1: Add a failing cross-certification test**

In `plugins/ciso/skills/hitrust/lib/versioning/test/reconcile-state-version.test.js`, append:

```js
test('reconcileStateVersion is parameterized by certKey -- reconciling one certification does not touch another', () => {
  const state = buildInitialState();
  state.certifications.soc2 = {
    displayName: 'SOC 2 Type II',
    activeTier: 'type2',
    tiers: {
      type2: {
        controlSetVersion: '2017',
        sourceAuthority: 'structural-only',
        importedFrom: null,
        importedAt: null,
        controls: {
          'CC1.1': seededControl({
            id: 'CC1.1',
            type: 'Organizational',
            level: 1,
            relatedControlCode: 'CC1.1',
            relatedControlName: 'Control Environment',
            legacyCategoryPrefix: 'CC1',
          }),
        },
        archivedControls: {},
      },
    },
  };
  const stateJsonPath = makeTempState(state);

  reconcileStateVersion(stateJsonPath, 'hitrust', 'e1', NEW_STRUCTURE);

  const after = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  assert.equal(after.certifications.soc2.tiers.type2.controlSetVersion, '2017', 'soc2 must be untouched by a hitrust/e1 reconciliation');
  assert.equal(after.certifications.soc2.tiers.type2.controls['CC1.1'].relatedControlName, 'Control Environment');
  assert.equal(after.certifications.hitrust.tiers.e1.controlSetVersion, NEW_VERSION, 'hitrust/e1 itself still reconciles as before');
});
```

- [ ] **Step 2: Run to confirm the new test fails against the current implementation**

Run: `node --test plugins/ciso/skills/hitrust/lib/versioning/test/reconcile-state-version.test.js`
Expected: pre-existing tests still pass. The new test fails, because the old function's call `reconcileStateVersion(stateJsonPath, 'hitrust', 'e1', NEW_STRUCTURE)` is read by the OLD 3-arg signature as `(stateJsonPath, tierKey='hitrust', newStructure='e1')` — `newStructure` ends up being the string `'e1'`, not an object, so `newStructure.controls` throws a TypeError reading `.controls` of a string, or similar — either way it errors before completing.

- [ ] **Step 3: Implement the parameterization**

Replace `reconcileStateVersion` (current lines 59-107):

```js
// Reconciles `state.json`'s <certKey>/<tierKey> tier against `newStructure` (a newer-version
// structure file for the same tier). `certKey` is required -- this function is certification-
// agnostic and has no default to guess. Never destructive:
//   - unchanged ids: assessment/roadmap left completely untouched.
//   - modified ids: assessment/roadmap left untouched, but structural fields (everything except
//     the state-only bookkeeping fields above) are refreshed from `newStructure`, and a new
//     `needsReview: true` field is set so the org knows the underlying topic/control description
//     shifted since they last assessed it.
//   - added ids: seeded fresh with the same defaults register-tier.js's defaultControl() would
//     produce (status "not_assessed", empty roadmap, etc).
//   - removed ids: the entire existing control object -- assessment/roadmap and all -- is moved to
//     `tier.archivedControls[id]` rather than being dropped.
function reconcileStateVersion(stateJsonPath, certKey, tierKey, newStructure) {
  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const tier = state?.certifications?.[certKey]?.tiers?.[tierKey];
  if (!tier) {
    throw new Error(
      `Tier ${certKey}/${tierKey} is not registered in state.json -- nothing to reconcile. Run register-tier.js first.`
    );
  }
  if (!tier.controls) tier.controls = {};
  if (!tier.archivedControls) tier.archivedControls = {};

  // state.json doesn't store the original structure file separately, so reconstruct an old-style
  // structure object from the tier's currently registered controls, stripped down to structural
  // fields only.
  const oldStyleStructure = { controls: Object.values(tier.controls).map(toStructuralEntry) };
  const diff = diffStructureVersions(oldStyleStructure, newStructure);

  const newById = new Map((newStructure.controls || []).map((c) => [c.id, c]));

  // modified: merge in refreshed structural fields, flag needsReview, never touch assessment/roadmap.
  for (const { id } of diff.modified) {
    const control = tier.controls[id];
    const structuralUpdate = toStructuralEntry(newById.get(id));
    Object.assign(control, structuralUpdate);
    control.needsReview = true;
  }

  // added: seed fresh defaults.
  for (const id of diff.added) {
    tier.controls[id] = buildDefaultControl(newById.get(id));
  }

  // removed: archive the entire existing control object -- never dropped.
  for (const id of diff.removed) {
    tier.archivedControls[id] = tier.controls[id];
    delete tier.controls[id];
  }

  tier.controlSetVersion = newStructure.controlSetVersion;

  fs.writeFileSync(stateJsonPath, JSON.stringify(state, null, 2) + '\n');

  return {
    carriedForward: diff.unchanged.length + diff.modified.length,
    needsReview: diff.modified.length,
    added: diff.added.length,
    archived: diff.removed.length,
  };
}
```

Replace the CLI block (current lines 111-125):

```js
module.exports = { reconcileStateVersion, toStructuralEntry, buildDefaultControl, STATE_ONLY_FIELDS };

if (require.main === module) {
  const [stateJsonPath, certKey, tierKey, newStructurePath] = process.argv.slice(2);
  if (!stateJsonPath || !certKey || !tierKey || !newStructurePath) {
    console.error('Usage: node reconcile-state-version.js <state.json path> <certKey> <tier> <new-structure-file>');
    process.exit(1);
  }
  try {
    const newStructure = JSON.parse(fs.readFileSync(path.resolve(newStructurePath), 'utf8'));
    const result = reconcileStateVersion(path.resolve(stateJsonPath), certKey, tierKey, newStructure);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
```

- [ ] **Step 4: Update the pre-existing test call sites**

In `plugins/ciso/skills/hitrust/lib/versioning/test/reconcile-state-version.test.js`, replace all occurrences (`replace_all`) of `reconcileStateVersion(stateJsonPath, 'e1', NEW_STRUCTURE)` with `reconcileStateVersion(stateJsonPath, 'hitrust', 'e1', NEW_STRUCTURE)` (covers all 7 call sites: the plain-statement calls, the `const summary = ...` assignment, and both calls wrapped in `assert.throws(() => ...)`).

- [ ] **Step 5: Run the full file, confirm all tests pass**

Run: `node --test plugins/ciso/skills/hitrust/lib/versioning/test/reconcile-state-version.test.js`
Expected: `# tests 8`, `# pass 8`, `# fail 0` (7 pre-existing + 1 new)

- [ ] **Step 6: Commit**

```bash
git add plugins/ciso/skills/hitrust/lib/versioning/reconcile-state-version.js plugins/ciso/skills/hitrust/lib/versioning/test/reconcile-state-version.test.js
git commit -m "refactor(ciso): parameterize reconcile-state-version.js by certKey

reconcileStateVersion() no longer hardcodes 'hitrust' -- callers must
say which certification they mean, proven by a test that reconciles
hitrust/e1 without disturbing an unrelated soc2 tier in the same state."
```

---

## Task 5: Label the HITRUST/MyCSF-specific import modules explicitly

**Files:**
- Modify: `plugins/ciso/skills/hitrust/lib/merge-import.js`
- Modify: `plugins/ciso/skills/hitrust/lib/xlsx-lite.js`

**Interfaces:** None — comment-only changes, no behavior change, no test changes needed.

Unlike Tasks 2-4, `merge-import.js` and `xlsx-lite.js` are inherently HITRUST-e1/MyCSF-specific (they parse MyCSF's exact export column headers) — there is no generic version to extract. This task just makes that boundary explicit in the source so it isn't mistaken for reusable, per the design spec.

- [ ] **Step 1: Add the header comment to `merge-import.js`**

At the top of `plugins/ciso/skills/hitrust/lib/merge-import.js`, insert after `'use strict';`:

```js
'use strict';

// HITRUST-e1/MyCSF-specific by design, not incidental hardcoding: this module parses MyCSF's
// exact e1 export column headers and wholesale-replaces the e1 tier's controls. There is no
// generic "import a licensed assessment export" mechanism to extract here -- a future
// certification (SOC 2, ISO 27001, ...) needs its own sibling import module for its own export
// format, not a generalized version of this one.

const fs = require('fs');
```

- [ ] **Step 2: Add the header comment to `xlsx-lite.js`**

At the top of `plugins/ciso/skills/hitrust/lib/xlsx-lite.js`, insert after `'use strict';` and before the existing comment block:

```js
'use strict';

// HITRUST-e1/MyCSF-specific by design, not incidental hardcoding: this reader targets the exact
// slice of OOXML SpreadsheetML MyCSF's e1 export uses (see merge-import.js's parseE1Export call).
// A future certification's import path is a new sibling module, not a generalization of this one.

// Minimal, Node-stdlib-only (.xlsx is a standard ZIP container) reader for the small slice of
// OOXML SpreadsheetML this plugin needs: shared strings + a single worksheet. No npm dependency.

const fs = require('fs');
```

- [ ] **Step 3: Run the existing tests for both files to confirm nothing broke**

Run: `node --test plugins/ciso/skills/hitrust/lib/test/xlsx-lite.test.js`
Expected: unchanged pass count (comment-only change).

- [ ] **Step 4: Commit**

```bash
git add plugins/ciso/skills/hitrust/lib/merge-import.js plugins/ciso/skills/hitrust/lib/xlsx-lite.js
git commit -m "docs(ciso): label merge-import.js/xlsx-lite.js as HITRUST-e1/MyCSF-specific

Makes explicit that these two modules are not generic import machinery
-- a future certification needs its own sibling import module, not a
generalized version of these."
```

---

## Task 6: Update `hitrust/SKILL.md` for the new CLI shapes and sub-batch interview flow

**Files:**
- Modify: `plugins/ciso/skills/hitrust/SKILL.md`

**Interfaces:**
- Consumes: the exact CLI shapes produced by Tasks 2-4 — `register-tier.js <target-dir> <certKey> <certDisplayName> [<tier>]`, `apply-assessment.js <state.json> <certKey> <tier> <controlId> <jsonPayload>` / `<state.json> <certKey> <tier> <categoryKey>`, `reconcile-state-version.js <state.json> <certKey> <tier> <new-structure-file>`.

This task should run after Tasks 2-4 are complete, since it documents their final CLI shapes. It has no automated test — it's prose, checked by re-reading for internal consistency (per the design spec's Verification section).

- [ ] **Step 1: Update the Register section's shell invocation**

In `plugins/ciso/skills/hitrust/SKILL.md`, in the `## (a) Register` section, replace:

```
Run:
```
node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/register-tier.js" <docs/ciso-dir> <tier>
```
`<tier>` is `e1`, `i1`, or `r2` (omit it only for e1, kept as the default for backward compatibility). This loads the bundled `controls/<tier>.v11.8.structure.json` and merges it into `<docs/ciso-dir>/state.json`. Safe to re-run: it only adds control ids that are missing, never touches an existing control's `assessment`/`roadmap`, and only creates the `interviewSessions` entry if one doesn't already exist.
```

with:

```
Run:
```
node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/register-tier.js" <docs/ciso-dir> hitrust "HITRUST CSF" <tier>
```
`hitrust` and `"HITRUST CSF"` are the certification key and display name -- always these exact literal values for this skill (`register-tier.js` itself is certification-agnostic and requires both explicitly; this skill only ever registers the `hitrust` certification). `<tier>` is `e1`, `i1`, or `r2` (omit it only for e1, kept as the default for backward compatibility). This loads the bundled `controls/<tier>.v11.8.structure.json` and merges it into `<docs/ciso-dir>/state.json`. Safe to re-run: it only adds control ids that are missing, never touches an existing control's `assessment`/`roadmap`, and only creates the `interviewSessions` entry if one doesn't already exist.
```

- [ ] **Step 2: Replace the entire `## (c) Interview` section**

Replace the full section, from the `## (c) Interview` heading through the end of the `### Known limitation (accepted, not a bug)` paragraph (i.e. everything up to, but not including, the `## (d) Roadmap` heading), with:

```markdown
## (c) Interview

Resumable, chunked by `domainKey` (the modern 19-domain numbering, `01`-`19`, every current tier's controls carry) and, within each chunk, committed in sub-batches of 4-6 controls at a time rather than as one whole-category commit -- see Part 1 step 4. A handful of e1 controls also carry a `legacyCategoryPrefix` (an OLDER, different numbering scheme derived from a real MyCSF control-reference code, e.g. `04` from `04.a`) -- that field is purely extra display metadata, never used for grouping, since it isn't present on every control and uses a different scheme than `domainKey`. **Must run inside native plan mode** -- this is a firm requirement, not a style choice: each sub-batch only counts as "committed" once the user approves it via `ExitPlanMode`.

### Part 1 -- inside plan mode

1. Call `EnterPlanMode` if not already active.
2. Load the `hitrust`/`<tier>` entry from `interviewSessions` (it should already exist from registration; if somehow missing, re-run [Register](#a-register) first). Present `domainsCompleted` vs `domainsRemaining` to the user.
3. Ask (`AskUserQuestion`) which remaining category/domain to work through this session -- default to the next one in `domainsRemaining` order, but let the user pick a different one, or re-select an already-completed one to amend prior answers (completion isn't a lock).
4. Sort every control in the chosen category by `relatedControlCode` when present, else `topicLabel`, then `id`, and work through it in sub-batches of 4-6 controls at a time -- **never accumulate a whole category's worth of controls before the first `ExitPlanMode`**; this sub-batch boundary is what bounds an interruption's blast radius to a handful of controls instead of an entire domain. For each control in the current sub-batch:
   - Present it: code/topic label, name/summary, and `statementText` if imported. If `statementText` is still `null`, say so plainly and confirm with the user whether to proceed on the label/summary alone or pause here to run [Import](#b-import) first. For i1/r2, also restate that the entry is non-authoritative.
   - Ask its status (`AskUserQuestion`, single-select -- one control at a time, or batched up to 4 per call if that reads more naturally): **met** / **in progress** / **gap** / **not applicable** / **defer to later**. "Defer" must always be an explicit, visible option -- never let a control move on without the user having been asked.
   - Then, freeform conversational follow-up:
     - **met** -> a non-empty justification is mandatory. If the answer is empty or a non-answer, ask again -- never accept a placeholder.
     - **in progress** -> both a current-state description and an estimated-closeness are mandatory.
     - **gap** / **not applicable** / **defer** -> notes are encouraged, not required.
   - Hold the control's `{status, justification, currentState, estimatedCloseness}` in conversation context. **Do not write to `state.json` during this part** -- plan mode is read-only by convention here, and the discipline rule below is what actually enforces the required fields.
   Once every control in the current sub-batch (4-6 controls) has been asked, move on to step 5 to commit it.
5. Call `ExitPlanMode` with a plan body that restates every control processed in this sub-batch and its captured status + justification/detail. One approval commits this sub-batch -- not the whole category.

### Part 2 -- after approval, normal mode

6. For every control processed in this sub-batch, run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/apply-assessment.js" <docs/ciso-dir>/state.json hitrust <tier> <controlId> '<jsonPayload>'
   ```
   where `<jsonPayload>` is `{"status": "...", "justification": "...", "currentState": "...", "estimatedCloseness": "..."}` (only the fields relevant to the status need be non-null). This is the mechanical backstop, not just prose: it throws and makes **no** changes to the file if `status` is `"met"` without a justification, or `"in_progress"` without both `currentState` and `estimatedCloseness` -- so a rule "known" only in this document can't be silently skipped. It always stamps `assessment.assessedAt`, including for a deferred control (stored as `not_assessed`, same as an untouched one, but `assessedAt` is what distinguishes "asked but deferred" from "never touched").
7. Regenerate the dashboard now, after this sub-batch -- not only once the whole category finishes:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/_shared/render-dashboard.js" <docs/ciso-dir>
   ```
   This is what actually bounds the value an interruption can cost: after every sub-batch commit, `dashboard.html` on disk reflects real assessed progress, not just `state.json`.
8. If controls remain unprocessed in the chosen category, report a brief sub-batch summary (controls processed this sub-batch, statuses captured, sub-batches remaining), call `EnterPlanMode` again, and repeat step 4's sub-batch loop for the next 4-6 controls in the same category -- there's no need to re-run Part 1 steps 2-3 unless the user wants to switch to a different category before this one is finished.
9. Once every control in the category has been applied across however many sub-batches it took, run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/apply-assessment.js" <docs/ciso-dir>/state.json hitrust <tier> <domainKey>
   ```
   This throws if any control in that group still has `assessedAt: null` (something was missed, or an earlier sub-batch is still pending -- a hard stop, not a silent skip). On success it moves the group from `domainsRemaining` to `domainsCompleted`, updates `lastUpdatedAt`, and flips the session to `"completed"` once `domainsRemaining` is empty.
10. **Check for un-researched gaps right now, not just at full-tier completion.** Look at every control in `domainsCompleted` so far (the category that just finished, plus any earlier ones from this or a prior session) for `assessment.status` in `gap`/`in_progress` with `roadmap.status` still `not_started` or `researching`. If any exist, tell the user how many and offer [Roadmap](#d-roadmap) right now -- they can accept immediately, or decline and keep interviewing (or stop for now); nothing forces them into Roadmap before the tier is fully interviewed.
11. Regenerate the dashboard once more (step 7 already reflects this sub-batch; this pass also picks up the category moving to `domainsCompleted` from step 9), then report a full category-completion summary to the user: counts of met/gap/in-progress/deferred across the whole category, categories remaining, and the dashboard path.

### Discipline (why the mechanical gate exists)

- Never hand-edit `state.json` to bypass a required field -- if you're tempted to write `"status": "met"` directly into the file to save a round-trip, that's exactly the shortcut `apply-assessment.js` exists to block. Always go through the script.
- Never silently skip a control -- every control gets asked, even if the answer is "defer."
- "Met" always needs a real justification; "in progress" always needs both current-state and estimated-closeness. If the user gives a one-word or evasive answer, ask again before calling `apply-assessment.js` -- don't paper over it with a placeholder string, since the script only checks for non-blank, not for genuine content.

### Known limitation (accepted, not a bug)

If a session is interrupted mid-sub-batch -- before that sub-batch's `ExitPlanMode` -- only that sub-batch's Q&A (4-6 controls) is lost and redone next session; any earlier sub-batches already committed within the same category are unaffected, since each sub-batch's `apply-assessment.js` calls (Part 2 step 6) already wrote them to `state.json`. This is the deliberate resume granularity this schema chose -- a smaller blast radius than losing a whole category, in exchange for more `EnterPlanMode`/`ExitPlanMode` round-trips per category.
```

- [ ] **Step 3: Update the Upgrade section's `reconcile-state-version.js` invocation**

In the `## (e) Upgrade` section, replace:

```
3. Run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/versioning/reconcile-state-version.js" <docs/ciso-dir>/state.json <tier> <new-structure-file>
   ```
```

with:

```
3. Run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/hitrust/lib/versioning/reconcile-state-version.js" <docs/ciso-dir>/state.json hitrust <tier> <new-structure-file>
   ```
```

- [ ] **Step 4: Re-read the full file for internal consistency**

Read `plugins/ciso/skills/hitrust/SKILL.md` end to end. Confirm:
- Every `register-tier.js`, `apply-assessment.js`, and `reconcile-state-version.js` invocation in the file now includes the `hitrust` certKey argument in the right position.
- The Interview section's step numbering is sequential and internally consistent (no orphaned reference to an old step number).
- The "Known limitation" note's description of blast radius matches the sub-batch behavior actually described in Part 1/Part 2.

- [ ] **Step 5: Commit**

```bash
git add plugins/ciso/skills/hitrust/SKILL.md
git commit -m "docs(ciso): update hitrust SKILL.md for certKey CLI args and sub-batch interview flow

Documents the parameterized register-tier.js/apply-assessment.js/
reconcile-state-version.js CLI shapes from the certKey hardening pass,
and shrinks the interview's commit granularity from a whole domain to
sub-batches of 4-6 controls per docs/superpowers/specs/2026-07-19-ciso-hitrust-hardening-design.md."
```

---

## Task 7: Full regression pass

**Files:** None modified -- verification only.

- [ ] **Step 1: Run every test file under `plugins/ciso`**

Run (PowerShell): `Get-ChildItem -Path plugins/ciso -Recurse -Filter *.test.js | ForEach-Object { node --test $_.FullName }`
Or (bash): `find plugins/ciso -name '*.test.js' -exec node --test {} \;`
Expected: every suite passes, with zero failures across all files (the 6 pre-existing suites this plan touched, plus the new `dashboard-template.test.js`, plus every untouched suite in `roadmap/`, `versioning/diff-structure-versions.test.js`, `xlsx-lite.test.js`, `init/lib/test/init-project.test.js`, and the plugin-level `agents-frontmatter.test.js`).

- [ ] **Step 2: Manual dashboard smoke check**

Build a small fixture `state.json` reproducing the mixed-`legacyCategoryPrefix` domain (the same shape as Task 1's `MIXED_DOMAIN_CONTROLS`), run `node plugins/ciso/skills/_shared/render-dashboard.js <tmp-dir>` against it, and open the resulting `dashboard.html` in a real browser. Confirm the birds-eye "Jump to details" link for that domain lands on a single, correctly-counted domain group -- confirming the automated test in Task 1 matches real rendered behavior, not just the `vm`-sandboxed approximation.

- [ ] **Step 3: Manual certKey smoke check**

From a throwaway temp directory with a scaffolded `state.json` (via `ciso:init` or a hand-written minimal one), run `register-tier.js`/`apply-assessment.js` end-to-end from the command line against a fake certification key (e.g. `demo-cert`), and confirm no `hitrust`-specific behavior leaks through (e.g. the resulting `state.json` has a `certifications.demo-cert` entry, not `certifications.hitrust`).

No commit for this task -- it's verification only.
