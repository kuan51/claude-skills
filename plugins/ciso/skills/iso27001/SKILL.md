---
name: iso27001
description: Use when registering ISO/IEC 27001:2022 into ciso tracking, running the clause-by-clause and Annex A assessment interview, producing a draft Statement of Applicability, or researching vendor solutions for ISO 27001 gaps.
allowed-tools: Read, Write, Bash, AskUserQuestion, EnterPlanMode, ExitPlanMode, Workflow
---

# ISO/IEC 27001:2022

## Overview

Single entry point for all ISO 27001 work inside a project's `docs/ciso/` tracking data: register the control set, run the requirement-by-requirement assessment interview across both halves of the standard, produce a draft Statement of Applicability from what the interview recorded, and research budget-appropriate vendor solutions for gaps (in the background, without blocking the interview).

Each flow's step-by-step mechanics live in a reference file under `references/`, loaded only when you run that flow. This page is the always-loaded routing hub plus the invariants that hold no matter which flow you're in -- read the matching reference once Routing picks a flow.

**Nothing this plugin produces is a certificate.** ISO 27001 certification is issued by an accredited certification body after a Stage 1 documentation review and a Stage 2 implementation audit, and maintained through annual surveillance audits and a three-year recertification. This gets you ready for that; say so plainly the first time ISO 27001 comes up in a session.

## Content authority -- always tell the user this

The shipped control set is `sourceAuthority: "public-topic-level"` and explicitly non-authoritative. **Its provenance is weaker than SOC 2's, and the difference is not cosmetic:**

- **ISO/IEC 27001:2022 is sold, not published.** Its identifiers were **reconstructed from convergent public sources, never read from the standard.** Every entry carries `codeCorroboratedBy` -- deliberately *not* the `codeVerifiedBy` that SOC 2 uses, which means "read out of the publisher's own document." Do not describe these identifiers with the word "verified."
- **Annex A (93 entries) is the stronger half.** Four themes of 37/8/14/34 terminating at A.5.37, A.6.8, A.7.14 and A.8.34, summing to 93. Each theme's published count equals its own terminal number, so the set is arithmetically closed and a wrong source is detectable rather than merely outvoted. Two independent full lists agree on all 93 assignments, and the closure itself was checked against the publisher: a maintainer read the official ISO/IEC 27002:2022 preview named in the structure file and confirmed its four terminal numbers (5.37, 6.8, 7.14, 8.34). **Be exact about what that covers if asked:** the enumeration, not the subjects. Which control each number *is* still rests on the two secondary lists, the `A.` prefix is 27001's labelling of 27002's numbering and rests on secondary sources too, and ISO/IEC 27001:2022 itself was never obtained — which is why entries carry `codeCorroboratedBy` rather than `codeVerifiedBy`.
- **Clauses 4-10 (30 entries) are weaker still.** No primary source was reachable and there is no count to check against, so no closure argument applies -- these claim only the clause/subclause number. The 30 is a **leaf-heading cut** (6.1, 7.5, 9.2 and 9.3 are parents, omitted in favour of their children); counting every numbered heading would give 34, second level only 23. If a user's certification body works from a different cut, that is a difference of convention, not an error in either.
- **Every `topicLabel` and `topicSummary` is our own paraphrase.** ISO's control titles and clause headings are its copyrighted expression and appear nowhere in this repo -- exactly as HITRUST's MyCSF wording and AICPA's criterion text are absent. Treat a summary as a prompt for the right conversation, never as the requirement.

Point users at a purchased copy of the standard and at their certification body before they rely on any of this for a real audit. Read the structure file's own `coverageNote` before making claims about coverage.

## Core discipline (holds in every flow)

- **Never hand-edit `state.json` to record or change an assessment.** Every status write goes through `apply-assessment.js` -- the mechanical gate enforcing the two rules below.
- **"Met" always needs a real justification; "in progress" needs both a current-state and an estimated-closeness.** A one-word or evasive answer isn't enough -- ask again rather than record a placeholder.
- **Both halves are mandatory. There is no scoping fork.** Every clause applies to every ISMS, and every Annex A control must be *considered* -- that consideration is the Statement of Applicability. `not_applicable` on an Annex A control is a deliberate, justified exclusion, not a way to skip a question. A clause is never `not_applicable`.
- **Never silently skip a requirement.** Every one gets asked, even if the answer is "defer."
- **An org's posture stays local.** Justifications and in-progress notes never enter vendor research -- only a control's public subject does.

## Routing

Always start here, every invocation:

1. Determine the project's `docs/ciso/` path -- check the current working directory's `docs/ciso/state.json` first; if that's not obviously the right project, ask the user.
2. Read `<docs/ciso>/state.json`. **If it doesn't exist, tell the user to run `ciso:init` first and stop** -- do not scaffold it yourself.
3. Inspect `certifications.iso27001.tiers.isms`, pick the flow whose situation matches, and **open its reference file and follow it**:

| Situation | Flow | Read & follow |
|---|---|---|
| `isms` missing entirely | **Register** | `references/register.md` |
| Present, interview session not complete | **Interview** — resume the existing `interviewSessions` entry for `iso27001`/`isms` | `references/interview.md` |
| Any completed domain has a `gap`/`in_progress` entry with `roadmap.status` still `not_started`/`researching` | **Roadmap** — background vendor research; never blocks the interview | `references/roadmap.md` |
| User asks for the Statement of Applicability, or is preparing for Stage 1 | **SoA** — a reading of data already recorded, not a separate assessment | `references/soa.md` |

Reference paths are relative to this skill dir (`${CLAUDE_PLUGIN_ROOT}/skills/iso27001/references/<flow>.md`). Read only the one for the flow you're running.

## Why there is only one tier, and no scope flow

`isms` is the only tier. HITRUST's tiers are nested rigor (e1 ⊂ i1 ⊂ r2) and SOC 2's report type is an engagement property; ISO's clauses and Annex A are neither. They are orthogonal halves of a single certification an organization needs **both** of -- modelling them as two tiers would make the dashboard's per-tier gauges read as a choice that doesn't exist. They are separated by `domainKey` instead: `CL4`-`CL10` for the management-system clauses, `A5`-`A8` for the Annex A themes.

There is also no Scope flow, deliberately. SOC 2 needs one because selecting Trust Services Categories decides which criteria get asked at all. ISO has no equivalent fork: the ISMS scope statement is itself assessed, as clause 4.3, and goes through the normal gate like any other requirement.
