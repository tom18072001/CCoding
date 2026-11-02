# CCoding vs single Claude - results

Folder: `C:\Users\admin\CCoding\workspaces\ccoding-research\wt-T-20261103-021358-275--S1\docs\research\analysis\reconcile\W2b` - 30 runs (0 excluded for touching hidden files, 0 infra rows dropped), arms: B6, A0-sonnet. Baseline **A0-sonnet**, treatment **B6**. Scores are 0-1 per run; deltas in percentage points, 95% two-level bootstrap CI over tasks, p from a paired sign-flip permutation test.

## Hypotheses

| ID | Test | Result | Verdict |
| --- | --- | --- | --- |
| H1 | Decomposable work (coding/design, size>=3): B6 - A0-sonnet | -0.2 pp [-0.7 pp, +0.0 pp], p=1.000, tasks=3 | not supported |
| H2 | Coupled reasoning (logic) is not better: B6 - A0-sonnet | n/a [n/a, n/a], p=n/a, tasks=0 | insufficient data |
| H3 | Review raises seeded-issue recall without hurting precision | B6 vs A0-sonnet: recall n/a, precision n/a | insufficient data |
| H4 | Planted-ambiguity detection (requirements) | n/a [n/a, n/a], tasks=0 | insufficient data |
| H5 | Cost ratio B6/A0-sonnet | weighted tokens median x3.8, wall time median x3.4; tasks meeting both thresholds 100% | SUPPORTED |
| H6 | Compute-matched single agent matches CCoding (null) | needs arms A1/A2 | insufficient data |
| H7 | Run-to-run stability (SD ratio treatment/baseline) | median SD ratio 1.00 over 4 tasks | not supported |
| H8 | Coordination failures (deliverable missing / requirements dropped) | deliverable-missing rate A0-sonnet +0.0 pp vs B6 +0.0 pp; failed hidden-test share A0-sonnet +0.0 pp vs B6 +0.1 pp | not supported (confirm with transcript review) |
| H9 | Grounding: citation precision and correct refusal | citation precision n/a, correct refusal n/a | insufficient data |
| H10 | Advantage grows with task size (slope of delta vs parts) | slope -0.1 pp per extra part, permutation p=0.324, tasks=5 | not supported |

## Mean score by category

| Arm | coding | Overall | Weighted tok (mean) | Wall s (median) |
| --- | --- | --- | --- | --- |
| B6 | 1.00 | 1.00 | 311,591 | 190 |
| A0-sonnet | 1.00 | 1.00 | 85,052 | 53 |

## Cost-quality frontier

| Arm | Mean score | Mean weighted tokens | Mean USD | Median wall s | Score per 1M weighted tokens |
| --- | --- | --- | --- | --- | --- |
| B6 | 1.00 | 311,591 | 0.00 | 190 | 3.21 |
| A0-sonnet | 1.00 | 85,052 | 0.18 | 53 | 11.76 |

## Per task (B6 - A0-sonnet)

| Task | Category | Size | A0-sonnet | B6 | Delta |
| --- | --- | --- | --- | --- | --- |
| t1-duration | coding | 2 | 1.00 | 1.00 | +0.0 pp |
| t2-orders | coding | 6 | 1.00 | 0.99 | -0.6 pp |
| t3-api | coding | 4 | 1.00 | 1.00 | +0.0 pp |
| t4-perf | coding | 1 | 1.00 | 1.00 | +0.0 pp |
| t5-logq | coding | 4 | 1.00 | 1.00 | +0.0 pp |

Errors / non-done runs: none.
Leaked runs: none.

