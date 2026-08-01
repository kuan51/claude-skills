---
name: evidence
description: Use when attaching a merged pull request, commit, CI/CD run, scan result, or document to a tracked security control as durable proof that it is implemented -- typically right after a PR merges or a pipeline finishes. Records the artifact against the control; it does not change the control's assessed status.
allowed-tools: Read, Bash, AskUserQuestion
---

# Attach evidence to a control

## Overview

The write path from a development workflow into the compliance dashboard. A merged PR, a green CI
run, a clean scan, a signed policy document -- this records it against the control it supports, so
the dashboard shows what is actually behind a claim instead of prose alone.

Before this existed, a control marked `met` stored only a free-text justification. Nothing produced
by a development process could reach the dashboard except by a human retyping it during an
interview.

## Evidence does not change status

**Attaching evidence never writes to `assessment`** -- not `status`, and above all not `assessedAt`.
`record-evidence.js` enforces this mechanically and a test pins it. The two are independent axes:

- **Assessment** is the org's claim: is this control met, and why.
- **Evidence** is what backs the claim up.

Keeping them apart is what lets `ciso:audit` report the interesting case -- a control marked `met`
with nothing behind it. It also protects a subtler thing: `assessedAt: null` is how the interview
knows a control has never been looked at, and `markCategoryComplete` refuses to complete a domain
while any control still has it. If attaching evidence stamped that field, an untouched domain would
silently become completable.

So if the user wants a control's *status* changed, that is `ciso:interview`. Say so rather than
implying the attachment did it.

## Routing

1. **Locate the tracking data.** Check the current working directory's `docs/ciso/state.json`
   first; if that's not obviously the right project, ask the user.
2. **Read `<docs/ciso>/state.json`. If it doesn't exist, tell the user to run `ciso:init` first and
   stop.**
3. **Resolve the certification** from `state.certifications`: the one the user named, else the sole
   registered certification, else `AskUserQuestion`. One artifact often supports controls across
   several certifications -- a logging PR is plausibly HITRUST, SOC 2 CC7.2 and ISO A.8.15 at once.
   Offer to attach it to each rather than making the user run this three times.
4. **Read `${CLAUDE_PLUGIN_ROOT}/skills/<certKey>/references/invariants.md` and follow it.**
   Mandatory. No step 5 -- this verb has no per-certification reference file. The invariants still
   bind, and for SOC 2 one of them is directly load-bearing here: for a Type II, an artifact dated
   after `scope.observationPeriodStart` supports the control from that date forward, not across the
   period.

## Gathering the record

Each record needs three things. Ask for whatever the user did not supply.

| Field | What it is |
|---|---|
| `kind` | One of `pr`, `commit`, `ci-run`, `scan`, `doc`, `manual` |
| `ref` | A URL, file path, or commit SHA -- the thing someone can go look at |
| `summary` | One line: what this artifact *demonstrates* about the control |

`recordedAt` is stamped for you.

Two things worth insisting on:

- **The summary must say what the artifact proves, not what it is.** "Adds structured audit logging
  to every API handler" is evidence. "PR 412" is a restatement of the ref. At audit time the summary
  is what someone reads first.
- **A `ref` should be resolvable by someone who is not you.** A PR URL beats `#412`; a full SHA
  beats `abc123`; an absolute-ish repo path beats `that config file`.

Prefer `manual` over a wrong `kind` -- it is the honest escape hatch for something asserted without
an artifact.

## Recording it

One call per control:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/_shared/record-evidence.js" <docs/ciso> <certKey> <tierKey> <controlId> '<jsonRecord>'
```

The script appends rather than replacing, so a control accumulates evidence across many PRs, and it
validates fail-closed: an unknown `kind` or field, or a blank `ref` or `summary`, is rejected and
nothing is written. **Never hand-edit `state.json` to add evidence.**

Then re-render:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/_shared/render-dashboard.js" <docs/ciso>
```

## After attaching

Tell the user which controls now carry evidence and which of those are still not marked `met` --
that gap between "we have proof" and "we have claimed it" is usually the next thing worth closing,
via `ciso:interview`.
