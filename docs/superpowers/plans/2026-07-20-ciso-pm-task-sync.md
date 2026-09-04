---
owner: kuan51
review_by: 2027-03-03
generated: false
---

# CISO Dashboard → PM Tool Task Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `plugins/ciso/skills/sync-tasks/` skill that turns gap/in_progress HITRUST controls in a project's `docs/ciso/state.json` into tracked JIRA or Linear tickets, via the pre-installed `mcp__atlassian__*` / Linear MCP connectors, with an epic (certification) → tier grouping (e1/i1/r2) → task (control) → subtask (r2 PRISMA dimension) hierarchy.

**Architecture:** A new plugin skill following the existing `plugins/ciso/skills/hitrust/` shape: `SKILL.md` (routing hub + invariants), `lib/diff-tasks.js` (the only real code — pure classification of controls into create/update/close, plus small state.json read/patch/write helpers), and `references/jira.md` / `references/linear.md` (per-tracker field-mapping instructions for Claude to follow when calling MCP tools). No custom HTTP clients; no credentials handled by our code.

**Tech Stack:** Node.js (`node:test`, `node:assert/strict`, `fs` — no external dependencies, matching every other `lib/*.js` in `plugins/ciso`), Markdown skill/reference files, MCP tool calls (`mcp__atlassian__*`, Linear MCP tools — exact Linear tool names confirmed via `ToolSearch` once the user authorizes that connector, see Task 5).

## Global Constraints

- No new npm dependencies — this repo has no `package.json` and every existing `lib/*.js` uses only Node built-ins (`fs`, `node:test`, `node:assert/strict`). Do not add one.
- Never install packages, executables, or drivers — if something's missing, tell the user, don't install it.
- State-file read/write convention: every function takes `stateJsonPath` as its first argument, does `JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'))` at the top, mutates in place, `fs.writeFileSync(stateJsonPath, JSON.stringify(state, null, 2) + '\n')` at the bottom, and returns a small summary object — never the whole state. Match this exactly (2-space indent, trailing newline) for `git diff`-friendliness.
- Test convention: Node's built-in `node:test` + `node:assert/strict`, flat `test('description', () => {...})` calls (no `describe`), colocated in a `test/` subdirectory next to the module under test, filename `<subject>.test.js`. No test registration step needed — `find plugins/ciso -name '*.test.js'` picks it up automatically.
- SKILL.md frontmatter: exactly `name`, `description`, `allowed-tools` (comma-separated flat string, not a YAML list). No `disable-model-invocation` (this is an org-facing skill, not maintainer-only) — the existing `plugins/ciso/test/skills-frontmatter.test.js` auto-discovers and validates this with zero changes needed on our part.
- Scope: JIRA and Linear only. MS Project Online, SharePoint, Trello, Confluence are explicitly out of scope (documented as future work, not built).
- Never hand-edit `state.json`'s `assessment` data — this skill only ever reads `assessment`/`roadmap` and writes to the new `tracker` / `sync` fields it owns.

---

### Task 1: Scaffold the `sync-tasks` skill directory and SKILL.md

**Files:**
- Create: `plugins/ciso/skills/sync-tasks/SKILL.md`
- Test: none (markdown; validated by the existing auto-discovering frontmatter test)

**Interfaces:**
- Produces: the skill's routing hub, which later tasks' `lib/diff-tasks.js` functions and `references/*.md` docs get wired into (Task 5).

- [ ] **Step 1: Write `SKILL.md`**

```markdown
---
name: sync-tasks
description: Use when pushing outstanding HITRUST control gaps from ciso's docs/ciso/state.json into JIRA or Linear as trackable tickets, or when re-running that sync to pick up newly-resolved or newly-gapped controls.
allowed-tools: Read, Bash, AskUserQuestion
---

# Sync Tasks

## Overview

Turns HITRUST controls with an unresolved `assessment.status` (`gap` or `in_progress`) into real tickets in JIRA or Linear, so compliance findings become actionable engineering work instead of living only in the static `dashboard.html`. Invoked explicitly by the user (e.g. "sync my HITRUST gaps to JIRA") — a separate concern from the `ciso:hitrust` assessment flow, never run automatically as part of it.

Tickets are created via the pre-installed `mcp__atlassian__*` (JIRA/Confluence) or Linear MCP connector tools — never via a custom HTTP client, and never with an API token handled by this skill's own code. If the relevant connector isn't authorized yet, tell the user to authorize it via their claude.ai connector settings (or `/mcp` in an interactive session) and stop.

**Scope:** JIRA and Linear only. If the user asks for MS Project Online, SharePoint, Trello, or Confluence-as-a-tracker, tell them that's not built yet.

## Ticket hierarchy

- **Epic** = the certification (e.g. "HITRUST 2026"), created once per certification, remembered in `state.json`.
- **Tier grouping** (e1/i1/r2):
  - Linear: a real parent issue per tier, nested under the certification issue.
  - JIRA: a "Feature" issue per tier under the epic *only if* the user confirms Advanced Roadmaps is available; otherwise (the default) tasks link directly to the epic and carry an `e1`/`i1`/`r2` label/component instead.
- **Task** = one per control with `assessment.status` in `{gap, in_progress}` (r2: any control with at least one gapped/in-progress PRISMA dimension).
- **Subtask** (r2 only) = one per gapped/in-progress PRISMA dimension (policy/procedure/implemented/measured/managed), nested under that control's task.

## Routing

1. Determine the project's `docs/ciso/` path the same way `ciso:hitrust` does — check the current working directory's `docs/ciso/state.json` first; if that's not obviously right, ask the user. **If `state.json` doesn't exist, tell the user to run `ciso:init` (and register a tier via `ciso:hitrust`) first, and stop.**
2. Ask which certification (`certKey`, e.g. `"hitrust"`) and tier (`e1`/`i1`/`r2`) to sync, if there's more than one registered in `state.json`.
3. Read `state.certifications.<certKey>.sync.destination` (see `lib/diff-tasks.js`'s `getDestination`). If it's not set:
   - Ask which tracker (JIRA or Linear), and the destination details for that tracker (JIRA: project key, issue type, whether Advanced Roadmaps is available; Linear: team/project).
   - Create the certification's epic issue in that tracker (see the matching reference doc), then call `saveDestination` to persist `{system, projectKey|teamId, issueType, hasAdvancedRoadmaps, epicId, epicUrl, tierGroupIds: {}}`.
4. Run `node "${CLAUDE_PLUGIN_ROOT}/skills/sync-tasks/lib/diff-tasks.js" <state.json> <certKey> <tier>` to get `{creates, updates, closes}`.
5. Load `references/jira.md` or `references/linear.md` (matching the saved destination's `system`) and follow it exactly for how to create/update/close tickets for each entry in that classification result, then call `recordTracker` for every control you touched to persist the resulting `tracker` block back into `state.json`.
6. Report a summary to the user: N created, N updated, N closed, with ticket links.

## Core discipline

- Never hand-edit `state.json`'s `assessment` or `roadmap` data — this skill only reads those and writes to `tracker` / `sync`, via `lib/diff-tasks.js`'s functions.
- Never invent a ticket ID, URL, or ticket hierarchy relationship — every `tracker` field written must come from an actual MCP tool call's response.
- If an MCP call fails (auth, permissions, rate limit), stop and report the failure to the user rather than silently skipping the control or fabricating a result.
```

- [ ] **Step 2: Verify the existing frontmatter test picks it up and passes**

Run: `node --test plugins/ciso/test/skills-frontmatter.test.js`
Expected: PASS, including new subtests named `sync-tasks/SKILL.md has valid name + description frontmatter`, `sync-tasks/SKILL.md model-invocation matches its maintainer-only status`, `sync-tasks/SKILL.md declares a least-privilege allowed-tools list`.

- [ ] **Step 3: Commit**

```bash
git add plugins/ciso/skills/sync-tasks/SKILL.md
git commit -m "feat(ciso): scaffold sync-tasks skill"
```

---

### Task 2: `lib/diff-tasks.js` — classify e1/i1 (flat-status) controls

**Files:**
- Create: `plugins/ciso/skills/sync-tasks/lib/diff-tasks.js`
- Test: `plugins/ciso/skills/sync-tasks/lib/test/diff-tasks.test.js`

**Interfaces:**
- Consumes: control shape from `state.certifications.<certKey>.tiers.<tierKey>.controls.<id>` — `control.assessment.status` (`'gap'|'in_progress'|'met'|'not_applicable'|'not_assessed'`), `control.assessment.assessedAt` (ISO string or `null`), and a not-yet-existing `control.tracker` field (`undefined` until this skill creates it).
- Produces: `classifyFlatControl(controlId, control) => { controlId, action: 'create'|'update'|'close' } | null`, `OPEN_STATUSES = ['gap', 'in_progress']`, `RESOLVED_STATUSES = ['met', 'not_applicable']` — consumed by Task 3 (`classifyR2Control`) and Task 4 (`classifyState`).

- [ ] **Step 1: Write the failing tests**

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyFlatControl } = require('../diff-tasks.js');

function control(status, assessedAt, tracker) {
  return { assessment: { status, assessedAt: assessedAt || null }, tracker };
}

test('classifyFlatControl: gap with no tracker yet -> create', () => {
  const result = classifyFlatControl('CTRL-A', control('gap', '2026-01-01T00:00:00.000Z'));
  assert.deepEqual(result, { controlId: 'CTRL-A', action: 'create' });
});

test('classifyFlatControl: in_progress with no tracker yet -> create', () => {
  const result = classifyFlatControl('CTRL-A', control('in_progress', '2026-01-01T00:00:00.000Z'));
  assert.deepEqual(result, { controlId: 'CTRL-A', action: 'create' });
});

test('classifyFlatControl: met with no tracker -> null (nothing to do)', () => {
  const result = classifyFlatControl('CTRL-A', control('met', '2026-01-01T00:00:00.000Z'));
  assert.equal(result, null);
});

test('classifyFlatControl: not_assessed with no tracker -> null', () => {
  const result = classifyFlatControl('CTRL-A', control('not_assessed', null));
  assert.equal(result, null);
});

test('classifyFlatControl: gap with an open tracker, unchanged since sync -> null', () => {
  const c = control('gap', '2026-01-01T00:00:00.000Z', { status: 'open', syncedAt: '2026-01-02T00:00:00.000Z' });
  assert.equal(classifyFlatControl('CTRL-A', c), null);
});

test('classifyFlatControl: gap with an open tracker, reassessed after last sync -> update', () => {
  const c = control('gap', '2026-01-03T00:00:00.000Z', { status: 'open', syncedAt: '2026-01-02T00:00:00.000Z' });
  assert.deepEqual(classifyFlatControl('CTRL-A', c), { controlId: 'CTRL-A', action: 'update' });
});

test('classifyFlatControl: now met with an open tracker -> close', () => {
  const c = control('met', '2026-01-03T00:00:00.000Z', { status: 'open', syncedAt: '2026-01-02T00:00:00.000Z' });
  assert.deepEqual(classifyFlatControl('CTRL-A', c), { controlId: 'CTRL-A', action: 'close' });
});

test('classifyFlatControl: now not_applicable with an open tracker -> close', () => {
  const c = control('not_applicable', '2026-01-03T00:00:00.000Z', { status: 'open', syncedAt: '2026-01-02T00:00:00.000Z' });
  assert.deepEqual(classifyFlatControl('CTRL-A', c), { controlId: 'CTRL-A', action: 'close' });
});

test('classifyFlatControl: already closed tracker -> null even if status is gap again', () => {
  const c = control('gap', '2026-01-03T00:00:00.000Z', { status: 'closed', syncedAt: '2026-01-02T00:00:00.000Z' });
  assert.equal(classifyFlatControl('CTRL-A', c), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test plugins/ciso/skills/sync-tasks/lib/test/diff-tasks.test.js`
Expected: FAIL — `Cannot find module '../diff-tasks.js'`

- [ ] **Step 3: Write the minimal implementation**

```js
'use strict';

const fs = require('fs');

const OPEN_STATUSES = ['gap', 'in_progress'];
const RESOLVED_STATUSES = ['met', 'not_applicable'];

function isNewerThan(assessedAt, syncedAt) {
  if (!assessedAt) return false;
  if (!syncedAt) return true;
  return new Date(assessedAt).getTime() > new Date(syncedAt).getTime();
}

function classifyFlatControl(controlId, control) {
  const status = control.assessment.status;
  const tracker = control.tracker;

  if (!tracker) {
    return OPEN_STATUSES.includes(status) ? { controlId, action: 'create' } : null;
  }
  if (tracker.status === 'closed') return null;
  if (RESOLVED_STATUSES.includes(status)) {
    return { controlId, action: 'close' };
  }
  if (OPEN_STATUSES.includes(status) && isNewerThan(control.assessment.assessedAt, tracker.syncedAt)) {
    return { controlId, action: 'update' };
  }
  return null;
}

module.exports = { classifyFlatControl, OPEN_STATUSES, RESOLVED_STATUSES, isNewerThan };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test plugins/ciso/skills/sync-tasks/lib/test/diff-tasks.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add plugins/ciso/skills/sync-tasks/lib/diff-tasks.js plugins/ciso/skills/sync-tasks/lib/test/diff-tasks.test.js
git commit -m "feat(ciso): classify e1/i1 controls for PM task sync"
```

---

### Task 3: `lib/diff-tasks.js` — classify r2 (PRISMA maturity dimension) controls

**Files:**
- Modify: `plugins/ciso/skills/sync-tasks/lib/diff-tasks.js`
- Modify: `plugins/ciso/skills/sync-tasks/lib/test/diff-tasks.test.js`

**Interfaces:**
- Consumes: `OPEN_STATUSES`, `RESOLVED_STATUSES`, `isNewerThan` from Task 2. Control shape `control.assessment.maturity.<dimension>` = `{status, assessedAt}` for each of `['policy', 'procedure', 'implemented', 'measured', 'managed']` (per `apply-assessment.js`'s r2 shape); `control.tracker.subtasks.<dimension>` = `{id, url, status, syncedAt}` (not yet existing until this skill creates it).
- Produces: `classifyR2Control(controlId, control) => { controlId, action: 'create'|'update'|'close', dimensionActions: {<dim>: 'create'|'update'|'close'} } | null`, `R2_DIMENSIONS` — consumed by Task 4 (`classifyState`) and Task 5 (`references/*.md` describe how to act on `dimensionActions`).

- [ ] **Step 1: Write the failing tests** (append to `diff-tasks.test.js`)

```js
const { classifyR2Control, R2_DIMENSIONS } = require('../diff-tasks.js');

function dim(status, assessedAt) {
  return { status, justification: null, inProgress: { currentState: null, estimatedCloseness: null }, assessedAt: assessedAt || null };
}

function r2Control(maturityOverrides, tracker) {
  const maturity = {};
  for (const d of R2_DIMENSIONS) maturity[d] = dim('not_assessed');
  Object.assign(maturity, maturityOverrides);
  return { assessment: { status: null, maturity }, tracker };
}

test('classifyR2Control: no gaps anywhere, no tracker -> null', () => {
  assert.equal(classifyR2Control('CTRL-R2', r2Control({})), null);
});

test('classifyR2Control: one gapped dimension, no tracker yet -> create with just that dimension', () => {
  const c = r2Control({ policy: dim('gap', '2026-01-01T00:00:00.000Z') });
  assert.deepEqual(classifyR2Control('CTRL-R2', c), {
    controlId: 'CTRL-R2',
    action: 'create',
    dimensionActions: { policy: 'create' },
  });
});

test('classifyR2Control: two gapped dimensions, no tracker yet -> create with both', () => {
  const c = r2Control({
    policy: dim('gap', '2026-01-01T00:00:00.000Z'),
    implemented: dim('in_progress', '2026-01-01T00:00:00.000Z'),
  });
  assert.deepEqual(classifyR2Control('CTRL-R2', c), {
    controlId: 'CTRL-R2',
    action: 'create',
    dimensionActions: { policy: 'create', implemented: 'create' },
  });
});

test('classifyR2Control: existing open subtask for a still-gapped dimension, unchanged -> null', () => {
  const c = r2Control(
    { policy: dim('gap', '2026-01-01T00:00:00.000Z') },
    { status: 'open', subtasks: { policy: { id: 'P-1', url: 'https://x/P-1', status: 'open', syncedAt: '2026-01-02T00:00:00.000Z' } } }
  );
  assert.equal(classifyR2Control('CTRL-R2', c), null);
});

test('classifyR2Control: existing subtask, dimension reassessed after last sync -> update for that dimension', () => {
  const c = r2Control(
    { policy: dim('gap', '2026-01-03T00:00:00.000Z') },
    { status: 'open', subtasks: { policy: { id: 'P-1', url: 'https://x/P-1', status: 'open', syncedAt: '2026-01-02T00:00:00.000Z' } } }
  );
  assert.deepEqual(classifyR2Control('CTRL-R2', c), {
    controlId: 'CTRL-R2',
    action: 'update',
    dimensionActions: { policy: 'update' },
  });
});

test('classifyR2Control: one dimension now met, its subtask still open -> close that dimension only, parent stays open', () => {
  const c = r2Control(
    { policy: dim('met', '2026-01-03T00:00:00.000Z'), implemented: dim('gap', '2026-01-01T00:00:00.000Z') },
    { status: 'open', subtasks: {
      policy: { id: 'P-1', url: 'https://x/P-1', status: 'open', syncedAt: '2026-01-02T00:00:00.000Z' },
      implemented: { id: 'P-2', url: 'https://x/P-2', status: 'open', syncedAt: '2026-01-02T00:00:00.000Z' },
    } }
  );
  assert.deepEqual(classifyR2Control('CTRL-R2', c), {
    controlId: 'CTRL-R2',
    action: 'update',
    dimensionActions: { policy: 'close' },
  });
});

test('classifyR2Control: all dimensions resolved and all subtasks already closed -> close the parent', () => {
  const maturity = {};
  for (const d of R2_DIMENSIONS) maturity[d] = dim('met', '2026-01-03T00:00:00.000Z');
  const subtasks = {};
  for (const d of R2_DIMENSIONS) subtasks[d] = { id: `P-${d}`, url: `https://x/P-${d}`, status: 'closed', syncedAt: '2026-01-02T00:00:00.000Z' };
  const c = { assessment: { status: null, maturity }, tracker: { status: 'open', subtasks } };
  assert.deepEqual(classifyR2Control('CTRL-R2', c), {
    controlId: 'CTRL-R2',
    action: 'close',
    dimensionActions: {},
  });
});

test('classifyR2Control: parent already closed -> null', () => {
  const maturity = {};
  for (const d of R2_DIMENSIONS) maturity[d] = dim('met', '2026-01-03T00:00:00.000Z');
  const c = { assessment: { status: null, maturity }, tracker: { status: 'closed', subtasks: {} } };
  assert.equal(classifyR2Control('CTRL-R2', c), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test plugins/ciso/skills/sync-tasks/lib/test/diff-tasks.test.js`
Expected: FAIL — `classifyR2Control is not a function`

- [ ] **Step 3: Write the minimal implementation** (append to `diff-tasks.js`, and add `R2_DIMENSIONS` to the existing `module.exports`)

```js
const R2_DIMENSIONS = ['policy', 'procedure', 'implemented', 'measured', 'managed'];

function classifyR2Control(controlId, control) {
  const tracker = control.tracker;
  const maturity = control.assessment.maturity;
  const dimensionActions = {};

  for (const dimName of R2_DIMENSIONS) {
    const dimState = maturity[dimName];
    const subtask = tracker && tracker.subtasks && tracker.subtasks[dimName];

    if (!subtask) {
      if (OPEN_STATUSES.includes(dimState.status)) dimensionActions[dimName] = 'create';
      continue;
    }
    if (subtask.status === 'closed') continue;
    if (RESOLVED_STATUSES.includes(dimState.status)) {
      dimensionActions[dimName] = 'close';
    } else if (OPEN_STATUSES.includes(dimState.status) && isNewerThan(dimState.assessedAt, subtask.syncedAt)) {
      dimensionActions[dimName] = 'update';
    }
  }

  if (!tracker) {
    return Object.keys(dimensionActions).length > 0
      ? { controlId, action: 'create', dimensionActions }
      : null;
  }
  if (tracker.status === 'closed') return null;

  const allDimensionsResolved = R2_DIMENSIONS.every((d) => RESOLVED_STATUSES.includes(maturity[d].status));
  const hasOpenSubtask = Object.values(tracker.subtasks || {}).some((s) => s.status !== 'closed');

  if (allDimensionsResolved && !hasOpenSubtask) {
    return { controlId, action: 'close', dimensionActions };
  }
  if (Object.keys(dimensionActions).length > 0) {
    return { controlId, action: 'update', dimensionActions };
  }
  return null;
}

module.exports = { classifyFlatControl, classifyR2Control, OPEN_STATUSES, RESOLVED_STATUSES, isNewerThan, R2_DIMENSIONS };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test plugins/ciso/skills/sync-tasks/lib/test/diff-tasks.test.js`
Expected: PASS (17 tests)

- [ ] **Step 5: Commit**

```bash
git add plugins/ciso/skills/sync-tasks/lib/diff-tasks.js plugins/ciso/skills/sync-tasks/lib/test/diff-tasks.test.js
git commit -m "feat(ciso): classify r2 controls by PRISMA dimension for PM task sync"
```

---

### Task 4: `lib/diff-tasks.js` — `classifyState`, `recordTracker`, `saveDestination`, `getDestination`, and CLI entry point

**Files:**
- Modify: `plugins/ciso/skills/sync-tasks/lib/diff-tasks.js`
- Modify: `plugins/ciso/skills/sync-tasks/lib/test/diff-tasks.test.js`

**Interfaces:**
- Consumes: `classifyFlatControl`, `classifyR2Control` from Tasks 2–3. State shape `state.certifications.<certKey>.tiers.<tierKey>.controls` (from `register-tier.js`) and `state.certifications.<certKey>.sync` (new field, not yet present anywhere else).
- Produces (final public API of this module, used by `SKILL.md` in Task 5):
  - `classifyState(stateJsonPath, certKey, tierKey) => { creates: [...], updates: [...], closes: [...] }`
  - `recordTracker(stateJsonPath, certKey, tierKey, controlId, trackerPatch) => control.tracker` (patch merged in; `trackerPatch.subtasks` merged key-by-key rather than replacing the whole object)
  - `saveDestination(stateJsonPath, certKey, destination) => { destination }`
  - `getDestination(stateJsonPath, certKey) => destination | null`
  - CLI: `node diff-tasks.js <state.json> <certKey> <tierKey>` prints `classifyState`'s result as JSON.

- [ ] **Step 1: Write the failing tests** (append to `diff-tasks.test.js`)

```js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { classifyState, recordTracker, saveDestination, getDestination } = require('../diff-tasks.js');

function makeTempState(initial) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-tasks-test-'));
  const stateJsonPath = path.join(dir, 'state.json');
  fs.writeFileSync(stateJsonPath, JSON.stringify(initial, null, 2));
  return stateJsonPath;
}

function baseState() {
  return {
    certifications: {
      hitrust: {
        displayName: 'HITRUST CSF',
        tiers: {
          e1: {
            controls: {
              'e1-01-01': { id: 'e1-01-01', topicLabel: 'Policy', assessment: { status: 'gap', assessedAt: '2026-01-01T00:00:00.000Z' } },
              'e1-01-02': { id: 'e1-01-02', topicLabel: 'Training', assessment: { status: 'met', assessedAt: '2026-01-01T00:00:00.000Z' } },
            },
          },
        },
      },
    },
  };
}

test('classifyState: returns creates/updates/closes buckets for a flat tier', () => {
  const stateJsonPath = makeTempState(baseState());
  const result = classifyState(stateJsonPath, 'hitrust', 'e1');
  assert.deepEqual(result.creates, [{ controlId: 'e1-01-01', action: 'create' }]);
  assert.deepEqual(result.updates, []);
  assert.deepEqual(result.closes, []);
});

test('classifyState: throws a clear error for an unregistered tier', () => {
  const stateJsonPath = makeTempState(baseState());
  assert.throws(() => classifyState(stateJsonPath, 'hitrust', 'r2'), /Tier "hitrust\/r2" not found/);
});

test('recordTracker: writes a tracker block onto the named control and persists it', () => {
  const stateJsonPath = makeTempState(baseState());
  const tracker = recordTracker(stateJsonPath, 'hitrust', 'e1', 'e1-01-01', {
    system: 'jira', id: 'SEC-1', url: 'https://x/SEC-1', status: 'open', syncedAt: '2026-01-05T00:00:00.000Z',
  });
  assert.equal(tracker.id, 'SEC-1');
  const reloaded = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  assert.equal(reloaded.certifications.hitrust.tiers.e1.controls['e1-01-01'].tracker.id, 'SEC-1');
});

test('recordTracker: merges subtasks key-by-key instead of replacing the whole object', () => {
  const stateJsonPath = makeTempState(baseState());
  recordTracker(stateJsonPath, 'hitrust', 'e1', 'e1-01-01', {
    system: 'jira', id: 'SEC-1', url: 'https://x/SEC-1', status: 'open', syncedAt: '2026-01-05T00:00:00.000Z',
    subtasks: { policy: { id: 'SEC-2', url: 'https://x/SEC-2', status: 'open', syncedAt: '2026-01-05T00:00:00.000Z' } },
  });
  const tracker = recordTracker(stateJsonPath, 'hitrust', 'e1', 'e1-01-01', {
    subtasks: { procedure: { id: 'SEC-3', url: 'https://x/SEC-3', status: 'open', syncedAt: '2026-01-06T00:00:00.000Z' } },
  });
  assert.ok(tracker.subtasks.policy, 'earlier subtask entry must survive the second patch');
  assert.ok(tracker.subtasks.procedure);
});

test('recordTracker: throws for an unknown control id', () => {
  const stateJsonPath = makeTempState(baseState());
  assert.throws(() => recordTracker(stateJsonPath, 'hitrust', 'e1', 'nope', { id: 'X' }), /Control "nope" not found/);
});

test('saveDestination + getDestination: round-trips destination config', () => {
  const stateJsonPath = makeTempState(baseState());
  assert.equal(getDestination(stateJsonPath, 'hitrust'), null);
  const destination = { system: 'jira', projectKey: 'SEC', issueType: 'Task', hasAdvancedRoadmaps: false, epicId: 'SEC-100', epicUrl: 'https://x/SEC-100', tierGroupIds: {} };
  saveDestination(stateJsonPath, 'hitrust', destination);
  assert.deepEqual(getDestination(stateJsonPath, 'hitrust'), destination);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test plugins/ciso/skills/sync-tasks/lib/test/diff-tasks.test.js`
Expected: FAIL — `classifyState is not a function`

- [ ] **Step 3: Write the minimal implementation** (append to `diff-tasks.js`, replacing the final `module.exports`)

```js
function classifyState(stateJsonPath, certKey, tierKey) {
  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const tier = state?.certifications?.[certKey]?.tiers?.[tierKey];
  if (!tier || !tier.controls) {
    throw new Error(`Tier "${certKey}/${tierKey}" not found in ${stateJsonPath}`);
  }

  const results = { creates: [], updates: [], closes: [] };
  for (const [controlId, control] of Object.entries(tier.controls)) {
    const classified = tierKey === 'r2'
      ? classifyR2Control(controlId, control)
      : classifyFlatControl(controlId, control);
    if (!classified) continue;
    results[`${classified.action}s`].push(classified);
  }
  return results;
}

function recordTracker(stateJsonPath, certKey, tierKey, controlId, trackerPatch) {
  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const control = state?.certifications?.[certKey]?.tiers?.[tierKey]?.controls?.[controlId];
  if (!control) {
    throw new Error(`Control "${controlId}" not found in ${certKey}/${tierKey}`);
  }

  const existingSubtasks = (control.tracker && control.tracker.subtasks) || {};
  const patchSubtasks = trackerPatch.subtasks || {};
  const mergedSubtasks = Object.assign({}, existingSubtasks, patchSubtasks);

  control.tracker = Object.assign({}, control.tracker, trackerPatch);
  if (Object.keys(mergedSubtasks).length > 0) {
    control.tracker.subtasks = mergedSubtasks;
  }

  fs.writeFileSync(stateJsonPath, JSON.stringify(state, null, 2) + '\n');
  return control.tracker;
}

function saveDestination(stateJsonPath, certKey, destination) {
  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  if (!state.certifications || !state.certifications[certKey]) {
    throw new Error(`Certification "${certKey}" not found in ${stateJsonPath}`);
  }
  state.certifications[certKey].sync = { destination };
  fs.writeFileSync(stateJsonPath, JSON.stringify(state, null, 2) + '\n');
  return { destination };
}

function getDestination(stateJsonPath, certKey) {
  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  const destination = state?.certifications?.[certKey]?.sync?.destination;
  return destination || null;
}

module.exports = {
  classifyFlatControl,
  classifyR2Control,
  classifyState,
  recordTracker,
  saveDestination,
  getDestination,
  OPEN_STATUSES,
  RESOLVED_STATUSES,
  isNewerThan,
  R2_DIMENSIONS,
};

if (require.main === module) {
  const [stateJsonPath, certKey, tierKey] = process.argv.slice(2);
  if (!stateJsonPath || !certKey || !tierKey) {
    console.error('Usage: node diff-tasks.js <state.json> <certKey> <tierKey>');
    process.exit(1);
  }
  try {
    console.log(JSON.stringify(classifyState(stateJsonPath, certKey, tierKey), null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test plugins/ciso/skills/sync-tasks/lib/test/diff-tasks.test.js`
Expected: PASS (23 tests)

- [ ] **Step 5: Run the whole `plugins/ciso` suite to confirm no regressions**

Run (PowerShell): `Get-ChildItem -Path plugins/ciso -Recurse -Filter *.test.js | ForEach-Object { node --test $_.FullName }`
Expected: every file PASS, including `plugins/ciso/test/skills-frontmatter.test.js` and the new `diff-tasks.test.js`.

- [ ] **Step 6: Commit**

```bash
git add plugins/ciso/skills/sync-tasks/lib/diff-tasks.js plugins/ciso/skills/sync-tasks/lib/test/diff-tasks.test.js
git commit -m "feat(ciso): add classifyState/recordTracker/destination persistence for PM task sync"
```

---

### Task 5: Reference docs for JIRA and Linear field/hierarchy mapping

**Files:**
- Create: `plugins/ciso/skills/sync-tasks/references/jira.md`
- Create: `plugins/ciso/skills/sync-tasks/references/linear.md`
- Test: none (instructional markdown; verified by manual review checklist below, matching how `skills/hitrust/references/*.md` are unversioned/untested prose)

**Interfaces:**
- Consumes: `classifyState`'s output shape (`{controlId, action, dimensionActions?}` per entry) and `recordTracker`'s patch shape from Task 4, `getDestination`/`saveDestination`'s `destination` shape.
- Produces: the field-mapping contract `SKILL.md` (Task 1, already written) points to by name — no other task depends on these files' content, only their existence at these exact paths.

- [ ] **Step 1: Write `references/jira.md`**

```markdown
# JIRA field mapping and hierarchy

Use `mcp__atlassian__*` tools (confirm exact tool names for this connector instance with `ToolSearch` — query `"select:mcp__atlassian__createJiraIssue,mcp__atlassian__editJiraIssue,mcp__atlassian__transitionJiraIssue,mcp__atlassian__getJiraProjectIssueTypesMetadata,mcp__atlassian__getVisibleJiraProjects"` — before the first call, since the tool schemas are deferred until loaded).

## One-time setup (when `sync.destination` is unset)

1. Call `getVisibleJiraProjects` and ask the user to pick the target project (store its key as `destination.projectKey`).
2. Call `getJiraProjectIssueTypesMetadata` for that project; ask the user which issue type to use for control tasks (store as `destination.issueType`, typically `"Task"`).
3. Ask the user whether their JIRA site has Advanced Roadmaps enabled (store as `destination.hasAdvancedRoadmaps`, boolean).
4. Create the certification epic: `createJiraIssue` with `issueType: "Epic"`, `summary: "<certDisplayName> <year or cycle, if known>"`. Store the result's issue key/url as `destination.epicId`/`destination.epicUrl`.
5. If `hasAdvancedRoadmaps` is true, create one "Feature" issue per tier being synced (`summary: "<certDisplayName> — <tier> controls"`, parent = the epic) and store each tier's key in `destination.tierGroupIds.<tier>`. If false, leave `tierGroupIds` empty — tier grouping happens via label/component instead (see below).

## Creating a control's task (action `create`)

- `summary`: `"[<control.id>] <control.topicLabel>"`
- `description`: `<control.topicSummary>` (blank line) `Justification: <assessment.justification or inProgress.currentState>` (blank line, r2 only) `Outstanding dimensions: <comma-separated list from dimensionActions keys>`
- `issueType`: `destination.issueType`
- Parent: `destination.tierGroupIds.<tier>` if Advanced Roadmaps is available, else the epic (`destination.epicId`) directly.
- Labels/components (when not using Advanced Roadmaps): add a label or component named `<tier>` (e.g. `"e1"`) so tickets are still filterable by tier on a plain JIRA board.
- If `dimensionActions` is present (r2), after creating the parent task, create one subtask per `dimensionActions` entry whose value is `"create"`: `summary: "[<control.id>] <dimension>"`, parent = the just-created task's key.
- After every create, call `recordTracker(stateJsonPath, certKey, tierKey, controlId, { system: "jira", id, url, status: "open", syncedAt: <now> })`, with `subtasks: { <dimension>: {id, url, status: "open", syncedAt} }` added for each subtask created.

## Updating (action `update`)

- Flat tier: append a comment to the existing ticket (`addCommentToJiraIssue`) with the new `justification`/`inProgress` text; do not change the ticket status. Then `recordTracker` with a refreshed `syncedAt`.
- r2: for each `dimensionActions` entry, if `"update"`, comment on that dimension's subtask the same way; if `"close"`, follow the Closing section below for that subtask only.

## Closing (action `close`)

- Call `transitionJiraIssue` to move the ticket (or, for r2, the specific dimension subtask) to a "Done"/resolved transition. Then `recordTracker` setting that ticket's (or subtask's) `status: "closed"` and a refreshed `syncedAt`.
- r2 parent: only transition the parent task itself once every dimension subtask is closed (this is already what `action: "close"` at the control level means, per `classifyR2Control`).
```

- [ ] **Step 2: Write `references/linear.md`**

```markdown
# Linear field mapping and hierarchy

Linear's MCP tool names aren't yet known in this environment (the `productivity:linear` connector requires the user to authorize it first). Before the first Linear call in a session, run `ToolSearch` with query `"linear"` to discover the actual tool names and their parameter schemas, then follow this mapping using whichever create/update/transition tools that search surfaces (Linear's MCP server conventionally exposes issue-create, issue-update, and issue-search/list tools scoped to a team).

## One-time setup (when `sync.destination` is unset)

1. List the user's Linear teams/projects (via whichever list/search tool `ToolSearch` surfaces) and ask which team to file tickets into (store as `destination.teamId`).
2. Create the certification parent issue: title `"<certDisplayName> <year or cycle, if known>"`, no parent. Store its id/url as `destination.epicId`/`destination.epicUrl`.
3. Create one parent issue per tier being synced (title `"<certDisplayName> — <tier> controls"`, `parentId` = the certification issue's id) and store each in `destination.tierGroupIds.<tier>`. Unlike JIRA, this always happens for Linear — there's no add-on gate — so `hasAdvancedRoadmaps` is not applicable here.

## Creating a control's task (action `create`)

- `title`: `"[<control.id>] <control.topicLabel>"`
- `description`: `<control.topicSummary>` (blank line) `Justification: <assessment.justification or inProgress.currentState>` (blank line, r2 only) `Outstanding dimensions: <comma-separated list from dimensionActions keys>`
- `parentId`: `destination.tierGroupIds.<tier>`
- If `dimensionActions` is present (r2), after creating the parent task, create one sub-issue per `dimensionActions` entry whose value is `"create"`: `title: "[<control.id>] <dimension>"`, `parentId` = the just-created task's id.
- After every create, call `recordTracker(stateJsonPath, certKey, tierKey, controlId, { system: "linear", id, url, status: "open", syncedAt: <now> })`, with `subtasks: { <dimension>: {id, url, status: "open", syncedAt} }` added for each sub-issue created.

## Updating (action `update`)

- Flat tier: add a comment to the existing issue with the new `justification`/`inProgress` text; do not change its state. Then `recordTracker` with a refreshed `syncedAt`.
- r2: for each `dimensionActions` entry, if `"update"`, comment on that dimension's sub-issue the same way; if `"close"`, follow the Closing section below for that sub-issue only.

## Closing (action `close`)

- Update the issue's (or, for r2, the specific dimension sub-issue's) state to Linear's "Completed" (or workspace-equivalent done) state. Then `recordTracker` setting that ticket's (or subtask's) `status: "closed"` and a refreshed `syncedAt`.
- r2 parent: only close the parent task itself once every dimension sub-issue is closed (this is already what `action: "close"` at the control level means, per `classifyR2Control`).
```

- [ ] **Step 3: Manual review checklist** (no automated test for prose; verify by inspection)

- [ ] Every field name mentioned (`control.id`, `control.topicLabel`, `control.topicSummary`, `assessment.justification`, `assessment.inProgress.currentState`, `dimensionActions`) matches a real field from `register-tier.js`/`apply-assessment.js` (Task 4's context) — no invented field names.
- [ ] Every `recordTracker` call shown matches its Task 4 signature exactly (`stateJsonPath, certKey, tierKey, controlId, trackerPatch`).
- [ ] Both files explicitly say what to do for r2 subtasks vs. flat controls, matching `classifyR2Control`'s `dimensionActions` shape from Task 3.

- [ ] **Step 4: Commit**

```bash
git add plugins/ciso/skills/sync-tasks/references/jira.md plugins/ciso/skills/sync-tasks/references/linear.md
git commit -m "docs(ciso): add JIRA and Linear field-mapping reference docs for sync-tasks"
```

---

### Task 6: Wire `SKILL.md` to the finished `lib/diff-tasks.js` API and verify the full suite

**Files:**
- Modify: `plugins/ciso/skills/sync-tasks/SKILL.md`

**Interfaces:**
- Consumes: the final exported function names from Task 4 (`classifyState`, `recordTracker`, `saveDestination`, `getDestination`) and the two reference doc paths from Task 5.

- [ ] **Step 1: Update the "Routing" section of `SKILL.md`** to reference the concrete CLI invocation and function names now that they exist, replacing the placeholder-shaped step 4/5 text from Task 1 with:

```markdown
4. Run `node "${CLAUDE_PLUGIN_ROOT}/skills/sync-tasks/lib/diff-tasks.js" <state.json> <certKey> <tier>` to get `{creates, updates, closes}` (each entry shaped `{controlId, action, dimensionActions?}` — see `lib/diff-tasks.js`'s `classifyState`).
5. Load `references/jira.md` or `references/linear.md` (matching `destination.system`) and follow it exactly for how to create/update/close tickets for each entry, calling `recordTracker(stateJsonPath, certKey, tierKey, controlId, trackerPatch)` after every MCP call that creates, comments on, or transitions a ticket.
```

(This is a small text edit to the file written in Task 1 — no new file.)

- [ ] **Step 2: Run the full `plugins/ciso` test suite**

Run (PowerShell): `Get-ChildItem -Path plugins/ciso -Recurse -Filter *.test.js | ForEach-Object { node --test $_.FullName }`
Expected: every file PASS — no regressions in `hitrust`'s own tests, frontmatter tests pass for `sync-tasks`, and `diff-tasks.test.js`'s 23 tests all pass.

- [ ] **Step 3: Commit**

```bash
git add plugins/ciso/skills/sync-tasks/SKILL.md
git commit -m "docs(ciso): wire sync-tasks SKILL.md routing to diff-tasks.js API"
```

---

## Manual end-to-end verification (post-implementation, not part of automated tests)

Once the user authorizes the `atlassian` and/or `linear` MCP connectors:
1. Run `ciso:init` + `ciso:hitrust` in a scratch project to get a `state.json` with a mix of `gap`/`in_progress`/`met` e1 controls.
2. Invoke `sync-tasks`, choose JIRA, supply a real project key, confirm the epic + tagged tasks appear in JIRA.
3. Flip one control to `met` in `state.json` (via `apply-assessment.js`, not by hand) and re-run `sync-tasks` — confirm its ticket transitions to Done and no duplicate ticket is created for already-synced controls.
4. Repeat steps 1–3 for an r2 tier and Linear, confirming subtask creation/closing per PRISMA dimension.
