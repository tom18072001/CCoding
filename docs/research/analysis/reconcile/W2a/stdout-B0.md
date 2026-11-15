# CCoding vs single Claude - results

Folder: `<máy-chạy>\CCoding\workspaces\ccoding-research\wt-T-20261103-021358-275--S1\docs\research\analysis\reconcile\W2a` - 24 runs (0 excluded for touching hidden files, 0 infra rows dropped), arms: B0, A0-sonnet. Baseline **A0-sonnet**, treatment **B0**. Scores are 0-1 per run; deltas in percentage points, 95% two-level bootstrap CI over tasks, p from a paired sign-flip permutation test.

## Hypotheses

| ID | Test | Result | Verdict |
| --- | --- | --- | --- |
| H1 | Decomposable work (coding/design, size>=3): B0 - A0-sonnet | +16.7 pp [+12.5 pp, +25.0 pp], p=1.000, tasks=1 | SUPPORTED |
| H2 | Coupled reasoning (logic) is not better: B0 - A0-sonnet | +5.6 pp [+0.0 pp, +22.2 pp], p=1.000, tasks=2 | not supported |
| H3 | Review raises seeded-issue recall without hurting precision | B0 vs A0-sonnet: recall n/a, precision n/a | insufficient data |
| H4 | Planted-ambiguity detection (requirements) | +0.0 pp [+0.0 pp, +0.0 pp], tasks=1 | not supported |
| H5 | Cost ratio B0/A0-sonnet | weighted tokens median x9.5, wall time median x11.7; tasks meeting both thresholds 100% | SUPPORTED |
| H6 | Compute-matched single agent matches CCoding (null) | needs arms A1/A2 | insufficient data |
| H7 | Run-to-run stability (SD ratio treatment/baseline) | median SD ratio 0.50 over 4 tasks | SUPPORTED |
| H8 | Coordination failures (deliverable missing / requirements dropped) | deliverable-missing rate A0-sonnet +0.0 pp vs B0 +0.0 pp; failed hidden-test share A0-sonnet n/a vs B0 n/a | not supported (confirm with transcript review) |
| H9 | Grounding: citation precision and correct refusal | citation precision n/a, correct refusal n/a | insufficient data |
| H10 | Advantage grows with task size (slope of delta vs parts) | slope +2.3 pp per extra part, permutation p=0.527, tasks=4 | not supported |

## Mean score by category

| Arm | requirements | logic | design | Overall | Weighted tok (mean) | Wall s (median) |
| --- | --- | --- | --- | --- | --- | --- |
| B0 | 1.00 | 1.00 | 1.00 | 1.00 | 423,694 | 200 |
| A0-sonnet | 1.00 | 0.94 | 0.83 | 0.93 | 59,474 | 27 |

## Cost-quality frontier

| Arm | Mean score | Mean weighted tokens | Mean USD | Median wall s | Score per 1M weighted tokens |
| --- | --- | --- | --- | --- | --- |
| B0 | 1.00 | 423,694 | 0.00 | 200 | 2.36 |
| A0-sonnet | 0.93 | 59,474 | 0.13 | 27 | 15.65 |

## Per task (B0 - A0-sonnet)

| Task | Category | Size | A0-sonnet | B0 | Delta |
| --- | --- | --- | --- | --- | --- |
| a1-ambiguous-spec | requirements | 3 | 1.00 | 1.00 | +0.0 pp |
| l1-oncall | logic | 1 | 0.89 | 1.00 | +11.1 pp |
| l2-knights | logic | 1 | 1.00 | 1.00 | +0.0 pp |
| r1-elk-design | design | 4 | 0.83 | 1.00 | +16.7 pp |

Errors / non-done runs: none.
Leaked runs: none.

