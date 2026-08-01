# SOC 2 — invariants

**Every `ciso:` verb reads this file after resolving `certKey: soc2`, before doing anything else.**
These hold no matter which verb is running. A verb's own reference file not being loaded is never an
excuse to skip one of them.

`type2` is the only tier this module ships. Type I and Type II assess the *same* Trust Services
Criteria -- they differ in whether the auditor tests design at a point in time or operating
effectiveness over a period. That is a property of the engagement, so it lives in `scope.reportType`,
not in a separate control set. An org doing a Type I registers `type2` and sets
`reportType: "type1"`; nothing else changes.

**SOC 2 is a report, not a certification, and this must always be communicated to the user.** A
licensed CPA firm issues an attestation report; nothing this plugin produces is that report, or a
substitute for a readiness assessment by one. Say so plainly the first time SOC 2 comes up in a
session.

## Content authority — always tell the user this

The shipped control set is `sourceAuthority: "public-topic-level"` and explicitly non-authoritative.

- **Strong: the criterion identifiers.** All 61 entries carry one in `relatedControlCode` with a
  `codeVerifiedBy` citation. They were read directly out of the AICPA criteria document, not
  researched: CC1.1-CC1.5, CC2.1-CC2.3, CC3.1-CC3.4, CC4.1-CC4.2, CC5.1-CC5.3, CC6.1-CC6.8,
  CC7.1-CC7.5, CC8.1, CC9.1-CC9.2 (**33** common criteria), plus A1.1-A1.3, C1.1-C1.2, PI1.1-PI1.5,
  plus **18 privacy criteria** (P1.1, P2.1, P3.1-P3.2, P4.1-P4.3, P5.1-P5.2, **P6.1-P6.7**, P7.1,
  P8.1).
- **Weak: every `topicSummary`.** A paraphrase of what the criterion covers and what satisfying it
  looks like -- never AICPA's criterion text or its points of focus, which are copyrighted and
  deliberately absent from this repo, exactly as HITRUST's MyCSF wording is. Treat a summary as a
  prompt for the right conversation, never as the criterion.
- The AICPA document is free but **login-gated**, so a user cannot verify a `codeVerifiedBy`
  citation just by clicking it. Say so rather than implying one-click verifiability.

Point users at the AICPA Trust Services Criteria and their CPA firm for exact wording and scope
before they rely on any of this for a real audit. Read the structure file's own `coverageNote`
before making claims about coverage.

## Core discipline

- **Never hand-edit `state.json` to record or change an assessment.** Every status write goes
  through `apply-assessment.js` -- the mechanical gate that enforces the two rules below.
- **"Met" always needs a real justification; "in progress" needs both a current-state and an
  estimated-closeness.** A one-word or evasive answer isn't enough -- ask again rather than record a
  placeholder.
- **For a Type II, "met" means designed AND operating effectively across the whole observation
  period** -- not "we have this configured today." If a control was introduced mid-period, that is
  `in_progress`, and the current-state note should say when it started. This is the single most
  common way a self-assessment overstates readiness.
- **Never silently skip a criterion.** Every one gets asked, even if the answer is "defer."
- **An org's posture stays local.** Justifications and in-progress notes never enter vendor research
  -- only a control's public subject does.

## What the Type II rule means for evidence

`ciso:evidence` attaches development artifacts -- PRs, commits, CI runs -- to a criterion. For a
Type II engagement the observation period in `tier.scope` decides whether an artifact supports a
`met` claim at all: **a PR merged partway through the period demonstrates the control from that date
forward, not across the period.** Record it, and say so plainly rather than letting the attachment
imply the criterion was satisfied throughout. A criterion whose only evidence postdates
`scope.observationPeriodStart` is `in_progress`, not `met`.
