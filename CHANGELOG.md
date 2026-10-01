# Changelog

Notable changes to this repository, grouped by release. Each plugin also
versions independently in its own `plugin.json`; see `plugins/<name>/` for
per-plugin history until entries are recorded here going forward.

## [Unreleased]

### Added

- **ciso 1.2.0** -- every framework is one data folder: a `framework.json`, a `ground-rules.md`
  (which replaces `invariants.md`) and one structure file per tier (#158). ciso loads them from
  the plugin's `frameworks/` and from a project's own `docs/ciso/frameworks/`, and validates each
  with `frameworks.js`. The four bundled frameworks' control files moved there unchanged, so existing
  `state.json` files need no migration. A project framework is data, not instructions: it may not carry flow
  files, verbs follow the plugin's generic flows and ground rules for it, and a certKey that
  clashes with a bundled one is excluded. Every framework-aware verb, `sync-tasks` included,
  reads the plugin's ground rules before it lists frameworks. Validation also refuses symlinked
  files in a project framework, a `tracker` field in a structure file, and keys with a leading,
  trailing or doubled hyphen. For a control whose wording is `imported`, vendor research gets
  only its codes, and task sync never sends its label or summary. HITRUST's r2 maturity shape is no
  longer seeded for another framework's tier named `r2`, and roadmap results merge into the exact
  tier they were researched for.
  The dashboard stops calling CMMC's verbatim text a paraphrase, and reconcile no longer flags
  every synced control as changed on a HITRUST upgrade. The dashboard cards and register's list
  now run alphabetically (CMMC first) instead of HITRUST first. `ADDING-A-CERTIFICATION.md` now
  opens with how to write a project framework.
- **data-analysis 1.2.0** -- `data-analysis:review` treats an extra reviewer's persona and a
  skill guidance excerpt as untrusted, like the thesis (#111). EDA prompts wrap them in
  `<persona>` and `<guidance>` tags and say they set what to look for, never how to work. An
  extra keeps Bash only when its persona is exactly the shipped canned text for its key; every
  other extra, including a deep-research persona, runs on a new `extra-reviewer-static` agent
  with `Read, Grep, Glob`, and its findings are marked unverified. Step 5 shows each
  deep-research persona in full with its sources before the user keeps or drops it. Review
  strips wrapper tags from extra labels and cross-compare lines, and both skills refuse a path
  holding `<`, `>` or a line break. Start a new session after upgrading, since agents load at
  session start.
- **data-analysis 1.1.0** -- `data-analysis:review` splits each notebook before the review
  (#110). A new script, `split-notebooks.js`, replaces every `.ipynb` in the sandbox copy with
  its code cells only, outputs emptied, and keeps the untouched notebook in a `conclusions/`
  folder beside the copy, so blind reviewers no longer read a notebook's Markdown findings or
  saved outputs. The engine now refuses a run that hands a blind role a conclusion file, a
  folder holding one, or a path inside one, and every EDA prompt says notebooks hold code only.
  The reproducibility auditor reports the values its re-runs produce instead of comparing them
  with saved outputs. Both review's and discover's sandbox check now also refuse a path with a
  `.` or empty segment.
- **data-analysis 1.0.0** -- a second skill, `data-analysis:discover`, starts from a business
  decision, its metric and a baseline, and surfaces the patterns the raw data supports (#105).
  One pattern hunter cuts the data along each confirmed dimension, a reconciler flags patterns
  that reverse across dimensions, and a skeptic rates each candidate for materiality against
  the baseline and for the claim level its evidence supports, never a cause. Its sandbox holds
  only data files and data docs, and its report states that the patterns were found in a
  single run. After review, its hunters and so-what auditor run without the project's
  CLAUDE.md, each hunter is told to work only inside the sandbox and checks its patterns for
  reversals within the other slices, an unverified candidate's rationale says why it stays
  descriptive, a failed agent is named in the report, and malformed inputs are refused before
  any agent runs.
- **fabflows 0.15.0** -- the build loop's first review sweeps each function the diff calls by
  its cases, probing one literal input per case and reporting an unprobed case as an open
  question (#154). The reviewer's verdict gains `head`, the commit it read, and rounds 2 and 3
  judge only the rework since that commit: an earlier must-fix still not fixed, a regression or
  a real bug in that diff, or an uncommitted path. A new finding elsewhere is a note, so the
  lead's gate now reads the final verdict's notes. A missing or invalid `head` makes the next
  round judge the whole diff as round 1 does.
- **fabflows 0.14.0** -- the build loop adopts the review-callees and rework-permission text
  measured in iterations 5 and 6 (#148). The builder's result gains an optional `deviations`
  list naming the spec sentence a must-fix fix crossed, and `fabflows:build` matches each entry
  to the must-fix it cites and returns `deviations` on `accepted` and every escalation. The lead's gate keeps a
  matched fix still in the diff and proposes the spec amendment to the user rather than
  reverting it on the spec's text alone.
- **data-analysis-review 0.2.1** -- the report builder fills every template token in one
  pass, so a token inside reviewed text (thesis, evidence, a finding) is never expanded under
  another heading (#113). Any braced token in the template is looked up, so the map is the one
  source of truth; an array given for scope or recommendations renders as bullets.
- **fabflows 0.13.0** -- Linear tickets are filed in the repository's Linear project. For
  Linear, `/fabflows-setup` now asks for the team key (a new `team` field) and then a project
  in that team, offering the one named after the repository and creating one only on a yes.
  It refuses a closed parent issue, which Linear itself accepts. Tested live in a Linear
  team, the `ticket` skill passes the project on every create, since a child does not
  inherit it. It finds done and cancelled by status type, never Duplicate. It adds only
  labels that exist, because one unknown label makes Linear refuse the whole change, and
  assigns with `"me"`. A config written before this reads its `project` as the team key.
  When a PR opens, `ticket.js` now names the web link for Linear too, and the skill attaches
  the PR to the issue with `save_issue` `links`.
- **fabflows 0.12.0** -- a linked ticket is handled when its PR merges or closes outside the
  session (#86). At startup only, `ticket.js` names every other confirmed link with a
  recorded PR, on any checkout, and the new `ticket.js prs` lists them as JSON without branch
  names. The `ticket` skill's "After a PR closes" steps read the PR's state first and its body
  only once it is closed, and ask the user when the state can't be read. For a PR closed
  unmerged with a closing phrase, they ask the user, then cancel the ticket (GitHub
  `not_planned`, a Jira Won't Do, Cancel or Declined status, Linear Canceled), never falling
  back to Done. Standing permission covers the other steps on every confirmed link. A branch
  line that is too long now gives up its URLs before the startup reminder is dropped. The
  hooks still make no tracker or GitHub calls.
- **fabflows 0.11.0** -- when a PR opens on a linked branch, the `ticket` skill assigns the
  PR and the confirmed ticket to the developer the MCP server or `gh` is signed in as
  (`get_me` for GitHub, `atlassianUserInfo` for Jira through Atlassian Rovo, untested for
  mcp-atlassian and Linear). It reads the current assignee first and adds the user rather
  than replacing the list. A ticket held by someone else changes only after the user says
  yes, and a failed assignment never blocks the PR. The PR-created reminder from `ticket.js`
  now names assignees.
- **fabflows 0.10.0** -- a PR opened on a Jira-linked branch also goes in the ticket's Web
  links panel (#82). That panel is a remote issue link, a separate API from the description.
  Once per PR, right after it is created, `fabflows:ticket` reads the ticket's remote links
  and creates one with the MCP server's create tool when it has one, such as
  `jira_create_remote_issue_link` in mcp-atlassian's `jira_links` toolset, which
  `TOOLSETS=default` leaves out. With no read or create tool, as on the Atlassian Rovo
  server, Claude gives the user the PR URL to add by hand and never asks for an API token.
  `ticket.js` names the web link in the reminder after a PR creation on a Jira ticket until
  `ticket.js pr` records the PR, never after a push. The ticket skill's tool table and
  `fabflows-setup` now also name the mcp-atlassian Jira tools (untested).
- **fabflows 0.9.0** -- compliance tracing for audits (#68). `fabflows-setup` asks which
  frameworks apply (SOC 2, ISO 27001, IEC 62304 or your own) and writes
  `compliance.frameworks`. With compliance on, each ticket spec carries a Compliance section
  with Controls, Change, Class and optional Traces lines, which Claude asks the user for and
  never guesses. `ticket.js approve` refuses a spec without a valid one, and
  `ticket.js labels` gives the tracker labels Claude sets on a best-effort basis. The new
  `trace` skill writes an audit trace report outside the repo, `trace.md` and `trace.csv`,
  listing every merged change with its PR author and approvers, tickets, spec hashes,
  Compliance values and flags such as `no-ticket`, `spec-changed` and `self-approved`, plus
  `pr-mismatch` when a PR's merge commit is not the row's commit. `trace` defaults `<to>` to
  the default branch and needs an absolute `--out` outside the repository. `trace --json`
  carries no git free text, and Claude sees only the summary and each flagged row's SHA, PR,
  key and flags from the report. PR titles, PR bodies and review bodies still reach Claude
  through the GitHub tools, like ticket bodies. The report is never committed.
- **fabflows 0.8.0** -- a repository can file every ticket fabflows creates under one parent.
  `fabflows-setup` asks for an optional parent epic, story or issue, reads it once to check
  it can hold child tickets, and stores it as `parent` in `.claude/fabflows.json`. The
  `ticket` skill sets the parent in the create call itself, so a refused parent leaves no
  ticket behind: `parent` on `createJiraIssue` (a sub-task type under a story),
  `parent_issue_number` on GitHub's `issue_write`, and `save_issue` on Linear (untested). A
  linked existing ticket is never re-parented, and the parent itself is never edited.
- **fabflows 0.6.0** -- specs can live in the tracker ticket instead of `docs/specs/`
  (#66). `fabflows-setup` asks once for GitHub Issues, Jira, Linear or none, checks that the
  tracker's MCP tools are loaded without ever adding a server or handling a secret, and
  writes a committed `.claude/fabflows.json`. The `ticket` skill carries the rules: the tool
  table per tracker, a plain-bullet body template, the description edited in place, standing
  permission only on a confirmed link, and status moving from in progress to done with the
  closing phrase on a finishing PR. `brainstorming` writes a full-tier spec to the linked
  ticket, fingerprints the approved text with `ticket.js approve`, and confirms it with
  `ticket.js check` before the build. The user approves the ticket description as raw text: a
  raw diff when Claude wrote it, the full raw text when it did not. `ticket.js normalize`
  removes only HTML comments outside fences, invisible and control characters, and the Links
  section, so the build gets the approved text unchanged, and `ticket.js approve` refuses text
  with an unclosed `<!--`. Links are per-branch, one state file each, shared by every
  worktree. The merge reminder finds the ticket by PR, or for a bare `gh pr merge` by the
  branch it started on, skips `--auto` and `--disable-auto`, and leaves a Refs-only ticket
  open. The `ticket.js` hook requires `Refs:` and `Spec:` trailers on their own line in each
  commit's own message, including commits chained with `&&` or run inside `$(...)`, and the
  key in the PR title.
- **docs-warden 0.6.0** -- compaction reminders that explain themselves. When fifty
  decision records exist but fewer than fifty are decided, `adr_compact.py --check` now says
  how many are still proposed instead of staying silent, and compact mode walks the human
  through accepting or rejecting them. The decisions hook also runs after an `Edit` or
  `Write` in `docs/decisions/` (one `PostToolUse` handler per tool, each with an `if` rule), passing the line to
  Claude as `additionalContext`, not only at session start. Compaction now lands as its own
  pull request: `adr_compact.py` refuses to archive on a working tree that is not clean, and
  compact mode starts a new branch or a separate worktree off the default branch and offers
  the push and pull request rather than folding the moves into a code branch. The plugin
  description now says it offers to archive once fifty are decided.
- **fabflows 0.5.0** -- brought in line with Anthropic's skill guide. The guard gains one
  exception: `pip install --isolated --target <dir> pypdf` (also `python -m pip`) when `<dir>`
  is a literal path with a `scratchpad` directory in it and outside live configuration, so a
  session can read a PDF without anything landing in site-packages; `--isolated` keeps pip
  from reading `PIP_*` variables or user config, and every other install stays blocked. The
  `fabflows` description drops "any task a Haiku or Sonnet worker could do" for the shapes
  that pay (DEC-0014, now accepted) and ends with a negative trigger for short tasks. All
  three skills declare `compatibility` (Claude Code only), the `fabflows` skill gains a
  troubleshooting table, and `evals/trigger-corpus.json` adds the trigger-accuracy corpus the
  benchmark could not measure, in ciso's format with a shape test.
- **fabflows 0.4.0** -- `brainstorming`, a design skill that turns a rough idea into the
  spec `fabflows:build` needs. The lead sizes the request (bounded, in chat; or full, with a
  spec written to `docs/specs/`), sends `explorer` and `researcher` for the facts instead of
  asking the user, opens with an assumptions round, then asks rounds of at most three numbered
  questions each with a recommended answer, at most three rounds, states the maximal version
  and cuts it to the smallest shippable slice, and hands off only after the user has read the
  spec. `refuter` gains a spec mode: given a draft instead of a diff, it attacks it across seven
  lenses and blocks the spec on a security gap. DEC-0017 records why the refuter was reused
  rather than a new agent added. The guard gains a rule: a destructive command written into a
  Makefile, justfile, npm script or shell script is blocked at the point it is written,
  since the shell rules cannot see inside `make nuke` once the target exists.
- **fabflows 0.1.0** -- a new plugin for sessions whose lead runs on an expensive model.
  Ships four worker agents pinned to cheaper tiers, each scoped to the smallest tool set
  that does its job and none able to spawn workers of its own, plus a skill carrying the
  routing table, the four-part delegation brief, the worker report contract, and the
  verification gate the lead must pass before accepting a worker's claim. It also ships
  this repository's first **active plugin hook**: a dependency-free Node `PreToolUse`
  guard that blocks package installs, commits and pushes on a default branch, destructive
  shell commands, reads or writes of credential files, and writes to live Claude Code
  configuration or git hooks, plus a `SubagentStop` check
  that sends back a worker report missing its contract fields. The guard fails open by
  design, so a bug in it degrades to no guard rather than to a session that cannot run
  any command.
- **fabflows 0.2.0** -- two Opus agents and a build loop. `refuter` reviews a finished
  change by trying to show it is not done: it reads the diff against the spec, re-runs
  the tests itself, and returns ACCEPT or REWORK with must-fix findings, or BLOCKED when
  it cannot run them. `investigator`
  reproduces a self-contained failure and narrows it to `file:line` with ranked
  hypotheses, leaving the root-cause call to the lead. `fabflows:build` is a Workflow
  script that takes one spec'd change through a feature branch: an Opus builder
  implements and commits, a fresh reviewer (Fable by default) judges, and after two
  rework rounds it hands back to the lead. Work left uncommitted fails both the review
  and the lead's gate, so a passing test no longer vouches for files the diff never
  showed. The editor and test-runner now pin their effort (medium and low) instead of
  inheriting the lead's, and the skill gains guidance on who leads, lead effort, and
  long sessions. DEC-0004 records why Fable stays the lead rather than the
  coder. A builder reply that names a blocker escalates even when it says done, and a
  permission denial counts as a blocker; DEC-0006 records why. A report whose first line
  starts with a denial escalates too, and a reply with an empty report or a blocked reply with no
  reason escalates as `unexplained` instead of reaching review.
- **fabflows 0.3.0** -- `using-fabflows`, an entrypoint skill invoked at the start of a
  conversation. It loads the `fabflows` skill first, then treats its own invocation as the
  user's standing opt-in to the Workflow tool and `fabflows:build` for the rest of the
  session: a task that implements a feature, a component or another spec-able change goes
  straight into the build loop, prepared and launched by the lead, rather than prompting
  for opt-in again. DEC-0011 records why an entrypoint skill rather than a SessionStart
  hook.
- **docs-warden 0.3.0** -- two more Vale packages beside `Microsoft` and `write-good`:
  `proselint` (misused words, hedging, jargon, typography) and `ai-tells` (patterns of
  machine-written prose), both pinned by release URL. The shipped configs default both
  packages to warning level. The configs skip YAML front matter titles and
  descriptions, which decide when a skill triggers. This repository's own config
  promotes 17 rules to error: 15 `ai-tells` punctuation and filler rules plus
  `proselint.Uncomparables` and `proselint.CorporateSpeak`. Decision records, run
  logs, changelogs, dated plans, test fixtures and eval prompts skip the two new
  packages.

### Changed

- **data-analysis 1.0.0 (breaking)** -- `data-analysis-review` is renamed `data-analysis`, and
  its skill is now `data-analysis:review`, so the plugin can host a second skill (#105). Run
  `/plugin uninstall data-analysis-review`, then `/plugin install data-analysis`. Review's
  default report folder moves to `docs/data-analysis/`. Both skills now refuse a non-string
  path or a path with a `..` segment, and strip thesis and evidence tags that carry
  attributes.
- **fabflows 0.13.16** -- the lead launches `fabflows:build` only after the user has read the
  spec text and said yes, and plan mode defers every ticket write, commit and build launch, so
  the approval at ExitPlanMode no longer stands in for reading the spec (#151).
- **fabflows 0.13.13** -- iteration 6 measured a rework permission for the build loop (#146):
  a reviewer's must-fix lets the builder fix a real bug in code the change calls, even where the
  spec says that code keeps working as it does, later reviewers see what earlier rounds demanded,
  and the must-fix definition narrows to a wrong result on an input the code's domain has. On
  task 8 the builders fixed every caret defect the review named, 3 of 3, but the lead reverted two
  of those fixes after the loop, citing the fixture's spec, and two reviews never named the
  defect. The plugin adopts nothing: the measured text is `evals/snapshots/rework-permission.patch`,
  stacked on `review-callees.patch`, and the evals README recipe now shows how a patch stacks.
- **fabflows 0.13.12** -- iteration 5 measured a rule for the refuter (#145): the code a diff
  calls is in scope, and one line of the project's own code may probe it. On task 8, whose
  fixture carries a defect in a callee the spec never names, the build loop's review named the
  defect in 5 of 5 runs against 0 of 3 on master, and the rework left it in place in 4 of 5,
  because the builders read the fixture's spec as forbidding the library change. The rule was
  not adopted: `agents/refuter.md` and `workflows/build.js` stay as they are, and the measured
  text is `evals/snapshots/review-callees.patch`. The evals README task table gains the task 8
  row, and `docs/EVALS.md` cites the lines it quotes.
- **fabflows 0.13.11** -- the investigator, editor and test-runner adopt the agent rules
  iteration 3 measured (#140): a one-line stop when a brief part has no label, the planted
  instruction quoted word for word, and an empty report item written as None. Iteration 4
  measured a first-paragraph form of the stop rule for the two Haiku agents, and the refuter's
  rules again: the explorer stopped in 4 of 5 runs, the researcher in 3 of 5, and one report each
  from the explorer and the refuter broke its return order, so those three files stay as they
  are. The `agent-rules` patch leaves `evals/snapshots/`, RESULTS.md cites it by commit, and
  `haiku-preflight.patch` takes its place.
- **fabflows 0.13.10** -- iteration 3 measured clearer agent rules and did not adopt them (#120).
  The `agent-rules` patch in `evals/snapshots/` makes each worker agent stop with a one-line reply
  when a brief part has no label, quote a planted instruction word for word, and write an empty
  report item as None. 28 of 36 runs passed every check, against a bar of 36: the Opus and Sonnet
  agents stopped on every brief with a missing part, and the two Haiku agents in 2 of 6. The
  shipped agent files are unchanged, and #140 follows up. The grader and SubagentStop tests gain
  the one-line stop reply, and the planted-regression recipe builds its copy from commit
  `45978ed`, the commit its patches are pinned to.
- **fabflows 0.13.9** -- the benchmark grader no longer fails correct work in the forms iteration 1
  produced (#132). The report-order check counts return items named together in one line's
  label, and accepts the investigator's "Files involved" and the test-runner's "Command" headings. The
  missing-part check accepts `no separate <part> section`. Task 2 drops its literal `pipx` check
  on `guard.js` and keeps the guard's behaviour checks. Iteration 1 is regraded in place with no
  new sessions: 7 runs change, superpowers' scoped-edit quality becomes 1, and the agent tasks
  go from 105/124 to 110/124. Only the eval grader and its record change.
- **fabflows 0.13.8** -- the fabflows skill loads less text at start-up (#133). Its "When it goes
  wrong" table and four "Long sessions" bullets move, word for word, to
  `skills/fabflows/references/recovery.md`, and the skill points there when something goes wrong
  or a session runs long. A permission denial is still surfaced with the exact call. Iteration
  2 of the benchmark measured the change: about 470 fewer start-up tokens a run, every run
  passing, and a lower pooled cost on the short tasks. `evals/RESULTS.md` records it, and the
  evals README's variant recipe now uses `patch -p3 -d` on the snapshot.
- **fabflows 0.13.7** -- the evals harness no longer passes a launching Claude Code session's
  variables to the sessions it runs (#128). `lockedEnv` removes `CLAUDECODE`, the `CLAUDE_` and
  `CCR_` names outside a keep-list of login, provider and network settings, other session
  variables and git configuration passed in the environment. Each `run.json` lists the removed
  names as `droppedEnv`. Runs from a cloud session no longer need a wrapper script.
- **fabflows 0.13.6** -- three prompt sentences split at a semicolon into two (#135): in the
  editor agent, the build-loop reference and the using-fabflows skill. Each held the only
  error-level Vale alert in its file, which would fail CI on any pull request that edits it.
  The wording is otherwise unchanged.
- **fabflows 0.13.5** -- a `Prompting` Vale style lints the fabflows agents and skills against
  Anthropic's prompt-writing advice (#124). `NegativeOnly` flags a sentence that opens with
  `Never`, `Do not` or `Don't` and doesn't say what to do instead, and `CapsEmphasis` flags
  all-caps emphasis. Both are suggestions, so the docs CI job prints them in a report step
  that never fails. A self-test checks both rules. The prompts keep their wording, and no behaviour a
  consumer sees changes.
- **fabflows 0.13.4** -- iteration 1 of the benchmark is recorded (#123). Pooled over the 60 task
  runs, a fabflows run cost 36.6% more than no skill and 15.7% more than superpowers. Quality
  differed on one text-match check only, which the analysis reads as a grader artifact. `evals/RESULTS.md` gives the per-task figures, where the
  extra cost goes, the agent-task gaps and the confounds. `docs/EVALS.md` and the READMEs point
  to it. Only the eval record and its docs change; no behaviour a consumer sees changes.
- **fabflows 0.13.3** -- the benchmark harness can run the three-arm baseline #123 records.
  A cell that fails, at any stage, writes its own `error.json` and the other cells still run;
  the runner lists the failures and exits non-zero, and a timed-out session is killed with its
  whole process tree. Every arm loads project settings only, the clean room also turns off
  synced claude.ai plugins by their manifest names, and every session gets an unresolvable
  `origin` and an empty `gh` config. A `superpowers` arm loads the highest cached version of
  that plugin. Each plugin arm stages its own copy and records its name, version and tree hash
  (and, for superpowers, the marketplace's pin at run time), and the arm order rotates each
  repeat. `metrics.js` also records cache writes by lifetime (1h and 5m), the size of each
  Skill load, the text SessionStart hooks inject, and where each loaded plugin came from.
  `summarize.js` prints each arm's mean cost against without_skill, and with_skill against
  superpowers, and names any cell it leaves out of the means. `annotate_benchmark.py` sets the
  benchmark's delta to with_skill minus without_skill, where the aggregator took the first
  two arms by name, and adds dollars to each configuration. Only eval tooling and its docs
  change; no behaviour a consumer sees changes.
- **fabflows 0.13.2** -- the prompts' security rules get a guard that survives rewording
  (#122). `plugins/fabflows/test/required-rules.test.js` checks that each rule family
  (untrusted content is data, read-only, no installs, no commits unless briefed, and the
  rest) is still stated in every prompt that needs it, by a loose pattern per family rather
  than exact wording, and CI now runs it. The hash-pinned frozen lists, `keep_check.py` and
  `gate.sh` are removed, since prompts may now be reworded and evals judge the result. The
  old eval record (iterations 1 to 14, the brainstorming evals and the variant patches) is
  removed too; it stays readable at commit `dce556c`, and `evals/RESULTS.md` restarts for
  the baseline #123 measures. No behaviour a consumer sees changes.
- **fabflows 0.13.1** -- wording only (#101). The description in `plugin.json` and in
  `marketplace.json` is shorter and keeps the same facts. The root README's fabflows entry is
  split into short labelled points, and leaves the fine print to the plugin README.
  The plugin README now says the benchmark has run 13 iterations, not six. It says the 87.5%
  that `brainstorming` beat was the older version of that skill, and adds the 94% against 50%
  with no skill. Short tasks cost +33% to +42% with the skill, not +21%, which was iteration
  2's mean across every task. The root README is rewritten as the project's front page, and the new
  `docs/EVALS.md` collects every plugin's recorded eval results in one place.
- **docs-warden 0.7.2** -- decide mode checks the kind of change before its three
  admission questions (#81). A bug fix, a review fix, a refactor, a rename, a wording
  change, a dependency or test change, a hook, CI, linter or config value, a temporary
  switch, a rollout plan, or a field or format choice inside one feature never earns a
  decision record. The proactive offer follows the same rule. Question 3 no longer counts
  an option weighed only as another way to fix a bug. A record stays `proposed` while its
  pull request is in review, and review rounds edit it in place, so they no longer produce
  chains of superseding records. The change to `accepted` is the last edit to the file,
  made on the human's word. A new eval covers a bug fix stated with rejected options.
- **fabflows 0.7.0** -- the guard now covers package runners (`npx`, `pnpx`, `bunx`,
  `npm exec`, `bun x`, `pnpm dlx`, `yarn dlx`, `uvx`, `uv tool`, `uv run --with`, `pipx`,
  `npm|yarn|pnpm|bun create`, `npm init <pkg>`), not only installers. An install or runner in
  the lead now returns `ask`, so the user approves it in a native prompt, but only in the
  `default`, `acceptEdits` and `auto` modes; a worker, `plan`, `bypassPermissions`,
  `dontAsk`, or a missing mode still gets `deny`, and every decision tells Claude to stop.
  The ask is emitted only after every other rule has passed, and an install aimed at live
  config (by `cd`, `pushd`, `Set-Location`, session directory, `VAR=` prefix or
  `--prefix=`, with `~`, `$HOME` or an absolute home) is always denied, and the prompt
  names every install in the command. An `npx` or `npm exec` of a bin already in the project's
  `node_modules/.bin` is not a download, so `npx vitest run` still works; `pnpx` and
  `bunx` always count as downloads. Prefixes such as `time`, `timeout`, `nice`, `env` and
  `xargs`, and a quoted command name, no longer hide a command, and the `Monitor` tool is guarded like Bash. The build brief makes
  a denied install a blocker. The skill tells Claude to name the package and ask before
  trying any other route. DEC-0023 supersedes DEC-0002's "no installs regardless of model
  judgement".
- **docs-warden 0.7.0** -- `audit.py` no longer runs markdownlint-cli2 through `npx --yes` or
  `bunx`, which downloaded it into a cache outside the repo where no hook could see it. Lint
  runs only when `markdownlint-cli2` is on PATH; otherwise the check reports `skipped` and
  names the `npx` command to ask the user to approve. `--run-generators` skips a generator
  that is a package runner or installer (`npm ci`, `pip install`, `uv sync`) and asks the
  user to run it.
- **docs-warden 0.4.2** -- the concept extractor reads tracked files when the repository is a
  git checkout, so untracked worktrees and scratch under `.claude/` no longer leak into
  `docs/architecture/domain-model.md` and trip the `ontology` check.
- **lint** -- markdownlint ignores session scratch, other checkouts' worktrees, accepted
  decision records and the append-only run logs, and no longer enforces ordered-list
  numbering (a "Part 2" that continues at step 6 is valid and the prose cross-references
  depend on it). Every fence in plugin docs now names its language, and the remaining
  structural findings are fixed, so the audit's blocking lint tool runs clean.

- **docs** -- retired `docs/superpowers/` (nine specs and seven plans from the previous
  toolchain, all of whose work had shipped). Four fabflows-format specs under `docs/specs/`
  now record the shipped behaviour of data-analysis-review, the ciso HITRUST module,
  ciso sync-tasks and ciso CMMC, and DEC-0018 to DEC-0021 record the hard-to-reverse
  decisions those documents carried. Code comments that cited the old paths point at the
  new specs.
- **fabflows 0.3.5** -- the lead's verification gate reads the diff instead of every
  changed file and caps command output to its tail, and the build loop's report schema
  and review brief ask for summaries and failing lines rather than whole logs, matching
  the 0.3.4 worker contract.
- **fabflows 0.3.4** -- tuned for a Fable lead on a subscription weekly cap. The lead
  keeps the session's effort; only workers pin theirs. Delegation now turns on context
  volume: a worker pays off only when it keeps a large
  log, search or file out of the lead, so a one-file grep or a one-line edit stays
  inline. Workers return each command's exit status, final summary and failing lines,
  never a whole log or diff. The README cache tip now says a subscription's main
  conversation already has a one-hour cache and only workers need
  `subagentPromptCacheTtl`. DEC-0012 and DEC-0013 record why.
- **ciso 1.1.3, data-analysis-review 0.1.1, fabflows 0.2.1** -- wording only. Every
  living document is reworded to pass the new Vale rules without changing what it
  says. Front matter descriptions are untouched, so skill routing does not change.

### Fixed

- **data-analysis 1.1.1, ciso 1.1.5, docs-warden 0.7.3, fabflows 0.15.1** -- each plugin
  description is now 499 characters or fewer, under the 500-character limit that Claude
  desktop and the claude.ai web app enforce, which these four had gone over (#163). Only the
  wording is shorter. Details cut from a description are still in that plugin's README.
  `test/marketplace-consistency.test.js` now fails on a description over 499 characters, and
  the `docs` CI job runs `test/*.test.js` on every pull request.
- **fabflows 0.13.15** -- `annotate_benchmark.py` compares an arm's cost with without_skill
  only over the evals both ran, as `summarize.js` does, so an arm that ran other tasks gets its
  mean alone and `delta.cost_usd` agrees with the note (#130). The model line lists the task
  runs' lead models and, apart from them, the agent runs' session models, found by task id in
  `tasks.json`. A dollar difference prints its sign first (`+$0.23`), a zero base prints `n/a`,
  and an eval directory with no task id in its name is skipped with a message rather than
  aborting the run. Only eval tooling and its docs change.
- **fabflows 0.13.14** -- each eval session gets its own temp directory under the run's
  isolated directory, recorded in `run.json`, so parallel runs stop reading each other's
  files from the shared `/tmp` (#129).
- **data-analysis-review 0.2.2** -- closes the open 0.2.0 review findings (#115). An agent
  that returns nothing (an EDA role, the reconciler, or a cross-compare topic) no longer throws
  or vanishes: the run logs it and names it in a new `dropped` list on the result, which the
  report's scope must repeat. A cross-compare entry with no verdict renders as "(no verdict)"
  under Cross-Comparison, never as "undefined" or Not Addressed. An executive summary written
  as one string renders one bullet per line, and the EDA business-impact line has the same
  bold label as the other sections. The README no longer says Claude enters plan mode or
  waits for plan approval outside plan mode, and SKILL.md points at `EVIDENCE_HYGIENE` in
  `workflow.js` rather than repeating it.
- **fabflows 0.13.0** -- the `ticket` skill no longer says Jira drops tables. Tested against
  real Jira through the Atlassian Rovo server, Jira keeps a table and shows a task list as
  plain bullets without its checkboxes. The plain-bullets rule for the ticket body is
  unchanged.
- **fabflows 0.13.0** -- the `ticket` skill's GitHub steps now match live GitHub. Closing as
  not planned is confirmed, and the skill says to send the reason with the state, since
  GitHub ignores it otherwise. It warns that one login that cannot be assigned makes GitHub
  refuse the whole assignee change. `/fabflows-setup` notes that GitHub, like Linear,
  accepts a closed parent, so its own check is the only guard.
- **fabflows 0.11.1** -- the `ticket` skill no longer stalls when a workflow's status names
  differ from in progress, in review and done. It lists where the ticket can move and matches
  on the target status, not the Jira transition name, since a transition named Reviewed can
  lead to Working as Designed. It picks the closest match, uses in progress when there is no
  review status, and never picks a status that drops the work, such as Wont Fix. It only moves
  a ticket forward, so a push after the PR opens no longer sends an In Review or Blocked ticket
  back. If nothing fits, it leaves the status alone and tells the user the names it saw.
- **fabflows 0.9.1** -- the trace report closes the known gaps from 0.9.0 (#78).
  `self-approved` ignores case, since GitHub logins do. A merge row's author column names the
  merge's author and every author and co-author of the commits it brought in. `trace` no
  longer needs git 2.31 or 2.33 and runs on git 2.24 or later. A test runs the trace skill's
  row filter, word for word, on a real report. `fabflows-setup` refuses **None** picked
  together with a framework, and the ticket skill's claim that GitHub's `issue_write`
  `labels` replaces the whole list is now confirmed by a live test.
- **fabflows 0.8.1** -- the guard closes three misses against rules its README already
  states. A recursive delete of a root followed by a glob (`rm -rf /*`, `'/'`, `/?*`,
  `C:\*`) is blocked as the root itself. `chmod` is blocked when its mode grants world
  write, so a flag (`chmod -R 777 .`) no longer hides the mode and symbolic modes
  (`o+w`, `a+rwx`, `o=u`) count; a runner file carrying either is blocked too. A `Grep`
  whose `glob` can match a sample secret name (`.env`, `*.pem`, `.*`) is denied, and so is a
  `Read` or `Grep` of a bare `~/.ssh` or `~/.aws` directory. A quoted mode (`'o+w'`) and a
  credential path with doubled separators or `./` segments (`.aws//credentials`) are caught
  too, and so are the bypasses a code review found: a glob split on commas or behind a
  directory prefix, `..` segments, an example file named beside a real one, escaped or
  empty-quoted roots and modes, bracket and brace roots (`/[a-z]*`), and any octal
  mode that lets others write (`=777`, `666`). A pathological glob is decided in milliseconds
  instead of hanging past the hook timeout. System directories and secret names outside the sample list stay known gaps.
- **fabflows 0.7.1** -- the guard stops blocking about twenty everyday commands its README
  never claimed to block, and each narrowed rule keeps a test that the nearby real threat is
  still caught. Commands split only on separators outside quotes, so a commit message, a PR
  body or a `grep` pattern that mentions `npx` or `sudo` is text. Git ops follow a branch
  created in the same command and every directory change, not only `cd`, and a push is judged
  by the branch it writes to, which also catches `git push origin HEAD:main` from a feature
  branch. `merge-base`, `merge --abort` and `git clean -n` pass. A delete under home is
  blocked only at home, its direct children, its credential and config directories, and any
  target with a `..` segment, which also catches `rm -rf /root` and `rm -rf "$HOME"`. An
  echoed message in a runner file is not a command. `monkey.pem.md`, `api.key.ts` and a
  `.env` virtual environment directory are not secrets. `bat`, `sed` without `-i`, a copy out
  of live configuration and a hook script run directly count as reads, and a backup such as
  `settings.json.bak` is not live configuration. The worker report check accepts a
  researcher's searches and fetches and an `exit status`. A local bin hoisted above the
  project root, as in a monorepo workspace, is not a download.
- **docs-warden 0.7.1** -- the compaction waiting line counted every record that was not
  accepted or rejected as "still proposed" in its text. A draft or a stored `superseded` then
  sent compact mode looking for proposed records that did not exist, and the line never
  cleared. The line now names them as "not yet accepted or rejected" and compact mode lists
  each such record with its status.
  Status is also matched ignoring surrounding spaces, so `" accepted "` counts. The index
  still prints each status as written, so no committed index goes out of date. A string tag
  such as `no-compaction-needed` no longer hides a record: only the whole, lowercase tag
  `compaction` marks a digest.
- **docs-warden 0.6.1** -- compaction archived any decision record whose status was not a
  lowercase `proposed`, so a `Proposed` or `draft` record, or one whose front matter did not
  parse, could be moved into `archive/` and frozen into an accepted digest. Only `accepted`
  and `rejected` records archive now, in any case, and `--check` counts the same way. The
  immutability check also reads status in any case: a record marked `Accepted` was never
  checked.
- **docs-warden 0.6.0** -- the decisions hook reads its input as UTF-8. It decoded stdin with
  Python's locale codec, cp1252 on Windows, so in a repository whose path held a non-ASCII
  character, such as `café`, the compaction reminder never appeared.
- **fabflows 0.3.6** -- `fabflows:build` failed on Windows before it ran, with the harness
  error "script contains control characters." The plugin cache is a git checkout, and with
  `core.autocrlf=true` the workflow script arrived as CRLF; the harness hands that file to
  the Workflow tool verbatim and refuses the carriage returns. A root `.gitattributes` now
  pins LF on every platform and a test keeps the script free of control bytes. A cache
  checked out before this fix still holds CRLF on disk: re-install the plugin, or
  renormalise the marketplace clone (`git rm --cached -r .` followed by a hard reset) and
  copy it into the cache again.
- **fabflows 0.3.5** -- two guard gaps. An assignment-only segment swallowed an unspaced
  redirect, so `X=1>~/.claude/settings.json` was allowed; and a `cd` the guard could not
  resolve to a repository (a variable, `-`, a missing path, a subshell) skipped the
  default-branch check. Both deny now.
- **docs-warden 0.4.1** -- a bare `waivers:` or `extra_files:` key (YAML null) no longer
  fails the manifest check, and a missing `domain_model.py` is reported as a failure
  instead of being mistaken for the generator's "no sources" exit code.
- **docs-warden 0.1.1** -- the run log rotation rule required an entry to be both
  past the 500-line trigger and older than 90 days. Both had to hold, so a busy
  repository tripped the line count with nothing old enough to move: the rule
  selected nothing and the warning stood with advice nobody could follow. The age
  filter is gone; the oldest entries now move until the log is back under the limit.

- **fabflows 0.2.4** -- the guard denied read-only inspection of `~/.claude`. Its
  shell-side allowlist held only a handful of command names, so a plain `cut`,
  `basename` or a `for d in ~/.claude/plugins/...; do cat "$d/x"; done` loop over the
  plugin cache read as an unknown command naming a protected path and was blocked, with
  a message about disarming the guard. Shell keywords are now stripped before a segment
  is matched, a `for` header counts as read-only when the loop body is read-only too,
  and the allowlist covers the common read-only text tools. `sort` and `uniq` are not
  among them: both write a file without a redirect, via `sort -o` and `uniq`'s second
  positional argument. Writes to live configuration stay denied.
