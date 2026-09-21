---
id: DEC-0014
title: Benchmark plugins with claude plugin eval, not a ported harness
status: proposed
date: 2026-09-19
deciders: [kuan51]
supersedes: []
tags: []
---

# DEC-0014: Benchmark plugins with claude plugin eval, not a ported harness

## Context and problem statement

docs-warden had 80 unit tests for its scripts and nothing that measured the skill
itself: whether it triggers on the right prompts, whether a run obeys the six
non-negotiables, whether it beats baseline Claude, and what it costs. Its
`evals/README.md` was eight hand-run prompts. Anthropic's skill guidance asks for a
trigger rate, tool-call and token comparison with and without the skill, and
consistency across repeated runs. Something had to run prompts headlessly against
fixture repositories, with and without the plugin, several times, and grade the
results. Whatever we picked would become the format every plugin's suite is written
in, so it constrains work well beyond docs-warden.

## Decision drivers

- Zero harness code to own: a custom runner is a second product with its own bugs
  (the fabflows harness needed a message-start-snapshot workaround for token
  attribution and a Windows short-path workaround for fixture clones).
- A baseline arm and repeated runs built in, so "does the skill help" is a number,
  not an impression.
- A clean room: no user plugins, settings or MCP servers leaking into a run.
- Runs on this machine, or at least a documented path to one.

## Considered options

1. **`claude plugin eval`, the first-party runner.** Cases are `prompt.md` +
   `graders/*.md` + optional `case.yaml`/`fixture.sh`. With/without arms, 3 runs per
   case, throwaway home and workspace, six grader types (`regex`, `tool_used`,
   `tool_order`, `file_exists`, `llm`, `baseline`), cost and tool counts, JSON and
   HTML reports, CI exit codes. Cases that grant Bash, Write or Edit need an
   OS-level sandbox, which native Windows lacks, so those run under WSL2.
2. **Port the fabflows harness** from `claude/fabflows-token-optimization-b4d2c5`.
   About 1,000 lines of `run.js`/`metrics.js`/`grade.js`/`summarize.js`, already
   emitting skill-creator's `grading.json` and `benchmark.json`. Runs `claude -p`
   unconfined on native Windows today. Needs a `fixtureSource` field and a new
   grade kind per docs-warden behavior, and every grader is code we maintain.
3. **skill-creator's `evals/evals.json` with subagent runs.** Free-text expectations
   graded by an LLM judge; no clean room; tokens only from task notifications;
   the description-optimizer half is broken on Windows (`select.select` on a pipe
   fails and is recorded as "did not trigger").

## Decision outcome

Chose **option 1**. The first-party runner covers the baseline comparison, repeats,
isolation and reporting that a ported harness would have to reimplement, and its
case format is what `claude plugin eval init` and CI already understand. Behavioral
cases run under WSL2; triggering cases run natively. Option 2 stays as the fallback
if WSL2 cannot be set up: it is proven on this machine and its analysis is on the
fabflows branch.

## Consequences

**Good:**

- The suite is 115 small declarative files and no runner code.
- `--ablation with-without` gives the with-minus-without delta per case for free.
- `tool_used: Skill` graders measure triggering on every behavioral case as a
  side effect.
- The same command gates CI on a threshold and writes a versioned JSON result.

**Bad:**

- Tier 2 needs WSL2 with `bubblewrap`, `socat`, system-wide PyYAML and a `claude`
  install; a fresh machine cannot run it natively.
- No custom-code graders. "git status is clean" and "re-running adr_index.py
  produces no diff" are approximated by `tool_used ... max: 0` and content regexes.
- Tokens are not broken out; list-price cost is the proxy.
- `file_exists` sees only files Claude created, so refusal cases grade a
  pre-existing file's contents instead.

## Gaps accepted

- Per-worker token attribution (which the fabflows harness measured) is not
  available. docs-warden does not delegate, so nothing is lost today; a delegating
  skill would need option 2 or a future runner feature.
- The `lint: skipped` graders assume no linters exist in the sandbox. If the WSL2
  image gains vale or markdownlint, those graders must change.
- The fabflows branch carries its own uncommitted DEC-0014 and DEC-0015; whichever
  branch merges second renumbers.

## Links

- Ticket: none
- Pull request: this branch, `claude/docs-warden-benchmarking-bc4791`
- Related: DEC-0010 (docs-warden scope), `plugins/docs-warden/evals/README.md`,
  https://code.claude.com/docs/en/plugin-evals
