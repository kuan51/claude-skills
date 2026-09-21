# fabflows benchmark results

## The three questions, answered so far

**Token efficiency.** On short tasks fabflows is overhead: +64% list cost against a plain
Fable session in iteration 1, +21% once a shell-permission confound was removed in iteration
2, for identical quality every time. The cost lands on the lead (two Skill loads, a
deliberation turn, self-verification of its own inline work), and cache writes at the 1-hour
rate are about three quarters of it. On the one large read (13 files, ~60k characters) the
skill delegated by routing and came in 12% cheaper with a lead context 12k tokens smaller, at
twice the wall time. A trimmed skill removed about three quarters of the short-task overhead
but, in one of two runs, also talked the lead out of that delegation; adding a one-line volume
rule brought the delegation back in both runs while keeping the saving (iteration 4), and that
narrowed variant is the one proposed for adoption.

**The right model for the job.** Only the Haiku explorer was ever exercised by routing, on the
large read, and it did the job (100% of assertions, 6k to 11k output tokens, about $0.10). The
Sonnet test-runner ran only as a fallback after denied shell calls, never by routing: the gate
tells the lead to re-run the test command itself, which makes delegating a bare test run
pointless by the skill's own logic. Editor, refuter, investigator and researcher were never
reached, so the pre-registered tier hypotheses (refuter on Sonnet, editor on Haiku) are still
unmeasured and need direct-spawn probes.

**Diminishing returns on iterations.** Iteration 5 finally ran the build loop, on a task that
builds a whole component from a spec. Both fabflows leads launched it by the routing rule alone.
It produced the same graded result as a bare session for +53% list cost and 2.1x the wall clock,
while moving 43% of the output tokens off the lead's Fable and onto an Opus builder. Its own
central claim is still unmeasured: every build passed its tests first time, so no rework round
ever ran and the two-round cap was never approached. Within the lead's own work, the measurable
diminishing return remains self-verification: the full skill made the lead re-confirm grep
results it had just read, and stating that the gate is for worker reports removed it without any
loss in quality.

**What the build loop is worth is not on the graded axis.** Both bare runs shipped defects no
grader here checks: one committed a source file containing a raw NUL byte, which git then treats
as binary; the other made two of five commits that fail their own tests in isolation and then
reported "Each of the five Conventional Commits was checked green". Neither fabflows run did
either. Two runs each, so this is a hypothesis with evidence, not a measured rate.

Newest iteration first. Every number is a mean of two runs per cell unless stated; `cells.json`
and `benchmark.json` under each iteration directory are tracked and hold every run.

## Iteration 5 (2026-09-21): a complex build, and the build loop at last

**Bottom line.** On the task fabflows was designed for, a whole component built from a spec, the
skill did what it says: both leads routed the work to `fabflows:build` without being asked, an
Opus builder wrote and committed the code, and the lead kept the judging. The graded outcome was
a tie, 41 of 41 hidden tests in all four runs. The loop cost +53% list and 2.1x the wall clock,
and moved 43% of output tokens off Fable. Its own core mechanism, a reviewer catching what a
builder missed and rework inside a capped loop, never fired: nothing needed rework. What the runs
did expose is five concrete defects in the plugin, listed below, three of which cost a turn or a
review in these very runs.

### Setup (confirmed)

Task 7 `build-component`: a greenfield fixture holding only `SPEC.md` (a semver range grammar, a
flat backtracking resolver with named conflict reporting, and a two-subcommand CLI), a
`package.json` and a README. Prompt: build it, write tests, `npm test` must pass, commit, leave
the tree clean. Graded by 41 hidden acceptance tests run against the fixture afterwards, plus a
clean tree, a commit, no added dependency and no unfinished workflow. Lead Fable at medium
effort, caps 200 turns, $60 and 120 minutes. `with_skill` loaded the narrowed trim (the DEC-0015
candidate) from a staged plugin copy. Two runs per arm, the pair in each arm concurrent.

### Observed

| run | hidden | checks | turns | wall s | lead out | worker out | lead ctx | Fable out | Opus out | list $ | denials | loop |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| with_skill r1 | 41/41 | 49/50 | 18 | 696 | 5,562 | 51,153 | 62,919 | 19,612 | 37,103 | 4.12 | 3 | build:1, review:1 ACCEPT |
| with_skill r2 | 41/41 | 49/50 | 25 | 719 | 13,122 | 45,329 | 72,538 | 13,122 | 45,329 | 3.89 | 7 | build:1, then escalated |
| without_skill r1 | 41/41 | 49/50 | 19 | 318 | 28,848 | 0 | 72,620 | 28,848 | 0 | 2.54 | 1 | none |
| without_skill r2 | 41/41 | 50/50 | 19 | 342 | 28,510 | 0 | 72,675 | 28,510 | 0 | 2.70 | 0 | none |

Means: list $4.01 against $2.62 (+53%); Fable output 16,367 against 28,679 (-43%); Fable cache
writes 65,539 against 49,797 (+32%); wall 707 s against 330 s (2.1x). The lead wrote 10% of all
output tokens in the first fabflows run and 22% in the second, against 100% in both bare runs.
In the first fabflows run the lead was active for 108 s of 696 s while the Opus builder (402 s)
and the Fable reviewer (188 s) ran one after the other.

The only failed expectation anywhere is the environment check "No tool call was denied". All
eleven denials across the four runs are don't-ask-mode refusals, none from the fabflows guard,
and the fabflows arm is more exposed simply because it runs three shell-issuing agents instead of
one. Read it as an environment note, not as quality.

### What the loop did, round by round (confirmed)

Run 1 is the clean path: the lead checked the tree and branch, launched the loop, the Opus
builder implemented and committed (37,103 output tokens, 402 s, 22 tool calls), a fresh Fable
reviewer re-ran the tests and read every changed file, returned ACCEPT with zero must-fix items
and five advisory notes, and the lead then ran the gate itself. Run 2 diverged: the builder
finished and committed, but the workflow escalated as `blocked`, so no reviewer ever ran. The
lead recovered by hand, spawning `fabflows:refuter` through the Agent tool and writing its own
probe scripts, which is what the skill's reference file prescribes, except that the lead could
not read that file.

### Five defects the runs exposed in the plugin (confirmed)

1. **The skill-to-workflow bridge hands `args` across as a string.** In both runs the lead's
   first launch died in about 100 ms with `not-started / missing-args`, because the `fabflows:build`
   Skill takes a string and its expansion shows `Workflow({name: "fabflows:build", args: "spec: ..."})`,
   while `build.js` spreads `args` as an object. Each lead then read the workflow script to work out
   the shape and relaunched. Cost: one wasted turn and roughly 20 to 25 s per run, in every
   skill-driven session. The fix is one sentence in `whenToUse` and the skill's build-loop section
   ("args is an object"), or a string parser in `build.js`.
2. **The same recovered denial produced opposite outcomes.** Both builders hit the identical
   denied `cd <repo> && npm test | tail`, retried without the `cd`, passed, and returned
   `status: done` with an empty `blocker`. Run 1's report opened "One permission denial occurred
   mid-work and was worked around per CLAUDE.md, not a blocker" and went to review; run 2's opened
   "Permission denied (transient, resolved)" and was escalated as blocked, losing the review
   entirely. The difference is the first word of a prose report, matched by `saysDenied`. The
   code's own comment says the blocker field is the real signal; the regex overrides it.
3. **The lead cannot read `references/build-loop.md`.** On escalation the skill tells the lead to
   read that file first. The run-2 lead tried twice, by `cat` and by Read, and was refused both
   times: the plugin directory is outside the session's working directory, and this user's global
   settings block reads outside it. A real install lives in the plugin cache, also outside any
   project, so this is not a benchmark artifact. This bears directly on DEC-0015, which proposes
   moving exactly that content into that file.
4. **The reviewer's model depends on how it is launched.** `refuter.md` pins `model: opus`, but
   `build.js` defaults `reviewerModel` to `fable`. So the in-loop reviewer ran on Fable (14,050
   output tokens charged to the capped model) while run 2's hand-spawned refuter ran on Opus.
   For a Fable-capped user that default works against the plugin's own tiering.
5. **`refuter.md` contradicts itself on denials.** One line says BLOCKED is for when the diff or
   the test command could not run; the next says a denied command also makes it BLOCKED and
   "never ACCEPT a change you could not test". Both reviewers were denied a command and returned
   ACCEPT, each noting the denial. One of the two rules has to go.

One open question closed in the plugin's favour: **the guard hook does fire inside Workflow-tool
agents.** The probe file records a `PreToolUse` payload for every builder and in-loop reviewer
tool call, tagged with `fabflows:editor` and `fabflows:refuter`, plus a `SubagentStop` each, and
no guard denials. `build.js` calls that "unverified" in a comment and the README listed it as a
gap; both can now say measured.

### What the grader does not see (confirmed, and the most interesting result)

Quality is a tie on the hidden suite, but the two arms did not ship equally sound work:

- `without_skill` run 1 committed `src/resolve.js` containing a raw NUL byte, written as a
  literal separator inside a string instead of the escape `\0`. The code runs and the tests pass;
  git records the file as binary, so it has no diff, no blame and no review.
- `without_skill` run 2 made five Conventional Commits, and its first two fail their own tests
  when checked out in isolation (1 test 0 pass, and 2 tests 0 pass). Its final report states
  "Each of the five Conventional Commits was checked green with its own test file before the next
  commit". That is the exact failure the fabflows verification gate exists to catch, and it
  appeared in the arm without the gate.
- Neither fabflows run produced a binary source file, and both committed once, atomically.

Whether the loop would have caught these is not shown: no reviewer looked at the bare runs. What
is shown is that a hidden test suite is not a sufficient quality axis for this comparison, and
that a graded tie can hide the difference the skill claims to make.

### What it means (inferred)

1. **The routing rule reached the build loop unprompted, twice.** That is the first measured
   evidence that the skill's own prose sends spec-sized work to the loop, not just volume reads to
   the explorer.
2. **On a subscription the split matters more than the total.** The loop doubles total output
   tokens but cuts the lead's Fable output by 43%. If Opus and Fable weigh differently against the
   weekly cap, that is a saving; if they weigh the same, it is a 2x spend for the same graded
   result. The weighting is unpublished, so this stays directional.
3. **Every escalation lands worker-level work back on the lead.** Run 2's lead spent 10,317 Fable
   output tokens in one turn doing the review itself. Escalation paths are where the tiering
   inverts, so the cheapest fix for cost is to make escalations rarer, starting with defect 2.
4. **The loop's value case is unproven and needs a harder task.** Nothing needed rework, so the
   cap, the must-fix fence and the fresh-reviewer round are still untested. A task with a spec
   subtlety that a first pass reliably misses would measure it.

### Limitations

- Two runs per cell. Direction, not significance, and one escalation is one run.
- The bare arm's run 2 spent about five turns writing `CONVENTIONS.md`, `DECISIONS.md` and
  `RUNLOG.md` because the user's global `CLAUDE.md` asks for them. Both arms load that file, only
  that run acted on it, and the work is ungraded, so it inflates that run's cost.
- Cache-read totals track message count more than anything else (382k against 1,083k between the
  two bare runs for near-identical output), so compare arms on output and cache writes first.
- The run-2 refuter was spawned through the Agent tool, whose per-agent output the stream does not
  carry, so its 15,964 output tokens are a per-model residual, not an exact figure.
- Wall-clock seconds are machine-specific and each pair ran concurrently.
- Two stale hook payloads from an abandoned launch were counted in each fabflows run's probe
  summary; the runner now truncates that file before a run.

### Reproduce

```bash
node plugins/fabflows/evals/harness/run.js --iteration 5 --tasks 7 --repeats 2 --parallel 2 --plugin-dir plugins/fabflows/evals/runs/snapshots/h1b-narrowed --confirm
```

Launch it detached rather than through a tool with a timeout: a build-loop run takes 12 minutes
and killing the harness mid-run leaves paid sessions running.

## Iteration 4 (2026-09-20): the narrowed trim

**Bottom line.** One paragraph fixed the trim. Adding a volume rule ("a read of more than a
handful of files is volume even when you will summarise or judge the result, so delegate the
reading and keep the judging") and limiting the judgment clause to root-cause, architecture
and coupled-refactor calls kept the short-task saving of iteration 3 and **restored the
volume-task delegation in both runs**, at the same quality. Across tasks 1, 5 and 6 it is the
only variant that does both. It is the version proposed for adoption in DEC-0015.

### Setup (confirmed)

Snapshot `runs/snapshots/h1b-narrowed/`, reproducible from `snapshots/h1b-narrowed.patch`;
it differs from the iteration-3 snapshot by the one "When to delegate" paragraph (8,613
characters against 8,362). Six runs, tasks 1, 5 and 6, `with_skill` only, two repeats.

### Observed (means of 2; the other variants from iterations 1 to 3 for comparison)

| task | variant | quality | turns | lead out | thinking | cache write | final ctx | worker out | list $ | sec | delegated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| wide-search | full skill | 1.00 | 10.0 | 2,428 | 464 | 51,236 | 51,268 | 0 | 1.20 | 55 | 0/2 |
| wide-search | trimmed | 1.00 | 9.0 | 2,099 | 215 | 24,525 | 47,376 | 0 | 0.65 | 44 | 0/2 |
| wide-search | **narrowed** | 1.00 | 9.0 | 2,281 | 381 | 24,790 | 47,641 | 0 | **0.68** | 47 | 0/2 |
| wide-search | no skill | 1.00 | 4.0 | 1,636 | 103 | 17,339 | 43,545 | 0 | 0.46 | 31 | 0/2 |
| deep-read | full skill | 1.00 | 9.5 | 3,165 | 288 | 31,936 | 54,787 | 8,596 | 0.94 | 111 | 2/2 |
| deep-read | trimmed | 1.00 | 14.5 | 3,654 | 387 | 41,136 | 63,987 | 4,573 | 1.10 | 99 | 1/2 |
| deep-read | **narrowed** | 1.00 | 9.0 | 3,277 | 255 | 31,122 | **53,973** | 10,635 | **0.96** | 140 | **2/2** |
| deep-read | no skill | 1.00 | 15.0 | 3,496 | 68 | 43,636 | 66,487 | 0 | 1.07 | 50 | 0/2 |
| triage-failures | full skill | 1.00 | 7.0 | 1,422 | 233 | 27,466 | 50,317 | 0 | 0.67 | 59 | 0/2 |
| triage-failures | trimmed | 1.00 | 7.5 | 1,623 | 161 | 25,910 | 48,761 | 0 | 0.65 | 53 | 0/2 |
| triage-failures | **narrowed** | 1.00 | 11.0 | 2,134 | 96 | 27,330 | 50,181 | 0 | 0.73 | 72 | 0/2 |
| triage-failures | no skill | 1.00 | 4.0 | 1,326 | 44 | 20,359 | 43,210 | 0 | 0.51 | 104 | 0/2 |

From the transcripts (confirmed): one narrowed deep-read lead said "Thirteen records, more than
a handful, so per the routing table I'm handing the reading to a cheap explorer and keeping the
judgement. Then I'll spot-check its report against one file myself." The triage mean is
inflated by one run that hit two shell denials (a variable expansion each) and recovered over
14 turns; the other run took 8.

### What it means (inferred)

1. **The volume rule is what the lead needed.** With it, both runs delegated and one cited it
   almost word for word; without it (iteration 3) one lead read the judgment clause as covering
   a summary. Prose the lead can apply as a rule beats prose it has to interpret.
2. **The short-task saving survives the extra sentence.** wide-search sits at $0.68, within
   noise of the trimmed $0.65 and far below the full skill's $1.20.
3. **Triage is unchanged in kind**: no variant delegates a bare test run, for the gate reason in
   iteration 2 (H5). The narrowed variant's higher mean here is one denial-recovery run, not a
   property of the prose.

### Where this leaves the hypotheses

- **H1: confirmed in its narrowed form.** Proposed for adoption as DEC-0015: replace the shipped
  skill body with the `h1b-narrowed` variant, add `references/build-loop.md`, keep the
  description unchanged, patch bump.
- **H5 (test-runner gate)** stands as a proposal in iteration 2; not selected for a record.
- **H6 (trigger and load scope)** is drafted as DEC-0014.

## Iteration 3 (2026-09-20): H1, the trimmed skill

**Bottom line.** A trimmed skill (8,362 characters against 13,544; the build-loop failure
handling moved to an on-demand reference file; the gate scoped in as many words to worker
reports) **removes about three quarters of the overhead on a short task** and changes nothing
on the triage task, but **may have weakened the volume-task delegation**: one of two deep-read
runs read all 13 files itself where the full skill delegated both times, a one-run-each-way
split. Same quality throughout. The trim as drafted over-corrects on one clause; a middle
version is the obvious next test, and it is a decision for you because the approved run
budget is spent.

### Setup (confirmed)

- Snapshot in `runs/snapshots/h1-trimmed/` (gitignored), reproducible from the tracked
  `snapshots/h1-trimmed.patch`. Loaded via `--plugin-dir`; the description is unchanged so
  triggering is not a variable. Six runs: tasks 1, 5 and 6, `with_skill` only, two repeats,
  compared against the full-skill and no-skill cells of iterations 1 and 2.
- What the trim changed: "Boundaries" and the non-negotiables merged into one "When to
  delegate" section that ends "What you read from your own tools is already evidence; do not
  re-run it to confirm it"; the guard section reduced to a pointer; the build loop's
  non-accepted outcomes moved to `references/build-loop.md`; routing table, brief, report
  contract and gate table kept.

### Observed (means of 2)

| task | variant | quality | turns | lead out | thinking | cache write | final ctx | worker out | list $ | sec | delegated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| wide-search | full skill | 1.00 | 10.0 | 2,428 | 464 | 51,236 | 51,268 | 0 | 1.20 | 55 | 0/2 |
| wide-search | **trimmed** | 1.00 | 9.0 | 2,099 | 215 | 24,525 | 47,376 | 0 | **0.65** | 44 | 0/2 |
| wide-search | no skill | 1.00 | 4.0 | 1,636 | 103 | 17,339 | 43,545 | 0 | 0.46 | 31 | 0/2 |
| deep-read | full skill | 1.00 | 9.5 | 3,165 | 288 | 31,936 | 54,787 | 8,596 | **0.94** | 111 | **2/2** |
| deep-read | **trimmed** | 1.00 | 14.5 | 3,654 | 387 | 41,136 | 63,987 | 4,573 | 1.10 | 99 | **1/2** |
| deep-read | no skill | 1.00 | 15.0 | 3,496 | 68 | 43,636 | 66,487 | 0 | 1.07 | 50 | 0/2 |
| triage-failures | full skill | 1.00 | 7.0 | 1,422 | 233 | 27,466 | 50,317 | 0 | 0.67 | 59 | 0/2 |
| triage-failures | **trimmed** | 1.00 | 7.5 | 1,623 | 161 | 25,910 | 48,761 | 0 | 0.65 | 53 | 0/2 |
| triage-failures | no skill | 1.00 | 4.0 | 1,326 | 44 | 20,359 | 43,210 | 0 | 0.51 | 104 | 0/2 |

The two trimmed deep-read runs, from their transcripts (confirmed): one said "Thirteen records.
That's a multi-file read, so I'm handing the extraction to a Haiku explorer" and delegated; the
other said "Thirteen records. This needs judgment about what each decided, so I'll read them
all directly in parallel rather than delegate."

### What it means (inferred)

1. **The short-task overhead was mostly self-verification, and the trim removed it.** On
   wide-search the confirmation greps disappeared (cache writes halved, thinking halved) once
   the skill said in plain words that the gate is for worker reports. The remaining $0.19 over
   the baseline is the two Skill loads and one deliberation turn.
2. **The trim's judgment clause is too broad.** "When it needs judgement about why the code is
   the way it is" was meant for root-cause and architecture calls. One lead read it as covering
   a summarising task and took a 60k-character read into its own context. The full skill's
   longer prose did not produce that reading in either run. The fix is one sentence: volume is
   decided by what must be read, not by whether judgment follows; the worker extracts, the lead
   judges.
3. **Triage is unmoved by prose length**, as expected: the reason it is not delegated is the
   gate's re-run rule, which both versions keep (H5).

### Where this leaves the hypotheses

- **H1: partly confirmed.** The trim holds quality and cuts short-task overhead sharply, but as
  drafted it weakens the one delegation trigger that pays. Not ready to ship as is.
- **Next test, if you want it (6 runs):** the trimmed skill with the judgment clause narrowed
  and a one-line volume rule ("a read of more than a handful of files is volume; delegate the
  reading, keep the judging"), on tasks 1, 5 and 6 again.
- **H5 (test-runner gate) and H6 (trigger and load scope)** stand as decision candidates; the
  data for both is in iteration 2.

## Iteration 2 (2026-09-19): volume tasks and a denial-free fixture

**Bottom line.** With the shell-denial confound removed and two volume tasks added, the
overall gap narrows to about +21% list cost for the same quality. **On the 13-file read the
skill paid for itself for the first time:** both with-skill runs delegated to the Haiku
explorer by routing, ran the gate, and finished about 12% cheaper with a final context some
12k tokens smaller than the baseline lead that read everything itself, at the price of twice
the wall time. On the suite-triage task the lead declined to delegate for a reason written into
the skill: the gate would make it re-run the test command anyway. Short tasks still cost
+33% to +42% with the skill loaded.

### What changed from iteration 1 (confirmed)

- Tasks 5 (`deep-read`, 13 decision records, ~60k chars of prose) and 6 (`triage-failures`,
  the full suite with three planted failures) added; tasks 2 to 4 rerun; task 1 not rerun (it
  had no denials).
- The fixture's `CLAUDE.md` gains an environment note (no leading `cd`, no PowerShell) and the
  PowerShell tool is disallowed for the benchmark session. The first launch still hit the
  denials because `--setting-sources user` drops the project `CLAUDE.md`; it was stopped after
  two runs, `project` was added, and a task-2 rerun then passed 9/9 in all four runs with no
  denials. Both arms now carry the repo's own `CLAUDE.md`, which iteration 1 did not.
- Grader: a record or agent mentioned in a preamble before its table row no longer fails the
  row checks; worker output comes from the per-model residual, since the Agent tool result's
  `subagent_tokens` is not a sum of the usage categories.

### Observed

| task | arm | quality | denials | turns | lead out | thinking | cache read | cache write | final ctx | worker out | list $ | sec |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| scoped-edit | with | 1.00 | 0.0 | 12.0 | 1,397 | 59 | 298,099 | 23,450 | 49,609 | 0 | 0.61 | 61 |
| scoped-edit | without | 1.00 | 0.0 | 8.0 | 1,310 | 0 | 190,707 | 17,092 | 43,251 | 0 | 0.46 | 53 |
| write-tests | with | 1.00 | 1.5 | 12.0 | 2,666 | 518 | 380,436 | 31,520 | 54,371 | 185 | 0.88 | 58 |
| write-tests | without | 1.00 | 0.0 | 7.5 | 1,646 | 70 | 217,061 | 24,217 | 47,068 | 0 | 0.62 | 62 |
| short-chain | with | 1.00 | 0.0 | 12.0 | 1,528 | 23 | 291,720 | 26,885 | 49,736 | 0 | 0.69 | 27 |
| short-chain | without | 1.00 | 0.0 | 7.5 | 1,212 | 0 | 184,500 | 19,151 | 42,002 | 0 | 0.49 | 29 |
| **deep-read** | **with** | 1.00 | 0.0 | 9.5 | 3,165 | 288 | 247,293 | 31,936 | **54,787** | **8,596** | **0.94** | 111 |
| **deep-read** | **without** | 1.00 | 0.0 | 15.0 | 3,496 | 68 | 101,904 | 43,636 | **66,487** | 0 | **1.07** | 50 |
| triage-failures | with | 1.00 | 0.5 | 7.0 | 1,422 | 233 | 196,985 | 27,466 | 50,317 | 0 | 0.67 | 59 |
| triage-failures | without | 1.00 | 0.5 | 4.0 | 1,326 | 44 | 142,845 | 20,359 | 43,210 | 0 | 0.51 | 104 |
| **all** | **with** | **1.00** | 0.4 | **10.5** | **2,035** | **224** | 282,906 | **28,251** | **51,764** | 1,756 | **0.76** | 63 |
| **all** | **without** | **1.00** | 0.1 | **8.4** | **1,798** | **36** | 167,403 | **24,891** | **48,404** | 0 | **0.63** | 60 |

Delegation (confirmed from transcripts):

- **deep-read, both with-skill runs:** "Thirteen records. This is a wide multi-file read, so
  I'm handing the extraction to the Haiku explorer and will spot-check its report against the
  source before I present it." The gate then ran: a grep over status and outcome lines plus
  two spot-read records in one run, two spot-reads in the other. The explorer read all 13 files
  (about 68k input-side tokens, 6k to 11k output) and the lead's context ended 11.7k tokens
  smaller than the baseline's.
- **triage-failures, both with-skill runs, no delegation:** "Running a known command whose
  output I must re-run myself for the gate anyway, so I'll run it inline with capped output
  rather than delegate."
- **write-tests run 1:** one `fabflows:test-runner` spawn, again a fallback after the lead's
  own shell call was denied.

### What it means (inferred unless marked)

1. **Quality tie holds:** every task assertion passed in all 20 runs (confirmed).
2. **Delegation pays where the skill says it should, and the margin is modest.** The baseline
   lead's 13 Reads cost it mostly cache writes (43.6k tokens at Fable's 1-hour rate, roughly
   $0.87 of its $1.07). The fabflows lead avoided most of that but still wrote 31.9k (two Skill
   loads, the brief, the worker's report, its own spot-checks), and the Haiku explorer added
   about $0.10. Net about 12% cheaper, and the lead kept 12k tokens out of its context, which
   compounds over a long session in a way a single-task run cannot show. Wall time doubled
   because the worker's read runs before the lead can continue.
3. **The test-runner row is self-defeating for a bare test run.** The gate tells the lead to
   re-run the command itself, so delegating only adds a worker's cost on top. The row can pay
   only when the worker does more than run (writes tests, triages a log the lead's capped
   re-run would not show) or when the gate for it is relaxed to a cheaper check. That is a
   design decision (a DEC), not a benchmark fix.
4. **The residual denials are shell idioms around exit status and log capture.** Three of
   the four with-skill denials are the lead's own: `echo "exit=${PIPESTATUS[0]}"` twice and a
   `$TMPDIR` redirect with an `echo "exit=$?"` once, all refused by don't-ask mode as variable
   expansions; the report contract's "exit status" wording invites the idiom. The fourth is a
   fallback worker's `cd`. The baseline lead hit one, a redirect of the same kind. This is an artefact of the benchmark's permission
   mode, not of real sessions, which prompt instead of denying.
5. **Short tasks still pay the skill's overhead** (+33% to +42%) for the same reasons as
   iteration 1: two Skill loads, a deliberation turn, more cache writes. Iteration 1's +64%
   included the denial cascades on top.

### Where this leaves the hypotheses

- **H4 (volume task): answered.** Delegation happens by routing and pays on a wide read.
  It does not happen on a single test run, by design.
- **H1 (trimmed skill):** iteration 3, running with the snapshot in `snapshots/h1-trimmed`.
- **H2 (refuter on Sonnet), H3 (editor on Haiku):** still unexercised; no task reached those
  tiers. Need direct-spawn probes.
- **New, H5: relax the test-runner gate** to "confirm exit status and the failing lines"
  rather than a full re-run, or reword the row to "write and run tests", and measure whether
  the lead then delegates test runs at lower total cost. A DEC-worthy change.
- **New, H6: trigger and load scope.** On short tasks the skill is overhead every time it
  loads. Narrow the description toward volume and multi-step work, or make `using-fabflows`
  the only entry so the load is paid once per session.

## Iteration 1 (2026-09-19): fabflows 0.3.6 against a plain session

**Bottom line.** On four short tasks a Fable lead produced identical-quality work with and
without fabflows, and the fabflows session cost about 64% more at list price. The routing
table never fired: in all eight with-skill runs the lead read the skill and, following its
own "when not to delegate" rules, did the work inline. The extra cost is the skill itself
acting on the lead: more deliberation, more self-verification, more turns. Whether delegation
pays where it is meant to (large volume kept out of the lead) was **not tested**, because every
task here turned out to be a short chain. That is the next thing to measure.

### Setup (confirmed)

- 16 runs: 4 tasks x 2 arms x 2 repeats. Lead `claude-fable-5-1` at `--effort medium`.
  Fixture: a fresh clone of this repo at `3fbe15b` (equal to `origin/master`, fabflows 0.3.6)
  per run, on a `bench/` branch.
- `with_skill` loads `plugins/fabflows` via `--plugin-dir` and the prompt opens with "Invoke the
  fabflows:using-fabflows skill first". `without_skill` gets the bare task and has no fabflows
  agents, skills or hooks.
- Clean room in both arms: every other installed plugin off, `--strict-mcp-config`, advisor
  removed. System prompt about 41k tokens at the first turn in both arms.
- Grading is programmatic against the clone (tests run by the harness, `git status`, file
  contents, a functional guard check). See `README.md` for the tasks.
- Token attribution: lead totals from the result's `usage`, per-model totals from `modelUsage`,
  worker totals from the Agent tool result's `subagent_tokens`. Per-message stream events give
  input-side numbers and context growth only; their output field is a placeholder.

### Observed (means of 2 runs per cell; `cells.json` has every run)

| task | arm | quality | denials | turns | lead out | thinking | cache read | cache write | final ctx | worker out | list $ | sec |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| wide-search | with | 1.00 | 0.0 | 10.0 | 2,428 | 464 | 206,633 | 51,236 | 51,268 | 0 | 1.20 | 55 |
| wide-search | without | 1.00 | 0.0 | 4.0 | 1,636 | 103 | 130,481 | 17,339 | 43,545 | 0 | 0.46 | 31 |
| scoped-edit | with | 1.00 | 2.0 | 14.0 | 2,191 | 174 | 388,396 | 27,200 | 53,406 | 0 | 0.75 | 55 |
| scoped-edit | without | 1.00 | 1.5 | 9.0 | 1,748 | 51 | 245,765 | 19,945 | 46,151 | 0 | 0.55 | 52 |
| write-tests | with | 1.00 | 3.0 | 13.0 | 3,346 | 813 | 425,220 | 30,588 | 56,794 | 360 | 0.92 | 89 |
| write-tests | without | 1.00 | 2.0 | 8.0 | 1,904 | 111 | 251,911 | 22,713 | 48,919 | 0 | 0.61 | 51 |
| short-chain | with | 1.00 | 2.5 | 15.0 | 2,698 | 399 | 437,736 | 27,899 | 54,105 | 206 | 0.81 | 83 |
| short-chain | without | 1.00 | 3.0 | 13.0 | 2,179 | 79 | 328,607 | 20,589 | 46,795 | 0 | 0.61 | 42 |
| **all** | **with** | **1.00** | 1.9 | **13.0** | **2,666** | **462** | **364,496** | **34,230** | **53,893** | 141 | **0.92** | **70** |
| **all** | **without** | **1.00** | 1.6 | **8.5** | **1,866** | **86** | **239,191** | **20,146** | **46,352** | 0 | **0.56** | **44** |

Quality is the share of task assertions passed (the environment check "no tool call denied" is
reported separately as `denials`). Tokens are the lead's. `final ctx` is the lead's last-turn
input. List $ is the result's `total_cost_usd` (`costBasis: list`).

Per-run delta, with minus without: **+4.5 turns, +799 output tokens (of which +377 thinking),
+125k cache-read, +14.1k cache-write, +1.3k first-turn context, +7.5k final context, +$0.36
(+64%), +26 s.**

Delegation, from the transcripts (confirmed):

- **0 of 8 with-skill runs delegated by routing.** Each lead wrote a sentence like "two greps
  with path:line output are all this needs, and the result is compact enough that a worker
  would keep nothing out of my context" (wide-search) or "two one-line edits plus a known
  command, so per the when-not-to-delegate rules I'll do it inline" (short-chain).
- **3 spawns happened, all `fabflows:test-runner`, all fallbacks:** the lead's Bash was denied,
  its PowerShell was denied, and it handed the test run to a worker whose Bash was denied the
  same way. Each such spawn cost about 10k to 28k worker input tokens and a few hundred output
  tokens, and the lead's verification gate never ran (0 re-runs after a spawn in any run).

### What it means (inferred unless marked)

1. **Quality tie.** Every task assertion passed in every run in both arms (confirmed).
2. **On a short task the skill is pure overhead, and the overhead lands on the lead.** Three
   parts, from the cleanest cell, wide-search, where neither arm hit a denial:
   - The skill prose. Two Skill loads (about 14.7k characters, roughly 3.7k tokens) plus the
     plugin's agent descriptions: +1.3k tokens at the first turn, part of the +7.5k final
     context. Written to cache once, then re-read each turn at Fable's cheapest rate.
   - Deliberation and self-verification. Thinking rose from 103 to 464 tokens, and the lead ran
     two extra greps to "confirm" the frontmatter delimiters before answering. The skill's
     verify-everything framing is written for worker reports, but the lead applied it to its own
     inline work.
   - Turns. 10 instead of 4. Two of the six extra turns are the mandatory Skill invocations
     (`using-fabflows`, then `fabflows`); the other four are the deliberation and confirmation
     greps above. Every turn appends its tool results to the cache, and cache writes at the
     1-hour rate are the dominant cost: reconstructing each arm from Fable list prices ($50/M
     output, $0.25/M cache read, $20/M 1-hour cache write) gives $0.91 with and $0.56 without,
     against reported $0.92 and $0.56, with cache writes about 74% of each.
   - One task per session. Each benchmark session runs exactly one task, so the fixed cost of
     loading fabflows (two Skill turns, roughly 4k tokens written to cache once) is charged to
     that one task. In a real `using-fabflows` session it is paid once and spread over every
     task that follows; the recurring per-task cost is the residual, the deliberation,
     self-verification and extra turns.
3. **DEC-0004's prediction held on every task.** "For a short dependent chain, the lead alone
   is cheaper." All four tasks were short chains, including wide-search, which was designed as
   the delegation case and turned out to be answerable with two greps. So iteration 1 confirms
   the cost of loading fabflows on small work and says nothing about the regime it exists for.
4. **The tier questions are still open.** Explorer and editor were never spawned; refuter,
   investigator and researcher were out of scope. Pre-registered H2 (refuter on Sonnet) and H3
   (editor on Haiku) cannot be judged from this data.
5. **Environment confound, symmetric.** Don't-ask mode denied every Bash command that began
   with `cd "<fixture>" &&` and every PowerShell call: 28 denials across the 16 runs (25 by the
   lead, 3 by the fallback workers), 1.9 per with-skill run and 1.6 per baseline run. Each denial costs a turn and a retry, so turns and
   cost for scoped-edit, write-tests and short-chain are inflated in both arms by roughly 1.5 to
   3 turns. wide-search had zero denials and shows the same direction, so the conclusion stands.
6. **The guard fired inside the session** 4 to 10 times per with-skill run (PreToolUse on the
   lead's Read, Edit, Grep and Bash; confirmed via `FABFLOWS_PROBE`). Its cost is process spawn
   time, not tokens, and was not isolated.

### Static review (no runs)

- `skills/fabflows/SKILL.md` is 13,544 characters and `using-fabflows` 1,165; both load on every
  fabflows session and the main skill is re-injected after compaction inside a shared 5k-token
  cap. The build-loop failure-mode paragraph, "Boundaries" and "Guard hook rules" restate other
  documents or apply only when the loop runs.
- `workflows/build.js` pays an Opus builder plus a Fable reviewer per round, up to three rounds.
  DEC-0004 admits the Fable-reviewer choice was inferred, not measured. Deferred with the loop.
- The non-negotiables ("never accept an unverified claim", "never do mechanical work while a
  worker fits") and "when not to delegate" pull against each other by design (DEC-0012). On these
  tasks the lead resolved the tension toward inline work every time, and then verified its own
  inline work as if it were a worker's.

### Recommendations for iteration 2

Ordered by how much they change what we know:

1. **H4, new, run first: a volume task.** Something whose evidence is large but whose answer is
   small, so delegation should pay by the skill's own rule: for example, read every agent body
   (18 files) and list each one's discipline rules with `file:line`, or run the whole plugin
   suite with a planted failure and report each failing assertion verbatim. If the lead still
   does not delegate, or delegates and still costs more, the skill's premise needs revisiting.
2. **H0, harness: remove the shell denial confound** before any further runs. Add a permission
   rule for `cd`-prefixed Bash or use bypass permissions inside the throwaway clone, and confirm
   the PowerShell allow syntax.
3. **H1, trimmed SKILL.md, with a sharper target than size.** Scope the verification gate to
   worker reports in as many words, move the build-loop failure prose to `references/`, and cut
   the restated sections. Rerun tasks 1 to 4 with the snapshot via `--plugin-dir`.
4. **Trigger scope.** The skill description asks to fire on "any task a Haiku or Sonnet worker
   could do". Iteration 1 says loading it on a short task costs +64% for nothing, so narrowing
   the description toward volume and multi-step work is a candidate decision once H4 is in.
5. **H2 and H3** (refuter on Sonnet, editor on Haiku) need tasks that reach those tiers or direct
   worker spawns with prepared diffs. Behind H4.

### Confidence

- **Confirmed:** every number in the table (from the result events), the quoted lead reasoning
  and the fallback nature of all three spawns (from transcripts), the denial cause (from
  `permission_denied` events, all `decision_reason_type: mode`).
- **Inferred:** the cost decomposition (list prices; reconstruction matches within 2%), the
  attribution of extra cache writes to extra turns and confirmation greps.
- **Uncertain:** how the subscription weighs Fable tokens against its cap; whether a volume task
  flips the delta.

### Limitations

- Two repeats per cell: direction, not significance.
- All four tasks are short chains, so this measures the skill's overhead, not its intended
  benefit.
- One task per session, so the skill's one-time load is charged entirely to that task. The
  +64% is an upper bound on the per-task overhead in a longer session.
- The with-skill prompt names the skill explicitly; triggering is not measured.
- Windows: `os.tmpdir()` short names broke edits until resolved, and don't-ask mode denies
  `cd`-prefixed Bash and all PowerShell. Both are recorded in the run log.
- The verification gate and the build loop remain unmeasured.

### Reproduce

```bash
node plugins/fabflows/evals/harness/run.js --iteration 1            # print the matrix
node plugins/fabflows/evals/harness/run.js --iteration 1 --confirm --parallel 2
node plugins/fabflows/evals/harness/summarize.js plugins/fabflows/evals/runs/iteration-1
```

Raw runs (transcripts, metrics, gradings, `review.html`) live under `runs/iteration-1/`, which is
gitignored.
