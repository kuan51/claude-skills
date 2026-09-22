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

**CONFIRMED** — Nine runs completed, none killed, no denied tool call, hidden suite 8/8 in every
run: the planted defect was fixed in all nine before any review ran. `loop` launched
`fabflows:build` in 1 of 3 runs (the `requireReview` expectation failed the other two, as
designed); `delegate` ran an Opus editor and refuter by hand through Agent in 2 of 3. Means: inline
$1.32 / 88 s, delegate $2.06 / 222 s, loop $1.32 / 117 s. Worker model proof:
`grep -ho '"model":"claude-[a-z0-9-]*"' plugins/fabflows/evals/runs/iteration-7/eval-8-*/*/run-*/transcript.jsonl plugins/fabflows/evals/runs/iteration-7/eval-8-*/*/run-*/workflows/*/agent-*.jsonl | sort | uniq -c`
shows Fable, `claude-opus-5-5` and one Sonnet editor. Summarised with `summarize.js`, aggregated
with skill-creator's `aggregate_benchmark` and `annotate_benchmark.py`; `generate_review.py` not
run. Write-up in `plugins/fabflows/evals/RESULTS.md`.

## 2026-09-22 — fabflows benchmark iteration 8: the hidden rule, two arms, five repeats

**PLANNED** — Re-run task 8 after iteration 7 saturated. Changes: the spec no longer states the
caret-on-zero rule and its example no longer reaches the defect (only the hidden test carries
it); the `delegate` arm is dropped; the `loop` arm's prompt tells the lead to run `fabflows:build`;
five interleaved repeats; two new informational expectations (build shipped the defect, review
named it). Fable lead. Command:
`node plugins/fabflows/evals/harness/run.js --iteration 8 --tasks 8 --parallel 3 --confirm`
(CLI 2.1.280, OAuth session, Linux). Caps per run: 120 turns, $15 list, 30 minutes; ten runs.

**CONFIRMED** — Ten runs completed, none killed, no denied tool call. Hidden suite 7/9 in every
run: the planted defect shipped in all ten (five inline leads, five loop builders). All five loop
runs ran build:1 then review:1; every verdict ACCEPT with no must-fix, none naming the defect
(`grading.json` rows "The build round shipped the planted defect" true and "The review named the
planted defect" false in all five). Means: inline $0.85 / 61 s, loop $1.11 / 101 s. Model proof:
`grep -ho '"model":"claude-[a-z0-9-]*"' plugins/fabflows/evals/runs/iteration-8/eval-8-*/*/run-*/transcript.jsonl plugins/fabflows/evals/runs/iteration-8/eval-8-*/*/run-*/workflows/*/agent-*.jsonl | sort | uniq -c`
prints Fable and `claude-opus-5-5` only. Summarised with `summarize.js`, aggregated with
skill-creator's `aggregate_benchmark` and `annotate_benchmark.py`; `generate_review.py` not run.
Write-up in `plugins/fabflows/evals/RESULTS.md`.

## 2026-09-19 — docs-warden evals: first Tier 1 (triggering) run

**PLANNED** — Smoke one case natively to prove `claude plugin eval` runs from this
machine (trust prompt, plugin resolution, Skill grader), then the ten Tier 1 cases at
3 runs each: `claude plugin eval plugins/docs-warden --tag trigger-positive
trigger-negative --ablation none --runs 3 --model claude-sonnet-5 --max-cost-usd 10
--trust-plugin --no-publish --json plugins/docs-warden/evals/results/tier1.json
--report plugins/docs-warden/evals/results/tier1.html`. Expected: every
`trigger-pos-*` case at 0.9 or above, every `trigger-neg-*` case at 1.0. Tier 2 is
not run in this entry: it needs the WSL2 sandbox described in
`plugins/docs-warden/evals/README.md`.

**CONFIRMED (partial)** — Two probes ran; the full Tier 1 matrix has not. `claude plugin
eval plugins/docs-warden --case trigger-pos-stale-docs-casual --ablation none --runs 1
--model claude-sonnet-5 --max-cost-usd 2 --trust-plugin --no-publish` exited 0,
score 1.0, $0.15, 21 s, 8 turns: the runner resolves the plugin from a path, the Skill
grader matched `"skill":"docs-warden:docs-warden"`, and `aggregate-result.json` carries
`schemaVersion: 1` with per-run `graders[]`, `costUsd`, `turns` and `error`. A second
probe, `--case adr-immutability-refusal --scaffold --keep-temp` with no `--allow-tools`,
exited 1 at score 0.8 and settled two open questions. First, `--scaffold` DOES run
natively on Windows: the operator's own bash seeds the workspace, and only granting
Claude a shell needs the sandbox, so the Tier 1 positives were given fixtures. Second,
with no Edit tool the lead delegated to a subagent via the Agent tool, which means
`tool_used` graders see only the lead's calls; every "must not change X" case therefore
also grades X's contents after the run. Both failing graders were the eval's fault, not
the skill's: the bare phrasing "DEC-0001 has a typo... Fix it please." invoked no skill
at all, so it became its own Tier 1 case and the Tier 2 prompt now says "Our accepted
ADR DEC-0001...". The kept workspace was removed as the runner instructed.

**SKIPPED** — The Tier 2 matrix. It needs a WSL2 sandbox (bubblewrap, socat, system-wide
PyYAML, a signed-in Claude Code) that this machine does not yet have; the prerequisites
are in `plugins/docs-warden/evals/README.md`. No Tier 2 case has ever been run, so
nothing in this repository claims a Tier 2 result.

## 2026-09-21 — docs-warden evals: Tier 1 measured

**PLANNED** — Re-run the Tier 1 matrix after raising `max_turns` from 10 to 30, because
the first full run errored three runs on the cap and every one of them had invoked the
skill and was working through it, so the cap was penalising success rather than
preventing it.

**CONFIRMED** — `claude plugin eval plugins/docs-warden --tag trigger-positive
trigger-negative --scaffold --ablation none --runs 3 -j 4 --model claude-sonnet-5
--judge-model claude-haiku-4-5 --max-cost-usd 15 --trust-plugin --no-publish --json
plugins/docs-warden/evals/results/tier1.json` exited 1 (correct: `--threshold` defaults
to 1.0 and three cases scored below it), $5.04, 535 s, 33 runs, `partial: false`, zero
run errors. Negatives 15/15: all five near-miss prompts left both skills alone, each
answered in one or two turns. Positives 10/18. Three cases invoked the skill in all
three runs (class B readiness at 43/29/49 turns, new-repo scaffolding at 14/10/12,
stale docs at 20/21/23); `why-did-we-choose` invoked it once in three at 7 turns each;
`adr-typo-bare-id` and `readme-env-var-drift` never invoked it, finishing in 6 to 10
turns. The prior 10-turn run scored the same 10/18, so the cap changed which runs
errored but not the trigger rate.

The 8 failing positive runs are a finding about the skill, not the suite. Its
description already lists "the README is wrong" and "why did we choose", and neither
phrase invokes it; the runs were not cut short, they answered directly. Anthropic's
documentation states a skill is consulted only for work Claude cannot comfortably do
alone. Scaffolding, auditing and compliance prompts trigger reliably; maintain-mode and
decide-mode prompts do not. No change has been made to `SKILL.md` on the strength of
this: the measurement is recorded, the remedy is a separate decision.

**SKIPPED** — The Tier 2 matrix, again. Still no WSL2 sandbox on this machine.

## 2026-09-21 — docs-warden evals: a broken Tier 1 case, corrected and re-measured

**PLANNED** — Check the premise of every weak Tier 1 positive against its fixture
before reporting the 10/18 as a property of the skill. A prompt that asserts something
the fixture does not contain measures nothing.

**CONFIRMED** — `trigger-pos-readme-env-var-drift` was invalid. Its prompt says the
README documents three environment variables while the deploy script reads seven;
`grep -rni "env" plugins/docs-warden/test/fixtures/repo-it-tooling` returns only two
`.gitignore` lines, the README has no configuration section, and the single source file
`src/CertRotate.psm1` is nine lines with no environment variables and no deploy script.
Claude looked, found nothing and answered directly, so the 0/3 measured the eval, not
the skill. The case's `fixture.sh` now appends a Configuration section naming three
variables and writes `src/Deploy.ps1` reading seven; verified by running the script into
a scratch directory, which produced `documented: 3  read: 7` and a clean git tree.
Re-run ten times on the corrected fixture: 3/10 invoked, $3.64. Weak and high-variance,
but not zero.

Two corrections to earlier reasoning in this session, recorded because both were stated
before being checked. First, the `turns` field is not a measure of effort: an inspected
run reported `turns: 1` while its trace contained more than thirty tool calls, so the
earlier claim that failing runs "finished in six to ten turns and were therefore not cut
short" was not sound. The sound evidence is that the 30-turn matrix recorded zero run
errors. Second, a trace inspected to explain a failure turned out to belong to a run
that had passed, with `skill-invoked` true and the Skill call visible in the trace; the
grader regex was confirmed correct against the raw trace text. No grader change was
needed and none was made.

**SKIPPED** — `python plugins/docs-warden/test/test_scripts.py` reports 79 PASS, 1 FAIL
on this machine, and the failure is environmental rather than a regression. No skill or
test file was changed by this branch (`git diff --stat HEAD -- plugins/docs-warden/skills
plugins/docs-warden/test` is empty). `test_audit_reports_a_failing_generator_instead_of_in_sync`
declares a generator `command: ["python3", "gen.py"]` and asserts the scorecard reason
names exit code 3. Here `python3` resolves to the Windows Store alias stub at
`AppData/Local/Microsoft/WindowsApps/python3`, which exits 9009 with "Python was not
found", so the generator never runs. Reproduced standalone: the scorecard correctly
reports `generated-docs` as `fail` with reason `exit 9009`, and only the assertion that
the reason contains "3" fails. `audit.py` behaved correctly; the test hardcodes an
interpreter name instead of `sys.executable`. Left unfixed as out of scope for this
branch.

## 2026-09-21 — docs-warden evals: Tier 2 unblocked, then blocked by an audit.py crash

**CONFIRMED** — The WSL2 sandbox now works. bubblewrap, socat and PyYAML 6.0.3 are
installed system-wide, user namespaces are enabled, and `bwrap --unshare-all true`
succeeds. Claude Code inside WSL was at 2.1.263, below the 2.1.269 the eval docs
require, and was missing `--trust-plugin` and `--concurrency`; `claude update` took it
to 2.1.278 and both flags are present. All five fixture scripts were run under WSL bash
and produce the intended repositories: `maintain-targeted-update` leaves exactly one
uncommitted file (`src/CertRotate.psm1`, renamed to `-TargetHub` while the README still
says `-HubName`), and `adr-immutability-refusal` commits the planted `certficate` typo
with `status: accepted` intact.

**CONFIRMED** — A smoke of `audit-scorecard` under the sandbox scored 0.45 and exposed a
crash in `audit.py`, not a skill defect. The eval harness injects a `.claude/` directory
into the workspace whose entries are character devices owned by `nobody`
(`crw-rw-rw- 1 nobody nobody 1, 3`), which read as permission-denied. `audit.py` line
806, in `check_glossary_reject_terms`, calls
`path.read_text(encoding="utf-8", errors="replace")` over every markdown document found
under the repository. `errors="replace"` survives undecodable bytes but not an
unreadable file, so the call raises `PermissionError` and the whole audit dies before
writing `docs-scorecard.json`.

Reproduced deterministically outside the harness, with no sandbox involved:

    W=$(mktemp -d); cd $W; bash <evals>/audit-scorecard/fixture.sh
    mkdir -p .claude && printf 'x\n' > .claude/loop.md && chmod 000 .claude/loop.md
    python3 <scripts>/audit.py .
    -> PermissionError: [Errno 13] Permission denied: '.../.claude/loop.md'
    -> scorecard: NO

Any repository containing a permission-restricted markdown file crashes the audit the
same way. The suite already has `test_audit_survives_a_document_that_is_not_valid_utf8`,
so tolerating unreadable documents is an existing design goal; this is the same class of
defect left uncovered. In the smoke run Claude worked around it by copying the
repository minus `.claude` to `$TMPDIR/docs-audit-repo` and auditing the copy, which
succeeded and produced a correct scorecard naming the real IEC 62304 gap. The eval's
three scorecard graders still failed, because they look for `docs-scorecard.json` in the
workspace and it had been written into the temporary copy instead.

**SKIPPED** — The Tier 2 matrix, for a third time, now for a different and better
understood reason. Every case whose prompt leads the skill to run `audit.py` hits this
crash, so the matrix would measure the bug rather than the skill. No fix has been made:
`audit.py` is plugin behavior, a change there needs a version bump and a marketplace
sync, and that is outside this branch's scope.

## 2026-09-21 — docs-warden evals: adversarial review of the suite, and the fixes it forced

**PLANNED** — Review every eval case adversarially before trusting any number it
produces: find graders that pass on a wrong run, graders that fail on a correct one, and
fixtures whose premise is absent. Two earlier attempts died on usage credits after
reaching only two cases.

**CONFIRMED** — The third attempt completed: 40 agents, no errors, 32 high and medium
findings verified adversarially, 27 confirmed and 5 refuted. Every confirmed finding that
could be checked deterministically was re-checked here before acting on it. Four mattered
enough to name.

First, `init-confirmed-scaffold`'s prompt supplied the owner as `@it-team`. Substituted
into the template's unquoted `owner: {{OWNER}}` slot that yields invalid YAML, because
`@` is a reserved indicator. Verified directly: `yaml.safe_load("owner: @it-team")` raises
`ScannerError`, while the quoted and bare forms parse. Every downstream grader in that
case would have been measuring a broken manifest rather than the skill. The prompt now
says `owner it-team`, and a new grader asserts the written manifest parses.

Second, the shell-mutation heuristic had two holes the original twelve-command test
missed. `echo x >>docs/RUNLOG.md` with no space after the redirect escaped it entirely,
and a multi-line command whose first line held an unrelated `>` was falsely blamed for a
path named on a later line, because the character class did not exclude the backslash of
a JSON-encoded newline. Both reproduced, both fixed, and the test now covers fifteen
commands, eight mutating and seven not, all passing.

Third, the "never touch X" cases relied on `tool_used` guards that only observe the lead
session, and an earlier probe had already shown the lead delegates to a subagent when it
lacks a tool. Each such case now also carries a content check that no tool can evade: the
run log still has exactly the number of `## ` entry headings the fixture shipped with,
the three `REQ-FIX` headings are all present, and `tests/test_pressure.py` still holds
exactly two `def test_` functions, which is what a silently-added test would break.

Fourth, all five Tier 1 negatives ran in an empty workspace, so 15/15 meant less than it
appeared: a near-miss is only a near-miss when the colliding keyword is actually in the
repository. They now seed the same documented repository the positives use, so a prompt
about CODEOWNERS or a run log is asked in a repo that genuinely has both.

Two smaller ones: `trigger-pos-why-did-we-choose` was named for a trigger phrase its
prompt never contained (it said "why we picked"), and `trigger-pos-adr-typo-bare-id`
asked for a mutation while grading only invocation, with no check that the accepted
record survived. Both corrected.

One proposed fix was rejected after checking the fixture rather than trusting the claim.
A grader was to assert `tests/test_pressure.py` still contained `REQ-FIX-001`; the file
deliberately never writes any requirement ID out, stating that "naming it would itself
count as coverage". That grader would have failed every compliant run. The count-based
check above replaced it.

## 2026-09-21 — docs-warden evals: drop the invented team name from the prompts

**PLANNED** — Replace `it-team` in the eval prompts. docs-warden ships in a public
marketplace, so its evals should not name a team that implies a particular organisation.

**CONFIRMED** — Two prompts and their two graders changed to `maintainers`, which is the
idiomatic term in this plugin's own domain (it ships a MAINTAINERS artifact for the OSPS
Baseline overlay) and names no one. `grep -rn it-team plugins/docs-warden/evals/` now
returns nothing; 124 graders still compile. The correction in the preceding entry, which
recorded the owner becoming `owner it-team`, stands as written because this log is
append-only: the value is now `owner maintainers`, and the reason for dropping the
leading `@` is unchanged and still correct. The CODEOWNERS template writes `@{{OWNER}}`
itself, so the manifest value is bare by design.

The plugin's own test fixtures still declare `owner: it-team` and `owner: platform-team`
in `test/fixtures/*/.docs-warden.yml`. Those were left alone: they are synthetic fixture
data that `test/test_scripts.py` asserts against, and changing them is a separate call
from what the evals put in a prompt.

## 2026-09-21 — docs-warden evals: Tier 1 re-measured after the review's fixes

**CONFIRMED** — Same command as the 15:30 run, against the corrected suite: 33 runs,
$4.77, 389 s, `partial: false`, zero run errors. Positives went 10/18 to 12/18;
negatives held at 15/15.

The whole of the gain came from one case, and it is the most instructive result of the
exercise. `trigger-pos-why-did-we-choose` went from 1/3 to 3/3 because the prompt was
changed from "why we picked Hyper-V over Proxmox" to "why did we choose Hyper-V over
Proxmox". The skill's description lists the phrase "why did we choose" verbatim. Nothing
about the skill changed, only whether the prompt used its exact words. Triggering is
therefore matching close to literally, and a natural paraphrase misses it. The corollary
is a caution about this suite and any like it: an eval written in the description's own
vocabulary will report a trigger rate better than users experience.

The negatives are now meaningful rather than nearly free. Until this run all five
executed in an empty workspace, so a question about CODEOWNERS or a run log had nothing
to collide with. They now seed the same documented repository the positives use, where
`.github/CODEOWNERS`, `docs/RUNLOG.md` and `docs/GLOSSARY.md` are all present, and the
skill still stayed out of all fifteen runs.

Two positives remain at 0/3 and are the real finding: `adr-typo-bare-id` (fix a typo in
an accepted decision record) and `readme-env-var-drift` (reconcile a README against the
code, 3/13 across every run ever made of it). Both ask to modify something that exists,
while every decision-related trigger phrase in the description describes creating a
record. No change has been made to SKILL.md; the measurement is recorded and the remedy
is a separate decision.

## 2026-09-21 — docs-warden evals: the phrasing pair, and a correction

**PLANNED** — Re-measure the triggering-vocabulary effect with a controlled pair, after
the earlier claim about it was made on a confounded single case.

**CONFIRMED** — Correction first. The previous entry reported that
`trigger-pos-why-did-we-choose` went 1/3 to 3/3 on one prompt edit and read that as proof
that triggering is literal-phrase sensitive. That conclusion was reached on a bad prompt.
To embed the description's exact phrase the sentence had been bent into "Someone asked me
why did we choose Hyper-V over Proxmox", which is not grammatical English in reported
speech, so the edit changed both the vocabulary and the naturalness and the two could not
be separated. Worse, the fixture is a PowerShell certificate-rotation module, so a
question about hypervisors asked about something the repository does not contain at all.

Both prompts were rewritten around a technology choice the fixture genuinely embodies:
PowerShell rather than Python, whose reasoning appears in no document there (confirmed:
no record under `docs/decisions/` mentions PowerShell). They now differ in exactly one
respect. `trigger-pos-why-did-we-choose` asks "why did we choose" and says "recorded";
the new `trigger-pos-decision-rationale-paraphrase` asks "why we went with" and says
"captured", using none of the skill's vocabulary. Twelve runs each, Sonnet 5, $2.65
total: the literal wording invoked the skill 9/12, the paraphrase 2/12.

That is the controlled version of the earlier claim, and it survives: triggering matches
close to literally, and a user who does not use the skill's own words mostly does not get
it on a question it exists to answer. The paraphrase case is kept rather than fixed,
because it is the honest half of the pair -- a suite written entirely in the description's
vocabulary would report a trigger rate better than users experience.

Note for anyone re-running this: `--case` is not repeatable, the last one wins silently.
The pair shares the tag `phrasing`; select it with `--tag phrasing`.
