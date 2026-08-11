# CMMC — invariants

**Every `ciso:` verb reads this file after resolving `certKey: cmmc`, before doing anything else.**
These hold no matter which verb is running. A verb's own reference file not being loaded is never an
excuse to skip one of them.

## The three tiers, and what each one actually is

| Tier | Requirements | Source | Protects | How it is validated |
|---|---|---|---|---|
| `level1` | 15 | 48 CFR 52.204-21(b)(1)(i)–(xv) | FCI | Annual **self**-assessment + affirmation in SPRS. No certificate, no assessor. |
| `level2` | 110 | NIST SP 800-171 **R2** | CUI | C3PAO certification assessment, or self-assessment for some programs — **the contract decides which** |
| `level3` | 24 | Selected from NIST SP 800-172 (Feb 2021) | CUI, higher risk | DCMA **DIBCAC**, not a C3PAO |

The tiers are **independent control sets**, exactly as HITRUST's e1/i1/r2 are — no id appears in two
of them. That has one consequence you must state rather than let a user discover:

**Level 3 is not self-contained.** 32 CFR 170.14(c)(4) builds Level 3 on top of Level 2, so an
organization pursuing Level 3 must also meet all 110 Level 2 requirements and hold a Level 2
certification. **Register `level2` alongside `level3`.** If only `level3` is registered, the
dashboard will report a compliance percentage over 24 requirements while silently ignoring the 110
underneath — the single most misleading state this module can get into.

**CMMC is a certification, and the level is set by the contract, not by this tool.** Say plainly the
first time CMMC comes up in a session: nothing this plugin produces is a CMMC assessment, an SPRS
score, or a substitute for a C3PAO. Which level applies, and whether self-assessment is permitted, is
a contracting question — send the user to their contracting officer.

## The version trap — say this every time

**32 CFR Part 170 binds NIST SP 800-171 Revision 2 and NIST SP 800-172 (February 2021). NIST has
withdrawn both.**

- SP 800-171 R2 — withdrawn **14 May 2024**, superseded by Revision 3.
- SP 800-172 (Feb 2021) — withdrawn **13 May 2026**, superseded by Revision 3.

32 CFR 170.2 still incorporates the withdrawn editions by reference, and the rule was not updated. So
a user who downloads "the current NIST 800-171" gets Revision 3 and **assesses against the wrong
control set for CMMC purposes.** Revision 3 reorganized the requirements; the ids do not correspond
one-to-one.

This module deliberately tracks the withdrawn editions because that is what the regulation requires.
Tell the user this before they go read a NIST publication, not after.

## Content authority — always tell the user this

This module's `sourceAuthority` is `publisher-verbatim`, which no other certification in `ciso` uses.

- **Strong: every `topicSummary` is the real requirement text**, not a paraphrase. NIST states in both
  publications that the work *"is not subject to copyright in the United States"*, and federal
  regulations in the eCFR are US Government works. That is why this module can ship authoritative
  wording where HITRUST, SOC 2 and ISO 27001 deliberately cannot. NIST asks for attribution and every
  entry carries it in `citations`.
- **Strong: the identifiers.** Level 1's are the regulation's own paragraph designations. Level 2's
  110 ids across 14 families were extracted from the NIST PDF and cross-checked against that
  document's own Appendix D mapping tables — an independently typeset listing of the same ids — which
  matched exactly, 110 of 110. Level 3's *selection* of 24 was read out of 32 CFR Part 170 itself.
- **Weak: every `topicLabel`.** Revision 2 gives no per-requirement titles (Revision 3 does), so the
  labels are **derived** — a short phrase cut from the requirement's own opening clause. They are
  readable and carry no authority. Never quote a label as if it were the requirement; the
  `topicSummary` beside it is the requirement.
- **Absent: organization-defined parameters (ODPs).** 32 CFR 170 specifies ODP values for several
  Level 3 requirements. They are **not** reproduced here. Read table 1 to § 170.14(c)(4) for them
  before assessing Level 3.
- **Absent: the assessment objectives.** NIST SP 800-171A defines the determination statements an
  assessor actually tests, and 32 CFR 170 incorporates it. Meeting the requirement text is not the
  same as satisfying every objective under it. Point users at 800-171A before they call a
  requirement met.

Read the structure file's own `coverageNote` before making claims about coverage.

## Core discipline

- **Never hand-edit `state.json` to record or change an assessment.** Every status write goes through
  `apply-assessment.js` — the mechanical gate that enforces the two rules below.
- **"Met" always needs a real justification; "in progress" needs both a current-state and an
  estimated-closeness.** A one-word or evasive answer isn't enough — ask again rather than record a
  placeholder.
- **CMMC scoring is not a percentage, and must never be presented as one.** A Level 2 self-assessment
  is scored out of 110 under the DoD Assessment Methodology, where an unmet requirement subtracts 1,
  3 or 5 points and the score can go negative. The dashboard's compliance percentage is a *progress*
  indicator for this plugin's own tracking. It is **not** an SPRS score. Say so whenever a user reads
  a number off the dashboard.
- **"Met" means implemented, not planned.** A requirement covered only by a POA&M is `in_progress`,
  never `met` — and note that CMMC limits which requirements are POA&M-eligible at all, and sets a
  180-day closeout. A plan is not an implementation.
- **Never silently skip a requirement.** Every one gets asked, even if the answer is "defer."
- **An org's posture stays local.** Justifications and in-progress notes never enter vendor
  research — only a requirement's public subject does.
