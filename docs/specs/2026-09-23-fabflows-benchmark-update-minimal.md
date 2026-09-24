# Benchmark task 9: `lockstep update`, a minimal-change re-resolution

## Behaviour

Add benchmark task 9 to the fabflows evals: a brownfield fixture built on the existing
`dep-resolver` reference resolver, whose spec asks for one new subcommand, `lockstep update`,
graded by a hidden acceptance suite against a brute-force oracle on small inputs and one
hand-constructed large input. The task exists to give a medium-effort baseline that fails
some of the time, so that raised effort pins on the builder and reviewer can show a
measurable difference. Iterations 9 and 10 showed the existing tasks cannot: every loop run
to date returned ACCEPT at medium.

### What the benchmark subject sees: `fixtures/lockstep-update/visible/`

- `src/index.js` and `bin/lockstep.js` copied from `fixtures/dep-resolver/reference/`
  (defect-free); `package.json` and `test/` copied from `fixtures/lockstep-outdated/visible/`
  (the public suite, which must pass unchanged against the reference `src/`); a short
  `README.md`; and `SPEC.md`, under 100 lines, in task 8's voice, saying:
- The project already has `resolve` and `check`; this change adds `update`. `resolve` and
  `check` keep working exactly as they do now. Ground rules as task 8: Node 20, CommonJS,
  built-ins only, `npm test` passes, commit on the current branch, tree clean.
- `lockstep update <manifest.json> <lockstep.lock> <registry.json>` reads a manifest, an
  existing lockfile in the shape `resolve` writes, and a registry snapshot, and prints a new
  lockfile (same shape and key-ordering rules, two-space JSON, trailing newline) to stdout.
  `--out <file>` writes the file and prints nothing. `src/index.js` also exports
  `update(manifest, lockfile, registry)` returning the lockfile object; the CLI calls it.
- The manifest may have changed since the lockfile was written: ranges bumped, dependencies
  added or removed. The registry may have gained versions. Existing registry versions do not
  change their dependencies, and the old lockfile was valid against the registry when it was
  written. A locked version that is no longer in the registry counts as changed whatever
  replaces it.
- The new lockfile must satisfy the library's rules R1 (edges hold), R2 (nothing extraneous),
  R5 (prereleases), R6 (cycles) and R8 (determinism). **R4 does not apply** to `update`. In
  its place:
  - **U1, minimal change.** A package *changes* when it appears in the new lockfile's
    `packages` at a version different from the old lockfile's, or appears in the new lockfile
    and not in the old. Packages that disappear do not count. Among all lockfiles satisfying
    R1, R2, R5 and R6, choose one with the fewest changed packages.
  - **U2, tie-break.** Among those, prefer the lockfile whose changed set, as a list of names
    in `Object.keys` order, is lexicographically smallest, comparing name by name and then
    treating a shorter list as smaller. Among those, compare the changed packages' selected
    versions in the same name order and prefer the higher version at the first difference.
    Versions in the tests never carry build metadata, so "higher" is total. With equal
    changed versions the lockfiles are identical, so the answer is unique.
  - **U3, failure.** `update` has no answer exactly when `resolve(manifest, registry)` has
    none. Throw `ResolutionError` with `name === 'ResolutionError'`, a non-empty `message` and
    a non-empty `conflicts` array, as `resolve` does.
- Exit codes as the existing subcommands: 0 success; 1 usage or input error, including a
  lockfile whose `lockfileVersion` is not `1`, whose `root` or `packages` is not an object, or
  whose `packages` entry lacks a string `version`; 2 `ResolutionError` with `error:` on stderr.
- Scale: the tests include registries of up to 20 packages with up to 6 versions each, and
  each `update` call must finish within 10 seconds. The spec says this and nothing about
  how; it never names the greedy approach, enumeration, or their failures.
- Three worked examples with inputs and expected output: (1) nothing needs to change, the
  output equals the old lockfile re-emitted in canonical order; (2) one range bump forces a
  direct dependency and one transitive dependency to move, two changes; (3) a removed direct
  dependency and its now-unreachable transitive dependency drop out, zero changes.

### The hidden suite: `fixtures/lockstep-update/hidden/`

- `load.js` reads `LOCKSTEP_ROOT`, requires the project's `src/index.js`, and requires
  `fixtures/dep-resolver/reference/src/index.js` for `satisfies`, `parseRange` and `resolve`.
- `oracle.js`: for every package in the registry, enumerate one of its versions or "absent";
  keep selections where the root and every selected package's dependencies are satisfied
  (R1, using the reference `satisfies`), every selected package is reachable from the root
  (R2), and prereleases obey R5; count changes against the old lockfile per U1; apply U2.
  Used only where the registry has at most 6 packages with at most 5 versions each.
- `update.test.js`, about 12 cases, each `deepStrictEqual(project.update(...), oracle(...))`
  or a hand-checked expected lockfile, including at minimum:
  - the three spec examples;
  - the **keep-trap** (optimum 2, greedy 3): root `{k:"^1", b:">=2"}` where `b` was `^1`;
    old lock k@1.0.0, b@1.0.0, c@1.0.0, e@1.0.0; registry k@1.0.0 `{b:"<3"}`, k@1.1.0
    `{b:"*"}`, b@1.0.0 and b@3.0.0 `{c:"^1", e:"^1"}`, b@2.0.0 `{c:"^2", e:"^2"}`, c and e at
    1.0.0 and 2.0.0. Keeping k forces b@2.0.0 and moves c and e; moving k lets b@3.0.0 keep
    both;
  - the **block-trap** (optimum 2, greedy throws): root bumps `b` from `^1` to `^2`;
    k@1.0.0 `{b:"^1"}`, k@1.1.0 `{b:"^2"}`. Keeping k makes resolution impossible;
  - a U2 case where two two-change answers exist and the tie-break picks one;
  - a prerelease the old lock pins and the range still admits (zero changes);
  - a two-package cycle;
  - a locked version missing from the registry;
  - a registry with newer versions that R1 would allow but U1 forbids (zero changes);
  - the **large case**: four independent copies of the keep-trap over disjoint names, 16
    packages, glued under one root; expected lockfile is the four small answers combined,
    checked by hand, not by the oracle; the test's timeout is 10 s. Naive enumeration over
    every package's versions does not finish; a search that bounds on the change count does.
- `cli.test.js`, about 5 cases: stdout shape, `--out`, exit 1 on a malformed lockfile, exit 2
  on a `ResolutionError` (asserting `error:` on stderr), and the large case through the CLI.
- `regression.test.js`: 3 to 4 `resolve` and `check` cases copied from the `dep-resolver`
  hidden suite, so a change that breaks `resolve` is caught.

### The solution: `fixtures/lockstep-update/solution/`

`src/index.js` and `bin/lockstep.js` that pass the hidden suite and the public suite. Any
correct search is fine. Its job is to prove the suite is passable and that the oracle agrees
with a non-brute-force implementation on every small case.

### Harness

- `tasks.json`: task 9 `update-minimal`, `fixture: { kind: "dir", from:
  "fixtures/lockstep-update/visible" }`, caps 120 turns, $15, 30 min, `repeats: 3`, one arm
  `loop` with task 8's loop prompt prefix and `grade: { requireReview: true }`, prompt as
  task 8's naming `lockstep update`, grade `hidden-tests` with `testCommand: "npm test"`,
  `hidden: "fixtures/lockstep-update/hidden"`, `rootEnv: "LOCKSTEP_ROOT"`, no
  `defectPattern`.
- `harness/run.js`: add `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: '0'` to the child env beside
  `FABFLOWS_PROBE`, and record it in `run.json`'s `env`. A probe confirmed `0` waits
  indefinitely and a numeric value is honoured as milliseconds.
- `test/evals-harness.test.js`: two guards as task 8 has: the hidden suite passes against
  `solution/`, and against `visible/` only the `update` and CLI cases fail.
- `evals/README.md`: one row for task 9 in the task table, and a line under the clean-room
  section that runs no longer have the 600 s background ceiling.
- No change to `grade.js`; its "review returned REWORK" informational row is the signal.

## Check

```bash
cd plugins/fabflows/evals
LOCKSTEP_ROOT=$PWD/fixtures/lockstep-update/solution node --test fixtures/lockstep-update/hidden/*.test.js  # all pass, large case under 10 s
LOCKSTEP_ROOT=$PWD/fixtures/lockstep-update/visible  node --test fixtures/lockstep-update/hidden/*.test.js  # update and cli cases fail, regression passes
(cd fixtures/lockstep-update/visible && npm test)                                                   # public suite passes
(cd fixtures/lockstep-update/solution && cp -r ../visible/test ../visible/package.json . && npm test) # public suite still passes; then remove the copies
cd ../../..
node --test plugins/fabflows/test/*.test.js                                                         # tasks.json validation and both guards pass
node plugins/fabflows/evals/harness/run.js --iteration 11 --tasks 9                                 # dry run prints 3 loop runs
```

The measurement is not part of this build: iteration 11 at medium pins via `--plugin-dir`
on a `git archive 7dc5335 plugins/fabflows` snapshot, three runs; iteration 12 at the 0.5.1
pins only if medium fails at least one hidden test in at least one run.

## Out of scope

- Any change to `grade.js`, the global arms, or the plugin itself.
- A bare-session arm. Peer dependencies, `--dry-run`, a "why" explanation.
- Running the benchmark: this spec ends at a passing dry run.

## Decisions

- Brownfield on `dep-resolver/reference`, not greenfield: reuses the loader and the oracle
  source, gives the reviewer invariants to refute, and keeps a run near task 8's $1 to $2.
- The hard core is an optimisation with a unique answer (U1 plus U2), so hidden tests grade
  it without ambiguity, and both a greedy answer and a naive enumeration fail some case.
- One-change traps are impossible under "registry only gains versions and the old lock was
  valid": every bumped root edge already counts one change. Traps are stated as optimum N,
  greedy N+1 or throw.
- The large case is the discriminator against brute force (default taken; veto by dropping
  the case, at the cost of a medium baseline that may never fail).
- Build metadata is banned from test versions rather than adding a raw-string tie-break.
- The oracle enumerates "version or absent" per registry package, so reachability is
  checked, not assumed.
- Failure is defined by `resolve`: `update` has no answer exactly when `resolve` has none.
- Effort arms are separate iterations via `--plugin-dir`, which the harness stages once per
  invocation; iterations 8 and 9 already compared this way.
- The ceiling env is set unconditionally: a no-op for any run under 600 s, and recorded in
  `run.json` so a future reader can see the baseline changed at iteration 11.
- The lead can read `solution/` by absolute path, the same exposure task 8 accepts.

## Deferred

- A `defectPattern` for task 9: there is no planted defect; the REWORK row is the signal.
- A random oracle-versus-solution cross-check script beyond the fixed cases.
- A harness option to stage two plugin variants in one invocation.
- Larger or more adversarial cases if the large case fails to discriminate.
