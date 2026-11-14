# State of the Art in Log Anomaly Detection: Synthesis

## Benchmarks and comparability

The corpus evaluates on two datasets, HDFS-X and BGL-X, as catalogued in the survey [P6]. HDFS-X has 11M session-labeled lines. BGL-X has 4.7M line-labeled lines. A critical caveat from [P6] is that HDFS-X-small, a 10% subset, uses a different and easier test set, so its scores are not comparable to the full split. This matters for reading [P2]: LogBERT-lite reports F1 0.971 on HDFS-X-small, which is numerically the highest HDFS figure in the corpus but cannot be ranked against full-split results. [P2] states explicitly that it did not evaluate on the full split because of compute limits. [P6] itself does not rank methods.

## Full-split HDFS-X results

Restricting to the full HDFS-X split, three papers report numbers. TF-LAD, a Drain-style template pipeline with an LSTM, reaches F1 0.931 [P1]. The raw-token model RT-AD reaches 0.948 [P3]. LogGraphT, a graph transformer over per-session graphs, reaches 0.962 [P4], which is the best full-split result in the corpus and which [P4] describes as the best known to its authors. On BGL-X, the reported values are 0.874 for TF-LAD [P1], 0.902 for LogBERT-lite [P2], and 0.915 for LogGraphT [P4]. These come from separate papers with no stated shared protocol, so the ordering is only suggestive.

## The parsing debate

The sharpest disagreement concerns log parsing. [P1] argues that template extraction is a necessary first step, reporting a 9-14 point F1 drop across three benchmarks when the parser is removed. [P3] takes the opposite view, arguing that raw-token models match or exceed parser-based ones and that parser errors on evolving logs hurt template-based systems. Supporting the second view, [P2] also works on raw log lines and [P3] beats [P1]'s TF-LAD on the same split (0.948 vs 0.931). The evidence leans toward parsing being optional, but [P1] and [P3] differ in architecture as well as in parsing, so the comparison is not a controlled ablation.

## Label efficiency

Both [P1] and [P3] train with 80% labeled data. The only low-label result is [P5]: with 0.5% labeled data on BGL-X, contrastive pretraining (CL-LAD) reaches F1 0.861, against 0.701 for a supervised baseline at the same budget. [P5] does not evaluate on HDFS-X, so low-label performance on that dataset is unknown.

## Gaps

Cost reporting is thin. [P4] gives inference latency (3.1 ms per session on one A100) but no training cost and no energy figure. Comparable cost data across methods is absent, as are low-label results on HDFS-X and any head-to-head evaluation that includes all methods under one protocol.

## Takeaway

On the full HDFS-X split, graph-based modeling [P4] currently leads, followed by raw-token modeling [P3] and template-based modeling [P1]. Small encoders [P2] and contrastive pretraining [P5] address efficiency and label scarcity, but not on the full HDFS-X split. A standardized protocol, as [P6] implies, is needed before firm conclusions can be drawn.
