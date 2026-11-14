# Synthesis: log anomaly detection (closed corpus P1–P6)

## Scope and caveat
This review uses only six short, fictional summaries [P1]–[P6]. Claims are limited to what they report; no outside knowledge is used.

## Benchmarks
[P6] catalogues the datasets: HDFS-X (11M lines, session-labeled), its 10% subset HDFS-X-small, and BGL-X (4.7M lines, line-labeled). It warns that HDFS-X-small has a different, easier test set, so its scores are not comparable to the full split. [P6] does not rank methods.

## Results on the full HDFS-X split
Three papers report full-split F1: TF-LAD at 0.931 [P1], RT-AD at 0.948 [P3], and LogGraphT at 0.962 [P4]. [P4] calls this the best result it knows of on the full split, and within the corpus it is the highest. LogBERT-lite reports a higher number, F1 0.971, but only on HDFS-X-small, and its authors did not evaluate the full split [P2]. By the warning in [P6], that number cannot be ranked against the others. This is the main comparability trap in the corpus.

On BGL-X, LogBERT-lite scores 0.902 [P2], LogGraphT 0.915 [P4], TF-LAD 0.874 [P1] and CL-LAD 0.861 [P5]. CL-LAD's score is at a 0.5% label budget, whereas TF-LAD uses 80% labels, so these BGL-X numbers are not like-for-like either.

## Open disagreement: is parsing necessary?
[P1] argues template parsing is a necessary first step. Removing the parser cost 9–14 F1 points across three benchmarks. [P3] argues the opposite. A raw-token model matches or exceeds parser-based models, and it attributes this to parser errors on evolving logs. [P3] directly compares RT-AD (0.948) with TF-LAD (0.931) on the full split. [P2], which fine-tunes on raw log lines, also works without a parser, but it was not tested on the full split, so it adds little evidence on this question. Both [P1] and [P3] train with 80% labeled data, so the dispute is not about label budget.

## Label efficiency
[P5] is the only paper below 1% labels. With 0.5% labeled data on BGL-X, contrastive pretraining reaches F1 0.861, against 0.701 for a supervised baseline at the same budget. It does not evaluate HDFS-X, so its result cannot be placed on the HDFS-X ranking.

## Cost and gaps
[P4] reports inference latency (3.1 ms per session on one A100) but not training cost. No paper in the corpus reports inference energy consumption. The corpus is also thin on shared baselines. No two papers use the same method on the same dataset under the same label budget, apart from the [P3]/[P1] HDFS-X comparison.

## State of the art, as supported here
- Best full-split HDFS-X F1: LogGraphT, 0.962 [P4].
- Parsing necessity is contested [P1][P3].
- Few-label learning is promising but only shown on BGL-X [P5].
- Benchmark hygiene matters: subset and full-split scores should not be mixed [P2][P6].
