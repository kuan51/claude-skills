# Statement of Applicability (flow d)

Read this when the user asks for the SoA, or is preparing for a Stage 1 review.

**There is no SoA subsystem, because there doesn't need to be one.** The Statement of Applicability is, for each of the 93 Annex A controls: is it included or excluded, why, and what is its implementation status. `state.json` already stores exactly that. This flow is a *reading* of data the interview recorded -- it never writes, and it never asks a question the interview should have asked.

The mapping, which is worth stating to the user explicitly so they can see their own dashboard is the working document:

| SoA column | Where it already lives |
|---|---|
| Control | `relatedControlCode` (`A.5.1` … `A.8.34`) |
| Included / excluded | `assessment.status` — anything other than `not_applicable` is **included** |
| Justification | `assessment.justification` — for an excluded control this is the exclusion rationale; for an included one it is the implementation evidence |
| Implementation status | `assessment.status` — `met` implemented, `in_progress` partially, `gap` not yet |

So: **regenerate the dashboard and open `cert-iso27001.html`.** The `A5`-`A8` domains, drilled down, are the draft SoA.

```
node "${CLAUDE_PLUGIN_ROOT}/skills/_shared/render-dashboard.js" <docs/ciso-dir>
```

## What to check before calling it ready

Read the Annex A entries and flag these back to the user. All four are things a Stage 1 reviewer looks for and a dashboard glance does not surface:

1. **Any control still `not_assessed`.** The SoA must account for all 93. A blank is worse than an exclusion, because it reads as an ISMS that hasn't finished thinking.
2. **Exclusions justified by "not done yet."** That is a gap wearing an exclusion's clothes. Re-run those through the interview rather than editing them here.
3. **Exclusions with a thin or generic justification.** Assessors read the exclusions first -- it is where scope gets quietly narrowed. A one-line "N/A" will draw the question you least want.
4. **Whether clause 6.1.3 is assessed at all.** The SoA is an *output* of risk treatment, not an input. If `iso27001-6.1.3` is `not_assessed` or a `gap`, the document you are about to produce has no risk assessment standing behind it, and saying so now is more useful than a tidy table.

## What this does not do

It does not emit an SoA document. Producing the deliverable the certification body receives is the organization's own act, and the plugin's standing posture is that it prepares for the audit rather than producing the artifact -- the same reason it never generates a SOC 2 report. If the user wants a table to paste into their own template, read it off the state and give it to them in chat; do not write a new file into `docs/ciso/` for it.
