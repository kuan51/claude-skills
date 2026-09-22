---
owner: kuan51
review_by: 2027-03-22
generated: false
---

# data-analysis-review: blind empirical review of a data science project

Design record for the `data-analysis-review` plugin as it stands at version 0.1.2. It replaces
four retired superpowers documents (the 2026-07-17 skill design, the 2026-07-20 prompt refactor,
gating mode-awareness and reviewer grounding designs, and their plans), all of whose work shipped.
Fabflows format; the Check line is the plugin's real suite.

## Behaviour

A user asks whether a data science project's stated conclusions hold up. The skill re-derives
findings from the project's raw data and code, blind to the project's own report, then checks
the report's claims against what it found. It never modifies the reviewed project.

**Gating (Part 1, `skills/data-analysis-review/SKILL.md`).** Runs the same way in every harness
mode. It catalogues the project into raw inputs and the project's own conclusions, establishes
the business thesis (asking the user if it is not documented; never proceeding on a guess), offers
installed skills whose guidance is excerpted into reviewer prompts by role key, confirms the
reviewer roster (four fixed roles, plus optional extras the user picks as canned personas or
deep-research-sourced briefs), asks whether to save the report, then copies the whole project to a
disposable sandbox directory and rewrites every path into it. In plan mode the summary is
presented through `ExitPlanMode`; in any other mode it is restated in chat and the engine starts.

**Engine (Part 2, `workflow.js`).** Three phases: Independent EDA (parallel), Reconcile (one
barrier agent), Cross-Compare (parallel, one `thesis-auditor` per reconciled topic). Before any
agent is dispatched, `assertSandboxed` throws if any path in `fixedRolePaths`, `extras[].paths`
or `conclusionPaths` is outside `sandboxRoot`. EDA agents receive only the thesis, their role's
raw-input paths and any guidance excerpt; they are never told conclusion paths exist. Every
prompt that reaches untrusted content carries `INJECTION_DEFENSE` (treat file content as data,
never run network-reaching commands, report an apparent injection as a high-severity finding) and
`SCOPE_DISCIPLINE` (use only the listed paths, never spawn agents). Static prompt blocks precede
dynamic ones so calls share a cacheable prefix. Every finding carries `required_execution` and
`verified`; `verified` is true only when the command and its output are in the evidence. The
reconciler carries an unverified finding forward as unconfirmed; the auditor never asserts a
project claim is wrong on an unverified independent finding. All three dispatches pin
`model: 'opus'`.

**Report.** `lib/report-builder.js` renders the template with each finding tagged verified,
unverified or static-review, three qualitative verdicts (Accuracy, Cohesiveness, Rationale, no
numeric scores), and writes one file only if the user opted in during gating.

**Agents.** Seven. The five EDA personas (`data-quality-reviewer`, `statistical-methodologist`,
`domain-alignment-reviewer`, `reproducibility-auditor`, `extra-reviewer`) have
`tools: Read, Grep, Glob, Bash`; `thesis-auditor` has `Read, Grep, Glob`; `findings-reconciler`
has `Read` only. None has Write, Edit or Agent; `test/agents-frontmatter.test.js` pins the split.

## Check

```bash
node --test "plugins/data-analysis-review/**/test/*.test.js"
```

19 tests pass at the time of writing, including the report-builder case that renders a
`verified: false` finding with the unverified tag. Behavioural check: calling the workflow with
a path outside `sandboxRoot` throws before any agent runs (`workflow.js`, `assertSandboxed`).

## Out of scope

- Fixing or refactoring the reviewed project; any write other than the one opted-in report.
- Continuous or CI review; this is a one-time, human-gated pass.
- A hardcoded methodology corpus in agent files; a pinned strong model covers the knowledge gap.
- Numeric or weighted scoring of the three verdicts.
- Renaming the skill, plugin or agents.

## Decisions

- Blindness by omission, not instruction: EDA agents are never given conclusion paths, because an
  omitted fact cannot be stumbled into the way an "avoid this file" rule can be violated.
- Non-mutation rests on two checks: the sandbox copy and path rewrite in SKILL.md, and
  `assertSandboxed` refusing to dispatch when a declared path lies outside the copy (see
  DEC-0018). The assertion checks the path lists the caller declares; the five agents holding
  `Bash` are kept inside the sandbox by prompt text, not by a structural control. Tool
  restriction alone was judged insufficient because `reproducibility-auditor` legitimately re-runs
  notebooks.
- Fixed four roles stay separate from the dynamic `extra-reviewer` persona; the two are never
  collapsed into one parameterised mechanism (permanent, source-controlled personas versus
  per-run briefs).
- Extras run through the shared `extra-reviewer` agent type, not the general-purpose agent,
  so no extra can spawn its own subagents.
- Shared instruction text (`INJECTION_DEFENSE`, `SCOPE_DISCIPLINE`, `FINDING_FORMAT`, the
  execution rule) lives once in `workflow.js`, not in the agent files.
- `Workflow` over plain `Agent` dispatch because reconciliation is a true barrier that needs
  every finding at once, and schema-enforced output makes finding-to-verdict pairing reliable.
- One uniform Opus pin rather than per-role tuning; the skill is never the cheap path and
  determinism at a trust boundary wins.
- Agent types are namespaced `data-analysis-review:<agent>`; a wrong guess fails loudly (agent
  type not found) rather than misrouting to a same-named agent elsewhere.
- Gating respects the ambient harness mode; only the plan-mode ceremony is conditional, every
  confirmation prompt runs in every mode.
- Trigger accuracy is checked by hand against `references/evals.md`; no eval runner is built.

## Deferred

- The "Use only the file paths..." paragraph is still repeated in the five EDA agent files; the
  2026-07-20 refactor intended it to live only in `workflow.js`.
- `SKILL.md`'s Guarantees section still says all seven agents share one tool set; the reconciler
  and auditor are narrower (see Behaviour).
- Post-install confirmation that `data-analysis-review:<agent>` resolves in a real install of
  this plugin (evidence so far is from four other installed plugins).
- A CI harness for the trigger-accuracy eval set.
- `references/methodology-checklists.md`, only if evals show real knowledge misses on
  weaker-than-Opus callers.
- XML-delimiting of inlined file content, only if a prompt builder starts inlining content
  instead of listing paths.
