# Synthesis: log anomaly detection (closed corpus P1–P6)

All papers in the corpus are marked fictional; the claims below are only as strong as these summaries, and none could be checked against full texts.

## Benchmarks and comparability

The corpus uses two datasets: HDFS-X (11M lines, session-labeled) and BGL-X (4.7M lines, line-labeled) [P6]. The survey also lists HDFS-X-small, a 10% subset of HDFS-X [P6]. It warns that HDFS-X-small has a different, easier test set, so its scores cannot be compared with full-split scores [P6]. This matters for ranking. LogBERT-lite reports F1 0.971 on HDFS-X-small [P2], which is higher than any full-split number. Its authors say they did not evaluate on the full split [P2], so it is excluded from the full-split comparison. The survey does not rank methods [P6].

## Full-split HDFS-X results

Three papers report full-split F1:
- TF-LAD: 0.931 [P1]
- RT-AD: 0.948 [P3]
- LogGraphT: 0.962 [P4]

LogGraphT is the highest. Its authors call it the best result they are aware of, which is a self-assessment and not an independent ranking [P4]. On BGL-X the reported scores are:
- TF-LAD: 0.874 [P1]
- LogBERT-lite: 0.902 [P2]
- LogGraphT: 0.915 [P4]
- CL-LAD: 0.861 at 0.5% labels [P5]

CL-LAD's number is at a very low label budget, so it is not comparable to the others.

## Is log parsing necessary?

The corpus disagrees. P1 argues that template extraction is a necessary first step. Removing the parser cut F1 by 9–14 points across three benchmarks [P1]. P3 argues the opposite. A model over raw tokens matches or exceeds parser-based models, and parser errors on evolving logs hurt parser-based systems [P3]. P3's own HDFS-X comparison (0.948 vs 0.931 for TF-LAD) supports its side. LogBERT-lite works on raw log lines [P2], which is consistent with parser-free input. The summaries do not say whether LogGraphT uses a parser [P4]. P1 and P3 are the only direct disagreement. Both train with 80% labeled data, so label budget does not explain the difference.

## Label efficiency

Only P5 reports results with less than 1% labeled data. At 0.5% labels on BGL-X, contrastive pretraining followed by fine-tuning reaches F1 0.861, against 0.701 for a supervised baseline at the same budget [P5]. P5 does not evaluate on HDFS-X [P5]. P1 and P3 both use 80% labels [P1][P3], so the high-label and low-label settings are not compared on a common dataset.

## Gaps

- **Cost.** LogGraphT reports inference latency of 3.1 ms per session on one A100 and no training cost [P4]. No paper reports energy consumption, so energy cannot be compared across methods.
- **Ablation scope.** Evidence on parsing comes from single papers with different setups [P1][P3]. No study tests both positions under identical conditions.
- **Label budgets.** Few-label methods are tested only on BGL-X [P5]. Nothing shows whether they hold on the full HDFS-X split.
- **Comparability.** Mixing the HDFS-X-small and full-split results would give a misleading picture [P2][P6].
