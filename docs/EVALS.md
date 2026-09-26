---
owner: kuan51
review_by: 2027-03-03
generated: false
---

# Eval results

What each plugin's evals measured and what they recorded. Every number here is copied from
the source file and line named beside it, never recomputed. Each plugin's `evals/` directory
stays the source of truth. When this page and a source disagree, the source wins, so fix this
page.

Sources, abbreviated in the tables below:

| Short name | File |
| --- | --- |
| `RESULTS.md` | [plugins/fabflows/evals/RESULTS.md](../plugins/fabflows/evals/RESULTS.md) |
| `brainstorming/` | [plugins/fabflows/evals/brainstorming/](../plugins/fabflows/evals/brainstorming/) |
| `fabflows evals/README.md` | [plugins/fabflows/evals/README.md](../plugins/fabflows/evals/README.md) |
| `docs-warden evals/README.md` | [plugins/docs-warden/evals/README.md](../plugins/docs-warden/evals/README.md) |
| `RUNBOOK.md` | [plugins/ciso/evals/RUNBOOK.md](../plugins/ciso/evals/RUNBOOK.md) |

## Coverage

| Plugin | Suite | Kind | Results recorded | Latest run | Headline result | Source |
| --- | --- | --- | --- | --- | --- | --- |
| data-analysis-review | `references/evals.md` | trigger accuracy, run by hand | no | never recorded | No result recorded. | `plugins/data-analysis-review/skills/data-analysis-review/references/evals.md:1`-`9` |
| ciso | `trigger-corpus.json` | trigger accuracy, run by hand | no | never recorded | No result recorded. | `RUNBOOK.md` |
| docs-warden | Tier 1 | trigger accuracy | yes | 2026-09-21 | Negatives quiet 15/15, positives invoked 10/18 | `docs-warden evals/README.md:155`, `:164`, `:165` |
| docs-warden | Tier 2 | behavioural cases | no | never | Never run. | `docs-warden evals/README.md:156` |
| fabflows | benchmark | lead with and without the plugin, programmatic grading | yes, 13 iterations | 2026-09-24 (iteration 13) | Three of three runs passed 21/21 hidden tests | `RESULTS.md:71`, `:74` |
| fabflows | `brainstorming` | skill with and without, or against its older version | yes, 4 iterations | 2026-09-22 (iteration 4) | 100% against 92% for the older skill. Against no skill, 94% against 50% (iteration 1) | `brainstorming/iteration-4.md:4`, `:11`, `brainstorming/iteration-1.md:11` |
| fabflows | `trigger-corpus.json` | trigger accuracy, run by hand | no | never recorded | No result recorded. | `fabflows evals/README.md:219`-`226` |

## fabflows benchmark

A headless Fable lead runs the same task with and without fabflows, graded programmatically.
Newest first. "Hidden" is the hidden acceptance tests passed. `RESULTS.md` carries the setup,
the per-run tables and the caveats for each row.

| Iteration | Date | Task | Runs | Graded result | Cost and time | Source |
| --- | --- | --- | --- | --- | --- | --- |
| 13 | 2026-09-24 | 9 `update-minimal`, builder medium, reviewer xhigh, 60-minute cap | 3 | 21/21 hidden in every run, loops finished 3/3 | mean $4.87 list, mean 2,092 s | `RESULTS.md:71`, `:74`, `:123` |
| 12 | 2026-09-24 | 9, builder high, reviewer xhigh, 30-minute cap | 3 | 21/21 hidden in every run (two uncommitted), loops finished 1/3 | mean $3.30 list, mean 1,696 s | `RESULTS.md:151`, `:122`, `:188`-`190` |
| 11 | 2026-09-24 | 9, all pins medium, 30-minute cap | 3 | hidden 20/21, 21/21, 21/21, loops finished 2/3 | mean $3.15 list, mean 1,318 s | `RESULTS.md:151`, `:121`, `:185`-`187` |
| 10 | 2026-09-23 | 7 `build-component`, builder high, reviewer xhigh | 2 | 41/41 hidden in both, one review killed at 600 s | worker output +66%, wall clock +58% against iteration 6 | `RESULTS.md:244`, `:246`, `:251`, `:268`-`269`, `:276`-`279` |
| 9 | 2026-09-23 | 8 `review-catch`, builder high, reviewer xhigh | 3 | 7/9 hidden in every run, review named the defect 0/3 | mean $1.94 list against $1.11 at medium (+75%) | `RESULTS.md:318`, `:320`, `:321`, `:344`-`346`, `:353`, `:359` |
| 8 | 2026-09-22 | 8, rule removed from the spec | 10 | 7/9 hidden in every run, planted defect survived 10/10 | loop $1.11 against inline $0.85 (+31%), 1.65x wall clock | `RESULTS.md:394`, `:397`, `:409`, `:425`-`434`, `:438` |
| 7 | 2026-09-22 | 8, rule stated in the spec | 9 | 8/8 hidden in every run | inline $1.32, delegate $2.06 (+56%), loop $1.32 | `RESULTS.md:480`, `:482`, `:494`, `:510`-`518`, `:520` |
| 6 | 2026-09-22 | 7, Opus 5.5 workers | 4 | 41/41 hidden in every run | $2.92 against $3.55 (-18%), 414 s against 480 s (-14%) | `RESULTS.md:564`, `:568`, `:577`, `:598` |
| 5 | 2026-09-21 | 7, the build loop's first run | 4 | 41/41 hidden in every run | $4.01 against $2.62 (+53%), 2.1x wall clock | `RESULTS.md:641`, `:646`, `:659`, `:687`, `:688` |
| 4 | 2026-09-20 | 1, 5 and 6, the narrowed trim | 6 | quality 1.00, deep-read delegated 2/2 | deep-read $0.96 against $0.94 for the full skill | `RESULTS.md:1037`, `:1050`, `:1060`, `:1062` |
| 3 | 2026-09-20 | 1, 5 and 6, the trimmed skill | 6 | quality 1.00, deep-read delegated 1/2 | wide-search $0.65 against $1.20 for the full skill | `RESULTS.md:1094`, `:1109`, `:1121`, `:1122`, `:1125` |
| 2 | 2026-09-19 | 2 to 6, fewer shell denials (mean 0.4 with, 0.1 without) | 20 | every assertion passed in all 20 runs | $0.76 against $0.63 per run (about +21%), short tasks alone +33% to +42% | `RESULTS.md:1161`, `:1164`, `:1170`, `:1174`, `:1175`, `:1200`, `:1201`, `:1219` |
| 1 | 2026-09-19 | 1 to 4, fabflows 0.3.6 | 16 | quality 1.00 in both arms | $0.92 against $0.56 per run (+64%) | `RESULTS.md:1256`, `:1268`, `:1294`, `:1295`, `:1302`, `:1303`, `fabflows evals/README.md:109` |

## fabflows brainstorming evals

Each iteration scores the skill's replies against written assertions. Iteration 1 compares the
skill with no skill. Iterations 2 to 4 compare it with the older version of itself.

| Iteration | Date | Evals and runs | Compared with | Pass rate, skill | Pass rate, comparison | Source |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 2026-09-22 | evals 1 to 3, 3 runs each | no skill | 94% | 50% | `brainstorming/iteration-1.md:4`, `:5`, `:11` |
| 2 | 2026-09-22 | eval 3, 3 runs | older skill | 83% | 83% | `brainstorming/iteration-2.md:4`, `:5`, `:11` |
| 3 | 2026-09-22 | eval 3, 3 runs | older skill | 100% (8/8) | 88% (7/8) | `brainstorming/iteration-3.md:4`, `:5`, `:11`, `:27`, `:28` |
| 4 | 2026-09-22 | eval 4, 1 run | older skill | 100% (12/12) | 92% (11/12) | `brainstorming/iteration-4.md:4`, `:5`, `:11`, `:29`, `:30` |

## docs-warden Tier 1 trigger run

Run on 2026-09-21 with Sonnet 5, 3 runs per case, 33 runs, $5.04 and 9 minutes, with no run
errors (`docs-warden evals/README.md:155`, `:156`).

| Case | Result | Source |
| --- | --- | --- |
| negatives, skill stayed quiet | 15/15 | `docs-warden evals/README.md:164` |
| positives, skill invoked | 10/18 | `docs-warden evals/README.md:165` |
| `trigger-pos-class-b-review-readiness` | 3/3 | `docs-warden evals/README.md:171` |
| `trigger-pos-new-repo-standard-docs` | 3/3 | `docs-warden evals/README.md:172` |
| `trigger-pos-stale-docs-casual` | 3/3 | `docs-warden evals/README.md:173` |
| `trigger-pos-why-did-we-choose` | 9/12 | `docs-warden evals/README.md:174` |
| `trigger-pos-decision-rationale-paraphrase` | 2/12 | `docs-warden evals/README.md:175` |
| `trigger-pos-adr-typo-bare-id` | 0/3 | `docs-warden evals/README.md:176` |
| `trigger-pos-readme-env-var-drift` | 0/3 in the matrix, 3/10 on the corrected fixture | `docs-warden evals/README.md:177`, `:209` |
| every `trigger-neg-*` | 0/3 each, which is correct | `docs-warden evals/README.md:178` |

The 10/18 headline includes one case whose fixture was broken. Without it, the other five
positives were 10/15 (`docs-warden evals/README.md:210`, `:211`).
