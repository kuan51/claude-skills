# Data Analysis Review Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `data-analysis-review` Claude Code plugin: a skill that independently, empirically reviews a data science project (blind EDA -> cross-role reconciliation -> comparison against the project's own conclusions) without ever modifying the project.

**Architecture:** A `SKILL.md` drives an interactive plan-mode gating flow (thesis confirmation, skill/reviewer-roster selection, save preference), then hands off to a `Workflow`-tool-orchestrated analysis engine (`workflow.js`) that runs 7 custom, tool-restricted subagent types (`agents/*.md`) through parallel-EDA -> reconcile-barrier -> parallel-cross-compare, plus a small Node library (`lib/`) that does deterministic domain-signal detection and report assembly.

**Tech Stack:** Markdown (SKILL.md, agent definitions), plain JavaScript / Node.js built-ins only (no new dependencies — Node v24.13.0 confirmed available), the `Workflow` tool's JS DSL for the analysis engine script.

Reference spec: `docs/superpowers/specs/2026-07-17-data-analysis-review-skill-design.md`.

## Global Constraints

- No new npm dependencies. Use Node's built-in test runner (`node:test`) and `node:assert/strict` only.
- All 7 custom agent types in `agents/*.md` declare `tools: Read, Grep, Glob, Bash` — never `Write`, `Edit`, or `Agent`.
- The skill never modifies any file in the project it reviews. Its only possible write action is one optional report file at a user-confirmed path (default `docs/data-analysis-review/<YYYY-MM-DD>-review.md`).
- No automatic git commit of the generated report.
- Report verdicts are qualitative (verdict label + evidence) — never numeric scores.
- Independent-EDA agents are never given the project's own conclusion-artifact paths (blindness by omission).

---

### Task 1: Plugin scaffold

**Files:**
- Create: `.claude-plugin/plugin.json`

**Interfaces:**
- Produces: the plugin's identity (`name: data-analysis-review`) that later tasks' files live under.

- [ ] **Step 1: Create the plugin manifest**

Create `.claude-plugin/plugin.json`:
```json
{
  "name": "data-analysis-review",
  "description": "Empirical, objective review of a data science project: independently re-derives findings from raw data and code, then checks whether the project's own stated conclusions hold up. Never modifies the reviewed project.",
  "author": {
    "name": "claude-skills"
  }
}
```

- [ ] **Step 2: Verify it's valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json', 'utf8')); console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add .claude-plugin/plugin.json
git commit -m "feat: scaffold data-analysis-review plugin manifest"
```

---

### Task 2: Domain-signal detection (`lib/domain-signals.js`)

**Files:**
- Create: `skills/data-analysis-review/lib/domain-signals.js`
- Test: `skills/data-analysis-review/test/domain-signals.test.js`

**Interfaces:**
- Produces: `detectDomainSignals(text: string) -> Array<{key: string, label: string, matchedKeyword: string}>`, and the `DOMAIN_SIGNALS` map (keys: `clinical`, `financial`, `fairness`, `time_series`, `causal`). `SKILL.md` (Task 6) calls this via its CLI wrapper; `references/extra-roles.md` (Task 6) keys its personas by these same 5 signal keys.

- [ ] **Step 1: Write the failing tests**

Create `skills/data-analysis-review/test/domain-signals.test.js`:
```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test skills/data-analysis-review/test/domain-signals.test.js`
Expected: FAIL with `Cannot find module '../lib/domain-signals.js'`

- [ ] **Step 3: Write the implementation**

Create `skills/data-analysis-review/lib/domain-signals.js`:
```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test skills/data-analysis-review/test/domain-signals.test.js`
Expected: PASS (4 tests, 0 failures)

- [ ] **Step 5: Commit**

```bash
git add skills/data-analysis-review/lib/domain-signals.js skills/data-analysis-review/test/domain-signals.test.js
git commit -m "feat: add domain-signal detection for optional reviewer extras"
```

---

### Task 3: Report template + report builder (`lib/report-builder.js`)

**Files:**
- Create: `skills/data-analysis-review/references/report-template.md`
- Create: `skills/data-analysis-review/lib/report-builder.js`
- Test: `skills/data-analysis-review/test/report-builder.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `buildReport(templateText: string, data: object) -> string`. `SKILL.md` (Task 6) calls this via its CLI wrapper (`node report-builder.js <template> <data.json>`) with `data` shaped as `{ projectName, reviewDate, thesis, scope, eda, disagreements, crossCompare, verdictAccuracy, verdictCohesiveness, verdictRationale, recommendations }` — the same `eda`/`disagreements`/`crossCompare` shapes the `workflow.js` `Workflow` script (Task 5) returns.

- [ ] **Step 1: Write the report template**

Create `skills/data-analysis-review/references/report-template.md`:
```markdown
# Data Analysis Review: {{PROJECT_NAME}}

**Reviewed:** {{REVIEW_DATE}}

## Thesis & Goals

{{THESIS}}

## Scope & Method

{{SCOPE}}

## Independent Findings

{{FINDINGS}}

## Reconciliation Notes

{{DISAGREEMENTS}}

## Cross-Comparison

{{CROSS_COMPARE}}

## Overall Verdicts

### Accuracy

{{VERDICT_ACCURACY}}

### Cohesiveness

{{VERDICT_COHESIVENESS}}

### Rationale

{{VERDICT_RATIONALE}}

## Recommendations

{{RECOMMENDATIONS}}
```

- [ ] **Step 2: Write the failing tests**

Create `skills/data-analysis-review/test/report-builder.test.js`:
```js
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test skills/data-analysis-review/test/report-builder.test.js`
Expected: FAIL with `Cannot find module '../lib/report-builder.js'`

- [ ] **Step 4: Write the implementation**

Create `skills/data-analysis-review/lib/report-builder.js`:
```js
'use strict';

function renderFindings(eda) {
  if (!eda || !eda.length) return '_No independent findings recorded._';
  return eda
    .map((role) => {
      const lines = (role.findings || [])
        .map(
          (f) =>
            `- **[${f.severity}]** ${f.claim}\n  - Evidence: ${f.evidence}${
              f.required_execution ? ' (recomputed)' : ' (static review)'
            }`
        )
        .join('\n');
      return `### ${role.label || role.key}\n\n${lines || '_No findings._'}`;
    })
    .join('\n\n');
}

function renderDisagreements(disagreements) {
  if (!disagreements || !disagreements.length) return '_No cross-role disagreements found._';
  return disagreements
    .map((d) => `- **${d.topic}**: ${d.description} (roles: ${(d.roles_involved || []).join(', ')})`)
    .join('\n');
}

function renderCrossCompare(crossCompare) {
  if (!crossCompare || !crossCompare.length) return '_No cross-comparison performed._';
  return crossCompare
    .map(
      (c) =>
        `### ${c.topic} — ${c.verdict}\n\n- **Project's claim:** ${c.project_claim}\n- **Independent finding:** ${c.independent_finding}\n- **Discrepancy:** ${c.discrepancy}`
    )
    .join('\n\n');
}

function buildReport(templateText, data) {
  const replacements = {
    '{{PROJECT_NAME}}': data.projectName || 'Unnamed project',
    '{{REVIEW_DATE}}': data.reviewDate || '',
    '{{THESIS}}': data.thesis || '',
    '{{SCOPE}}': data.scope || '',
    '{{FINDINGS}}': renderFindings(data.eda),
    '{{DISAGREEMENTS}}': renderDisagreements(data.disagreements),
    '{{CROSS_COMPARE}}': renderCrossCompare(data.crossCompare),
    '{{VERDICT_ACCURACY}}': data.verdictAccuracy || '',
    '{{VERDICT_COHESIVENESS}}': data.verdictCohesiveness || '',
    '{{VERDICT_RATIONALE}}': data.verdictRationale || '',
    '{{RECOMMENDATIONS}}': data.recommendations || '_None._',
  };
  let out = templateText;
  for (const [token, value] of Object.entries(replacements)) {
    out = out.split(token).join(value);
  }
  return out;
}

module.exports = { buildReport, renderFindings, renderDisagreements, renderCrossCompare };

if (require.main === module) {
  const fs = require('fs');
  const [, , templatePath, dataPath] = process.argv;
  if (!templatePath || !dataPath) {
    console.error('Usage: node report-builder.js <template.md> <data.json>');
    process.exit(1);
  }
  const templateText = fs.readFileSync(templatePath, 'utf8');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  process.stdout.write(buildReport(templateText, data));
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test skills/data-analysis-review/test/report-builder.test.js`
Expected: PASS (3 tests, 0 failures)

- [ ] **Step 6: Commit**

```bash
git add skills/data-analysis-review/references/report-template.md skills/data-analysis-review/lib/report-builder.js skills/data-analysis-review/test/report-builder.test.js
git commit -m "feat: add report template and deterministic report builder"
```

---

### Task 4: Custom reviewer agent types (`agents/*.md`)

**Files:**
- Create: `agents/data-quality-reviewer.md`
- Create: `agents/statistical-methodologist.md`
- Create: `agents/domain-alignment-reviewer.md`
- Create: `agents/reproducibility-auditor.md`
- Create: `agents/findings-reconciler.md`
- Create: `agents/thesis-auditor.md`
- Create: `agents/extra-reviewer.md`
- Test: `test/agents-frontmatter.test.js`

**Interfaces:**
- Produces: 7 registered subagent types (`data-quality-reviewer`, `statistical-methodologist`, `domain-alignment-reviewer`, `reproducibility-auditor`, `findings-reconciler`, `thesis-auditor`, `extra-reviewer`), each with `tools: Read, Grep, Glob, Bash`. `workflow.js` (Task 5) references these exact names via its `agentType` option.

- [ ] **Step 1: Write the failing test**

Create `test/agents-frontmatter.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const AGENTS_DIR = path.join(__dirname, '..', 'agents');
const REQUIRED_TOOLS = 'Read, Grep, Glob, Bash';
const EXPECTED_NAMES = [
  'data-quality-reviewer',
  'statistical-methodologist',
  'domain-alignment-reviewer',
  'reproducibility-auditor',
  'findings-reconciler',
  'thesis-auditor',
  'extra-reviewer',
];

function parseFrontmatter(fileContents) {
  const match = fileContents.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(match, 'file must start with YAML frontmatter delimited by ---');
  const fields = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return fields;
}

test('every expected agent file exists with the restricted, read-only tool set', () => {
  for (const name of EXPECTED_NAMES) {
    const filePath = path.join(AGENTS_DIR, `${name}.md`);
    assert.ok(fs.existsSync(filePath), `missing agents/${name}.md`);
    const fields = parseFrontmatter(fs.readFileSync(filePath, 'utf8'));
    assert.equal(fields.name, name, `${name}.md frontmatter name must be "${name}"`);
    assert.ok(fields.description, `${name}.md is missing a description field`);
    assert.equal(
      fields.tools,
      REQUIRED_TOOLS,
      `${name}.md must declare tools: ${REQUIRED_TOOLS} (no Write/Edit/Agent) — found "${fields.tools}"`
    );
  }
});

test('no extra agent files exist beyond the expected roster', () => {
  const files = fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md'));
  assert.equal(
    files.length,
    EXPECTED_NAMES.length,
    `expected exactly ${EXPECTED_NAMES.length} agent files, found: ${files.join(', ')}`
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/agents-frontmatter.test.js`
Expected: FAIL — `missing agents/data-quality-reviewer.md`

- [ ] **Step 3: Create the four fixed-role agents**

Create `agents/data-quality-reviewer.md`:
```markdown
---
name: data-quality-reviewer
description: Independently audits a data science project's raw data for quality and integrity issues (missing values, duplicates, leakage, label noise, schema drift), blind to the project's own stated conclusions.
tools: Read, Grep, Glob, Bash
---

You are a data quality and integrity reviewer on an independent review team auditing a data science project. You were deliberately NOT shown the project's own conclusions or report — your job is to look only at the raw data and code you're given and form your own findings.

Check for: missing/null handling, duplicate records, train/test leakage, label noise or inconsistent labeling, schema drift between files, outliers that aren't addressed, and any sampling or collection bias visible in the raw data.

Where possible, run real queries or scripts against the data (via Bash) to verify specific counts and statistics rather than guessing from a schema alone. If you can't execute (data too large, missing runtime), say so explicitly in a finding rather than skipping the check.

Return each finding with a severity (`low`, `medium`, `high`), the specific claim, and the concrete evidence (file:line, row range, or command output) that supports it.
```

Create `agents/statistical-methodologist.md`:
```markdown
---
name: statistical-methodologist
description: Independently audits a data science project's statistical methodology — test selection, assumption checking, model validation, and metric choice — blind to the project's own stated conclusions.
tools: Read, Grep, Glob, Bash
---

You are a statistical methodologist on an independent review team auditing a data science project. You were deliberately NOT shown the project's own conclusions or report — your job is to look only at the raw data and code you're given and form your own findings.

Check for: appropriateness of the chosen statistical tests or model class for the data, whether test assumptions were verified (normality, independence, homoscedasticity, etc. as relevant), correctness of the train/validation/test split and cross-validation strategy, whether the evaluation metric matches the stated business goal, and whether reported uncertainty (confidence intervals, p-values, error bars) is computed correctly.

Where possible, re-run the actual computation (via Bash) to independently verify a reported statistic rather than trusting the code's own output. If you can't execute (data too large, missing runtime), say so explicitly in a finding rather than skipping the check.

Return each finding with a severity (`low`, `medium`, `high`), the specific claim, and the concrete evidence (file:line, or recomputed output) that supports it.
```

Create `agents/domain-alignment-reviewer.md`:
```markdown
---
name: domain-alignment-reviewer
description: Independently audits whether a data science project's approach and outputs actually serve the stated business thesis and goals, blind to the project's own stated conclusions.
tools: Read, Grep, Glob, Bash
---

You are a business/domain alignment reviewer on an independent review team auditing a data science project. You were deliberately NOT shown the project's own conclusions or report — your job is to look only at the confirmed business thesis, the raw data, and the code you're given, and form your own findings.

Check for: whether the modeling target or analysis question actually matches the stated business goal, whether the features/data used are ones the business would realistically have at decision time (not just at training time), whether the granularity of the analysis (e.g. per-customer vs. per-transaction) matches how the business would act on it, and whether any stated success criteria are actually measurable from what was built.

Return each finding with a severity (`low`, `medium`, `high`), the specific claim, and the concrete evidence (file:line, or a direct quote of the business thesis it conflicts with) that supports it.
```

Create `agents/reproducibility-auditor.md`:
```markdown
---
name: reproducibility-auditor
description: Independently audits a data science project's code and pipeline for reproducibility — determinism, dependency pinning, and whether results can actually be regenerated — blind to the project's own stated conclusions.
tools: Read, Grep, Glob, Bash
---

You are a code and reproducibility auditor on an independent review team auditing a data science project. You were deliberately NOT shown the project's own conclusions or report — your job is to look only at the raw code and data you're given and form your own findings.

Check for: unpinned or missing dependency versions, unset random seeds where randomness affects results, hard-coded absolute paths or machine-specific assumptions, notebooks whose cells were run out of order (check `execution_count`) or whose saved outputs don't match what the code would currently produce, and any manual/undocumented step required to regenerate the stated results.

Where possible, actually re-run the pipeline or a representative piece of it (via Bash) to confirm it reproduces the same output twice. If you can't execute (missing runtime, missing credentials), say so explicitly in a finding rather than skipping the check.

Return each finding with a severity (`low`, `medium`, `high`), the specific claim, and the concrete evidence (file:line, or command output showing non-determinism) that supports it.
```

- [ ] **Step 4: Create the reconciliation and cross-compare agents**

Create `agents/findings-reconciler.md`:
```markdown
---
name: findings-reconciler
description: Reconciles independent findings from multiple reviewers on the same data science project, surfacing contradictions between reviewers before any comparison to the project's own conclusions happens.
tools: Read, Grep, Glob, Bash
---

You are reconciling findings from several independent reviewers who each audited the same data science project from a different angle (data quality, statistical methodology, business alignment, reproducibility, and possibly specialized extras). None of them saw each other's work, and none of them saw the project's own stated conclusions.

You will be given all of their findings together, grouped by role. Your job:

1. Group related findings into topics (e.g. multiple reviewers may have touched on the same underlying issue from different angles — merge those into one reconciled entry per topic, keeping the strongest evidence).
2. Actively look for contradictions BETWEEN roles — for example, one reviewer treating a column as reliable that another flagged as low-quality, or one reviewer's recommended metric being inconsistent with another's validation strategy. These are disagreements, not just findings, and matter even if no single reviewer would have caught them alone.
3. Do not soften or discard a finding just because only one reviewer raised it — a real issue found once is still real.

Return the reconciled topic list (one entry per topic, with the finding and its best supporting evidence) and a separate, explicit list of any disagreements you found between roles.
```

Create `agents/thesis-auditor.md`:
```markdown
---
name: thesis-auditor
description: Compares one reconciled independent finding against the data science project's own stated conclusions on the same topic, and reports whether the project's claim is actually supported.
tools: Read, Grep, Glob, Bash
---

You are auditing whether a data science project's own stated conclusions actually support an independent reviewer's finding on a specific topic.

You will be given: the topic, the independent finding and its evidence, and the project's own conclusion/report file path(s) (the same files are given for every topic in this run — find and use the part relevant to yours). Read those files now — this is the first and only point in the review where you're allowed to see the project's own conclusions.

Compare what the project claims to what the independent review actually found. Report:
- The project's claim, quoted or closely paraphrased from the file(s). If the files simply don't address this topic, say so explicitly.
- The independent finding, as given to you.
- Any discrepancy between them — be specific about direction (the project overstates, understates, or misattributes the cause).
- A verdict: `Supported` (the claim matches), `Partially Supported` (directionally right but overstated, understated, or missing a caveat), `Unsupported` (the independent finding contradicts the claim), or `Not Addressed` (the project's own files never made a claim on this topic).
```

- [ ] **Step 5: Create the generic extra-reviewer agent**

Create `agents/extra-reviewer.md`:
```markdown
---
name: extra-reviewer
description: Generic specialized reviewer role for a data science project. Follows a specific review persona/brief supplied at invocation time (fairness, time-series leakage, causal validity, or another domain-specific angle confirmed with the project owner) rather than a fixed built-in persona.
tools: Read, Grep, Glob, Bash
---

You are a specialized reviewer on an independent review team auditing a data science project. You were deliberately NOT shown the project's own conclusions or report — your job is to look only at the raw data and code you're given and form your own findings.

The specific review persona and checklist you should follow — what kind of specialist you are for this run, and exactly what to check for — is provided in the task prompt below (either a standard canned brief or one derived from external research on this project's domain). Follow that brief precisely; it defines your expertise for this run, not this file.

Where possible, run real queries or scripts against the data (via Bash) to independently verify claims rather than guessing. If you can't execute (data too large, missing runtime), say so explicitly in a finding rather than skipping the check.

Return each finding with a severity (`low`, `medium`, `high`), the specific claim, and the concrete evidence (file:line, or command output) that supports it.
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `node --test test/agents-frontmatter.test.js`
Expected: PASS (2 tests, 0 failures)

- [ ] **Step 7: Commit**

```bash
git add agents/ test/agents-frontmatter.test.js
git commit -m "feat: add the 7 restricted-tool reviewer agent types"
```

---

### Task 5: Analysis engine (`workflow.js`)

**Files:**
- Create: `skills/data-analysis-review/workflow.js`

**Interfaces:**
- Consumes: `agents/*.md` agent type names from Task 4 (via `agentType` option).
- Produces: when passed as `script` to the `Workflow` tool with `args = { thesis, fixedRolePaths: {dataQuality, statistical, domainAlignment, reproducibility}, extras: [{key, label, paths, persona}], skillGuidanceExcerpts: {}, conclusionPaths: [] }`, returns `{ eda: [{key, label, findings}], reconciled: [{topic, finding, evidence}], disagreements: [{topic, description, roles_involved}], crossCompare: [{topic, project_claim, independent_finding, discrepancy, verdict}] }` — this exact shape is what Task 3's `report-builder.js` `data` argument expects for its `eda`/`disagreements`/`crossCompare` fields.

- [ ] **Step 1: Write the workflow script**

Create `skills/data-analysis-review/workflow.js`:
```js
export const meta = {
  name: 'data-analysis-review',
  description: "Independent empirical review of a data science project: blind EDA, cross-role reconciliation, then comparison against the project's own stated conclusions",
  phases: [
    { title: 'Independent EDA', detail: "fixed 4 roles + confirmed extras, run blind to the project's own conclusions" },
    { title: 'Reconcile', detail: 'single barrier agent checks for contradictions between roles' },
    { title: 'Cross-Compare', detail: "one agent per reconciled topic, checked against the project's own claims" },
  ],
}

const SCOPE_DISCIPLINE = "Scope discipline: Only read and use the exact file paths listed above. Do not use Glob or Grep to search for other files, directories, or paths beyond what was explicitly given to you. Do not invoke the Agent tool or spawn any subagents under any circumstance -- perform all analysis yourself. If you believe you need a file that wasn't provided, stop and report that gap in your findings instead of searching for it."

const FINDING_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    severity: { type: 'string', enum: ['low', 'medium', 'high'] },
    claim: { type: 'string' },
    evidence: { type: 'string' },
    required_execution: { type: 'boolean' },
  },
  required: ['severity', 'claim', 'evidence', 'required_execution'],
}

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: FINDING_ITEM_SCHEMA },
  },
  required: ['findings'],
}

const RECONCILE_SCHEMA = {
  type: 'object',
  properties: {
    reconciled: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          topic: { type: 'string' },
          finding: { type: 'string' },
          evidence: { type: 'string' },
        },
        required: ['topic', 'finding', 'evidence'],
      },
    },
    disagreements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          topic: { type: 'string' },
          description: { type: 'string' },
          roles_involved: { type: 'array', items: { type: 'string' } },
        },
        required: ['topic', 'description', 'roles_involved'],
      },
    },
  },
  required: ['reconciled', 'disagreements'],
}

const CROSS_COMPARE_SCHEMA = {
  type: 'object',
  properties: {
    topic: { type: 'string' },
    project_claim: { type: 'string' },
    independent_finding: { type: 'string' },
    discrepancy: { type: 'string' },
    verdict: { type: 'string', enum: ['Supported', 'Partially Supported', 'Unsupported', 'Not Addressed'] },
  },
  required: ['topic', 'project_claim', 'independent_finding', 'discrepancy', 'verdict'],
}

const ROLE_LABELS = {
  data_quality: 'Data Quality & Integrity Reviewer',
  statistical: 'Statistical Methodologist',
  domain_alignment: 'Domain Alignment Reviewer',
  reproducibility: 'Reproducibility Auditor',
}

function buildEdaPrompt(role, thesis) {
  const parts = []
  parts.push(`Business thesis and goals (confirmed with the project owner):\n${thesis}`)
  if (role.persona) {
    parts.push(`Your specific review persona and checklist for this run:\n${role.persona}`)
  }
  parts.push(`Files you may use, and ONLY these:\n${(role.paths || []).map((p) => `- ${p}`).join('\n')}`)
  if (role.guidance) {
    parts.push(`Relevant guidance to apply:\n${role.guidance}`)
  }
  parts.push('Execute code/queries against the raw data where possible to independently recompute and verify claims empirically. If execution is not possible (e.g. data too large, missing runtime), fall back to static code/doc review and explicitly note the limitation in your findings rather than silently skipping it.')
  parts.push(SCOPE_DISCIPLINE)
  return parts.join('\n\n')
}

phase('Independent EDA')

const roster = [
  { key: 'data_quality', agentType: 'data-quality-reviewer', paths: args.fixedRolePaths.dataQuality, guidance: args.skillGuidanceExcerpts && args.skillGuidanceExcerpts.data_quality },
  { key: 'statistical', agentType: 'statistical-methodologist', paths: args.fixedRolePaths.statistical, guidance: args.skillGuidanceExcerpts && args.skillGuidanceExcerpts.statistical },
  { key: 'domain_alignment', agentType: 'domain-alignment-reviewer', paths: args.fixedRolePaths.domainAlignment, guidance: args.skillGuidanceExcerpts && args.skillGuidanceExcerpts.domain_alignment },
  { key: 'reproducibility', agentType: 'reproducibility-auditor', paths: args.fixedRolePaths.reproducibility, guidance: args.skillGuidanceExcerpts && args.skillGuidanceExcerpts.reproducibility },
  ...((args.extras || []).map((e) => ({ key: e.key, agentType: 'extra-reviewer', paths: e.paths, persona: e.persona, label: e.label }))),
].map((role) => ({ ...role, label: role.label || ROLE_LABELS[role.key] || role.key }))

const edaResults = await parallel(
  roster.map((role) => () =>
    agent(buildEdaPrompt(role, args.thesis), {
      label: `eda:${role.key}`,
      phase: 'Independent EDA',
      agentType: role.agentType,
      schema: FINDINGS_SCHEMA,
    }).then((result) => ({ key: role.key, label: role.label, findings: result.findings }))
  )
)

phase('Reconcile')

const validEdaResults = edaResults.filter(Boolean)
const reconcilePrompt = [
  `You are reconciling independent findings from ${validEdaResults.length} reviewers on the same data science project. None of them saw each other's work or the project's own stated conclusions.`,
  ...validEdaResults.map((r) => `### ${r.label}\n${JSON.stringify(r.findings)}`),
].join('\n\n')

const reconciled = await agent(reconcilePrompt, {
  label: 'reconcile',
  phase: 'Reconcile',
  agentType: 'findings-reconciler',
  schema: RECONCILE_SCHEMA,
})

phase('Cross-Compare')

const crossCompareResults = await parallel(
  (reconciled.reconciled || []).map((topic) => () => {
    const prompt = [
      "You are auditing whether this project's own stated conclusions match an independent reviewer's finding.",
      `Topic: ${topic.topic}`,
      `Independent finding: ${topic.finding}`,
      `Evidence: ${topic.evidence}`,
      `The project's own conclusion/report file(s), and ONLY these:\n${(args.conclusionPaths || []).map((p) => `- ${p}`).join('\n')}`,
      SCOPE_DISCIPLINE,
      "Read the project's own files and find the part (if any) relevant to this specific topic. Compare what it claims to the independent finding above. If the files don't address this topic at all, say so and use the verdict `Not Addressed`. Otherwise return the discrepancy (if any) and a verdict.",
    ].join('\n\n')
    return agent(prompt, {
      label: `cross-compare:${topic.topic}`,
      phase: 'Cross-Compare',
      agentType: 'thesis-auditor',
      schema: CROSS_COMPARE_SCHEMA,
    })
  })
)

return {
  eda: validEdaResults,
  reconciled: reconciled.reconciled || [],
  disagreements: reconciled.disagreements || [],
  crossCompare: crossCompareResults.filter(Boolean),
}
```

- [ ] **Step 2: Verify it's syntactically valid**

Run: `node --check skills/data-analysis-review/workflow.js`
Expected: no output, exit code 0 (this only checks JavaScript syntax — `agent`, `parallel`, `phase`, and `args` are globals the `Workflow` tool injects at run time, not real Node globals, so this file cannot be executed directly with plain `node`)

- [ ] **Step 3: Commit**

```bash
git add skills/data-analysis-review/workflow.js
git commit -m "feat: add the parallel-EDA -> reconcile -> parallel-cross-compare Workflow script"
```

---

### Task 6: `SKILL.md` gating flow + canned extra-role personas

**Files:**
- Create: `skills/data-analysis-review/SKILL.md`
- Create: `skills/data-analysis-review/references/extra-roles.md`
- Test: `test/skill-frontmatter.test.js`

**Interfaces:**
- Consumes: `lib/domain-signals.js` CLI (Task 2), `lib/report-builder.js` CLI (Task 3), `workflow.js` (Task 5), the 7 agent type names (Task 4), the 5 domain-signal keys `clinical`/`financial`/`fairness`/`time_series`/`causal` (Task 2) which `references/extra-roles.md` must key its personas by.
- Produces: the invocable skill itself.

- [ ] **Step 1: Write the canned extra-role personas**

Create `skills/data-analysis-review/references/extra-roles.md`:
```markdown
# Canned Extra Reviewer Personas

Use these when the user opts for fast, static extra roles (rather than a `deep-research` pass) during gating step 5. Each entry's `Label` and `Persona` become `args.extras[].label` / `args.extras[].persona` in the `Workflow` call (Task 5), run through the shared `extra-reviewer` agent type (Task 4).

## fairness

**Trigger signal key:** `fairness`
**Label:** Fairness / Disparate-Impact Reviewer
**Persona:**
> You are a fairness and disparate-impact reviewer. Check whether the model or analysis treats protected groups (race, gender, age, etc., as applicable) differently in ways that aren't justified by the business thesis. Look for: proxy variables that correlate with a protected attribute, absence of any fairness metric (e.g. demographic parity, equalized odds) where the decision affects people materially, and training data that under-represents a group the model will be applied to.

## time_series

**Trigger signal key:** `time_series`
**Label:** Time-Series Leakage Reviewer
**Persona:**
> You are a time-series leakage reviewer. Check whether any feature uses information that would not actually be available at prediction time (future data leaking into training), whether the train/validation split respects chronological order (no shuffling across time), and whether seasonality or trend is handled consistently between training and evaluation.

## causal

**Trigger signal key:** `causal`
**Label:** Causal Inference Validity Reviewer
**Persona:**
> You are a causal inference validity reviewer. Check whether the analysis actually supports a causal claim or only a correlational one, whether confounders are identified and controlled for, whether the control/treatment groups are comparable (randomization, matching, or a clear identification strategy), and whether the stated effect size is plausible given the sample size.

## clinical

**Trigger signal key:** `clinical`
**Label:** Clinical / Healthcare Outcomes Reviewer
**Persona:**
> You are a clinical/healthcare outcomes reviewer. Check whether outcome definitions are clinically sound and consistently applied, whether the population studied matches the population the conclusion is claimed to apply to, whether adverse events or missing follow-up are accounted for rather than silently dropped, and whether the claimed effect is compared against a clinically meaningful baseline.

## financial

**Trigger signal key:** `financial`
**Label:** Financial Decisioning Reviewer
**Persona:**
> You are a financial decisioning reviewer. Check whether the model's target actually matches the financial outcome it's used to decide (e.g. default vs. delinquency vs. charge-off are not interchangeable), whether the evaluation accounts for the asymmetric cost of false positives vs. false negatives, and whether the analysis window is long enough to capture the real-world outcome (e.g. loan default often takes months to materialize).
```

- [ ] **Step 2: Write the failing frontmatter test**

Create `test/skill-frontmatter.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL_PATH = path.join(__dirname, '..', 'skills', 'data-analysis-review', 'SKILL.md');

function parseFrontmatter(fileContents) {
  const match = fileContents.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(match, 'file must start with YAML frontmatter delimited by ---');
  const fields = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return fields;
}

test('SKILL.md exists with valid frontmatter', () => {
  assert.ok(fs.existsSync(SKILL_PATH), 'missing skills/data-analysis-review/SKILL.md');
  const fields = parseFrontmatter(fs.readFileSync(SKILL_PATH, 'utf8'));
  assert.equal(fields.name, 'data-analysis-review');
  assert.ok(fields.description, 'SKILL.md is missing a description field');
  assert.ok(fields.description.startsWith('Use when'), 'description must start with "Use when" per SDO convention');
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test test/skill-frontmatter.test.js`
Expected: FAIL — `missing skills/data-analysis-review/SKILL.md`

- [ ] **Step 4: Write SKILL.md**

Create `skills/data-analysis-review/SKILL.md`:
```markdown
---
name: data-analysis-review
description: Use when asked to review, audit, or sanity-check a data science project's findings, conclusions, or thesis -- independently verifies claims against raw data and code rather than trusting the project's own report.
---

# Data Analysis Review

## Overview

Performs an empirical, objective review of a data science project in the current working directory: independently re-derives findings from the project's raw data and code (blind to its own stated conclusions), then explicitly checks whether those conclusions actually hold up. Never modifies the reviewed project -- the only possible write action is one optional output report, and only if the user opts in.

## When NOT to use

- The user wants you to fix, refactor, or build on the project -- this skill only reviews, it never edits the target project.
- The user wants a one-off quick question answered about the data -- this skill's full gating + multi-agent flow is overkill for that; just answer directly.

## Process

This is a two-part process: an interactive gating phase (this conversation, plan mode), then a `Workflow`-driven analysis engine.

### Part 1: Gating flow (plan mode)

1. **Enter plan mode.** Call `EnterPlanMode` if not already active.

2. **Review project hierarchy.** Explore the current working directory: docs, source, notebooks, data files. Build two lists:
   - **Raw inputs**: data files, source code, notebooks, business/requirements docs.
   - **The project's own conclusions**: README claims, final notebook cells, summary reports/decks -- anything that states what the project concluded.

   Keep these lists separate -- the raw-inputs list is what gets passed to independent-EDA agents; the conclusions list is deliberately withheld until the cross-compare phase.

3. **Establish the business thesis and goals.** If it's not clearly stated in the docs, ask the user directly via `AskUserQuestion`. Do not proceed past this step on a guessed thesis.

4. **Search installed skills.** Scan the skills already listed in your context for matches to the project's domain/stack (e.g. notebooks + pandas suggests `scientific-skills:exploratory-data-analysis`, `data:statistical-analysis`, `data:validate-data`). Present candidates via `AskUserQuestion` (multiSelect) for the user to confirm which to load. For any confirmed, read the specific guidance relevant to this project and keep a short excerpt ready to pass into agent prompts in Part 2 -- do not give subagents live access to the `Skill` tool themselves.

5. **Confirm the reviewer roster.**
   - The 4 fixed roles (`data-quality-reviewer`, `statistical-methodologist`, `domain-alignment-reviewer`, `reproducibility-auditor`) are always included.
   - Concatenate the project's README/docs text into a temp file and run `node skills/data-analysis-review/lib/domain-signals.js <temp-file>` to detect specialized-domain signals (`clinical`, `financial`, `fairness`, `time_series`, `causal`).
   - If any signals are found, ask the user (`AskUserQuestion`) whether to add extra reviewer roles using either:
     - **Canned personas** from `references/extra-roles.md` (fast, no network), keyed by the same signal keys -- use each entry's `Label` and `Persona` verbatim.
     - **Deep-research-sourced personas** -- call `Skill({skill: "deep-research", args: "<a specific question about review considerations/checklists for this project's detected domain>"})`, turn the cited findings into a persona brief, and compose a short human-readable label for it.
   - Confirm the final roster (fixed 4 + any chosen extras) via `AskUserQuestion` (multiSelect).

6. **Confirm save preference.** Ask yes/no whether to save the final report, default path `docs/data-analysis-review/<YYYY-MM-DD>-review.md`, overridable.

7. **Exit plan mode.** Call `ExitPlanMode` with a plan restating the confirmed thesis/goals, hierarchy findings, skills to load, reviewer roster (with citations for any deep-research-sourced extras), and save preference. Approval confirms everything at once.

### Part 2: Analysis engine (after `ExitPlanMode` approval)

8. **Run the Workflow.** Read `skills/data-analysis-review/workflow.js` and pass its contents as the `script` parameter to the `Workflow` tool, with `args` set to:
   ```js
   {
     thesis: "<confirmed thesis and goals text>",
     fixedRolePaths: {
       dataQuality: [/* raw data file paths from step 2 */],
       statistical: [/* raw data + code paths */],
       domainAlignment: [/* raw data + business doc paths */],
       reproducibility: [/* code + notebook paths */],
     },
     extras: [
       // { key: 'fairness', label: 'Fairness / Disparate-Impact Reviewer', paths: [...], persona: '<canned or deep-research brief text>' }
     ],
     skillGuidanceExcerpts: {
       // data_quality: '<excerpted guidance text, if a loaded skill applies>'
     },
     conclusionPaths: [/* the project's own conclusion/report paths from step 2, flat list */],
   }
   ```

9. **Wait for the Workflow result.** It returns `{ eda, reconciled, disagreements, crossCompare }`.

10. **Build the report.** Write the Workflow's result to a JSON file in the scratchpad directory, adding these fields before running the builder: `projectName`, `reviewDate`, `thesis`, `scope` (roster used, skills loaded, execution limitations hit), and your own written verdicts for `verdictAccuracy`, `verdictCohesiveness`, and `verdictRationale` -- each a qualitative verdict plus the evidence from `reconciled`/`crossCompare` that supports it. Add `recommendations` if there are any non-blocking follow-ups worth flagging. Then run:
    ```
    node skills/data-analysis-review/lib/report-builder.js skills/data-analysis-review/references/report-template.md <path-to-result.json>
    ```

11. **Present the report** in the conversation. If the user opted in during step 6, write it to the confirmed path (the only write action this skill ever takes against the reviewed project) -- do not also commit it; that's the user's call.

## Guarantees

- No project file is ever modified. All 7 custom agent types (`agents/*.md`) are restricted to `Read, Grep, Glob, Bash` -- no `Write`, `Edit`, or `Agent`.
- Independent-EDA agents never receive the project's own conclusion-artifact paths -- they literally aren't told those paths exist.
- Every agent prompt in the analysis engine includes a scope-discipline instruction: use only the files you were given, don't Glob/Grep for more, don't spawn subagents.
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/skill-frontmatter.test.js`
Expected: PASS (1 test, 0 failures)

- [ ] **Step 6: Commit**

```bash
git add skills/data-analysis-review/SKILL.md skills/data-analysis-review/references/extra-roles.md test/skill-frontmatter.test.js
git commit -m "feat: add SKILL.md gating flow and canned extra-role personas"
```

---

### Task 7: End-to-end integration smoke test

**Files:** none created or modified in the repo -- this task exercises Tasks 1-6's output against a throwaway fixture and cleans up after itself.

**Interfaces:**
- Consumes: everything from Tasks 1-6.

- [ ] **Step 1: Create a throwaway fixture project**

```bash
FIXTURE=$(mktemp -d)
cat > "$FIXTURE/data.csv" <<'EOF'
order_id,customer_tier,order_value
1,premium,50.00
2,standard,20.00
3,premium,55.00
4,premium,50.00
5,standard,25.00
6,premium,50.00
EOF
cat > "$FIXTURE/analyze.py" <<'EOF'
import csv

with open("data.csv") as f:
    rows = list(csv.DictReader(f))

premium = [float(r["order_value"]) for r in rows if r["customer_tier"] == "premium"]
print("Average premium order value:", sum(premium) / len(premium))
EOF
cat > "$FIXTURE/README.md" <<'EOF'
# Order Value Analysis

Thesis: determine whether premium customers drive average order value.

Conclusion: The average premium order value is $51.25, confirming premium
customers drive higher revenue per order.
EOF
echo "Fixture created at: $FIXTURE"
```

Note: rows 1, 3, and 4 are duplicates of the same order re-inserted (order_id 4 duplicates order_id 1's value) -- this gives the reviewers something concrete to potentially find, but this task does not assert on their semantic judgment, only on structural correctness (see Step 4).

- [ ] **Step 2: Snapshot fixture file hashes before running anything**

```bash
find "$FIXTURE" -type f -exec sha256sum {} \; | sort > "$FIXTURE/../before.txt"
```

- [ ] **Step 3: Invoke the Workflow tool against the fixture**

As the agent executing this plan, read `skills/data-analysis-review/workflow.js` and call the `Workflow` tool with that file's contents as `script` and `args` (substituting the real path printed by Step 1 for every `$FIXTURE` below):
```js
{
  thesis: "Determine whether premium customers drive average order value.",
  fixedRolePaths: {
    dataQuality: ["$FIXTURE/data.csv"],
    statistical: ["$FIXTURE/data.csv", "$FIXTURE/analyze.py"],
    domainAlignment: ["$FIXTURE/data.csv"],
    reproducibility: ["$FIXTURE/analyze.py"],
  },
  extras: [],
  skillGuidanceExcerpts: {},
  conclusionPaths: ["$FIXTURE/README.md"],
}
```
Save the returned result object to `"$FIXTURE/../result.json"`.

- [ ] **Step 4: Assert the result shape is well-formed**

```bash
node -e "
const r = require('$FIXTURE/../result.json');
const assert = require('node:assert/strict');
assert.ok(Array.isArray(r.eda) && r.eda.length === 4, 'expected 4 eda entries');
assert.ok(Array.isArray(r.reconciled));
assert.ok(Array.isArray(r.disagreements));
assert.ok(Array.isArray(r.crossCompare));
console.log('OK: workflow result shape valid');
"
```
Expected: `OK: workflow result shape valid`

- [ ] **Step 5: Build the report from the result and confirm it renders**

```bash
node -e "
const fs = require('fs');
const r = JSON.parse(fs.readFileSync('$FIXTURE/../result.json', 'utf8'));
r.projectName = 'Order Value Analysis (fixture)';
r.reviewDate = '2026-07-17';
r.thesis = 'Determine whether premium customers drive average order value.';
r.scope = 'Fixed 4 roles only, no extras.';
r.verdictAccuracy = 'See cross-comparison above.';
r.verdictCohesiveness = 'See reconciliation notes above.';
r.verdictRationale = 'See domain-alignment findings above.';
fs.writeFileSync('$FIXTURE/../result-annotated.json', JSON.stringify(r));
"
node skills/data-analysis-review/lib/report-builder.js skills/data-analysis-review/references/report-template.md "$FIXTURE/../result-annotated.json" > "$FIXTURE/../report.md"
node -e "
const fs = require('fs');
const assert = require('node:assert/strict');
const report = fs.readFileSync('$FIXTURE/../report.md', 'utf8');
for (const heading of ['## Thesis & Goals', '## Scope & Method', '## Independent Findings', '## Reconciliation Notes', '## Cross-Comparison', '### Accuracy', '### Cohesiveness', '### Rationale']) {
  assert.ok(report.includes(heading), 'report missing section: ' + heading);
}
console.log('OK: report has all required sections');
"
```
Expected: `OK: report has all required sections`

- [ ] **Step 6: Verify the fixture was never modified**

```bash
find "$FIXTURE" -type f -exec sha256sum {} \; | sort > "$FIXTURE/../after.txt"
diff "$FIXTURE/../before.txt" "$FIXTURE/../after.txt"
```
Expected: no diff output (empty) -- confirms none of the review agents wrote to the fixture.

- [ ] **Step 7: Clean up**

```bash
rm -rf "$FIXTURE" "$FIXTURE/../before.txt" "$FIXTURE/../after.txt" "$FIXTURE/../result.json" "$FIXTURE/../result-annotated.json" "$FIXTURE/../report.md"
```

No commit for this task -- it verifies Tasks 1-6's already-committed output and leaves no new files behind.

---

## Self-Review Notes

- **Spec coverage:** every section of the design spec (plugin layout, gating flow, analysis engine, report/save behavior, agent tool restrictions, blindness-by-omission, scope-discipline instruction) maps to a task above.
- **Refinement found during planning:** the spec described cross-compare paths as a per-topic map, but reconciled topics are free-text strings only known once the `Workflow` run reaches the reconcile phase -- they can't be looked up in a map built before the run starts. Task 5/6 instead pass a flat `conclusionPaths` list to every cross-compare call and let that agent find the relevant part itself; `thesis-auditor`'s verdict enum gained a fourth option, `Not Addressed`, for topics the project's own files never discuss. This satisfies the spec's substantive requirement (each cross-compare agent receives the project's own conclusion path(s) relevant to its topic) without requiring foreknowledge of reconciler-invented topic names -- the spec explicitly deferred the exact `Workflow` script mechanics to implementation.
- **Type consistency:** `findings[].{severity, claim, evidence, required_execution}` (Task 5's `FINDINGS_SCHEMA`) matches what `report-builder.js` (Task 3) reads in `renderFindings`. `reconciled[].{topic, finding, evidence}` and `disagreements[].{topic, description, roles_involved}` (Task 5) match `renderDisagreements` (Task 3). `crossCompare[].{topic, project_claim, independent_finding, discrepancy, verdict}` (Task 5) matches `renderCrossCompare` (Task 3). Agent type names in `workflow.js`'s `roster` (Task 5) match the `name:` frontmatter in every `agents/*.md` file (Task 4) exactly. `eda[].label` (added via `ROLE_LABELS` / `e.label` in Task 5) matches what `renderFindings` (Task 3) prefers over the raw `key`.
