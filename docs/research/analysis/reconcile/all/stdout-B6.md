# CCoding vs single Claude - results

Folder: `<máy-chạy>\CCoding\workspaces\ccoding-research\wt-T-20261103-021358-275--S1\docs\research\analysis\reconcile\all` - 197 runs (0 excluded for touching hidden files, 0 infra rows dropped), arms: B0, A0-sonnet, B6, B7. Baseline **A0-sonnet**, treatment **B6**. Scores are 0-1 per run; deltas in percentage points, 95% two-level bootstrap CI over tasks, p from a paired sign-flip permutation test.

## Hypotheses

| ID | Test | Result | Verdict |
| --- | --- | --- | --- |
| H1 | Decomposable work (coding/design, size>=3): B6 - A0-sonnet | -0.2 pp [-0.7 pp, +0.0 pp], p=1.000, tasks=3 | not supported |
| H2 | Coupled reasoning (logic) is not better: B6 - A0-sonnet | n/a [n/a, n/a], p=n/a, tasks=0 | insufficient data |
| H3 | Review raises seeded-issue recall without hurting precision | B6 vs A0-sonnet: recall n/a, precision n/a | not supported |
| H4 | Planted-ambiguity detection (requirements) | n/a [n/a, n/a], tasks=0 | insufficient data |
| H5 | Cost ratio B6/A0-sonnet | weighted tokens median x3.8, wall time median x3.5; tasks meeting both thresholds 100% | SUPPORTED |
| H6 | Compute-matched single agent matches CCoding (null) | needs arms A1/A2 | insufficient data |
| H7 | Run-to-run stability (SD ratio treatment/baseline) | median SD ratio 1.00 over 17 tasks | not supported |
| H8 | Coordination failures (deliverable missing / requirements dropped) | deliverable-missing rate A0-sonnet +0.0 pp vs B6 +0.0 pp; failed hidden-test share A0-sonnet +0.0 pp vs B6 +0.1 pp | not supported (confirm with transcript review) |
| H9 | Grounding: citation precision and correct refusal | citation precision n/a, correct refusal n/a | not supported |
| H10 | Advantage grows with task size (slope of delta vs parts) | slope -0.1 pp per extra part, permutation p=0.320, tasks=5 | not supported |

## Mean score by category

| Arm | requirements | coding | logic | design | research | review | Overall | Weighted tok (mean) | Wall s (median) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B0 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 265,583 | 170 |
| A0-sonnet | 1.00 | 1.00 | 0.97 | 0.83 | 1.00 | 1.00 | 0.99 | 62,912 | 35 |
| B6 | n/a | 1.00 | n/a | n/a | n/a | n/a | 1.00 | 311,591 | 190 |
| B7 | n/a | 1.00 | n/a | n/a | n/a | n/a | 1.00 | 207,950 | 140 |

## Cost-quality frontier

| Arm | Mean score | Mean weighted tokens | Mean USD | Median wall s | Score per 1M weighted tokens |
| --- | --- | --- | --- | --- | --- |
| B0 | 1.00 | 265,583 | 0.00 | 170 | 3.77 |
| A0-sonnet | 0.99 | 62,912 | 0.14 | 35 | 15.75 |
| B6 | 1.00 | 311,591 | 0.00 | 190 | 3.21 |
| B7 | 1.00 | 207,950 | 0.00 | 140 | 4.81 |

## Per task (B6 - A0-sonnet)

| Task | Category | Size | A0-sonnet | B6 | Delta |
| --- | --- | --- | --- | --- | --- |
| a1-ambiguous-spec | requirements | 3 | 1.00 | n/a | n/a |
| c1-iis-ecs | coding | 2 | 1.00 | n/a | n/a |
| c2-burst-alert | coding | 2 | 1.00 | n/a | n/a |
| c3-shop-bugs | coding | 3 | 1.00 | n/a | n/a |
| c4-audit-chain | coding | 4 | 1.00 | n/a | n/a |
| c5-tickets-api | coding | 5 | 1.00 | n/a | n/a |
| l1-oncall | logic | 1 | 0.89 | n/a | n/a |
| l2-knights | logic | 1 | 1.00 | n/a | n/a |
| l3-reconcile | logic | 2 | 1.00 | n/a | n/a |
| l4-startup-order | logic | 2 | 1.00 | n/a | n/a |
| r1-elk-design | design | 4 | 0.83 | n/a | n/a |
| re1-lit-synthesis | research | 3 | 1.00 | n/a | n/a |
| s1-sec-review | review | 3 | 1.00 | n/a | n/a |
| t1-duration | coding | 2 | 1.00 | 1.00 | +0.0 pp |
| t2-orders | coding | 6 | 1.00 | 0.99 | -0.6 pp |
| t3-api | coding | 4 | 1.00 | 1.00 | +0.0 pp |
| t4-perf | coding | 1 | 1.00 | 1.00 | +0.0 pp |
| t5-logq | coding | 4 | 1.00 | 1.00 | +0.0 pp |

Errors / non-done runs: none.
Leaked runs: none.

