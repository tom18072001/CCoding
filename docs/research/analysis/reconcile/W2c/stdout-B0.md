# CCoding vs single Claude - results

Folder: `C:\Users\admin\CCoding\workspaces\ccoding-research\wt-T-20261103-021358-275--S1\docs\research\analysis\reconcile\W2c` - 14 runs (0 excluded for touching hidden files, 0 infra rows dropped), arms: A0-sonnet, B0. Baseline **A0-sonnet**, treatment **B0**. Scores are 0-1 per run; deltas in percentage points, 95% two-level bootstrap CI over tasks, p from a paired sign-flip permutation test.

## Hypotheses

| ID | Test | Result | Verdict |
| --- | --- | --- | --- |
| H1 | Decomposable work (coding/design, size>=3): B0 - A0-sonnet | n/a [n/a, n/a], p=n/a, tasks=0 | insufficient data |
| H2 | Coupled reasoning (logic) is not better: B0 - A0-sonnet | n/a [n/a, n/a], p=n/a, tasks=0 | insufficient data |
| H3 | Review raises seeded-issue recall without hurting precision | B0 vs A0-sonnet: recall +0.0 pp, precision +0.0 pp | not supported |
| H4 | Planted-ambiguity detection (requirements) | n/a [n/a, n/a], tasks=0 | insufficient data |
| H5 | Cost ratio B0/A0-sonnet | weighted tokens median x9.3, wall time median x11.1; tasks meeting both thresholds 100% | SUPPORTED |
| H6 | Compute-matched single agent matches CCoding (null) | needs arms A1/A2 | insufficient data |
| H7 | Run-to-run stability (SD ratio treatment/baseline) | median SD ratio 1.00 over 1 tasks | insufficient data |
| H8 | Coordination failures (deliverable missing / requirements dropped) | deliverable-missing rate A0-sonnet +0.0 pp vs B0 +0.0 pp; failed hidden-test share A0-sonnet n/a vs B0 n/a | not supported (confirm with transcript review) |
| H9 | Grounding: citation precision and correct refusal | citation precision n/a, correct refusal n/a | insufficient data |
| H10 | Advantage grows with task size (slope of delta vs parts) | slope n/a per extra part, permutation p=0.000, tasks=1 | insufficient data |

## Mean score by category

| Arm | review | Overall | Weighted tok (mean) | Wall s (median) |
| --- | --- | --- | --- | --- |
| A0-sonnet | 1.00 | 1.00 | 19,083 | 13 |
| B0 | 1.00 | 1.00 | 183,627 | 140 |

## Cost-quality frontier

| Arm | Mean score | Mean weighted tokens | Mean USD | Median wall s | Score per 1M weighted tokens |
| --- | --- | --- | --- | --- | --- |
| A0-sonnet | 1.00 | 19,083 | 0.04 | 13 | 52.40 |
| B0 | 1.00 | 183,627 | 0.00 | 140 | 5.45 |

## Per task (B0 - A0-sonnet)

| Task | Category | Size | A0-sonnet | B0 | Delta |
| --- | --- | --- | --- | --- | --- |
| s1-sec-review | review | 3 | 1.00 | 1.00 | +0.0 pp |

Errors / non-done runs: none.
Leaked runs: none.

