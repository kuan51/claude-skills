---
owner: kuan51
review_by: 2027-03-03
generated: false
---

# ciso certification #4: CMMC — design

**Date:** 2026-07-31
**Status:** implemented

## Why this, and why not the recorded pick

`ADDING-A-CERTIFICATION.md` named **PCI DSS v4.0.1** the strongest candidate for #4, passed over for
ISO 27001 only on audience breadth. ISO shipped, so that blocker was discharged and PCI was the
default choice. Two alternatives were re-tested and rejected on the doc's own criteria before work
began:

- **HIPAA Security Rule** — fails the exact test that excluded NIST CSF 2.0 (not certifiable: no
  assessor, no report, no pass/fail), and HITRUST already ships as the certifiable wrapper around it.
- **NIST CSF 2.0** — already ruled out; its value is as a cross-framework spine, a different feature.

**PCI DSS was then abandoned mid-build, on licence.** Its enumeration compiled well — 250 Defined
Approach Requirements, corroborated 250/250 against PCI SSC's own publicly-hosted Spanish edition of
v4.0. But PCI SSC's Terms and Conditions permit download for personal, non-commercial review and
separately prohibit distributing or preparing derivative works of their content. A paraphrased
`topicSummary` in a public GPL-3.0 plugin is plausibly both.

That is a **different constraint** from the one SOC 2 and ISO 27001 clear. Theirs is copyright, which
a paraphrase avoids by copying no protected expression — precisely what the repo's 8-consecutive-word
check enforces. PCI's is contract, and it reaches *use* rather than expression, so the 8-word check
does not answer it. The general lesson, now recorded in `ADDING-A-CERTIFICATION.md` as step zero:
**reachability of a catalog says nothing about permission to build on it — check the publisher's
terms of use separately from its copyright posture, before compiling.**

CMMC replaced it, and turned out to be the strongest sourcing position in the plugin.

## What CMMC is, per the regulation

Read from 32 CFR Part 170 via the eCFR API rather than from secondary summaries:

| Tier | Requirements | Source | Protects | Validated by |
|---|---|---|---|---|
| `level1` | 15 | 48 CFR 52.204-21(b)(1)(i)–(xv) | FCI | Annual self-assessment + SPRS affirmation |
| `level2` | 110 | NIST SP 800-171 **R2** | CUI | C3PAO certification, or self-assessment for some programs |
| `level3` | 24 | Selected from NIST SP 800-172 (Feb 2021) | CUI, higher risk | DCMA DIBCAC |

Tiers are **independent control sets**, mirroring HITRUST's e1/i1/r2 (which share no ids either).
Level 3 is not self-contained — it presupposes Level 2 — so `register.md` instructs registering both,
and `invariants.md` names a `level3`-only registration as the most misleading state the module can
reach.

## The two findings that would otherwise have shipped wrong output

**1. CMMC binds a withdrawn NIST revision.** 32 CFR 170.2 incorporates SP 800-171 **R2** and SP
800-172 (Feb 2021) by reference. NIST withdrew R2 on 2024-05-14 and 800-172 on 2026-05-13, both
superseded by Revision 3. Compiling from "the current NIST publication" would have produced a clean,
well-cited, entirely wrong control set — Revision 3 reorganized the requirements and the ids do not
correspond one-to-one. **When a regulation incorporates a standard by reference, the regulation's
cited edition wins.** This is stated in `invariants.md`, both `coverageNote`s, and is asserted by a
test.

**2. Extraction traps, each caught only by cross-checking.** The enumeration was verified against the
800-171 document's own Appendix D mapping tables — an independently typeset listing of the same ids —
which matched exactly, 110/110. Three specific failures are recorded because each nearly shipped:

- The running footer merges into some requirement lines, which silently swallowed **3.1.5**.
- A 1..n sequentiality check **cannot detect a missing last child**, so it did not notice.
- `pdftotext -layout` collapses the multi-column requirement pages, scrambling 3.1.6–3.1.8; xpdf's
  `-simple` mode is what pairs ids with statements correctly.

**Agreeing identifiers prove nothing about the prose beside them**, so the requirement *text* was
validated separately: the whole set was re-extracted under `-simple2`, an independent typesetting of
the same pages, and all 110 summaries matched byte for byte. Without that, a requirement truncated at
a page break would still have passed the "ends in a period" check whenever its first portion happened
to end a sentence.

## Sourcing position: a new column

NIST states in each publication that the work *"is not subject to copyright in the United States"*,
and eCFR regulations are US Government works. CMMC is therefore the first `ciso` module to ship
**verbatim requirement text** — `sourceAuthority: "publisher-verbatim"`, a value no other module
uses. `ADDING-A-CERTIFICATION.md`'s sourcing table gained a far-left column for it.

This inverts the usual authority split and the inversion has to be stated, because a user of the
other modules will assume the opposite: here the **`topicSummary` is authoritative** and the
**`topicLabel` is our derived shorthand** (R2 gives no per-requirement titles; R3 does).

## What shipped

`skills/cmmc/` — three structure files (`level{1,2,3}.v32cfr170.structure.json`), `invariants.md`,
and references for `register`, `interview` and `roadmap`. **No `lib/` code at all** and no `SKILL.md`
(a certification module is not a skill). Plus a catalog entry, `test/cmmc-structure.test.js`, and the
version bump to 1.1.0 in both manifests.

CMMC is the minimal example of the contract: the core needed **zero** changes, and no verb surface
changed — `ciso:scope` remains SOC-2-only, because for CMMC the contract's level *is* the scope
decision and it is made at register time.

## One thing the first pass got wrong

The initial structure files carried four per-control fields that were byte-identical on every
control: `citations`, `cmmcLevel`, `requirementTextIsVerbatim`, and a per-control copy of the
file-level citation list. That is the same defect a prior review stripped out of ISO 27001 — and
worse than the line count, `ADDING-A-CERTIFICATION.md` point 6 renders unknown per-control fields in
the dashboard's "Additional detail" block, so two of them printed as constant noise on all 134
control cards. Anything genuinely constant belongs at file level: `sourceAuthority` already carries
"these are verbatim" and `tier` already carries which level this is. level2 went 1,995 → 1,335 lines,
and a test now asserts none of them return.

Fixing it surfaced a real template bug: `RENDERED_CONTROL_FIELDS` listed `codeCorroboratedBy` but not
its sibling `codeVerifiedBy`, so every SOC 2 and CMMC control was printing its verification URL as
"Additional detail" too. Both are now listed.

## Verification

296 tests pass across all four locations. End-to-end in a scratch project: init → register `level2`
and `level3` → assessment gate (rejects `met` without justification) → all four statuses →
`record-evidence` → `render-dashboard`. The rendered page carries `"total":110` with
`"applicableTotal":109`, confirming `not_applicable` leaves the compliance denominator while staying
in the total, and `134`/`133` across the certification. After the cleanup, `requirementTextIsVerbatim`
and `cmmcLevel` appear 0 times in the rendered page (from 134 each) while the verbatim requirement
text, domain rollups and evidence links all still render.
