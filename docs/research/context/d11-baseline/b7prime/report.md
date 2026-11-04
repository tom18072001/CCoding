# CCoding vs single Claude - results

Folder: `C:\Users\admin\AppData\Local\Temp\tmp.Sp2ZGoCy7Q\b7prime` - 20 runs (0 excluded for touching hidden files, 0 infra rows dropped), arms: B7cab, A0-sonnet. Baseline **A0-sonnet**, treatment **A0-sonnet**. Scores are 0-1 per run; deltas in percentage points, 95% two-level bootstrap CI over tasks, p from a paired sign-flip permutation test.

## Hypotheses

| ID | Test | Result | Verdict |
| --- | --- | --- | --- |
| H1 | Decomposable work (coding/design, size>=3): A0-sonnet - A0-sonnet | +0.0 pp [+0.0 pp, +0.0 pp], p=1.000, tasks=3 | not supported |
| H2 | Coupled reasoning (logic) is not better: A0-sonnet - A0-sonnet | n/a [n/a, n/a], p=n/a, tasks=0 | insufficient data |
| H3 | Review raises seeded-issue recall without hurting precision | A0-sonnet vs A0-sonnet: recall n/a, precision n/a | insufficient data |
| H4 | Planted-ambiguity detection (requirements) | n/a [n/a, n/a], tasks=0 | insufficient data |
| H5 | Cost ratio A0-sonnet/A0-sonnet | weighted tokens median x1.0, wall time median x1.0; tasks meeting both thresholds 0% | not supported |
| H6 | Compute-matched single agent matches CCoding (null) | needs arms A1/A2 | insufficient data |
| H7 | Run-to-run stability (SD ratio treatment/baseline) | median SD ratio 1.00 over 5 tasks | not supported |
| H8 | Coordination failures (deliverable missing / requirements dropped) | deliverable-missing rate A0-sonnet +0.0 pp vs A0-sonnet +0.0 pp; failed hidden-test share A0-sonnet +0.0 pp vs A0-sonnet +0.0 pp | not supported (confirm with transcript review) |
| H9 | Grounding: citation precision and correct refusal | citation precision n/a, correct refusal n/a | insufficient data |
| H10 | Advantage grows with task size (slope of delta vs parts) | slope +0.0 pp per extra part, permutation p=1.000, tasks=5 | not supported |

## Mean score by category

| Arm | coding | Overall | Weighted tok (mean) | Wall s (median) |
| --- | --- | --- | --- | --- |
| B7cab | 1.00 | 1.00 | 176,557 | 155 |
| A0-sonnet | 1.00 | 1.00 | 85,273 | 55 |

## Cost-quality frontier

| Arm | Mean score | Mean weighted tokens | Mean USD | Median wall s | Score per 1M weighted tokens |
| --- | --- | --- | --- | --- | --- |
| B7cab | 1.00 | 176,557 | 0.00 | 155 | 5.66 |
| A0-sonnet | 1.00 | 85,273 | 0.19 | 55 | 11.73 |

## Per task (A0-sonnet - A0-sonnet)

| Task | Category | Size | A0-sonnet | A0-sonnet | Delta |
| --- | --- | --- | --- | --- | --- |
| t1-duration | coding | 2 | 1.00 | 1.00 | +0.0 pp |
| t2-orders | coding | 6 | 1.00 | 1.00 | +0.0 pp |
| t3-api | coding | 4 | 1.00 | 1.00 | +0.0 pp |
| t4-perf | coding | 1 | 1.00 | 1.00 | +0.0 pp |
| t5-logq | coding | 4 | 1.00 | 1.00 | +0.0 pp |

Errors / non-done runs: none.
Leaked runs: none.
