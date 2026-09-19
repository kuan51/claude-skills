# fabflows benchmark results

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
