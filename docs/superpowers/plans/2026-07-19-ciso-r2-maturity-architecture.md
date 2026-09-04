# CISO r2 PRISMA Maturity Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give r2 controls a five-dimension PRISMA maturity model (Policy/Procedure/Implemented/Measured/Managed) in `state.json`, with matching validation, interview, and dashboard support — while leaving e1/i1 completely untouched.

**Architecture:** r2 controls get `assessment.maturity.{policy,procedure,implemented,measured,managed}` (each an independently-assessable `{status, justification, inProgress, assessedAt}` object using the exact same status vocabulary e1/i1 already use) in place of a flat `assessment.status`. Every touch point that reads/writes assessment data (`register-tier.js`, `apply-assessment.js`, `reconcile-state-version.js`, `render-dashboard.js`, `dashboard-template.html`) branches on tier (`r2` vs. everything else) rather than replacing its existing e1/i1 code path.

**Tech Stack:** Node.js stdlib only (`node:test`, `node:assert/strict`, `fs`, `path`, `vm`) — no new dependencies, matching the plugin's existing convention.

**Governing spec:** `docs/superpowers/specs/2026-07-19-ciso-r2-maturity-architecture-design.md` (already committed).

## Global Constraints

- Node stdlib only — never add an npm dependency.
- Test with `node:test` + `node:assert/strict`, matching every existing test file in `plugins/ciso/`.
- e1 and i1's schema, interview flow, and dashboard rendering must not change in any way. Every new branch is `tierKey === 'r2'` (or equivalent), with the existing behavior as the unconditional else-path.
- Status vocabulary for every maturity dimension is exactly `not_assessed | met | in_progress | gap | not_applicable` — the same five values e1/i1 already use. Never invent a new status value.
- No percentage/weighted PRISMA scoring anywhere — only the status vocabulary above, applied per dimension.
- No per-dimension `not_applicable` — only a whole-control call (no `dimension` argument) may set `not_applicable`.
- Stage only the exact files named in each task's Commit step — never `git add -A`.
- Run the full suite (`node --test $(find plugins/ciso -name '*.test.js')` from the repo root, or equivalent) at the end of every task, not just the task's own new tests, to catch cross-file regressions early.

---

### Task 1: Reshape `r2.v11.8.structure.json` to concrete, assessable controls

**Files:**
- Modify: `plugins/ciso/skills/hitrust/controls/r2.v11.8.structure.json`
- Test: `plugins/ciso/skills/hitrust/lib/test/register-tier.test.js` (new test appended)

**Interfaces:**
- Produces: a `controls` array where every entry has `applicabilityTier: "universal" | "conditional"` (+ `conditionalOn` string, present iff `"conditional"`), no `baselineOverlap` or `exampleOnly` field, and ids in the `r2-<domainKey>-<NN>` format (matching e1/i1's own id convention, replacing the old `r2-illustrative-<domainKey>-<NN>` ids).

- [ ] **Step 1: Write the failing shape-validation test**

Append to `plugins/ciso/skills/hitrust/lib/test/register-tier.test.js` (this file already imports `loadStructure`, `resolveStructurePath` at the top):

```javascript
test('the bundled r2.v11.8.structure.json entries are concrete, assessable controls with a valid applicabilityTier', () => {
  const structure = loadStructure(resolveStructurePath('r2'));
  assert.equal(structure.tier, 'r2');
  assert.ok(structure.controls.length > 0, 'r2 structure file must not be empty');

  for (const control of structure.controls) {
    assert.ok(
      ['universal', 'conditional'].includes(control.applicabilityTier),
      `${control.id} must have applicabilityTier "universal" or "conditional"`
    );
    if (control.applicabilityTier === 'conditional') {
      assert.ok(
        control.conditionalOn && control.conditionalOn.trim().length > 0,
        `${control.id} is conditional but has no conditionalOn note`
      );
    } else {
      assert.equal(control.conditionalOn, undefined, `${control.id} is universal and must not carry a conditionalOn note`);
    }
    assert.equal(control.baselineOverlap, undefined, `${control.id} must not carry the removed baselineOverlap field`);
    assert.equal(control.exampleOnly, undefined, `${control.id} must not carry the removed exampleOnly field`);
    assert.equal(control.nonAuthoritative, true, `${control.id} must be marked nonAuthoritative`);
    assert.ok(Array.isArray(control.citations) && control.citations.length > 0, `${control.id} must carry at least one citation`);
    assert.match(control.id, /^r2-\d{2}-\d{2}$/, `${control.id} must use the r2-<domainKey>-<NN> id format`);
  }
});
```

- [ ] **Step 2: Run the test to confirm it fails against the current file**

Run: `node --test plugins/ciso/skills/hitrust/lib/test/register-tier.test.js`
Expected: FAIL on the new test — the current 12 entries have `baselineOverlap`/`exampleOnly` fields, no `applicabilityTier`, and ids like `r2-illustrative-01-01`.

- [ ] **Step 3: Rewrite the structure file**

Replace `plugins/ciso/skills/hitrust/controls/r2.v11.8.structure.json` in full:

```json
{
  "tier": "r2",
  "controlSetVersion": "v11.8",
  "sourceAuthority": "public-topic-level",
  "nonAuthoritative": true,
  "compiledAt": "2026-07-19T00:00:00.000Z",
  "baselineRef": "i1.v11.8.structure.json",
  "maturityDimensions": ["Policy", "Procedure", "Implemented", "Measured", "Managed"],
  "coverageNote": "r2 uses i1's full baseline plus risk-tailored additions determined by an organization's own risk-scoping factors (records volume, internet accessibility, regulatory exposure, BYOD, wireless use, third-party access, and more) -- there is no fixed r2 control list. The 12 entries below are a small, concrete, non-authoritative seed set proving the r2 maturity-dimension schema end-to-end (see docs/superpowers/specs/2026-07-19-ciso-r2-maturity-architecture-design.md); a much larger generalizable-controls research pass is planned separately. Each entry carries applicabilityTier (\"universal\": applies to nearly any organization pursuing r2, vs. \"conditional\": depends on a specific risk factor, named in conditionalOn) so the dashboard/roadmap can surface near-universal topics first. r2 also scores multiple maturity dimensions per control (see maturityDimensions), not just Implemented -- see the design spec for how this plugin models that without overclaiming HITRUST's real weighted PRISMA scoring. Real r2 scope and maturity requirements are set by HITRUST's own risk-factor questionnaire (in MyCSF) or a licensed assessor.",
  "controls": [
    {
      "id": "r2-01-01",
      "domain": "Information Protection Program",
      "domainKey": "01",
      "topicLabel": "Regulatory/authoritative-source-mapped program documentation",
      "topicSummary": "The organization's information security program documentation is extended to explicitly map applicable regulatory or authoritative-source requirements (e.g., GDPR, HIPAA, PCI DSS) identified by the organization's own risk profile, beyond i1's generic baseline program documentation.",
      "citations": ["https://hitrustalliance.net/assessments-and-certifications/r2"],
      "applicabilityTier": "conditional",
      "conditionalOn": "applies when a specific regulatory obligation (e.g. GDPR, PCI DSS, HIPAA) applies to the organization",
      "nonAuthoritative": true
    },
    {
      "id": "r2-02-01",
      "domain": "Endpoint Protection",
      "domainKey": "02",
      "topicLabel": "Documented BYOD security baseline",
      "topicSummary": "A documented, enforced security baseline (minimum OS version, encryption, screen lock, remote wipe capability) applies to personally-owned devices permitted to access in-scope systems, beyond i1's organization-owned-endpoint baseline.",
      "citations": ["https://help.mycsf.net/factors/"],
      "applicabilityTier": "conditional",
      "conditionalOn": "applies if personally-owned devices (BYOD) are permitted to access in-scope systems",
      "nonAuthoritative": true
    },
    {
      "id": "r2-04-01",
      "domain": "Mobile Device Security",
      "domainKey": "04",
      "topicLabel": "Mobile device management (MDM) enforcement",
      "topicSummary": "Mobile devices accessing in-scope systems are enrolled in a mobile device management (MDM) solution enforcing a documented security configuration baseline, rather than relying on informal device-level controls alone.",
      "citations": ["https://hitrustalliance.net/hubfs/CSF%20Versions/CSF%20v11.5/Introduction%20to%20HITRUST%20CSF%20v11.5.0.pdf"],
      "applicabilityTier": "conditional",
      "conditionalOn": "applies if mobile devices are used within the assessed environment",
      "nonAuthoritative": true
    },
    {
      "id": "r2-05-01",
      "domain": "Wireless Security",
      "domainKey": "05",
      "topicLabel": "Enterprise wireless authentication and guest segmentation",
      "topicSummary": "In-scope wireless networks use enterprise-grade authentication (e.g., WPA2/WPA3-Enterprise with per-user credentials) and guest wireless traffic is segmented from in-scope systems, validated on-site rather than merely described in policy.",
      "citations": ["https://socreports.com/hitrust/hitrust-risk-based-2-year-r2-validated-assessments"],
      "applicabilityTier": "conditional",
      "conditionalOn": "applies if wireless networks are used within the assessed environment",
      "nonAuthoritative": true
    },
    {
      "id": "r2-07-01",
      "domain": "Vulnerability Management",
      "domainKey": "07",
      "topicLabel": "Formal, validated penetration-testing program",
      "topicSummary": "A documented penetration-testing program exists with defined scope and methodology, dated test reports within the assessment evidence window, tracked remediation of findings, and retest confirmation -- validated on-site as a distinct requirement from vulnerability scanning alone.",
      "citations": [
        "https://www.softwaresecured.com/guides-and-checklists/hitrust-csf-penetration-testing-requirements-guide",
        "https://deepstrike.io/blog/hitrust-certification-penetration-testing"
      ],
      "applicabilityTier": "universal",
      "nonAuthoritative": true
    },
    {
      "id": "r2-08-01",
      "domain": "Network Protection",
      "domainKey": "08",
      "topicLabel": "Cardholder-data or cloud-boundary segmentation validation",
      "topicSummary": "Network segmentation is validated for cardholder-data environments (if payment card data is handled) or cloud VPC/security-group/subnet boundaries (if cloud-hosted systems are in scope), beyond i1's general network-segmentation baseline.",
      "citations": [
        "https://www.softwaresecured.com/guides-and-checklists/hitrust-csf-penetration-testing-requirements-guide",
        "https://hitrustalliance.net/assessments-and-certifications/r2"
      ],
      "applicabilityTier": "conditional",
      "conditionalOn": "applies if handling payment card data or operating cloud-hosted systems requiring segmentation validation",
      "nonAuthoritative": true
    },
    {
      "id": "r2-08-02",
      "domain": "Network Protection",
      "domainKey": "08",
      "topicLabel": "Extended boundary defense for internet-accessible systems",
      "topicSummary": "In-scope systems that are internet-accessible receive additional network-protection validation (e.g., stricter boundary defense, exposure review) beyond what a non-internet-facing system requires under i1's baseline.",
      "citations": [
        "https://hitrustalliance.net/advisories/haa-2021-012-i1-introduction-and-r2-enhancements",
        "https://hitrustalliance.net/assessments-and-certifications/r2"
      ],
      "applicabilityTier": "conditional",
      "conditionalOn": "applies if in-scope systems are internet-accessible",
      "nonAuthoritative": true
    },
    {
      "id": "r2-09-01",
      "domain": "Transmission Protection",
      "domainKey": "09",
      "topicLabel": "NIST-validated (FIPS 140-2/140-3) cryptographic modules",
      "topicSummary": "Encryption of sensitive data in transit and at rest uses NIST-validated (FIPS 140-2/140-3) cryptographic modules, rather than merely algorithmically-strong but unvalidated implementations.",
      "citations": ["https://www.safelogic.com/blog/hitrust-90"],
      "applicabilityTier": "conditional",
      "conditionalOn": "applies most directly to organizations with federal, healthcare, or other regulatory exposure requiring FIPS-validated cryptography",
      "nonAuthoritative": true
    },
    {
      "id": "r2-13-01",
      "domain": "Education, Training, and Awareness",
      "domainKey": "13",
      "topicLabel": "Sector/compliance-specific awareness training content",
      "topicSummary": "Security awareness training includes sector- or compliance-specific content (e.g., cardholder-data handling for PCI DSS scope) layered onto i1's baseline general security-awareness program.",
      "citations": [
        "https://hitrustalliance.net/assessments-and-certifications/r2",
        "https://www.bemopro.com/compliance-requirements/hitrust"
      ],
      "applicabilityTier": "conditional",
      "conditionalOn": "applies if handling payment card data or subject to another authoritative source with its own awareness-training requirements",
      "nonAuthoritative": true
    },
    {
      "id": "r2-14-01",
      "domain": "Third-Party Assurance",
      "domainKey": "14",
      "topicLabel": "Subcontractor/subprocessor accountability for PHI handling",
      "topicSummary": "A maintained inventory of subcontractors/subprocessors that handle protected health information on the organization's behalf, with collected security questionnaires or independent assessment/certification reports for each -- mirroring what a covered entity expects of the organization itself.",
      "citations": [
        "https://screenata.com/resources/blog/business-associate-hitrust-requirements-complete-evidence-checklist",
        "https://www.ispartnersllc.com/blog/hitrust-csf-certification-bas/"
      ],
      "applicabilityTier": "conditional",
      "conditionalOn": "applies to healthcare Business Associates whose subcontractors handle protected health information",
      "nonAuthoritative": true
    },
    {
      "id": "r2-17-01",
      "domain": "Risk Management",
      "domainKey": "17",
      "topicLabel": "Regulatory/privacy factors formally incorporated into risk assessment",
      "topicSummary": "The organization's risk assessment process formally incorporates applicable regulatory or privacy factors (e.g., GDPR, CCPA, PCI DSS) as distinct, documented risk inputs, not folded generically into overall security risk.",
      "citations": ["https://hitrustalliance.net/assessments-and-certifications/r2"],
      "applicabilityTier": "conditional",
      "conditionalOn": "applies to organizations with material privacy or payment-card regulatory exposure",
      "nonAuthoritative": true
    },
    {
      "id": "r2-19-01",
      "domain": "Data Protection and Privacy",
      "domainKey": "19",
      "topicLabel": "Documented handling of GDPR/CCPA-covered personal data",
      "topicSummary": "Data handling practices for regulated personal data (e.g., GDPR-covered EU personal data, or CCPA-covered California consumer data) are documented and implemented alongside i1's baseline data-protection controls.",
      "citations": [
        "https://socreports.com/hitrust/hitrust-risk-based-2-year-r2-validated-assessments",
        "https://blog.rsisecurity.com/how-hitrust-is-growing-its-privacy-controls-for-greater-security/",
        "https://hitrustalliance.net/advisories/haa-2021-012-i1-introduction-and-r2-enhancements"
      ],
      "applicabilityTier": "conditional",
      "conditionalOn": "applies to organizations processing GDPR- or CCPA-covered personal data",
      "nonAuthoritative": true
    }
  ]
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test plugins/ciso/skills/hitrust/lib/test/register-tier.test.js`
Expected: PASS (all tests in the file, including the new one).

- [ ] **Step 5: Commit**

```bash
git add plugins/ciso/skills/hitrust/controls/r2.v11.8.structure.json plugins/ciso/skills/hitrust/lib/test/register-tier.test.js
git commit -m "feat(ciso): reshape r2 seed controls to concrete, assessable topics with applicabilityTier"
```

---

### Task 2: `register-tier.js` — seed r2's maturity shape

**Files:**
- Modify: `plugins/ciso/skills/hitrust/lib/register-tier.js`
- Test: `plugins/ciso/skills/hitrust/lib/test/register-tier.test.js`

**Interfaces:**
- Produces: `defaultControl(entry, sourceAuthority, tierKey)` — third parameter is new and optional; when `tierKey === 'r2'`, returns `assessment: { status: null, maturity: { policy, procedure, implemented, measured, managed } }` (each a `{status: 'not_assessed', justification: null, inProgress: {currentState: null, estimatedCloseness: null}, assessedAt: null}` object); otherwise returns the existing flat `assessment` shape unchanged.
- Consumes: nothing new from other tasks.

- [ ] **Step 1: Write the failing tests**

Append to `plugins/ciso/skills/hitrust/lib/test/register-tier.test.js`:

```javascript
test('defaultControl seeds an r2 control with a null top-level status and all 5 maturity dimensions not_assessed', () => {
  const entry = {
    id: 'r2-01-01', domain: 'Information Protection Program', domainKey: '01',
    topicLabel: 'x', topicSummary: 'y', citations: ['https://example.com'],
    applicabilityTier: 'universal', nonAuthoritative: true,
  };
  const control = defaultControl(entry, 'public-topic-level', 'r2');

  assert.equal(control.assessment.status, null);
  assert.deepEqual(
    Object.keys(control.assessment.maturity).sort(),
    ['implemented', 'managed', 'measured', 'policy', 'procedure']
  );
  for (const dim of Object.keys(control.assessment.maturity)) {
    assert.deepEqual(control.assessment.maturity[dim], {
      status: 'not_assessed', justification: null,
      inProgress: { currentState: null, estimatedCloseness: null }, assessedAt: null,
    });
  }
});

test('defaultControl without tierKey (e1/i1) keeps the existing flat assessment shape', () => {
  const control = defaultControl({ id: 'CTRL-A', legacyCategoryPrefix: '01' });
  assert.equal(control.assessment.status, 'not_assessed');
  assert.equal(control.assessment.maturity, undefined);
});

test('registering the bundled r2.v11.8.structure.json seeds every control with the maturity shape', () => {
  const structure = loadStructure(resolveStructurePath('r2'));
  const stateJsonPath = makeTempState();
  const result = registerTier(stateJsonPath, structure, 'hitrust', 'HITRUST CSF');
  assert.equal(result.added, structure.controls.length);

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const tier = state.certifications.hitrust.tiers.r2;
  for (const id of Object.keys(tier.controls)) {
    const control = tier.controls[id];
    assert.equal(control.assessment.status, null, `${id} must have a null top-level status`);
    assert.ok(control.assessment.maturity && control.assessment.maturity.implemented, `${id} must have a maturity.implemented dimension`);
  }
});
```

- [ ] **Step 2: Run to confirm the new tests fail**

Run: `node --test plugins/ciso/skills/hitrust/lib/test/register-tier.test.js`
Expected: the 3 new tests FAIL — `defaultControl` currently ignores a third argument and always returns the flat shape.

- [ ] **Step 3: Implement the tier-aware `defaultControl`**

In `plugins/ciso/skills/hitrust/lib/register-tier.js`, replace the existing `defaultControl` function (currently lines 22-39) with:

```javascript
const R2_DIMENSIONS = ['policy', 'procedure', 'implemented', 'measured', 'managed'];

function defaultMaturityDimension() {
  return {
    status: 'not_assessed',
    justification: null,
    inProgress: { currentState: null, estimatedCloseness: null },
    assessedAt: null,
  };
}

// Builds a control record with every field defaulted per the docs/ciso/state.json contract.
// Preserves every field already on `entry` (id/type/level/relatedControlCode/relatedControlName/
// legacyCategoryPrefix for e1; id/domain/topicLabel/topicSummary/citations/applicabilityTier/
// nonAuthoritative for i1/r2's topic-level shape) via spread, rather than enumerating a fixed
// e1-shaped field list -- this is what lets the same registration path work for both structure
// shapes without the dashboard silently losing i1/r2-specific fields. `sourceAuthority` is the
// tier's declared authority level ("structural-only" for e1, "public-topic-level" for i1/r2),
// used as this control's initial `statementSource` too (they start in lockstep; e1's per-control
// statementSource then advances independently to "imported" as export rows get matched).
// `tierKey === 'r2'` seeds a five-dimension `maturity` object (Policy/Procedure/Implemented/
// Measured/Managed, each independently assessable) instead of a flat status -- r2 is the only
// HITRUST tier that scores multiple PRISMA maturity dimensions; e1/i1 keep the flat shape since
// they are officially Implemented-only. See docs/superpowers/specs/2026-07-19-ciso-r2-maturity-architecture-design.md.
function defaultControl(entry, sourceAuthority, tierKey) {
  const assessment = tierKey === 'r2'
    ? {
        status: null,
        maturity: R2_DIMENSIONS.reduce((acc, dim) => {
          acc[dim] = defaultMaturityDimension();
          return acc;
        }, {}),
      }
    : {
        status: 'not_assessed',
        justification: null,
        inProgress: { currentState: null, estimatedCloseness: null },
        assessedAt: null,
      };

  return Object.assign({}, entry, {
    statementText: null,
    statementSource: sourceAuthority || 'structural-only',
    assessment,
    roadmap: {
      budgetTier: null,
      vendorResearch: [],
      recommendation: null,
      status: 'not_started',
    },
  });
}
```

Then update the one call site inside `registerTier` (currently `tier.controls[entry.id] = defaultControl(entry, tierSourceAuthority);`) to pass `tierKey`:

```javascript
      tier.controls[entry.id] = defaultControl(entry, tierSourceAuthority, tierKey);
```

(`tierKey` is already in scope in that function, defined earlier as `const tierKey = resolvedStructure.tier;`.)

- [ ] **Step 4: Run the full file to confirm all tests pass**

Run: `node --test plugins/ciso/skills/hitrust/lib/test/register-tier.test.js`
Expected: PASS, all tests including the 3 new ones.

- [ ] **Step 5: Run the rest of the suite to check for regressions**

Run: `node --test $(find plugins/ciso -name '*.test.js')` (or the PowerShell equivalent: enumerate `*.test.js` files under `plugins/ciso` and pass them to `node --test`)
Expected: PASS. `apply-assessment.test.js` calls `defaultControl(def)` with no third argument — must still produce the flat e1 shape.

- [ ] **Step 6: Commit**

```bash
git add plugins/ciso/skills/hitrust/lib/register-tier.js plugins/ciso/skills/hitrust/lib/test/register-tier.test.js
git commit -m "feat(ciso): seed r2's 5-dimension maturity shape in register-tier.js"
```

---

### Task 3: `apply-assessment.js` — r2 per-dimension writes, Managed/Measured gate, whole-control N/A

**Files:**
- Modify: `plugins/ciso/skills/hitrust/lib/apply-assessment.js`
- Test: `plugins/ciso/skills/hitrust/lib/test/apply-assessment.test.js`

**Interfaces:**
- Consumes: `defaultControl(entry, sourceAuthority, tierKey)` from Task 2 (already imported in the test file as `const { defaultControl } = require('../register-tier.js');`).
- Produces: `applyAssessment(stateJsonPath, certKey, tierKey, controlId, payload)` — unchanged signature; for `tierKey === 'r2'`, `payload` additionally accepts `dimension: 'policy'|'procedure'|'implemented'|'measured'|'managed'` (omitted = whole-control call, only valid with `status: 'not_applicable'` or `status: 'not_assessed'`). Returns `control.assessment` (now either the flat e1/i1 shape or the r2 `{status, maturity}` shape). `markCategoryComplete(stateJsonPath, certKey, tierKey, categoryKey)` — unchanged signature; for r2, its domain-done gate checks the `implemented` dimension (or whole-control `not_applicable`) instead of a flat `assessedAt`.

- [ ] **Step 1: Write the failing tests**

Append to `plugins/ciso/skills/hitrust/lib/test/apply-assessment.test.js` (after the existing tests, before the final closing of the file):

```javascript
const R2_CTRL_A = {
  id: 'r2-01-01', domain: 'Information Protection Program', domainKey: '01',
  topicLabel: 'Formal penetration testing', topicSummary: 'x',
  citations: ['https://example.com'], applicabilityTier: 'universal', nonAuthoritative: true,
};
const R2_CTRL_B = {
  id: 'r2-02-01', domain: 'Endpoint Protection', domainKey: '02',
  topicLabel: 'BYOD baseline', topicSummary: 'y',
  citations: ['https://example.com'], applicabilityTier: 'conditional',
  conditionalOn: 'applies if BYOD is permitted', nonAuthoritative: true,
};

function seedR2State(stateJsonPath, controlDefs) {
  const controls = {};
  for (const def of controlDefs) {
    controls[def.id] = defaultControl(def, 'public-topic-level', 'r2');
  }
  const state = {
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
            controls,
            archivedControls: {},
          },
        },
      },
    },
    interviewSessions: [
      {
        certification: 'hitrust',
        tier: 'r2',
        startedAt: '2026-01-01T00:00:00.000Z',
        lastUpdatedAt: '2026-01-01T00:00:00.000Z',
        domainsCompleted: [],
        domainsRemaining: Array.from(new Set(controlDefs.map((c) => c.domainKey))).sort(),
        status: 'in_progress',
      },
    ],
  };
  fs.writeFileSync(stateJsonPath, JSON.stringify(state, null, 2));
}

test('applyAssessment on r2 with dimension "implemented" writes only that dimension, leaving others not_assessed', () => {
  const stateJsonPath = makeTempState();
  seedR2State(stateJsonPath, [R2_CTRL_A]);

  const result = applyAssessment(stateJsonPath, 'hitrust', 'r2', 'r2-01-01', {
    status: 'met', justification: 'Pentest completed and remediated.', dimension: 'implemented',
  });

  assert.equal(result.maturity.implemented.status, 'met');
  assert.equal(result.maturity.implemented.justification, 'Pentest completed and remediated.');
  assert.ok(result.maturity.implemented.assessedAt);
  assert.equal(result.maturity.policy.status, 'not_assessed');
  assert.equal(result.maturity.policy.assessedAt, null);
  assert.equal(result.status, null, 'whole-control status stays null for a per-dimension call');
});

test('applyAssessment on r2 throws when marking "managed" met before "measured" is met', () => {
  const stateJsonPath = makeTempState();
  seedR2State(stateJsonPath, [R2_CTRL_A]);

  assert.throws(
    () => applyAssessment(stateJsonPath, 'hitrust', 'r2', 'r2-01-01', {
      status: 'met', justification: 'Fully managed.', dimension: 'managed',
    }),
    /[Mm]anaged.*[Mm]easured/
  );

  applyAssessment(stateJsonPath, 'hitrust', 'r2', 'r2-01-01', {
    status: 'met', justification: 'Measured via KPIs.', dimension: 'measured',
  });
  const result = applyAssessment(stateJsonPath, 'hitrust', 'r2', 'r2-01-01', {
    status: 'met', justification: 'Fully managed.', dimension: 'managed',
  });
  assert.equal(result.maturity.managed.status, 'met');
});

test('applyAssessment on r2 rejects a per-dimension not_applicable', () => {
  const stateJsonPath = makeTempState();
  seedR2State(stateJsonPath, [R2_CTRL_A]);
  assert.throws(
    () => applyAssessment(stateJsonPath, 'hitrust', 'r2', 'r2-01-01', { status: 'not_applicable', dimension: 'implemented' }),
    /whole-control/
  );
});

test('applyAssessment on r2 with no dimension engages whole-control not_applicable across all 5 dimensions', () => {
  const stateJsonPath = makeTempState();
  seedR2State(stateJsonPath, [R2_CTRL_A]);

  const result = applyAssessment(stateJsonPath, 'hitrust', 'r2', 'r2-01-01', { status: 'not_applicable' });
  assert.equal(result.status, 'not_applicable');
  for (const dim of ['policy', 'procedure', 'implemented', 'measured', 'managed']) {
    assert.equal(result.maturity[dim].status, 'not_applicable');
    assert.ok(result.maturity[dim].assessedAt);
  }
});

test('applyAssessment on r2 rejects a per-dimension call once whole-control not_applicable, until reversed', () => {
  const stateJsonPath = makeTempState();
  seedR2State(stateJsonPath, [R2_CTRL_A]);
  applyAssessment(stateJsonPath, 'hitrust', 'r2', 'r2-01-01', { status: 'not_applicable' });

  assert.throws(
    () => applyAssessment(stateJsonPath, 'hitrust', 'r2', 'r2-01-01', { status: 'met', justification: 'x', dimension: 'implemented' }),
    /reverse it first/
  );

  const reversed = applyAssessment(stateJsonPath, 'hitrust', 'r2', 'r2-01-01', { status: 'not_assessed' });
  assert.equal(reversed.status, null);
  assert.equal(reversed.maturity.implemented.status, 'not_assessed');

  const afterReverse = applyAssessment(stateJsonPath, 'hitrust', 'r2', 'r2-01-01', {
    status: 'met', justification: 'Now implemented.', dimension: 'implemented',
  });
  assert.equal(afterReverse.maturity.implemented.status, 'met');
});

test('markCategoryComplete on r2 only requires the implemented dimension (or whole-control not_applicable) to be assessed', () => {
  const stateJsonPath = makeTempState();
  seedR2State(stateJsonPath, [R2_CTRL_A, R2_CTRL_B]);

  assert.throws(() => markCategoryComplete(stateJsonPath, 'hitrust', 'r2', '01'), /never assessed/);

  applyAssessment(stateJsonPath, 'hitrust', 'r2', 'r2-01-01', { status: 'gap', dimension: 'implemented' });
  const session = markCategoryComplete(stateJsonPath, 'hitrust', 'r2', '01');
  assert.deepEqual(session.domainsCompleted, ['01']);

  applyAssessment(stateJsonPath, 'hitrust', 'r2', 'r2-01-01', {
    status: 'in_progress', currentState: 'draft policy', estimatedCloseness: 'half done', dimension: 'policy',
  });
  const stateAfter = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const stillSession = stateAfter.interviewSessions.find((s) => s.tier === 'r2');
  assert.deepEqual(stillSession.domainsCompleted, ['01'], 'deepening a dimension after the domain completes must not un-complete it');
});
```

- [ ] **Step 2: Run to confirm the new tests fail**

Run: `node --test plugins/ciso/skills/hitrust/lib/test/apply-assessment.test.js`
Expected: FAIL — `applyAssessment` currently always writes the flat shape (`control.assessment.status = ...`), which will throw or silently write the wrong shape against an r2-seeded control.

- [ ] **Step 3: Implement the r2-aware branch**

Replace `plugins/ciso/skills/hitrust/lib/apply-assessment.js` in full:

```javascript
'use strict';

const fs = require('fs');

// Statuses accepted as interview input. "defer" and "not_assessed" are not persisted verbatim as
// distinct concepts beyond the schema's five status values -- STATUS_MAP below maps "defer" onto
// the stored enum ("not_assessed") while still stamping assessedAt, which is what distinguishes
// "asked but deferred" from "never touched" (assessedAt === null).
const VALID_INPUT_STATUSES = ['met', 'in_progress', 'gap', 'not_applicable', 'defer', 'not_assessed'];
const STATUS_MAP = { defer: 'not_assessed' };

// r2's five PRISMA maturity dimensions. Duplicated locally rather than imported from
// register-tier.js, mirroring reconcile-state-version.js's existing "small local
// re-implementation... so this file's module boundary stays independent" precedent.
const R2_DIMENSIONS = ['policy', 'procedure', 'implemented', 'measured', 'managed'];

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function validatePayloadShape(status, justification, currentState, estimatedCloseness) {
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
}

// r2 controls store a `maturity` object (one entry per PRISMA dimension) instead of e1/i1's flat
// `assessment.status` -- see docs/superpowers/specs/2026-07-19-ciso-r2-maturity-architecture-design.md.
// `payload.dimension` selects which of the 5 dimensions this call targets; omitting it is a
// whole-control call, which only accepts status "not_applicable" (engage -- short-circuits all 5
// dimensions to not_applicable) or "not_assessed" (reverse -- clears the whole-control state back
// to null and resets all 5 dimensions to not_assessed).
function applyR2Assessment(control, stateJsonPath, state, payload) {
  const { status, justification, currentState, estimatedCloseness, dimension } = payload;
  const storedStatus = STATUS_MAP[status] || status;

  if (!control.assessment || !control.assessment.maturity) {
    throw new Error(
      `Control "${control.id}" does not have an r2 maturity shape -- was it registered before this schema existed? Re-run register-tier.js.`
    );
  }

  if (dimension === undefined || dimension === null) {
    if (storedStatus !== 'not_applicable' && storedStatus !== 'not_assessed') {
      throw new Error(
        'A whole-control r2 call (no dimension) only accepts status "not_applicable" (to mark the whole control not applicable) or "not_assessed" (to reverse that)'
      );
    }
    const now = new Date().toISOString();
    control.assessment.status = storedStatus === 'not_applicable' ? 'not_applicable' : null;
    for (const dim of R2_DIMENSIONS) {
      control.assessment.maturity[dim] = {
        status: storedStatus,
        justification: null,
        inProgress: { currentState: null, estimatedCloseness: null },
        assessedAt: now,
      };
    }
    fs.writeFileSync(stateJsonPath, JSON.stringify(state, null, 2) + '\n');
    return control.assessment;
  }

  if (!R2_DIMENSIONS.includes(dimension)) {
    throw new Error(`Invalid dimension "${dimension}" -- expected one of: ${R2_DIMENSIONS.join(', ')}`);
  }
  if (storedStatus === 'not_applicable') {
    throw new Error('Per-dimension not_applicable is not supported for r2 -- use a whole-control call (omit dimension) instead');
  }
  if (control.assessment.status === 'not_applicable') {
    throw new Error('This control is marked whole-control not_applicable -- reverse it first (call with no dimension and status "not_assessed")');
  }
  if (dimension === 'managed' && storedStatus === 'met' && control.assessment.maturity.measured.status !== 'met') {
    throw new Error('"managed" cannot be marked "met" until "measured" is "met" -- HITRUST\'s PRISMA model never scores Managed higher than Measured');
  }

  const dim = control.assessment.maturity[dimension];
  dim.status = storedStatus;
  dim.justification = isBlank(justification) ? null : String(justification).trim();
  if (storedStatus === 'in_progress') {
    dim.inProgress = { currentState: String(currentState).trim(), estimatedCloseness: String(estimatedCloseness).trim() };
  } else {
    dim.inProgress = { currentState: null, estimatedCloseness: null };
  }
  dim.assessedAt = new Date().toISOString();

  fs.writeFileSync(stateJsonPath, JSON.stringify(state, null, 2) + '\n');
  return control.assessment;
}

// Mechanical backstop for the two hard interview rules. Throws (making NO changes to the file)
// before any read/write happens if:
//   - status === "met" and justification is missing/empty/whitespace-only
//   - status === "in_progress" and either currentState or estimatedCloseness is missing/blank
// On success, always stamps the relevant assessedAt (the control's own for e1/i1, or the targeted
// dimension's for r2), regardless of status (including "defer").
// `certKey` is required -- this function is certification-agnostic and has no default to guess.
function applyAssessment(stateJsonPath, certKey, tierKey, controlId, payload) {
  if (!certKey) throw new Error('applyAssessment: certKey is required (e.g. "hitrust")');

  const { status, justification, currentState, estimatedCloseness } = payload || {};
  validatePayloadShape(status, justification, currentState, estimatedCloseness);

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const tier = state?.certifications?.[certKey]?.tiers?.[tierKey];
  const control = tier && tier.controls && tier.controls[controlId];
  if (!control) {
    throw new Error(`Control "${controlId}" not found in ${certKey}/${tierKey} -- register the tier first.`);
  }

  if (tierKey === 'r2') {
    return applyR2Assessment(control, stateJsonPath, state, payload || {});
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

// Same grouping-key fallback used by register-tier.js's computeDomains() and
// render-dashboard.js's computeRollups() -- keep all three identical, or a category passed here
// (taken from session.domainsRemaining, which computeDomains built) won't match any control.
function categoryKeyFor(c) {
  return (c && (c.domainKey || c.legacyCategoryPrefix || c.domain)) || 'unknown';
}

// A control counts as "touched" for domain-completion purposes once its Implemented dimension (r2)
// or its single flat status (e1/i1) has been assessed, or the whole control is marked
// not_applicable. Deepening r2's other 4 dimensions is opt-in progress that never blocks a domain
// from completing -- see the r2 maturity architecture design spec.
function isControlTouched(control, isR2) {
  if (isR2) {
    if (control.assessment && control.assessment.status === 'not_applicable') return true;
    const impl = control.assessment && control.assessment.maturity && control.assessment.maturity.implemented;
    return !!(impl && impl.assessedAt !== null && impl.assessedAt !== undefined);
  }
  return !!(control.assessment && control.assessment.assessedAt !== null && control.assessment.assessedAt !== undefined);
}

// Throws if any control in `categoryKey` still has assessedAt === null (something was
// missed between the interview Q&A and the apply step -- a hard stop, not a silent skip). On
// success, moves the category from domainsRemaining to domainsCompleted for the matching
// <certKey>/<tierKey> interviewSessions entry, updates lastUpdatedAt, and flips status to
// "completed" once domainsRemaining is empty. Despite the parameter name (kept for backward
// compatibility), this is whatever key computeDomains() produced -- usually a modern domainKey
// ("01".."19"), not literally always a legacy category prefix.
function markCategoryComplete(stateJsonPath, certKey, tierKey, legacyCategoryPrefix) {
  if (!certKey) throw new Error('markCategoryComplete: certKey is required (e.g. "hitrust")');

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const tier = state?.certifications?.[certKey]?.tiers?.[tierKey];
  if (!tier || !tier.controls) {
    throw new Error(`Tier ${certKey}/${tierKey} not found in state.json`);
  }

  const isR2 = tierKey === 'r2';
  const controlsInCategory = Object.values(tier.controls).filter(
    (c) => categoryKeyFor(c) === legacyCategoryPrefix
  );
  if (controlsInCategory.length === 0) {
    throw new Error(`No controls found for category "${legacyCategoryPrefix}" in ${certKey}/${tierKey}`);
  }
  const untouched = controlsInCategory.filter((c) => !isControlTouched(c, isR2));
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

- [ ] **Step 4: Run the full file to confirm all tests pass**

Run: `node --test plugins/ciso/skills/hitrust/lib/test/apply-assessment.test.js`
Expected: PASS, including every pre-existing test (e1/i1 behavior byte-identical) and the 6 new r2 tests.

- [ ] **Step 5: Run the rest of the suite to check for regressions**

Run: `node --test $(find plugins/ciso -name '*.test.js')`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugins/ciso/skills/hitrust/lib/apply-assessment.js plugins/ciso/skills/hitrust/lib/test/apply-assessment.test.js
git commit -m "feat(ciso): add r2 per-dimension assessment writes with Managed/Measured validation"
```

---

### Task 4: `reconcile-state-version.js` — r2-aware `buildDefaultControl`

**Files:**
- Modify: `plugins/ciso/skills/hitrust/lib/versioning/reconcile-state-version.js`
- Test: `plugins/ciso/skills/hitrust/lib/versioning/test/reconcile-state-version.test.js`

**Interfaces:**
- Consumes: nothing new from other tasks (this file already deliberately duplicates its own default-shape logic rather than importing `register-tier.js`).
- Produces: `buildDefaultControl(entry, tierKey)` — second parameter is new; `tierKey === 'r2'` seeds the maturity shape, matching Task 2's `defaultControl`.

- [ ] **Step 1: Write the failing tests**

Append to `plugins/ciso/skills/hitrust/lib/versioning/test/reconcile-state-version.test.js`:

```javascript
function seededR2Control(entry, maturityOverrides) {
  const maturity = {};
  for (const dim of ['policy', 'procedure', 'implemented', 'measured', 'managed']) {
    maturity[dim] = (maturityOverrides && maturityOverrides[dim]) || {
      status: 'not_assessed', justification: null,
      inProgress: { currentState: null, estimatedCloseness: null }, assessedAt: null,
    };
  }
  return {
    ...entry,
    statementText: null,
    statementSource: 'public-topic-level',
    assessment: { status: null, maturity },
    roadmap: { budgetTier: null, vendorResearch: [], recommendation: null, status: 'not_started' },
  };
}

function r2Entry(overrides) {
  return Object.assign(
    {
      id: 'r2-01-01', domain: 'Information Protection Program', domainKey: '01',
      topicLabel: 'x', topicSummary: 'y', citations: ['https://example.com'],
      applicabilityTier: 'universal', nonAuthoritative: true,
    },
    overrides
  );
}

test('reconcileStateVersion: an added r2 control is seeded with the not_assessed maturity shape', () => {
  const stateJsonPath = makeTempState({
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
            controls: { 'r2-01-01': seededR2Control(r2Entry()) },
            archivedControls: {},
          },
        },
      },
    },
    interviewSessions: [],
  });

  const newStructure = {
    tier: 'r2',
    controlSetVersion: 'v99.0.0-test',
    controls: [
      r2Entry(),
      r2Entry({ id: 'r2-01-02', topicLabel: 'new topic', applicabilityTier: 'conditional', conditionalOn: 'applies if X' }),
    ],
  };

  reconcileStateVersion(stateJsonPath, 'hitrust', 'r2', newStructure);

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const added = state.certifications.hitrust.tiers.r2.controls['r2-01-02'];
  assert.ok(added, 'r2-01-02 should have been added');
  assert.equal(added.assessment.status, null);
  assert.equal(added.assessment.maturity.implemented.status, 'not_assessed');
  assert.equal(added.assessment.maturity.managed.assessedAt, null);
});

test('reconcileStateVersion: a removed r2 control is archived with its maturity data intact', () => {
  const stateJsonPath = makeTempState({
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
            controls: {
              'r2-01-01': seededR2Control(r2Entry(), {
                implemented: {
                  status: 'met', justification: 'Done.',
                  inProgress: { currentState: null, estimatedCloseness: null },
                  assessedAt: '2026-01-01T00:00:00.000Z',
                },
              }),
            },
            archivedControls: {},
          },
        },
      },
    },
    interviewSessions: [],
  });

  const newStructure = { tier: 'r2', controlSetVersion: 'v99.0.0-test', controls: [] };
  reconcileStateVersion(stateJsonPath, 'hitrust', 'r2', newStructure);

  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  assert.equal(state.certifications.hitrust.tiers.r2.controls['r2-01-01'], undefined);
  const archived = state.certifications.hitrust.tiers.r2.archivedControls['r2-01-01'];
  assert.ok(archived, 'r2-01-01 should be archived');
  assert.equal(archived.assessment.maturity.implemented.status, 'met');
  assert.equal(archived.assessment.maturity.implemented.justification, 'Done.');
});
```

- [ ] **Step 2: Run to confirm the new tests fail**

Run: `node --test plugins/ciso/skills/hitrust/lib/versioning/test/reconcile-state-version.test.js`
Expected: FAIL — `buildDefaultControl` currently always produces the flat shape regardless of tier.

- [ ] **Step 3: Implement the tier-aware `buildDefaultControl`**

In `plugins/ciso/skills/hitrust/lib/versioning/reconcile-state-version.js`, add near the top (after the `STATE_ONLY_FIELDS` constant, before `toStructuralEntry`):

```javascript
// r2's five PRISMA maturity dimensions. Duplicated locally, per this file's own established
// precedent of re-implementing register-tier.js's default shape independently (see the comment
// on buildDefaultControl below).
const R2_DIMENSIONS = ['policy', 'procedure', 'implemented', 'measured', 'managed'];
```

Then replace the existing `buildDefaultControl` function with:

```javascript
// Small local re-implementation of register-tier.js's defaultControl() default shape. Duplicated
// intentionally (rather than imported) so this file's module boundary stays independent of
// register-tier.js. Structural fields are copied opaquely from `entry` -- whatever shape the
// tier's structure file uses (e1's relatedControlCode/relatedControlName/legacyCategoryPrefix, or
// i1/r2's topicLabel/topicSummary/domain/citations/nonAuthoritative) -- rather than naming them
// individually, since this script must not assume e1's exact field names. `tierKey === 'r2'`
// seeds the 5-dimension maturity object instead of a flat status, matching register-tier.js.
function buildDefaultControl(entry, tierKey) {
  const assessment = tierKey === 'r2'
    ? {
        status: null,
        maturity: R2_DIMENSIONS.reduce((acc, dim) => {
          acc[dim] = {
            status: 'not_assessed',
            justification: null,
            inProgress: { currentState: null, estimatedCloseness: null },
            assessedAt: null,
          };
          return acc;
        }, {}),
      }
    : {
        status: 'not_assessed',
        justification: null,
        inProgress: { currentState: null, estimatedCloseness: null },
        assessedAt: null,
      };

  return {
    ...entry,
    statementText: null,
    statementSource: 'structural-only',
    assessment,
    roadmap: {
      budgetTier: null,
      vendorResearch: [],
      recommendation: null,
      status: 'not_started',
    },
  };
}
```

Then update the one call site (inside the `added` loop, currently `tier.controls[id] = buildDefaultControl(newById.get(id));`) to:

```javascript
    tier.controls[id] = buildDefaultControl(newById.get(id), tierKey);
```

- [ ] **Step 4: Run the full file to confirm all tests pass**

Run: `node --test plugins/ciso/skills/hitrust/lib/versioning/test/reconcile-state-version.test.js`
Expected: PASS, all pre-existing tests plus the 2 new r2 tests.

- [ ] **Step 5: Run the rest of the suite to check for regressions**

Run: `node --test $(find plugins/ciso -name '*.test.js')`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugins/ciso/skills/hitrust/lib/versioning/reconcile-state-version.js plugins/ciso/skills/hitrust/lib/versioning/test/reconcile-state-version.test.js
git commit -m "feat(ciso): seed r2 maturity shape for added controls in reconcile-state-version.js"
```

---

### Task 5: `render-dashboard.js` — Implemented-only rollups + maturity depth gauge

**Files:**
- Modify: `plugins/ciso/skills/_shared/render-dashboard.js`
- Test: `plugins/ciso/skills/_shared/test/render-dashboard.test.js`

**Interfaces:**
- Produces: `computeRollups(state)`'s per-tier and per-domain objects now include `maturityDepthPercent: number | null` (null for any group with no r2-shaped controls). `compliancePercent`/`assessedPercent`/`byStatus` for r2 groups are computed from the `implemented` dimension, exactly as e1/i1 compute them from their flat status — so all three tiers stay comparable.

- [ ] **Step 1: Write the failing tests**

Append to `plugins/ciso/skills/_shared/test/render-dashboard.test.js`:

```javascript
function makeR2Control(overrides) {
  const notAssessed = () => ({
    status: 'not_assessed', justification: null,
    inProgress: { currentState: null, estimatedCloseness: null }, assessedAt: null,
  });
  return Object.assign(
    {
      id: 'r2-01-01', domain: 'Information Protection Program', domainKey: '01',
      topicLabel: 'x', topicSummary: 'y', citations: ['https://example.com'],
      applicabilityTier: 'universal', nonAuthoritative: true,
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

test('computeRollups: r2 controls compute compliance/assessed from the Implemented dimension only, plus a maturityDepthPercent gauge', () => {
  const state = {
    certifications: {
      hitrust: {
        displayName: 'HITRUST CSF',
        activeTier: 'r2',
        tiers: {
          r2: {
            controlSetVersion: 'v11.8',
            sourceAuthority: 'public-topic-level',
            controls: {
              c0: makeR2Control({
                id: 'c0',
                assessment: {
                  status: null,
                  maturity: {
                    policy: { status: 'met', justification: 'ok', inProgress: { currentState: null, estimatedCloseness: null }, assessedAt: '2020-01-01T00:00:00.000Z' },
                    procedure: { status: 'not_assessed', justification: null, inProgress: { currentState: null, estimatedCloseness: null }, assessedAt: null },
                    implemented: { status: 'met', justification: 'ok', inProgress: { currentState: null, estimatedCloseness: null }, assessedAt: '2020-01-01T00:00:00.000Z' },
                    measured: { status: 'not_assessed', justification: null, inProgress: { currentState: null, estimatedCloseness: null }, assessedAt: null },
                    managed: { status: 'not_assessed', justification: null, inProgress: { currentState: null, estimatedCloseness: null }, assessedAt: null },
                  },
                },
              }),
              c1: makeR2Control({ id: 'c1' }),
            },
            archivedControls: {},
          },
        },
      },
    },
  };

  const rollups = computeRollups(state);
  const tier = rollups.hitrust.r2;

  assert.equal(tier.total, 2);
  assert.equal(tier.byStatus.met, 1, 'compliance counts only the Implemented dimension');
  assert.equal(tier.compliancePercent, 50);
  assert.equal(tier.assessedPercent, 50);
  // c0 has 2 of 5 dimensions assessed (policy, implemented); c1 has 0 of 5 -- (2+0)/(2*5) = 20%.
  assert.equal(tier.maturityDepthPercent, 20);
});

test('computeRollups: maturityDepthPercent is null for e1/i1 tiers (no maturity shape)', () => {
  const state = baseState({ c0: makeControl({ id: 'c0' }) });
  const rollups = computeRollups(state);
  assert.equal(rollups.hitrust.e1.maturityDepthPercent, null);
});
```

- [ ] **Step 2: Run to confirm the new tests fail**

Run: `node --test plugins/ciso/skills/_shared/test/render-dashboard.test.js`
Expected: FAIL — `computeRollups` currently reads `control.assessment.status` directly (`undefined` for r2's `null` top-level status), so `byStatus.met`/`compliancePercent` would be wrong, and `maturityDepthPercent` doesn't exist yet.

- [ ] **Step 3: Implement the effective-status helpers and maturity depth**

In `plugins/ciso/skills/_shared/render-dashboard.js`, after the `STATUSES` constant (currently line 23), add:

```javascript
// r2's five PRISMA maturity dimensions. Duplicated locally per this codebase's established
// cross-file-independence precedent (see reconcile-state-version.js).
const MATURITY_DIMENSIONS = ['policy', 'procedure', 'implemented', 'measured', 'managed'];
```

Then, just before `function summarizeControls(controls) {`, add:

```javascript
// r2 controls carry assessment.maturity instead of a flat assessment.status. For rollup purposes
// (gauges, byStatus counts), the "effective" status/assessedAt is always the Implemented
// dimension -- the one dimension e1/i1 also solely measure -- so e1/i1/r2 domain gauges stay
// directly comparable. See docs/superpowers/specs/2026-07-19-ciso-r2-maturity-architecture-design.md.
function effectiveStatus(assessment) {
  if (assessment && assessment.maturity) {
    return (assessment.maturity.implemented && assessment.maturity.implemented.status) || 'not_assessed';
  }
  return (assessment && assessment.status) || null;
}
function effectiveAssessedAt(assessment) {
  if (assessment && assessment.maturity) {
    return assessment.maturity.implemented && assessment.maturity.implemented.assessedAt;
  }
  return assessment && assessment.assessedAt;
}
```

Then replace the body of `summarizeControls` (currently lines 39-67) with:

```javascript
function summarizeControls(controls) {
  const byStatus = emptyStatusCounts();
  let total = 0;
  let assessedCount = 0;
  let maturityControlCount = 0;
  let maturityAssessedDimensions = 0;

  for (const control of controls) {
    total += 1;
    const assessment = control && control.assessment;

    const status = effectiveStatus(assessment);
    if (status && Object.prototype.hasOwnProperty.call(byStatus, status)) {
      byStatus[status] += 1;
    }
    const assessedAt = effectiveAssessedAt(assessment);
    if (assessedAt != null) {
      assessedCount += 1;
    }

    if (assessment && assessment.maturity) {
      maturityControlCount += 1;
      for (const dim of MATURITY_DIMENSIONS) {
        const dimStatus = assessment.maturity[dim] && assessment.maturity[dim].status;
        if (dimStatus && dimStatus !== 'not_assessed') maturityAssessedDimensions += 1;
      }
    }
  }

  const applicableTotal = total - byStatus.not_applicable;
  const compliancePercent = applicableTotal === 0
    ? 0
    : Math.round((100 * byStatus.met) / applicableTotal);
  // Deliberately divides by `total` (not `applicableTotal`) -- "assessed" measures
  // interview progress, which is a different question from "compliant".
  const assessedPercent = total === 0
    ? 0
    : Math.round((100 * assessedCount) / total);
  // Only meaningful for r2-shaped groups (controls carrying assessment.maturity); null for e1/i1,
  // which have no per-dimension maturity to measure depth of.
  const maturityDepthPercent = maturityControlCount === 0
    ? null
    : Math.round((100 * maturityAssessedDimensions) / (maturityControlCount * MATURITY_DIMENSIONS.length));

  return { total, byStatus, applicableTotal, compliancePercent, assessedPercent, maturityDepthPercent };
}
```

- [ ] **Step 4: Run the full file to confirm all tests pass**

Run: `node --test plugins/ciso/skills/_shared/test/render-dashboard.test.js`
Expected: PASS, all pre-existing tests plus the 2 new ones.

- [ ] **Step 5: Run the rest of the suite to check for regressions**

Run: `node --test $(find plugins/ciso -name '*.test.js')`
Expected: PASS. In particular, `dashboard-template.test.js`'s tests still pass since they don't yet exercise r2 (Task 6 adds that).

- [ ] **Step 6: Commit**

```bash
git add plugins/ciso/skills/_shared/render-dashboard.js plugins/ciso/skills/_shared/test/render-dashboard.test.js
git commit -m "feat(ciso): compute r2 maturity-depth gauge and Implemented-only rollups"
```

---

### Task 6: `dashboard-template.html` — maturity badge, disclosure, and depth gauge

**Files:**
- Modify: `plugins/ciso/assets/dashboard-template.html`
- Test: `plugins/ciso/skills/_shared/test/dashboard-template.test.js`

**Interfaces:**
- Consumes: `rollup.maturityDepthPercent` from Task 5 (already present on every rollup object passed into `CISO_DATA`).
- Produces: `renderControlRow(control)` now renders a `N / 5 maturity dims` badge + expandable breakdown for any control whose `assessment.maturity` is present; `renderOverviewCard(...)` shows a new "Maturity depth" gauge when `rollupSafe.maturityDepthPercent != null`.

- [ ] **Step 1: Write the failing tests**

Append to `plugins/ciso/skills/_shared/test/dashboard-template.test.js`:

```javascript
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

test('the overview card shows a Maturity depth gauge for r2 but not for e1', () => {
  const r2State = baseR2State({ c1: makeR2Control() });
  const { overviewHtml: r2Overview } = renderClientSide(r2State);
  assert.ok(r2Overview.includes('Maturity depth'), 'r2 overview card must show the maturity depth gauge');

  const e1State = baseState({ c1: makeControl({ id: 'c1' }) });
  const { overviewHtml: e1Overview } = renderClientSide(e1State);
  assert.ok(!e1Overview.includes('Maturity depth'), 'e1 overview card must not show the maturity depth gauge');
});
```

- [ ] **Step 2: Run to confirm the new tests fail**

Run: `node --test plugins/ciso/skills/_shared/test/dashboard-template.test.js`
Expected: FAIL — the template doesn't render a maturity badge or depth gauge yet, and `renderControlRow` reading `assessment.status` directly on an r2 control (whose top-level status is `null`) would show "Not assessed" instead of the Implemented dimension's real status.

- [ ] **Step 3: Add the CSS**

In `plugins/ciso/assets/dashboard-template.html`, insert after the `.no-matches` rule (currently line 316, just before `::selection`):

```css
  .maturity-block { margin-top: 4px; }
  .maturity-block summary {
    cursor: pointer; list-style: none; display: flex; align-items: center; gap: 6px;
  }
  .maturity-block summary::-webkit-details-marker { display: none; }
  .maturity-detail {
    display: flex; flex-direction: column; gap: 4px; margin-top: 8px; padding-top: 8px;
    border-top: 1px dotted var(--line-bright);
  }
```

- [ ] **Step 4: Add the rendering helpers and wire them into `renderControlRow`/`renderOverviewCard`**

Insert immediately before `function renderControlRow(control) {` (currently line 495):

```javascript
  // r2's five PRISMA maturity dimensions. Duplicated locally, mirroring this project's
  // established cross-file-independence convention (see reconcile-state-version.js).
  const MATURITY_DIMENSIONS = ['policy', 'procedure', 'implemented', 'measured', 'managed'];
  const MATURITY_LABELS = {
    policy: 'Policy', procedure: 'Procedure', implemented: 'Implemented', measured: 'Measured', managed: 'Managed'
  };

  // r2 controls carry assessment.maturity (5 independently-assessed dimensions) instead of e1/i1's
  // flat assessment.status/justification/inProgress/assessedAt. Every place this template shows
  // "the" current assessment of a control (status tag, justification, in-progress detail,
  // assessed-at stamp) uses r2's Implemented dimension -- the same one e1/i1 solely measure -- so
  // the primary control-row view reads identically across all three tiers. The full 5-dimension
  // breakdown is rendered separately, below, only for r2 controls.
  function effectiveAssessment(control) {
    const assessment = control.assessment || {};
    if (assessment.maturity) {
      const impl = assessment.maturity.implemented || {};
      return {
        status: impl.status || 'not_assessed',
        justification: impl.justification || null,
        inProgress: impl.inProgress || { currentState: null, estimatedCloseness: null },
        assessedAt: impl.assessedAt || null,
      };
    }
    return {
      status: assessment.status || 'not_assessed',
      justification: assessment.justification || null,
      inProgress: assessment.inProgress || { currentState: null, estimatedCloseness: null },
      assessedAt: assessment.assessedAt || null,
    };
  }

  // Renders the "N / 5 maturity dims" badge + expandable full breakdown for an r2 control. Only
  // called when control.assessment.maturity exists.
  function renderMaturityBreakdown(maturity) {
    const assessedCount = MATURITY_DIMENSIONS.filter(function (dim) {
      return maturity[dim] && maturity[dim].status !== 'not_assessed';
    }).length;

    let html = '<div class="maturity-block"><details><summary>';
    html += '<span class="disclosure">&#9656;</span>';
    html += '<span class="tag gold mono">' + assessedCount + ' / ' + MATURITY_DIMENSIONS.length + ' maturity dims</span>';
    html += '</summary><div class="maturity-detail">';
    for (const dim of MATURITY_DIMENSIONS) {
      const d = maturity[dim] || { status: 'not_assessed' };
      html += '<div class="roadmap-row"><span class="roadmap-label">' + esc(MATURITY_LABELS[dim]) + '</span>' + statusTag(d.status) + '</div>';
      if (d.justification) {
        html += '<div class="roadmap-row"><span class="roadmap-label"></span><span>' + esc(d.justification) + '</span></div>';
      }
      if (d.status === 'in_progress' && d.inProgress) {
        const ip = d.inProgress;
        html += '<div class="roadmap-row"><span class="roadmap-label"></span><span>' +
          (ip.currentState ? esc(ip.currentState) : '<span class="placeholder">Not recorded</span>') + ' &mdash; ' +
          (ip.estimatedCloseness ? esc(ip.estimatedCloseness) : '<span class="placeholder">Not recorded</span>') + '</span></div>';
      }
    }
    html += '</div></details></div>';
    return html;
  }

```

Then, inside `renderControlRow`, replace the first line (`const assessment = control.assessment || {};`) with:

```javascript
    const assessment = effectiveAssessment(control);
```

And replace the next line (`const status = assessment.status || 'not_assessed';`) with:

```javascript
    const status = assessment.status;
```

(The rest of `renderControlRow`'s body is unchanged — it already reads `assessment.justification`, `assessment.inProgress`, `assessment.assessedAt`, all now correctly sourced via the helper.)

Then, immediately before `html += renderRoadmap(control.roadmap);` (near the end of `renderControlRow`), insert:

```javascript
    if (control.assessment && control.assessment.maturity) {
      html += renderMaturityBreakdown(control.assessment.maturity);
    }
```

Finally, in `renderOverviewCard`, change the `rollupSafe` fallback (currently `const rollupSafe = rollup || { compliancePercent: 0, assessedPercent: 0, byDomain: {} };`) to:

```javascript
    const rollupSafe = rollup || { compliancePercent: 0, assessedPercent: 0, maturityDepthPercent: null, byDomain: {} };
```

And immediately after the "Assessed" gauge block (currently ending `'<div class="gauge-track"><div class="gauge-fill assessed" style="width:' + rollupSafe.assessedPercent + '%"></div></div></div>';`), insert:

```javascript
    if (rollupSafe.maturityDepthPercent != null) {
      html += '<div class="gauge"><div class="gauge-label"><span>Maturity depth</span><b>' + rollupSafe.maturityDepthPercent + '%</b></div>';
      html += '<div class="gauge-track"><div class="gauge-fill assessed" style="width:' + rollupSafe.maturityDepthPercent + '%"></div></div></div>';
    }
```

- [ ] **Step 5: Run the full file to confirm all tests pass**

Run: `node --test plugins/ciso/skills/_shared/test/dashboard-template.test.js`
Expected: PASS, all pre-existing tests (including the commit-3c238d8 regression test) plus the 3 new r2 tests.

- [ ] **Step 6: Run the rest of the suite to check for regressions**

Run: `node --test $(find plugins/ciso -name '*.test.js')`
Expected: PASS.

- [ ] **Step 7: Browser smoke-test**

Register r2 and a couple of assessed controls in a scratch project's `state.json` (or reuse `plugins/ciso/skills/_shared/test/dashboard-template.test.js`'s fixtures as a guide), run `node plugins/ciso/skills/_shared/render-dashboard.js <scratch-dir>`, open the resulting `dashboard.html` in the Browser tool, and confirm: the r2 card shows a "Maturity depth" gauge, a control row shows the "N / 5 maturity dims" badge, and clicking it expands to show all 5 dimensions with correct status tags.

- [ ] **Step 8: Commit**

```bash
git add plugins/ciso/assets/dashboard-template.html plugins/ciso/skills/_shared/test/dashboard-template.test.js
git commit -m "feat(ciso): render r2 maturity-dimension badge, disclosure, and depth gauge in the dashboard"
```

---

### Task 7: `hitrust/SKILL.md` — document the r2 interview flow

**Files:**
- Modify: `plugins/ciso/skills/hitrust/SKILL.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Update Interview step 6's payload description**

In `plugins/ciso/skills/hitrust/SKILL.md`, in the `## (c) Interview` section's Part 2 step 6, replace the paragraph starting "where `<jsonPayload>` is..." with:

```markdown
   where `<jsonPayload>` is `{"status": "...", "justification": "...", "currentState": "...", "estimatedCloseness": "..."}` (only the fields relevant to the status need be non-null). For **r2 only**, `<jsonPayload>` also includes `"dimension": "implemented"` for this default pass -- see [r2: maturity dimensions](#r2-maturity-dimensions-implemented-first-by-default) below; e1/i1 payloads never include a `dimension` field. This is the mechanical backstop, not just prose: it throws and makes **no** changes to the file if `status` is `"met"` without a justification, or `"in_progress"` without both `currentState` and `estimatedCloseness` -- so a rule "known" only in this document can't be silently skipped. It always stamps the relevant `assessedAt` (the control's own for e1/i1, or the targeted dimension's for r2), including for a deferred control (stored as `not_assessed`, same as an untouched one, but `assessedAt` is what distinguishes "asked but deferred" from "never touched").
```

- [ ] **Step 2: Add the new r2 subsection**

Insert a new subsection immediately after `### Known limitation (accepted, not a bug)`'s paragraph and before `## (d) Roadmap`:

```markdown
### r2: maturity dimensions (Implemented-first by default)

r2 is the only tier that scores five PRISMA maturity dimensions per control (Policy, Procedure, Implemented, Measured, Managed) instead of one flat status -- see `docs/superpowers/specs/2026-07-19-ciso-r2-maturity-architecture-design.md`. To keep the default interview exactly as cheap as e1/i1 (one question per control), Part 1 step 4 and Part 2 step 6 above target **only the `implemented` dimension** by default for r2 -- every `apply-assessment.js` call in the default r2 interview pass includes `"dimension": "implemented"` in its payload. The other four dimensions (`policy`, `procedure`, `measured`, `managed`) are left `not_assessed` unless the user explicitly asks to deepen a control.

**Deepening a control (optional, any time):** if the user wants to go beyond Implemented for a specific r2 control or domain, repeat Part 1's plan-mode Q&A loop for that control, once per remaining dimension, then commit each with the same `apply-assessment.js` call shape but `"dimension"` set to the dimension just answered (e.g. `"dimension": "policy"`). A **hard validation** applies: `managed` can never be marked `"met"` until `measured` is already `"met"` on that control (HITRUST's own PRISMA rule -- Managed can't outscore Measured) -- `apply-assessment.js` throws if this is attempted, so ask about `measured` before `managed` when deepening.

**Whole-control not applicable:** omit `dimension` entirely and pass `{"status": "not_applicable"}` to mark a control not applicable across all five dimensions at once (this is the only whole-control call r2 supports). To reverse it, call again with no `dimension` and `{"status": "not_assessed"}`.

**Domain completion is Implemented-only:** step 9's group-completion call only requires every control's `implemented` dimension (or whole-control not_applicable) to be resolved -- deepening the other four dimensions is optional progress that never blocks a domain from completing.
```

- [ ] **Step 3: Proofread**

Re-read the full `## (c) Interview` section top to bottom to confirm the new subsection's terminology (`dimension`, sub-batch wording, step numbering) is consistent with the rest of the section and doesn't contradict Parts 1/2's existing e1/i1-focused instructions.

- [ ] **Step 4: Commit**

```bash
git add plugins/ciso/skills/hitrust/SKILL.md
git commit -m "docs(ciso): document r2's Implemented-first interview default and deepening flow"
```

---

## Final Verification (after all 7 tasks)

1. Run the full suite once more: `node --test $(find plugins/ciso -name '*.test.js')` — expect 100% pass, zero regressions in e1/i1 behavior.
2. `git diff --stat` against the commit before Task 1 confirms `e1.v11.8.structure.json` and `i1.v11.8.structure.json` are untouched.
3. Grep `plugins/ciso/` for any organization-specific or PII string — expected clean, since this pass introduces no organization-specific content.
4. Manual: register r2 in a scratch project (`node register-tier.js <dir> hitrust "HITRUST CSF" r2`), run the interview for 2-3 controls via `apply-assessment.js` with `"dimension": "implemented"`, then deepen one control across all 5 dimensions including a deliberate Managed-before-Measured attempt to confirm the validation error. Regenerate and open the dashboard to confirm everything renders as expected.

## Execution Handoff

Once this plan is approved, two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.
