# Synthesis: log anomaly detection on HDFS-X and BGL-X

## Scope
This review uses only the six summaries in the closed corpus [P1]–[P6]. All are labelled fictional in the corpus, and none is peer-reviewed evidence. Each reports a single result, with no variance or significance tests, so the comparisons below are tentative.

## Benchmarks and comparability
The corpus uses two datasets: HDFS-X (11M lines, session-labeled) and BGL-X (4.7M lines, line-labeled) [P6]. P6 also describes HDFS-X-small, a 10% subset with a different and easier test set. It warns that results on the subset are not comparable to the full split [P6]. This matters for ranking. [P2] reports F1 0.971 on HDFS-X-small, which is numerically higher than any full-split score. However, [P2] states that it did not evaluate on the full split, so it cannot be ranked against the others. P6 itself ranks no methods [P6].

## Full-split results on HDFS-X
Three papers report full-split F1:
- [P4] LogGraphT, a graph transformer over session graphs: 0.962, described by its authors as the best result they know of on the full split.
- [P3] RT-AD, a raw-token model: 0.948.
- [P1] TF-LAD, a template-based LSTM: 0.931.

On BGL-X the reported scores are [P4] 0.915, [P2] 0.902, [P1] 0.874 and [P5] 0.861. The [P5] score uses only 0.5% labels. Different papers may use different splits, so the BGL-X numbers are only loosely comparable.

## Disagreement: is parsing necessary?
[P1] argues that template parsing is a necessary first step. It reports that removing the parser reduced F1 by 9–14 points across three benchmarks. [P3] argues the opposite: a model over raw tokens matches or exceeds parser-based models, and parser errors on evolving logs hurt them. [P3] beats [P1]'s TF-LAD on HDFS-X, 0.948 against 0.931. [P2] also works on raw log lines, which fits [P3]'s side, but it does not address the parser question directly. This is a genuine conflict in the corpus. A plausible but untested reading is that the parser's value depends on how much the log format drifts. That is my inference and no paper in the corpus tests it.

## Label efficiency
[P1] and [P3] both train with 80% labeled data. [P5] is the only paper in the corpus below 1% labels. It uses contrastive pretraining on unlabeled logs with 0.5% labels on BGL-X. It reaches F1 0.861, against 0.701 for a supervised baseline at the same label budget [P5]. It was not evaluated on HDFS-X, so its label-efficiency result cannot be compared with the full-split HDFS-X results.

## Gaps
- Energy: [P4] reports only inference latency, 3.1 ms per session on one A100 GPU, and no training cost. The corpus has no energy figures for any method.
- No paper evaluates all methods under one protocol, and the corpus has no data on how much each result varies.
- There is no head-to-head test of the parser question on the same data with matched label budgets.
