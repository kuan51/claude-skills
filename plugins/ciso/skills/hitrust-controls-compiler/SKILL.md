---
name: hitrust-controls-compiler
description: Use when compiling or refreshing the public, non-authoritative topic-level HITRUST e1/i1 control structure files shipped in the ciso plugin -- e.g. after a new HITRUST CSF framework version ships, or to close a coverage gap in an existing compile. r2's full structure is out of scope for this skill until its own dedicated pass (its real scope is 2000+ entries, an order of magnitude beyond e1/i1).
disable-model-invocation: true
allowed-tools: Read, Write, WebSearch, Workflow, Skill
---

# HITRUST Controls Compiler

**Maintainer-only tooling.** This is not part of the `ciso:<certification>` pattern an org uses to
track its own HITRUST work -- it's how whoever maintains this plugin (re)compiles the public,
shared e1/i1 structure files that ship inside it. An organization using `ciso:hitrust` never runs
this.

## Why this exists

No licensed MyCSF export backs either shipped tier: e1's structure must come from public
information only (an org's own licensed export, if the maintainer happens to have one, may be used
purely as a private completeness cross-check -- never fed to any research agent, never cited, never
present in the shipped output), and i1 has never had one. A hallucinated or incomplete control list
would sit on an org's compliance dashboard looking just as authoritative as a real one. This skill's
whole design exists to prevent that: full-coverage research, then a dedupe/reconcile pass, then two
independent adversarial verification passes before anything ships.

## Process

1. **Confirm the current domain roster.** Do not reuse a hardcoded domain list from a prior run
   without checking -- HITRUST revises the framework roughly twice a year and domain names/counts
   can shift. Confirm the current list of HITRUST's modern assessment domains via a web search or
   `Skill({skill: "deep-research", args: "..."})`, the same sourcing approach `data-analysis-review`'s
   SKILL.md already uses elsewhere in this repo. As of HITRUST CSF v11.8, this is 19 domains
   (Information Protection Program, Endpoint Protection, Portable Media Security, Mobile Device
   Security, Wireless Security, Configuration Management, Vulnerability Management, Network
   Protection, Transmission Protection, Password Management, Access Control, Audit Logging and
   Monitoring, Education/Training/Awareness, Third-Party Assurance, Incident Management, Business
   Continuity and Disaster Recovery, Risk Management, Physical and Environmental Security, Data
   Protection and Privacy) -- cross-verify against at least two independent sources before trusting
   it, the same way this list itself was confirmed.

   **Use this same 19-domain roster for e1, too -- do not try to pre-derive a smaller "e1 subset"
   first.** Public sources disagree on e1's exact scope (some cite 43 requirement statements, others
   44; none give a reliable domain-by-domain breakdown), and e1 is publicly documented as a minimal
   baseline spread thinly across all 19 domains rather than a fixed subset of them. Let the Research
   phase discover this empirically: for e1, it's normal and expected for many domains to return zero
   genuine candidates.

2. **Run the `Workflow` tool twice, once per tier -- e1 FIRST, then i1** -- with
   `${CLAUDE_PLUGIN_ROOT}/skills/hitrust-controls-compiler/workflow.js`'s contents as `script`, and:
   - For e1: `args: { tier: "e1", hitrustVersion: "v11.X", domains: [{key, name}, ...] }` (the
     confirmed 19-domain roster from step 1).
   - For i1: `args: { tier: "i1", hitrustVersion: "v11.X", domains: [...], baselineSummary: "<derived
     from e1's own freshly-compiled, publicly-sourced shipped output>" }`. Build `baselineSummary` by
     summarizing the e1 run's own `shipped` output (plain text, a few sentences per domain or a flat
     list of e1 topic labels is enough) -- **never reuse a hardcoded summary from a prior compile**,
     since that's exactly how a previous compile's summary ended up silently derived from a licensed
     export instead of this skill's own public research.

   Each run does four phases -- Research (one `hitrust-topic-researcher` agent per domain, full
   coverage for that tier) → Reconcile (one `hitrust-controls-reconciler` agent dedupes and flags
   coverage gaps, and separately lists domains that returned zero candidates) → Verify-Refute and
   Verify-Confirm (two independent `hitrust-controls-verifier` passes, dual-pass because everything
   here ships publicly with no severity gate) -- and returns
   `{ tier, hitrustVersion, domains, shipped, excluded, droppedDuplicates, coverageGaps, zeroCandidateDomains }`.
   Every candidate may optionally carry a `controlReference` (e.g. `"09.g"`) -- populated only when a
   fetched public citation actually verifies that specific code for that topic, never invented; most
   candidates will legitimately have none.

   r2 stays out of scope: leave `compileR2Illustrative` unset/false on both runs unless a future
   r2-focused pass explicitly needs the illustrative side-collection.

3. **Review before writing anything.** For each tier's run, read `coverageGaps` and `excluded`
   (candidates that failed verification, with a reason each) yourself before assembling the shipped
   files -- the workflow's agents never get final say on what actually ships; a human reviews it
   first, matching this repo's `harden-scan.js` precedent of "the calling session writes, never the
   agents." For i1, treat `zeroCandidateDomains` as a real coverage-gap signal worth a second research
   pass on that domain. For e1, a domain appearing in `zeroCandidateDomains` is normal and does not by
   itself need a second pass -- only investigate it further if the reconciler also flagged it in
   `coverageGaps` (meaning it looked wrong, not just thin). Spot-check citation diversity (if one
   secondary source dominates the shipped list, note that as a caveat in `coverageNote` rather than
   presenting it as broad literature) and, for i1, count how many shipped entries carry a verified
   `controlReference` -- report that fraction honestly in `coverageNote`, it will likely be a
   minority and that's fine.

4. **Assemble the shipped files** (same shape for both tiers):
   - `plugins/ciso/skills/hitrust/controls/<tier>.v<version>.structure.json` -- `{ tier: "e1"|"i1",
     controlSetVersion, sourceAuthority: "public-topic-level", nonAuthoritative: true, compiledAt,
     coverageNote, controls: [...] }`. Each control: `{ id, domain, domainKey, topicLabel,
     topicSummary, citations, nonAuthoritative: true }`, plus `baselineOverlap` for i1 entries, plus
     `relatedControlCode`/`legacyCategoryPrefix` (derived by splitting `relatedControlCode` on `.`)
     **only when the shipped candidate carried a verifier-confirmed `controlReference`** -- never
     invent one to fill the field. Build stable ids as `<tier>-<domainKey>-<NN>` (zero-padded
     per-domain sequence, entries sorted by domainKey then topicLabel) -- this keeps ids consistent
     across recompilations as long as topic labels don't change, the same "heuristic, not
     authoritative" caveat `diff-structure-versions.js` documents for matching by id.
   - `coverageNote` must state the actual shipped count plainly (never padded to match a publicly
     quoted target like "44" or "182" if honest research lands elsewhere) and the actual
     `controlReference` coverage fraction achieved.
   - `plugins/ciso/skills/hitrust/controls/r2.v<version>.structure.json` is **not part of this
     process** until a dedicated r2 pass exists -- do not write or modify it here.

5. **Versioning.** If this run is a genuine reaction to a new HITRUST framework version, never delete
   a prior version's structure files in the same change that introduces new ones -- keep at least the
   immediately-prior version on disk so a project whose `state.json` still references the old
   `controlSetVersion` isn't orphaned mid-upgrade (see `plugins/ciso/skills/hitrust/lib/versioning/`
   for the org-side reconciliation this enables). Prune old versions only after at least one
   subsequent release cycle. If instead this run is only a sourcing-methodology fix at the SAME
   framework version (public research replacing a licensed-export-derived file, with no new HITRUST
   release involved), replace the existing file in place under its existing filename/version --
   there's no real version bump to track, and (as of this compile) no published org install has a
   `state.json` referencing the old file's ids to orphan.

## Discipline

- **Never present a hallucinated or incomplete e1/i1 entry as authoritative.** Every shipped entry
  needs a real, checked citation. If coverage is thin for a domain, say so in `coverageGaps` (i1) or
  `zeroCandidateDomains` (e1, where thin/zero is often expected) -- don't pad with a fabricated topic
  to make the list look complete or to hit a publicly-quoted count.
- **Never invent a control-reference code, verbatim wording, or a precise requirement count.**
  A `controlReference` may be populated, but only when a fetched public citation verifies that exact
  code for that topic -- this is an *opportunistic, verified* inclusion, not a license to
  reconstruct HITRUST's numbering scheme by pattern-matching. When in doubt, omit the field.
- **Never skip the second (confirm) verification pass under time/cost pressure.** A candidate that
  "already looked solid" in the refute pass still gets a fresh, independent check -- this is
  precisely the discipline point to hold under pressure (a deadline, a cost-conscious nudge to "just
  ship what refute already accepted").
