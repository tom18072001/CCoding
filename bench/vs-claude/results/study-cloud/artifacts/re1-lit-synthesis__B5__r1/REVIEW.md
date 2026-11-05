# Synthesis: log anomaly detection (closed corpus P1–P6)

## Scope
This review uses only six short summaries (P1–P6). All are labelled fictional, and the datasets are HDFS-X and BGL-X. The numbers below are the papers' own reported figures. 

## Benchmarks and comparability
[P6] catalogues HDFS-X (11M lines, session-labeled), its 10% subset HDFS-X-small, and BGL-X (4.7M lines, line-labeled). It warns that HDFS-X-small has a different, easier test set, so its results are not comparable with the full split. [P6] does not rank methods. This matters for the headline numbers. [P2] reports F1 0.971 for LogBERT-lite, but only on HDFS-X-small. It explicitly did not evaluate the full split, so that figure cannot be placed above the full-split results.

## Full-split HDFS-X results
Three papers report F1 on the full split:
- [P4] LogGraphT (graph transformer over per-session graphs): 0.962. [P4] calls this the best result it knows of on the full split.
- [P3] RT-AD (raw-token model): 0.948.
- [P1] TF-LAD (Drain-style templates plus an LSTM): 0.931.

On this evidence LogGraphT is the strongest reported full-split method. The ranking is a comparison across papers, and the corpus does not say whether the setups are identical. On BGL-X the reported values are 0.915 for [P4], 0.902 for [P2], 0.874 for [P1] and 0.861 for [P5]. [P5] reaches its figure with only 0.5% labels, so it is not comparable with the others.

## Disagreement: is parsing necessary?
[P1] argues that template parsing is necessary. It reports that removing the parser lowers F1 by 9–14 points across three benchmarks. [P3] takes the opposite position, "parsing is optional". It reports that a raw-token model matches or exceeds parser-based ones, and that parser errors on evolving logs hurt parser-based systems. [P3] beats TF-LAD directly on the full split (0.948 vs 0.931). [P2] also works on raw log lines, so it leans toward [P3]'s view. [P2] does not take a position on the question.

## Label efficiency
[P1] and [P3] train with 80% labeled data. [P5] pretrains contrastively on unlabeled logs and, with 0.5% labels on BGL-X, reaches F1 0.861, against 0.701 for a supervised baseline at the same budget. This is the only sub-1% result in the corpus. [P5] did not evaluate HDFS-X, so its method has no full-split result to compare.

## Cost and gaps
[P4] reports inference latency of 3.1 ms per session on one A100 GPU. It reports no training cost and no energy consumption, so energy is not answerable from this corpus.

## Takeaways
1. The best full-split HDFS-X F1 reported is 0.962 ([P4]). The 0.971 in [P2] is on a different, easier subset ([P6]).
2. Whether parsing is needed is unresolved. [P1] and [P3] conflict, and [P3] has the stronger full-split result.
3. Low-label learning is shown on BGL-X only ([P5]). It has not been tested on HDFS-X.
4. Efficiency reporting is thin: latency appears once, and training cost and energy are absent.
