# Run log

Append-only. Newest at the bottom.

**In scope:** operational actions that leave no commit behind — deploys, data
migrations, credential rotations, scripts run against live systems, manual
verification, and checks that were skipped.

**Out of scope:** code and documentation edits. Git and the pull request already
record those.

Every action gets **two entries**: the intent, then the confirmation. The second
entry names the exact command or check used, so anyone can re-run it later.
A skipped check gets its own `SKIPPED` entry — a silent gap is worse than an
admitted one.

Past 500 lines, move the oldest entries into `docs/runlog/YYYY-QN.md` -- the
archive for the quarter each entry falls in -- until the log is back under the
limit, and leave a one-line pointer. Whole entries only.

Older entries: [docs/runlog/2026-Q3.md](runlog/2026-Q3.md).

---

## 2026-09-21 — fabflows 0.3.7: harden the build loop on the benchmark's evidence

**PLANNED** — Implement DEC-0016 and DEC-0015 together on
`claude/fabflows-token-optimization-b4d2c5`. Six behaviour and prose changes: the escalation
condition stops reading the builder's prose and `saysDenied` only classifies the reason; the
builder brief distinguishes a denial that stopped the builder from one it worked around;
`reviewerModel` defaults to `opus`; a string `args` payload is parsed and fails safe to
`missing-args`; `escalate()` carries a one-line `next` per reason; the skill body is replaced with
the narrowed variant plus `references/build-loop.md`. Then the refuter's contradictory BLOCKED
rules, the editor's line-range demand, two comments the benchmark disproved, and the version.
Verify with `node --test "plugins/fabflows/test/*.test.js"` and `node --test "test/*.test.js"`
after every commit.

**CONFIRMED** — Seven commits, each green on both suites. Plugin suite 40 to 47 tests, root suite
4. New coverage: the string-args parser in four readable shapes and seven unreadable ones, a `next`
field on all eight escalation reasons with distinct text per reason, the five denial openings that
cost benchmark run 2 its review now asserted to reach review, and the reviewer override re-pointed
at a third model so it still proves the override once Opus is the default. Checked rather than
assumed: benchmark task 4 asks a session to bump 0.3.6 to 0.3.7, and a design review flagged that
shipping 0.3.7 would make it unpassable. It does not, because that task's fixture is pinned at
`3fbe15b`, where both manifests still read 0.3.6; `git show 3fbe15b:plugins/fabflows/.claude-plugin/plugin.json`
confirms it. No edit was needed. Pull request
https://github.com/kuan51/claude-skills/pull/45 opened before the records were accepted, so both
could carry its link.

**CONFIRMED** (decision records) — DEC-0015 and DEC-0016 moved from `proposed` to `accepted`, which
`plugins/docs-warden/skills/docs-warden/references/adr-format.md` defines as the sanctioned
transition; immutability starts at that commit, so it was made last and carries everything those
records will ever say. DEC-0016 argued for a minor bump to 0.4.0 and 0.3.7 shipped: the record now
states that, the reason, and leaves the original reasoning visible beneath it. `adr_index.py`
regenerated `docs/DECISIONS.md`, which shows the two as the only accepted records of sixteen.

## 2026-09-21 — ponytail review of the 0.3.7 diff: six cuts

**PLANNED** — Run a complexity review over the seven 0.3.7 commits and implement what it found.
Six findings: the `key: value` block parser in `build.js` is recovery for a shape the skill body
now tells the lead not to write; its trailing-comma and quote salvage is unreached by any test;
`NEXT[reason] || <generic>` in `escalate()` is a branch nothing calls; `references/build-loop.md`
restates four branches that `next` now carries; `build.test.js` walks the escalation scenarios in
two tables; and the `reviewerModel: 'fable'` case exercises the same branch as the `'sonnet'` case
above it. Verify with `node --test "plugins/fabflows/test/*.test.js"` and
`node --test "test/*.test.js"` after every commit.

**CONFIRMED** — Four commits, each green: `a276ae8`, `c2ab499`, `2c09b46`, `cb7175c`. Plugin suite
47 to 46 tests (two escalation tables became one), root suite 4. 59 lines net removed across
four files, 109 deleted against 50 added, measured with `git diff --stat 332ab25..HEAD`.
Checked by mutation rather than by reading: deleting `next` from `escalate()` fails the merged
table on its first row, so the folded assertions are not vacuous. `node --test
"plugins/fabflows/test/build.test.js"` with `next` removed reported 17 pass 1 fail, and 18 pass 0
fail once restored.

**CONFIRMED** (departure worth naming) — Narrowing the parser to JSON-only contradicts the
recommendation in `evals/RESULTS.md:148` and the consequence recorded in DEC-0016, both of which
argue that prose alone is not enough because `whenToUse` is reprinted inside the same Skill
expansion that generated the bad call, and both iteration-5 leads did write a `key: value` block.
What changed since is that the skill body now says to pass an object outright, and a block fails
loudly as `missing-args` rather than half-parsing. DEC-0016 is accepted and therefore immutable,
so the departure is recorded here rather than in the record. If a later run shows a lead losing a
turn to this again, the parser is the fix and this entry is the reason it was removed.

## 2026-09-22 — fabflows 0.4.0: brainstorming skill

**PLANNED** — Add `skills/brainstorming/SKILL.md` (sized request, worker-sourced facts,
bounded question rounds with recommended answers, expand-then-cut, a lens pass through the
refuter, a spec `fabflows:build` can take), teach `refuter.md` to review a spec instead of a
diff, pin both in `frontmatter.test.js`, bump to 0.4.0 across `plugin.json`,
`marketplace.json`, both READMEs and `CHANGELOG.md`, and record DEC-0017. Verify each commit
with `node --test "plugins/fabflows/test/*.test.js"` and `node --test "test/*.test.js"`, and
check the shipped skill names no third-party project with
`grep -rniE "superpowers|grill|gsd|get-shit-done|context-mode|interview-me|pocock|obra|sorbh|mksglu" plugins/fabflows/skills/brainstorming plugins/fabflows/agents/refuter.md`.

**CONFIRMED** — Four commits, each checked out alone in a scratch worktree and tested:
`4e8bf80` and `3d23311` printed `tests 46`, `fail 0`; `f4120f7` and `bc3e7f2` printed
`tests 47`, `fail 0` (the one new test). `node --test "test/*.test.js"` printed `fail 0` on all
four. The banned-name grep above printed nothing (exit 1). `wc -c` on the new SKILL.md printed
8426, under the 20,000 cap; its description is 984 characters. `adr_index.py .` reported 17
records.

**SKIPPED** — The skill was not exercised in a live session, and the skill-creator eval loop
(three test prompts with and without the skill, graded and reviewed) has not run yet. Both
need the plugin installed from this branch and a new session (CLAUDE.md, "Testing a plugin
change"); the eval loop is the next step on this branch.

## 2026-09-22 — fabflows 0.4.0: brainstorming eval, iteration 1

**PLANNED** — Run the three prompts in `skills/brainstorming/evals/evals.json` with and
without the skill as subagents, grade six assertions per run, aggregate with the
skill-creator's `scripts.aggregate_benchmark`, and rotate the run log past its 500-line rule.

**CONFIRMED** — Rotation: `wc -l docs/RUNLOG.md` printed 439 (from 643); 31 entry headings
before and after (9 here, 22 in `docs/runlog/2026-Q3.md`). Evals: `aggregate_benchmark` printed
`With Skill: 94.4% pass rate`, `Without Skill: 50.0% pass rate`, `Delta: +0.44`; per-eval grades
6/6, 6/6, 5/6 with the skill against 2/6, 2/6, 5/6 without; mean tokens 62,244 against 56,007
and mean time 45.8 s against 33.1 s. Summary and analyst notes are in
`skills/brainstorming/evals/iteration-1.md`; the review page and raw outputs stayed in the
session scratchpad.

**SKIPPED** — A subagent has no user to answer a round, so only the first reply was tested:
the cut, the lens pass through the refuter, and the written spec are unexercised. No
`SKILL.md` change was made from these results; that waits on the user's review feedback.

## 2026-09-22 — fabflows 0.4.0: bounded shortcut, eval iteration 2

**PLANNED** — Let the bounded tier print the spec block at once when nothing is left to ask,
then rerun the bounded prompt against a snapshot of the pre-change skill.

**CONFIRMED** — `node --test "plugins/fabflows/test/*.test.js"` printed `pass 47`, `fail 0`
after the edit; `wc -c` on SKILL.md printed 8929. The banned-name grep over the skill
directory printed nothing once the eval assertion was reworded (it had listed the names).
`aggregate_benchmark` on iteration 2 printed `Old Skill: 83.3%`, `With Skill: 83.3%`,
`Delta: +0.00`; the new skill printed the full spec block in its first reply with zero
questions, the old skill deferred it a turn. Tokens 64,856 against 67,184. Notes in
`skills/brainstorming/evals/iteration-2.md`.

**SKIPPED** — One prompt, one run per configuration, first reply only. The state-block
assertion was not adjusted for the bounded shortcut, so the two 5/6 scores fail different
assertions; the eval, not the skill, is what iteration 3 should fix first.

## 2026-09-22 — fabflows 0.4.0: destructive-fixture cleanup, guard rule, eval iteration 3

**PLANNED** — Delete the `/tmp/tmp.KDPIjQRT7i/Makefile` left by an eval run (target body
`rm -rf ~`), sweep for others, add a guard rule that blocks a destructive command written
into a runner file, let the brainstorming skill allow only declared read-only spikes with
inert fixtures, add the matching eval assertions, and rerun the bounded prompt.

**CONFIRMED** — `cat -A` showed `nuke:$` / `^Irm -rf ~$`; `rm -r /tmp/tmp.KDPIjQRT7i`
and the empty scratch `mk/` repo removed. `grep -rlFf sweep-patterns.txt` (patterns:
`rm -rf`, `git push --force`, `mkfs`) over `/tmp` and the scratchpad, limited to Makefile,
`*.mk`, justfile, `*.sh`, `*.ps1`, printed nothing (exit 1), before and after iteration 3.
The first sweep attempt was itself blocked by the guard because the pattern text contained
`dd of=`; the pattern moved into a file. `node --test "plugins/fabflows/test/*.test.js"`
printed `tests 48`, `pass 48`, `fail 0` (one new table test, 12 cases); root suite `fail 0`.
The exact iteration-2 payload piped into the guard as a Write returned `permissionDecision:
deny`; the `echo would-delete` variant returned nothing. `aggregate_benchmark` on iteration 3
printed `With Skill: 100%`, `Old Skill: 87.5%`; notes in `skills/brainstorming/evals/iteration-3.md`.

**SKIPPED** — The run briefs forbade destructive fixtures, so iteration 3 does not show
whether the skill wording alone prevents them; the guard rule is the mechanical layer. Still
first reply only, one prompt, one run per configuration.

## 2026-09-22 — fabflows 0.4.0: ponytail review cuts

**CONFIRMED** — Eight cuts from `/ponytail-review` applied: one extension list feeds both
runner-file regexes, the notebook fallback and the chained unquoting strips are gone, the
refuter owns the lens list, the hard block is stated once, and the three eval write-ups
moved from `skills/brainstorming/evals/` (which installs into consumers' caches) to
`plugins/fabflows/evals/brainstorming/`. Earlier entries above cite the old path; they
were true when written. `node --test "plugins/fabflows/test/*.test.js"` printed `pass 48`,
`fail 0`; root suite `fail 0`. Net 16 lines fewer in code and skill.

**SKIPPED** (departure worth naming) — The file move landed inside commit `43c9666`
(the guard refactor) because `git mv` had staged it before that commit ran, so that commit
mixes a refactor with a docs move. History is pushed, so it stays as is.

## 2026-09-22 — fabflows 0.4.0: adversarial review of brainstorming against the alternatives

**CONFIRMED** — Four researchers read the primary sources of the four alternatives the user
named; the lead re-fetched the superpowers brainstorming SKILL.md and spec-reviewer prompt and
the gsd-core discuss-phase page to verify the load-bearing claims. A refuter in spec mode then
attacked the skill's value proposition with those facts. Verdict `REWORK`: four advertised
differentiators (sizing tiers, assumptions with confidence labels, a recommended answer per
question, facts before asking) already ship in the same form in superpowers, gsd-core or
interview-me; the two that do not (a lens pass with a security hard block from a fresh
context, and the spec handed to `fabflows:build`) had no evidence because iterations 1–3 graded
a first reply only; the bounded tier scored level with no skill; three text contradictions
(description said the refuter blocks, the security list was duplicated, iteration tables had
inverted delta signs) and two rules where an alternative is safer (no round budget; the bounded
shortcut self-certifies). context-mode has no planning feature and is not a competitor. See
DEC-0017, whose gaps section already names round size and tiers as the first knobs.

**PLANNED** — Three remedies chosen by the user: fix the text contradictions (two commits, no
behaviour change); cap rounds at three and make the bounded spec block an explicit
checkpoint; add eval 4 (full tier, scripted user, planted plaintext secret) and run it as
iteration 4, new skill against a snapshot taken before the round cap.

**CONFIRMED** — Commits `7d62183` (description and hard-block paragraph), `ab9d627` (delta
signs in iterations 2 and 3, now new minus old), `6473e5e` (round budget, checkpoint sentence,
CHANGELOG, one new test assertion) and the eval 4 commit. `node --test
"plugins/fabflows/test/*.test.js"` printed `pass 48`, `fail 0` after each; root suite `pass 4`.
Description 995 chars, SKILL.md 9,842 chars. Banned-name grep over the skill directory printed
nothing.

**PLANNED** — Iteration 4: two subagent runs on clean clones under the scratchpad
(`iteration-4/repo-with_skill`, `repo-old_skill` with the pre-cap snapshot), same brief,
graded on the twelve eval 4 assertions, aggregated, review page generated, notes in
`plugins/fabflows/evals/brainstorming/iteration-4.md`. Post-run sweep for destructive runner
files. One prompt, one run per arm, so it cannot settle the bounded question.

**CONFIRMED** — Iteration 4 ran only after eight refusals: two prompt wordings (an API token
saved to config, then a note rendered unescaped) on Fable and Opus were stopped by a
response-side safety classifier before the skill ran; the run that worked used a shorter
brief without the "record the conversation as the user would see it" instruction. Cause not
confirmed. Prompt now plants the injection surface (commits `b53d4a1`, `<reword>`, and the
injection commit). Results: new skill 12/12, old skill 11/12 (its refuter brief never says
"spec mode"); both arms reached a written spec that escapes the note and pins a payload test
in Check, and both stopped at "Approve to build?". Tokens 99,848 vs 91,949; 210 s vs 193 s.
`python -m scripts.aggregate_benchmark` printed `With Skill: 100.0%`, `Old Skill: 91.7%`
and a delta of `-0.08`: the aggregator prints old minus with, so the signs in the notes are
corrected by hand. Review page at `iteration-4/review.html` in the scratchpad workspace.
`grep -rlFf sweep-patterns.txt` over `/tmp` and the scratchpad (runner-file extensions)
printed nothing. Neither clone had changes outside `docs/specs/`.

**SKIPPED** — The runner subagents had no Agent tool, so neither arm spawned
`fabflows:refuter`; each lead worked the lenses itself and said so. The fresh-context lens
pass, the one differentiator no alternative ships, is still unmeasured. It needs a live
session with the plugin installed from the branch (CLAUDE.md, "Testing a plugin change").
The three-round budget was never triggered: both arms emptied Open in three rounds.

**CONFIRMED** — RUNLOG rotated: the 2026-09-17 and 2026-09-19 entries (0.3.4, 0.3.5, the
guard.js review, token benchmark iterations 1, 2 and 5) moved to `docs/runlog/2026-Q3.md`.

**CONFIRMED** (correction to the entry above) — The two eval 4 prompt commits are `0605fc7`
(reword) and `d1d2ddb` (injection surface); the entry above left a placeholder for them.

**CONFIRMED** — The iteration-4 review page rendered raw JSON from the old-skill transcript
on: that transcript's spike output contains the literal text `</script>`, and skill-creator's
`generate_review.py` embeds transcripts with plain `json.dumps` inside a `<script>` tag, so
the browser closed the block there. Fixed in the scratchpad only: regenerated the page and
replaced `</script>` with `<\/script>` on the `EMBEDDED_DATA` line. `grep -c '</script>'`
went from 3 to 2 and the embedded JSON still parses. The generator is the synced skill, not
this repo, so the post-process is the fix until it escapes the tag itself.

## 2026-09-22 — corrections to the 2026-09-21 ponytail review entry

**CONFIRMED** (correction) — The earlier entry logs "59 lines net removed across four files, 109
deleted against 50 added, measured with `git diff --stat 332ab25..HEAD`". The numbers are right and
the command is not: at the time of writing, `HEAD` was `cb7175c`, but once that entry was committed
the same range also counts its own commit and reports 5 files with 78 insertions and 109 deletions.
The range that reproduces the logged figures is `git diff --stat 332ab25..cb7175c`, confirmed here
as `4 files changed, 50 insertions(+), 109 deletions(-)`. The earlier entry is left as written,
since this log is append-only; this is the correction of record.

**CONFIRMED** (gap the same review opened) — Removing the `|| <generic>` fallback from `escalate()`
in `c2ab499` left `next: NEXT[reason]` guarded only by `assert.equal(nexts.size, 8)`, a literal that
derives from nothing in `build.js`. A verification agent proved the gap by patching an in-memory
copy so a call site used a reason absent from `NEXT`: the loop returned `next: undefined` and the
suite still passed. The guard now reads the `NEXT` block and the `escalate('...')` literals out of
`build.js` itself and asserts every called reason has an entry and that the table covers exactly
those keys. Verified the same way it was found: rewriting `escalate('rework-cap')` to
`escalate('spec-rejected')` takes `node --test "plugins/fabflows/test/build.test.js"` from 18 pass 0
fail to 16 pass 2 fail, and restoring the file returns it to 18 pass 0 fail.

**CONFIRMED** (checked, no action) — A verification agent reported as high severity that the four
review commits changed plugin behaviour without a version bump while 0.3.7 was already published.
That reading came from the agent running across the merge of pull request #45: the release commit
and the four cuts landed in that one merge, so the published 0.3.7 has always included them, which
is the repository's own one-bump-per-pull-request rule working. `master` has since moved to 0.4.1.
No bump was made for this entry's change either, which touches a test and this log only.

**NOT DONE, with reason** — The same agent noted that the repository reverses an accepted decision
record by writing a new record carrying `supersedes:`, and that narrowing DEC-0016's args parser was
recorded only in this log. No superseding record was written: DEC-0016's three decisions all stand,
and the parser is listed there under consequences rather than as a decision. If that reading is
wrong, the fix is a new record superseding DEC-0016, not an edit to it.

## 2026-09-22 — fabflows benchmark iteration 6: task 7 with Opus 5.5 workers

**PLANNED** — Re-run the build-loop benchmark now that Opus 5.5 is released, to record which real
model id the `opus` alias resolves to for the builder and reviewer, and to re-measure token
efficiency, hidden-test accuracy and graded code quality against iteration 5. No plugin change:
every Opus-tier pin is the `opus` alias, which the CLI documents as "the latest model". Lead stays
on Fable; task 7 only; both arms; two repeats. Command:
`node plugins/fabflows/evals/harness/run.js --iteration 6 --tasks 7 --repeats 2 --parallel 2 --confirm`
(CLI 2.1.280, OAuth session, Linux). Caps per run: 200 turns, $60 list, 120 minutes.

**CONFIRMED** — Four runs completed, none killed, no denied tool call. All four graded 50/50
(41/41 hidden tests). Worker model proof: `grep -ho '"model":"claude-[a-z0-9-]*"' plugins/fabflows/evals/runs/iteration-6/eval-7-*/*/run-*/workflows/*/agent-*.jsonl | sort | uniq -c`
prints 76 messages on `claude-opus-5-5` and nothing else. Means, with_skill against without:
list $2.92 vs $3.55, wall 414 s vs 480 s, Fable output 6,660 vs 38,314. Both loops ran build:1
then review:1 ACCEPT with an empty must-fix list (`workflows/*/journal.jsonl`). Summarised with
`summarize.js`, aggregated with skill-creator's `aggregate_benchmark` and `annotate_benchmark.py`;
`generate_review.py` (the HTML viewer) was not run. Write-up in `plugins/fabflows/evals/RESULTS.md`.

## 2026-09-22 — fabflows benchmark iteration 7: the planted-defect task, three arms

**PLANNED** — First run of task 8 `review-catch` (PR #55): a brownfield fixture with one planted
caret-on-zero defect, three arms all loading the plugin and invoking the skill (`inline`: no Agent
or Workflow; `delegate`: no Workflow; `loop`: both), three interleaved repeats, Fable lead. Primary
outcome per run: the hidden `outdated` test on the spec's example, pass or fail. Command:
`node plugins/fabflows/evals/harness/run.js --iteration 7 --tasks 8 --parallel 3 --confirm`
(CLI 2.1.280, OAuth session, Linux). Caps per run: 120 turns, $15 list, 30 minutes; nine runs.
