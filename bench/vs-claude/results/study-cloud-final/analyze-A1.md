# CCoding vs single Claude - results

Folder: `<máy-cloud>/scratchpad/ancopy2` - 440 runs (0 excluded for touching hidden files, 8 infra rows dropped), arms: B0, A0-sonnet, B6, B7, B5, A1, A2. Baseline **A0-sonnet**, treatment **A1**. Scores are 0-1 per run; deltas in percentage points, 95% two-level bootstrap CI over tasks, p from a paired sign-flip permutation test.

## Hypotheses

| ID | Test | Result | Verdict |
| --- | --- | --- | --- |
| H1 | Decomposable work (coding/design, size>=3): A1 - A0-sonnet | +1.7 pp [-5.6 pp, +9.4 pp], p=1.000, tasks=4 | not supported |
| H2 | Coupled reasoning (logic) is not better: A1 - A0-sonnet | +2.8 pp [+0.0 pp, +11.1 pp], p=1.000, tasks=4 | SUPPORTED |
| H3 | Review raises seeded-issue recall without hurting precision | A1 vs A0-sonnet: recall +0.0 pp, precision +0.0 pp | not supported |
| H4 | Planted-ambiguity detection (requirements) | +1.5 pp [+0.0 pp, +4.5 pp], tasks=1 | not supported |
| H5 | Cost ratio A1/A0-sonnet | weighted tokens median x1.0, wall time median x1.4; tasks meeting both thresholds 0% | not supported |
| H6 | Compute-matched single agent matches CCoding (null) | A1 - A1: +0.0 pp [-1.2 pp, +1.3 pp]; A1 - A2: -0.3 pp [-1.7 pp, +1.1 pp] | SUPPORTED |
| H7 | Run-to-run stability (SD ratio treatment/baseline) | median SD ratio 1.00 over 17 tasks | not supported |
| H8 | Coordination failures (deliverable missing / requirements dropped) | deliverable-missing rate A0-sonnet +0.0 pp vs A1 +0.0 pp; failed hidden-test share A0-sonnet +0.0 pp vs A1 +1.1 pp | not supported (confirm with transcript review) |
| H9 | Grounding: citation precision and correct refusal | citation precision +0.0 pp, correct refusal +0.0 pp | not supported |
| H10 | Advantage grows with task size (slope of delta vs parts) | slope -0.2 pp per extra part, permutation p=0.828, tasks=13 | not supported |

## Mean score by category

| Arm | requirements | coding | logic | design | research | review | Overall | Weighted tok (mean) | Wall s (median) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B0 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 296,846 | 200 |
| A0-sonnet | 0.98 | 1.00 | 0.97 | 0.83 | 1.00 | 1.00 | 0.99 | 63,691 | 40 |
| B6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 248,656 | 180 |
| B7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 161,388 | 100 |
| B5 | 1.00 | 0.99 | 0.97 | 0.96 | 1.00 | 1.00 | 0.98 | 72,396 | 40 |
| A1 | 1.00 | 0.99 | 1.00 | 0.96 | 1.00 | 1.00 | 0.99 | 47,766 | 21 |
| A2 | 1.00 | 1.00 | 1.00 | 0.94 | 1.00 | 1.00 | 1.00 | 109,280 | 41 |

## Cost-quality frontier

| Arm | Mean score | Mean weighted tokens | Mean USD | Median wall s | Score per 1M weighted tokens |
| --- | --- | --- | --- | --- | --- |
| B0 | 1.00 | 296,846 | 0.00 | 200 | 3.37 |
| A0-sonnet | 0.99 | 63,691 | 0.14 | 40 | 15.56 |
| B6 | 1.00 | 248,656 | 0.00 | 180 | 4.01 |
| B7 | 1.00 | 161,388 | 0.00 | 100 | 6.20 |
| B5 | 0.98 | 72,396 | 0.00 | 40 | 13.59 |
| A1 | 0.99 | 47,766 | 0.10 | 21 | 20.78 |
| A2 | 1.00 | 109,280 | 0.24 | 41 | 9.11 |

## Per task (A1 - A0-sonnet)

| Task | Category | Size | A0-sonnet | A1 | Delta |
| --- | --- | --- | --- | --- | --- |
| a1-ambiguous-spec | requirements | 3 | 0.98 | 1.00 | +1.5 pp |
| c1-iis-ecs | coding | 2 | 1.00 | 1.00 | +0.0 pp |
| c2-burst-alert | coding | 2 | 1.00 | 1.00 | +0.0 pp |
| c3-shop-bugs | coding | 3 | 1.00 | 0.94 | -5.6 pp |
| c4-audit-chain | coding | 4 | 1.00 | 1.00 | +0.0 pp |
| c5-tickets-api | coding | 5 | 1.00 | 1.00 | +0.0 pp |
| l1-oncall | logic | 1 | 0.89 | 1.00 | +11.1 pp |
| l2-knights | logic | 1 | 1.00 | 1.00 | +0.0 pp |
| l3-reconcile | logic | 2 | 1.00 | 1.00 | +0.0 pp |
| l4-startup-order | logic | 2 | 1.00 | 1.00 | +0.0 pp |
| r1-elk-design | design | 4 | 0.83 | 0.96 | +12.5 pp |
| re1-lit-synthesis | research | 3 | 1.00 | 1.00 | +0.0 pp |
| s1-sec-review | review | 3 | 1.00 | 1.00 | +0.0 pp |
| t1-duration | coding | 2 | 1.00 | n/a | n/a |
| t2-orders | coding | 6 | 1.00 | n/a | n/a |
| t3-api | coding | 4 | 1.00 | n/a | n/a |
| t4-perf | coding | 1 | 1.00 | n/a | n/a |
| t5-logq | coding | 4 | 1.00 | n/a | n/a |

Errors / non-done runs: none.
Leaked runs: none.
