# docs-warden: say why compaction waits, remind mid-session, land it as its own PR

The docs-warden plugin already reminds at session start when `docs/decisions/` is due for
compaction (`hooks/decisions_check.py` runs `adr_compact.py --check`), and compaction runs
only on the human's yes (DEC-0003). This change keeps that yes and closes three gaps. The
hook stays silent when fifty records exist but fewer than fifty are decided, which is the
likeliest cause of a silence seen on another machine: this repository has 22 records, 19 of
them `proposed`. The hook only speaks at session start. And compact mode runs the archive
on whatever branch is checked out, so a feature pull request can carry 25 renames that have
nothing to do with it.

## Behaviour

1. **Waiting line.** `adr_compact.py <repo> --check` keeps today's line when 50 or more
   records in `docs/decisions/` are decided (status not `proposed`, not a digest):
   `docs-warden: {n} decision records in docs/decisions are ready to archive (compaction point is 50). Run the docs-warden skill's compact mode to move the oldest 25 into a digest.`
   New: when fewer than 50 are decided but decided plus proposed (all top-level non-digest
   `DEC-*.md` records) is 50 or more, it prints exactly one line instead:
   `docs-warden: {total} decision records in docs/decisions, {decided} decided and {proposed} still proposed. Compaction archives decided records only and starts at 50. Run the docs-warden skill's compact mode to review the proposed ones.`
   Otherwise nothing. Both lines carry only counts and fixed text, never a record's title
   or body, because they enter Claude's context. Without `--check`, nothing changes, and
   `--check` never creates `archive/` or moves a file.
2. **Mid-session reminder.** `decisions_check.py` branches on `hook_event_name`. For
   `PostToolUse`: take `tool_input.file_path`, resolve it against the payload `cwd`
   (default `.`) to an absolute path; if its parent folder's last two parts are
   `docs`/`decisions`, run `--check` on the absolute repo path (the folder holding
   `docs/`); if that printed a line, print
   `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"<line, stripped>"}}`.
   Any other file, a quiet `--check`, a missing `tool_input`, bad JSON, or any error gives
   no output and exit 0.
3. **Registration.** `hooks/hooks.json` adds `PostToolUse`: matcher `Edit|Write`, one
   command handler with `"if": "Edit(//**/docs/decisions/*)"`, the same
   `python3 "${CLAUDE_PLUGIN_ROOT}/hooks/decisions_check.py"` command, timeout 5. The
   `SessionStart` entry is unchanged. `//**/` matches anywhere and across drives; a bare
   `**/` would match only under the session's working directory (Claude Code
   permissions docs, path patterns and Windows normalization).
4. **Session start unchanged.** Every `hook_event_name` other than `PostToolUse`
   (including `SessionStart` and a missing name) behaves as today: `--check` on `cwd`,
   plain stdout. So the waiting line also reaches Claude at session start.
5. **Compact mode** (`SKILL.md`) handles the waiting line: list the proposed records
   oldest first, ask the human to accept or reject each, never change a status without
   their word, then re-run `--check`. The due-line steps are unchanged.
6. **Wording**, updated in the commit whose behaviour makes it stale:
   - One-line description, `plugin.json:4` and `marketplace.json:28`: "compacts the oldest
     of them into a digest once fifty exist" becomes "offers to archive the oldest of them
     into a digest once fifty are decided". Root `README.md:37`: "compacts the oldest into
     a digest once fifty exist" becomes "offers to archive the oldest into a digest once
     fifty are decided".
   - "fifty" or "50" meaning decided: plugin `README.md:40`, `SKILL.md:21-22`,
     `references/universal-set.md:63`.
   - "does nothing below 50" becomes "archives nothing below 50 decided": `SKILL.md:179`,
     `adr_compact.py:16`.
   - "SessionStart only" becomes "at session start and after an edit in
     `docs/decisions/`": plugin `README.md:42`, `hooks.json:2`, `decisions_check.py:2`,
     `SKILL.md:166`, `adr_compact.py:17-18`, `references/adr-format.md:129`, and
     DEC-0003 lines 50-54 and 84-85. DEC-0003 stays `proposed`; its gap becomes "changes
     made through Bash wait for the next session start".
7. **Compaction lands as its own pull request.**
   - `adr_compact.py` without `--dry-run` or `--check` refuses when `git status
     --porcelain` for the repo prints anything, tracked or untracked: an error on stderr
     naming the reason ("compaction must land as its own commit; start from a clean
     checkout of a new branch off the default branch"), exit 1, nothing created or moved.
     If git cannot answer, it refuses the same way. The check sits after the `--dry-run`
     return and before `render`, `mkdir` and `git mv`; `--check` and `--dry-run` stay
     git-free and unaffected.
   - `SKILL.md` compact mode, after the dry run and the yes: compaction is housekeeping and
     lands alone. Unlike a doc update, which rides with the code it describes
     (`references/anti-drift.md`, "Documents in the same pull request"), it describes no
     code change. Start a new branch from the up-to-date default branch. If the current
     checkout has work in progress or sits on another branch, do not stash or switch it:
     use a separate worktree (`git worktree add`) or ask the human when. Run the script,
     `adr_index.py` and `audit.py`; commit the moves, digest and index as one commit; offer
     to push and open it as its own pull request (merge request on GitLab). Never fold it
     into a branch that carries code. Reviewing proposed records (the waiting line)
     follows the same route: status changes in their own commit, in the same housekeeping
     pull request. A record accepted as part of the change that implements it stays with
     that change.
   - One sentence each in the plugin `README.md` compact bullet,
     `references/adr-format.md` (Compaction section) and DEC-0003's outcome: compaction
     lands as its own pull request.
8. **Release.** 0.5.0 becomes 0.6.0 in `plugin.json` and `marketplace.json`.
   `CHANGELOG.md` `[Unreleased]`, `### Added`, gets a **docs-warden 0.6.0** entry in the
   existing entries' style.

## Check

testCommand, from the repository root:
`python3 plugins/docs-warden/test/test_scripts.py && node --test "test/*.test.js"` exits 0.
Baseline before this change: 86 PASS, and 4 of 4.

Tests in `plugins/docs-warden/test/test_scripts.py`:

- **New** `test_check_says_why_compaction_waits`: 49 accepted plus 1 proposed gives the
  waiting line with "49 decided and 1 still proposed" and no "ready to archive"; 40
  accepted plus 9 proposed gives nothing; 48 accepted plus 1 proposed plus 1 digest gives
  nothing; 50 accepted gives "ready to archive" only; after `--check` on 50 committed
  records in a git repo, no `archive/` exists and all 50 files remain.
- **Changed** `test_decisions_check_hook_speaks_only_at_50`, in commit 1: per count,
  assert `"ready to archive"` is present only at 50, and the waiting line is present at 49
  (its fixture is 49 accepted plus 1 proposed plus 1 digest); garbage stdin stays silent.
- **New** `test_decisions_check_hook_after_edit`: with 50 accepted, a PostToolUse Edit
  payload whose `file_path` is `<repo>/docs/decisions/DEC-0050-x.md` and whose `cwd` is a
  different temp dir gives stdout that parses as JSON, with `hookEventName` `PostToolUse`
  and `additionalContext` containing "ready to archive"; a Write payload gives the same; a
  relative `docs/decisions/DEC-0050-x.md` with `cwd` set to the repo gives JSON. With
  `cwd` set to the repo, so that a fallback to `cwd` cannot pass: `<repo>/README.md` gives
  nothing and `<repo>/docs/decisions/archive/DEC-0001-x.md` gives nothing. 49 accepted and
  none proposed gives nothing. No `tool_input` gives nothing and exit 0. The payload
  `{"hook_event_name":"SessionStart","cwd":<repo>}` gives plain, non-JSON stdout containing
  "ready to archive". `hooks.json` holds the PostToolUse entry with matcher `Edit|Write`
  and `if` `Edit(//**/docs/decisions/*)`.
- **New** `test_adr_compact_refuses_a_dirty_tree`: `_decisions_repo(repo, 50)` plus an
  untracked file makes `_compact(repo)` exit 1 with the reason on stderr, no `archive/`,
  no digest, and all 50 records in place; the same with a modified tracked file instead;
  `--dry-run` and `--check` on the dirty tree still exit 0 with their usual output; after
  committing, `_compact(repo)` exits 0.
- **Unchanged**: the existing compaction tests still pass. Their fixtures commit before
  compacting (`_decisions_repo`, `_grow`).

Run by the lead after the build: the installed `adr_index.py .` leaves no diff, and the
installed `audit.py .` reports no new fail or warn against the base.

Pre-merge live check, run by the user with the branch installed and a new session: in a
scratch repo with 50 accepted records, (a) Edit one record from a session opened at the
repo root, (b) Write one record, (c) Edit one record from a session opened in a different
folder. Claude receives the line each time. If any case misses, drop `if`, accept the
Python start on every edit, and re-run.

## Out of scope

- Archiving without the human's yes (DEC-0003; the skill's non-negotiable "Never fix
  silently").
- Showing the reminder on screen (`systemMessage`).
- Mid-session changes made through Bash (`git pull`, merge, `adr_new.py`).
- Which records are archivable; proposed records never move.
- Any other cause of the silence on the other machine.
- Pushing or opening the compaction pull request without the human's yes.
- Script-enforcing that the branch starts at the default branch: the script cannot
  reliably know the default branch, since `origin/HEAD` may be unset or stale.
- The candidate rule counting `Proposed`, `draft` or a record with broken YAML as decided
  (`adr_compact.py:98`); an existing bug for a separate change.

## Decisions

- Keep the human's yes before anything moves: the plugin's first non-negotiable.
- The mid-session trigger is PostToolUse on `Edit|Write` in `docs/decisions`, the moment
  a record becomes decided.
- The reminder reaches Claude only. PostToolUse needs `additionalContext`, because its
  plain stdout goes only to the debug log.
- The waiting line is a fix on inference, approved by the user because the silence could
  not be reproduced here. Consequence accepted: in a repository like this one it shows at
  every session start and every record edit once 50 records exist, with no dismiss, until
  the proposals are decided.
- The `if` rule keeps unrelated edits from starting Python, which took 320 to 470 ms per
  start on the test machine. `Edit` rules cover all file-editing tools in permission
  rules; that `if` anchors the same way is inferred, hence the live check. The script
  re-checks the path regardless.
- Check the repository that holds the edited record, as an absolute path, not the
  session's working directory.
- One script. "Due" and "waiting" are defined only in `adr_compact.py --check`.
- Remind on every qualifying edit; no per-session memory.
- DEC-0003 is edited in place while it is still `proposed`; only accepted records are
  immutable.
- The script enforces the one thing it can know, a clean tree, so a compaction commit
  never picks up work in progress; the skill carries the branch, worktree and pull request
  steps. The new `git status` runs only on the path that already runs `git mv`, so
  `--check`, which hooks run in any repository, stays git-free.
- A separate worktree, never a stash or a branch switch: the human's work in progress is
  not Claude's to move.
- Push and pull request are offered, not done, because they are outward-facing. The
  wording stays forge-neutral because `forge:` varies.
- This work ships as one pull request: one feature area, five commits, one version bump.
  The three-line description rewording stays in it and is called out in the pull request
  description.
- Commits, each passing testCommand: (1) `feat`: waiting line, new check test, changed
  hook test, and the docs they make stale; (2) `feat`: PostToolUse branch, `hooks.json`,
  new hook test, their docs, and DEC-0003's trigger lines; (3) `feat`: clean-tree
  refusal, its test, the compact-mode procedure, and the README, `adr-format.md` and
  DEC-0003 sentences; (4) `docs`: descriptions in `plugin.json`, `marketplace.json` and
  the root README together; (5) `chore`: 0.6.0 in both manifests plus the CHANGELOG entry.

## Deferred

- Bash triggers (`git pull`, merge, rebase, `adr_new.py`).
- An on-screen `systemMessage`; revisit if the other machine turns out to have fired
  without Claude relaying it.
- A stderr trace on hook failure; finding the repository root from a subfolder at session
  start.
- Per-session dedupe; `.docs-warden.yml` keys for 50 and 25.
- Very large folders: every qualifying edit parses all records, and past the 4-second
  timeout the hook goes silent.
- The oldest Claude Code version that accepts `if` is unknown; whether an older one would
  reject the whole `hooks.json` is a guess.
- Regenerating `docs/architecture/domain-model.md`, a generated file that is already
  stale.
- An eval proving compact mode opens its own branch and pull request; no eval covers
  compact mode today, and the clean-tree refusal is the deterministic backstop.
- Opening the pull request through the forge's CLI; a check that flags a pull request
  mixing archive moves with code.
- The digest's id and a feature branch that adds a record in parallel can take the same
  next `DEC-NNNN`. This risk exists for any two branches today; renumber the unmerged one.
