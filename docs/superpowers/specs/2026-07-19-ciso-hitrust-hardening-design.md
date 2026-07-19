# Design: `ciso` HITRUST hardening pass

**Date:** 2026-07-19
**Status:** Approved (brainstorming phase complete)

## Context

The `ciso` plugin (HITRUST CSF tracking, `plugins/ciso/`) was built in a single commit (`3ac9f6f`, followed by a recompile in `3c238d8`) without going through the `superpowers:brainstorming` → spec → plan pipeline this repo otherwise follows. This document is the retroactive audit-and-harden pass: it records the alignment review against the plugin's original product vision, and specifies three concrete follow-ups the project owner chose to act on.

**Audit summary** (full findings recorded in conversation, not reproduced here in full): the built flow — `ciso:init` scaffolds a local, server-less HTML dashboard; `ciso:hitrust` registers HITRUST's control framework, optionally imports a licensed MyCSF export, runs a plan-mode-gated control-by-control interrogation (met/in-progress/gap/not-applicable/defer, with justification mandatory for "met" and current-state+closeness mandatory for "in-progress"), then asks a budget tier and dispatches one research sub-agent per open gap, merging vendor findings into the dashboard — matches the original vision. Notably, the vision's "controls are hardcoded and immutable" intent is satisfied for the control *framework* (a versioned, user-uneditable topic/domain list) but not for HITRUST's verbatim requirement wording, which is not hardcoded because it is MyCSF's licensed content; this divergence is confirmed correct and intentional, not something to change.

Three gaps came out of the audit that the project owner wants addressed now, forming the three sections of this spec:

1. The dashboard's client-side rendering (the actual "visual memory" deliverable) has zero test coverage, and the exact bug class that was just fixed (a grouping-key mismatch between server rollups and client-side grouping) would not have been caught by the existing suite.
2. The plugin's own stated goal — "other certifications will be added in the future, and that should be considered when organizing this new skill" — is only partly honored: the outer state schema and the roadmap/vendor-research subsystem are already certification-agnostic, but four modules hardcode the literal `'hitrust'` key.
3. The control-by-control interview holds an entire domain's worth of Q&A in plan-mode conversation context and only persists any of it once the whole domain is approved via `ExitPlanMode` — an interruption mid-domain loses everything answered so far in that domain.

## Goals

- Add real test coverage for the dashboard template's client-side rendering logic, anchored on the specific invariant that just broke (server/client grouping-key consistency), without introducing a new dependency (no jsdom) or restructuring the shipped single-file template.
- Make `register-tier.js`, `apply-assessment.js`, and `reconcile-state-version.js` take an explicit certification key instead of hardcoding `'hitrust'`, proven by a test that registers a second, fake certification key end-to-end. Leave the genuinely HITRUST/MyCSF-specific import path explicitly labeled as such rather than forced into a false abstraction.
- Shrink the interview's commit granularity from "one whole domain per `ExitPlanMode`" to small sub-batches (4-6 controls), bounding the worst-case loss from an interruption to a handful of controls instead of an entire domain.

## Non-Goals

- No plug-in/adapter architecture for certifications. Only one certification exists to generalize from; guessing the right abstraction for an unknown second one (SOC 2, ISO 27001, ...) risks building the wrong one. This pass parameterizes what is already certification-agnostic logic wearing a hardcoded string — it does not invent a certification plug-in interface.
- No generalized "import a licensed assessment export" mechanism. `merge-import.js` / `xlsx-lite.js` stay HITRUST-e1/MyCSF-specific; a future certification's import path is a new sibling module, not a generalization of this one.
- No zero-loss interview durability (e.g. checkpointing partial answers into the plan file). The project owner explicitly chose the simpler "shrink the batch size" trade-off over full checkpointing.
- No changes to the compiler pipeline (`hitrust-controls-compiler`), the version-upgrade reconciliation flow, or the roadmap/vendor-research subsystem — all three were confirmed as justified, working as intended, and out of scope for this pass.

## 1. Dashboard client-side test coverage

**Problem:** `dashboard-template.html` embeds a `<script>` block that does all of the actual rendering (`groupBy`, `slugify`/anchor-id construction, `renderControlRow`, `renderDomainGroup`, `renderOverviewCard`, `applyFilters`, `collectTypes`, `esc`) — this only executes when a browser opens the generated `dashboard.html`. `render-dashboard.js`'s own test suite (`plugins/ciso/skills/_shared/test/render-dashboard.test.js`) only covers the Node-side data-prep (`computeRollups`, `escapeForInlineScript`, `injectData`, `renderDashboard`) and never executes the embedded script, so the exact regression just fixed in `3c238d8` (client `groupBy` keying on `legacyCategoryPrefix || domain`, server `computeRollups` keying on `domainKey` first — divergent when a domain mixes controls with and without `legacyCategoryPrefix`) had, and would still have, zero coverage.

**Approach:** extract the `<script>` block's source text out of `dashboard-template.html` at test time (simple string extraction between `<script>`/`</script>` markers — no restructuring of the shipped template) and execute it inside Node's built-in `vm` module, with a minimal stub `document`/`window`/`CISO_DATA` object supplied only where the functions under test actually touch them. Pull the specific functions needed off the sandbox's context and call them directly with fixture data. No new dependency (no jsdom/happy-dom) — consistent with the rest of this plugin's stdlib-only convention (see `xlsx-lite.js`) and the user's standing "never install packages" instruction.

**New test file:** `plugins/ciso/skills/_shared/test/dashboard-template.test.js`, using the same `node:test` + `node:assert/strict` style as the existing suite.

**Required cases:**
- **Cross-consistency (primary case, directly targets the bug just fixed):** build a fixture domain with a mix of controls that do and don't carry `legacyCategoryPrefix` (reproducing the real e1 domain `11` scenario found during the audit — 2 controls with `legacyCategoryPrefix`, 3 without, same `domainKey`). Run the fixture through both `computeRollups` (server, from `render-dashboard.js`) and the extracted client `groupBy` (via `vm`), and assert both produce the identical set of group keys. This is the one test that would have caught the actual regression.
- **Anchor/href consistency:** assert that every `href="#cat-..."` the overview rendering produces has a matching element `id` in what the drilldown rendering produces, for a fixture spanning multiple certifications/tiers/domains.
- **Smoke coverage** for `renderControlRow` (renders without throwing; output contains the control id and the correct status tag for each of the five assessment statuses) and `renderDomainGroup` (control count in the `<summary>` matches the fixture).

**Out of scope for this test file:** full `render()` DOM-mounting behavior and live filter-toolbar interaction (`applyFilters` wired to real DOM events) — those would need a fuller DOM stub for marginal additional value; the cases above cover the concrete risk (silent grouping/anchor mismatches) that prompted this work.

## 2. Multi-certification parameterization

**Problem:** `register-tier.js`, `apply-assessment.js`, `merge-import.js`, and `reconcile-state-version.js` all hardcode the literal path `state.certifications.hitrust.tiers[...]` and/or the literal string `'hitrust'`. The outer `state.json` schema, `interviewSessions`, and the roadmap subsystem (`merge-roadmap.js`, `roadmap/workflow.js`) are already certification-agnostic. A second certification would today require duplicating or hand-editing these four modules.

**Approach — split by what's actually generic:**

- **`register-tier.js`, `apply-assessment.js`, `reconcile-state-version.js`** perform certification-agnostic operations (register a tier's controls, apply/validate an assessment, reconcile a version bump) that merely navigate a hardcoded key today. Add a required `certKey` parameter to each module's public function(s) and CLI argument list (no silent default to `'hitrust'` — the caller must say which certification it means, matching how `tier` is already an explicit required argument). Update the three call sites documented in `plugins/ciso/skills/hitrust/SKILL.md` (Register, Interview-apply, Upgrade) to pass `hitrust` explicitly. `register-tier.js`'s `interviewSessions` seeding and its `resolveStructurePath`/tier-name validation stay as-is (tier names `e1|i1|r2` are genuinely HITRUST-specific; only the top-level certification key generalizes).
- **`merge-import.js` + `xlsx-lite.js`** stay exactly as they are functionally (hardcoded to HITRUST's e1 tier and MyCSF's exact column headers) — this is inherent to what they do, not incidental hardcoding, so there is no generic version to extract. Add a short header comment to both files stating plainly that they are HITRUST-e1/MyCSF-specific by design, and that a future certification needs its own sibling import module rather than a generalized version of this one — so the boundary is explicit rather than discovered by surprise later.

**Verification:** extend or add tests for `register-tier.js`, `apply-assessment.js`, and `reconcile-state-version.js` that register/apply/reconcile against a second, fake certification key (e.g. `soc2`) using a minimal fixture structure file, and assert the result lands under `certifications.soc2`, entirely independent of and non-interfering with any `certifications.hitrust` data in the same fixture state.

## 3. Interview commit-batch shrinking

**Problem:** `plugins/ciso/skills/hitrust/SKILL.md`'s Interview flow (part (c)) holds every control's captured `{status, justification, currentState, estimatedCloseness}` for an entire domain/category in conversation context only, deferring all `apply-assessment.js` calls until a single `ExitPlanMode` approval commits the whole domain at once. Native plan mode blocks non-`Edit` tool calls, so this isn't just a style choice — but it means an interruption before that one `ExitPlanMode` (closed session, crash, anything) loses every control answered so far in that domain, which for i1 (up to several dozen controls per domain) can be substantial.

**Approach (chosen over full plan-file checkpointing):** shrink the unit of commit from "one whole domain" to small sub-batches of 4-6 controls — close to (though not required to exactly match) the existing "up to 4" `AskUserQuestion` batching granularity already used within the current flow. Instead of processing every control in a chosen category before calling `ExitPlanMode` once, the flow calls `ExitPlanMode` (committing that sub-batch via the existing per-control `apply-assessment.js` loop), then `EnterPlanMode` again to continue with the next sub-batch, repeating until the category is exhausted, at which point the existing group-completion call (`apply-assessment.js <state.json> <tier> <domainKey>`) runs as today. This reuses the exact existing commit mechanism and mechanical safety net (`apply-assessment.js`'s per-control validation, and the group-completion hard-stop if any control in the domain still has `assessedAt: null`) — nothing new is built, only the frequency of the exit/re-enter cycle changes.

**Specific SKILL.md changes needed:**
- Part 1 (inside plan mode) step 4's per-control loop gets a sub-batch boundary: after every 4-6 controls processed within the chosen category, proceed to `ExitPlanMode` for that sub-batch rather than continuing through the whole category.
- Step 5 (`ExitPlanMode` call) wording changes from "restating every control processed [in the domain] and its captured status" to "restating every control processed in this sub-batch."
- Part 2 step 6 (apply loop) and step 7 (group-completion call) are unchanged in mechanism — step 7 already only runs once every control in the domain has been applied across however many sub-batches it took, so no new gating logic is needed there.
- The "Known limitation" note (current lines 99-101) is updated to reflect the new, smaller blast radius: an interruption before a sub-batch's `ExitPlanMode` loses only that sub-batch's answers (already-committed sub-batches within the same domain are unaffected), not the whole domain.

**Trade-off accepted explicitly by the project owner:** more `EnterPlanMode`/`ExitPlanMode` round-trips per domain (more approval interruptions), in exchange for bounding interruption loss to a handful of controls instead of an entire domain, without building new persistence machinery.

## Verification

- Run the full existing `plugins/ciso` test suite (`node --test` across `plugins/ciso/**/test/**`) plus the new/extended tests described in sections 1 and 2 — all must pass.
- For section 1: manually open a generated `dashboard.html` (from a fixture `state.json` reproducing the mixed-`legacyCategoryPrefix` domain) in a real browser and confirm the birds-eye "jump to details" link lands on the correct, single, correctly-counted domain group — i.e. confirm the fix this test suite now guards against still holds when actually rendered, not just under the `vm` harness.
- For section 2: manually run `register-tier.js`/`apply-assessment.js` end-to-end against a throwaway fake certification key from the command line (not just the unit test) to confirm no accidental `hitrust`-specific behavior leaks through.
- For section 3: re-read the updated `hitrust/SKILL.md` Interview section for internal consistency (batch-boundary wording matches the actual sub-batch size, "Known limitation" note matches the new behavior) — this is a prose/flow change, not code, so its correctness is checked by re-reading, not by an automated test.
