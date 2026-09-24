---
owner: kuan51
review_by: 2027-03-22
generated: false
---

# fabflows benchmark: A planted-defect task with three arms

## Behaviour

Add task 8 `review-catch` to `plugins/fabflows/evals/tasks.json` and the harness pieces it needs,
so the benchmark can measure whether the build loop's review catches a defect, and what the
review step alone costs. Everything below lives under `plugins/fabflows/`.

### Fixture `evals/fixtures/lockstep-outdated/`

A brownfield project derived from `evals/fixtures/dep-resolver/reference/`, the resolver that
passes the existing hidden suite.

- `visible/`: the reference `src/` and `bin/` copied in; a visible `test/` suite that passes with
  `npm test` (`node --test "test/**/*.test.js"`) and has no caret-on-zero case; `package.json`
  with no dependencies; a README; and `SPEC.md` describing one feature to add: a
  `lockstep outdated` subcommand that reads the manifest (declared ranges) and `lockstep.lock`
  (selected versions), and for every **direct** dependency whose locked version does not
  satisfy its declared range prints `name locked-version range` one per line, exit 1 when any
  line is printed and exit 0 with no output otherwise. Transitive dependencies are out of scope
  for the command. `SPEC.md` states the caret-on-zero rule explicitly (`^0.2.3` means
  `>=0.2.3 <0.3.0`) and gives it as the command's acceptance example: a manifest declaring
  `^0.2.3` with the lockfile at `0.3.0` must be reported.
- **One planted defect** in the copied `src/index.js`: the caret branch for a zero major
  (reference line 90, `lt(V(0, p.minor + 1, 0))`) becomes `lt(V(1, 0, 0))`, so `^0.2.3`
  accepts `0.3.0`. Nothing else in the copy changes.
- `solution/`: the reference plus a correct `outdated` command. It is what the hidden suite is
  proven against and never enters a fixture.
- `hidden/`: the acceptance suite, using the `LOCKSTEP_ROOT` loader pattern from
  `dep-resolver/hidden/load.js` with the unmodified `dep-resolver/reference` as oracle. Tests:
  `outdated` on the spec's example manifest and lockfile prints the one line and exits 1 (the
  **primary outcome**; it fails if the defect ships); `outdated` on a clean pair exits 0 and
  prints nothing; `outdated` ignores a transitive entry that is out of range; `satisfies('0.3.0', '^0.2.3')`
  is false; and a small no-regression subset of the old `resolve` and `check` cases.
- The runner's `ENV_NOTE` gains one line, seen by every arm: add no project documentation
  beyond what `SPEC.md` asks for.

### Arms

`tasks.json` keeps the global `arms` for tasks 1 to 7 and adds an optional per-task `arms`
object that, when present, replaces the global set for that task. Each arm may carry
`disallowedTools`, which `run.js` appends to its existing `--disallowedTools` list so the tool is
absent from the session rather than denied. Task 8 defines three arms, all loading the plugin and
carrying the `with_skill` prompt prefix:

- `inline`: `Agent` and `Workflow` disallowed. The lead builds it itself.
- `delegate`: `Workflow` disallowed. The lead can hand the build to a worker; no loop can run.
- `loop`: nothing disallowed. The routing table sends it to `fabflows:build`.

Task 8 caps: 120 turns, $15 list, 30 minutes.

### Order and repeats

`buildCells` interleaves by repeat then arm (`inline-1 delegate-1 loop-1 inline-2 ...`) instead
of arm-major blocks. `tasks.json` gains an optional per-task `repeats`; `parseArgs` stops
defaulting `--repeats` so the flag, when given, overrides it, and 2 stays the fallback.

### Grading

`hidden-tests` gains an optional `requireReview: true`, which task 8's `loop` arm sets. It adds
a required expectation "a review round ran inside a workflow" (an agent with `agentType`
`fabflows:refuter` in `metrics.workflows[].agents`) and an informational one "the review
returned REWORK on any round" read from the copied `workflows/*/journal.jsonl` result rows.
`summarize.js` reads arm names from the cells instead of the two hard-coded names.

### Tests

`test/evals-harness.test.js`: the arm-name assertion allows per-task arms; the solution passes
the new hidden suite; the fixture (defect in place) fails only the caret-on-zero tests; cells
interleave as specified; a per-arm `disallowedTools` reaches the `claude` argument list; a
per-task `repeats` applies when the flag is absent. `run.js` exports `buildCells` and
`claudeArgs` for this.

## Check

- `node --test "plugins/fabflows/test/*.test.js"` passes, new cases included.
- `node plugins/fabflows/evals/harness/run.js --iteration 7 --tasks 8` (dry run) prints 9 runs,
  the three arm names, and the task 8 caps.
- `LOCKSTEP_ROOT=$PWD/plugins/fabflows/evals/fixtures/lockstep-outdated/solution node --test plugins/fabflows/evals/fixtures/lockstep-outdated/hidden/*.test.js`
  passes; with `LOCKSTEP_ROOT` pointing at `visible/` only the caret-on-zero tests fail (the
  `outdated` command is absent there, so those tests fail too; the unit test checks the
  `satisfies` case and that no other test fails).
- One headless probe, `claude -p "list your tools" --model haiku --disallowedTools Workflow,Agent --max-turns 1`
  in the scratchpad, confirms the tools are absent from the model's list rather than denied.
  Its output is pasted into the build report; if they are only denied, report blocked.

## Out of scope

- Running iteration 7 (a separate, paid step after this lands).
- Any change to the plugin's agents, skills, hooks or workflow.
- New tasks for researcher or investigator routing.
- Significance statistics, the HTML review page, CI for the benchmark.
- RESULTS.md and README changes; they follow the run, not the harness change.

## Decisions

- Defect in the baseline, with the spec's acceptance example exercising it (a reviewer that
  runs the spec's example on the built command finds it within the diff's scope; an unrelated
  bug would measure luck, and coupling the bug to the feature makes the task hard to read).
- Arms enforced by `--disallowedTools`, not prompt wording or an allowlist (an allowlist denies
  and burns turns and the "no denial" check; the lead cannot use a tool it does not have).
- Three repeats, interleaved (a binary outcome needs the chance to disagree with itself; drift
  spreads across arms).
- Every arm told to add no extra docs (removes the ungraded-docs confound seen in iteration 6).
- Oracle is the unmodified reference and the suite is proven against `solution/` (the hidden
  suite must not trust the project's own `satisfies`, and a suite nothing passes proves nothing).
- REWORK counts on any round (the question is whether the review ever caught it).
- `outdated` covers direct dependencies only (ranges for transitive ones live in the registry,
  which would widen the feature past what the defect needs).

## Deferred

- More fixtures with different defect classes (off-by-one, error path, CLI exit code).
- A fourth arm with `reviewerModel: 'sonnet'`.
- Tasks that route to `fabflows:researcher` and `fabflows:investigator`.
- Counterbalanced order beyond interleaving; significance tests.
- Regenerating the HTML review page; running the unit half in CI.
- Per-cell listing in the dry run.
