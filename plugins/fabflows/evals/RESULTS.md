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
builds a whole component from a spec. Both fabflows leads launched it on the skill's routing row
without the task prompt naming it, obeying the standing rule that `using-fabflows` sets. It
produced the same result on the 41 hidden tests as a bare session, for +53% list cost and 2.1x
the wall clock. Total output roughly doubled, 57,583 tokens against 28,679; Fable output fell
43% and the lead's own output fell 67%, with an Opus builder and, in one run, an Opus refuter
carrying the rest. The loop's own central claim is still unmeasured: run 1's review found nothing
to rework, and run 2's in-loop review never ran at all, so no rework round has ever fired and the
two-round cap has never been approached. Within the lead's own work, the measurable diminishing
return remains self-verification: the full skill made the lead re-confirm grep results it had
just read, and stating that the gate is for worker reports removed it without any loss in
quality.

**The efficiency answer, in the currency you actually pay.** List dollars say the loop costs +53%.
The subscription meter says something else, and the meter is what binds. Every transcript records
the account's own rate-limit utilisation, and over each arm's pair of runs the five-hour window
moved +0.11 for fabflows against +0.10 for a plain session, a ratio of 1.10. That tracks the
ratio of Fable tokens (1.08) and nothing else: total tokens differ by 2.13x and list dollars by
1.53x. So the meter charges for the lead's own model and barely notices an Opus worker. The loop
doubles the tokens and costs half again as much at list price while moving the meter about as far
as doing the work inline. Move the in-loop reviewer off Fable, the one change these runs support
unambiguously, and it moves the meter slightly less than a plain session (a Fable-token ratio of
0.98) for the same graded result. Two-decimal readings and one pair per arm, so this is direction,
not a measurement, but it is direction in the right currency and it was free to collect.

**Iteration 7, the planted defect.** A task built to make quality vary did not: all nine runs in
all three arms fixed the planted bug before any review ran, because the spec stated the rule and
the failing example. It measured the lead's sizing instead: two of three `loop` leads declined
the loop as too small and were cheapest; delegation cost +56% and 2.5x wall clock. The review
question stays open until the defect is not derivable from the spec.

**Iteration 6, on Opus 5.5 workers.** The same build task, re-run once the `opus` alias resolved
to Opus 5.5 and on a machine where no shell call was denied: the loop ran end to end in both
runs and came in 18% cheaper at list, 14% faster, with the lead writing 83% fewer output tokens
and Fable list dollars down 52%, for the same 41 of 41. The first iteration where the loop beat
inline work on every cost axis. Quality is still a ceiling and the rework path is still
unexercised.

Newest iteration first. Every number is a mean of two runs per cell unless stated; `cells.json`
and `benchmark.json` under each iteration directory are tracked and hold every run.

## Iteration 7 (2026-09-22): the planted defect, and who found it

**Bottom line.** The first task built to make the graded outcome vary did not vary: all nine
runs, across all three arms, fixed the planted caret-on-zero defect and passed the whole hidden
suite. The Fable lead, in every arm, read `SPEC.md`, probed `satisfies('0.3.0', '^0.2.3')` by hand
before writing anything, and fixed the library before the feature. So no reviewer ever saw the
defect ship, and the question the task was built to answer, whether the loop's review catches
what a builder misses, is still open. What the nine runs did measure is the lead's own sizing
judgement and the price of delegation on a small task, and both point the same way as iterations
1 to 4: for a change this size the skill's own rule says do it yourself, and two of the three
`loop` leads did exactly that.

### Setup (confirmed)

Task 8 `review-catch` (PR #55): a brownfield fixture (the reference resolver with one line
changed at `src/index.js:90`, so `^0.2.3` accepts `0.3.0`), a `SPEC.md` asking for a
`lockstep outdated` subcommand and stating the caret-on-zero rule with the failing case as its
acceptance example, and a hidden suite of 8 tests proven against a separate solution. Three arms,
all loading the shipped plugin and invoking `using-fabflows`: `inline` (Agent and Workflow
removed), `delegate` (Workflow removed), `loop` (nothing removed). Three repeats, interleaved,
three runs concurrent, Fable lead at medium effort, caps 120 turns, $15, 30 minutes. Command:

```bash
node plugins/fabflows/evals/harness/run.js --iteration 7 --tasks 8 --parallel 3 --confirm
```

### Observed

| arm | run | hidden | checks | defect fixed | turns | wall s | lead out | worker out | lead ctx | Fable $ | list $ | what ran |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| inline | 1 | 8/8 | 17/17 | yes | 19 | 81 | 6,509 | 0 | 56,865 | 1.58 | 1.58 | lead alone |
| inline | 2 | 8/8 | 17/17 | yes | 18 | 93 | 6,946 | 0 | 56,406 | 1.18 | 1.18 | lead alone |
| inline | 3 | 8/8 | 17/17 | yes | 21 | 91 | 7,009 | 0 | 58,944 | 1.20 | 1.20 | lead alone |
| delegate | 1 | 8/8 | 17/17 | yes | 20 | 227 | 8,050 | 15,441 | 67,068 | 1.95 | 2.58 | Opus editor, then Opus refuter, both via Agent |
| delegate | 2 | 8/8 | 17/17 | yes | 23 | 191 | 7,262 | 9,785 | 64,912 | 1.35 | 1.59 | Sonnet editor via Agent, no review |
| delegate | 3 | 8/8 | 17/17 | yes | 21 | 247 | 9,638 | 12,951 | 63,868 | 1.48 | 2.01 | Opus editor, then Opus refuter, both via Agent |
| loop | 1 | 8/8 | 18/18 | yes | 19 | 170 | 6,209 | 8,438 | 64,598 | 1.24 | 1.70 | `fabflows:build`: build:1, review:1 ACCEPT |
| loop | 2 | 8/8 | 17/18 | yes | 17 | 90 | 6,849 | 0 | 56,267 | 1.10 | 1.10 | lead alone (sized it small) |
| loop | 3 | 8/8 | 17/18 | yes | 18 | 91 | 6,769 | 0 | 58,477 | 1.16 | 1.16 | lead alone (sized it small) |

Means: inline $1.32 and 88 s; delegate $2.06 and 222 s (+56%, 2.5x); loop $1.32 and 117 s over
all three, or $1.70 and 170 s for the one run that launched the loop. Fable dollars: inline $1.32,
delegate $1.59, loop $1.17. No tool call was denied in any run. Every worker that ran on the
Opus tier ran on `claude-opus-5-5`.

### What the runs showed (confirmed)

1. **The defect was too discoverable.** `SPEC.md` states the rule and the failing example. Nine
   of nine leads checked the example against the existing library before building, found it
   wrong, and fixed it first. The primary outcome saturated at the ceiling in the other
   direction from iterations 5 and 6: not because the task was easy to pass, but because the
   spec handed the bug to the reader.
2. **The `loop` arm launched the loop once in three.** Runs 2 and 3 sized the change ("about
   25 CLI lines plus one test", run 3 said) as below the point where a build loop pays and did
   it inline. The `requireReview` expectation caught both. This is the skill's own "do the task
   yourself when it is one short dependent chain" rule winning over the standing rule that a
   spec'd change goes to the loop. The two runs cost $1.10 and $1.16, the cheapest in the table.
3. **The `delegate` arm reproduced the loop by hand.** Two of three leads invoked
   `fabflows:build`, found no Workflow tool, and ran an Opus editor and an Opus refuter through
   the Agent tool themselves, overriding the editor's Sonnet pin with `model: 'opus'`. The third
   spawned the editor on its Sonnet pin and skipped review. So B minus A is not "delegation
   without review"; two of its three runs carried a review too.
4. **The one real loop run** cost $1.70 against an inline mean of $1.32, moved 58% of output
   tokens to Opus, and its reviewer returned ACCEPT with nothing to fix, correctly, since the
   builder had already fixed the defect.

### What it means

- The question is still open. A reviewer has never been shown a shipped defect. To get one, the
  defect must not be derivable from the spec text: state only the feature, keep the rule out of
  `SPEC.md`, and let the hidden test carry it; or plant it where the acceptance example does not
  reach. That is a one-file change to the fixture, and the harness needs nothing new.
- The tool-removal design worked: no denials, and the arms differed only in what the lead could
  reach. But an arm defined by what is removed does not fix what the lead does with what is
  left, so "delegate" needs its brief stated in the prompt if it is to mean "no review".
- The sizing rule is doing its job. On a task this small, inline was cheapest in every
  comparison, and the leads that had the loop available mostly declined it.

### Reproduce

```bash
node plugins/fabflows/evals/harness/run.js --iteration 7 --tasks 8 --parallel 3 --confirm
```

## Iteration 6 (2026-09-22): the same build, with Opus 5.5 workers

**Bottom line.** On the same task as iteration 5, and for the first time, the loop was cheaper
than doing the work inline: $2.92 against $3.55 at list price (-18%), 414 s against 480 s wall
clock (-14%), for the same graded result, 41 of 41 hidden tests and 50 of 50 checks in all four
runs. The build loop ran cleanly in both fabflows runs: an Opus 5.5 builder, then an Opus 5.5
reviewer inside the loop that returned ACCEPT with an empty must-fix list, then the lead's gate.
No tool call was denied anywhere. The lead's own output fell from 38,314 tokens to 6,660 (-83%),
and its final context from 85,905 to 61,714 (-28%). Fable list dollars, the meter that binds a
subscription, fell from $3.55 to $1.69 (-52%).

### Setup (confirmed)

Task 7 `build-component` unchanged from iteration 5. Lead Fable at medium effort; `with_skill`
loaded the shipped `plugins/fabflows` at 0.4.1 (no snapshot, no patch); two runs per arm, each
pair concurrent, on Linux (Claude Code 2.1.280, OAuth). The plugin's Opus-tier pins are the
`opus` alias, which the CLI documents as the latest model. Every builder and reviewer message in
the workflow transcripts records `claude-opus-5-5` (76 messages, none on another id), so the
alias resolved to Opus 5.5 without any change to the plugin. Command:

```bash
node plugins/fabflows/evals/harness/run.js --iteration 6 --tasks 7 --repeats 2 --parallel 2 --confirm
```

### Observed

| run | hidden | checks | turns | wall s | lead out | worker out | lead ctx | Fable out | Opus out | list $ | denials | loop |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| with_skill r1 | 41/41 | 50/50 | 17 | 419 | 6,737 | 38,979 | 62,697 | 6,737 | 38,979 | 2.97 | 0 | build:1, review:1 ACCEPT |
| with_skill r2 | 41/41 | 50/50 | 11 | 408 | 6,583 | 36,714 | 60,731 | 6,583 | 36,714 | 2.87 | 0 | build:1, review:1 ACCEPT |
| without_skill r1 | 41/41 | 50/50 | 36 | 600 | 42,867 | 0 | 92,537 | 42,867 | 0 | 4.09 | 0 | none |
| without_skill r2 | 41/41 | 50/50 | 19 | 360 | 33,761 | 0 | 79,272 | 33,761 | 0 | 3.01 | 0 | none |

Worker output is exact: both workflow agents' own transcripts were copied and read, so nothing
here is a residual. Means: list $2.92 against $3.55 (-18%); wall 414 s against 480 s (-14%);
Fable output 6,660 against 38,314 (-83%); total output 44,507 against 38,314 (+16%); total
tokens across every category 1.01M against 1.80M (-44%), almost all of it Fable cache reads
(467k against 1.81M), because a lead that writes the code itself re-reads its growing context on
every one of its 27 turns, while a lead that launched a workflow took 14 turns and its builder
re-read a smaller context of its own. Lead context 61,714 against 85,905 (-28%).

Against iteration 5, where the same treatment cost +53% list and 2.1x wall clock, three things
changed and each pushes the same way:

1. **The loop ran as designed.** No denial fired, so no builder was escalated out of the loop
   and no lead re-created a review by hand. Both reviews ran inside the loop on the pinned tier.
   Iteration 5's one clean run cost $4.12; both runs here cost under $3.
2. **Opus 5.5 is cheaper per token than Opus 5** ($4/$20 per MTok against $5/$25) and the
   builder wrote less: 26k to 30k output tokens against 37k in iteration 5 for the same passing
   result.
3. **The bare lead did more ungraded work.** Both bare runs wrote `docs/CONVENTIONS.md`,
   `docs/DECISIONS.md` and `docs/RUNLOG.md` because the user's global `CLAUDE.md` asks for them
   (13 and 12 files changed against 6 in each fabflows run). In iteration 5 only one bare run did
   that. The builder, briefed with the spec alone, did not. That is a real effect of the brief,
   not noise, but it is one the grader does not see.

### What it means, and what it does not

- **The efficiency claim now has a measurement behind it, in the right direction.** For a
  spec'd component built from scratch, fabflows spends fewer list dollars, less wall clock and
  half the Fable tokens of an inline build, at the same graded quality.
- **The quality claim is still a ceiling.** 41 of 41 in all eight runs across two iterations.
  The task cannot show the reviewer catching anything; both reviews returned ACCEPT with nothing
  to fix, so the rework path remains unexercised. The planted-defect design under "What
  iteration 6 should do instead" below is still the way to measure that.
- **Two runs per arm on one task.** Direction, not significance. The bare arm's own two runs
  differ by $1.08 and 240 s.
- **Platform changed.** Iterations 1 to 5 ran on Windows under the don't-ask-mode denials
  documented in `README.md`; this one ran on Linux with none. Wall-clock and denial counts are
  not comparable across that line; the token and dollar figures are.

### Reproduce

```bash
node plugins/fabflows/evals/harness/run.js --iteration 6 --tasks 7 --repeats 2 --parallel 2 --confirm
```

## Iteration 5 (2026-09-21): a complex build, and the build loop at last

**Bottom line.** On the task fabflows was designed for, a whole component built from a spec, the
skill did what it says: both leads launched `fabflows:build` without the task prompt naming it,
an Opus builder wrote and committed the code, and the lead kept the judging. The graded outcome
was a tie, 41 of 41 hidden tests in all four runs. The loop cost +53% list and 2.1x the wall
clock, and moved 43% of output tokens off Fable. Its own core mechanism, a reviewer catching what
a builder missed and rework inside a capped loop, never fired: run 1's review found nothing to
rework, and run 2's in-loop review never ran at all. What the runs did expose is five concrete
defects in the plugin, listed below, three of which cost a turn or a review in these very runs,
and a token ledger that says where the loop's extra spend goes and which of it is recoverable.

Every claim in this section was then attacked by a separate refutation pass, which upheld 30,
weakened 22 and overturned 11 of the first draft's claims. What survives is below; the
corrections it forced are marked where they change the reading.

### Setup (confirmed)

Task 7 `build-component`: a greenfield fixture holding only `SPEC.md` (a semver range grammar, a
flat backtracking resolver with named conflict reporting, and a two-subcommand CLI), a
`package.json` and a README. Prompt: build it, write tests, `npm test` must pass, commit, leave
the tree clean. Graded by 41 hidden acceptance tests run against the fixture afterwards, plus a
clean tree, a commit, no added dependency and no unfinished workflow. Lead Fable at medium
effort, caps 200 turns, $60 and 120 minutes. `with_skill` loaded the narrowed trim (the DEC-0015
candidate) from a staged plugin copy. Two runs per arm, the pair in each arm concurrent.

Two things about this design limit what any number below can mean. The bare arm had **no plugin
loaded at all**, so the treatment bundles the prompt prefix, a mandated skill invocation, two
skill loads, the guard hook running on every tool call, and the build loop. Nothing here can
attribute a cost to the loop alone; the missing arm is plugin loaded, skill invoked, loop not
used. And all four runs passed 41 of 41 hidden tests, so the graded outcome has **no variance**
and therefore no power to detect a quality difference in either direction. "Quality is a tie" is
a ceiling effect, not a finding. The task was too easy to discriminate.

### Observed

| run | hidden | checks | turns | wall s | lead out | worker out | lead ctx | Fable out | Opus out | list $ | denials | loop |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| with_skill r1 | 41/41 | 49/50 | 18 | 696 | 5,562 | 51,153 | 62,919 | 19,612 | 37,103 | 4.12 | 3 | build:1, review:1 ACCEPT |
| with_skill r2 | 41/41 | 49/50 | 25 | 719 | 13,122 | 45,329* | 72,538 | 13,122 | 45,329* | 3.89 | 7 | build:1, then escalated |
| without_skill r1 | 41/41 | 49/50 | 19 | 318 | 28,848 | 0 | 72,620 | 28,848 | 0 | 2.54 | 1 | none |
| without_skill r2 | 41/41 | 50/50 | 19 | 342 | 28,510 | 0 | 72,675 | 28,510 | 0 | 2.70 | 0 | none |

\* Run 2's refuter was spawned through the Agent tool, which carries no per-agent output, so the
model total is exact but its 15,964 share is a residual.

Means: list $4.01 against $2.62 (+53%); Fable output 16,367 against 28,679 (-43%); Fable cache
writes 65,539 against 49,797 (+32%); wall 707 s against 330 s (2.1x). Total output roughly
doubled, 57,583 against 28,679, so nothing was transferred: the loop adds an Opus builder rather
than moving the lead's tokens. The lead wrote 10% of all output tokens in the first fabflows run
and 22% in the second, against 100% in both bare runs. In the first fabflows run the lead was
active for 108 s of 696 s while the Opus builder (402 s) and the Fable reviewer (188 s) ran one
after the other.

The only failed expectation anywhere is the environment check "No tool call was denied". Ten of
the eleven denials are don't-ask-mode refusals; the eleventh is run 2's blocked read of the
plugin directory, which is defect 3 below. None came from the fabflows guard. The fabflows arm is
more exposed partly because it runs three shell-issuing agents instead of one, and partly because
the skill's own escalation path told the lead to read a file this environment blocks. The failed
expectation is an environment note rather than a quality signal, but one of these denials is what
cost run 2 its in-loop review.

### What the loop did, round by round (confirmed)

**The loop ran once, not twice, and it ran by accident.** `build.js` tells the builder that a
permission denial is a blocker and to open its report with `Permission denied:`. `build.js` then
escalates any report whose first line opens that way. Run 2's builder followed the instruction
and was routed out of the loop before any review; run 1's builder ignored the mandated wording,
opening with "One permission denial occurred...", and was rewarded with a review. Under a harness
where a denial was near-certain, escalation is the design's modal behaviour and the completed loop
is the outlier. Every figure below that describes a full build-and-review cycle rests on that one
run.

Run 1 is the clean path: the lead checked the tree and branch, launched the loop, the Opus
builder implemented and committed (37,103 output tokens, 402 s, 22 tool calls), a fresh Fable
reviewer re-ran the tests and read every changed file, returned ACCEPT with zero must-fix items
and five advisory notes, and the lead then ran the gate itself. Run 2 diverged: the builder
finished and committed, but the workflow escalated as `blocked`, so the loop's own review never
ran. The lead re-created it by hand, spawning `fabflows:refuter` through the Agent tool, which
ran on Opus and also returned ACCEPT with no must-fix items, and then writing its own probe
scripts. So run 2 did get an independent review; what it lost is a review the loop pays for and
schedules, replaced by one the lead had to brief, spawn and pay for on its own turn. The
reference file prescribes that recovery for a `reviewer-blocked` escalation; for the `blocked`
reason this run actually got, it says the denial is the user's to resolve. The lead could not
read the file either way, and improvised the right shape anyway.

### Five defects the runs exposed in the plugin (confirmed)

1. **The skill-to-workflow bridge hands `args` across as a string.** In both runs the lead's
   first launch died in well under a tenth of a second (the workflow task reports 29 ms and 37 ms)
   with `not-started / missing-args`, because the `fabflows:build` Skill takes a string and its
   expansion shows `Workflow({name: "fabflows:build", args: "spec: ..."})`, while `build.js`
   spreads `args` as an object. Each lead then read the workflow script to work out the shape and
   relaunched. Cost: one dead launch and about 21 s per run, roughly 155,600 Fable tokens and
   1,000 of the lead's own output tokens, in any session where the lead launches the loop through
   the Skill rather than calling `Workflow` directly with an object. The fix these runs show would
   work is a string parser in `build.js`: a sentence in `whenToUse` is already reprinted verbatim
   inside the same Skill expansion that generates the string-args `Invoke:` line, so it is not
   shown to be enough on its own. A sentence in the skill's build-loop section, which the lead
   reads before choosing the route, is the more plausible half of a prose fix.
2. **The same recovered denial produced opposite outcomes.** Both builders hit the identical
   denied `cd <repo> && npm test | tail`, retried without the `cd`, passed, and returned
   `status: done` with an empty `blocker`. Run 1's report opened "One permission denial occurred
   mid-work and was worked around per CLAUDE.md, not a blocker" and went to review; run 2's opened
   "Permission denied (transient, resolved)" and was escalated as blocked, so the loop's review
   never ran. The difference is the first word of a prose report, matched by `saysDenied`. The
   code's own comment says the blocker field is the real signal; the regex overrides it.
3. **The lead could not read `references/build-loop.md`, though only because of how the benchmark
   loads the plugin.** On escalation the skill tells the lead to read that file first. The run-2
   lead tried twice, by `cat` and by Read, and was refused both times, because the staged plugin
   copy sits in the repository outside the session's working directory and this user's global
   settings block reads outside it. The first draft called this a property of any install; that is
   wrong. `~/.claude/plugins/**` is exempt from that setting, so a plugin installed in the cache
   would have been readable, and the shipped 0.3.6 has no `references/` directory at all. The real
   risk is narrower: a plugin loaded from a development path with `--plugin-dir`, which is how the
   benchmark and anyone testing a branch runs it. It still bears on DEC-0015, which proposes moving
   this content into that file, because a lead that cannot read it gets no guidance at the one
   moment it needs some.
4. **The reviewer's model depends on how it is launched.** `refuter.md` pins `model: opus`, but
   `build.js` defaults `reviewerModel` to `fable`. So the in-loop reviewer ran on Fable (14,050
   output tokens charged to the capped model) while run 2's hand-spawned refuter ran on Opus.
   For a Fable-capped user that default works against the plugin's own tiering.
5. **`refuter.md` contradicts itself on denials.** One line says BLOCKED is for when the diff or
   the test command could not run; the next says a denied command also makes it BLOCKED and
   "never ACCEPT a change you could not test". Both reviewers were denied a command and returned
   ACCEPT, each noting the denial. The narrow rule is the one to keep: `refuter.md`'s own
   description and the review brief in `build.js` both already state it, and enforcing the broad
   rule instead would have turned run 1's ACCEPT into a `reviewer-blocked` escalation, which would
   have left iteration 5 with no successful loop run at all.

One open question closed in the plugin's favour: **the guard hook does fire inside Workflow-tool
agents.** The probe file records a `PreToolUse` payload for every builder and in-loop reviewer
tool call, tagged with `fabflows:editor` and `fabflows:refuter`, plus a `SubagentStop` each, and
no guard denials. `build.js` calls that "unverified" in a comment and the README listed it as a
gap; both can now say measured.

### What the grader does not see (and why it is weaker evidence than it looks)

Quality is a tie on the hidden suite, but the two arms did not ship equally sound work:

- `without_skill` run 1 committed `src/resolve.js` containing a raw NUL byte, written as a
  literal separator inside a string instead of the escape `\0`. The code runs and the tests pass,
  but git records the file as binary, so it has no textual diff: every present and future change
  to it shows only `Binary files differ`, and `git grep` and ripgrep skip its contents. Blame and
  patch transport still work, which the first draft got wrong.
- `without_skill` run 2 made five Conventional Commits, and its first two fail their own tests
  when checked out in isolation (1 test 0 pass, and 2 tests 0 pass). Its final report states
  "Each of the five Conventional Commits was checked green with its own test file before the next
  commit". That sentence is literally true, and the transcript shows the run doing exactly it.
  The check was worthless, because every run of it happened against a working tree that already
  held all five commits' files, so it proved nothing about any commit.
- Neither fabflows run produced a binary source file, and both committed once, atomically.

**The comparison is confounded, and the honest reading is narrower than the first draft's.** Three
of the four runs made exactly one feature commit, including a bare one, so only one run in the
experiment could structurally exhibit a mid-history broken commit, and it did. The single commit
is not a discovered property of the fabflows arm either: the builder brief in `build.js` says to
commit once the test command passes, which steers towards one end-state commit. The NUL byte is
likewise a one-run choice of string delimiter; the other three runs build the same key with
`JSON.stringify` and need no delimiter at all. Nothing in the loop checks a commit in isolation:
the gate and the refuter both run against the final tree and the cumulative diff, so the loop as
written would have passed that history too.

What is left is still worth stating. Two bare runs carried two different ungraded faults and
neither fabflows run did; a hidden test suite is not a sufficient quality axis for this
comparison; and a graded tie can hide differences either way. But this is a hypothesis about what
a review culture might catch, not evidence that the loop caught anything. No reviewer ever looked
at a bare run.

### What it means (inferred)

1. **The lead obeys the standing rule.** Both leads sent a spec-sized build to the loop without
   the task prompt naming it. That is less than the first draft claimed: the `with_skill` prompt
   mandates `using-fabflows`, whose standing rule already says a spec'd, sizeable change goes to
   `fabflows:build` and not to ask again (DEC-0011). What is measured is that the lead follows
   that rule and classifies this task correctly. The offer-first path a session takes without
   `using-fabflows` is still unmeasured. This is also the first iteration in which the `Workflow`
   tool was offered at all, so it is the first chance the loop ever had to fire.
2. **On a subscription the split matters more than the total.** The loop roughly doubles total
   output tokens while cutting Fable output 43% and the lead's own output 67%. If Opus and Fable
   weigh differently against the weekly cap, that is a saving; if they weigh the same, it is a 2x
   spend for the same graded result. The weighting is unpublished, so this stays directional, and
   it is the single fact that decides whether the loop is worth running as shipped.
3. **Escalation moves work, and it did not invert the tiering here.** Run 2's lead spent 10,317
   Fable output tokens across the twelve turns of its final segment, but it did not do the review
   itself: it re-delegated to an Opus `fabflows:refuter` and spent its own tokens on the brief, two
   probe scripts and the gate. Run 2 cost less than run 1 ($3.89 against $4.12) and emitted fewer
   Fable *output* tokens (13,122 against 19,612), precisely because the escalation skipped the
   in-loop reviewer that defaults to Fable. On total Fable tokens it used 15% more. That is one
   observation, not a rate, and it is an argument for fixing the reviewer's model rather than for
   tolerating escalations. It also means the denial fix and the reviewer-model fix have to ship
   together: routing more runs into a Fable review, without moving that review to Opus, would
   raise Fable spend rather than lower it.
4. **The loop's value case is unproven and needs a harder task.** Nothing needed rework, so the
   cap, the must-fix fence and the fresh-reviewer round are still untested. A task with a spec
   subtlety that a first pass reliably misses would measure it.

### What the subscription meter says (the number that actually binds)

Every run's stream carries `rate_limit_event` records holding the account's live utilisation of
its five-hour and seven-day windows. This was recorded in all four runs from the start and not
read until a confound review pointed at it. The two runs in each arm ran concurrently, so the
meter moves per pair, not per run.

| window | fabflows pair | bare pair | ratio |
| --- | --- | --- | --- |
| five-hour | 0.11 to 0.22, **+0.11** | 0.22 to 0.32, **+0.10** | 1.10 |
| seven-day | 0.49 to 0.50, **+0.01** | 0.50 to 0.52, **+0.02** | at the quantisation floor |

The five-hour window has usable resolution here, eleven and ten steps of 0.01. Comparing its
movement with each candidate measure of what the runs consumed:

| measure | fabflows : bare | distance from the meter's 1.10 |
| --- | --- | --- |
| **Fable tokens** | **1.08** | **0.02** |
| list dollars | 1.53 | 0.43 |
| Fable output tokens | 0.57 | 0.53 |
| all tokens, both models | 2.13 | 1.03 |

The meter moved with the lead's own model and effectively ignored 1.7 million Opus tokens. That
reframes the whole cost question. The +53% list figure and the doubled token count are real, and
neither is what a subscription charges: on the meter the loop is roughly neutral. With the in-loop
reviewer moved to Opus, the fabflows pair's Fable tokens fall to 1,594,734 against the bare pair's
1,622,124, a ratio of 0.98, so the loop would draw slightly less than doing the work inline.

Hold this loosely. The readings are two decimals, so the 1.10 ratio carries about ±10%; the
Fable-token ratio of 1.08 sits inside that band and the total-token ratio of 2.13 sits far outside
it, which is what makes the direction robust even though the exact weighting is not. There is one
pair per arm, the pairs ran fifteen minutes apart, and the seven-day window moved too little to
say anything at all. Future iterations should record the utilisation delta per run and run the
arms interleaved so each run's own movement can be read.

### Where the tokens went (the efficiency ledger)

Every token in the four runs, assigned to one phase. Cache write is attributed to the content it
cached rather than the message it was billed on; per-phase lead output is prorated by characters
inside exact per-turn totals, so a single phase figure is good to about ±50 tokens while the turn
and run totals are exact. The lead writes cache at the 1-hour rate and every worker at the
5-minute rate, which is why a lead token is the expensive kind.

| phase | fabflows r1 (clean) | fabflows r2 (escalated) | bare r1 | bare r2 |
| --- | --- | --- | --- | --- |
| session prime | in skill load | in skill load | F 0 / 12.1k cw | F 0 / 12.1k cw |
| skill load (two chained Skill calls) | F 67 / 13.6k cw / 62.4k cr | F 74 / 10.6k / 62.4k | — | — |
| orientation (spec, git and node state) | F 209 / 5.9k / 36.8k | F 195 / 3.1k / 36.8k | F 720 / 7.3k / 98.2k | F 122 / 5.3k / 22.8k |
| failed launch (string args) | F 1,418 / 3.1k / 85.6k | F 946 / 4.9k / 142.2k | — | — |
| relaunch with object args | F 895 / 2.1k / 99.4k | F 800 / 2.2k / 101.9k | — | — |
| **build round** | O 37,103 / 56.0k / 690.3k | O 29,365 / 40.3k / 499.0k | F 26,947 / 28.3k / 83.9k | F 23,999 / 25.9k / 443.9k |
| **review round** | F 14,050 / 48.1k / 97.6k | never ran | — | — |
| escalation triage and denied reads | — | F 677 / 5.0k / 109.3k | — | — |
| hand-spawned review (Agent) | — | O 15,964 / 50.3k / 278.6k | — | — |
| lead probe scripts | — | F 7,675 / 13.4k / 258.2k | — | — |
| lead gate | F 1,933 / 5.1k / 169.1k | in triage | F 52 / 1.3k / 57.2k | F 165 / 1.6k / 134.6k |
| unrequested docs | — | — | — | F 2,375 / 3.3k / 339.1k |
| final report | F 940 / 0 / 60.2k | F 728 / 0.7k / 71.8k | F 826 / 0 / 71.8k | F 950 / 0 / 72.4k |
| **total** | 1,597,962 tokens, $4.12 | 1,853,639, $3.89 | 460,546, $2.54 | 1,161,578, $2.70 |

Four things the ledger says that the headline numbers do not.

1. **Delegation is cheap; the review is the whole of the cost delta.** Decomposed by actor, the
   lead plus the Opus builder come to $2.92 against the bare arm's $2.62, +11%. Adding the review
   round takes it to $4.01, +53%. So 78% of the extra list cost is the review, and spawning an
   Opus agent to write code needs no plugin at all: the Agent tool does that. Whatever the loop is
   worth, it is the review that has to be worth it, and in the one run where a review ran it
   returned ACCEPT with zero must-fix items.
2. **The in-loop reviewer is the single largest Fable line item in a clean run.** Run 1's reviewer
   spent 14,050 output and 48,100 cache-write tokens, all on the capped model: $1.33 of the run's
   $4.12. It is also the whole of the arm's cache-write regression. The identical work on Opus
   costs $0.70.

   The two models' list rates, solved from the four runs' own reported costs and reproducing all
   six per-model figures to seven decimal places, are inverted rather than one being cheaper:

   | | Fable | Opus (1h context) |
   | --- | --- | --- |
   | input | $10/M | $5/M |
   | output | $50/M | $25/M |
   | cache write (5-minute, what workers pay) | $12.50/M | $6.25/M |
   | cache read | $0.25/M | **$0.50/M** |

   So Opus is half the price on everything a worker produces, and twice the price on what it
   re-reads. Review is output-heavy, so Opus wins comfortably here: for run 1's reviewer the
   output and cache-write savings come to $0.65 against $0.02 of extra cache-read cost, and the
   cache reads would have to be about 2.6 million tokens, 27 times what this reviewer used, before
   Fable became the cheaper choice. A worker that reads enormously and writes little is the case
   where the capped model is also the cheap one.
3. **Output, not cache, is what dominates this kind of work.** Earlier iterations found cache
   writes to be about three quarters of a run's cost, but those were short tasks that generated
   little. Here output is 53 to 57% of cost and cache write 37 to 39%. On build work the thing to
   attack is output tokens, and moving output onto a cheaper uncapped model is exactly what the
   loop does.
4. **The long idle wait is free.** The lead's 1-hour cache survived run 1's 591-second workflow
   gap intact, so waking it cost only the two agent reports (5,127 cache-write tokens). The risk
   is the TTL, not the wait: a full rework loop of three builds and three reviews at about 590 s
   each would cross an hour, and the lead would then re-prime its whole context at the 1-hour
   write rate, roughly $1.45 on a 72,000-token context. No run has approached that, so it is
   arithmetic rather than observation.
5. **Noise is larger than several of the deltas, including one this write-up leaned on.** The two
   bare runs differ by 2.52x on total tokens (460,546 against 1,161,578) for the same work, driven
   by message batching and by run 2 obeying the user's global `CLAUDE.md`. Output tokens are
   stable between them; totals and cache reads are not. The "+32% Fable cache writes" figure the
   first draft called the arm's one concrete regression does not survive this test either: the
   gap between the arms on that metric is smaller than the spread between the two fabflows runs,
   so it is not separable from run-to-run variance. The case for moving the reviewer off Fable
   does not need it and never did: one usage record and the price table settle it.

### The levers, after attack

Ten efficiency levers were proposed from the ledger and each was attacked twice, once on its
arithmetic and once on what it would cost quality. Two survive.

| lever | verdict | what it is worth |
| --- | --- | --- |
| Default the in-loop reviewer to Opus | **survives** | −$1.33 and −159,865 Fable tokens per review round, exact. Run 1's Fable spend $2.50 to $1.17. |
| Tell the lead `args` is an object | **survives** | −$0.16 of Fable per session, exact and conservative. Amortises to nothing over a long session. |
| Stop the prose regex overriding the contract | overstated | Sound one-token fix, but shipped alone it is a Fable *regression* of $0.61 to $1.08, because it routes runs back into a Fable review. |
| Trim the lead's post-accept gate | overstated | Recoverable is $0.17 to $0.19, not the $0.24 claimed, and half of that is denial fallout. The mandated gate itself costs $0.05. |
| Let the builder tier be chosen | overstated | Up to $0.97 at list price, all of it Opus, and nothing on Fable. Its cost table misstates run 1's builder by 24%. |
| Pass the spec as a path | refuted | The spec was never passed as a blob. Residual saving $0.02, and it deletes acceptance criteria. |
| Return escalation guidance in the result | refuted | Fixes a defect that has never shipped: 0.3.6 already holds the guidance inline. Only becomes real if DEC-0015 lands. |
| Collapse the skill chain | refuted | $0.023 per session, 0.55%, and `using-fabflows` is the session opt-in rather than a pointer. Re-opens DEC-0011. |
| Hand the reviewer the diff | refuted | Zero on a greenfield task where every file is new. An open question for a brownfield fixture. |
| Overlap builder and reviewer | refuted | Saves no tokens and costs a few. Keep its one measured finding: a workflow gap is free. |

The two survivors are worth roughly $1.49 of Fable on a run like run 1, and they are independent
of every confound above, because each is settled by a price table and one usage record rather than
by comparing arms.

### Limitations

- Two runs per cell, and on the thing the section is about, one. The loop completed once.
- **The bare arm ran with no plugin at all**, so the comparison is a fabflows session against a
  plain one, not the build loop against its absence.
- **The graded axis is saturated.** 41/41 in every run means the quality comparison has no power.
  The only expectation that ever differed penalises the arm that runs more agents under don't-ask
  mode, so bare run 2's 50/50 is an agent-count artifact, not a quality edge.
- **The leads read a plugin nobody has installed.** The staged copy is the unadopted DEC-0015
  trim: 141 lines against the shipped 227, and it adds a `references/build-loop.md` that 0.3.6
  does not contain. Defects in `build.js` are real today; the reference-file defect only becomes
  real if DEC-0015 lands. Skill-load costs were measured on a body 38% shorter than the shipped
  one.
- **Arm order was not counterbalanced.** Both fabflows runs ran before both bare runs, so arm is
  confounded with time, account utilisation and machine load.
- **The artifacts differ.** The arms wrote different amounts of different code, up to 18% apart in
  size, so output-token comparisons are not strictly like for like.
- Only one run obeyed the user's global `CLAUDE.md`, and the loop's builder brief suppresses that
  policy by construction, which is what produced the commit-structure difference above.
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

### What iteration 6 should do instead

The honest summary of iteration 5 is that it measured one review, on a task with no defect in it,
which found no defect. The design that would actually answer the question, and which needs no
Fable at all:

1. **Re-price what exists against the meter, not against list dollars.** Done above; it is free
   and it points the other way from the cost headline.
2. **Move the lead off Fable.** The question is the ratio of capped-model tokens to worker tokens,
   and that ratio transfers across lead models. Run the lead on Sonnet at the same effort.
3. **Add the arm that isolates the review.** Three arms, all with the plugin loaded and the skill
   invoked so the plugin, the hook and the skill load are held constant: (A) the lead builds
   inline, (B) the lead delegates the build to an Opus agent through the plain Agent tool with the
   same brief and no review, (C) the full loop. B minus A is the price of delegation; C minus B is
   the price of the review, which is the number the whole decision turns on and which no iteration
   has ever produced.
4. **Make the outcome vary.** Replace the greenfield task with a brownfield fixture carrying one
   planted defect that the visible suite passes and a hidden test fails. The primary outcome
   becomes binary: did the reviewer return REWORK naming that defect. A binary with real variance
   carries more information per run than a saturated token count.
5. **Make sure the treatment is administered.** Add an allow rule for the test command so no
   denial fires, or `saysDenied` escalates the loop out of existence again; pass `reviewerModel`
   explicitly; and confirm a review round actually ran before grading.
6. **Remove the free design flaws.** Interleave and counterbalance the arms, give every arm the
   same instruction about commit granularity and project docs, and stage the shipped plugin or say
   which variant is under test.

Nine runs of about twelve minutes, none of them on Fable.

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
