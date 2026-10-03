# Build loop outcomes

Every escalation carries `reason` and a one-line `next` in the result itself, and that `next` is
the whole instruction for its outcome: act on that. The builder's work is uncommitted in every
case, staged or not: `git status --porcelain` and `git diff <baseRef>` show it, and
`git diff --cached <baseRef>` shows the staged part. The loop never commits, merges, pushes, or
reverts: those stay with you and the user. When a review's blocker says the builder committed,
ask the user what to do with that unreviewed commit rather than reviewing it.

Read this file for the one case the result cannot carry: **a workflow error in place of a
result**, say a token budget running out, which makes the next `agent()` call throw. The builder
may already have left work, so read `git status --porcelain` and `git diff <baseRef>`. To carry
on, relaunch in a new turn of the same session with the `scriptPath` and run ID its launch
returned, passing the run ID as `resumeFromRunId` and the same args. Finished rounds replay from
cache. Never restart with a fresh `baseRef`: the tree is not clean, which the launch requires,
and the earlier rounds' heads and must-fix items are lost.

Staged work lost to a stash, checkout or restore can be recovered from the newest recorded review
`head`, which is a tree hash, with `git restore --source=<head> --staged --worktree :/`, until git
prunes that tree. Check `git status --porcelain` first: the restore discards anything newer than
that head.
