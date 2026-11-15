# State of the Art: Log Anomaly Detection (from the P1–P6 corpus)

## Benchmarks and comparability
The corpus centres on two datasets: HDFS-X (11M lines, session-labeled) and BGL-X (4.7M lines, line-labeled) [P6]. P6 also describes HDFS-X-small, a 10% subset of HDFS-X. It has a different and easier test set, so results on it are not comparable to the full split [P6]. This matters for reading the leaderboard. LogBERT-lite reports F1 0.971 on HDFS-X-small [P2], which is numerically higher than any full-split result. It was explicitly not evaluated on the full split [P2], so it cannot be ranked against the others. P6 itself does not rank methods.

## Best reported results
On the full HDFS-X split, the figures are:
- LogGraphT (graph transformer over per-session graphs): F1 0.962 [P4]
- RT-AD (raw tokens): F1 0.948 [P3]
- TF-LAD (template-based LSTM): F1 0.931 [P1]

LogGraphT is the highest, and P4 describes it as the best result the authors know of on the full split. On BGL-X, LogBERT-lite reaches 0.902 [P2], TF-LAD 0.874 [P1], LogGraphT 0.915 [P4] and CL-LAD 0.861 [P5]. These are all single-paper self-reports, and the corpus has no head-to-head replication. The BGL-X comparison also mixes label budgets, since CL-LAD uses 0.5% labels [P5].

## The parsing debate
The corpus has a direct disagreement. P1 argues that template parsing is a necessary first step, and reports a 9–14 point F1 drop across three benchmarks when the parser is removed [P1]. P3 argues the opposite. It says parsing is optional, that parser errors on evolving logs hurt parser-based systems, and that a raw-token model matches or beats TF-LAD (0.948 vs 0.931) on the full HDFS-X split [P3]. P2 operates on raw log lines and gets strong results, which is consistent with P3, though on a different split [P2]. P4 does not state a position on parsing. The evidence currently leans toward parsing not being required, but the P1 ablation and the P3 comparison use different setups, so this is not settled.

## Label efficiency
P1 and P3 both train with 80% labeled data [P1][P3]. P5 is the only paper reporting under 1% labels: with 0.5% labeled data on BGL-X, contrastive pretraining reaches F1 0.861, against 0.701 for a supervised baseline at the same budget [P5]. P5 does not evaluate on HDFS-X, so label efficiency on the harder full HDFS-X split is untested.

## Gaps
- Cost is thinly reported. P4 gives inference latency of 3.1 ms per session on one A100 but no training cost and no energy figures [P4].
- No paper combines the best architecture (graphs), raw-token input and low-label training in one evaluation.
- Cross-paper comparisons rely on self-reported numbers, and the benchmark variants differ [P6].

## Takeaway
Based only on this corpus, LogGraphT is the strongest comparable full-split HDFS-X system [P4]. Parser-free input is competitive [P3]. Low-label pretraining is promising but has so far been shown on BGL-X only [P5].
