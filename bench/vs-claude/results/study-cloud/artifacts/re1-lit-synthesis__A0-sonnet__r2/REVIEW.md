# State of the Art in Log Anomaly Detection: A Synthesis

This review draws only on the six corpus summaries [P1]-[P6], which are fictional, so conclusions apply to this corpus only.

## Benchmarks and comparability

Two benchmarks dominate: HDFS-X (11M lines, session-labeled) and BGL-X (4.7M lines, line-labeled) [P6]. [P6] also lists HDFS-X-small, a 10% subset of HDFS-X. It warns that HDFS-X-small has a different and easier test set, so results on it cannot be compared with results on the full split. [P6] does not rank methods.

This affects how the headline numbers should be read. LogBERT-lite reports F1 0.971 on HDFS-X-small [P2]. That figure is numerically higher than every full-split result, but it is not comparable to them. [P2] states that it did not evaluate on the full split because of compute limits.

## Results on the full HDFS-X split

Three papers report full-split F1:
- TF-LAD: 0.931 [P1]
- RT-AD: 0.948 [P3]
- LogGraphT: 0.962 [P4]

On the full split, LogGraphT is the best reported method [P4]. [P4] describes this as the best result it is aware of. That claim is consistent with the other full-split numbers in the corpus [P1][P3]. On BGL-X, F1 is 0.874 for TF-LAD [P1], 0.902 for LogBERT-lite [P2] and 0.915 for LogGraphT [P4].

## Is log parsing necessary?

The corpus contains a direct disagreement. [P1] argues that template extraction is a necessary first step. It reports that removing the parser cost 9-14 F1 points across three benchmarks. [P3] argues the opposite. It reports that a raw-token model beats the parser-based TF-LAD on HDFS-X (0.948 vs 0.931), and it blames parser errors on evolving logs. [P2] also works on raw log lines and reaches strong results, though only on the small subset. [P4] uses session graphs, and its summary does not say whether templates are involved.

[P1] ablates the parser within its own system, while [P3] compares different architectures, so the evidence does not settle the question.

## Label efficiency

Most of the corpus assumes plentiful labels. [P1] and [P3] both train with 80% labeled data. [P5] is the exception. It is the only paper with a sub-1% labeled-data result: with 0.5% labels on BGL-X, contrastive pretraining (CL-LAD) reaches F1 0.861, against 0.701 for a supervised baseline at the same budget. [P5] does not evaluate on HDFS-X, so its method cannot be placed on the full-split ranking.

## Gaps

- Efficiency reporting is thin. [P4] gives only inference latency (3.1 ms per session on one A100) and no training cost. Energy consumption is not reported anywhere in the corpus.
- No paper compares graph, raw-token and low-label approaches on the full HDFS-X split, and nothing is independently replicated.

## Conclusion

Within this corpus, LogGraphT is the strongest full-split HDFS-X method [P4]. The parsing debate between [P1] and [P3] remains open. Low-label pretraining looks promising on BGL-X [P5], but it has not been tested on the full HDFS-X split. Comparisons need to respect the split distinctions documented in [P6].
