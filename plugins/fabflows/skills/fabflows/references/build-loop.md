# Build loop outcomes

Every escalation carries `reason` and a one-line `next` in the result itself, and that `next` is
the whole instruction for its outcome: act on that. The builder's work is staged, not committed,
in every case: read it with `git diff --cached <baseRef>`. The loop never commits, merges,
pushes, or reverts: those stay with you and the user.

Read this file for the one case the result cannot carry: **a workflow error in place of a
result**, say a token budget running out, which makes the next `agent()` call throw. The builder
may already have staged work, so read `git diff --cached <baseRef>`. To carry on, relaunch in a
new turn of the same session with the `scriptPath` and run ID its launch returned, passing the run
ID as `resumeFromRunId` and the same args. Finished rounds replay from cache. Never restart with a
fresh `baseRef`: the new reviewer would miss the earlier work.

Staged work lost to a stash, checkout or restore can be recovered from a recorded review `head`,
which is a tree hash, with `git restore --source=<head> --staged --worktree :/`, until git prunes
that tree.
