# fabflows benchmark results

Newest iteration first. Every number is a mean of two runs per cell unless stated; `cells.json`
under each iteration directory has every run.

## Iteration 3 (2026-09-20): H1, the trimmed skill

**Bottom line.** A trimmed skill (8,362 characters against 13,544; the build-loop failure
handling moved to an on-demand reference file; the gate scoped in as many words to worker
reports) **removes about three quarters of the overhead on a short task** and changes nothing
on the triage task, but **gave back the volume-task win**: one of two deep-read runs read all
13 files itself where the full skill delegated both times. Same quality throughout. The trim
as drafted over-corrects on one clause; a middle version is the obvious next test, and it is
a decision for you because the approved run budget is spent.

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
4. **The residual denials are skill-induced.** Three of the four with-skill denials come from
   the lead appending `echo "exit=${PIPESTATUS[0]}"` to its test command, which the report
   contract's "exit status" wording invites, and which don't-ask mode refuses as a variable
   expansion. The baseline lead did it once. This is an artefact of the benchmark's permission
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
