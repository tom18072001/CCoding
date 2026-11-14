# CCoding vs single Claude - results

Folder: `<máy-cloud>/scratchpad/ancopy` - 276 runs (0 excluded for touching hidden files, 0 infra rows dropped), arms: B0, A0-sonnet, B6, B7. Baseline **A0-sonnet**, treatment **B7**. Scores are 0-1 per run; deltas in percentage points, 95% two-level bootstrap CI over tasks, p from a paired sign-flip permutation test.

## Hypotheses

| ID | Test | Result | Verdict |
| --- | --- | --- | --- |
| H1 | Decomposable work (coding/design, size>=3): B7 - A0-sonnet | +2.4 pp [+0.0 pp, +7.7 pp], p=1.000, tasks=7 | not supported |
| H2 | Coupled reasoning (logic) is not better: B7 - A0-sonnet | +2.8 pp [+0.0 pp, +11.1 pp], p=1.000, tasks=4 | SUPPORTED |
| H3 | Review raises seeded-issue recall without hurting precision | B7 vs A0-sonnet: recall +0.0 pp, precision +0.0 pp | not supported |
| H4 | Planted-ambiguity detection (requirements) | +0.0 pp [+0.0 pp, +0.0 pp], tasks=1 | not supported |
| H5 | Cost ratio B7/A0-sonnet | weighted tokens median x2.4, wall time median x3.3; tasks meeting both thresholds 33% | not supported |
| H6 | Compute-matched single agent matches CCoding (null) | needs arms A1/A2 | insufficient data |
| H7 | Run-to-run stability (SD ratio treatment/baseline) | median SD ratio 1.00 over 18 tasks | not supported |
| H8 | Coordination failures (deliverable missing / requirements dropped) | deliverable-missing rate A0-sonnet +0.0 pp vs B7 +0.0 pp; failed hidden-test share A0-sonnet +0.0 pp vs B7 +0.0 pp | not supported (confirm with transcript review) |
| H9 | Grounding: citation precision and correct refusal | citation precision +0.0 pp, correct refusal +0.0 pp | not supported |
| H10 | Advantage grows with task size (slope of delta vs parts) | slope -0.1 pp per extra part, permutation p=0.960, tasks=18 | not supported |

## Mean score by category

| Arm | requirements | coding | logic | design | research | review | Overall | Weighted tok (mean) | Wall s (median) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B0 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 265,583 | 170 |
| A0-sonnet | 1.00 | 1.00 | 0.97 | 0.83 | 1.00 | 1.00 | 0.99 | 64,937 | 36 |
| B6 | n/a | 1.00 | n/a | n/a | n/a | n/a | 1.00 | 317,232 | 220 |
| B7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 161,388 | 100 |

## Cost-quality frontier

| Arm | Mean score | Mean weighted tokens | Mean USD | Median wall s | Score per 1M weighted tokens |
| --- | --- | --- | --- | --- | --- |
| B0 | 1.00 | 265,583 | 0.00 | 170 | 3.77 |
| A0-sonnet | 0.99 | 64,937 | 0.14 | 36 | 15.27 |
| B6 | 1.00 | 317,232 | 0.00 | 220 | 3.14 |
| B7 | 1.00 | 161,388 | 0.00 | 100 | 6.20 |

## Per task (B7 - A0-sonnet)

| Task | Category | Size | A0-sonnet | B7 | Delta |
| --- | --- | --- | --- | --- | --- |
| a1-ambiguous-spec | requirements | 3 | 1.00 | 1.00 | +0.0 pp |
| c1-iis-ecs | coding | 2 | 1.00 | 1.00 | +0.0 pp |
| c2-burst-alert | coding | 2 | 1.00 | 1.00 | +0.0 pp |
| c3-shop-bugs | coding | 3 | 1.00 | 1.00 | +0.0 pp |
| c4-audit-chain | coding | 4 | 1.00 | 1.00 | +0.0 pp |
| c5-tickets-api | coding | 5 | 1.00 | 1.00 | +0.0 pp |
| l1-oncall | logic | 1 | 0.89 | 1.00 | +11.1 pp |
| l2-knights | logic | 1 | 1.00 | 1.00 | +0.0 pp |
| l3-reconcile | logic | 2 | 1.00 | 1.00 | +0.0 pp |
| l4-startup-order | logic | 2 | 1.00 | 1.00 | +0.0 pp |
| r1-elk-design | design | 4 | 0.83 | 1.00 | +16.7 pp |
| re1-lit-synthesis | research | 3 | 1.00 | 1.00 | +0.0 pp |
| s1-sec-review | review | 3 | 1.00 | 1.00 | +0.0 pp |
| t1-duration | coding | 2 | 1.00 | 1.00 | -0.1 pp |
| t2-orders | coding | 6 | 1.00 | 1.00 | +0.0 pp |
| t3-api | coding | 4 | 1.00 | 1.00 | +0.0 pp |
| t4-perf | coding | 1 | 1.00 | 1.00 | +0.0 pp |
| t5-logq | coding | 4 | 1.00 | 1.00 | +0.0 pp |

Errors / non-done runs: none.
Leaked runs: none.
