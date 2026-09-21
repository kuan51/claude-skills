# Build loop outcomes

Read this when `fabflows:build` ends in anything other than `accepted`, or in a workflow error.
The builder's commits are already on the branch in every case. The loop never merges, pushes,
or reverts: those stay with you and the user.

Every escalation already carries a one-line `next` beside its `reason`, so act on that first.
This file is the longer version of the same branches, for when you want the detail. If you
cannot open this file, which happens when the plugin is loaded from a path outside the working
directory, `next` is sufficient on its own.

- **`escalate`**: read `reason` and `verdict` (the last review, or null if none ran), and take
  the work over. `rework-cap` means two rework rounds did not satisfy the reviewer;
  `accept-with-must-fix` and `rework-without-must-fix` mean the reviewer contradicted itself
  and the loop stopped rather than guess.
- **`blocked`**: the builder's reason is in the last round's `build.blocker`, or at the start of
  its `report` when the blocker is empty. A permission denial is the user's to resolve; never
  bypass it and never re-issue the denied call yourself.
- **`unexplained`**: the reason is missing, an empty report or blocked with no blocker. Read the
  `report` if there is one, since the reason may be further down, then run
  `git status --porcelain` and `git log <baseRef>..HEAD` to see what the builder left, and take
  the work over.
- **`reviewer-blocked`**: the review never ran. Fix what `verdict.blocker` names (a missing
  dependency is the user's to install), then run `fabflows:refuter` yourself on
  `<baseRef>..HEAD` rather than restarting the loop.
- **A workflow error instead of a result** (say a token budget ran out, which makes the next
  `agent()` call throw): the builder may already have committed. Read `git log <baseRef>..HEAD`.
  To carry on, relaunch in a new turn of the same session with the `scriptPath` and run ID its
  launch returned, passing the run ID as `resumeFromRunId` and the same args; finished rounds
  replay from cache. Never restart with a fresh `baseRef`: the new reviewer would miss the
  earlier commits.
