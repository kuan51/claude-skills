---
name: soc2
description: Use when scoping a SOC 2 engagement (Type I vs Type II, which Trust Services Categories, observation period, subservice organizations), registering the Trust Services Criteria into ciso tracking, running the criterion-by-criterion assessment interview, or researching vendor solutions for SOC 2 gaps.
allowed-tools: Read, Write, Bash, AskUserQuestion, EnterPlanMode, ExitPlanMode, Workflow
---

# SOC 2

## Overview

Single entry point for all SOC 2 work inside a project's `docs/ciso/` tracking data: record the engagement's scope, register the AICPA Trust Services Criteria, run the criterion-by-criterion assessment interview, and research budget-appropriate vendor solutions for whatever is a gap (in the background, without blocking the interview).

Each flow's step-by-step mechanics live in a reference file under `references/`, loaded only when you run that flow. This page is the always-loaded routing hub plus the invariants that hold no matter which flow you're in -- read the matching reference once Routing picks a flow.

**SOC 2 is a report, not a certification, and this must always be communicated to the user.** A licensed CPA firm issues an attestation report; nothing this plugin produces is that report, or a substitute for a readiness assessment by one. Say so plainly the first time SOC 2 comes up in a session.

**Content authority -- always tell the user this:** the shipped control set is `sourceAuthority: "public-topic-level"` and explicitly non-authoritative.

- **Strong: the criterion identifiers.** All 61 entries carry one in `relatedControlCode` with a `codeVerifiedBy` citation. They were read directly out of the AICPA criteria document, not researched: CC1.1-CC1.5, CC2.1-CC2.3, CC3.1-CC3.4, CC4.1-CC4.2, CC5.1-CC5.3, CC6.1-CC6.8, CC7.1-CC7.5, CC8.1, CC9.1-CC9.2 (**33** common criteria), plus A1.1-A1.3, C1.1-C1.2, PI1.1-PI1.5, plus **18 privacy criteria** (P1.1, P2.1, P3.1-P3.2, P4.1-P4.3, P5.1-P5.2, **P6.1-P6.7**, P7.1, P8.1).
- **Weak: every `topicSummary`.** A paraphrase of what the criterion covers and what satisfying it looks like -- never AICPA's criterion text or its points of focus, which are copyrighted and deliberately absent from this repo, exactly as HITRUST's MyCSF wording is. Treat a summary as a prompt for the right conversation, never as the criterion.
- The AICPA document is free but **login-gated**, so a user cannot verify a `codeVerifiedBy` citation just by clicking it. Say so rather than implying one-click verifiability.

Point users at the AICPA Trust Services Criteria and their CPA firm for exact wording and scope before they rely on any of this for a real audit. Read the structure file's own `coverageNote` before making claims about coverage.

## Core discipline (holds in every flow)

- **Never hand-edit `state.json` to record or change an assessment.** Every status write goes through `apply-assessment.js` -- the mechanical gate that enforces the two rules below.
- **"Met" always needs a real justification; "in progress" needs both a current-state and an estimated-closeness.** A one-word or evasive answer isn't enough -- ask again rather than record a placeholder.
- **For a Type II, "met" means designed AND operating effectively across the whole observation period** -- not "we have this configured today." If a control was introduced mid-period, that is `in_progress`, and the current-state note should say when it started. This is the single most common way a self-assessment overstates readiness.
- **Never silently skip a criterion.** Every one gets asked, even if the answer is "defer."
- **An org's posture stays local.** Justifications and in-progress notes never enter vendor research -- only a control's public subject does.

## Routing

Always start here, every invocation:

1. Determine the project's `docs/ciso/` path -- check the current working directory's `docs/ciso/state.json` first; if that's not obviously the right project, ask the user.
2. Read `<docs/ciso>/state.json`. **If it doesn't exist, tell the user to run `ciso:init` first and stop** -- do not scaffold it yourself.
3. Inspect `certifications.soc2.tiers.type2`, pick the flow whose situation matches, and **open its reference file and follow it**:

| Situation | Flow | Read & follow |
|---|---|---|
| `type2` missing entirely | **Register** | `references/register.md` |
| Present, `scope` missing or incomplete | **Scope** — do this before the interview; which categories are in scope decides which criteria even get asked | `references/scope.md` |
| Present and scoped, interview session not complete | **Interview** — resume the existing `interviewSessions` entry for `soc2`/`type2` | `references/interview.md` |
| Any completed domain has a `gap`/`in_progress` criterion with `roadmap.status` still `not_started`/`researching` | **Roadmap** — background vendor research; never blocks the interview | `references/roadmap.md` |

Reference paths are relative to this skill dir (`${CLAUDE_PLUGIN_ROOT}/skills/soc2/references/<flow>.md`). Read only the one for the flow you're running.

## Why there is only one tier

`type2` is the only tier this module ships. Type I and Type II assess the *same* Trust Services Criteria -- they differ in whether the auditor tests design at a point in time or operating effectiveness over a period. That is a property of the engagement, so it lives in `scope.reportType`, not in a separate control set. An org doing a Type I registers `type2` and sets `reportType: "type1"`; nothing else changes.
