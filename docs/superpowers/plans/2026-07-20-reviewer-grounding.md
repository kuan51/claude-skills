# Reviewer Grounding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `data-analysis-review` findings distinguish empirically-verified from inferred claims, pin the review engine to a strong model, and route methodology guidance to the right reviewer.

**Architecture:** Add a `verified` boolean to the finding schemas so a claim that *needed* a computation but was never run is visible and never laundered into a confirmed result; the reconciler/thesis-auditor and the report builder consume it. Pin the three engine `agent()` dispatches to `opus`. One prose sentence in `SKILL.md` makes the already-role-keyed guidance-injection explicit.

**Tech Stack:** Node.js (Workflow DSL script + CommonJS lib), Markdown agent/skill prompts, `node:test`.

## Global Constraints

- The 5 EDA persona files (`data-quality-reviewer.md`, `statistical-methodologist.md`, `domain-alignment-reviewer.md`, `reproducibility-auditor.md`, `extra-reviewer.md`), `references/extra-roles.md`, and `references/evals.md` are **untouched** — immutability boundary.
- No new dependencies; no new reference files; no hardcoded methodology corpus.
- `model` pin uses the alias `'opus'` (rot-resistant), not a dated model ID.
- Every quantitative finding's `verified` is `true` **only** when a command/recomputation ran and its output is in `evidence`.
- Repo path prefix for all files below: `plugins/data-analysis-review/`.
- Commit style matches existing history: `feat(data-analysis-review): …` / `fix(...)` / `refactor(...)`.

---

### Task 1: Producer-side fabrication guard (finding schema + execution rule)

**Files:**
- Modify: `skills/data-analysis-review/workflow.js:15` (FINDING_FORMAT), `:17-26` (FINDING_ITEM_SCHEMA), `:90` (execution line)

**Interfaces:**
- Produces: `FINDING_ITEM_SCHEMA` now includes `verified: boolean` (required). Every EDA agent emits it via the `buildEdaPrompt` execution line.

- [ ] **Step 1: Add `verified` to the finding item schema**

Replace `FINDING_ITEM_SCHEMA` (lines 17-26) with:

```js
const FINDING_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    severity: { type: 'string', enum: ['low', 'medium', 'high'] },
    claim: { type: 'string' },
    evidence: { type: 'string' },
    required_execution: { type: 'boolean' },
    verified: { type: 'boolean' },
  },
  required: ['severity', 'claim', 'evidence', 'required_execution', 'verified'],
}
```

- [ ] **Step 2: Extend FINDING_FORMAT to name the field**

Replace line 15:

```js
const FINDING_FORMAT = "Return each finding with a severity (`low`, `medium`, `high`), the specific claim, the concrete evidence (file:line, row range, recomputed output, or command output) that supports it, and `verified` (see the execution rule above)."
```

- [ ] **Step 3: Harden the execution line**

Replace the `parts.push('Execute code/queries…')` string at line 90 with:

```js
  parts.push('Execute code/queries against the raw data where possible to independently recompute and verify claims empirically. If execution is not possible (e.g. data too large, missing runtime), fall back to static code/doc review and explicitly note the limitation in your findings rather than silently skipping it. Never state a computed result you did not compute: when `required_execution` is true, set `verified: true` only if the command you ran and its output appear in the finding\'s evidence; otherwise set `verified: false`. A finding that only reviews code/docs statically has `required_execution: false` and `verified: false`.')
```

- [ ] **Step 4: Syntax check**

Run: `node --check plugins/data-analysis-review/skills/data-analysis-review/workflow.js`
Expected: no output, exit 0.

- [ ] **Step 5: Frontmatter tests still green (no frontmatter changed)**

Run: `node --test plugins/data-analysis-review/test/skill-frontmatter.test.js plugins/data-analysis-review/test/agents-frontmatter.test.js`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add plugins/data-analysis-review/skills/data-analysis-review/workflow.js
git commit -m "feat(data-analysis-review): add verified flag to finding schema and execution rule"
```

---

### Task 2: Consumer-side — reconciler and thesis-auditor honor `verified`

**Files:**
- Modify: `skills/data-analysis-review/workflow.js:43-48` (reconciled item schema), `:181-184` (cross-compare prompt payload)
- Modify: `agents/findings-reconciler.md`, `agents/thesis-auditor.md`

**Interfaces:**
- Consumes: `FINDING_ITEM_SCHEMA.verified` from Task 1.
- Produces: reconciled topic items carry `verified: boolean` (required); cross-compare prompt receives it.

- [ ] **Step 1: Add `verified` to the reconciled topic schema**

In `RECONCILE_SCHEMA`, replace the reconciled item block (lines 43-48) with:

```js
        properties: {
          topic: { type: 'string' },
          finding: { type: 'string' },
          evidence: { type: 'string' },
          verified: { type: 'boolean' },
        },
        required: ['topic', 'finding', 'evidence', 'verified'],
```

- [ ] **Step 2: Tell the reconciler to carry the flag forward**

In `agents/findings-reconciler.md`, replace the final paragraph (line 15) with:

```markdown
Each reconciled topic must carry a `verified` flag: set it `true` only when the finding it summarizes was empirically confirmed (a reviewer actually ran the computation — `required_execution: true` and `verified: true`). If the underlying finding needed a computation but none was run (`required_execution: true`, `verified: false`), the topic is claimed-but-unconfirmed: set `verified: false` and keep it — do not discard it and do not present it as an established fact.

Return the reconciled topic list (one entry per topic, with the finding, its best supporting evidence, and its `verified` flag) and a separate, explicit list of any disagreements you found between roles.
```

- [ ] **Step 3: Pass `verified` into the cross-compare prompt**

In `workflow.js`, in the cross-compare prompt array (lines 181-184), replace the `Evidence:` line region so the block reads:

```js
      `Topic: ${topic.topic}`,
      `Independent finding: ${topic.finding}`,
      `Evidence: ${topic.evidence}`,
      `Independent check verified by execution: ${topic.verified ? 'yes' : 'no — the independent check was not empirically confirmed'}`,
```

- [ ] **Step 4: Tell the thesis-auditor not to over-claim on unverified findings**

In `agents/thesis-auditor.md`, append to the verdict bullet list (after line 15):

```markdown

If the independent check was not verified by execution (you are told this in the prompt), do not return `Unsupported` on the strength of that unverified finding alone — the independent side is itself unconfirmed. Prefer `Partially Supported` or `Not Addressed` and say explicitly in the discrepancy that the independent check was not empirically confirmed.
```

- [ ] **Step 5: Syntax check + frontmatter tests**

Run: `node --check plugins/data-analysis-review/skills/data-analysis-review/workflow.js`
Run: `node --test plugins/data-analysis-review/test/agents-frontmatter.test.js`
Expected: check passes silently; agent frontmatter test passes (only prose bodies changed).

- [ ] **Step 6: Commit**

```bash
git add plugins/data-analysis-review/skills/data-analysis-review/workflow.js plugins/data-analysis-review/agents/findings-reconciler.md plugins/data-analysis-review/agents/thesis-auditor.md
git commit -m "feat(data-analysis-review): propagate verified flag through reconcile and cross-compare"
```

---

### Task 3: Pin the review engine to opus

**Files:**
- Modify: `skills/data-analysis-review/workflow.js` — EDA dispatch (~148-152), reconcile dispatch (~165-170), cross-compare dispatch (~186-191)

**Interfaces:**
- Consumes: nothing new. Produces: deterministic model regardless of caller session.

- [ ] **Step 1: Pin the EDA reviewers**

In the `edaResults` `agent(...)` opts (lines 148-152), add `model: 'opus',` so it reads:

```js
    agent(buildEdaPrompt(role, A.thesis), {
      label: `eda:${role.key}`,
      phase: 'Independent EDA',
      agentType: role.agentType,
      model: 'opus',
      schema: FINDINGS_SCHEMA,
    }).then((result) => ({ key: role.key, label: role.label, findings: result.findings }))
```

- [ ] **Step 2: Pin the reconciler**

In the `reconciled` `agent(...)` opts (lines 165-170), add `model: 'opus',`:

```js
const reconciled = await agent(reconcilePrompt, {
  label: 'reconcile',
  phase: 'Reconcile',
  agentType: 'data-analysis-review:findings-reconciler',
  model: 'opus',
  schema: RECONCILE_SCHEMA,
})
```

- [ ] **Step 3: Pin the thesis-auditor**

In the cross-compare `agent(...)` opts (lines 186-191), add `model: 'opus',`:

```js
    return agent(prompt, {
      label: `cross-compare:${topic.topic}`,
      phase: 'Cross-Compare',
      agentType: 'data-analysis-review:thesis-auditor',
      model: 'opus',
      schema: CROSS_COMPARE_SCHEMA,
    })
```

- [ ] **Step 4: Syntax check**

Run: `node --check plugins/data-analysis-review/skills/data-analysis-review/workflow.js`
Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add plugins/data-analysis-review/skills/data-analysis-review/workflow.js
git commit -m "feat(data-analysis-review): pin review engine agents to opus for deterministic rigor"
```

---

### Task 4: Route guidance to the matching reviewer (SKILL.md)

**Files:**
- Modify: `skills/data-analysis-review/SKILL.md` — step 4 (line 33), step 11 (line 78)

**Interfaces:** documentation only; the plumbing at `workflow.js:139-142` is already role-keyed.

- [ ] **Step 1: Make guidance routing explicit in step 4**

In `SKILL.md` step 4 (line 33), after the sentence ending "keep a short excerpt ready to pass into agent prompts in Part 2 -- do not give subagents live access to the `Skill` tool themselves.", append:

```markdown
 When you keep an excerpt, route it to the matching reviewer key in `skillGuidanceExcerpts` (step 9) so it reaches the right reviewer: statistical-analysis guidance -> `statistical`, data-quality/validation guidance -> `data_quality`, business/domain guidance -> `domain_alignment`, reproducibility/tooling guidance -> `reproducibility`.
```

- [ ] **Step 2: Note the verified/unverified distinction in step 11**

In `SKILL.md` step 11 (line 78), after "Add `recommendations` if there are any non-blocking follow-ups worth flagging.", append:

```markdown
 The report builder marks each finding as verified (empirically recomputed) or unverified (inferred / static review only) from the `verified` flag -- unverified findings are flagged so the reader can see which conclusions are empirically backed.
```

- [ ] **Step 3: Frontmatter test (skill description unchanged, should still pass)**

Run: `node --test plugins/data-analysis-review/test/skill-frontmatter.test.js`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add plugins/data-analysis-review/skills/data-analysis-review/SKILL.md
git commit -m "docs(data-analysis-review): route loaded skill guidance to matching reviewer, note verified rendering"
```

---

### Task 5: Report surfaces verified vs. unverified

**Files:**
- Modify: `skills/data-analysis-review/lib/report-builder.js:9-13` (renderFindings tag)
- Test: `skills/data-analysis-review/test/report-builder.test.js`

**Interfaces:**
- Consumes: `finding.verified` (Task 1) and `finding.required_execution`.

- [ ] **Step 1: Update the existing test fixture + assertion (was asserting the misleading `(recomputed)`)**

In `test/report-builder.test.js`, in the "renders findings grouped by role" test, add `verified: true,` after the `required_execution: true,` line of the fixture (line 32), and replace the assertion at line 40:

```js
  assert.ok(out.includes('verified — recomputed'));
```

- [ ] **Step 2: Add a failing test for the unverified case**

Append this test to `test/report-builder.test.js`:

```js
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
```

- [ ] **Step 3: Run the tests — verify they FAIL**

Run: `node --test plugins/data-analysis-review/skills/data-analysis-review/test/report-builder.test.js`
Expected: FAIL — current code emits `(recomputed)` from `required_execution` alone and has no `unverified` string.

- [ ] **Step 4: Update renderFindings to key on `verified`**

In `lib/report-builder.js`, replace the finding-mapping (lines 9-13) with:

```js
        .map((f) => {
          const tag = f.verified
            ? ' (verified — recomputed)'
            : f.required_execution
              ? ' ⚠ unverified — inferred, not executed'
              : ' (static review)';
          return `- **[${f.severity}]** ${f.claim}\n  - Evidence: ${f.evidence}${tag}`;
        })
```

- [ ] **Step 5: Run the tests — verify they PASS**

Run: `node --test plugins/data-analysis-review/skills/data-analysis-review/test/report-builder.test.js`
Expected: all pass (including the two other existing report-builder tests).

- [ ] **Step 6: Syntax check the lib**

Run: `node --check plugins/data-analysis-review/skills/data-analysis-review/lib/report-builder.js`
Expected: no output, exit 0.

- [ ] **Step 7: Commit**

```bash
git add plugins/data-analysis-review/skills/data-analysis-review/lib/report-builder.js plugins/data-analysis-review/skills/data-analysis-review/test/report-builder.test.js
git commit -m "feat(data-analysis-review): report distinguishes verified from unverified findings"
```

---

## Final Verification

- [ ] Full suite: `node --test plugins/data-analysis-review/test/*.test.js plugins/data-analysis-review/skills/data-analysis-review/test/*.test.js` — all pass.
- [ ] `node --check` on `workflow.js` and `lib/report-builder.js`.
- [ ] Re-read `workflow.js` `buildEdaPrompt` output + cross-compare prompt + `findings-reconciler.md` + `thesis-auditor.md` end-to-end: the `verified` semantics (producer sets it, reconciler carries it, thesis-auditor tempers verdicts on it, report surfaces it) read coherently with no contradictions.
- [ ] Confirm the alias `'opus'` is accepted by the Workflow runtime's `agent()` model opt on first real run; if rejected, swap to the full model ID in all three dispatches.
