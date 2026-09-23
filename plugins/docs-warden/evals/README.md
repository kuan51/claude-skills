# Evals

A `claude plugin eval` suite for the two skills in this plugin. It answers four
questions the unit tests cannot: does `docs-warden` trigger on the prompts it should
and stay quiet on near-misses, does a run obey the skill's non-negotiables, does the
plugin beat baseline Claude on the same prompt, and what does a run cost.

It spends real tokens and never runs under `python3 test/test_scripts.py` or
`node --test`. Run it on demand, and before a release that touches `SKILL.md`.
The choice of runner is recorded in the repository's DEC-0022.

## Layout

```
evals/
├── _lib/seed.sh              copies a test fixture into the workspace and commits it
├── trigger-pos-*/            Tier 1: prompts that should invoke docs-warden
├── trigger-neg-*/            Tier 1: near-misses that should not invoke either skill
├── <behavior case>/          Tier 2: one directory per behavioral case
│   ├── prompt.md             frontmatter: tags, allowed_tools, max_turns, timeout; body: the prompt
│   ├── case.yaml             points at fixture.sh
│   ├── fixture.sh            seeds the workspace from test/fixtures/, plants any change
│   └── graders/*.md          one check per file; the filename is the grader's name
└── results/                  written by each run; gitignored
```

The grader types, `prompt.md` fields and `case.yaml` fields are documented at
<https://code.claude.com/docs/en/plugin-evals>.

## Two tiers

| Tier | Tag | Tools granted | Where it runs | What it measures |
|------|-----|---------------|---------------|------------------|
| 1 | `trigger-positive`, `trigger-negative` | read-only | native Windows, macOS, Linux | whether the skill is invoked |
| 2 | `behavior` (plus `init`, `audit`, `maintain`, `decide`, `refusal`, `clarity`) | `Bash Write Edit` | WSL2 or Linux with a sandbox | what the skill does once invoked |

Every Tier 1 case, positive and negative alike, runs against a seeded fixture repository
(the scaffold script runs as you, not as Claude, so it works natively). The negatives are
seeded deliberately: in an empty workspace there is no CODEOWNERS, run log or glossary for
a near-miss prompt to collide with, so a quiet skill proves nothing. Tier 2 needs the
sandbox because the runner refuses to hand Claude a shell unconfined. Native Windows has no sandbox backend; the runner says so and scores
the case 0. On Windows the runner also warns it cannot seal the workspace after a run,
so treat native results as advisory for anything the plugin wrote.

## Prerequisites

Claude Code 2.1.269 or later, signed in. `claude plugin eval` is part of it.

For Tier 2, a WSL2 distribution with these installed system-wide (each run gets a
throwaway home directory, so a per-user `pip install` is invisible to it):

```bash
sudo pacman -S --needed git bubblewrap socat python-yaml   # Arch; use the distro's package names elsewhere
```

plus Claude Code installed inside the distribution and signed in (or
`ANTHROPIC_API_KEY` exported); follow <https://code.claude.com/docs/en/setup>.

The behavioral cases assume vale, markdownlint and lychee are absent in the sandbox:
their `lint` graders assert the scorecard reports `skipped`, which is the skill's
"never fake a pass" rule. If the image gains a linter, change those graders.

## Run

Always pass `--max-cost-usd`. Pin `--model` and `--judge-model` so scores compare
across runs. Iterate graders on Sonnet with one run and no baseline; the number that
matters is a final run on the model your users actually have.

Tier 1, from the repository root on any platform:

```bash
claude plugin eval plugins/docs-warden --tag trigger-positive trigger-negative \
  --scaffold --ablation none --runs 3 --model claude-sonnet-5 --max-cost-usd 10 \
  --trust-plugin --no-publish \
  --json plugins/docs-warden/evals/results/tier1.json --report plugins/docs-warden/evals/results/tier1.html
```

Tier 2, one case at a time while you debug a fixture (under WSL2; `--keep-temp`
leaves the scaffolded workspace on disk):

```bash
claude plugin eval /mnt/c/<path-to-repo>/plugins/docs-warden --case init-proposal-halt \
  --scaffold --allow-tools Bash Write Edit --ablation none --runs 1 --keep-temp \
  --model claude-sonnet-5 --max-cost-usd 3 --trust-plugin --no-publish
```

Tier 2, the full matrix (8 cases x 2 arms x 3 runs = 48 runs):

```bash
claude plugin eval /mnt/c/<path-to-repo>/plugins/docs-warden --tag behavior \
  --scaffold --allow-tools Bash Write Edit --runs 3 \
  --model claude-sonnet-5 --judge-model claude-haiku-4-5 --max-cost-usd 50 \
  --trust-plugin --no-publish \
  --json plugins/docs-warden/evals/results/tier2.json --report plugins/docs-warden/evals/results/tier2.html
```

`--scaffold` runs the case's `fixture.sh` as you. Only pass it for cases you wrote.
`--threshold 0.9` makes the command exit 1 when any case scores below 0.9, which is
how CI gates on it.

## Success criteria

| Criterion | Grader | Target |
|-----------|--------|--------|
| Triggers on relevant prompts | `tool_used: Skill` with `input_match` on `docs-warden`, on every positive and behavioral case | invoked in at least 9 of 10 with-arm runs |
| Stays quiet on near-misses | `tool_used: Skill ... min: 0, max: 0, arm: both` on every negative | 1.0 |
| Beats baseline | the runner's per-case delta (with-arm score minus without-arm score) | positive on every behavioral case |
| No script blew up | `regex` on the trace for `Traceback`, `match: not_contains`, `arm: with-only` | passes on every with-arm run |
| Completes without redirection | `arms.with[].error` is null and the artifact graders pass | every run |
| Obeys the non-negotiables | the `... max: 0` and content-unchanged graders on the refusal and audit cases | 1.0 |
| Consistent | 3 runs per arm; per-run scores are in the JSON | no case with a run below 0.8 while its mean is above 0.9 |

Cost and tool-call counts per arm come from the runner. Tokens are not broken out;
list-price cost is the proxy.

## Cases

| Case | Mode | Fixture | What a pass proves |
|------|------|---------|--------------------|
| `trigger-pos-*` (7) | any | it-tooling, or regulated for the class B one | casual, indirect and misspelt phrasings still invoke the skill. Includes the bare "DEC-0001 has a typo, fix it" phrasing, and a matched pair tagged `phrasing` that asks one question in the description's own words and in a natural paraphrase |
| `trigger-neg-*` (5) | none | it-tooling | in a repo that really has a CODEOWNERS, a run log and a glossary, questions about those, plus a CI job named `runlog`, a docstring, a CHANGELOG entry and a glossary-shaped table, still do not invoke either skill |
| `init-proposal-halt` | init | it-tooling, docs stripped | proposes archetype, forge and owner, then stops; writes no manifest and no `docs/` |
| `init-confirmed-scaffold` | init | it-tooling, docs stripped | with answers given up front, writes the universal set plus `runbook.md` and the GitHub files; never copies `scripts/`; runs the audit; scorecard says `required-files: pass` and `lint: skipped`; never appends to `RUNLOG.md` |
| `audit-scorecard` | audit | regulated | runs `audit.py`, shows the table, names the IEC 62304 gap, edits nothing |
| `maintain-targeted-update` | maintain | it-tooling, uncommitted rename | fixes the README's `-HubName`, leaves the runbook's other cmdlets and the RUNLOG history alone, edits rather than rewrites, re-runs freshness or audit |
| `decide-admission-refusal` | decide | it-tooling | a dependency bump gets no record and an explanation of the admission test |
| `decide-scaffold-record` | decide | it-tooling | with all three answers and two rejected alternatives given, writes `DEC-0002` with `status: proposed`, the stated deciders and both alternatives; regenerates the index rather than hand-adding a row; leaves the accepted `DEC-0001` and the run log alone |
| `adr-immutability-refusal` | (rule 4) | it-tooling, typo planted in accepted `DEC-0001` | asked to fix "our accepted ADR", the typo survives, no superseding record is written unasked, and the reply explains immutability or offers one |
| `req-rewrite-refusal` | clarity | regulated | `REQ-FIX-002` survives untouched; the reply cites traceability |

Fixtures come from `../test/fixtures/`, copied into the workspace and committed by
`_lib/seed.sh`, because maintain mode runs `git diff` and compact mode runs `git mv`.
The eval directory is hidden from the agent, so nothing here leaks into a run.

## Reading results

`results/<timestamp>/aggregate-result.json` (or the `--json` path) has
`aggregates.overallScore`, per-case `aggregates.score` and `aggregates.delta`, and
per-run grader verdicts with evidence. Graders marked `scored: false` are the
with-only indicators (skill invoked, no traceback); read their pass rate as the
trigger rate. If a case's skill indicator passes but its delta is negative, suspect
the judge before the plugin: re-run with `--judge-model sonnet`.

Three grader rules shape how the cases are written. `file_exists` and the `files`
target see only files Claude created, so a refusal case grades the pre-existing
file's contents and asserts `Edit`/`Write` were never called on it. `tool_used` sees
the lead session's calls, and the first probe showed the lead can delegate to a
subagent, so every "must not change X" case also grades X's contents after the run.
Long output is graded by `regex` on file contents; `llm` graders are kept for short
replies with PASS/FAIL rubrics.

## Status

Written 2026-09-19. Tier 1 was run in full on 2026-09-21 (Sonnet 5, 3 runs per case,
33 runs, $5.04, 9 minutes, no run errors). Tier 2 has never been run, pending the WSL2
setup above. Commands and dates are in the repository's since-deleted run log:
`git show 735ea1d:docs/RUNLOG.md`.

### Tier 1, 2026-09-21

| | Result |
|---|---|
| Negatives, skill stayed quiet | 15/15 |
| Positives, skill invoked | 10/18 |

Per case, with the turn count of each run:

| Case | Invoked |
|------|---------|
| `trigger-pos-class-b-review-readiness` | 3/3 |
| `trigger-pos-new-repo-standard-docs` | 3/3 |
| `trigger-pos-stale-docs-casual` | 3/3 |
| `trigger-pos-why-did-we-choose` | 9/12 |
| `trigger-pos-decision-rationale-paraphrase` | 2/12 |
| `trigger-pos-adr-typo-bare-id` | 0/3 |
| `trigger-pos-readme-env-var-drift` | 0/3 here, 3/13 across every run (see below) |
| every `trigger-neg-*` | 0/3, which is correct |

**The most useful result is a controlled pair.** Two cases describe the same situation
against the same repository: a technology choice the code plainly embodies, PowerShell
rather than Python, whose reasoning appears in no document. They differ in one respect.
One asks "why did we choose", the phrase the skill's description lists, and uses the word
recorded. The other asks "why we went with" and says captured, avoiding the skill's
vocabulary entirely. Twelve runs each:

| Wording | Skill invoked |
|---------|---------------|
| uses the description's own phrase | 9/12 |
| natural paraphrase of the same question | 2/12 |

Triggering is matching close to literally. A user who does not happen to use the skill's
words mostly does not get it, on a question it is squarely meant to answer. That has a
direct consequence for this suite and any like it: an eval written in the description's
vocabulary reports a trigger rate better than users experience, so the paraphrase case
is kept deliberately as the honest half of the pair.

The negatives are now worth their 15/15. They previously ran in an empty directory, where
there was no CODEOWNERS, no run log and no glossary for a prompt to collide with. They now
seed the same documented repository the positives use, so the keywords really are present,
and the skill still stayed out of all fifteen runs.

**One of those cases was broken, and its first result was the suite's fault.**
`trigger-pos-readme-env-var-drift` asks Claude to reconcile a README that documents
three environment variables against a deploy script that reads seven. The it-tooling
fixture contained no environment variables and no deploy script at all, so the prompt
asked about something that was not there, Claude found nothing and answered directly.
Its `fixture.sh` now plants the drift, and the case was re-run ten times against the
corrected fixture: 3/10. So it is genuinely weak-triggering and high-variance, but not
the 0/3 the first matrix reported. Treat the 10/18 headline as measured on a suite
containing one invalid case; excluding it, the other five positives were 10/15.

Everything else here is a finding about the skill, not the suite. Two cases never fire.
`adr-typo-bare-id` asks to fix a typo in an accepted decision record, and
`readme-env-var-drift` asks to reconcile a README against the code. Both are requests to
*modify* something that already exists, and every decision-related phrase the description
lists is about *creating* a record. That is the gap worth closing in the skill, not in
this suite. Scaffolding, auditing and compliance-shaped prompts trigger reliably at 9/9.

**Do not read the `turns` field as effort.** One inspected run reported `turns: 1`
while its trace held more than thirty tool calls, so a turn is a conversational round
trip, not a unit of work, and a low turn count is not evidence a run was cut short. The
evidence that no run was truncated is that the final matrix recorded zero run errors.
An earlier matrix at `max_turns: 10` errored three runs on the cap, and every one of
them had invoked the skill and was working through it, so the cap was penalising
success. Tier 1 now runs at 30.
