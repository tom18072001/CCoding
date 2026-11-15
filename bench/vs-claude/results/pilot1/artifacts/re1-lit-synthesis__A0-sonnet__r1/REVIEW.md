# State of the Art in Log Anomaly Detection: A Corpus Synthesis

This review draws only on the six summaries in the corpus [P1]-[P6]. All six are labelled fictional, so the numbers describe this corpus and not the wider field.

## Benchmarks and comparability

The papers evaluate on two datasets. HDFS-X is session-labeled with 11M lines. BGL-X is line-labeled with 4.7M lines [P6]. A 10% subset, HDFS-X-small, also exists. The survey warns that HDFS-X-small has a different and easier test set, so its results are not comparable to the full split [P6]. LogBERT-lite reports F1 0.971 on HDFS-X-small [P2]. That is higher than every full-split result, but the authors say they did not evaluate on the full split [P2]. It therefore cannot be ranked against the others. The survey itself does not rank methods [P6].

## Best reported results

On the full HDFS-X split, three methods are reported:

- LogGraphT: F1 0.962 [P4]
- RT-AD: F1 0.948 [P3]
- TF-LAD: F1 0.931 [P1]

LogGraphT, a graph transformer over per-session graphs, is the strongest [P4]. On BGL-X the reported scores are LogGraphT 0.915 [P4], LogBERT-lite 0.902 [P2], TF-LAD 0.874 [P1] and CL-LAD 0.861 [P5]. CL-LAD's figure was measured at only 0.5% labels, so these are not a controlled comparison.

## Open disagreement: is parsing necessary?

The corpus is split on whether log parsing into templates is needed. TF-LAD's authors argue that it is necessary. They report that removing the parser cost 9-14 F1 points across three benchmarks [P1]. RT-AD's authors argue the opposite. They say a model over raw tokens matches or exceeds parser-based models and that parser errors on evolving logs hurt parser-based systems [P3]. RT-AD beats TF-LAD directly on full HDFS-X, 0.948 versus 0.931 [P3]. LogBERT-lite also works on raw log lines [P2], which leans toward the parser-free side. The evidence is not decisive. The papers use different architectures, and P1's ablation is not directly comparable to P3's head-to-head result.

## Label efficiency

P1 and P3 both train with 80% labeled data [P1][P3]. The one paper that targets scarce labels is P5. It pretrains contrastively on unlabeled logs. With 0.5% labels on BGL-X it reaches F1 0.861, against 0.701 for a supervised baseline at the same budget [P5]. It does not evaluate on HDFS-X, so its label-efficiency gains are not tested on the full HDFS-X split [P5].

## Gaps

- **Cost:** efficiency reporting is thin. LogGraphT gives inference latency of 3.1 ms per session on one A100, but no energy figure and no training cost [P4]. Energy consumption cannot be answered from this corpus.
- **Missing combinations:** the strongest model [P4] is untested at low label budgets. The label-efficient method [P5] is untested on HDFS-X.

## Conclusion

On full HDFS-X, LogGraphT leads [P4], followed by parser-free RT-AD [P3]. The parsing question remains contested [P1][P3]. Future work needs common splits, low-label settings, and cost reporting, and should avoid mixing HDFS-X-small with the full split [P6].
