---
name: review
description: Use when reviewing a pull request, branch, or diff for security-compliance impact before it merges -- which tracked controls the change supports, which it might regress, and which open gaps it leaves untouched. Reads code and tracking data; writes nothing. Use ciso:evidence afterwards to record what the change actually proves.
allowed-tools: Read, Bash, Grep, Glob, AskUserQuestion
---

# Review a change for compliance impact

## Overview

The bridge between a development workflow and the compliance dashboard. Takes a diff -- a branch, a
PR, a range of commits -- and reads it against the controls this project actually tracks, reporting
where the change moves the org's posture.

**This verb is read-only.** It never writes to `state.json`. Nothing a review concludes becomes a
recorded fact until the user runs `ciso:evidence` or re-answers in `ciso:interview`. That separation
is deliberate: a review is an opinion about a diff, and an assessment is a claim the org will stand
behind at audit.

## Routing

1. **Locate the tracking data.** Check the current working directory's `docs/ciso/state.json`
   first; if that's not obviously the right project, ask the user.
2. **Read `<docs/ciso>/state.json`. If it doesn't exist, tell the user to run `ciso:init` first and
   stop.**
3. **Resolve the certification** from `state.certifications`: the one the user named, else the sole
   registered certification. If several are registered, ask -- or, if the user wants breadth, review
   against all of them and group the findings by certification.
4. **Read `${CLAUDE_PLUGIN_ROOT}/skills/<certKey>/references/invariants.md` and follow it.**
   Mandatory. There is no step 5 -- this verb has no per-certification reference file and needs
   none, because it reads the org's assessment data rather than certification mechanics. But the
   invariants still bind: SOC 2's Type II rule in particular decides whether a mid-period change can
   support a `met` claim at all.

## Getting the diff

Take whatever the user gave you. In rough order of preference:

- An explicit range or ref they named.
- A PR number or URL → `gh pr diff <n>`, and `gh pr view <n>` for title and body.
- Otherwise the current branch against its merge base:
  `git merge-base HEAD <default-branch>` then `git diff <base>...HEAD`.
- Failing all that, uncommitted work: `git diff HEAD`.

Read `--stat` first to see the shape, then the diff itself. For a large diff, read the files that
matter rather than every hunk -- and **say which parts you did not read.** A review that silently
skipped half the change reads as coverage it does not have.

## Mapping changes to controls

**Be honest about what this is: judgment, not lookup.** There is no path-to-control manifest in this
plugin and deliberately none planned -- `state.json` is gitignored, and a committed mapping file
would be a second source of truth to drift. You are reasoning from what the diff does to what the
controls say, using each control's `topicLabel`, `topicSummary`, `domain` and current
`assessment.status`.

So: propose, never assert. Present candidates for the user to confirm, and tell them plainly that
the mapping is your reading of the change rather than a lookup.

Two things sharpen it materially:

- **Prior evidence is an accumulating map.** Controls already carrying `evidence` records show which
  refs the org has previously counted for what. A change touching the same area as an earlier PR is
  a strong candidate for the same control.
- **Weight open gaps.** A control already `met` is less interesting than a `gap` this change might
  close, or a `met` this change might undermine.

## What to report

Group into three, and let any group be empty rather than padding it:

1. **Supports** -- controls this change is evidence *for*. For each: the control id and label, what
   in the diff supports it, and its current status. If a `gap` or `in_progress` control now looks
   satisfied, say so, and note that closing it means re-answering in `ciso:interview`, not just
   attaching evidence.
2. **May regress** -- controls this change could weaken. Removed validation, loosened permissions, a
   disabled check, a dependency with a known issue, a widened network path, a secret moved somewhere
   less protected. **Lead with this group when it is non-empty.** A compliance review whose value is
   only "here is more evidence" is missing half its job.
3. **Untouched gaps in the same area** -- open gaps in the domains this change touches. Cheap to
   mention while the author already has that code loaded.

Then, for a SOC 2 Type II, check the observation period: an artifact dated after
`scope.observationPeriodStart` supports the control from that date forward, not across the period.
Say it rather than letting the attachment imply more than it shows. You have the diff in hand, so
you know the real merge or commit date -- carry it into `ciso:evidence` as `occurredAt`, which is
what lets a later audit judge the period correctly instead of reading the attach time.

## After the review

Offer `ciso:evidence` for anything in **Supports** the user confirms, with the PR or commit ref
already to hand. If **May regress** is non-empty, offer `ciso:interview` for those controls --
regression is a change of status, which only the assessment gate may record.
