# CCoding vs single Claude - results

Folder: `<máy-chạy>\CCoding\workspaces\ccoding-dev\wt-T-20261102-175855-1e6--S5\bench\vs-claude\results\selftest` - 36 runs (0 excluded for touching hidden files, 0 infra rows dropped), arms: null, oracle. Baseline **null**, treatment **oracle**. Scores are 0-1 per run; deltas in percentage points, 95% two-level bootstrap CI over tasks, p from a paired sign-flip permutation test.

## Hypotheses

| ID | Test | Result | Verdict |
| --- | --- | --- | --- |
| H1 | Decomposable work (coding/design, size>=3): oracle - null | +84.9 pp [+70.7 pp, +96.1 pp], p=0.019, tasks=7 | SUPPORTED |
| H2 | Coupled reasoning (logic) is not better: oracle - null | +100.0 pp [+100.0 pp, +100.0 pp], p=0.122, tasks=4 | not supported |
| H3 | Review raises seeded-issue recall without hurting precision | oracle vs null: recall +100.0 pp, precision +100.0 pp | SUPPORTED |
| H4 | Planted-ambiguity detection (requirements) | +100.0 pp [+100.0 pp, +100.0 pp], tasks=1 | SUPPORTED |
| H5 | Cost ratio oracle/null | weighted tokens median xn/a, wall time median xn/a; tasks meeting both thresholds 0% | insufficient data |
| H6 | Compute-matched single agent matches CCoding (null) | needs arms A1/A2 | insufficient data |
| H7 | Run-to-run stability (SD ratio treatment/baseline) | median SD ratio 1.00 over 18 tasks | not supported |
| H8 | Coordination failures (deliverable missing / requirements dropped) | deliverable-missing rate null +44.4 pp vs oracle +0.0 pp; failed hidden-test share null +79.4 pp vs oracle +0.0 pp | not supported (confirm with transcript review) |
| H9 | Grounding: citation precision and correct refusal | citation precision +100.0 pp, correct refusal +100.0 pp | SUPPORTED |
| H10 | Advantage grows with task size (slope of delta vs parts) | slope -6.8 pp per extra part, permutation p=0.000, tasks=18 | not supported |

## Mean score by category

| Arm | requirements | coding | logic | design | research | review | Overall | Weighted tok (mean) | Wall s (median) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| null | 0.00 | 0.11 | 0.00 | 0.00 | 0.00 | 0.00 | 0.06 | 0 | 0 |
| oracle | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0 | 0 |

## Cost-quality frontier

| Arm | Mean score | Mean weighted tokens | Mean USD | Median wall s | Score per 1M weighted tokens |
| --- | --- | --- | --- | --- | --- |
| null | 0.06 | 0 | 0.00 | 0 | n/a |
| oracle | 1.00 | 0 | 0.00 | 0 | n/a |

## Per task (oracle - null)

| Task | Category | Size | null | oracle | Delta |
| --- | --- | --- | --- | --- | --- |
| a1-ambiguous-spec | requirements | 3 | 0.00 | 1.00 | +100.0 pp |
| c1-iis-ecs | coding | 2 | 0.00 | 1.00 | +100.0 pp |
| c2-burst-alert | coding | 2 | 0.00 | 1.00 | +100.0 pp |
| c3-shop-bugs | coding | 3 | 0.17 | 1.00 | +83.3 pp |
| c4-audit-chain | coding | 4 | 0.00 | 1.00 | +100.0 pp |
| c5-tickets-api | coding | 5 | 0.22 | 1.00 | +77.8 pp |
| l1-oncall | logic | 1 | 0.00 | 1.00 | +100.0 pp |
| l2-knights | logic | 1 | 0.00 | 1.00 | +100.0 pp |
| l3-reconcile | logic | 2 | 0.00 | 1.00 | +100.0 pp |
| l4-startup-order | logic | 2 | 0.00 | 1.00 | +100.0 pp |
| r1-elk-design | design | 4 | 0.00 | 1.00 | +100.0 pp |
| re1-lit-synthesis | research | 3 | 0.00 | 1.00 | +100.0 pp |
| s1-sec-review | review | 3 | 0.00 | 1.00 | +100.0 pp |
| t1-duration | coding | 2 | 0.00 | 1.00 | +100.0 pp |
| t2-orders | coding | 6 | 0.53 | 1.00 | +46.7 pp |
| t3-api | coding | 4 | 0.13 | 1.00 | +87.4 pp |
| t4-perf | coding | 1 | 0.00 | 1.00 | +100.0 pp |
| t5-logq | coding | 4 | 0.01 | 1.00 | +99.3 pp |

Errors / non-done runs: none.
Leaked runs: none.
